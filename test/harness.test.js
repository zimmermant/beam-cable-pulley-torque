import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, SLIDER_FIELDS, fieldSnap, fieldShow, snapAt } from '../src/fields.js';
import { SCENE_TRACKS } from '../src/scene.js';
import { STATES, PIVOT_STATES } from './grid.js';
import { derive, torqueList, X_B, X_C, X_D } from '../src/physics.js';

// The browser harness holds its OWN COPY of some source values (viewBox, slider ids and ranges, defaults, what the
// figure tracks). It cannot import them (it is pasted into a page), so a change to the source that is not made in the
// harness would leave the harness checking a figure that no longer exists. This test LOADS the harness file (it only
// defines things; nothing runs against a page) and compares SIM with FIELDS, the template and SCENE_TRACKS.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const harnessSource = readFileSync(join(root, 'tools', 'browser-harness.js'), 'utf8');
const template = readFileSync(join(root, 'src', 'index.template.html'), 'utf8');
const context = { window: {} };
vm.runInNewContext(harnessSource, context, { filename: 'browser-harness.js' });
const H = context.window.H;
const SIM = JSON.parse(JSON.stringify(H.SIM));   // plain data (also strips the other realm's prototypes; functions are dropped: use H.SIM for those)

test('harness: it loads and exposes its API', () => {
  for (const fn of ['install', 'sweep', 'queries', 'sensitivity', 'budget', 'all', 'checkFigure', 'checkPage', 'show']) assert.equal(typeof context.window.H[fn], 'function', fn);
});

