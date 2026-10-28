import { VB, HANDLE_HIT, loadArrow, loadFromHandle, handleRest, dist,
         PANELS, panelOfPoint, pivotFromPoint, clampPivot } from './layout.js';
import { fieldByKey, snapAt } from './fields.js';
import { letteredPoints } from './physics.js';

// Dragging the force at D. attachDrag(root, state) wires it up and returns detach().
//
// THE RULES THIS FILE MUST NOT BREAK
//
//  1. The scene REBUILDS the whole svg on every render, so no listener is ever bound to a drawn node: it
//     would be destroyed mid-drag. Pointer events are delegated from the stable svg#fig, and the drag
//     records only numbers, never a node.
//  2. Nothing raw reaches the store. state.set snaps every field, but it is handed numbers computed from
//     the pointer, never a string, and a non-finite pointer position is dropped before it gets there.
//  3. A press counts as grabbing the handle when it lands inside .load-handle OR within HANDLE_HIT units
//     of where the handle is drawn -- the circle is small, and at f = 0 there is no arrow to aim at.
//  4. An abandoned drag (pointercancel) puts the force back where it started.
//  5. The handle is the arrow's TIP, not its tail: the force at D points OUT of the beam, the way the
//     weight pulls, so what you take hold of is the arrowhead end, out where the weight hangs.

const DRAG_PX = 3;              // a press that moves less than this (screen px) was a click, not a drag

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// Client pixels -> viewBox units, through the svg's own box. The svg keeps the viewBox's aspect ratio
// ("meet"), so the scale is the smaller of the two ratios and the figure is centred in any slack.
export function viewPoint(svg, e) {
  if (!finite(e.clientX) || !finite(e.clientY)) return null;
  const r = svg.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return null;
  const k = Math.min(r.width / VB.w, r.height / VB.h);
  const left = r.left + (r.width - VB.w * k) / 2;
  const top = r.top + (r.height - VB.h * k) / 2;
  return { x: (e.clientX - left) / k, y: (e.clientY - top) / k };
}

// Where the handle is drawn for state s: the arrow's TIP, or a resting spot just below D -- on the
// weight's hanger -- when there is no force to draw. scene.js must agree with this, so both read it
// from layout.js.
export function handleSpot(s) {
  const a = loadArrow(s);
  return a ? a.tip : handleRest();
}

