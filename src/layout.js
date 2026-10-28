// Pure geometry for the figure: where everything is drawn, in viewBox units. No DOM, no drawing.
// scene.js turns this into SVG; the browser harness checks the result against the same numbers.
//
// The figure is ONE svg with four panels, so the harness keeps its single-figure model:
//   1  the space diagram   (the given situation, with the draggable force at D)
//   2  the point FBD       (the beam shrunk to a point, all four forces from it)
//   3  the extended FBD    (the beam alone, forces at the points where they act)
//   4  the force polygon   (the same four forces tip to tail, closing)
//
// Screen y runs DOWN and physics y runs UP, so every physics vector (vx, vy) becomes the screen
// delta (vx, -vy) * FORCE_U. That flip happens in exactly one place: screenDelta().

import { derive, torqueList, X_B, X_C, X_D, H_E, PULLEY_R, SQ5 } from './physics.js';

export const VB = { w: 960, h: 790 };

// AND WHY THIS ONE IS TALLER AGAIN (790, against the 700 of the version without torques). The
// free-body diagram now carries two labels per force, not one: the force's name and what it turns
// about the pivot, with a number on the second. Eight labels will not fit beside a 416-unit beam in
// one row, so the bottom row is given the height to stagger them. At the 800 px iframe the figure
// then renders 784 x 645, which still clears the budget above the one-line reading bar.
//
// WHY THIS FIGURE IS TALLER THAN THE LAST ONE. The page must fit a Canvas iframe (800 x 750) with no
// vertical scroll. The last simulation used a 960 x 616 viewBox; this one needs more height because
// the space diagram is not just a beam -- the pulley stands TEN FEET above a thirteen-foot beam, so
// that panel is nearly as tall as it is wide. At 960 x 700 and the iframe's 784 px of width the
// figure renders 784 x 572, which clears the 750 px budget with the control bar underneath, and the
// 21-unit base text still renders at 17.2 px, well over the 12 px floor.

export const FORCE_U = 0.25;     // viewBox units per pound -- ONE scale for panels 1 to 3
export const FOOT_U = 26;        // viewBox units per foot of beam, in BOTH beam panels
export const TEXT = 21;          // base label size: 21 * (784/960) = 17.2 px rendered
// A subscript, and every caption. SEVENTEEN, not the sixteen the last simulation used, and the
// reason is the reading bar rather than the figure. The figure is sized to fit what is left under
// the bar, so a link that adds a two-line "Adjusted:" note shrinks it: at 800 x 750 the scale drops
// from 0.817 to 0.736, and sixteen units then renders at 11.8 px -- under the floor. Seventeen
// renders at 12.5 px in that state and 13.9 px in the ordinary one, which leaves room for a
// three-line note as well. The browser harness's query probes are what found this; the sweep on the
// page itself never sees it, because the page itself never shows a link note.
export const SUB = 17;
export const HEAD_MAX = 12;      // longest arrowhead
export const HANDLE_R = 10;      // the drag handle's drawn radius
export const HANDLE_HIT = 24;    // and how close a press counts as grabbing it

// The hanging weight, drawn in OUTLINE under D whatever direction the force is pointing. It is the
// textbook problem left on the page: the one direction whose answer anyone has memorised. The force
// snaps to it (see `snap` in fields.js) and the outline fills in when it does, so the snap is visible
// and not just felt. Sizes in feet, measured down from the top of the beam.
export const MASS_DROP = 0.3;    // length of the hanger line between the beam and the top of the mass
export const MASS_H = 1.9;       // height of the drawn cylinder
export const MASS_W = 1.5;       // its width
export const MASS_RX = 0.38;     // how round its ends are drawn

// The slope triangle on the inclined run of cable: a right triangle whose hypotenuse IS the cable, so
// the numbers on the figure cannot disagree with the line they describe. Its legs are a whole 2 ft
// down and 1 ft across, and they are LABELLED AS LENGTHS rather than as a bare ratio -- "2" and "1"
// alone are numbers with no unit, which is exactly what the unit lint refuses, and rightly: a reader
// has to guess what they count. Two feet down per one foot across says the same thing and is true.
export const SLOPE_AT = 7.2;     // ft from A: where the triangle's top corner sits on the cable
export const SLOPE_RISE = 2;     // ft down from there
export const SLOPE_RUN = 1;      // and ft across: the hypotenuse lands back on the cable, exactly

// The wall at A, and the ceiling the pulley hangs from: how far each reaches.
export const WALL_REACH = 58;
export const CEIL_REACH = 46;

// ---------------------------------------------------------------------------------------------
// MEASURED IN CHROMIUM, not derived: how far a label's PAINTED box reaches from its baseline, as a
// fraction of its font size, and the smallest scale the figure is ever drawn at. These are what a
// unit test has to compare against when it asks whether two lines of text clear each other or
// whether the smallest text clears the 12 px floor -- the font size alone answers neither.
//
// INK_BELOW_SUB is the deeper descent of a label whose subscript hangs below the baseline (F_D), as
// against INK_BELOW for one with no descender (a heading, a caption, "5 ft").
//
// WORST_SCALE is the tight case, and it is not the smaller window on its own: the figure takes
// whatever height the control bar leaves it, so the worst state is 1280 x 720 WITH a link note long
// enough to wrap onto a second line. Measured there: 0.7206, at which SUB renders at 12.25 px.
// ---------------------------------------------------------------------------------------------
export const INK_ABOVE = 0.978;
export const INK_BELOW = 0.201;
export const INK_BELOW_SUB = 0.473;
export const WORST_SCALE = 0.7206;
export const MIN_TEXT_PX = 12;

