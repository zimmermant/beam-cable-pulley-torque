// The statics: pure functions of the stored inputs, no DOM.
//
// A horizontal beam A-D. A is a PIN in the wall, so it can push in any direction in the plane: two
// unknown components. One cable is tied to the beam at B, runs up over a pulley at E and comes back
// down to the beam at C. The student sets the force at D -- its magnitude `f` and its direction
// `dir`, measured CCW from +x, so straight down (the hanging weight) is 270 degrees.
//
// THE PULLEY IS A POINT, AND THAT IS WHERE THE DRAWN 2:1 SLOPE COMES FROM. Idealised, the cable runs
// from B straight up to E and from E straight down to C. The segment at B is vertical, so E is
// directly above B; the segment at C is drawn with a slope of 2 up to 1 across, and C is 5 ft right
// of B, so E stands 2 * 5 = 10 ft above the beam. The wheel of radius PULLEY_R drawn in the figure is
// tangent to both of those lines and sits BELOW the point E -- it is scenery, and no equation uses it.
//
// A FRICTIONLESS PULLEY TURNS THE CABLE WITHOUT CHANGING ITS TENSION, so both segments pull with the
// same magnitude T. That single fact is what makes the problem solvable: it leaves three unknowns --
// F_Ax, F_Ay and T -- for the three equations of a rigid body in a plane.
//
// NOTATION (the Wiki_Vault reference): a force is never named after a point. The pin reaction is
// F_A with components F_Ax and F_Ay; the force the cable puts on the beam takes BOTH letters of the
// segment it acts along, F_BE at B and F_CE at C, in the same double-subscript form as a two-force
// member (F_CD = F_CD * r_hat_CD). Their common magnitude is the cable's tension. The applied force
// at D is F_D. A symbol with the arrow over it is the vector; without it, the magnitude.
//
// Axes: x right, y up, moments counterclockwise positive. Three unknowns, three equations:
//
//   sum M_A = 0:  x_B T + x_C (2/sqrt5) T + x_D F_Dy = 0  ->  T = -x_D F_Dy / (x_B + x_C 2/sqrt5)
//   sum F_x = 0:  F_Ax - T/sqrt5 + F_Dx = 0               ->  F_Ax = T/sqrt5 - F_Dx
//   sum F_y = 0:  F_Ay + T + 2T/sqrt5 + F_Dy = 0          ->  F_Ay = -T(1 + 2/sqrt5) - F_Dy
//
// The moment equation holds T on its own because both of the other unknowns act AT A. Note what the
// first line says: the tension answers to the VERTICAL component of the force at D and to nothing
// else. Swing the force at D horizontal and the cable goes limp however hard you pull.
//
// WHEN THE TENSION COMES OUT NEGATIVE. Push UP at D (any direction with F_Dy > 0) and the equations
// ask the cable to push the beam down. A cable cannot push. There is then no equilibrium with this
// cable in it: the cable goes slack and the beam swings. `slack` says so, and the figure says so in
// words rather than drawing a cable in compression as though it were an answer.

export const DEG = Math.PI / 180;

export const AB = 5;                 // ft, A to B
export const BC = 5;                 // ft, B to C
export const CD = 3;                 // ft, C to D
export const X_B = AB;               // 5 ft, where the cable is tied the first time
export const X_C = AB + BC;          // 10 ft, where it is tied the second time
export const X_D = AB + BC + CD;     // 13 ft, the loaded end
export const SPAN = X_D;

export const H_E = 2 * BC;           // ft: the slope is 2 to 1 and E stands over B, BC ft from C
export const PULLEY_R = 0.642857;    // ft, DRAWN ONLY: the wheel tangent to both cable lines

export const SQ5 = Math.sqrt(5);

export const FORCE_DP = 1;           // decimals printed for a force, in pounds
export const TORQUE_DP = 0;          // decimals printed for a torque, in pound feet
export const ANGLE_DP = 0;           // decimals printed for the direction, in degrees

// Unit vectors from each tie point toward E: the direction the cable pulls the beam.
export const U_BE = { x: 0, y: 1 };                  // straight up
export const U_CE = { x: -1 / SQ5, y: 2 / SQ5 };     // up and to the left, 2 up per 1 across

// The subscript of each force's name. ONE source of truth, so the figure, the tests and the harness
// can never drift apart. A cable force takes both letters of its segment; the pin takes its support.
export const FORCE_SUB = { load: 'D', cableB: 'BE', cableC: 'CE', pin: 'A' };
export const COMPONENT_SUB = { x: 'Ax', y: 'Ay' };

// The denominator of the moment equation: the moment about A that one pound of tension produces.
export const MOMENT_PER_T = X_B * U_BE.y + X_C * U_CE.y;    // = 5 + 4 sqrt5 = 13.944...

// cos and sin of a whole number of degrees, EXACT at the quadrant points. Math.cos(270 * DEG) is
// -1.8e-16, not 0, which would leave a hair of horizontal force in a force that is exactly vertical.
// Here that hair would land in F_Ax, which at the straight-down setting is pure cable pull: the
// figure would print a reaction that is wrong in its last digit for the one state students check.
export function cosDeg(d) {
  const m = ((d % 360) + 360) % 360;
  if (m === 90 || m === 270) return 0;
  if (m === 0) return 1;
  if (m === 180) return -1;
  return Math.cos(m * DEG);
}

