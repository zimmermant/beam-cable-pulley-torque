import { FIELDS, fieldByKey, fieldDefaults, fieldNext, fieldSnap } from './fields.js';
import { letteredPoints, PIVOT_SNAP_FT } from './physics.js';

export const DEFAULTS = { ...fieldDefaults(), pivot: null, picking: false };

// THE PIVOT IS NOT A FIELD, and that is deliberate. A FIELDS entry is a number on a grid with a
// minimum, a maximum and a step; the pivot is a POINT, it can be absent, and the states it can take
// are two-dimensional. Making it two fields would also multiply the test grid by both of them --
// the unit lint draws the whole figure once per state -- for no gain, since what matters about a
// pivot is not a sweep of its coordinates but the handful of places worth putting it.
//
// So it lives beside the fields in the same store, and everything that reads state reads it the
// same way. `picking` is the mode the "Pick a pivot point" button turns on: it belongs here rather
// than in the DOM because the figure draws differently while it is on, and the figure is drawn from
// the state and nothing else.

// A pivot in feet, snapped to a lettered point when it lands near one. Returns a fresh object, or
// null for no pivot at all. Non-finite input is no pivot: nothing downstream has to check again.
export function snapPivot(p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  for (const q of letteredPoints()) {
    if (Math.hypot(q.x - p.x, q.y - p.y) <= PIVOT_SNAP_FT) return { x: q.x, y: q.y };
  }
  return { x: p.x, y: p.y };
}

export const samePivot = (a, b) => (!a && !b) || !!(a && b && a.x === b.x && a.y === b.y);

// Pure store: no DOM. Only the inputs in FIELDS and the pivot are stored; everything else is derived
// (physics.js), never stored, so it can never disagree. Subscribers get a copy of the new state, and
// only when something stored really changed.
export function createState() {
  let cur = { ...DEFAULTS };
  const subs = new Set();

  function commit(next) {
    const same = FIELDS.every(f => next[f.key] === cur[f.key]) &&
      samePivot(next.pivot, cur.pivot) && next.picking === cur.picking;
    if (same) return;
    cur = next;
    const snapshot = { ...cur };
    for (const fn of [...subs]) fn(snapshot);
  }

  return {
    getState: () => ({ ...cur }),
    // One field, snapped as its slider snaps (the keyboard jump only for a field with `snap`).
    setField: (key, raw, viaKeyboard) => {
      const f = fieldByKey(key);
      commit({ ...cur, [key]: fieldNext(f, cur[key], raw, viaKeyboard) });
    },
    // A batch (presets): each field is snapped, missing fields are kept, one notification. A pivot
    // given here is snapped the same way a clicked one is, so a link and a click cannot disagree.
    set: (p = {}) => commit({
      ...Object.fromEntries(FIELDS.map(f => [f.key, p[f.key] === undefined ? cur[f.key] : fieldSnap(f, p[f.key])])),
      pivot: p.pivot === undefined ? cur.pivot : snapPivot(p.pivot),
      picking: p.picking === undefined ? cur.picking : !!p.picking
    }),
    // Picking one ENDS the picking mode: that is the whole of the gesture, and leaving the mode on
    // would mean the next click anywhere on the figure moved the pivot by surprise.
    setPivot: (p) => commit({ ...cur, pivot: snapPivot(p), picking: false }),
    setPicking: (on) => commit({ ...cur, picking: !!on }),
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    reset: () => commit({ ...DEFAULTS })
  };
}
