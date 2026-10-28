import test from 'node:test';
import assert from 'node:assert/strict';
import { stubElement } from './stub-dom.js';
import { attachDrag, viewPoint, handleSpot } from '../src/interact.js';
import { createState } from '../src/state.js';
import { VB, PANELS, HANDLE_HIT, FORCE_U, loadArrow, loadFromHandle, handleRest, beamPoints,
         pivotAt, pivotBounds, clampPivot } from '../src/layout.js';
import { DEFAULTS } from '../src/state.js';
import { fieldByKey, fieldSnap, snapAt } from '../src/fields.js';

// A stand-in for the figure: the stub DOM has no layout, so the one thing the drag needs from a real
// browser -- where the svg sits on the screen -- is supplied here. The figure is placed at (100, 50)
// and drawn at exactly one screen pixel per viewBox unit, so a client point maps to itself minus the
// offset and the arithmetic in the tests stays readable.
const OFFSET = { x: 100, y: 50 };
function figure(scale = 1) {
  const el = stubElement('svg');
  el.getBoundingClientRect = () => ({ left: OFFSET.x, top: OFFSET.y, width: VB.w * scale, height: VB.h * scale });
  return el;
}
const at = (p) => ({ clientX: OFFSET.x + p.x, clientY: OFFSET.y + p.y, pointerId: 1, isPrimary: true, button: 0 });

function rig() {
  const svg = figure();
  const state = createState();
  const detach = attachDrag(svg, state);
  return { svg, state, detach, read: () => state.getState() };
}

test('viewPoint turns a client point into viewBox units, and refuses a figure with no size', () => {
  const svg = figure();
  assert.deepEqual(viewPoint(svg, at({ x: 226, y: 152 })), { x: 226, y: 152 });
  const half = figure(0.5);
  assert.deepEqual(viewPoint(half, { clientX: OFFSET.x + 113, clientY: OFFSET.y + 76 }), { x: 226, y: 152 });
  assert.equal(viewPoint(svg, { clientX: NaN, clientY: 0 }), null);
  const flat = stubElement('svg');
  flat.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
  assert.equal(viewPoint(flat, at({ x: 1, y: 1 })), null);
});

test('the figure keeps its aspect ratio, so a wide box leaves the figure centred in the slack', () => {
  const wide = stubElement('svg');
  wide.getBoundingClientRect = () => ({ left: 0, top: 0, width: VB.w + 200, height: VB.h });
  // scale is the smaller ratio (1), and the extra 200 px is split either side
  assert.deepEqual(viewPoint(wide, { clientX: 100 + 226, clientY: 152 }), { x: 226, y: 152 });
});

test("the handle sits on the arrow's TIP, and parks on the weight's hanger when there is no force", () => {
  const s = { f: 200, dir: 270 };
  assert.deepEqual(handleSpot(s), loadArrow(s).tip);
  const rest = handleSpot({ f: 0, dir: 270 });
  assert.deepEqual(rest, handleRest());
  assert.equal(rest.x, beamPoints(PANELS.space.baseY, PANELS.space.baseX).D.x);
  assert.ok(rest.y > PANELS.space.baseY, 'it parks below the beam, where the weight would pull');
});

test("a drag on the handle sets both the magnitude and the direction, snapped to the sliders' steps", () => {
  const { svg, state, read } = rig();
  const D = beamPoints(PANELS.space.baseY, PANELS.space.baseX).D;
  const drop = (to) => {
    svg.fire('pointerdown', { ...at(handleSpot(read())), target: null });
    svg.fire('pointermove', { ...at(to) });
    svg.fire('pointerup', { ...at(to) });
  };
  // straight DOWN from D: the force points down the screen, 100 lb of it
  drop({ x: D.x, y: D.y + 100 * FORCE_U });
  assert.equal(read().f, 100);
  assert.equal(read().dir, 270);

  // now swing it out to the right of D: the force points along the beam, away from the wall
  drop({ x: D.x + 150 * FORCE_U, y: D.y });
  assert.equal(read().dir, 0);
  assert.equal(read().f, 150);

  // and back onto the weight from a little off it: within ten degrees, the direction sticks at 270
  drop({ x: D.x + 100 * FORCE_U * Math.cos(-83 * Math.PI / 180), y: D.y - 100 * FORCE_U * Math.sin(-83 * Math.PI / 180) });
  assert.equal(read().dir, 270, 'seven degrees off straight down must snap onto the weight');
  assert.equal(read().f, 100);
});