// The four panels. `baseX` is where A sits in the panels that draw the beam; `baseY` is the top face
// of the beam, which is where every point of the beam is taken to be.
export const PANELS = {
  space: { headY: 22, headX: 10, baseX: 62, baseY: 268, dimY: 355, dimLabelY: 384,
           box: { x0: 8, x1: 590, y0: 6, y1: 398 },
           // where a pivot dot may be dropped: clear of the heading above and the dimensions below
           band: { y0: 62, y1: 344 } },
  point: { headY: 22, headX: 614, ox: 777, oy: 200,
           box: { x0: 602, x1: 952, y0: 6, y1: 398 } },
  ext:   { headY: 428, headX: 10, baseX: 132, baseY: 600,
           box: { x0: 8, x1: 594, y0: 410, y1: 784 },
           // clear of this panel's three caption lines, and of the room its labels need below
           band: { y0: 502, y1: 770 } },
  // THE POLYGON IS THE PANEL THAT RUNS OUT OF ROOM, so it takes width off the free-body diagram
  // rather than the other way round. The free-body diagram has slack -- the beam is 338 units wide in
  // a panel nearly 600 across -- while the polygon has four mid-side labels and, whenever two of its
  // sides run nearly parallel, two of them start out almost on top of each other.
  poly:  { headY: 428, headX: 612, x0: 612, x1: 946, y0: 486, y1: 736,
           box: { x0: 606, x1: 952, y0: 410, y1: 784 } }
};
// The rules between them: one across, and one down each row.
export const SPLITS = {
  across: { y: 404, x0: 8, x1: 952 },
  upper:  { x: 596, y0: 8, y1: 398 },
  lower:  { x: 600, y0: 412, y1: 784 }
};

// The beam's four points, in whichever panel is asked for. Both beam panels use the same scale, so
// the beam is the same beam in each and an arrow of a given length means the same thing in both.
export function beamPoints(baseY, baseX) {
  return {
    A: { x: baseX, y: baseY },
    B: { x: baseX + X_B * FOOT_U, y: baseY },
    C: { x: baseX + X_C * FOOT_U, y: baseY },
    D: { x: baseX + X_D * FOOT_U, y: baseY }
  };
}

// A point given in FEET from A, with y up from the beam, placed in a panel.
export function atFoot(p, baseY, baseX) {
  return { x: baseX + p.x * FOOT_U, y: baseY - p.y * FOOT_U };
}

// A physics vector in pounds -> a screen delta in viewBox units. The ONE place y is flipped.
export function screenDelta(v, scale = FORCE_U) {
  return { x: v.x * scale, y: -v.y * scale };
}

// ---------------------------------------------------------------------------------------------
// The cable and its pulley, in FEET, with y measured up from the top of the beam.
//
// physics.js idealises the pulley to the point E, directly above B and H_E feet up, and that point
// is never drawn. What IS drawn is a wheel of radius PULLEY_R tangent to both cable lines, which is
// what the textbook figure shows. Its centre is found from the two tangency conditions, not placed
// by eye: it sits PULLEY_R to the right of the vertical run, and PULLEY_R from the line through C
// and E, which is 2x + y = 2 X_B + H_E.
// ---------------------------------------------------------------------------------------------
export const SLOPE_C = 2 * X_B + H_E;      // the inclined cable's line: 2x + y = SLOPE_C

export function pulleyGeom() {
  const cx = X_B + PULLEY_R;
  // Below the inclined line by PULLEY_R, measured along its unit normal (2, 1)/sqrt5.
  const cy = SLOPE_C - 2 * cx - PULLEY_R * SQ5;
  const centre = { x: cx, y: cy };
  return {
    centre,
    r: PULLEY_R,
    apex: { x: X_B, y: H_E },                                    // the idealised point E
    tanB: { x: X_B, y: cy },                                     // where the vertical run leaves the wheel
    tanC: { x: cx + PULLEY_R * 2 / SQ5, y: cy + PULLEY_R / SQ5 } // and where the inclined run leaves it
  };
}

// The drawn cable, as the SHORT SEGMENTS it is really made of: the vertical run up from B, the arc
// over the top of the wheel, and the inclined run down to C. Cut up for the same reason an arrow's
// shaft is (see svg.js): every overlap check works on bounding rectangles, and one long diagonal
// claims its whole rectangle, which would make the clear space beside the cable unusable for labels.
export function cableSegments(baseY, baseX, segLen = SHAFT_SEG) {
  const g = pulleyGeom();
  const B = { x: X_B, y: 0 };
  const C = { x: X_C, y: 0 };
  const out = [];
  const run = (from, to) => {
    const a = atFoot(from, baseY, baseX), b = atFoot(to, baseY, baseX);
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / segLen));
    for (let i = 0; i < n; i++) {
      out.push({
        x1: a.x + (b.x - a.x) * (i / n), y1: a.y + (b.y - a.y) * (i / n),
        x2: a.x + (b.x - a.x) * ((i + 1) / n), y2: a.y + (b.y - a.y) * ((i + 1) / n)
      });
    }
  };
  run(B, g.tanB);
  // the arc, from the vertical tangent point over the top to the inclined one, in short chords
  const a0 = Math.atan2(g.tanB.y - g.centre.y, g.tanB.x - g.centre.x);
  const a1 = Math.atan2(g.tanC.y - g.centre.y, g.tanC.x - g.centre.x);
  const sweep = ((a1 - a0) + 2 * Math.PI) % (2 * Math.PI);       // counterclockwise in FEET, i.e. over the top
  const steps = Math.max(3, Math.ceil(g.r * FOOT_U * sweep / segLen));
  let prev = g.tanB;
  for (let i = 1; i <= steps; i++) {
    const t = a0 + sweep * (i / steps);
    const next = { x: g.centre.x + g.r * Math.cos(t), y: g.centre.y + g.r * Math.sin(t) };
    run(prev, next);
    prev = next;
  }
  run(g.tanC, C);
  return out;
}

