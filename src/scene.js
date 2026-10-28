import { fmt, fmtFixed, segPlain } from './format.js';
import { unitText, fieldByKey, snapAt } from './fields.js';
import { el, clear, text, arrow, torqueArrow, hatch, COLORS } from './svg.js';
import { derive, cosDeg, sinDeg, turnOf, pivotName, letteredAt, torqueList,
         FORCE_DP, ANGLE_DP, TORQUE_DP, FORCE_SUB, SQ5, AB, BC, CD } from './physics.js';
import { TEXT, SUB, HEAD_MAX, HANDLE_R, FORCE_U, FOOT_U, WALL_REACH, CEIL_REACH,
         PANELS, SPLITS, PLACE_NAME_SHIFT, beamPoints, atFoot, pulleyGeom, cableSegments,
         slopeTriangle, SLOPE_RISE, SLOPE_RUN, massOutline, loadArrow, handleRest, fbdArrows, forceList,
         polygonVertices, fitPolygon, labelSpot, polygonLabelSpots, placeLabels,
         shaftPieces, pivotAt, torqueArcs, torqueRadius, torqueLabelSpot,
         PIVOT_DOT_R, TORQUE_W, PICK_PANELS, pivotRegionIn, pivotLabelSpot } from './layout.js';

// The figure. One svg, four panels, redrawn from the stored inputs on every change. Every graphic is
// a TOP-LEVEL element with class `g` and every label a TOP-LEVEL `text.t`, because that is all the
// browser harness can measure.
//
// NOTATION (the Wiki_Vault reference): the force the student sets is F_D; the pin's reaction is F_A;
// the cable's pull on the beam takes both letters of the segment it acts along, F_BE at B and F_CE
// at C. The two cable forces are DRAWN IN THE SAME COLOUR because they are one cable with one
// tension, which is the fact the whole problem turns on. Every vector carries a drawn arrow over its
// letter.

// 'F' with a DRAWN arrow over it (the Unicode combining arrow does not render: see svg.js), then the
// subscript as a lowered tspan. The subscripts come from physics.js, one source of truth.
const FORCE_SYM = {
  load: ['F', FORCE_SUB.load], cableB: ['F', FORCE_SUB.cableB],
  cableC: ['F', FORCE_SUB.cableC], pin: ['F', FORCE_SUB.pin]
};
const symbolSegs = ([letter, sub]) => [{ t: letter, vec: true }, { t: sub, sub: true }];

const COLOR_OF = { load: COLORS.load, cable: COLORS.cable, pin: COLORS.pin };
const SHAFT = 4.2;
const DIM_DP = 0;
const DOWN = snapAt(fieldByKey('dir'));          // the direction the hanging weight pulls: 270 degrees

// What the figure says when the equations ask the cable to push. Exported so the layout tests can
// feed the real line to the label solver instead of a stand-in of a different length.
export const SLACK_NOTE = 'the cable would have to PUSH here: it goes slack';

// How far under a heading its caption sits, and the second caption under the first. TWENTY-FOUR,
// not the twenty that was enough at the smaller caption size: a caption stands 0.96 of its own size
// above its baseline, so at SUB units 20 leaves it touching the heading's descender. Exported so the
// layout tests place the panel's own lines exactly where the figure does.
export const CAPTION_DY = 24;

// The length of an arrow's FIRST shaft piece, which is the `line` the browser harness measures (a
// shaft is drawn in short collinear pieces: see svg.js). One formula, shared with the tracks below.
export function firstPiece(mag) {
  const len = mag * FORCE_U;
  if (!(len > 0)) return 0;
  const head = Math.min(HEAD_MAX, len * 0.55);
  return (len - head) / shaftPieces(len, head);
}

