import { FIELDS, fieldSnap, snapAt } from '../src/fields.js';
import { letteredPoints } from '../src/physics.js';
import { clampPivot, pivotBounds } from '../src/layout.js';
import { snapPivot } from '../src/state.js';

// A test helper (not a test file): the grid of states the lints and the rounding test walk through. Built from FIELDS,
// so a new input or a new range needs no edit here.
//
// Per input: every slider position if there are at most GRID_MAX of them, otherwise GRID_MAX positions spread over
// the range, always including both ends, the default and (for a field with `snap`) zero and the two jump values, and (for a field with `mark`) the marked value.
// Positions inside a snap zone collapse to 0 (the slider cannot stop there). The states are the cartesian product, so
// the count multiplies: the toy's 17 and 10 values give 170 states; three inputs with 21 values each give 9,261. Lower GRID_MAX if the suite becomes slow.
// Lowered from the kit's 21 because the unit lint draws the WHOLE four-panel figure for every state
// and this figure is a big one. Two inputs at eleven values each is about 150 states, which keeps the
// suite a few seconds while still walking both ends, the default, the snapped direction and the two
// values the keyboard can jump to either side of it.
export const GRID_MAX = 11;

export function gridValues(f) {
  const n = Math.round((f.max - f.min) / f.step);
  const at = (i) => Number((f.min + i * f.step).toFixed(f.decimals));
  const idx = [];
  if (n + 1 <= GRID_MAX) for (let i = 0; i <= n; i++) idx.push(i);
  else for (let j = 0; j < GRID_MAX; j++) idx.push(Math.round(j * n / (GRID_MAX - 1)));
  const values = new Set(idx.map(i => fieldSnap(f, at(i))));      // a position inside a snap zone IS 0: the slider cannot stop there
  values.add(f.default);
  if (f.snap) for (const v of [snapAt(f), snapAt(f) + f.snap.jump, snapAt(f) - f.snap.jump]) values.add(fieldSnap(f, v));   // only values the input can really reach
  if (f.mark) values.add(f.mark.value);                                          // and the marked value
  return [...values].sort((a, b) => a - b);
}

export const VALUES = Object.fromEntries(FIELDS.map(f => [f.key, gridValues(f)]));

// The cartesian product: [{ x: -0.5, k: 10 }, ...]
export const STATES = FIELDS.reduce(
  (acc, f) => acc.flatMap(s => VALUES[f.key].map(v => ({ ...s, [f.key]: v }))), [{}]);

// THE PIVOT IS NOT A FIELD, so it is not in the cartesian product above: it is a point, it can be
// absent, and sweeping two coordinates on a grid would multiply every lint by both of them for
// nothing. What matters about a pivot is not a sweep but the handful of places worth putting one:
// none at all, each lettered point (where one torque always vanishes), a point off the beam (where
// the horizontal components start to count), and the corners of the band, which are the extremes
// the arcs are scaled for.
export function gridPivots() {
  const b = pivotBounds();
  const mid = (lo, hi) => (lo + hi) / 2;
  return [
    null,
    ...letteredPoints().map(q => ({ x: q.x, y: q.y })),
    { x: 7, y: 0 },                                   // on the beam, between two forces, unlettered
    { x: mid(b.x0, b.x1), y: b.y1 },                  // above the beam
    { x: b.x0, y: b.y0 },                             // and the two corners the arcs are sized by
    { x: b.x1, y: b.y1 }
  ].map(p => (p ? snapPivot(clampPivot(p)) : null));
}

export const PIVOTS = gridPivots();

// Every state of the inputs against every pivot worth trying. The lints that draw the whole figure
// walk this, because what the figure draws now depends on both.
export const PIVOT_STATES = STATES.flatMap(s => PIVOTS.map(pivot => ({ ...s, pivot, picking: false })));