test('a press that lands nowhere near the handle changes nothing', () => {
  const { svg, read } = rig();
  const before = read();
  svg.fire('pointerdown', { ...at({ x: 10, y: 600 }), target: null });
  svg.fire('pointermove', { ...at({ x: 400, y: 300 }) });
  svg.fire('pointerup', { ...at({ x: 400, y: 300 }) });
  assert.deepEqual(read(), before);
});

test('a press just inside the hit radius counts as grabbing the handle, just outside does not', () => {
  for (const [offset, grabbed] of [[HANDLE_HIT - 2, true], [HANDLE_HIT + 6, false]]) {
    const { svg, read } = rig();
    const spot = handleSpot(read());
    svg.fire('pointerdown', { ...at({ x: spot.x + offset, y: spot.y }), target: null });
    svg.fire('pointermove', { ...at({ x: spot.x + offset + 60, y: spot.y + 60 }) });
    svg.fire('pointerup', { ...at({ x: spot.x + offset + 60, y: spot.y + 60 }) });
    assert.equal(read().dir !== DEFAULTS.dir || read().f !== DEFAULTS.f, grabbed, `offset ${offset}`);
  }
});

test('a press that barely moves is a click, not a drag: the store is never even written to', () => {
  // Checking the VALUES is not enough: a one-pixel drag snaps back to the same slider positions, so a
  // missing click threshold would look exactly like a click. Count the writes instead.
  const { svg, state, read } = rig();
  let writes = 0;
  state.subscribe(() => { writes++; });
  // The move has to be one a drag WOULD act on, or the test passes for the wrong reason: straight out
  // along the load by 2.9 units is under the 3-unit threshold, and yet 50 + 2.9 = 52.9 snaps to 55.
  // Start OFF the snapped direction, and move SIDEWAYS: at 215 degrees a 2.9-unit nudge across a
  // 50-unit arrow is about three degrees, which crosses the five-degree grid. Straight out along the
  // arrow would not do: 2.9 units is only 12 lb, well inside the 25 lb step, so the state would come
  // back unchanged whether the threshold worked or not and the test would pass for the wrong reason.
  state.set({ f: 200, dir: 215 });
  writes = 0;
  const spot = handleSpot(read());
  const nearly = { x: spot.x - 1.664, y: spot.y - 2.376 };
  assert.equal(fieldByKey('f').step, 25, 'the arithmetic above assumes a 25 lb step');
  assert.notEqual(fieldSnap(fieldByKey('dir'), loadFromHandle(nearly, 215).dir), 215,
    'the nudge must be one a drag really would act on, or this test proves nothing');
  svg.fire('pointerdown', { ...at(spot), target: null });
  for (const p of [{ x: spot.x - 0.6, y: spot.y - 0.8 }, { x: spot.x - 1.1, y: spot.y - 1.6 }, nearly]) svg.fire('pointermove', { ...at(p) });
  svg.fire('pointerup', { ...at(nearly) });
  assert.equal(writes, 0, 'a click wrote to the store');
  assert.deepEqual(read(), { f: 200, dir: 215, pivot: null, picking: false });

  // and a real drag does write
  svg.fire('pointerdown', { ...at(spot), target: null });
  svg.fire('pointermove', { ...at({ x: spot.x + 60, y: spot.y + 30 }) });
  svg.fire('pointerup', { ...at({ x: spot.x + 60, y: spot.y + 30 }) });
  assert.ok(writes > 0, 'a real drag wrote nothing');
});

test('an abandoned drag puts the load back where it started', () => {
  const { svg, read } = rig();
  const spot = handleSpot(read());
  svg.fire('pointerdown', { ...at(spot), target: null });
  svg.fire('pointermove', { ...at({ x: spot.x + 80, y: spot.y + 40 }) });
  assert.notDeepEqual(read(), DEFAULTS, 'the drag did change something first');
  svg.fire('pointercancel', { pointerId: 1 });
  assert.deepEqual(read(), DEFAULTS);
});

