import test from 'node:test';
import assert from 'node:assert/strict';
import { VB, FORCE_U, FOOT_U, TEXT, SUB, PANELS, SPLITS, LABEL_CHAR_W, SHAFT_SEG, HANDLE_R,
         PLACE_MAX_SHIFT, PLACE_TEXT_GAP, LABEL_LIFT, SLOPE_C,
         beamPoints, atFoot, screenDelta, forceList, pulleyGeom, cableSegments, slopeTriangle,
         massOutline, loadArrow, loadFromHandle, handleRest, fbdArrows, polygonVertices, fitPolygon,
         labelSpot, polygonLabelSpots, placeLabels, labelBox, boxesHit, arrowGeometry, shaftPieces,
         dist, TORQUE_R0, TORQUE_R_MAX, TORQUE_MAX, TORQUE_SWEEP, PIVOT_DOT_R, PLACE_NAME_SHIFT,
         torqueRadius, torqueArc, torqueArcs, torqueLabelSpot, pivotAt, pivotFromPoint, pivotBounds,
         panelOfPoint, clampPivot, pivotRegionIn, pivotLabelSpot } from '../src/layout.js';
import { derive, torqueList, pivotName, letteredPoints, X_B, X_C, X_D, H_E, PULLEY_R, SQ5, U_CE } from '../src/physics.js';
import { STATES, PIVOTS, PIVOT_STATES } from './grid.js';
import { forceLabel, forceName, torqueLabel, SLACK_NOTE, CAPTION_DY } from '../src/scene.js';
import { segPlain } from '../src/format.js';
import { snapPivot } from '../src/state.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const SPACE = PANELS.space;
const inBox = (p, box, slack = 0) =>
  p.x >= box.x0 - slack && p.x <= box.x1 + slack && p.y >= box.y0 - slack && p.y <= box.y1 + slack;

test('the beam is drawn to scale in both beam panels, at the same scale', () => {
  for (const P of [SPACE, PANELS.ext]) {
    const p = beamPoints(P.baseY, P.baseX);
    near(p.B.x - p.A.x, X_B * FOOT_U);
    near(p.C.x - p.A.x, X_C * FOOT_U);
    near(p.D.x - p.A.x, X_D * FOOT_U);
    assert.equal(p.A.y, P.baseY);
    assert.ok(p.A.x > P.box.x0 && p.D.x < P.box.x1, 'the beam itself must fit its panel');
  }
  assert.ok(beamPoints(SPACE.baseY, SPACE.baseX).D.x + 40 < SPLITS.upper.x,
    'the whole situation fits in the upper-left panel');
});

test('screenDelta flips y once, and only once, and scales by the one force scale', () => {
  assert.deepEqual(screenDelta({ x: 3, y: 4 }, 1), { x: 3, y: -4 });
  assert.deepEqual(screenDelta({ x: 4, y: -8 }), { x: 4 * FORCE_U, y: 8 * FORCE_U });
});

// ---- the pulley and the cable --------------------------------------------------------------------
test('the drawn wheel is tangent to BOTH runs of cable, which is what fixes where it sits', () => {
  const g = pulleyGeom();
  near(g.centre.x - X_B, PULLEY_R, 1e-12);                           // PULLEY_R right of the vertical run
  near(Math.abs(2 * g.centre.x + g.centre.y - SLOPE_C) / SQ5, PULLEY_R, 1e-12);   // and PULLEY_R from the inclined one
  assert.ok(g.centre.y < H_E, 'the wheel hangs BELOW the point the two lines cross');
  near(dist(g.centre, g.tanB), PULLEY_R, 1e-12);
  near(dist(g.centre, g.tanC), PULLEY_R, 1e-12);
  near(g.tanB.x, X_B, 1e-12, 'the vertical run leaves the wheel on the line it runs along');
  near(2 * g.tanC.x + g.tanC.y, SLOPE_C, 1e-9, 'and the inclined run leaves it on its own line');
  assert.deepEqual(g.apex, { x: X_B, y: H_E });
});