// The 2-to-1 slope triangle: its corner on the cable, straight down, then across back ONTO the cable.
export function slopeTriangle(baseY, baseX) {
  const top = { x: SLOPE_AT, y: SLOPE_C - 2 * SLOPE_AT };
  const foot = { x: SLOPE_AT, y: top.y - SLOPE_RISE };
  const right = { x: SLOPE_AT + SLOPE_RUN, y: foot.y };
  return {
    top: atFoot(top, baseY, baseX),
    foot: atFoot(foot, baseY, baseX),
    right: atFoot(right, baseY, baseX),
    riseLabel: atFoot({ x: SLOPE_AT - 0.2, y: top.y - SLOPE_RISE / 2 }, baseY, baseX),
    runLabel: atFoot({ x: SLOPE_AT + SLOPE_RUN / 2, y: foot.y - 0.22 }, baseY, baseX)
  };
}

// The hanging weight drawn in outline under D: the hanger line and the body's rectangle.
export function massOutline(baseY, baseX) {
  const D = beamPoints(baseY, baseX).D;
  const top = D.y + 8 + MASS_DROP * FOOT_U;          // 8 units: the half-thickness of the drawn beam
  return {
    hook: { x: D.x, y: D.y + 8 },
    top: { x: D.x, y: top },
    body: { x: D.x - MASS_W * FOOT_U / 2, y: top, w: MASS_W * FOOT_U, h: MASS_H * FOOT_U, rx: MASS_RX * FOOT_U },
    box: { x0: D.x - MASS_W * FOOT_U / 2, x1: D.x + MASS_W * FOOT_U / 2, y0: D.y + 8, y1: top + MASS_H * FOOT_U }
  };
}

// ---------------------------------------------------------------------------------------------
// The forces
// ---------------------------------------------------------------------------------------------

// The four FORCES of state s, in the order the figure introduces them, with the colour class each
// renderer uses. `at` is where the force acts, in feet from A; `vec` is the force in pounds. The two
// cable forces share a class -- they are one cable, and their equal magnitude is the whole point.
export function forceList(s) {
  const d = derive(s);
  return [
    { key: 'load',   at: X_D, vec: d.D,  mag: d.magD,  cls: 'load' },
    { key: 'cableB', at: X_B, vec: d.BE, mag: d.magBE, cls: 'cable' },
    { key: 'cableC', at: X_C, vec: d.CE, mag: d.magCE, cls: 'cable' },
    { key: 'pin',    at: 0,   vec: d.A,  mag: d.magA,  cls: 'pin' }
  ];
}

// Panel 1: the force at D has its TAIL on the beam at D and its TIP at the drag handle, so the handle
// is out where the weight hangs and dragging it is dragging the arrow itself. Returns null when there
// is no force to draw.
export function loadArrow(s, baseY = PANELS.space.baseY, baseX = PANELS.space.baseX) {
  const d = derive(s);
  if (d.magD === 0) return null;
  const D = beamPoints(baseY, baseX).D;
  const dl = screenDelta(d.D);
  return { tail: D, tip: { x: D.x + dl.x, y: D.y + dl.y } };
}

// Where the handle rests when there is no force to draw: just below D, on the hanger, where the
// weight would pull. interact.js and scene.js must agree on this, so it lives here.
export const HANDLE_REST = 46;

export function handleRest(baseY = PANELS.space.baseY, baseX = PANELS.space.baseX) {
  const D = beamPoints(baseY, baseX).D;
  return { x: D.x, y: D.y + HANDLE_REST };
}

// The inverse: a handle dropped at `tip` means the force runs from D OUT to there. Magnitude in
// pounds and direction in degrees CCW from +x, ready for the fields' own snapping. A handle exactly
// on D keeps the old direction, because a zero vector has none.
export function loadFromHandle(tip, prevDir, baseY = PANELS.space.baseY, baseX = PANELS.space.baseX) {
  const D = beamPoints(baseY, baseX).D;
  const vx = (tip.x - D.x) / FORCE_U;
  const vy = -(tip.y - D.y) / FORCE_U;              // back to physics y, which runs up
  const mag = Math.hypot(vx, vy);
  if (!(mag > 1e-9)) return { f: 0, dir: prevDir };
  const deg = Math.atan2(vy, vx) * 180 / Math.PI;
  return { f: mag, dir: deg < 0 ? deg + 360 : deg };
}

