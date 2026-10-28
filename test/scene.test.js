import test from 'node:test';
import assert from 'node:assert/strict';
import { stubElement, installSvgDocument } from './stub-dom.js';
import { createScene, forceLabel, forceName, torqueLabel, angleLabel, footLabel, handleValueText, CAPTION_DY } from '../src/scene.js';
import { segPlain, asSubscript } from '../src/format.js';
import { VB, PANELS, FORCE_U, TEXT, SUB, INK_ABOVE, INK_BELOW, WORST_SCALE, MIN_TEXT_PX,
         beamPoints, massOutline, pulleyGeom, atFoot, pivotAt, PIVOT_DOT_R } from '../src/layout.js';
import { derive, torqueList, pivotName, letteredPoints, AB, CD, U_CE } from '../src/physics.js';
import { handleSpot } from '../src/interact.js';
import { STATES, PIVOTS, PIVOT_STATES } from './grid.js';
import { nb } from './nb.js';

installSvgDocument();

const has = (n, ...cs) => cs.every(c => (n.attrs.class || '').split(/\s+/).includes(c));
const textOf = (n) => (n.textContent ||
  n.children.map(c => ((c.attrs.class || '').includes('sb') ? asSubscript(c.textContent) : c.textContent)).join(''));

function draw(s) {
  const svg = stubElement('svg');
  createScene(svg).render(s);
  const texts = svg.children.filter(n => n.tag === 'text');
  return {
    svg, texts,
    strings: texts.map(textOf),
    heads: svg.children.filter(n => has(n, 'arrow', 'head')),
    pieces: svg.children.filter(n => has(n, 'arrow', 'shaft')),
    cable: svg.children.filter(n => has(n, 'cable')),
    find: (c) => svg.children.find(n => has(n, c))
  };
}
const partsOf = (d, ...cs) => ({
  shafts: d.pieces.filter(n => has(n, ...cs)),
  head: d.heads.find(n => has(n, ...cs))
});
const startOf = (p) => ({ x: Number(p.shafts[0].attrs.x1), y: Number(p.shafts[0].attrs.y1) });
const tipOf = (head) => {
  const m = head.attrs.d.match(/L([-\d.]+) ([-\d.]+) L/);
  return { x: Number(m[1]), y: Number(m[2]) };
};
const lineBox = (n) => ({
  x0: Math.min(Number(n.attrs.x1), Number(n.attrs.x2)), x1: Math.max(Number(n.attrs.x1), Number(n.attrs.x2)),
  y0: Math.min(Number(n.attrs.y1), Number(n.attrs.y2)), y1: Math.max(Number(n.attrs.y1), Number(n.attrs.y2))
});
const DEF = { f: 200, dir: 270 };
const TILT = { f: 200, dir: 215 };

// ---- the structure the browser harness depends on ----------------------------------------------
test('every graphic is a TOP-LEVEL element with class g, and every label a top-level text.t', () => {
  const { svg } = draw(TILT);
  for (const n of svg.children) {
    if (n.tag === 'text') assert.ok(has(n, 't'), `a text without class t: ${textOf(n)}`);
    else if (n.tag === 'path' && has(n, 'vecbar')) continue;      // a vector bar belongs to its label
    else assert.ok(has(n, 'g') || n.tag === 'g', `a ${n.tag} without class g`);
    assert.equal(n.parent, svg, 'nothing is nested: the harness only measures top-level nodes');
  }
});

test('every label clears the 12 px floor once the figure is scaled down', () => {
  for (const n of draw({ f: 300, dir: 35 }).texts) {
    assert.ok(Number(n.attrs['font-size']) >= 16, `a label at ${n.attrs['font-size']} units`);
    for (const span of n.children) assert.ok(Number(span.attrs['font-size']) >= 16, 'a subscript must clear it too');
  }
});

test('arrows and the cable are both drawn as short sibling pieces, never as one long line', () => {
  const d = draw(TILT);
  for (const n of [...d.pieces, ...d.cable]) { assert.equal(n.tag, 'line'); assert.ok(has(n, 'g')); }
  for (const n of d.heads) { assert.equal(n.tag, 'path'); assert.ok(has(n, 'g')); }
  assert.ok(d.cable.length >= 10, 'a cable drawn in one piece would claim its whole rectangle');
  for (const n of d.cable) {
    const b = lineBox(n);
    assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= 15, 'a piece of cable claims too big a rectangle');
  }
});