test('the cable runs B to the wheel to C, in pieces short enough that none claims a big rectangle', () => {
  const segs = cableSegments(SPACE.baseY, SPACE.baseX);
  const p = beamPoints(SPACE.baseY, SPACE.baseX);
  assert.ok(segs.length > 10);
  near(segs[0].x1, p.B.x, 1e-9);
  near(segs[0].y1, p.B.y, 1e-9);
  near(segs.at(-1).x2, p.C.x, 1e-9);
  near(segs.at(-1).y2, p.C.y, 1e-9);
  for (let i = 1; i < segs.length; i++) {     // the pieces join end to end: what is drawn is one cable
    near(segs[i].x1, segs[i - 1].x2, 1e-9);
    near(segs[i].y1, segs[i - 1].y2, 1e-9);
  }
  for (const c of segs) {
    assert.ok(Math.hypot(c.x2 - c.x1, c.y2 - c.y1) <= SHAFT_SEG + 1e-6, 'a piece of cable claims too much');
    assert.ok(inBox({ x: c.x1, y: c.y1 }, SPACE.box) && inBox({ x: c.x2, y: c.y2 }, SPACE.box),
      'the cable must stay on its panel');
  }
  // the first piece is straight up out of B, and the last arrives at C going down and to the right
  near(segs[0].x2, p.B.x, 1e-9);
  assert.ok(segs[0].y2 < p.B.y);
  assert.ok(segs.at(-1).x2 > segs.at(-1).x1 && segs.at(-1).y2 > segs.at(-1).y1);
});

test('the wheel, with its mount above it, stays clear of the top of the panel', () => {
  const g = pulleyGeom();
  const pc = atFoot(g.centre, SPACE.baseY, SPACE.baseX);
  const top = pc.y - g.r * FOOT_U;
  assert.ok(top > SPACE.box.y0 + 30, `the wheel's top is at ${top}, with no room for its ceiling above it`);
  assert.ok(pc.x > SPACE.box.x0 && pc.x < SPACE.box.x1);
});

test("the slope triangle's hypotenuse IS the cable, so the 2 and the 1 cannot lie", () => {
  const t = slopeTriangle(SPACE.baseY, SPACE.baseX);
  // top and right corner both lie on the inclined cable; the legs are vertical and horizontal
  for (const q of [t.top, t.right]) {
    const ft = { x: (q.x - SPACE.baseX) / FOOT_U, y: (SPACE.baseY - q.y) / FOOT_U };
    near(2 * ft.x + ft.y, SLOPE_C, 1e-9);
  }
  near(t.foot.x, t.top.x, 1e-9);
  near(t.foot.y, t.right.y, 1e-9);
  near((t.foot.y - t.top.y) / (t.right.x - t.foot.x), 2, 1e-9);   // two down for one across, as labelled
  for (const q of [t.top, t.foot, t.right]) assert.ok(inBox(q, SPACE.box));
});

// ---- the hanging weight, and the force that snaps to it -------------------------------------------
test('the weight is outlined under D, below the beam and above the dimension line', () => {
  const p = beamPoints(SPACE.baseY, SPACE.baseX);
  const m = massOutline(SPACE.baseY, SPACE.baseX);
  near(m.hook.x, p.D.x, 1e-9);
  near(m.body.x + m.body.w / 2, p.D.x, 1e-9, 'the weight hangs from D, so it is centred on D');
  assert.ok(m.box.y0 > p.D.y, 'it hangs BELOW the beam');
  // the DRAWN pieces, not only the box around them: flipping the body's top above the beam left the
  // box untouched and this test passing, which the mutation audit caught
  assert.ok(m.hook.y > p.D.y && m.top.y > m.hook.y, 'the hanger runs downwards out of the beam');
  assert.ok(m.body.y > p.D.y && m.body.y + m.body.h > m.body.y, 'and the weight itself is under it');
  assert.ok(m.box.y1 >= m.body.y + m.body.h - 1e-9, 'the box has to contain what is drawn');
  assert.ok(m.box.y1 < SPACE.dimY, 'and clears the dimension line under it');
  assert.ok(inBox({ x: m.box.x0, y: m.box.y1 }, SPACE.box) && inBox({ x: m.box.x1, y: m.box.y0 }, SPACE.box));
  assert.ok(m.body.h > 30 && m.body.w > 20, 'it has to read as a weight, not a tick');
});

test('the force at D has its TAIL on the beam and its tip at the handle', () => {
  const s = { f: 200, dir: 270 };
  const a = loadArrow(s);
  const D = beamPoints(SPACE.baseY, SPACE.baseX).D;
  assert.deepEqual(a.tail, D);
  near(dist(a.tail, a.tip), 200 * FORCE_U);
  assert.ok(a.tip.y > D.y, 'a downward force is drawn going down, out of the beam');
  near(a.tip.x, D.x, 1e-12);
  assert.equal(loadArrow({ f: 0, dir: 270 }), null, 'no force, no arrow');
  // with no force the handle parks on the weight's hanger, under D, where the weight would pull
  const rest = handleRest();
  near(rest.x, D.x, 1e-12);
  assert.ok(rest.y > D.y);
});

test('dragging the handle and reading the force back are inverses, over the whole grid', () => {
  for (const s of STATES) {
    if (s.f === 0) continue;
    const back = loadFromHandle(loadArrow(s).tip, 0);
    near(back.f, s.f, 1e-9);
    near(((back.dir - s.dir + 540) % 360) - 180, 0, 1e-9);
  }
  // a handle dropped exactly on D has no direction to give, so the old one is kept
  const D = beamPoints(SPACE.baseY, SPACE.baseX).D;
  assert.deepEqual(loadFromHandle(D, 215), { f: 0, dir: 215 });
});