// Panels 2 and 3: an FBD arrow has its TAIL where the force acts and its tip in the force's direction.
// Panel 3 spreads them along the beam; panel 2 puts every tail on one point.
export function fbdArrows(s, origin, spread) {
  const out = [];
  for (const f of forceList(s)) {
    if (f.mag === 0) continue;
    const tail = spread ? { x: origin.x + f.at * FOOT_U, y: origin.y } : { x: origin.x, y: origin.y };
    const dl = screenDelta(f.vec);
    out.push({ ...f, tail, tip: { x: tail.x + dl.x, y: tail.y + dl.y } });
  }
  return out;
}

// Panel 4: the same four forces laid tip to tail, in the order the FBD introduces them. The chain must
// come back to where it started, which is the whole point of the picture. Returns the vertices in
// POUNDS, physics axes; fitPolygon turns them into viewBox units.
export function polygonVertices(s) {
  const pts = [{ x: 0, y: 0 }];
  for (const f of forceList(s)) {
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + f.vec.x, y: last.y + f.vec.y });
  }
  return pts;
}

// Fit a set of physics points into a box, keeping the aspect ratio and leaving `pad` units of margin.
// Returns a mapping function and the scale, in viewBox units per pound, so the figure can draw a scale
// bar. A degenerate set (every point equal, or a straight line) still gets a usable scale.
//
// THE MARGIN IS NOT THE SAME BOTH WAYS, and the figure is unreadable if it is. A force label is wide
// and short, so the room it needs is mostly sideways; the panel, meanwhile, is far wider than it is
// tall. Setting both margins to the horizontal one left only 62 units of height for the polygon, and
// a chain whose longest side is a 200 lb force came out 62 units from end to end -- a smudge beside
// four full-size labels. These two numbers are swept separately below.
//
// WHY THE HORIZONTAL MARGIN IS THIS BIG, AND WHY MORE WOULD BE WORSE. The four side labels sit outside the
// middle of their own sides, so the room they need is room AROUND the polygon, not inside the panel
// generally: widening the panel barely helped, and shrinking the polygon did. Swept over every state
// of the grid, 46 units of margin left 28 states with two labels touching, 64 left one, and 74 left
// none -- but 78 left ten and 82 left thirty-one, because a polygon drawn small enough brings all
// four of its sides' midpoints together and no amount of shoving can separate labels that all start
// in the same place. 74 is the floor of that window, not a number that can be raised for safety.
export function fitPolygon(pts, box, pad = POLY_PAD_X, padY = POLY_PAD_Y) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = box.x1 - box.x0 - 2 * pad, h = box.y1 - box.y0 - 2 * padY;
  const spanX = maxX - minX, spanY = maxY - minY;
  const kx = spanX > 1e-9 ? w / spanX : Infinity;
  const ky = spanY > 1e-9 ? h / spanY : Infinity;
  const k = Math.min(kx, ky, 1.5);                    // never blow a tiny polygon up past 1.5 units/lb
  const scale = Number.isFinite(k) && k > 0 ? k : 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const mx = (box.x0 + box.x1) / 2, my = (box.y0 + box.y1) / 2;
  return {
    scale,
    map: (p) => ({ x: mx + (p.x - cx) * scale, y: my - (p.y - cy) * scale })
  };
}

// Where a force's label goes: past the arrow's tip, along the arrow, so it never sits on the shaft.
// A NEARLY HORIZONTAL arrow gets its label lifted clear instead of nudged along the line -- in the two
// beam panels such an arrow runs down the beam, and a label on the line lands on the beam itself.
// `anchor` keeps the text inside the figure by reading the direction, not the position.
export const LABEL_LIFT = 24;   // measured: a label's box reaches about 20 units above its baseline and 10 below

export function labelSpot(tail, tip, out = 17) {
  const dx = tip.x - tail.x, dy = tip.y - tail.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const lift = Math.abs(uy) < 0.35 ? -LABEL_LIFT
    : uy > 0 ? TEXT * 0.85
    : -TEXT * 0.3;
  return {
    x: tip.x + ux * out,
    y: tip.y + uy * out + lift,
    anchor: ux > 0.25 ? 'start' : ux < -0.25 ? 'end' : 'middle'
  };
}

// Where a polygon side's label goes: beside the middle of its own side, on the far side from the
// polygon's centre. A FLAT polygon (every force along one line) has its centre ON every side, so
// there is no far side: the sides then take turns above and below one shared perpendicular, which is
// what keeps the labels of a collapsed polygon apart.
export function polygonLabelSpots(sides, out = POLY_LABEL_OUT) {
  if (!sides.length) return [];
  const cx = sides.reduce((a, s) => a + (s.from.x + s.to.x) / 2, 0) / sides.length;
  const cy = sides.reduce((a, s) => a + (s.from.y + s.to.y) / 2, 0) / sides.length;
  const perpOf = (s) => {
    const dx = s.to.x - s.from.x, dy = s.to.y - s.from.y;
    const n = Math.hypot(dx, dy) || 1;
    return { x: -dy / n, y: dx / n };
  };
  const mids = sides.map(s => ({ x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 }));
  const perps = sides.map(perpOf);
  const outward = sides.map((s, i) => (mids[i].x - cx) * perps[i].x + (mids[i].y - cy) * perps[i].y);
  const flat = outward.every(v => Math.abs(v) < 1);
  return sides.map((s, i) => {
    const p = flat ? perps[0] : perps[i];
    const sign = flat ? (i % 2 ? -1 : 1) : Math.sign(outward[i]) || 1;
    const x = mids[i].x + p.x * sign * out;
    const y = mids[i].y + p.y * sign * out + TEXT * 0.34;
    return { x, y, anchor: p.x * sign < -0.25 ? 'end' : p.x * sign > 0.25 ? 'start' : 'middle' };
  });
}