test('render clears the figure first, so two renders leave one figure', () => {
  const svg = stubElement('svg');
  const scene = createScene(svg);
  scene.render(DEF);
  const n = svg.children.length;
  scene.render(DEF);
  assert.equal(svg.children.length, n);
});

// ---- what the four panels say -------------------------------------------------------------------
test('all four panels are headed', () => {
  const t = draw(DEF).strings;
  for (const want of ['The situation', 'The beam as a single point',
    'Free-body diagram of the beam', 'The forces tip to tail']) {
    assert.ok(t.some(x => x === want), `no panel headed "${want}": ${t.join(' | ')}`);
  }
});

test('the names follow the notation reference, and no ASCII underscore reaches the screen', () => {
  const joined = draw(TILT).strings.join(' | ');
  assert.ok(!joined.includes('_'), joined);
  assert.ok(joined.includes('F' + 'D'), 'the force the student sets is F_D');
  assert.ok(joined.includes('F' + 'A'), 'the pin reaction is F_A');
  assert.ok(joined.includes('F' + 'BE'), 'a cable force takes BOTH letters of its segment');
  assert.ok(joined.includes('F' + 'CE'));
  // and never a bare point letter standing in for a force
  assert.ok(!/\bA[xy]\b/.test(joined), 'A is a point, not a force: never A_x or A_y');
});

test('a force is printed in pounds and a length in feet', () => {
  assert.equal(segPlain(forceLabel('load', 200)), nb('FD 200~lb'));
  assert.equal(segPlain(forceLabel('cableB', 186.5)), nb('FBE 186.5~lb'));
  assert.equal(segPlain(forceLabel('pin', 44.7)), nb('FA 44.7~lb'));
  assert.equal(footLabel(5), nb('5~ft'));
  assert.equal(segPlain(angleLabel(270)), 'θ 270°', 'a degree sign takes no space before it');
});

test('the default state prints what the physics says, in every panel that shows it', () => {
  const t = draw(DEF).strings;
  const d = derive(DEF);
  assert.ok(t.includes(nb('F' + 'D 200~lb')));
  assert.ok(t.includes('θ 270°'), t.join(' | '));
  assert.ok(t.filter(x => x === nb(`F${'BE'} 186.5~lb`)).length >= 3, 'the cable force in all three diagrams');
  assert.ok(Math.abs(d.magBE - 186.5) < 0.05, 'and that is really what the equations give');
  assert.ok(t.includes(nb('5~ft')) && t.includes(nb('3~ft')), 'the beam is dimensioned');
  for (const name of ['A', 'B', 'C', 'D', 'E']) assert.ok(t.includes(name), `point ${name} is named`);
  assert.ok(t.includes(nb('2~ft')) && t.includes(nb('1~ft')), 'and the slope triangle is labelled as real lengths');
});

// ---- what the cable can and cannot do ------------------------------------------------------------
test('the cable arrow at B is always vertical and the one at C always on its 2-to-1 line', () => {
  for (const s of STATES) {
    const d = draw(s);
    const b = partsOf(d, 'ext', 'cableB');
    if (b.head) {
      const from = startOf(b), to = tipOf(b.head);
      assert.ok(Math.abs(to.x - from.x) < 1e-9, `${JSON.stringify(s)}: the run at B left its vertical line`);
    }
    const c = partsOf(d, 'ext', 'cableC');
    if (c.head) {
      const from = startOf(c), to = tipOf(c.head);
      assert.ok(Math.abs((to.y - from.y) / (to.x - from.x) + U_CE.y / U_CE.x) < 1e-6,
        `${JSON.stringify(s)}: the run at C left its own line`);
    }
  }
});

