import test from 'node:test';
import assert from 'node:assert/strict';
import { stubElement } from './stub-dom.js';
import { FIELDS, SLIDER_FIELDS, fieldShow, snapAt } from '../src/fields.js';
import { createControls, controlsView, pickLabel, pivotText, PICK_IDLE, PICK_ARMED, PICK_AGAIN } from '../src/controls.js';
import { createState, DEFAULTS } from '../src/state.js';
import { FIRST_SNAP, NEEDS_SNAP, FIRST_MARK, NEEDS_MARK } from './snap.js';
import { nb } from './nb.js';

// The bar under the figure only ever WRITES: there is nothing on this page to push, so these tests
// are about what it shows, not about what it can be made to do. Anything a student can change goes
// through the drag handle (test/interact.test.js) or through a link (test/presets.test.js).
const SNAP = FIRST_SNAP;

function rig() {
  const parts = { readouts: {}, snaps: {}, marks: {},
    pivot: stubElement('b'), pick: stubElement('button'), clear: stubElement('button') };
  for (const f of FIELDS) {
    parts.readouts[f.key] = stubElement('b');
    if (f.snap) parts.snaps[f.key] = stubElement('span');
    if (f.mark) parts.marks[f.key] = stubElement('span');
  }
  const state = createState();
  const controls = createControls(parts, state);
  controls.render(state.getState());
  state.subscribe((st) => controls.render(st));   // as app.js does
  return { parts, state, controls };
}

test('this page really has no slider: the bar is a reading, not a control', () => {
  assert.equal(SLIDER_FIELDS.length, 0, 'a slider here would need markup, binding and a keyboard flag');
  for (const f of FIELDS) assert.equal(f.noSlider, true, `${f.key}`);
});

test('controlsView: one fixed-decimal text per field, and whether a snap field sits on its snap value', () => {
  const v = controlsView(DEFAULTS);
  for (const f of FIELDS) assert.equal(v.text[f.key], fieldShow(f, f.default), f.key);
  assert.deepEqual(Object.keys(v.atSnap), FIELDS.filter(f => f.snap).map(f => f.key));
  for (const f of FIELDS.filter(g => g.snap)) {
    const at = snapAt(f);
    assert.equal(controlsView({ ...DEFAULTS, [f.key]: at }).atSnap[f.key], true, f.key);
    assert.equal(controlsView({ ...DEFAULTS, [f.key]: at + f.snap.jump }).atSnap[f.key], false, f.key);
    assert.equal(controlsView({ ...DEFAULTS, [f.key]: at - f.snap.jump }).text[f.key], fieldShow(f, at - f.snap.jump));
  }
});

test('controlsView: a field with mark reports whether the input sits on the marked value', NEEDS_MARK, () => {
  const f = FIRST_MARK;
  assert.deepEqual(Object.keys(controlsView(DEFAULTS).atMark), FIELDS.filter(g => g.mark).map(g => g.key));
  assert.equal(controlsView({ ...DEFAULTS, [f.key]: f.mark.value }).atMark[f.key], true);
  assert.equal(controlsView({ ...DEFAULTS, [f.key]: f.mark.value === f.max ? f.min : f.max }).atMark[f.key], false);
});

test('render writes EVERY input back: the bar is the only place the numbers are in words', () => {
  const { parts, state } = rig();
  for (const f of FIELDS) assert.equal(parts.readouts[f.key].textContent, fieldShow(f, f.default), f.key);
  // and it follows the store, whatever moved it
  state.set({ [FIELDS[0].key]: FIELDS[0].max });
  assert.equal(parts.readouts[FIELDS[0].key].textContent, fieldShow(FIELDS[0], FIELDS[0].max));
  for (const f of FIELDS.slice(1)) assert.equal(parts.readouts[f.key].textContent, fieldShow(f, f.default), `${f.key} moved`);
});

test('the snap chip lights exactly while the input sits on its snap value', NEEDS_SNAP, () => {
  const { parts, state } = rig();
  const at = snapAt(SNAP);
  // the default IS the snap value on this page, so it starts lit
  assert.equal(parts.snaps[SNAP.key].classList.contains('on'), SNAP.default === at);
  state.set({ [SNAP.key]: at + SNAP.snap.jump });
  assert.equal(parts.snaps[SNAP.key].classList.contains('on'), false, 'off the value, the chip goes out');
  state.set({ [SNAP.key]: at });
  assert.equal(parts.snaps[SNAP.key].classList.contains('on'), true, 'and back on when it returns');
  state.set({ [SNAP.key]: at - SNAP.snap.jump });
  assert.equal(parts.snaps[SNAP.key].classList.contains('on'), false, 'the other side of the zone too');
});