test('the arrow at D and its handle stay on the panel in EVERY state, in every direction', () => {
  for (const s of STATES) {
    const a = loadArrow(s);
    const h = a ? a.tip : handleRest();
    assert.ok(inBox(h, SPACE.box, -HANDLE_R), `${JSON.stringify(s)}: the handle is off the panel at ${JSON.stringify(h)}`);
    if (a) for (const b of arrowGeometry(a.tail, a.tip, 4.6, 12).boxes) {
      assert.ok(b.x0 >= SPACE.box.x0 && b.x1 <= SPACE.box.x1, `${JSON.stringify(s)}: the arrow runs off sideways`);
      assert.ok(b.y0 >= SPACE.box.y0 && b.y1 <= SPACE.box.y1, `${JSON.stringify(s)}: the arrow runs off vertically`);
    }
  }
});

test('a force swung straight down never reaches the dimension line it would have to cross', () => {
  const D = beamPoints(SPACE.baseY, SPACE.baseX).D;
  const worst = Math.max(...STATES.map(s => s.f)) * FORCE_U;
  assert.ok(D.y + worst < SPACE.dimY, `the longest downward arrow reaches ${D.y + worst}, the line is at ${SPACE.dimY}`);
});

// ---- the free-body arrows --------------------------------------------------------------------------
test('the free-body arrows start where their force acts: A, B, C and D', () => {
  const o = { x: 100, y: 500 };
  const spread = fbdArrows({ f: 200, dir: 215 }, o, true);
  assert.deepEqual(spread.map(a => a.key), ['load', 'cableB', 'cableC', 'pin']);
  near(spread[0].tail.x, o.x + X_D * FOOT_U);
  near(spread[1].tail.x, o.x + X_B * FOOT_U);
  near(spread[2].tail.x, o.x + X_C * FOOT_U);
  near(spread[3].tail.x, o.x);
  for (const a of fbdArrows({ f: 200, dir: 215 }, o, false)) assert.deepEqual(a.tail, o);
  assert.equal(fbdArrows({ f: 0, dir: 270 }, o, false).length, 0, 'no force at D, no arrows at all');
  assert.equal(fbdArrows({ f: 200, dir: 180 }, o, false).length, 2, 'a horizontal force leaves the cable nothing');
});

test('the run at B is always vertical and the run at C always on its own 2-to-1 line', () => {
  // Against the FIGURE's own number, -2, and not against U_CE: comparing the drawn force with the
  // unit vector it is built from is comparing the source with itself, and the first version of this
  // test did exactly that -- no mutation could make it fail, which the audit's coverage pass said.
  for (const s of STATES) {
    const [, cableB, cableC] = forceList(s);
    assert.equal(cableB.vec.x, 0, `${JSON.stringify(s)}: the cable at B hangs straight down from E`);
    if (cableC.mag === 0) continue;
    near(cableC.vec.y / cableC.vec.x, -2, 1e-9, `${JSON.stringify(s)}: two up for one to the LEFT`);
    assert.ok(cableC.vec.x / cableC.mag < 0 === cableC.vec.y / cableC.mag > 0 || cableC.mag === 0);
    near(Math.hypot(U_CE.x, U_CE.y), 1, 1e-12, 'and the unit vector is a unit vector');
  }
});

// ---- the polygon -------------------------------------------------------------------------------------
test('the polygon starts and ends in the same place, in every state', () => {
  for (const s of STATES) {
    const v = polygonVertices(s);
    assert.equal(v.length, 5, 'four forces make four sides');
    near(v[4].x, v[0].x, 1e-12);
    near(v[4].y, v[0].y, 1e-12);
  }
});

test('the fitted polygon lands inside its box, in every state', () => {
  const box = PANELS.poly;
  for (const s of STATES) {
    const v = polygonVertices(s);
    const fit = fitPolygon(v, box);
    assert.ok(fit.scale > 0 && Number.isFinite(fit.scale), JSON.stringify(s));
    for (const p of v.map(fit.map)) {
      assert.ok(p.x >= box.x0 && p.x <= box.x1, `${JSON.stringify(s)}: x ${p.x}`);
      assert.ok(p.y >= box.y0 && p.y <= box.y1, `${JSON.stringify(s)}: y ${p.y}`);
    }
  }
});

test('the fitted polygon is drawn the right way up: a downward force runs DOWN the page', () => {
  const s = { f: 200, dir: 270 };
  const v = polygonVertices(s);
  const fit = fitPolygon(v, PANELS.poly);
  assert.ok(fit.map(v[1]).y > fit.map(v[0]).y, 'the force at D pulls down, so its side must point down');
});

