import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS, fieldNext, fieldSnap } from '../src/fields.js';
import { DEFAULTS, createState, snapPivot, samePivot } from '../src/state.js';

// A value different from the field's default, and a raw value that is NOT on its grid (snapping must act on it).
const other = (f) => (f.default === f.max ? f.min : f.max);
const offGrid = (f) => f.min + f.step * 2.4;

test('the store starts at DEFAULTS, which is every field\'s default, and stores the inputs only', () => {
  assert.deepEqual(createState().getState(), DEFAULTS);
  assert.deepEqual(DEFAULTS, { ...Object.fromEntries(FIELDS.map(f => [f.key, f.default])), pivot: null, picking: false });
  assert.deepEqual(Object.keys(createState().getState()).sort(), [...FIELDS.map(f => f.key), 'picking', 'pivot'].sort());
});

test('getState returns a copy; mutating it does not change the store', () => {
  const st = createState();
  for (const f of FIELDS) {
    st.getState()[f.key] = other(f);
    assert.equal(st.getState()[f.key], f.default);
  }
});

test('subscribers get a copy of the new state', () => {
  const st = createState();
  let got = null;
  st.subscribe((s) => { got = s; });
  const f = FIELDS[0];
  st.setField(f.key, other(f));
  got[f.key] = 12345;
  assert.equal(st.getState()[f.key], other(f));
});

test('setField snaps through the field\'s own rule, field by field, leaving the others alone', () => {
  for (const f of FIELDS) {
    const st = createState();
    st.setField(f.key, offGrid(f), false);
    assert.equal(st.getState()[f.key], fieldSnap(f, offGrid(f)), f.key);
    for (const g of FIELDS) if (g !== f) assert.equal(st.getState()[g.key], g.default, `${f.key} moved ${g.key}`);
  }
});

test('setField passes the keyboard flag through (a nudge from 0 jumps, only for a field with snap)', () => {
  for (const f of FIELDS) {
    const st = createState();
    st.setField(f.key, 0, false);
    const from = st.getState()[f.key];
    st.setField(f.key, f.step / 2, true);
    assert.equal(st.getState()[f.key], fieldNext(f, from, f.step / 2, true), f.key);
  }
});

test('setField with an unknown key throws', () => {
  assert.throws(() => createState().setField('no-such-input', 1), /no input called/);
});

test('a no-change set does not notify; a change does; a snap back to the same value does not', () => {
  const st = createState();
  let calls = 0;
  st.subscribe(() => { calls++; });
  for (const f of FIELDS) st.setField(f.key, f.default);
  st.set({ ...DEFAULTS }); st.set({}); st.set();
  assert.equal(calls, 0);
  const f = FIELDS[0];
  st.setField(f.key, other(f));
  assert.equal(calls, 1);
  st.setField(f.key, other(f) + (other(f) === f.max ? -f.step / 4 : f.step / 4));   // snaps to the same value: no change
  assert.equal(calls, 1);
});

test('a batch (presets) notifies once, snaps each field, and keeps the fields it lacks', () => {
  const st = createState();
  let calls = 0;
  st.subscribe(() => { calls++; });
  st.set(Object.fromEntries(FIELDS.map(f => [f.key, offGrid(f)])));
  assert.equal(calls, 1);
  for (const f of FIELDS) assert.equal(st.getState()[f.key], fieldSnap(f, offGrid(f)), f.key);
  if (FIELDS.length > 1) {
    const [a, ...rest] = FIELDS;
    const before = st.getState();
    st.set({ [a.key]: other(a) });
    assert.equal(st.getState()[a.key], other(a));
    for (const g of rest) assert.equal(st.getState()[g.key], before[g.key], 'a field the batch lacks is kept');
  }
});

test('unsubscribe stops notifications; reset restores the defaults with one notification', () => {
  const st = createState();
  const f = FIELDS[0];
  let calls = 0;
  const off = st.subscribe(() => { calls++; });
  st.setField(f.key, other(f));
  off();
  st.setField(f.key, f.default);
  assert.equal(calls, 1);
  st.subscribe(() => { calls++; });
  for (const g of FIELDS) st.setField(g.key, other(g));
  const n = calls;
  st.reset();
  assert.deepEqual(st.getState(), DEFAULTS);
  assert.equal(calls, n + 1);
});

// ---- the pivot slice -------------------------------------------------------------------------
test('a pivot that is not two real numbers is refused, so nothing downstream has to check again', () => {
  for (const bad of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: undefined, y: 0 }, null, undefined]) {
    assert.equal(snapPivot(bad), null, JSON.stringify(bad));
  }
  const s = createState();
  s.setPivot({ x: NaN, y: 2 });
  assert.equal(s.getState().pivot, null);
});

test('moving the pivot really notifies: two different points are two different states', () => {
  const s = createState();
  let seen = 0, last = null;
  s.subscribe((st) => { seen++; last = st.pivot; });
  s.setPivot({ x: 7, y: 0 });
  assert.equal(seen, 1);
  s.setPivot({ x: 7, y: 1 });
  assert.equal(seen, 2, 'a pivot one foot up is not the same pivot');
  assert.deepEqual(last, { x: 7, y: 1 });
  s.setPivot({ x: 7, y: 1 });
  assert.equal(seen, 2, 'but the same point twice changes nothing');
  s.setPivot(null);
  assert.equal(seen, 3, 'and clearing it does');
});

test('samePivot tells two points apart, and knows absent from present', () => {
  assert.equal(samePivot(null, null), true);
  assert.equal(samePivot(null, { x: 0, y: 0 }), false);
  assert.equal(samePivot({ x: 0, y: 0 }, null), false);
  assert.equal(samePivot({ x: 1, y: 2 }, { x: 1, y: 2 }), true);
  assert.equal(samePivot({ x: 1, y: 2 }, { x: 1, y: 3 }), false);
  assert.equal(samePivot({ x: 1, y: 2 }, { x: 9, y: 2 }), false);
});