export function attachDrag(root, state) {
  const svg = root.querySelector ? root.querySelector('#fig') : root;
  const fF = fieldByKey('f'), fDir = fieldByKey('dir');
  const bound = [];
  let drag = null;                 // { id, start, off, from, engaged }
  let detached = false;

  const on = (target, type, fn) => {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn);
    bound.push([target, type, fn]);
  };

  // `pt` is always a point viewPoint returned, and viewPoint refuses anything that is not two finite
  // numbers, so there is nothing left to check here: a second guard would be unreachable code.
  function apply(pt) {
    const tip = { x: pt.x + drag.off.x, y: pt.y + drag.off.y };
    state.set(loadFromHandle(tip, state.getState().dir));
  }

  function endDrag() {
    const d = drag;
    drag = null;                   // first, so the lostpointercapture this triggers finds nothing to end
    if (!d || !svg) return;
    svg.classList.toggle('dragging', false);
    if (typeof svg.releasePointerCapture === 'function' && d.id !== undefined) {
      try { svg.releasePointerCapture(d.id); } catch (err) { /* already released */ }
    }
  }

  function onPointerDown(e) {
    if (drag || e.isPrimary === false || (e.button !== undefined && e.button !== 0)) return;
    const pt = viewPoint(svg, e);
    if (!pt) return;
    // WHILE THE PICKER IS ARMED the figure is listening for a point, not for the drag handle. A
    // press inside either left panel lands the pivot and ends the mode; a press anywhere else is
    // ignored rather than silently dropping the pivot somewhere the other panel cannot show it.
    if (state.getState().picking) {
      const panel = panelOfPoint(pt);
      if (panel) {
        state.setPivot(clampPivot(pivotFromPoint(pt, PANELS[panel])));
        if (e.preventDefault) e.preventDefault();
      }
      return;
    }
    const s = state.getState();
    const spot = handleSpot(s);
    const hit = !!(e.target && typeof e.target.closest === 'function' && e.target.closest('.load-handle')) ||
      dist(pt, spot) <= HANDLE_HIT;
    if (!hit) return;
    drag = { id: e.pointerId, start: { x: e.clientX, y: e.clientY },
      off: { x: spot.x - pt.x, y: spot.y - pt.y }, from: { f: s.f, dir: s.dir }, engaged: false };
    if (typeof svg.setPointerCapture === 'function' && e.pointerId !== undefined) {
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    }
    if (e.preventDefault) e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!finite(e.clientX) || !finite(e.clientY)) return;
    if (!drag.engaged) {
      if (dist({ x: e.clientX, y: e.clientY }, drag.start) < DRAG_PX) return;
      drag.engaged = true;
      svg.classList.toggle('dragging', true);
    }
    const pt = viewPoint(svg, e);
    if (pt) apply(pt);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const pt = drag.engaged ? viewPoint(svg, e) : null;
    if (pt) apply(pt);
    endDrag();
  }

  function onPointerCancel(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    endDrag();
    if (d.engaged) state.set(d.from);                     // an abandoned drag changes nothing
  }

  function onLostCapture(e) {
    if (drag && e.pointerId === drag.id) endDrag();
  }

  // The keyboard, for whoever has tabbed to the handle: left and right swing the force, up and down
  // change how hard it pulls, and Home puts it back on the hanging weight -- the one setting the
  // outline under D is there to invite. The steps are the fields' own, and every value goes through
  // the same snapping a drag does, so a key can only land where a drag could.
  //
  // A NUDGE GOES THROUGH setField WITH THE KEYBOARD FLAG, not through set(). The direction sticks at
  // 270 degrees within ten degrees either side, so one step of five from 270 would snap straight back
  // and the arrow keys could never leave the weight at all. setField(..., true) is the same path the
  // slider's own keyboard takes: from the snap value a nudge lands on the far side of the zone.
  // Home and End set both inputs at once, so they stay on set(), and neither one is a nudge.
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // THE PICKER'S KEYBOARD ROUTE. Pointing at an arbitrary point needs a pointer, but the points
    // worth picking most are the lettered ones, and those have names: while the picker is armed, A
    // to E put the pivot on that point and Escape gives up. Without this the whole feature would be
    // mouse-only, and the rest of the page is not.
    if (state.getState().picking) {
      if (e.key === 'Escape') { state.setPicking(false); if (e.preventDefault) e.preventDefault(); return; }
      const hit = letteredPoints().find(q => q.name === String(e.key).toUpperCase());
      if (hit) {
        state.setPivot({ x: hit.x, y: hit.y });
        if (e.preventDefault) e.preventDefault();
      }
      return;
    }
    const t = e.target;
    if (!t || typeof t.closest !== 'function' || !t.closest('.load-handle')) return;
    const s = state.getState();
    switch (e.key) {
      case 'ArrowRight': state.setField('dir', (s.dir + fDir.step) % 360, true); break;
      case 'ArrowLeft': state.setField('dir', (s.dir - fDir.step + 360) % 360, true); break;
      case 'ArrowUp': state.setField('f', s.f + fF.step, true); break;
      case 'ArrowDown': state.setField('f', s.f - fF.step, true); break;
      case 'Home': state.set({ f: fF.max, dir: snapAt(fDir) }); break;
      case 'End': state.set({ f: 0 }); break;
      default: return;
    }
    if (e.preventDefault) e.preventDefault();
  }

  on(svg, 'pointerdown', onPointerDown);
  on(svg, 'pointermove', onPointerMove);
  on(svg, 'pointerup', onPointerUp);
  on(svg, 'pointercancel', onPointerCancel);
  on(svg, 'lostpointercapture', onLostCapture);
  on(root, 'keydown', onKeyDown);

  return function detach() {
    if (detached) return;
    detached = true;
    for (const [target, type, fn] of bound) target.removeEventListener(type, fn);
    bound.length = 0;
    endDrag();
  };
}