// What the browser harness must find painted where, for each state. The harness keeps its OWN copy
// of this table, written from the equations rather than from this file, and test/harness.test.js
// fails if the two ever disagree on any state of the grid. `want` returns null when the element must
// be ABSENT -- which is how the "the cable carries nothing" case gets pinned down.
export const SCENE_TRACKS = [
  { sel: 'circle.load-handle', measure: 'cx',
    want: (s) => beamPoints(PANELS.space.baseY, PANELS.space.baseX).D.x + s.f * cosDeg(s.dir) * FORCE_U },
  { sel: 'circle.load-handle', measure: 'cy',
    want: (s) => (s.f === 0 ? handleRest().y : PANELS.space.baseY - s.f * sinDeg(s.dir) * FORCE_U) },
  // The vertical run of cable: its arrow is straight up or straight down, so its first piece is as
  // tall as the piece is long.
  { sel: 'line.shaft.pt.cableB', measure: 'height',
    want: (s) => (derive(s).magBE === 0 ? null : firstPiece(derive(s).magBE)) },
  // The inclined run: one across for every two up, so its first piece is 1/sqrt5 of its length wide.
  { sel: 'line.shaft.pt.cableC', measure: 'width',
    want: (s) => (derive(s).magCE === 0 ? null : firstPiece(derive(s).magCE) / SQ5) },
  // The pivot's dot, in the SITUATION diagram, which is the first of the two the figure draws.
  // `null` when no pivot is picked: that is how the absent case gets pinned down too.
  { sel: 'circle.pivot', measure: 'cx',
    want: (s) => (s.pivot ? pivotAt(s.pivot, PANELS.space).x : null) },
  { sel: 'circle.pivot', measure: 'cy',
    want: (s) => (s.pivot ? pivotAt(s.pivot, PANELS.space).y : null) }
];

// A force's label: its vector name, then its magnitude in pounds.
export function forceLabel(key, mag) {
  return [...symbolSegs(FORCE_SYM[key]), { t: ' ' + unitText(fmt(mag, FORCE_DP), 'lb') }];
}

// The same force, NAMED ONLY. The free-body diagram prints these once a pivot is picked: the
// numbers there become the torques, and four forces and four torques with a number each is more
// than that panel can hold or a reader can take in at once. The magnitudes are still on the page --
// the point diagram beside it carries every one of them.
export function forceName(key) {
  return symbolSegs(FORCE_SYM[key]);
}

// A torque's label: M with the arrow a vector carries, its subscript -- the PIVOT's letter first,
// then the force's own -- and the value in pound feet.
export function torqueLabel(sub, mag) {
  return [{ t: 'M', vec: true }, { t: sub, sub: true }, { t: ' ' + unitText(fmt(mag, TORQUE_DP), 'lb·ft') }];
}

// The direction of the force at D, as the figure prints it.
export function angleLabel(dir) {
  return [{ t: 'θ' }, { t: ' ' + unitText(fmtFixed(dir, ANGLE_DP), '°') }];
}

// What a screen reader says the handle is set to. role="slider" with no value reads as an empty
// control, and this is the one thing on the page a reader cannot see for themselves.
export function handleValueText(s) {
  const at = s.dir === DOWN ? ', straight down' : '';
  return `${unitText(fmtFixed(s.f, 0), 'pounds')} at ${unitText(fmtFixed(s.dir, ANGLE_DP), 'degrees')}${at}`;
}

// A length in feet, as the figure prints it.
export function footLabel(ft) {
  return unitText(fmtFixed(ft, DIM_DP), 'ft');
}

// The dot that marks the pivot, drawn identically in BOTH left panels so the two diagrams agree
// about where the point is. While the picker is armed the panel it can be dropped in says so.
function pivotDot(svg, sh, s, P, nameIt = true) {
  if (!s.pivot) return;
  const at = pivotAt(s.pivot, P);
  el('circle', { class: 'g pivot-halo', cx: at.x, cy: at.y, r: PIVOT_DOT_R + 3, fill: '#ffffff' }, svg);
  el('circle', { class: 'g pivot', cx: at.x, cy: at.y, r: PIVOT_DOT_R, fill: COLORS.pivot,
    stroke: '#ffffff', 'stroke-width': 2 }, svg);
  sh.block(boxOf(at.x - PIVOT_DOT_R - 3, at.y - PIVOT_DOT_R - 3, at.x + PIVOT_DOT_R + 3, at.y + PIVOT_DOT_R + 3));
  // Named only where the figure does not already say the letter. In the situation diagram A to E
  // are drawn beside their points, and a purple A next to a black A says nothing twice; an
  // unlettered pivot is F, which nothing else on that diagram names.
  if (nameIt || !letteredAt(s.pivot)) {
    sh.moving(pivotName(s.pivot), pivotLabelSpot(at, P), COLORS.pivot, { weight: 700, maxShift: PLACE_NAME_SHIFT });
  }
}