// ---- labels ------------------------------------------------------------------------------------------
test("a label sits beyond its arrow's tip, and a horizontal one is lifted clear of the beam", () => {
  const right = labelSpot({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.ok(right.x > 100 && right.anchor === 'start');
  assert.ok(right.y <= -LABEL_LIFT + 1e-9, "a label on the beam's own line must be lifted off it");
  assert.ok(labelSpot({ x: 0, y: 0 }, { x: 0, y: 100 }).y > 0, 'a downward arrow labels below itself');
});

test('placeLabels moves a label off what it lands on, never moves a pinned one, and keeps it on the panel', () => {
  const bounds = { x0: 0, x1: 600, y0: 0, y1: 400 };
  const clear = [{ spot: { x: 50, y: 50, anchor: 'start' }, chars: 8 }];
  assert.deepEqual(placeLabels(clear, [], bounds)[0], clear[0].spot);
  const obstacle = { x0: 40, x1: 200, y0: 30, y1: 70 };
  const moved = placeLabels([{ spot: { x: 50, y: 50, anchor: 'start' }, chars: 8 }], [obstacle], bounds)[0];
  assert.ok(!boxesHit(labelBox(moved, 8), obstacle));
  const pinned = placeLabels([
    { spot: { x: 100, y: 100, anchor: 'start' }, chars: 9, pinned: true },
    { spot: { x: 104, y: 104, anchor: 'start' }, chars: 9 }
  ], [], bounds);
  assert.deepEqual(pinned[0], { x: 100, y: 100, anchor: 'start' });
  assert.ok(!boxesHit(labelBox(pinned[0], 9), labelBox(pinned[1], 9), PLACE_TEXT_GAP));
  const out = placeLabels([{ spot: { x: 295, y: 10, anchor: 'start' }, chars: 10 }], [], { x0: 0, x1: 300, y0: 0, y1: 200 })[0];
  assert.ok(labelBox(out, 10).x1 <= 300.01);
});

test('a label is never flung far from its arrow', () => {
  const wall = { x0: 0, x1: 600, y0: 0, y1: 600 };
  const spot = { x: 100, y: 100, anchor: 'start' };
  const o = placeLabels([{ spot, chars: 10 }], [wall], { x0: 0, x1: 1000, y0: 0, y1: 1000 })[0];
  assert.ok(Math.hypot(o.x - spot.x, o.y - spot.y) <= PLACE_MAX_SHIFT + 1);
  // and a LITERAL ceiling as well as the constant: measured against PLACE_MAX_SHIFT alone, this test
  // restates the source and no edit of it can ever make the test fail. Past about this far a label
  // no longer reads as belonging to its own arrow, whatever the constant is set to.
  assert.ok(Math.hypot(o.x - spot.x, o.y - spot.y) <= 200,
    'a label this far from its arrow belongs to no arrow a reader can see');
  assert.ok(PLACE_MAX_SHIFT <= 200, `PLACE_MAX_SHIFT of ${PLACE_MAX_SHIFT} lets a label wander off its own arrow`);
});

test('an arrow is cut into pieces short enough that none claims a big rectangle', () => {
  const geo = arrowGeometry({ x: 0, y: 0 }, { x: 200, y: 200 }, 4, 12);
  assert.equal(geo.pieces.length, shaftPieces(Math.hypot(200, 200), 12));
  for (const b of geo.boxes.slice(0, -1)) {
    assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= SHAFT_SEG + 0.01);
    // and a LITERAL ceiling: against SHAFT_SEG alone this test restates the source and can never
    // fail. A piece bigger than about 20 units claims a rectangle labels have to live in.
    assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= 20, 'a shaft piece claims too big a rectangle');
  }
  assert.ok(SHAFT_SEG <= 20, `a shaft cut into ${SHAFT_SEG}-unit pieces no longer hugs its own line`);
  assert.deepEqual(geo.head[1], { x: 200, y: 200 });
});

// ---- the two free-body panels, over EVERY state -------------------------------------------------
// As in the polygon test below, the panel's PINNED text goes in too. A heading or a caption never
// moves, but it blocks, and leaving it out hands the solver an easier problem than the figure does.
const PANEL_TEXT = {
  point: () => ['The beam as a single point', 'the forces only, not where they act'],
  ext: (s) => ['Free-body diagram of the beam', s.pivot
    ? `torques about ${pivotName(s.pivot)}: whatever point you pick, they sum to zero`
    : 'one cable over a frictionless pulley, so both pulls are the same size']
    .concat(derive(s).slack ? [SLACK_NOTE] : [])
};