test('a quantity that comes out exactly zero is SAID, not quietly left out', () => {
  // a force along the beam: the cable has nothing to carry, in either run
  const along = draw({ f: 200, dir: 180 });
  assert.ok(!partsOf(along, 'ext', 'cableB').head, 'and so draws no arrow');
  assert.ok(!partsOf(along, 'ext', 'cableC').head);
  assert.ok(along.strings.includes(nb('F' + 'BE 0~lb')), along.strings.join(' | '));
  assert.ok(along.strings.includes(nb('F' + 'CE 0~lb')));
  // nothing applied at all: every force is zero and all four are said
  const none = draw({ f: 0, dir: 270 });
  assert.equal(none.heads.length, 0, 'no force arrows anywhere');
  for (const name of ['F' + 'D 0~lb', 'F' + 'BE 0~lb', 'F' + 'CE 0~lb', 'F' + 'A 0~lb']) {
    assert.ok(none.strings.includes(nb(name)), `${name} is missing: ${none.strings.join(' | ')}`);
  }
  assert.ok(none.strings.some(x => x.includes('No force at D')), none.strings.join(' | '));
});

test('a cable asked to PUSH is called out in words, and only then', () => {
  const up = draw({ f: 200, dir: 90 });
  assert.equal(derive({ f: 200, dir: 90 }).slack, true);
  assert.ok(up.strings.some(x => x.includes('goes slack')), up.strings.join(' | '));
  for (const s of [DEF, TILT, { f: 200, dir: 180 }]) {
    assert.ok(!draw(s).strings.some(x => x.includes('goes slack')), `${JSON.stringify(s)} is not slack`);
  }
});

test('the figure says the two runs of cable carry the same pull, which is why the problem closes', () => {
  assert.ok(draw(TILT).strings.some(x => x.includes('frictionless pulley')), 'the reason is never left unsaid');
  for (const s of STATES) {
    const d = draw(s);
    const b = partsOf(d, 'ext', 'cableB'), c = partsOf(d, 'ext', 'cableC');
    if (!b.head || !c.head) continue;
    const lenB = Math.hypot(tipOf(b.head).x - startOf(b).x, tipOf(b.head).y - startOf(b).y);
    const lenC = Math.hypot(tipOf(c.head).x - startOf(c).x, tipOf(c.head).y - startOf(c).y);
    assert.ok(Math.abs(lenB - lenC) < 1e-9, `${JSON.stringify(s)}: the two arrows are drawn different lengths`);
  }
});

// ---- the space diagram, and the weight left in outline --------------------------------------------
test('the weight stays outlined under D, and fills in exactly when the force is straight down', () => {
  const on = draw(DEF).find('mass');
  assert.ok(has(on, 'on'), 'straight down: the outline must show it');
  assert.equal(on.attrs['stroke-dasharray'], undefined, 'and go solid');
  const off = draw({ f: 200, dir: 265 }).find('mass');
  assert.ok(!has(off, 'on'), '265 degrees snaps to 270, so this state cannot even be reached');
  const tilted = draw({ f: 200, dir: 215 }).find('mass');
  assert.ok(!has(tilted, 'on'));
  assert.ok(tilted.attrs['stroke-dasharray'], 'off the weight, the outline is dashed');
  // no force at all is not "on the weight": there is nothing pulling
  assert.ok(!has(draw({ f: 0, dir: 270 }).find('mass'), 'on'));
  // and it is always drawn, in every state
  for (const s of STATES) assert.ok(draw(s).find('mass'), JSON.stringify(s));
});

test('the weight is drawn under D, where the geometry says', () => {
  const m = massOutline(PANELS.space.baseY, PANELS.space.baseX);
  const node = draw(DEF).find('mass');
  assert.equal(Number(node.attrs.x), m.body.x);
  assert.equal(Number(node.attrs.y), m.body.y);
  assert.equal(Number(node.attrs.width), m.body.w);
});

test('the pulley is drawn as a wheel on a hub, where the tangency says', () => {
  const d = draw(DEF);
  const pc = atFoot(pulleyGeom().centre, PANELS.space.baseY, PANELS.space.baseX);
  const wheel = d.find('wheel'), hub = d.find('hub');
  assert.ok(Math.abs(Number(wheel.attrs.cx) - pc.x) < 1e-9);
  assert.ok(Math.abs(Number(wheel.attrs.cy) - pc.y) < 1e-9);
  assert.ok(Number(hub.attrs.r) < Number(wheel.attrs.r), 'the hub is inside the wheel');
});

test('the force at D points OUT of the beam, with its tip where the handle is drawn', () => {
  const d = draw(DEF);
  const load = partsOf(d, 'space', 'load');
  const D = beamPoints(PANELS.space.baseY, PANELS.space.baseX).D;
  assert.deepEqual(startOf(load), D, 'the tail is on the beam at D');
  assert.equal(Number(d.find('load-handle').attrs.cy), D.y + 200 * FORCE_U, 'and the tip hangs below it');
  assert.equal(Number(d.find('load-handle').attrs.cx), tipOf(load.head).x);
});

