import { FIELDS } from './fields.js';
import { createState } from './state.js';
import { createScene } from './scene.js';
import { createControls } from './controls.js';
import { attachDrag } from './interact.js';
import { parsePresets, describePresets } from './presets.js';

// The page: the four diagrams and the reading of the force at D. Nothing else.
//
// The force at D is set by DRAGGING its arrowhead, so the bar under the figure is mostly readings.
// The one control is the pivot picker: a point has to be pointed at, and the button is what says
// the figure is listening for one. The keyboard still reaches the force:
// tab to the handle, then the arrow keys swing it and change its strength, Home puts it back on the
// hanging weight at full strength and End drops it. That is the drag by another route, not a second
// way in, and without it the force would need a mouse.
const APP_TITLE = 'Torque about a pivot: beam held by a cable over a pulley';

function appStart() {
  document.title = APP_TITLE;
  const state = createState();
  const fig = document.getElementById('fig');
  const scene = createScene(fig);
  const parts = { readouts: {}, snaps: {}, marks: {},
    pivot: document.getElementById('pivot-readout'),
    pick: document.getElementById('pick'),
    clear: document.getElementById('clear-pivot') };
  for (const f of FIELDS) {
    parts.readouts[f.key] = document.getElementById(`${f.id}-readout`);
    if (f.snap) parts.snaps[f.key] = document.getElementById(`${f.id}-snap`);
    if (f.mark) parts.marks[f.key] = document.getElementById(`${f.id}-mark`);
  }
  const controls = createControls(parts, state);

  // Presets from the link apply once, before the first render. Only the fields the link set.
  const presets = parsePresets(location.search);
  state.set(presets.values);
  const note = describePresets(presets);
  const link = document.getElementById('from-link');
  link.textContent = note;            // text only: the link's own text can never become markup
  link.hidden = note === '';

  // The scene rebuilds the whole figure, so the drag handle is a NEW node after every render. Hand
  // focus back when the old one had it, and never take it otherwise.
  function sync() {
    const s = state.getState();
    // The picking class rides on the figure so the cursor says, over the whole of it, that a click
    // means a pivot rather than a drag.
    if (fig.classList) fig.classList.toggle('picking', !!s.picking);
    const active = typeof document.activeElement === 'object' && document.activeElement
      && typeof document.activeElement.getAttribute === 'function'
      && (document.activeElement.getAttribute('class') || '').includes('load-handle');
    scene.render(s);
    controls.render(s);
    if (active && fig.querySelector) {
      const handle = fig.querySelector('.load-handle');
      if (handle && typeof handle.focus === 'function') handle.focus({ preventScroll: true });
    }
  }
  state.subscribe(sync);
  sync();
  attachDrag(document.getElementById('stage'), state);
}

appStart();