// While the picker is armed, the two panels a pivot may be dropped in are outlined, so it is never
// a guess which half of the figure is listening.
function pickHint(svg, s, P) {
  if (!s.picking) return;
  // The BAND, not the whole panel: a click outside it is pulled to its edge, and a student should be
  // able to see that coming rather than discover it.
  const r = pivotRegionIn(P);
  el('rect', { class: 'g picking', x: r.x, y: r.y, width: r.width, height: r.height,
    fill: 'none', stroke: COLORS.pivot, 'stroke-width': 2, 'stroke-dasharray': '8 6', rx: 6 }, svg);
}

const boxOf = (x0, y0, x1, y1) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) });
const circleBox = (c, r) => boxOf(c.x - r, c.y - r, c.x + r, c.y + r);

// A panel collects, as it draws: the boxes a label must keep off (`obs`) and the labels themselves.
// A pinned item is a text that will not move but still pushes the others away.
function sheet(svg, panel) {
  const obs = [], items = [], draws = [];
  return {
    obs, items,
    block(...boxes) { obs.push(...boxes); },
    fixed(x, y, segs, opts = {}) {
      text(svg, x, y, segs, { size: opts.size || TEXT, sub: SUB, ...opts });
      items.push({ spot: { x, y, anchor: opts.anchor || 'start' }, chars: segPlain(segs).length,
        size: opts.size || TEXT, pinned: true });
    },
    moving(segs, spot, fill, opts = {}) {
      items.push({ spot, chars: segPlain(segs).length, size: opts.size || TEXT, pinned: false, maxShift: opts.maxShift });
      draws.push({ segs, fill, at: items.length - 1, weight: opts.weight || 600, size: opts.size || TEXT });
    },
    settle() {
      const placed = placeLabels(items, obs, panel.box);
      for (const d of draws) {
        const p = placed[d.at];
        text(svg, p.x, p.y, d.segs, { size: d.size, sub: SUB, anchor: p.anchor, fill: d.fill, weight: d.weight });
      }
    }
  };
}

function heading(sh, x, y, str) { sh.fixed(x, y, str, { weight: 700, halo: false }); }
function caption(sh, x, y, str, fill = COLORS.faint, anchor = 'start') { sh.fixed(x, y, str, { size: SUB, fill, anchor, halo: false }); }

function rules(svg) {
  const line = (a) => el('line', { class: 'g sep', x1: a.x0 !== undefined ? a.x0 : a.x, y1: a.y0 !== undefined ? a.y0 : a.y,
    x2: a.x1 !== undefined ? a.x1 : a.x, y2: a.y1 !== undefined ? a.y1 : a.y, stroke: '#dde4ec', 'stroke-width': 2 }, svg);
  line(SPLITS.across); line(SPLITS.upper); line(SPLITS.lower);
}