test('harness: the viewBox is the template\'s', () => {
  const t = template.match(/<svg id="fig" viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(t);
  assert.deepEqual([SIM.viewBox.w, SIM.viewBox.h], [Number(t[1]), Number(t[2])]);
});

test('harness: every id it looks up exists in the template, and the ones it does not name are really absent', () => {
  const ids = [SIM.figId, SIM.controlsId, SIM.calcId, SIM.resetId,
    ...SIM.sliders.map(s => `${s.id}-slider`),
    ...SIM.readouts.map(r => `${r.id}-readout`),
    ...SIM.snaps.map(n => n.id)];
  const named = ids.filter(Boolean);
  assert.ok(named.length >= 4, `only ${named.length} ids in the harness SIM block`);
  // Every input has a readout on this page and the harness reads all of them: with no slider to
  // drive, the bar is the only place the page writes the state down in words.
  assert.deepEqual(SIM.readouts.map(r => r.key), FIELDS.map(f => f.key), 'one readout per input, in order');
  for (const r of SIM.readouts) {
    const f = FIELDS.find(g => g.key === r.key);
    assert.deepEqual([r.id, r.decimals], [f.id, f.decimals], r.key);
  }
  assert.deepEqual(SIM.snaps.map(n => n.key), FIELDS.filter(f => f.snap).map(f => f.key), 'one chip per snapping input');
  for (const n of SIM.snaps) assert.equal(n.at, snapAt(FIELDS.find(g => g.key === n.key)), `${n.key}: the chip's snap value`);
  for (const id of named) assert.ok(template.includes(`id="${id}"`), `#${id} is in the harness but not in the template`);
  // A null id says "this page has none". It had better not have one, or the harness is skipping a
  // check the page could fail: the point of naming it null is that the page really is without it.
  for (const [key, id] of [['calcId', SIM.calcId], ['resetId', SIM.resetId]]) {
    if (id === null) {
      assert.ok(!/id="(calc|reset)"/.test(template), `SIM.${key} is null but the template still has that element`);
    }
  }
});

test('harness: SIM.sliders is the fields that HAVE a slider, entry for entry', () => {
  assert.deepEqual(SIM.sliders.map(s => s.key), SLIDER_FIELDS.map(f => f.key), 'the sliders must be the slider fields, in order');
  // and the inputs with no slider are not forgotten: a query probe has to reach each of them, or
  // nothing would ever test them in the browser
  const queries = SIM.probes.filter(p => p.query);
  for (const f of FIELDS.filter(g => g.noSlider)) {
    const set = queries.map(p => new URLSearchParams(p.query).get(f.key)).filter(v => v !== null && /^-?[\d.]+$/.test(v)).map(Number);
    assert.ok(set.length, `no query probe ever sets ${f.key}`);
    assert.ok(new Set(set).size >= 2, `every query probe sets ${f.key} to the same value (${set[0]}): one value tests nothing`);
    // The sweep drives the SLIDERS, so a value of a no-slider input is reachable in the browser only
    // through a query probe. The zero one is the state the whole figure degenerates at -- no load, no
    // reaction, labels in words rather than arrows -- and nothing else would ever reach it.
    assert.ok(set.includes(f.min), `no query probe sets ${f.key} to its minimum (${f.min}), which the sweep can never reach`);
  }
  for (const f of SLIDER_FIELDS) {
    const s = SIM.sliders.find(g => g.key === f.key);
    assert.deepEqual([s.id, s.min, s.max, s.step, s.decimals], [f.id, f.min, f.max, f.step, f.decimals], f.key);
    const t = template.match(new RegExp(`<input type="range" id="${s.id}-slider" min="(-?[\\d.]+)" max="(-?[\\d.]+)" step="([\\d.]+)"`));
    assert.ok(t, `no template input #${s.id}-slider`);
    assert.deepEqual([s.min, s.max, s.step], [t[1], t[2], t[3]].map(Number), `${f.key}: harness range vs template`);
  }
});

test('harness: defaults are the table\'s, and the sweep grid has an in-range value list for every slider, with both ends', () => {
  assert.deepEqual(SIM.defaults, { ...Object.fromEntries(FIELDS.map(f => [f.key, f.default])), pivot: null },
    'the defaults cover EVERY input and the pivot, because a track asks about all of them');
  assert.deepEqual(Object.keys(SIM.grid).sort(), SLIDER_FIELDS.map(f => f.key).sort(), 'one grid list per slider');
  for (const f of SLIDER_FIELDS) {
    const g = SIM.grid[f.key];
    assert.ok(g.length >= 2 && g.includes(f.min) && g.includes(f.max), `${f.key}: the grid should include both ends`);
    for (const v of g) assert.equal(fieldSnap(f, v), v, `${f.key}: grid value ${v} is not on the slider's grid`);
    if (f.snap) for (const v of [snapAt(f), snapAt(f) + f.snap.jump, snapAt(f) - f.snap.jump]) {
      assert.ok(g.includes(v), `${f.key}: the sweep grid should include ${v} (the snap value and the two jumps)`);
    }
  }
});

test('harness: every probe expects what the source\'s own snapping gives (a missing key means the default)', () => {
  const asks = SIM.probes.filter(p => p.ask);
  const queries = SIM.probes.filter(p => p.query);
  // An `ask` probe drives a slider. This page has none, so every probe must be a `query` -- and there
  // had better be plenty of them, because they are the ONLY way the sweep reaches any state but the
  // default. A page that grows a slider later will fail here until it grows ask probes too.
  if (SLIDER_FIELDS.length === 0) {
    assert.equal(asks.length, 0, 'an ask probe with no slider to ask: it would drive nothing');
    assert.ok(queries.length >= 8, `only ${queries.length} query probes, and they are all there is`);
  } else {
    assert.ok(asks.length >= 3, 'too few ask probes');
  }
  for (const p of asks) {
    for (const f of SLIDER_FIELDS) {
      const raw = p.ask[f.key] === undefined ? f.default : p.ask[f.key];
      const want = p.expect[f.key] === undefined ? f.default : p.expect[f.key];
      assert.equal(fieldSnap(f, raw), want, `probe ${JSON.stringify(p.ask)}: ${f.key}`);
    }
  }
  // Both sides of a snap zone's edge must be probed, whichever kind of probe this page uses: the
  // edge, which still snaps, and the keyboard's jump, which is the first value that does not.
  for (const f of FIELDS.filter(g => g.snap)) {
    const at = snapAt(f);
    const asked = (v) => asks.find(p => p.ask[f.key] === v) ||
      queries.find(p => Number(new URLSearchParams(p.query).get(f.key)) === v);
    const edge = asked(at + f.snap.zone), jump = asked(at + f.snap.jump);
    assert.ok(edge && edge.expect[f.key] === at, `${f.key}: a probe at the zone edge ${at + f.snap.zone} expecting ${at}`);
    assert.ok(jump && jump.expect[f.key] === at + f.snap.jump, `${f.key}: a probe at the jump ${at + f.snap.jump} expecting itself`);
  }
});

test('harness: query probes expect what a link of that query produces, through the real preset parser', async () => {
  const { parsePresets } = await import('../src/presets.js');
  const queries = SIM.probes.filter(p => p.query);
  assert.ok(queries.length >= 2, 'at least a rejected-echo and an adjusted probe');
  for (const p of queries) {
    const { values } = parsePresets(p.query);
    for (const f of FIELDS) {
      const want = p.expect[f.key] === undefined ? f.default : p.expect[f.key];
      assert.equal(values[f.key] === undefined ? f.default : values[f.key], want, `${p.query.slice(0, 40)}: ${f.key}`);
    }
  }
});

// What a track says the painted element should measure in `state`: want(state), or the linear rule. null means absent.
const trackValue = (t, state) => (t.want ? t.want(state) : (t.origin || 0) + state[t.key] * t.pxPerUnit);

test('harness: SIM.tracks is scene.js SCENE_TRACKS: same elements and measures, same expected value on every state of the grid', () => {
  assert.equal(H.SIM.tracks.length, SCENE_TRACKS.length);
  H.SIM.tracks.forEach((t, i) => {
    const s = SCENE_TRACKS[i];
    assert.deepEqual([t.sel, t.measure], [s.sel, s.measure], `track ${i}`);
    // over the states WITH a pivot too: the pivot's own tracks are null in every pivot-less state,
    // so comparing only those would compare nothing at all for half the table
    for (const state of PIVOT_STATES) {
      assert.equal(trackValue(t, state), trackValue(s, state), `track ${t.sel} (${t.measure}) at ${JSON.stringify(state)}`);
    }
  });
  const withPivot = PIVOT_STATES.find(s => s.pivot);
  const pivotTracks = H.SIM.tracks.filter(t => t.sel.includes('pivot'));
  assert.ok(pivotTracks.length >= 2, 'the pivot is the whole of this version: it needs tracking');
  for (const t of pivotTracks) {
    assert.ok(Number.isFinite(trackValue(t, withPivot)), 'a pivot track must give a number when there IS one');
    assert.equal(trackValue(t, { ...withPivot, pivot: null }), null, 'and null when there is not');
  }
});

test('harness: every track is complete: a measure, and either a key with pxPerUnit or a want function; a key names a real input', () => {
  for (const t of H.SIM.tracks) {
    assert.ok(['cx', 'cy', 'width', 'height'].includes(t.measure), `${t.sel}: measure ${t.measure}`);
    if (t.want) assert.equal(typeof t.want, 'function');
    else {
      assert.ok(FIELDS.some(f => f.key === t.key), `track ${t.sel} names no input`);
      assert.ok(Number.isFinite(t.pxPerUnit), `track ${t.sel}: pxPerUnit`);
    }
  }
});

test('harness: a track\'s want() returns null (absent) or a finite number on every state, and linear tracks are not silently missing', () => {
  for (const t of H.SIM.tracks) for (const state of STATES) {
    const v = trackValue(t, state);
    assert.ok(v === null || Number.isFinite(v), `${t.sel} at ${JSON.stringify(state)}: ${v}`);
  }
});

test("harness: its own statics, written from the equations, agree with src/physics.js on every state", () => {
  // The harness keeps a SECOND copy of the statics on purpose: if the app's derive() and these
  // equations ever disagree, one of them is wrong. Only the cable's pull reaches a track, so without
  // this the tension's sign and the force at D's components could drift unseen.
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: harness ${a}, source ${b}`);
  for (const state of STATES) {
    const h = H.PHYS.of(state), d = derive(state);
    const where = JSON.stringify(state);
    near(h.Dx, d.D.x, `${where} the force at D, x`);
    near(h.Dy, d.D.y, `${where} the force at D, y`);
    near(h.t, d.t, `${where} the cable tension`);
    for (const k of ['magD', 'magBE', 'magCE']) near(h[k], d[k], `${where} ${k}`);
  }
  // and its own MOMENT, which nothing else compares: only the pivot's dot reaches a track, so the
  // harness could have the torque equation wrong and never be contradicted
  for (const state of PIVOT_STATES) {
    if (!state.pivot) continue;
    const want = torqueList(state);
    const d = derive(state);
    const at = { load: X_D, cableB: X_B, cableC: X_C, pin: 0 };
    const vec = { load: d.D, cableB: d.BE, cableC: d.CE, pin: d.A };
    for (const q of want) {
      near(H.PHYS.moment(vec[q.key], at[q.key], state.pivot), q.value, `${JSON.stringify(state)} ${q.sub}`);
    }
  }
  assert.ok(PIVOT_STATES.some(s => s.pivot && s.pivot.y !== 0), 'no pivot off the beam: the second term would go untested');
  assert.ok(STATES.some(s => H.PHYS.of(s).t !== 0), 'no state has any tension: this test would be vacuous');
  assert.ok(STATES.some(s => H.PHYS.of(s).t < 0), 'no state ever asks the cable to push: the slack case is untested');
  // the geometry the harness writes out is the geometry the source uses
  assert.deepEqual([H.PHYS.XB, H.PHYS.XC, H.PHYS.XD], [X_B, X_C, X_D]);
});

test('harness: the minimum text size is 12 px, the minimum figure width 600 px, and the budgets are windows that fit the 740 px column', () => {
  assert.equal(SIM.minTextPx, 12);
  assert.equal(SIM.minFigPx, 600);
  assert.ok(Array.isArray(SIM.viewport) && SIM.viewport.length >= 1);
  for (const v of SIM.viewport) assert.ok(v.width >= 800 && v.height >= 600 && typeof v.note === 'string', JSON.stringify(v));
  assert.ok(SIM.floors.texts >= 4 && SIM.floors.graphics >= 4, 'the non-vacuity floors must be real: at least 4, and no more than your figure always has');
});

test('harness: the readout text it expects (the harness\'s own H.show, not a copy) is what the page prints', () => {
  assert.equal(typeof H.show, 'function');
  for (const f of SLIDER_FIELDS) {
    const s = SIM.sliders.find(g => g.key === f.key);
    for (const v of [f.min, f.max, f.default, 0, -f.step]) assert.equal(H.show(s, v), fieldShow(f, v), `${f.key} ${v}`);
  }
});

test('harness: it offers the page checks and the rule texts name them', () => {
  assert.equal(typeof H.checkPage, 'function');
  assert.match(harnessSource, /THE RULES/);
  for (const word of ['TOP-LEVEL', 'BLIND SPOT', 'tracks', 'floors', 'clearSpot']) assert.ok(harnessSource.includes(word), word);
});