test('a pointer position that is not a pair of numbers is dropped before it can reach the store', () => {
  const { svg, state, read } = rig();
  let writes = 0;
  state.subscribe(() => { writes++; });
  const spot = handleSpot(read());
  svg.fire('pointerdown', { ...at(spot), target: null });
  svg.fire('pointermove', { clientX: NaN, clientY: NaN, pointerId: 1 });
  svg.fire('pointermove', { clientX: Infinity, clientY: 0, pointerId: 1 });
  svg.fire('pointerup', { clientX: NaN, clientY: NaN, pointerId: 1 });
  assert.equal(writes, 0);
  assert.deepEqual(read(), DEFAULTS);
  // viewPoint is where that is refused, so nothing downstream has to check again
  assert.equal(viewPoint(svg, { clientX: NaN, clientY: 3 }), null);
  assert.equal(viewPoint(svg, { clientX: Infinity, clientY: 3 }), null);
});

test("the keyboard swings the force and changes its strength, by the fields' own steps", () => {
  const fF = fieldByKey('f'), fDir = fieldByKey('dir');
  const at270 = snapAt(fDir);
  const { svg, read } = rig();
  const handle = stubElement('circle');
  handle.closest = (sel) => (sel === '.load-handle' ? handle : null);
  const press = (key) => svg.fire('keydown', { key, target: handle, preventDefault() {} });

  // THE SNAP IS WHY THE FIRST NUDGE IS NOT ONE STEP. The direction sticks within ten degrees of
  // straight down, so a single five-degree step would snap straight back and the keyboard could
  // never leave the weight. A nudge from the snap value lands on the far side of the zone instead.
  assert.equal(read().dir, at270);
  press('ArrowRight');
  assert.equal(read().dir, at270 + fDir.snap.jump, 'the first nudge has to clear the snap zone');
  press('ArrowLeft');
  assert.equal(read().dir, at270, 'and a nudge back lands on the weight again');
  press('ArrowLeft');
  assert.equal(read().dir, at270 - fDir.snap.jump, 'and the next one clears it the other way');
  press('ArrowRight'); press('ArrowRight');
  assert.equal(read().dir, at270 + fDir.snap.jump, 'back through the zone and out the far side');

  press('ArrowUp');
  assert.equal(read().f, DEFAULTS.f + fF.step);
  press('ArrowDown'); press('ArrowDown');
  assert.equal(read().f, DEFAULTS.f - fF.step);
  press('End');
  assert.equal(read().f, 0, 'End drops the force');
  press('Home');
  assert.equal(read().f, fF.max, 'Home is the hardest pull');
  assert.equal(read().dir, at270, 'and puts it straight back on the weight');
});

test('the direction wraps the short way round instead of sticking at an end', () => {
  const { svg, state, read } = rig();
  const handle = stubElement('circle');
  handle.closest = (sel) => (sel === '.load-handle' ? handle : null);
  const press = (key) => svg.fire('keydown', { key, target: handle, preventDefault() {} });
  state.set({ dir: 0 });
  press('ArrowLeft');
  assert.equal(read().dir, 355, 'stepping back from 0 degrees lands just under a full turn');
  state.set({ dir: 355 });
  press('ArrowRight');
  assert.equal(read().dir, 0, 'and forward again wraps to zero');
});

test('a modified key is the browser\'s, not ours, and an unknown key does nothing', () => {
  const { svg, read } = rig();
  const handle = stubElement('circle');
  handle.closest = (sel) => (sel === '.load-handle' ? handle : null);
  svg.fire('keydown', { key: 'ArrowRight', target: handle, ctrlKey: true, preventDefault() {} });
  svg.fire('keydown', { key: 'q', target: handle, preventDefault() {} });
  svg.fire('keydown', { key: 'ArrowRight', target: stubElement('rect'), preventDefault() {} });
  assert.deepEqual(read(), DEFAULTS);
});

test('detach stops the listeners, and detaching twice is harmless', () => {
  const { svg, state, detach, read } = rig();
  detach();
  detach();
  const spot = handleSpot(read());
  svg.fire('pointerdown', { ...at(spot), target: null });
  svg.fire('pointermove', { ...at({ x: spot.x + 80, y: spot.y + 40 }) });
  svg.fire('pointerup', { ...at({ x: spot.x + 80, y: spot.y + 40 }) });
  assert.deepEqual(read(), DEFAULTS);
  state.set({ f: 25 });
  assert.equal(read().f, 25, 'the store itself still works');   // 25 lb: one step, so it survives snapping
});