function dimension(svg, sh, x0, x1, y, labelY, feet) {
  const g = el('g', { class: 'g dim' }, svg);
  el('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: COLORS.dim, 'stroke-width': 1.6 }, g);
  for (const x of [x0, x1]) el('line', { x1: x, y1: y - 6, x2: x, y2: y + 6, stroke: COLORS.dim, 'stroke-width': 1.6 }, g);
  sh.block(boxOf(x0, y - 6, x1, y + 6));
  // BELOW the line, not above it: above it is where the hanging weight is drawn and where a force at
  // D swung downwards reaches, and a dimension label is PINNED, so it cannot get out of the way.
  // The gap to the line is set from the MEASURED text box, not from the font size: at 21 units a
  // label reaches about 17 above its baseline once the white halo is counted, and the first run of
  // the browser harness found all three labels sitting on their own dimension lines.
  sh.fixed((x0 + x1) / 2, labelY, footLabel(feet), { anchor: 'middle', fill: COLORS.dim });
}

function beamRect(svg, sh, p) {
  el('rect', { class: 'g beam', x: p.A.x, y: p.A.y - 8, width: p.D.x - p.A.x, height: 16, rx: 3,
    fill: COLORS.beam, stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
  sh.block(boxOf(p.A.x, p.A.y - 8, p.D.x, p.A.y + 8));
}

// The pin in the wall at A: the wall face, its hatching and the joint circle.
function pinSupport(svg, sh, p) {
  const x = p.A.x - 12;
  el('line', { class: 'g wallface', x1: x, y1: p.A.y - WALL_REACH, x2: x, y2: p.A.y + WALL_REACH,
    stroke: COLORS.ink, 'stroke-width': 3 }, svg);
  hatch(svg, { x, y: p.A.y - WALL_REACH + 2 }, { x, y: p.A.y + WALL_REACH - 2 }, -1, -1, 7, 11, COLORS.wall);
  el('path', { class: 'g pinplate', d: `M${x} ${p.A.y - 17} L${p.A.x} ${p.A.y} L${x} ${p.A.y + 17} Z`,
    fill: COLORS.wall, stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
  el('circle', { class: 'g pc', cx: p.A.x, cy: p.A.y, r: 5.5, fill: '#ffffff', stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
  sh.block(boxOf(x - 12, p.A.y - WALL_REACH, p.A.x + 6, p.A.y + WALL_REACH));
}

// ---- panel 1: the situation (upper left) --------------------------------------------------------
function drawSpace(svg, s) {
  const P = PANELS.space;
  const sh = sheet(svg, P);
  const p = beamPoints(P.baseY, P.baseX);
  const d = derive(s);
  heading(sh, P.headX, P.headY, 'The situation');
  caption(sh, P.headX, P.headY + CAPTION_DY, s.picking ? 'click a point' : 'drag the arrowhead');
  pickHint(svg, s, P);

  // the ceiling the pulley hangs from, and the pulley itself
  const g = pulleyGeom();
  const pc = atFoot(g.centre, P.baseY, P.baseX);
  const wheelR = g.r * FOOT_U;
  const ceilY = pc.y - wheelR - 18;
  el('line', { class: 'g ceiling', x1: pc.x - CEIL_REACH, y1: ceilY, x2: pc.x + CEIL_REACH, y2: ceilY,
    stroke: COLORS.ink, 'stroke-width': 3 }, svg);
  hatch(svg, { x: pc.x - CEIL_REACH + 2, y: ceilY }, { x: pc.x + CEIL_REACH - 2, y: ceilY }, 1, -1, 7, 11, COLORS.wall);
  el('line', { class: 'g mount', x1: pc.x, y1: ceilY, x2: pc.x, y2: pc.y, stroke: COLORS.ink, 'stroke-width': 2.4 }, svg);
  sh.block(boxOf(pc.x - CEIL_REACH, ceilY - 12, pc.x + CEIL_REACH, pc.y));
  el('circle', { class: 'g wheel', cx: pc.x, cy: pc.y, r: wheelR * 0.9, fill: '#e8edf2', stroke: COLORS.ink, 'stroke-width': 2 }, svg);
  el('circle', { class: 'g hub', cx: pc.x, cy: pc.y, r: wheelR * 0.26, fill: '#ffffff', stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
  sh.block(circleBox(pc, wheelR));

  pinSupport(svg, sh, p);
  beamRect(svg, sh, p);

  // the cable, in the short pieces it is really drawn from (see layout.js)
  for (const c of cableSegments(P.baseY, P.baseX)) {
    el('line', { class: 'g cable', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2,
      stroke: COLORS.cable, 'stroke-width': 3.4, 'stroke-linecap': 'round' }, svg);
    sh.block(boxOf(c.x1, c.y1, c.x2, c.y2));
  }
  // the eyes the cable is tied to
  for (const q of [p.B, p.C]) {
    el('circle', { class: 'g eye', cx: q.x, cy: q.y - 8, r: 4, fill: '#ffffff', stroke: COLORS.cable, 'stroke-width': 2.2 }, svg);
    sh.block(circleBox({ x: q.x, y: q.y - 8 }, 4));
  }

  // the slope triangle: its hypotenuse IS the cable, so the 2 and the 1 cannot lie about the line
  const tri = slopeTriangle(P.baseY, P.baseX);
  for (const [a, b] of [[tri.top, tri.foot], [tri.foot, tri.right]]) {
    el('line', { class: 'g slope', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: COLORS.dim, 'stroke-width': 1.6 }, svg);
    sh.block(boxOf(a.x, a.y, b.x, b.y));
  }
  sh.moving(footLabel(SLOPE_RISE), { x: tri.riseLabel.x, y: tri.riseLabel.y, anchor: 'end' }, COLORS.dim,
    { size: SUB, weight: 400, maxShift: PLACE_NAME_SHIFT });
  sh.moving(footLabel(SLOPE_RUN), { x: tri.runLabel.x, y: tri.runLabel.y, anchor: 'middle' }, COLORS.dim,
    { size: SUB, weight: 400, maxShift: PLACE_NAME_SHIFT });

  // THE HANGING WEIGHT, LEFT IN OUTLINE. It is where the force at D started life, and the direction
  // the force snaps to. When the force IS straight down the outline fills in and its stroke goes
  // solid, so the snap can be seen and not only felt.
  const m = massOutline(P.baseY, P.baseX);
  const onDown = s.dir === DOWN && s.f > 0;
  el('line', { class: 'g hanger', x1: m.hook.x, y1: m.hook.y, x2: m.top.x, y2: m.top.y,
    stroke: onDown ? COLORS.load : COLORS.faint, 'stroke-width': 2,
    'stroke-dasharray': onDown ? null : '5 4' }, svg);
  el('rect', { class: `g mass${onDown ? ' on' : ''}`, x: m.body.x, y: m.body.y, width: m.body.w, height: m.body.h,
    rx: m.body.rx, fill: onDown ? '#fdeaea' : 'none', stroke: onDown ? COLORS.load : COLORS.faint,
    'stroke-width': onDown ? 2.4 : 2, 'stroke-dasharray': onDown ? null : '5 4' }, svg);
  sh.block(m.box);

  // the dimensions, below the weight so nothing has to share a line with it
  for (const q of [p.A, p.B, p.C, p.D]) {
    const from = q === p.D ? m.box.y1 + 6 : P.baseY + 14;
    el('line', { class: 'g ext', x1: q.x, y1: from, x2: q.x, y2: P.dimY + 8, stroke: COLORS.faint,
      'stroke-width': 1.2, 'stroke-dasharray': '5 5' }, svg);
  }
  dimension(svg, sh, p.A.x, p.B.x, P.dimY, P.dimLabelY, AB);
  dimension(svg, sh, p.B.x, p.C.x, P.dimY, P.dimLabelY, BC);
  dimension(svg, sh, p.C.x, p.D.x, P.dimY, P.dimLabelY, CD);

  // the force at D: tail on the beam, tip at the handle
  const a = loadArrow(s, P.baseY, P.baseX);
  if (a) {
    sh.block(...arrow(svg, a.tail, a.tip, COLORS.load, 4.6, 'space load', HEAD_MAX));
    // The arrow sweeps a full circle about D and reaches most of the panel, so its label does not
    // follow it: it sits in the panel's top right corner, always in the same place and always legible.
    sh.fixed(P.box.x1 - 8, P.headY, forceLabel('load', d.magD), { anchor: 'end', fill: COLORS.load, weight: 600 });
    // 36 units below the magnitude, not the 26 that looked like enough: measured in Chromium, a
    // label carrying a drawn vector bar AND a subscript stands 20 units above its baseline and 10
    // below, so two of them 26 apart overlap by four. The browser harness is what said so.
    sh.fixed(P.box.x1 - 8, P.headY + 36, angleLabel(s.dir), { anchor: 'end', fill: COLORS.load, weight: 600 });
  }
  const h = a ? a.tip : handleRest(P.baseY, P.baseX);
  el('circle', { class: 'g handle load-handle', cx: h.x, cy: h.y, r: HANDLE_R, fill: '#ffffff', stroke: COLORS.load,
    'stroke-width': 3.2, tabindex: 0, role: 'slider', 'aria-label': 'Force at D: drag it, or use the arrow keys',
    'aria-valuetext': handleValueText(s) }, svg);
  sh.block(circleBox(h, HANDLE_R + 2));

  pivotDot(svg, sh, s, P, false);   // the situation diagram letters its own points

  // point names
  const name = (x, y, t, anchor) => sh.moving(t, { x, y, anchor }, COLORS.ink, { weight: 700, maxShift: PLACE_NAME_SHIFT });
  name(p.A.x + 6, P.baseY - 20, 'A', 'start');
  name(p.B.x - 8, P.baseY - 20, 'B', 'end');
  name(p.C.x + 10, P.baseY - 20, 'C', 'start');
  name(p.D.x + 14, P.baseY - 16, 'D', 'start');
  name(pc.x - wheelR - 8, pc.y + 6, 'E', 'end');
  sh.settle();
}

// ---- the free-body arrows, shared by panels 2 and 3 ---------------------------------------------
// `label` says what each arrow gets: its name and number, its name alone, or nothing. The free-body
// diagram takes NOTHING once a pivot is picked -- see drawExtended.
function drawFbdArrows(svg, sh, arrows, cls, label = 'full') {
  for (const a of arrows) sh.block(...arrow(svg, a.tail, a.tip, COLOR_OF[a.cls], SHAFT, `${cls} ${a.key}`, HEAD_MAX));
  if (label === 'none') return;
  for (const a of arrows) {
    sh.moving(label === 'full' ? forceLabel(a.key, a.mag) : forceName(a.key), labelSpot(a.tail, a.tip), COLOR_OF[a.cls]);
  }
}

// ---- panel 2: the beam as a single point (upper right) ------------------------------------------
function drawPoint(svg, s) {
  const P = PANELS.point;
  const sh = sheet(svg, P);
  const o = { x: P.ox, y: P.oy };
  heading(sh, P.headX, P.headY, 'The beam as a single point');
  // Said plainly, because it is the one thing this panel can mislead about: shrinking the beam to a
  // point keeps the forces and throws away where they act, and where they act is the whole of the
  // moment equation -- which is the only equation that knows about the tension.
  caption(sh, P.headX, P.headY + CAPTION_DY, 'the forces only, not where they act');
  el('circle', { class: 'g dot origin', cx: o.x, cy: o.y, r: 7, fill: COLORS.ink }, svg);
  sh.block(circleBox(o, 7));
  drawFbdArrows(svg, sh, fbdArrows(s, o, false), 'pt');   // numbers kept here: this is where they live now
  sh.settle();
}

// ---- panel 3: the free-body diagram of the beam (lower left) ------------------------------------
function drawExtended(svg, s) {
  const P = PANELS.ext;
  const sh = sheet(svg, P);
  const p = beamPoints(P.baseY, P.baseX);
  const d = derive(s);
  const torques = torqueArcs(s, P);          // the same torques, each with where its arc is centred
  const name = s.pivot ? pivotName(s.pivot) : null;
  heading(sh, P.headX, P.headY, 'Free-body diagram of the beam');
  // With a pivot picked the panel changes what it is ABOUT: not what each force is, but what each
  // force does around that point. The fact worth carrying then is the one that makes the picture
  // worth drawing -- the four torques sum to zero about whatever point you pick, which is the same
  // fact as the force polygon closing.
  caption(sh, P.headX, P.headY + CAPTION_DY, s.pivot
    ? `torques about ${name}: whatever point you pick, they sum to zero`
    : 'one cable over a frictionless pulley, so both pulls are the same size');
  if (d.slack) {
    caption(sh, P.box.x1 - 8, P.headY + 2 * CAPTION_DY, SLACK_NOTE, COLORS.load, 'end');
  }
  pickHint(svg, s, P);
  beamRect(svg, sh, p);
  for (const q of [p.A, p.B, p.C, p.D]) {
    el('circle', { class: 'g dot', cx: q.x, cy: q.y, r: 4.5, fill: COLORS.ink }, svg);
    sh.block(circleBox(q, 4.5));
  }

  // ONCE A PIVOT IS PICKED THIS PANEL IS ABOUT TORQUES, and the force arrows give up their labels
  // altogether. Every one of them is still named and numbered in the point diagram beside it, and
  // each torque's own label names the force it came from -- the BE of M_FBE is the F_BE that made
  // it, under that force's own arc and in that force's own colour. Eight labels and nine graphics
  // in one panel is more than it can hold: the label solver was pushing force names up into the
  // panel's own captions to find room.
  drawFbdArrows(svg, sh, fbdArrows(s, p.A, true), 'ext', s.pivot ? 'none' : 'full');

  // One arc per force, centred where that force acts, turning the way its torque turns and as big
  // as the torque is. A torque of exactly zero draws nothing and is said in words below instead.
  for (const q of torques) {
    if (q.mag === 0) continue;
    sh.block(...torqueArrow(svg, q.centre, q.value, COLOR_OF[q.cls], TORQUE_W, `ext torque ${q.key}`));
    sh.moving(torqueLabel(q.sub, q.mag), torqueLabelSpot(q.centre, torqueRadius(q.mag), false), COLOR_OF[q.cls]);
  }

  // Anything that comes out exactly zero is SAID, not left out: a missing arrow and a zero are the
  // same picture otherwise, and which of these vanishes is the point of the whole simulation. With
  // a pivot picked, a torque of zero is the sharpest thing on the page -- it means the force acts
  // straight through the point, or acts at it.
  const zeroAt = { load: p.D, cableB: p.B, cableC: p.C, pin: p.A };
  if (!s.pivot) {
    for (const f of forceList(s)) {
      if (f.mag !== 0) continue;
      sh.moving(forceLabel(f.key, 0), { x: zeroAt[f.key].x, y: p.A.y + 44, anchor: 'middle' }, COLORS.faint, { weight: 400 });
    }
  }
  for (const q of torques) {
    if (q.mag !== 0) continue;
    sh.moving(torqueLabel(q.sub, 0), { x: zeroAt[q.key].x, y: p.A.y + 68, anchor: 'middle' }, COLORS.faint, { weight: 400 });
  }
  pivotDot(svg, sh, s, P);
  sh.settle();
}

// ---- panel 4: the four forces tip to tail (lower right) -----------------------------------------
function drawPolygon(svg, s) {
  const P = PANELS.poly;
  const sh = sheet(svg, P);
  const d = derive(s);
  heading(sh, P.headX, P.headY, 'The forces tip to tail');
  caption(sh, P.headX, P.headY + CAPTION_DY, 'in equilibrium the chain closes');
  if (d.magD === 0) {
    // Anchored at the panel's left edge, not centred: centred, a line this long runs off the figure.
    sh.fixed(P.x0, (P.y0 + P.y1) / 2, 'No force at D: nothing to balance.',
      { size: SUB, anchor: 'start', fill: COLORS.faint, italic: true });
    sh.settle();
    return;
  }
  const verts = polygonVertices(s);
  const fit = fitPolygon(verts, P);
  const order = ['load', 'cableB', 'cableC', 'pin'];
  const list = forceList(s);
  const drawn = [];
  for (let i = 0; i < order.length; i++) {
    const from = fit.map(verts[i]), to = fit.map(verts[i + 1]);
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-6) continue;    // a force of zero adds no side
    sh.block(...arrow(svg, from, to, COLOR_OF[list[i].cls], SHAFT, `poly ${order[i]}`, HEAD_MAX));
    drawn.push({ key: order[i], cls: list[i].cls, mag: list[i].mag, from, to });
  }
  const barN = 100, bar = barN * fit.scale;
  const by = P.y1 + 8;
  el('line', { class: 'g scalebar', x1: P.x0, y1: by, x2: P.x0 + bar, y2: by, stroke: COLORS.faint, 'stroke-width': 3 }, svg);
  sh.block(boxOf(P.x0, by - 2, P.x0 + bar, by + 2));
  sh.fixed(P.x0 + bar + 7, by + 6, unitText(fmt(barN, 0), 'lb'), { size: SUB, anchor: 'start', fill: COLORS.faint });

  const spots = polygonLabelSpots(drawn);
  drawn.forEach((sd, i) => sh.moving(forceLabel(sd.key, sd.mag), spots[i], COLOR_OF[sd.cls]));
  sh.settle();
}

export function createScene(svg) {
  return {
    render(s) {
      clear(svg);
      rules(svg);
      drawSpace(svg, s);
      drawPoint(svg, s);
      drawExtended(svg, s);
      drawPolygon(svg, s);
    }
  };
}

export { segPlain };
