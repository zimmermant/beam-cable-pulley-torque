# Lab notebook — torque about a pivot

## 2026-10-28 — built the torque version

**Summary.** Todd asked for another version of `beam_cable_pulley` that shows the torque each force
exerts about a pivot the student picks. Built as `apps/beam_cable_pulley_torque`, its own git repo,
copied from the published sim. 256 tests green; browser harness clean at both viewport budgets,
18 link probes included; the picker driven by hand in Chromium.

**What it does.** A "Pick a pivot point" button arms the figure; the two left diagrams then outline
the band a pivot may be dropped in, and a click anywhere inside either lands one. The point shows as
a dot on BOTH left diagrams, and the free-body diagram draws an arc at each force whose radius is
that force's torque about the pivot. The force numbers in that panel give way to the torques, named
for the pivot first and the force second — M_ACE, M_AD — with an unlettered pivot called F.

**Decisions, and the ones Todd made.**

- **Its own repo, not a second page.** Todd's call, against my recommendation. `build.js` already
  supports several pages and `distributed_load_beam` does exactly that, which would have shared the
  physics and the figure. As a separate repo the two now duplicate `physics.js`, `layout.js`,
  `scene.js` and the build, and **a fix to any of them has to be made twice**. Written at the end of
  the README as well, because that is where whoever touches one of them will be.
- **The pulley E is not a pickable pivot, and this is the one place the figure departs from what was
  asked.** The request implied A to E are the lettered points. But the dot has to show on both left
  diagrams and E stands 7.3 ft above the beam: in the free-body diagram that is behind the panel's
  own heading, and making room for it leaves the arrows and labels nothing. So the pickable band
  stops short of it, the figure OUTLINES that band while armed, and a click by the pulley lands at
  the top of the band as an ordinary F. Lettering a point the student cannot pick would be worse.
- **The force labels leave the free-body diagram once a pivot is picked.** Todd licensed dropping
  the force NUMBERS there; this goes one step further and drops the names too. Four names and four
  torques with a number each is more than the panel can hold -- the label solver was pushing force
  names up into the panel's own captions to find room. Every force is still named and numbered in
  the point diagram beside it, and each torque's subscript names the force it came from.
- **The figure is 790 units tall, against 700 for the version without torques.** The free-body panel
  carries two labels per force now, and eight will not fit beside a 416-unit beam in one row.
- **The pivot is not a FIELDS entry.** It is a point, it can be absent, and making it two fields
  would multiply every lint by both coordinates. It lives beside the fields in the same store, and
  the test grid crosses the field states with nine pivots worth trying rather than sweeping a grid.

**Problems, and how they were resolved.**

1. **The arc scale had to be measured twice.** TORQUE_MAX is the largest torque the figure can be
   made to show, and it depends on the band a pivot may be dropped in -- which changed once the band
   was made explicit. 5228 lb ft became 4564. A moment is LINEAR in the pivot, so the extreme over a
   rectangle is always at a corner: the test sweeps the four corners against every state, and fails
   both ways -- if anything exceeds TORQUE_MAX, and if TORQUE_MAX sits far above the real worst,
   which would leave every arc on the page smaller than it should be.
2. **The free-body panel ran out of room three times.** First the torque labels collided; then, with
   the panel taller, a force label was pushed into the slack note; then the pivot's own letter, at
   the band's top-right corner, was placed off the panel and dragged back across the figure into the
   captions. The first two were fixed by height and by dropping the force labels; the third by
   placing the letter on whichever side of the dot the panel has room on.
3. **The armed caption collided with the ceiling hatching** in the situation diagram -- "click a
   point to take torques about" is three times the length of "drag the arrowhead". Shortened to
   "click a point"; the button already carries the full sentence.
4. **A literal no-break space** reached `controls.js` from the editor rather than an escape, which
   the nbsp lint caught at once. Replaced with the shared `NBSP`.
5. **A test that could not fail.** The first attempt at "the force labels go away" counted one
   label and found three, because the same label is printed in more than one panel. Rewritten as a
   DIFFERENCE: picking a pivot removes exactly four, and touches no other.
6. **The track-drift test would have compared nothing.** The harness and `scene.js` each keep a copy
   of what the figure must paint where; the new pivot tracks are null in every pivot-less state, so
   comparing only those states would have compared null with null for ever. It sweeps the states
   WITH a pivot now, and asserts the pivot tracks really give a number in one.

**Verified.** 256 node tests, including the free-body panel swept over every state against nine
pivots (1386 combinations) for label collisions, and the unit lint over the same set. Browser
harness at 800 x 750 and 1280 x 720: sweep 0 violations, queries 0 over 18 link probes,
sensitivity flagged, budget ok. By hand in Chromium: the button arms, both bands appear, a click on
the beam at 7 ft lands an unlettered pivot F with the four torques labelled, and the dot shows on
both diagrams.

**Not done / open.** Not published -- no public repo exists for it yet. Not tried on Firefox,
Safari, a real Canvas iframe or a touch device. There is no keyboard route to an ARBITRARY pivot:
A to D land on the beam's own points and a link sets any point exactly, but pointing at a free point
needs a pointer.