// ---------------------------------------------------------------------------------------------
// Boxes: how a label is measured, and how one is moved off whatever it lands on.
//
// Everything that checks a figure for collisions -- the browser harness, and a reader's eye -- works
// on rectangles, so this file places labels by rectangle too. The constants are MEASURED in Chromium
// at TEXT units with the figure's own font, not guessed, and taken from the WIDEST label this figure
// prints rather than an average: digits are wider than letters and a force label is mostly digits.
// ---------------------------------------------------------------------------------------------
export const LABEL_CHAR_W = 11.4;
export const LABEL_ABOVE = 21;
export const LABEL_BELOW = 11;
export const PLACE_PAD = 1.5;        // clear space demanded between a label and a drawn shape
// Two labels need a real gap, not merely not to touch. At 1.5 units apart two force labels are
// measurably clear of each other and read as one string; this is the space between two words.
export const PLACE_TEXT_GAP = 11;
export const PLACE_PASSES = 8;
// How far a label may be moved from where its arrow put it, by default. Raised from the previous
// simulation's 110 by a measured amount, not a guess: in the free-body diagram the two cable labels
// want the same place whenever the force at D is near straight down (their arrow tips are 130 units
// apart and each label is about 115 wide), and the captions above leave no room to separate them
// vertically. Swept over every state of the grid, 110 left ten such states with the two labels
// touching and 140 left none; the force polygon, whose panel is the smallest, needs 160 to clear its
// own last state. The solver still moves each label as little as it can, so nothing travels this far
// unless it must, and the panel checks in test/layout.test.js are what say whether it does.
export const PLACE_MAX_SHIFT = 160;

// A point's name (A, B, C, D, E) may be nudged, but only a little: further than this and it no longer
// reads as the name of that point. Items carry their own cap through `maxShift`.
export const PLACE_NAME_SHIFT = 30;


// The force polygon's margins inside its panel (see fitPolygon), and how far outside its own side a
// side's label starts. All three are swept over every state of the grid: 20 units of standoff leaves
// no state with two labels touching, while 24 leaves three and 28 leaves eleven -- a label set
// further out from a short side lands further round the polygon, not further from its neighbours.
export const POLY_PAD_X = 74;
export const POLY_PAD_Y = 30;
export const POLY_LABEL_OUT = 20;

// A label's box, estimated from its character count. The three constants are measured at TEXT units,
// so a label drawn SMALLER is scaled down with it: a caption at SUB is 16/21 of the width and the
// height of one at TEXT. Without that scaling the solver believed a 69-character caption at SUB was
// 787 units wide -- wider than its own panel -- and so believed the whole band across the top of the
// free-body diagram was occupied. It then had nowhere to move the two cable labels to, left them
// sitting on each other, and the browser harness said so.
export function labelBox(spot, chars, size = TEXT) {
  const k = size / TEXT;
  const w = chars * LABEL_CHAR_W * k;
  const x0 = spot.anchor === 'end' ? spot.x - w : spot.anchor === 'middle' ? spot.x - w / 2 : spot.x;
  return { x0, x1: x0 + w, y0: spot.y - LABEL_ABOVE * k, y1: spot.y + LABEL_BELOW * k };
}

// True when the two boxes are closer than `pad` apart. EXACTLY `pad` apart counts as clear: the
// placement solver moves a label to precisely that distance, and without the epsilon the arithmetic
// that put it there and the test that checks it disagree by a last bit, so the move never takes.
const BOX_EPS = 1e-6;

export function boxesHit(a, b, pad = PLACE_PAD) {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -pad + BOX_EPS &&
         Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > -pad + BOX_EPS;
}

const shift = (box, dx, dy) => ({ x0: box.x0 + dx, x1: box.x1 + dx, y0: box.y0 + dy, y1: box.y1 + dy });

// Keeps a box inside `bounds` by sliding it, and says how far it had to slide.
function insideShift(box, bounds) {
  let dx = 0, dy = 0;
  if (box.x0 < bounds.x0) dx = bounds.x0 - box.x0;
  else if (box.x1 > bounds.x1) dx = bounds.x1 - box.x1;
  if (box.y0 < bounds.y0) dy = bounds.y0 - box.y0;
  else if (box.y1 > bounds.y1) dy = bounds.y1 - box.y1;
  return { dx, dy };
}