// ---- picking a pivot ------------------------------------------------------------------------
const armed = (state) => { state.setPicking(true); return state; };

test('a press picks a pivot only while the picker is armed', () => {
  const { svg, state, read } = rig();
  const onBeam = pivotAt({ x: 7, y: 0 }, PANELS.ext);
  svg.fire('pointerdown', { ...at(onBeam), target: null });
  assert.equal(read().pivot, null, 'idle, a press in a diagram is not a pivot');
  armed(state);
  svg.fire('pointerdown', { ...at(onBeam), target: null });
  assert.deepEqual(read().pivot, { x: 7, y: 0 });
  assert.equal(read().picking, false, 'and the mode ends with the gesture');
});

test('a pivot can be picked in EITHER left diagram, and means the same point in both', () => {
  for (const which of ['space', 'ext']) {
    const { svg, state, read } = rig();
    armed(state);
    svg.fire('pointerdown', { ...at(pivotAt({ x: 7, y: 0 }, PANELS[which])), target: null });
    assert.deepEqual(read().pivot, { x: 7, y: 0 }, which);
  }
});

test('a press near a lettered point snaps onto it, and one well away does not', () => {
  const { svg, state, read } = rig();
  armed(state);
  const nearC = pivotAt({ x: 10, y: 0 }, PANELS.ext);
  svg.fire('pointerdown', { ...at({ x: nearC.x + 8, y: nearC.y + 6 }), target: null });
  assert.deepEqual(read().pivot, { x: 10, y: 0 }, 'a click near C IS C');
  armed(state);
  svg.fire('pointerdown', { ...at(pivotAt({ x: 7, y: 0 }, PANELS.ext)), target: null });
  assert.deepEqual(read().pivot, { x: 7, y: 0 }, 'and a click between them is its own point');
});

test('a press outside both left diagrams picks nothing and stays armed', () => {
  const { svg, state, read } = rig();
  armed(state);
  svg.fire('pointerdown', { ...at({ x: PANELS.point.ox, y: PANELS.point.oy }), target: null });
  assert.equal(read().pivot, null, 'the point diagram is not pickable');
  assert.equal(read().picking, true, 'and the picker is still waiting rather than silently off');
});

test('a pivot is pulled into the band both diagrams can show', () => {
  const { svg, state, read } = rig();
  armed(state);
  const b = pivotBounds();
  // the very top-left of the situation panel, which is above the band
  svg.fire('pointerdown', { ...at({ x: PANELS.space.box.x0 + 1, y: PANELS.space.box.y0 + 1 }), target: null });
  const p = read().pivot;
  assert.ok(p.x >= b.x0 - 1e-9 && p.x <= b.x1 + 1e-9 && p.y >= b.y0 - 1e-9 && p.y <= b.y1 + 1e-9,
    `${JSON.stringify(p)} is outside ${JSON.stringify(b)}`);
});

test('while armed, a letter puts the pivot on that point and Escape gives up', () => {
  const { svg, state, read } = rig();
  const press = (key) => svg.fire('keydown', { key, target: null, preventDefault() {} });
  for (const [key, want] of [['a', { x: 0, y: 0 }], ['B', { x: 5, y: 0 }], ['c', { x: 10, y: 0 }], ['D', { x: 13, y: 0 }]]) {
    armed(state);
    press(key);
    assert.deepEqual(read().pivot, want, key);
    assert.equal(read().picking, false);
  }
  armed(state);
  press('e');
  assert.deepEqual(read().pivot, { x: 13, y: 0 }, 'E is not a pickable point: the pivot is left alone');
  assert.equal(read().picking, true, 'and the picker keeps waiting');
  press('Escape');
  assert.equal(read().picking, false, 'Escape gives up');
});

test('while armed, the arrow keys do NOT move the force: the figure is listening for a point', () => {
  const { svg, state, read } = rig();
  const handle = stubElement('circle');
  handle.closest = (sel) => (sel === '.load-handle' ? handle : null);
  armed(state);
  const before = { f: read().f, dir: read().dir };
  svg.fire('keydown', { key: 'ArrowUp', target: handle, preventDefault() {} });
  assert.equal(read().f, before.f, 'the force is not what a key means right now');
  assert.equal(read().dir, before.dir);
});