test('the drag handle is exactly where the drag code goes looking for it, in every state', () => {
  for (const s of STATES) {
    const h = draw(s).find('load-handle');
    const want = handleSpot(s);
    assert.ok(Math.abs(Number(h.attrs.cx) - want.x) < 1e-9, JSON.stringify(s));
    assert.ok(Math.abs(Number(h.attrs.cy) - want.y) < 1e-9, JSON.stringify(s));
    assert.equal(h.attrs.tabindex, '0');
    assert.ok((h.attrs['aria-label'] || '').length > 10);
    assert.equal(h.attrs['aria-valuetext'], handleValueText(s), 'role="slider" with no value reads as empty');
  }
});

test('what a screen reader is told the handle is set to', () => {
  assert.equal(handleValueText(DEF), nb('200~pounds at 270~degrees, straight down'));
  assert.equal(handleValueText(TILT), nb('200~pounds at 215~degrees'));
});

// ---- the polygon and the viewBox ------------------------------------------------------------------
test('the polygon that is drawn really closes, in every state', () => {
  for (const s of STATES) {
    const d = draw(s);
    let x = 0, y = 0, sides = 0;
    for (const key of ['load', 'cableB', 'cableC', 'pin']) {
      const p = partsOf(d, 'poly', key);
      if (!p.head) continue;
      const t = tipOf(p.head), f = startOf(p);
      x += t.x - f.x; y += t.y - f.y; sides++;
    }
    if (!sides) continue;
    assert.ok(Math.hypot(x, y) < 1e-6, `${JSON.stringify(s)}: the polygon misses closing by ${Math.hypot(x, y).toFixed(4)}`);
  }
});

test('nothing is drawn outside the viewBox, in any state', () => {
  for (const s of STATES) {
    const d = draw(s);
    for (const n of [...d.pieces, ...d.cable]) {
      const b = lineBox(n);
      assert.ok(b.x0 >= -2 && b.x1 <= VB.w + 2, `${JSON.stringify(s)}: x ${b.x0.toFixed(1)}..${b.x1.toFixed(1)}`);
      assert.ok(b.y0 >= -2 && b.y1 <= VB.h + 2, `${JSON.stringify(s)}: y ${b.y0.toFixed(1)}..${b.y1.toFixed(1)}`);
    }
  }
});

// ---- the gaps the mutation audit found ------------------------------------------------------------
test('both runs of cable are drawn in ONE colour, and it is not the pin\'s', () => {
  const d = draw(TILT);
  const colour = (cls) => {
    const n = d.pieces.find(x => has(x, 'ext', cls));
    return n && n.attrs.stroke;
  };
  const b = colour('cableB'), c = colour('cableC'), pin = colour('pin'), load = colour('load');
  assert.ok(b && c && pin && load);
  assert.equal(b, c, 'one cable, one tension: drawing the two runs differently denies the whole point');
  assert.notEqual(b, pin, 'and the cable must not be mistakable for the pin');
  assert.notEqual(b, load, 'nor for the force the student sets');
  // the same in the point panel and the polygon, not only in the free-body diagram
  for (const panel of ['pt', 'poly']) {
    const pb = d.pieces.find(x => has(x, panel, 'cableB')), pc = d.pieces.find(x => has(x, panel, 'cableC'));
    assert.equal(pb.attrs.stroke, pc.attrs.stroke, panel);
    assert.equal(pb.attrs.stroke, b, `${panel}: and the same colour as everywhere else`);
  }
});

test('a caption clears the heading above it, at the sizes they are really drawn', () => {
  // CAPTION_DY is a gap between BASELINES, so it has to beat the heading's descent plus the
  // caption's ascent -- both MEASURED, because the font size alone does not say either. Tucked back
  // to 20 the two touch, and until this test nothing noticed.
  const need = TEXT * INK_BELOW + SUB * INK_ABOVE;
  assert.ok(CAPTION_DY > need,
    `a caption ${CAPTION_DY} under its heading overlaps it: it needs more than ${need.toFixed(1)}`);
});