// Places labels so that none sits on another, on an obstacle, or outside its panel.
//
//   items      [{ spot, chars, pinned }] -- a pinned item never moves but still blocks the others
//   obstacles  [box] -- the beam, the cable, the dimension lines, every piece of every arrow
//   bounds     the panel's box; a label is kept inside it
//
// For each movable label it tries the four smallest escapes (up, down, left, right past whatever it
// overlaps), keeps the one that costs least movement from where the arrow put it, and repeats. A label
// that cannot be freed stays at its best position rather than flying off: the figure is then still
// readable, and the browser harness says so. Pure and deterministic.
export function placeLabels(items, obstacles = [], bounds = null) {
  const boxes = items.map(it => labelBox(it.spot, it.chars, it.size));
  const home = boxes.map(b => ({ ...b }));
  const blockers = (i) => [
    ...obstacles.map(b => ({ b, hard: true, gap: PLACE_PAD })),
    ...boxes.map((b, j) => ({ b, hard: !!items[j].pinned, gap: PLACE_TEXT_GAP, self: j === i })).filter(x => !x.self)
  ];

  // Landing on something that cannot move is worse than landing on another label, which the next pass
  // can still push aside. Without that difference a label with no clear spot stays where it is -- on
  // the beam -- because every escape looks exactly as bad.
  //
  // Leaving the panel costs far more than any number of overlaps: an arrow is drawn in many short
  // pieces, so brushing one arrow already counts several times over, and a smaller penalty here let a
  // label sit half off the figure rather than touch a long arrow. Off the edge it is simply cut off.
  const HARD = 3, SOFT = 1, OUT = 1000;

  const cost = (i, b) => {
    let n = 0;
    for (const o of blockers(i)) if (boxesHit(b, o.b, o.gap)) n += o.hard ? HARD : SOFT;
    if (bounds) { const s = insideShift(b, bounds); if (s.dx || s.dy) n += OUT; }
    return n;
  };
  const travel = (i, b) => Math.hypot(b.x0 - home[i].x0, b.y0 - home[i].y0);
  const capOf = (i) => (items[i].maxShift === undefined ? PLACE_MAX_SHIFT : items[i].maxShift);

  // The four ways out of one blocker: just above it, just below it, just left of it, just right of it,
  // each clearing it by the gap that blocker demands.
  const escapes = (box, o, gap) => [
    { dx: 0, dy: o.y0 - gap - box.y1 },
    { dx: 0, dy: o.y1 + gap - box.y0 },
    { dx: o.x0 - gap - box.x1, dy: 0 },
    { dx: o.x1 + gap - box.x0, dy: 0 }
  ];

  for (let pass = 0; pass < PLACE_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].pinned) continue;
      if (cost(i, boxes[i]) === 0) continue;
      let best = boxes[i], bestCost = cost(i, boxes[i]), bestTravel = travel(i, boxes[i]);
      // `far` lets one kind of move ignore the travel cap: sliding back onto the panel. A label off the
      // edge is cut off and unreadable, which is worse than a label that has wandered from its arrow.
      const consider = (cand0, far = false) => {
        let cand = cand0;
        if (bounds) { const s = insideShift(cand, bounds); cand = shift(cand, s.dx, s.dy); }
        if (!far && travel(i, cand) > capOf(i)) return null;
        const c = cost(i, cand), tr = travel(i, cand);
        if (c < bestCost || (c === bestCost && tr < bestTravel - 1e-9)) { best = cand; bestCost = c; bestTravel = tr; }
        return cand;
      };
      // One step out of each blocker, and -- because escaping one thing often lands on the next -- a
      // second step out of whatever that first step ran into. Without the second step a label with a
      // row of obstacles beside it never moves: every single step looks exactly as bad as staying.
      for (const first of blockers(i)) {
        if (!boxesHit(boxes[i], first.b, first.gap)) continue;
        for (const t of escapes(boxes[i], first.b, first.gap)) {
          const cand = consider(shift(boxes[i], t.dx, t.dy));
          if (!cand || cost(i, cand) === 0) continue;
          for (const second of blockers(i)) {
            if (!boxesHit(cand, second.b, second.gap)) continue;
            for (const u of escapes(cand, second.b, second.gap)) consider(shift(cand, u.dx, u.dy));
          }
        }
      }
      // sliding back inside the panel is always worth trying, even when nothing is in the way
      if (bounds) {
        const s0 = insideShift(boxes[i], bounds);
        if (s0.dx || s0.dy) consider(shift(boxes[i], s0.dx, s0.dy), true);
      }
      if (best !== boxes[i]) { boxes[i] = best; moved = true; }
    }
    if (!moved) break;
  }

  return items.map((it, i) => ({
    ...it.spot,
    x: it.spot.x + (boxes[i].x0 - home[i].x0),
    y: it.spot.y + (boxes[i].y0 - home[i].y0)
  }));
}

// A dashed segment, as the separate short dashes it is really drawn from. The last dash is cut to the
// end of the segment rather than overrunning it.
export const DASH_ON = 9;
export const DASH_OFF = 7;

export function dashes(from, to, on = DASH_ON, off = DASH_OFF) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0.5)) return [];
  const ux = dx / len, uy = dy / len;
  const out = [];
  for (let a = 0; a < len; a += on + off) {
    const b = Math.min(a + on, len);
    out.push({ x1: from.x + ux * a, y1: from.y + uy * a, x2: from.x + ux * b, y2: from.y + uy * b });
  }
  return out;
}

