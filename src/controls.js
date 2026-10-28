import { FIELDS, fieldShow, snapAt } from './fields.js';
import { fmtFixed, NBSP } from './format.js';
import { pivotName, letteredAt } from './physics.js';

// The reading bar under the figure, and the one control on the page: the pivot picker.
//
// Everything about the FORCE is still set on the figure -- drag the arrowhead, or use the arrow keys
// on it -- so this module writes the two readings and never touches them. The pivot is different: a
// point has to be pointed at, and a button is what says the figure is listening. The button only
// ever sets a MODE; where the pivot lands is decided by the click, in interact.js.

export const PICK_IDLE = 'Pick a pivot point';
export const PICK_ARMED = 'Click a point on either diagram on the left';
export const PICK_AGAIN = 'Pick a different point';

// What the button says, which is also what it is for: a control that looks the same whether or not
// it is listening tells the student nothing.
export function pickLabel(s) {
  if (s.picking) return PICK_ARMED;
  return s.pivot ? PICK_AGAIN : PICK_IDLE;
}

// How the bar names the pivot: its letter and, for one that is not a lettered point, where it is.
// A lettered point needs no coordinates -- the figure already says where A is.
export function pivotText(p) {
  if (!p) return 'none';
  const letter = letteredAt(p);
  return letter || `${pivotName(p)} (${fmtFixed(p.x, 1)}, ${fmtFixed(p.y, 1)})${NBSP}ft`;
}

// Pure: what the bar shows for state s. text[key] is a readout; atSnap[key] (only for a field with
// `snap`) says whether the input sits on its snap value; atMark[key] (only for a field with `mark`)
// whether it sits on its mark.
export function controlsView(s) {
  const text = {}, atSnap = {}, atMark = {};
  for (const f of FIELDS) {
    text[f.key] = fieldShow(f, s[f.key]);
    if (f.snap) atSnap[f.key] = s[f.key] === snapAt(f);
    if (f.mark) atMark[f.key] = s[f.key] === f.mark.value;
  }
  return { text, atSnap, atMark, pivot: pivotText(s.pivot), pick: pickLabel(s), picking: !!s.picking, hasPivot: !!s.pivot };
}

function controlsSetText(node, str) {
  if (node.textContent !== str) node.textContent = str;
}

// parts: { readouts: { key: el }, snaps: { key: el }, marks: { key: el }, pivot, pick, clear } --
// one readout per input in FIELDS, `snaps` only for the fields with `snap`, `marks` only for those
// with `mark`, and the three pivot elements. render(s) shows state s in them.
export function createControls(parts, state) {
  if (parts.pick && state) {
    // One button, one meaning: arm the picker, or disarm it if it is already armed. Picking a point
    // disarms it too (state.setPivot), so the mode can never outlive the gesture it is for.
    parts.pick.addEventListener('click', () => state.setPicking(!state.getState().picking));
  }
  if (parts.clear && state) parts.clear.addEventListener('click', () => state.setPivot(null));

  function render(s) {
    const v = controlsView(s);
    for (const f of FIELDS) {
      if (parts.readouts[f.key]) controlsSetText(parts.readouts[f.key], v.text[f.key]);
      if (f.snap && parts.snaps[f.key]) parts.snaps[f.key].classList.toggle('on', v.atSnap[f.key]);
      if (f.mark && parts.marks[f.key]) parts.marks[f.key].classList.toggle('on', v.atMark[f.key]);
    }
    if (parts.pivot) controlsSetText(parts.pivot, v.pivot);
    if (parts.pick) {
      controlsSetText(parts.pick, v.pick);
      parts.pick.classList.toggle('on', v.picking);
      parts.pick.setAttribute('aria-pressed', String(v.picking));
    }
    if (parts.clear) parts.clear.hidden = !v.hasPivot;
  }
  return { render };
}