test('the smallest text on the page still clears 12 px when a link note shrinks the figure', () => {
  // MEASURED, not assumed; WORST_SCALE and MIN_TEXT_PX live in layout.js with how they were taken.
  // Sixteen units renders at 11.5 px in that state, which is why SUB is seventeen.
  assert.ok(SUB * WORST_SCALE >= MIN_TEXT_PX,
    `SUB of ${SUB} renders at ${(SUB * WORST_SCALE).toFixed(2)} px once a two-line link note has shrunk the figure`);
  assert.ok(TEXT > SUB, 'and a subscript still has to read as smaller than what it hangs off');
});

// ---- more gaps a mutation audit goes looking for ---------------------------------------------------
test('every force name carries the arrow a vector has to carry', () => {
  for (const key of ['load', 'cableB', 'cableC', 'pin']) {
    const segs = forceLabel(key, 12.3);
    assert.equal(segs[0].vec, true, `${key}: the letter must be drawn with an arrow over it`);
    assert.equal(segs[1].sub, true, `${key}: and its subscript must be a real subscript`);
  }
  assert.ok(draw(TILT).texts.some(n => n.children.length > 1), 'labels are built from tspans');
});

test('the free-body diagram puts each force where it acts, not all four on A', () => {
  const d = draw(TILT);
  const keys = ['pin', 'cableB', 'cableC', 'load'];
  const starts = keys.map(k => startOf(partsOf(d, 'ext', k)).x);
  assert.equal(new Set(starts.map(x => Math.round(x))).size, 4, `the four start at ${starts.join(', ')}`);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] > starts[i - 1], 'in the order A, B, C, D along the beam');
  const pt = keys.map(k => startOf(partsOf(d, 'pt', k)).x);
  assert.equal(new Set(pt.map(x => Math.round(x))).size, 1, 'and the point diagram starts them all together');
});

test('the point panel says out loud what it threw away', () => {
  assert.ok(draw(TILT).strings.some(x => x.includes('not where they act')));
});

test('the dimensions are the figure\'s own spans, read off physics.js', () => {
  const t = draw(DEF).strings;
  assert.equal(t.filter(x => x === nb(`${AB}~ft`)).length, 2, 'A to B and B to C are both 5 ft');
  assert.equal(t.filter(x => x === nb(`${CD}~ft`)).length, 1);
});

// ---- the pivot, and what it makes the free-body diagram say ------------------------------------
const AT_A = { f: 200, dir: 270, pivot: { x: 0, y: 0 }, picking: false };
const AT_F = { f: 200, dir: 270, pivot: { x: 7, y: 0 }, picking: false };

test('with no pivot the figure is the one it was: no dot, no arc, and the forces keep their numbers', () => {
  const d = draw(DEF);
  assert.equal(d.svg.children.filter(n => has(n, 'pivot')).length, 0);
  assert.equal(d.svg.children.filter(n => has(n, 'torque')).length, 0);
  assert.ok(d.strings.includes(nb('F' + 'D 200~lb')), 'the free-body diagram still numbers its forces');
  assert.ok(!d.strings.some(x => /^M/.test(x)), 'and says nothing about torque');
});

test('the pivot dot is drawn on BOTH left diagrams, at the same point of the beam', () => {
  const d = draw(AT_A);
  const dots = d.svg.children.filter(n => n.tag === 'circle' && has(n, 'pivot'));
  assert.equal(dots.length, 2, 'one in the situation, one in the free-body diagram');
  const want = [PANELS.space, PANELS.ext].map(P => pivotAt(AT_A.pivot, P));
  const got = dots.map(n => ({ x: Number(n.attrs.cx), y: Number(n.attrs.cy) }));
  for (const w of want) {
    assert.ok(got.some(g => Math.abs(g.x - w.x) < 1e-9 && Math.abs(g.y - w.y) < 1e-9), JSON.stringify(w));
  }
  for (const n of dots) assert.equal(Number(n.attrs.r), PIVOT_DOT_R);
  // and in every state and at every pivot, always exactly two
  for (const s of PIVOT_STATES) {
    const k = draw(s).svg.children.filter(n => n.tag === 'circle' && has(n, 'pivot')).length;
    assert.equal(k, s.pivot ? 2 : 0, JSON.stringify(s));
  }
});