// The pieces an arrow is drawn from, as pure geometry, so the figure and the collision boxes can never
// disagree: svg.js draws exactly this. Returns the shaft pieces, the head's three corners, and the box
// of every piece.
export function arrowGeometry(from, to, width, headMax) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { pieces: [], head: null, boxes: [] };
  const ux = dx / len, uy = dy / len;
  const head = Math.min(headMax, len * 0.55);
  const bx = to.x - ux * head, by = to.y - uy * head;
  const half = width * 1.5 + 2.2;
  const shaftLen = len - head;
  const n = shaftPieces(len, head);
  const pieces = [];
  for (let i = 0; i < n; i++) {
    pieces.push({
      x1: from.x + ux * shaftLen * (i / n), y1: from.y + uy * shaftLen * (i / n),
      x2: from.x + ux * shaftLen * ((i + 1) / n), y2: from.y + uy * shaftLen * ((i + 1) / n)
    });
  }
  const corners = [
    { x: bx - uy * half, y: by + ux * half },
    { x: to.x, y: to.y },
    { x: bx + uy * half, y: by - ux * half }
  ];
  const boxes = pieces.map(p => ({ x0: Math.min(p.x1, p.x2), x1: Math.max(p.x1, p.x2), y0: Math.min(p.y1, p.y2), y1: Math.max(p.y1, p.y2) }));
  boxes.push({
    x0: Math.min(...corners.map(c => c.x)), x1: Math.max(...corners.map(c => c.x)),
    y0: Math.min(...corners.map(c => c.y)), y1: Math.max(...corners.map(c => c.y))
  });
  return { pieces, head: corners, boxes };
}

// How long each piece of a shaft is. The shaft is cut up because every collision check works on
// bounding rectangles, and one diagonal line claims its whole rectangle: see svg.js.
export const SHAFT_SEG = 14;