test('a render that changes nothing leaves the readout node alone', () => {
  const { parts, state } = rig();
  const f = FIELDS[0];
  parts.readouts[f.key].textContent = fieldShow(f, f.default);
  let writes = 0;
  Object.defineProperty(parts.readouts[f.key], 'textContent', {
    get: () => fieldShow(f, f.default), set: () => { writes++; }, configurable: true
  });
  state.set({ [f.key]: f.default });     // same value: the store does not even notify
  assert.equal(writes, 0);
});

test('a missing element is survived, so a page may show fewer readings than there are inputs', () => {
  const parts = { readouts: {}, snaps: {}, marks: {} };
  parts.readouts[FIELDS[0].key] = stubElement('b');
  const controls = createControls(parts, createState());
  controls.render(DEFAULTS);             // the other inputs have no node at all
  assert.equal(parts.readouts[FIELDS[0].key].textContent, fieldShow(FIELDS[0], FIELDS[0].default));
});

// ---- the pivot picker ---------------------------------------------------------------------------
test('the button says which of its three things it is doing', () => {
  assert.equal(pickLabel({ pivot: null, picking: false }), PICK_IDLE);
  assert.equal(pickLabel({ pivot: null, picking: true }), PICK_ARMED);
  assert.equal(pickLabel({ pivot: { x: 0, y: 0 }, picking: true }), PICK_ARMED, 'armed beats picked');
  assert.equal(pickLabel({ pivot: { x: 0, y: 0 }, picking: false }), PICK_AGAIN);
  for (const s of [PICK_IDLE, PICK_ARMED, PICK_AGAIN]) assert.ok(s.length > 4 && /pick|click/i.test(s), s);
  assert.notEqual(PICK_IDLE, PICK_AGAIN);
});

test('the bar names the pivot, with coordinates only for a point the figure does not letter', () => {
  assert.equal(pivotText(null), 'none');
  assert.equal(pivotText({ x: 0, y: 0 }), 'A');
  assert.equal(pivotText({ x: 10, y: 0 }), 'C');
  assert.equal(pivotText({ x: 7, y: 0 }), nb('F (7.0, 0.0)~ft'));
  assert.equal(pivotText({ x: 4.25, y: -1.5 }), nb('F (4.3, −1.5)~ft'), 'and a true minus sign');
});

test('the button arms the picker, and arms it off again', () => {
  const { parts, state } = rig();
  assert.equal(parts.pick.textContent, PICK_IDLE);
  assert.equal(parts.pick.attrs['aria-pressed'], 'false');
  parts.pick.fire('click');
  assert.equal(state.getState().picking, true);
  assert.equal(parts.pick.textContent, PICK_ARMED);
  assert.ok(parts.pick.classList.contains('on'), 'and it LOOKS armed, which is the state that matters');
  assert.equal(parts.pick.attrs['aria-pressed'], 'true');
  parts.pick.fire('click');
  assert.equal(state.getState().picking, false, 'a second press gives up');
  assert.equal(parts.pick.textContent, PICK_IDLE);
});

test('picking a point ends the mode and offers to undo it', () => {
  const { parts, state } = rig();
  assert.equal(parts.clear.hidden, true, 'nothing to clear yet');
  parts.pick.fire('click');
  state.setPivot({ x: 10, y: 0 });
  assert.equal(state.getState().picking, false, 'the gesture is over');
  assert.equal(parts.pivot.textContent, 'C');
  assert.equal(parts.pick.textContent, PICK_AGAIN);
  assert.equal(parts.clear.hidden, false);
  parts.clear.fire('click');
  assert.equal(state.getState().pivot, null);
  assert.equal(parts.pivot.textContent, 'none');
  assert.equal(parts.clear.hidden, true);
});

test('controlsView carries the pivot as words, so nothing downstream has to format it twice', () => {
  const v = controlsView({ ...DEFAULTS, pivot: { x: 5, y: 0 }, picking: true });
  assert.equal(v.pivot, 'B');
  assert.equal(v.picking, true);
  assert.equal(v.hasPivot, true);
  assert.equal(v.pick, PICK_ARMED);
});