test('the free-body diagram prints a torque per force, named for the pivot first', () => {
  const t = draw(AT_F).strings;
  for (const q of torqueList(AT_F)) {
    assert.ok(t.includes(segPlain(torqueLabel(q.sub, q.mag))), `${q.sub} is missing: ${t.join(' | ')}`);
  }
  assert.ok(t.some(x => /^MFD /.test(x)) && t.some(x => /^MFA /.test(x)), 'an unlettered pivot is F in every one');
  assert.ok(draw(AT_A).strings.some(x => /^MACE /.test(x)), 'and a lettered one is its letter');
});

test('a torque is printed in pound feet, with a centred dot', () => {
  assert.equal(segPlain(torqueLabel('ACE', 1668)), nb('MACE 1668~lb·ft'));
  assert.ok(!segPlain(torqueLabel('AD', 2600)).includes('lb.ft'), 'a period is not a centred dot');
  assert.equal(torqueLabel('AD', 1)[0].vec, true, 'a torque is a vector and carries the arrow');
  assert.equal(torqueLabel('AD', 1)[1].sub, true, 'and its subscript is a real subscript');
});

test('a torque of exactly zero draws NO arc and is said in words instead', () => {
  // the pin's own force about the pin
  const d = draw(AT_A);
  assert.ok(d.strings.includes(nb('MAA 0~lb·ft')), d.strings.join(' | '));
  assert.equal(d.svg.children.filter(n => has(n, 'torque', 'head', 'pin')).length, 0, 'and no arrowhead for it');
  assert.equal(d.svg.children.filter(n => has(n, 'torque', 'head')).length, 3, 'the other three are drawn');
  // and about C it is the cable at C that vanishes
  const atC = draw({ ...DEF, pivot: { x: 10, y: 0 } });
  assert.ok(atC.strings.includes(nb('MCCE 0~lb·ft')));
  // said ONCE: the arc loop skips it and the words loop says it, and if the arc loop stopped
  // skipping it the page would carry the same label twice
  assert.equal(d.strings.filter(x => x === nb('MAA 0~lb·ft')).length, 1);
  assert.equal(atC.strings.filter(x => x === nb('MCCE 0~lb·ft')).length, 1);
});

test('once a pivot is picked the force arrows give up their labels to the torques', () => {
  // Counted as a DIFFERENCE, because the same label is printed in more than one panel: picking a
  // pivot should remove exactly the four the free-body diagram was drawing, and touch no other.
  const isForce = (x) => /^F/.test(x) && x.endsWith('lb');
  const before = draw(DEF).strings.filter(isForce).length;
  const after = draw(AT_F).strings.filter(isForce).length;
  assert.equal(before - after, 4, `the four free-body labels should go; ${before} became ${after}`);
  assert.ok(after > 0, 'and the numbers are still on the page, in the point diagram and the polygon');
  // the torques take their place, one per force
  assert.equal(draw(AT_F).strings.filter(x => /^M/.test(x)).length, 4);
});

test('the figure outlines the band a pivot may be dropped in, and only while the picker is armed', () => {
  assert.equal(draw({ ...DEF, picking: true }).svg.children.filter(n => has(n, 'picking')).length, 2,
    'one band in each pickable panel');
  assert.equal(draw(DEF).svg.children.filter(n => has(n, 'picking')).length, 0);
  assert.equal(draw({ ...DEF, picking: true }).strings.filter(x => x === 'click a point').length, 1,
    'and the situation diagram says what the click is for');
});

test('the free-body panel says what it is about, and that the torques sum to zero', () => {
  assert.ok(draw(AT_A).strings.some(x => x.includes('torques about A') && x.includes('sum to zero')));
  assert.ok(draw(AT_F).strings.some(x => x.includes('torques about F')));
  assert.ok(draw(DEF).strings.some(x => x.includes('frictionless pulley')), 'and without one it says what it did before');
});

test('the pivot letter is drawn where the figure does not already name that point', () => {
  // the situation diagram letters A to D itself, so a purple A beside a black A would say it twice
  const atA = draw(AT_A).strings.filter(x => x === 'A').length;
  assert.equal(atA, 2, `A should appear as the point name and as the free-body diagram's pivot, found ${atA}`);
  // an unlettered pivot is F, which nothing else on either diagram names
  assert.equal(draw(AT_F).strings.filter(x => x === 'F').length, 2, 'F is named in both');
});