export function shaftPieces(len, head) {
  return Math.max(1, Math.ceil((len - head) / SHAFT_SEG));
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------------------------------------------------------------------------------------------
// THE PIVOT, AND THE TORQUE ARCS
//
// A torque is drawn as an arc of fixed angular sweep whose RADIUS carries the magnitude, so a bigger
// torque really is a bigger mark. It cannot start at zero radius or a small torque would be
// invisible, so the scale has an offset -- which is why this is NOT the force scale, and the figure
// never invites you to compare an arc with an arrow. A torque of exactly zero draws no arc at all
// and is said in words instead.
// ---------------------------------------------------------------------------------------------
export const TORQUE_R0 = 8;          // radius at a vanishingly small torque
export const TORQUE_R_MAX = 33;      // and at the largest one the figure can be made to show
export const TORQUE_SWEEP = 250;     // degrees of arc: short of a full turn, so the sense is visible
export const TORQUE_START = -35;     // where the arc begins, measured CCW from +x
export const TORQUE_W = 3.2;         // how thick the arc is drawn

// WHY 33 IS THE CEILING. The arcs are centred on the points the forces act at, and in the free-body
// diagram C and D are CD * FOOT_U = 78 units apart -- the closest pair. Two arcs of radius 39 would
// touch there, so 33 leaves them a clear gap at the very largest torque and everything else is
// smaller. MEASURED, not guessed: see the TORQUE_MAX test in test/physics.test.js.

// The largest torque the figure can be made to show: the hardest force in the table, about the
// furthest corner of the band a pivot may be dropped in. MEASURED at 4564 lb ft, and a corner
// really is the worst case -- a moment is linear in the pivot, so over a rectangle its extreme is
// always at one. Pinned by a test that sweeps the grid against every corner and fails BOTH ways:
// if anything exceeds this, and if this sits far above the real worst, which would leave every arc
// on the page smaller than it should be.
export const TORQUE_MAX = 4700;

export function torqueScale() {
  return (TORQUE_R_MAX - TORQUE_R0) / TORQUE_MAX;
}

export function torqueRadius(mag) {
  return TORQUE_R0 + Math.min(mag, TORQUE_MAX) * torqueScale();
}

// A torque's arc, as the separate short segments it is really drawn from, plus the three corners of
// its arrowhead. Cut up for the same reason an arrow's shaft is: a long curve claims its whole
// bounding rectangle, and these sit right where the labels want to be. A torque of zero draws
// nothing -- the figure says so in words instead.
export function torqueArc(centre, turn, segLen = SHAFT_SEG, head = 11) {
  const mag = Math.abs(turn);
  if (!(mag > 0)) return { segments: [], head: null, boxes: [], r: 0 };
  const r = torqueRadius(mag);
  const dir = turn > 0 ? 1 : -1;
  const sweep = TORQUE_SWEEP * Math.PI / 180;
  const start = TORQUE_START * Math.PI / 180;
  // screen y runs DOWN, so a counterclockwise turn on the page is a DECREASING screen angle
  const at = (t) => ({ x: centre.x + r * Math.cos(start + dir * t), y: centre.y - r * Math.sin(start + dir * t) });
  const n = Math.max(3, Math.ceil(r * sweep / segLen));
  const segments = [];
  for (let i = 0; i < n; i++) {
    const a = at(sweep * i / n), b = at(sweep * (i + 1) / n);
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  // the head sits at the far end, pointing along the arc
  const tip = at(sweep);
  const back = at(sweep - head / r);
  const ux = tip.x - back.x, uy = tip.y - back.y;
  const len = Math.hypot(ux, uy) || 1;
  const nx = -uy / len, ny = ux / len;
  const half = head * 0.42;
  const corners = [
    { x: back.x + nx * half, y: back.y + ny * half },
    tip,
    { x: back.x - nx * half, y: back.y - ny * half }
  ];
  const boxes = segments.map(p => ({
    x0: Math.min(p.x1, p.x2), x1: Math.max(p.x1, p.x2), y0: Math.min(p.y1, p.y2), y1: Math.max(p.y1, p.y2)
  }));
  boxes.push({
    x0: Math.min(...corners.map(c => c.x)), x1: Math.max(...corners.map(c => c.x)),
    y0: Math.min(...corners.map(c => c.y)), y1: Math.max(...corners.map(c => c.y))
  });
  return { segments, head: corners, boxes, r };
}


// Where a torque's label goes: outside its own arc, clear of the arrowhead, which sticks out past
// the radius the arc is drawn on.
export const TORQUE_LABEL_GAP = 20;

export function torqueLabelSpot(centre, r, above = true) {
  return { x: centre.x, y: centre.y + (above ? -(r + TORQUE_LABEL_GAP) : r + TORQUE_LABEL_GAP + 14), anchor: 'middle' };
}

// ---- picking a pivot -------------------------------------------------------------------------
// The two left panels are the pickable ones, and a point in either means the same point on the
// beam: both draw the beam at FOOT_U units per foot, so the only difference is where A sits.
export const PICK_PANELS = ['space', 'ext'];
export const PIVOT_DOT_R = 6;        // the dot that marks the pivot, drawn on BOTH left panels

// A pivot in feet (y up from the top of the beam) placed in a panel, and the inverse.
export function pivotAt(p, panel) {
  return { x: panel.baseX + p.x * FOOT_U, y: panel.baseY - p.y * FOOT_U };
}

export function pivotFromPoint(pt, panel) {
  return { x: (pt.x - panel.baseX) / FOOT_U, y: (panel.baseY - pt.y) / FOOT_U };
}

// Which left panel a point in viewBox units is inside, or null for anywhere else. The dot has to
// stay drawable in BOTH panels, so a point is only pickable where it lands inside both of them.
export function panelOfPoint(pt) {
  for (const name of PICK_PANELS) {
    const b = PANELS[name].box;
    if (pt.x >= b.x0 && pt.x <= b.x1 && pt.y >= b.y0 && pt.y <= b.y1) return name;
  }
  return null;
}

// The feet a pivot may take: the region that is inside BOTH left panels once drawn, with room for
// the dot. Anywhere else and the pivot would show on one diagram and not the other, which is the
// one thing the dot is there to avoid.
// The band is each panel's own, in viewBox units: the part of it a dot may sit in without landing
// on that panel's headings or on the room its labels need.
export function panelBand(P) {
  const m = PIVOT_DOT_R + 2;
  return { x0: P.box.x0 + m, x1: P.box.x1 - m, y0: P.band.y0 + m, y1: P.band.y1 - m };
}

export function pivotBounds() {
  let x0 = -Infinity, x1 = Infinity, y0 = -Infinity, y1 = Infinity;
  for (const name of PICK_PANELS) {
    const P = PANELS[name], b = panelBand(P);
    x0 = Math.max(x0, (b.x0 - P.baseX) / FOOT_U);
    x1 = Math.min(x1, (b.x1 - P.baseX) / FOOT_U);
    y0 = Math.max(y0, (P.baseY - b.y1) / FOOT_U);
    y1 = Math.min(y1, (P.baseY - b.y0) / FOOT_U);
  }
  return { x0, x1, y0, y1 };
}

// That same region drawn back into one panel, which is what the figure outlines while the picker is
// armed: the student can see where a click will land before making one.
// Where the pivot's letter goes: beside the dot, on whichever side of it the panel has room on.
// A dot at the band's top-right corner is the case that forces this -- put its letter up and to the
// right as usual and it lands off the panel, and the solver then drags it back across the figure
// into whatever is nearest, which in the free-body diagram is that panel's own captions.
export const PIVOT_LABEL_GAP = 6;

export function pivotLabelSpot(at, P) {
  const right = at.x > P.box.x1 - 120;
  const high = at.y < P.band.y0 + 44;
  return {
    x: at.x + (right ? -(PIVOT_DOT_R + PIVOT_LABEL_GAP) : PIVOT_DOT_R + PIVOT_LABEL_GAP),
    y: at.y + (high ? PIVOT_DOT_R + 20 : -(PIVOT_DOT_R + 2)),
    anchor: right ? 'end' : 'start'
  };
}

export function pivotRegionIn(P) {
  const b = pivotBounds();
  const a = pivotAt({ x: b.x0, y: b.y1 }, P), c = pivotAt({ x: b.x1, y: b.y0 }, P);
  return { x: a.x, y: a.y, width: c.x - a.x, height: c.y - a.y };
}

export function clampPivot(p) {
  if (!p) return null;
  const b = pivotBounds();
  return { x: Math.max(b.x0, Math.min(b.x1, p.x)), y: Math.max(b.y0, Math.min(b.y1, p.y)) };
}

// The torque arcs of state s, one per force, centred where that force acts. `turn` is the signed
// torque, so the arc turns the way the torque does.
export function torqueArcs(s, panel) {
  const at = { load: X_D, cableB: X_B, cableC: X_C, pin: 0 };
  return torqueList(s).map(q => ({
    ...q,
    centre: { x: panel.baseX + at[q.key] * FOOT_U, y: panel.baseY },
    cls: { load: 'load', cableB: 'cable', cableC: 'cable', pin: 'pin' }[q.key]
  }));
}