export function sinDeg(d) {
  const m = ((d % 360) + 360) % 360;
  if (m === 0 || m === 180) return 0;
  if (m === 90) return 1;
  if (m === 270) return -1;
  return Math.sin(m * DEG);
}

// The force at D as components, in pounds. Adding 0 turns -0 into 0.
export function loadComponents(s) {
  return { x: s.f * cosDeg(s.dir) + 0, y: s.f * sinDeg(s.dir) + 0 };
}

// The cable's tension, in pounds, from the moment equation about A. Signed: a negative value is the
// pull the cable would need in order to push, which it cannot do.
export function tension(s) {
  return -X_D * loadComponents(s).y / MOMENT_PER_T + 0;
}

// Everything that is shown but not stored.
export function derive(s) {
  const D = loadComponents(s);
  const t = tension(s);
  const BE = { x: t * U_BE.x + 0, y: t * U_BE.y + 0 };
  const CE = { x: t * U_CE.x + 0, y: t * U_CE.y + 0 };
  const A = { x: -(BE.x + CE.x + D.x) + 0, y: -(BE.y + CE.y + D.y) + 0 };
  return {
    D, BE, CE, A, t,
    magD: Math.hypot(D.x, D.y),
    magBE: Math.abs(t),
    magCE: Math.abs(t),
    magA: Math.hypot(A.x, A.y),
    slack: t < 0
  };
}

// ---------------------------------------------------------------------------------------------
// TORQUE ABOUT A PIVOT
//
// The student picks a point and the figure shows what each force does about it. The moment of a
// force F acting at r, about a pivot p, is the z-component of (r - p) x F:
//
//     M = (r_x - p_x) F_y - (r_y - p_y) F_x,   counterclockwise positive
//
// Every force here acts somewhere on the beam, at y = 0, so the second term is p_y F_x: a pivot ON
// the beam's line feels nothing from the horizontal components, and one above or below it does.
// That is worth a student's time -- it is why "the moment arm" is a distance to the LINE of the
// force and not to its point.
//
// THE FOUR TORQUES ALWAYS SUM TO ZERO, about whatever point is picked, because the beam is in
// equilibrium. That is not a coincidence to be checked once: it is the same fact as the force
// polygon closing, and it is what makes the picture worth looking at.
//
// NOTATION (Todd's rule): a torque is named for its pivot FIRST and then the force it comes from --
// M_ACE is what the cable at C does about A, M_AD what the force at D does about A. A pivot that is
// not one of the figure's lettered points is called F, the next letter free, so that same force
// gives M_FD.

// The lettered points a pivot can be dropped ON, in feet, with y measured UP from the top of the
// beam. A, B, C and D -- the four points of the beam itself.
//
// E IS NOT HERE, AND THE REASON IS THE FREE-BODY DIAGRAM. The figure letters the pulley E, and
// taking moments about it would be perfectly legal -- a pivot need not be on the body. But the dot
// has to show on BOTH left diagrams, and E stands 7.3 ft above the beam: in the free-body diagram
// that is behind the panel's own heading, and making room for it would leave the arrows and their
// labels nothing. So the pickable band stops short of it, the figure OUTLINES that band while the
// picker is armed, and a click up by the pulley lands at the top of the band as an ordinary
// unlettered point F. Lettering a point the student cannot pick would be the worse lie.
export const PIVOT_SNAP_FT = 0.9;    // how near a lettered point counts as picking it
export const UNNAMED_PIVOT = 'F';    // what an unlettered point is called: the next letter free

export function letteredPoints() {
  return [
    { name: 'A', x: 0, y: 0 },
    { name: 'B', x: X_B, y: 0 },
    { name: 'C', x: X_C, y: 0 },
    { name: 'D', x: X_D, y: 0 }
  ];
}

// Which lettered point a pivot IS, or null for one that is not lettered.
export function letteredAt(p) {
  if (!p) return null;
  for (const q of letteredPoints()) {
    if (Math.hypot(q.x - p.x, q.y - p.y) <= 1e-9) return q.name;
  }
  return null;
}

// What the figure calls the pivot: its letter, or F when it is not one of them.
export function pivotName(p) {
  return letteredAt(p) || UNNAMED_PIVOT;
}

// The moment of one force about the pivot, in pound feet, counterclockwise positive.
export function momentOf(force, at, pivot) {
  return (at - pivot.x) * force.y - (0 - pivot.y) * force.x + 0;
}

// Every force's torque about the pivot, in the order the figure introduces them. `sub` is the
// torque's whole subscript: the pivot's letter, then the force's own.
export function torqueList(s) {
  if (!s.pivot) return [];
  const d = derive(s);
  const pre = pivotName(s.pivot);
  const at = { load: X_D, cableB: X_B, cableC: X_C, pin: 0 };
  const vec = { load: d.D, cableB: d.BE, cableC: d.CE, pin: d.A };
  return ['load', 'cableB', 'cableC', 'pin'].map(key => {
    const m = momentOf(vec[key], at[key], s.pivot);
    return { key, sub: pre + FORCE_SUB[key], value: m, mag: Math.abs(m) };
  });
}

// Which way a torque turns: 'ccw' when positive, 'cw' when negative, 'none' at exactly zero.
export function turnOf(m) {
  if (m > 0) return 'ccw';
  if (m < 0) return 'cw';
  return 'none';
}