function panelClash(s, panel, spread, which) {
  const origin = spread ? beamPoints(panel.baseY, panel.baseX).A : { x: panel.ox, y: panel.oy };
  const arrows = fbdArrows(s, origin, spread);
  if (!arrows.length) return null;
  const obs = arrows.flatMap(a => arrowGeometry(a.tail, a.tip, 4.2, 12).boxes);
  if (spread) {
    const p = beamPoints(panel.baseY, panel.baseX);
    obs.push({ x0: p.A.x, x1: p.D.x, y0: p.A.y - 8, y1: p.A.y + 8 });
    for (const q of [p.A, p.B, p.C, p.D]) obs.push({ x0: q.x - 4.5, x1: q.x + 4.5, y0: q.y - 4.5, y1: q.y + 4.5 });
  } else {
    obs.push({ x0: origin.x - 7, x1: origin.x + 7, y0: origin.y - 7, y1: origin.y + 7 });
  }
  const lines = PANEL_TEXT[which](s);
  // the heading is drawn at TEXT, every caption at SUB: the solver is told so, and so is the check
  const pinned = lines.map((str, i) => ({
    spot: { x: i === 2 ? panel.box.x1 - 8 : panel.headX, y: panel.headY + i * CAPTION_DY, anchor: i === 2 ? 'end' : 'start' },
    chars: str.length, size: i === 0 ? TEXT : SUB, pinned: true
  }));
  // Once a pivot is picked the free-body diagram's force arrows carry no label at all: the torques
  // take the panel, and each torque's subscript names the force it came from.
  const labelled = !(spread && s.pivot);
  const items = pinned.concat(labelled
    ? arrows.map(a => ({ spot: labelSpot(a.tail, a.tip), chars: segPlain(forceLabel(a.key, a.mag)).length, size: TEXT }))
    : []);
  if (spread && s.pivot) {
    for (const q of torqueArcs(s, panel)) {
      if (q.mag === 0) continue;
      obs.push(...torqueArc(q.centre, q.value).boxes);
      items.push({ spot: torqueLabelSpot(q.centre, torqueRadius(q.mag), false), chars: segPlain(torqueLabel(q.sub, q.mag)).length, size: TEXT });
    }
  }
  if (s.pivot && (spread || which === 'space')) {
    const at = pivotAt(s.pivot, panel);
    obs.push({ x0: at.x - PIVOT_DOT_R - 3, x1: at.x + PIVOT_DOT_R + 3, y0: at.y - PIVOT_DOT_R - 3, y1: at.y + PIVOT_DOT_R + 3 });
    items.push({ spot: pivotLabelSpot(at, panel), chars: 1, size: TEXT, maxShift: PLACE_NAME_SHIFT });
  }
  const out = placeLabels(items, obs, panel.box);
  const boxes = out.map((q, i) => labelBox(q, items[i].chars, items[i].size));
  for (let i = pinned.length; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesHit(boxes[i], boxes[j], PLACE_TEXT_GAP)) return `labels ${i} and ${j} are not a word apart`;
    }
    for (const b of obs) if (boxesHit(boxes[i], b)) return `label ${i} sits on something drawn`;
    const bx = boxes[i];
    if (bx.x0 < panel.box.x0 - 0.01 || bx.x1 > panel.box.x1 + 0.01) return `label ${i} is off the panel sideways`;
    if (bx.y0 < panel.box.y0 - 0.01 || bx.y1 > panel.box.y1 + 0.01) return `label ${i} is off the panel vertically`;
  }
  // a pinned line of the panel's own text must not be sat on either
  for (let i = 0; i < pinned.length; i++) {
    for (let j = pinned.length; j < boxes.length; j++) {
      if (boxesHit(boxes[i], boxes[j], PLACE_TEXT_GAP)) return `a force label sits on the panel's own line ${i}`;
    }
  }
  return null;
}

test('in the point diagram no label lands on another, on an arrow, or off the panel, in any state', () => {
  for (const s of STATES) assert.equal(panelClash(s, PANELS.point, false, 'point'), null, JSON.stringify(s));
});

test('in the free-body diagram no label lands on another, on anything drawn, or off the panel, in any state', () => {
  for (const s of STATES) assert.equal(panelClash(s, PANELS.ext, true, 'ext'), null, JSON.stringify(s));
});

// THE PANEL THIS VERSION PUTS THE MOST IN. With a pivot picked it carries four force names, four
// torque arcs, four torque labels with a number each, the pivot's dot and its letter -- and it has
// to do that for every state of the force AND every place the pivot can be put.
test('and with a pivot picked, over every state and every pivot worth trying', () => {
  for (const s of PIVOT_STATES) {
    if (!s.pivot) continue;
    assert.equal(panelClash(s, PANELS.ext, true, 'ext'), null, JSON.stringify(s));
  }
});

