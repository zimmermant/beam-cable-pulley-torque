import { fmtFixed, withUnit } from './format.js';

// ======================================================================================================
// THE FIELDS TABLE: the one place that says what the learner can set.
//
// This simulation stores only the force at D: its magnitude and its direction. The beam's geometry and
// the pulley's place are fixed (physics.js), and every other force is derived.
//
//   key       name in the state and in a URL preset (?f=200). Short, lower-case letters.
//   id        stem of the DOM ids: #<id>-slider, #<id>-readout (and #<id>-mark when `mark` is set)
//   label     the heading shown above the slider
//   symbol    the physics symbol, as its BASE letter only ("F", "θ"). An ASCII digit in a name is a bare
//             number to the unit lint, so a name that needs one takes `sub` instead.
//   sub       OPTIONAL subscript, rendered as a real subscript everywhere it is shown: <sub> in HTML, a
//             lowered tspan in SVG, a <sub> node in the link note. NEVER an ASCII underscore on screen.
//             Todd's rule: a force is never named after a point, so the force at D is F_D, not D.
//   subWord   OPTIONAL: `sub` as it should be SPOKEN, for aria text ("D", "x"). Required with `sub`.
//   min, max, step   the slider's range; min and max are whole multiples of step
//   unit      printed after a number; must be listed in test/unit-rule.js UNITS, with its word in UNIT_WORDS
//   unitWord  the same unit in words, for aria-valuetext
//   default   the starting value (on the grid)
//   decimals  decimals printed and kept
//   mark      OPTIONAL: a critical value, STRICTLY inside the range, shown but never snapped to:
//             { value, label }.
//   snap      OPTIONAL: a special value the input sticks to. { at, zone, jump } -- a value within
//             `zone` of `at` becomes exactly `at`, and a keyboard nudge from `at` lands on at +/- jump
//             so the arrow keys can leave the zone. `at` defaults to 0 (a quantity symmetric about
//             zero, which is the usual case); here it is 270 degrees, straight down.
//   noSlider  this input has no slider on the page and is set some other way. BOTH inputs carry it:
//             the force at D is dragged by its arrowhead, and the bar under the figure reads it back
//             rather than offering a second control. They are still stored, still snapped, and can
//             still be set by a link, so state, presets and the browser harness all still honour it.
// ======================================================================================================
//
// THE FIGURE IS THE CONTROL. Drag the arrowhead at D, or tab to it and use the arrow keys: the steps
// are the fields' own and every value goes through fieldSnap, so a key can only land where a drag
// could. The keyboard is the drag by another route, not a second way in, and without it the force
// would need a mouse.
export const FIELDS = [
  { key: 'f', id: 'f', label: 'Force at D', symbol: 'F', sub: 'D', subWord: 'D',
    min: 0, max: 300, step: 25, unit: 'lb', unitWord: 'pounds', default: 200, decimals: 0, noSlider: true },
  // THE SNAP, and why it is at 270 rather than at zero. The figure leaves the hanging weight drawn in
  // outline under D, so straight down is a direction the student is being invited to come back to: it
  // is the textbook problem, and it is the only direction whose answer anyone has memorised. Ten
  // degrees of stickiness is enough to land on it from a drag without fighting the mouse, and the
  // keyboard jump of 15 is wider than the zone, so the arrow keys can always leave it. The cost is
  // that 260, 265, 275 and 280 degrees cannot be set at all -- they are inside the zone, and a drag
  // or a link that asks for one gets 270.
  { key: 'dir', id: 'dir', label: 'Direction at D', symbol: 'θ',
    min: 0, max: 360, step: 5, unit: '°', unitWord: 'degrees', default: 270, decimals: 0, noSlider: true,
    snap: { at: 270, zone: 10, jump: 15 } }
];

// The inputs that really have a slider on the page -- none, here. Everything that builds or checks a
// slider reads this, not FIELDS; everything about state, presets and snapping still reads FIELDS.
export const SLIDER_FIELDS = FIELDS.filter(f => !f.noSlider);

// An angle prints "270°", with nothing between the number and the unit. Every other unit is joined by U+00A0.
export const UNIT_JOIN = { '°': '' };

// ------------------------------------------------------------------------------------------------------
// Below this line everything is generic: no edit needed.
// ------------------------------------------------------------------------------------------------------

export function fieldByKey(key) {
  const f = FIELDS.find(g => g.key === key);
  if (!f) throw new Error(`no input called "${key}"`);
  return f;
}

export function fieldDefaults() {
  return Object.fromEntries(FIELDS.map(f => [f.key, f.default]));
}

// The value a snap field sticks to. A `snap` without `at` sticks to zero, which is what a quantity
// symmetric about zero wants and what every earlier simulation in this series used.
export function snapAt(f) {
  return f.snap ? (f.snap.at === undefined ? 0 : f.snap.at) : null;
}

// Raw slider value -> allowed value: clamp, round to whole steps and clean the float noise by rounding to the
// field's decimals; a snap zone collapses to the field's snap value. Non-finite input becomes that snap value for
// a snap field and the minimum otherwise. The result is never -0.
export function fieldSnap(f, v) {
  if (!Number.isFinite(v)) return f.snap ? snapAt(f) : f.min;
  const clamped = Math.max(f.min, Math.min(f.max, v));
  const stepped = Number((Math.round(clamped / f.step) * f.step).toFixed(f.decimals));
  return f.snap && Math.abs(stepped - snapAt(f)) <= f.snap.zone ? snapAt(f) : stepped;
}

// Slider input handler. Only a field with `snap` jumps past its zone on a keyboard step.
export function fieldNext(f, prev, raw, viaKeyboard) {
  const snapped = fieldSnap(f, raw);
  const at = snapAt(f);
  if (f.snap && viaKeyboard && prev === at && snapped === at && raw !== at && Number.isFinite(raw)) {
    return fieldSnap(f, raw > at ? at + f.snap.jump : at - f.snap.jump);
  }
  return snapped;
}

// The value as printed: fixed decimals, true minus sign, never -0.
export function fieldShow(f, v) {
  return fmtFixed(v, f.decimals);
}

// A printed number and its unit, joined by a no-break space or as UNIT_JOIN says.
export function unitText(text, unit, joins = UNIT_JOIN) {
  return withUnit(text, unit, Object.hasOwn(joins, unit) ? joins[unit] : undefined);
}

// The value with its unit.
export function fieldText(f, v, joins = UNIT_JOIN) {
  return unitText(fieldShow(f, v), f.unit, joins);
}