// THE PANEL THE FIRST BROWSER RUN CAUGHT. Nothing here checked the force polygon's labels, and in the
// browser two of them sat on each other: the polygon is the smallest panel, and when two of its sides
// run nearly parallel their mid-side labels start out almost on top of one another.
//
// This has to hand placeLabels EXACTLY what scene.js hands it, pinned heading and caption and scale
// bar included, or it is solving an easier problem than the figure does. The first version of this
// test left those three out, passed on the very geometry the browser had just failed, and so proved
// nothing at all -- which is lesson 27 in the skill's own notes, a guard that cannot fire.
test('in the force polygon no label lands on another or off the panel, in any state', () => {
  const P = PANELS.poly;
  const chars = (segs) => segPlain(segs).length;
  for (const s of STATES) {
    const verts = polygonVertices(s);
    const fit = fitPolygon(verts, P);
    const list = forceList(s);
    const obs = [], sides = [], sideChars = [];
    for (let i = 0; i < list.length; i++) {
      const from = fit.map(verts[i]), to = fit.map(verts[i + 1]);
      if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-6) continue;
      obs.push(...arrowGeometry(from, to, 4.2, 12).boxes);
      sides.push({ from, to });
      sideChars.push(chars(forceLabel(list[i].key, list[i].mag)));
    }
    if (!sides.length) continue;
    // the pinned text of the panel, and the scale bar it stands on: all of it blocks
    const bar = 100 * fit.scale, by = P.y1 + 8;
    obs.push({ x0: P.x0, x1: P.x0 + bar, y0: by - 2, y1: by + 2 });
    const pinned = [
      { spot: { x: P.headX, y: P.headY, anchor: 'start' }, chars: 'The forces tip to tail'.length, size: TEXT, pinned: true },
      { spot: { x: P.headX, y: P.headY + CAPTION_DY, anchor: 'start' }, chars: 'in equilibrium the chain closes'.length, size: SUB, pinned: true },
      { spot: { x: P.x0 + bar + 7, y: by + 6, anchor: 'start' }, chars: 4, size: SUB, pinned: true }
    ];
    const items = pinned.concat(polygonLabelSpots(sides).map((spot, i) => ({ spot, chars: sideChars[i], size: TEXT })));
    const out = placeLabels(items, obs, P.box);
    const boxes = out.map((q, i) => labelBox(q, items[i].chars, items[i].size));
    for (let i = pinned.length; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.ok(!boxesHit(boxes[i], boxes[j], PLACE_TEXT_GAP),
          `${JSON.stringify(s)}: polygon labels ${i} and ${j} are not a word apart`);
      }
      const b = boxes[i];
      assert.ok(b.x0 >= P.box.x0 - 0.01 && b.x1 <= P.box.x1 + 0.01, `${JSON.stringify(s)}: polygon label ${i} is off sideways`);
      assert.ok(b.y0 >= P.box.y0 - 0.01 && b.y1 <= P.box.y1 + 0.01, `${JSON.stringify(s)}: polygon label ${i} is off vertically`);
    }
  }
});

test('the label estimate is the WIDEST label this figure prints, not an average', () => {
  // Measured in Chromium: a letter-average of 10.6 left the solver clearing an obstacle by less than
  // its own error, and the label came out sitting on it. A force label is nearly all digits, and
  // digits are wider than letters.
  assert.ok(LABEL_CHAR_W >= 11.37, `an estimate of ${LABEL_CHAR_W} is narrower than the widest label needs`);
  const widest = Math.max(...STATES.map(s => segPlain(forceLabel('cableC', derive(s).magCE)).length));
  assert.ok(widest >= 11, `the longest label is ${widest} characters, so the estimate matters`);
});

test('two labels end up a readable gap apart, not merely not touching', () => {
  assert.ok(PLACE_TEXT_GAP >= 8, 'a gap under about eight units reads as one word');
  const items = [
    { spot: { x: 200, y: 100, anchor: 'end' }, chars: 7 },
    { spot: { x: 202, y: 100, anchor: 'start' }, chars: 7 }
  ];
  const out = placeLabels(items, [], { x0: 0, x1: 600, y0: 0, y1: 400 });
  assert.ok(!boxesHit(labelBox(out[0], 7), labelBox(out[1], 7), PLACE_TEXT_GAP),
    'two labels set side by side were left touching');
});

test('the panels tile the viewBox without overlapping, and the rules fall between them', () => {
  const list = [PANELS.space.box, PANELS.point.box, PANELS.ext.box, PANELS.poly.box];
  for (const b of list) {
    assert.ok(b.x0 >= 0 && b.x1 <= VB.w && b.y0 >= 0 && b.y1 <= VB.h, 'a panel hangs off the figure');
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      assert.ok(!boxesHit(list[i], list[j], 0), `panels ${i} and ${j} overlap`);
    }
  }
  assert.ok(SPLITS.across.y > PANELS.space.box.y1 && SPLITS.across.y < PANELS.ext.box.y0);
  assert.ok(SPLITS.upper.x > PANELS.space.box.x1 && SPLITS.upper.x < PANELS.point.box.x0);
  assert.ok(SPLITS.lower.x > PANELS.ext.box.x1 && SPLITS.lower.x < PANELS.poly.box.x0);
});

// ---- the pivot, and the band it may be dropped in --------------------------------------------
test('a pivot in feet and a point in a panel are inverses, in both left panels', () => {
  for (const P of [PANELS.space, PANELS.ext]) {
    for (const p of [{ x: 0, y: 0 }, { x: 7.5, y: -1.25 }, { x: 13, y: 3 }]) {
      const back = pivotFromPoint(pivotAt(p, P), P);
      near(back.x, p.x, 1e-9);
      near(back.y, p.y, 1e-9);
    }
  }
  // and the SAME pivot lands on the same place of the beam in each, which is the whole point of
  // drawing the dot twice
  const a = pivotAt({ x: X_C, y: 0 }, PANELS.space), b = pivotAt({ x: X_C, y: 0 }, PANELS.ext);
  near(a.x - PANELS.space.baseX, b.x - PANELS.ext.baseX, 1e-9);
  near(a.y - PANELS.space.baseY, b.y - PANELS.ext.baseY, 1e-9);
});

test('the pickable band is what BOTH left panels can show, and the figure outlines exactly it', () => {
  const b = pivotBounds();
  assert.ok(b.x0 < b.x1 && b.y0 < b.y1, JSON.stringify(b));
  for (const P of [PANELS.space, PANELS.ext]) {
    for (const corner of [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }, { x: b.x1, y: b.y0 }]) {
      const at = pivotAt(corner, P);
      assert.ok(at.x - PIVOT_DOT_R >= P.box.x0 && at.x + PIVOT_DOT_R <= P.box.x1, 'the dot must fit sideways');
      assert.ok(at.y - PIVOT_DOT_R >= P.band.y0 && at.y + PIVOT_DOT_R <= P.band.y1, 'and inside the panel\'s own band');
    }
    // the outline the figure draws while armed IS that region, not the whole panel
    const r = pivotRegionIn(P);
    near(r.x, pivotAt({ x: b.x0, y: b.y1 }, P).x, 1e-9);
    near(r.y, pivotAt({ x: b.x0, y: b.y1 }, P).y, 1e-9);
    assert.ok(r.width > 100 && r.height > 60, 'and it has to be worth aiming at');
  }
  // every lettered point survives the clamp: a point you can be told to pick must be pickable
  for (const q of letteredPoints()) {
    const c = clampPivot({ x: q.x, y: q.y });
    near(c.x, q.x, 1e-9, q.name);
    near(c.y, q.y, 1e-9, q.name);
  }
});

test('clamping pulls an outside point to the band and leaves an inside one alone', () => {
  const b = pivotBounds();
  assert.deepEqual(clampPivot(null), null);
  const far = clampPivot({ x: 999, y: -999 });
  near(far.x, b.x1, 1e-9);
  near(far.y, b.y0, 1e-9);
  const inside = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  assert.deepEqual(clampPivot(inside), inside);
});

test('a point is only in a pickable panel when it really is inside one', () => {
  assert.equal(panelOfPoint(pivotAt({ x: 5, y: 0 }, PANELS.space)), 'space');
  assert.equal(panelOfPoint(pivotAt({ x: 5, y: 0 }, PANELS.ext)), 'ext');
  assert.equal(panelOfPoint({ x: PANELS.point.ox, y: PANELS.point.oy }), null, 'the point diagram is not pickable');
  assert.equal(panelOfPoint({ x: PANELS.poly.x0 + 5, y: PANELS.poly.y0 + 5 }), null, 'nor the polygon');
});

// ---- the torque arcs ---------------------------------------------------------------------------
test('a bigger torque is a bigger arc, and a torque of zero is no arc at all', () => {
  assert.ok(torqueRadius(4000) > torqueRadius(400), 'the radius has to carry the magnitude');
  assert.equal(torqueRadius(0), TORQUE_R0, 'but it does not start at zero, or a small torque would vanish');
  assert.ok(torqueRadius(TORQUE_MAX) <= TORQUE_R_MAX + 1e-9);
  assert.deepEqual(torqueArc({ x: 0, y: 0 }, 0), { segments: [], head: null, boxes: [], r: 0 });
  // strictly increasing, so two torques that differ are two arcs that differ
  let last = -1;
  for (const m of [0, 100, 500, 1000, 2000, 4000, TORQUE_MAX]) {
    const r = torqueRadius(m);
    assert.ok(r > last, `${m}`);
    last = r;
  }
});

test('TORQUE_MAX really is the most the figure can be made to show', () => {
  // A moment is LINEAR in the pivot, so over a rectangle its extreme is always at a corner: sweeping
  // the four corners against every state is the whole of the worst case, not a sample of it.
  const b = pivotBounds();
  const corners = [{ x: b.x0, y: b.y0 }, { x: b.x0, y: b.y1 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }];
  let worst = 0;
  for (const s of STATES) for (const pivot of corners) {
    for (const q of torqueList({ ...s, pivot })) worst = Math.max(worst, q.mag);
  }
  assert.ok(worst <= TORQUE_MAX, `a torque of ${worst.toFixed(0)} exceeds TORQUE_MAX ${TORQUE_MAX}`);
  assert.ok(worst > TORQUE_MAX * 0.9, `TORQUE_MAX ${TORQUE_MAX} is far above the real worst ${worst.toFixed(0)}: the arcs would all be small`);
});

test('the arcs of two neighbouring forces cannot touch, even at the largest torque', () => {
  const closest = Math.min(X_B, X_C - X_B, X_D - X_C) * FOOT_U;
  assert.ok(2 * TORQUE_R_MAX < closest, `two full-size arcs span ${2 * TORQUE_R_MAX}, the closest pair is ${closest} apart`);
  assert.ok(TORQUE_SWEEP > 180 && TORQUE_SWEEP < 340, 'an arc that goes all the way round cannot show which way it turns');
});

test('each arc is centred where its own force acts', () => {
  const P = PANELS.ext;
  const p = beamPoints(P.baseY, P.baseX);
  const want = { load: p.D.x, cableB: p.B.x, cableC: p.C.x, pin: p.A.x };
  for (const q of torqueArcs({ f: 200, dir: 215, pivot: { x: 7, y: 0 } }, P)) {
    near(q.centre.x, want[q.key], 1e-9, q.key);
    near(q.centre.y, P.baseY, 1e-9, q.key);
  }
});

test('an arc turns the way its torque turns, as a reader of the PAGE sees it', () => {
  const centre = { x: 200, y: 200 };
  // Screen y runs DOWN, so a counterclockwise turn ON THE PAGE has a negative cross product here.
  // That is exactly the flip that is easy to get backwards, and the reason this test exists.
  const sense = (geo) => {
    const a = geo.segments[0], b = geo.segments[1];
    const p = { x: a.x1 - centre.x, y: a.y1 - centre.y };
    const q = { x: b.x2 - centre.x, y: b.y2 - centre.y };
    return Math.sign(p.x * q.y - p.y * q.x);
  };
  const ccw = torqueArc(centre, 2000), cw = torqueArc(centre, -2000);
  assert.ok(ccw.head && cw.head);
  assert.equal(sense(ccw), -1, 'a positive torque must turn counterclockwise on the page');
  assert.equal(sense(cw), 1, 'and a negative one clockwise');
  // both begin at the same place, so only the direction of travel tells them apart
  near(ccw.segments[0].x1, cw.segments[0].x1);
  near(ccw.segments[0].y1, cw.segments[0].y1);
  assert.ok(dist(ccw.head[1], cw.head[1]) > 1, 'and they must not finish in the same place');
  // the head is at the far end of the sweep, not at the start
  assert.ok(dist(ccw.head[1], { x: ccw.segments.at(-1).x2, y: ccw.segments.at(-1).y2 }) < 1e-6);
  // every piece sits on the circle the radius says, and none claims a big rectangle
  for (const p of ccw.segments) near(Math.hypot(p.x1 - centre.x, p.y1 - centre.y), ccw.r, 1e-6);
  for (const b of ccw.boxes.slice(0, -1)) assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= 15);
});

test("the pivot's letter is put on whichever side of the dot the panel has room on", () => {
  const P = PANELS.ext;
  const near_right = pivotLabelSpot({ x: P.box.x1 - 10, y: 600 }, P);
  assert.equal(near_right.anchor, 'end', 'at the right edge it reads leftwards');
  assert.ok(near_right.x < P.box.x1 - 10);
  const middle = pivotLabelSpot({ x: (P.box.x0 + P.box.x1) / 2, y: 600 }, P);
  assert.equal(middle.anchor, 'start');
  assert.ok(middle.x > (P.box.x0 + P.box.x1) / 2);
  const high = pivotLabelSpot({ x: 300, y: P.band.y0 + 4 }, P);
  assert.ok(high.y > P.band.y0 + 4, 'at the top of the band it hangs BELOW the dot');
  assert.ok(middle.y < 600, 'and elsewhere above it');
});
