# Torque about a pivot: beam held by a cable over a pulley

**Live:** <https://zimmermant.github.io/beam-cable-pulley-torque/>

An interactive free-body-diagram sandbox for PHYS 291 Statics. One page, no network, nothing to
install: open `dist/beam_cable_pulley_torque.html`.

**This is the torque version of [beam-cable-pulley](https://zimmermant.github.io/beam-cable-pulley/).**
Same beam, same cable, same draggable force — and a pivot you pick, about which the free-body
diagram shows what each force turns.

A horizontal beam runs from a **pin** in the wall at **A** to its free end at **D**, 13 ft away. One
cable is tied to the beam at **B** (5 ft), runs straight up over a pulley at **E**, and comes back
down to a second tie at **C** (10 ft), descending 2 ft for every 1 ft across. A weight used to hang
at **D**; it is left on the page in outline, and the force at D is yours to point anywhere.

| panel | what it shows |
|---|---|
| The situation | the given figure, with the force at D on a draggable arrowhead |
| The beam as a single point | the four forces, all from one point — and nothing about where they act |
| Free-body diagram of the beam | the pin and the cable replaced by what they do — **and, once you pick a pivot, what each force turns about it** |
| The forces tip to tail | the same four forces as a closed polygon |

## The pivot

Press **Pick a pivot point** and the two diagrams on the left outline the band a pivot may be
dropped in; click anywhere inside either, or press **A**, **B**, **C** or **D** to land on one of
the beam's own points. **Escape** gives up. The point is marked with a dot on *both* left diagrams,
because it is one point on one beam, and the free-body diagram then draws an arc at each force
showing what that force turns about it — bigger torque, bigger arc.

    M = (r_x − p_x) F_y − (r_y − p_y) F_x,   counterclockwise positive

**The four torques sum to zero about whatever point you pick.** That is not a coincidence to check
once: it is the same fact as the force polygon closing, and it is the reason the picture is worth
looking at. Three things follow that are worth hunting for:

- a pivot **on a force's own point** kills that force's torque — about A, F⃗_A turns nothing;
- a pivot anywhere **on the beam** kills the torque of any force along the beam, because the arm to
  its line is zero;
- lift the pivot **off the beam** and the horizontal components start to count, which is why a
  moment arm is a distance to the *line* of a force and not to its point.

Torques are named for the **pivot first** and then the force: M⃗_ACE is what the cable at C turns
about A, M⃗_AD what the force at D turns about A. A pivot that is not one of the figure's lettered
points is called **F**, so the same force gives M⃗_FD.

### Why the pulley is not a pivot

The figure letters the pulley **E**, and taking moments about it would be perfectly legal — a pivot
need not be on the body. But the dot has to show on *both* left diagrams, and E stands 7.3 ft above
the beam: in the free-body diagram that is behind the panel's own heading, and making room for it
would leave the arrows and their labels nothing. So the pickable band stops short of it, the figure
**outlines that band** while the picker is armed, and a click up by the pulley lands at the top of
the band as an ordinary unlettered point F. Lettering a point the student cannot pick would be the
worse lie.

### What the free-body diagram gives up

Once a pivot is picked, the force arrows in that panel lose their labels: four names and four
torques with a number each is more than one panel can hold, and the label solver was pushing force
names up into the panel's own captions to find room. Nothing is lost — every force is still named
and numbered in the point diagram beside it, and each torque's subscript names the force it came
from: the **BE** of M⃗_FBE is the F⃗_BE that made it, drawn under that force's own arc and in that
force's own colour.

## Why the problem closes

**A frictionless pulley turns a cable without changing its tension.** Both runs therefore pull with
the same magnitude, and that single fact is what makes the beam solvable: it leaves three unknowns —
F_Ax, F_Ay and the tension — for the three equations of a rigid body in a plane. With x right, y up
and moments counterclockwise:

    ΣM_A = 0:   x_B T + x_C (2/√5) T + x_D F_Dy = 0   →  T = − x_D F_Dy / (x_B + x_C · 2/√5)
    ΣF_x = 0:   F_Ax − T/√5 + F_Dx = 0                →  F_Ax = T/√5 − F_Dx
    ΣF_y = 0:   F_Ay + T + 2T/√5 + F_Dy = 0           →  F_Ay = − T (1 + 2/√5) − F_Dy

(The A in ΣM_A names the moment centre, not a moment.) Both pin components act **at** A, so the
moment equation holds the tension on its own. Read what that first line says: the tension answers to
the **vertical** component of the force at D and to nothing else. Four things are worth finding:

- the force at D **straight down** ⇒ the textbook problem, and the outlined weight fills in;
- the force **along the beam**, either way ⇒ the cable goes limp however hard you pull, and the pin
  takes the whole of it;
- the force with any **upward** pull ⇒ the equations ask the cable to **push**, which a cable cannot
  do, so it goes slack and the figure says so rather than drawing an answer;
- **no force at all** ⇒ every force is zero, and each of the four is said in words.

Anything that comes out exactly zero is **said in words** rather than left out, because a missing
arrow and a zero look identical otherwise.

### Where the pulley really is

The figure's 2-to-1 slope is not a decoration: idealised, the cable runs from B straight up to E and
from E straight down to C, so E stands directly over B, and C is 5 ft from B, which puts E exactly
**10 ft** above the beam. The wheel drawn in the figure has a radius and sits a little below that
point, tangent to both cable lines; its centre is computed from those two tangency conditions, and no
equation uses it.

## Notation

From Todd's notation conventions, which are binding here. The force the student sets is **F⃗_D**; the
pin's reaction is **F⃗_A**, with components **F_Ax** and **F_Ay** — never `A_x`, because A is a point
and not a force. The cable's pull on the beam takes **both** letters of the segment it acts along,
**F⃗_BE** at B and **F⃗_CE** at C, in the same double-subscript form as a two-force member. The two
are drawn in **one colour**, because they are one cable with one tension. Every vector carries a
drawn arrow, and no ASCII underscore ever reaches the screen.

## Using it

**The figure is the control.** There is nothing else on the page to push.

- **Drag the arrowhead** at D, or tab to it and use the arrow keys (left/right swing, up/down pull
  harder; Home puts it back on the weight at full strength, End drops it).
- The direction sticks at **270°**, straight down, within ten degrees either side, and the outlined
  weight fills in while it is there. One arrow-key nudge from the snap lands on 255° or 285°, clear
  of the zone, so the keyboard can always leave it.
- A link sets either exactly, which no drag can do: `?f=150&dir=215`, or `?f=200&dir=90` for the
  state where the cable would have to push and goes slack.
- The bar under the figure is a **reading**, not a control: it shows both numbers and lights a chip
  while the force is on the weight.

## Working on it

```
node build.js                  # writes dist/beam_cable_pulley_torque.html from src/
node --test test/*.test.js     # the suite
node tools/mutations.mjs --coverage --strict
```

The browser harness needs a real layout engine, so node does not run it. Serve the folder, open the
page at one of the sizes in `SIM.viewport`, reload, then in the page:

```
eval(await (await fetch('/tools/browser-harness.js')).text()); H.install(); H.all()
await H.queries()
```

Load the page **without a query string** before `H.sweep()`: there is no control to drive, so the
sweep checks the DEFAULT state, and a page opened on a preset link is not in it. `H.queries()` is
what covers the links — and on this page that includes every pivot worth putting one on.

Pass is `sweep.violationCount` 0, `queries.violationCount` 0, `sensitivity.flagged` true and
`budget.ok` true, at **both** 800 × 750 and 1280 × 720.

### Things worth knowing before changing the figure

**Arrows and the cable are drawn as separate short top-level pieces.** Every overlap check works on
bounding rectangles, and one long diagonal line claims its whole square, which is exactly where the
labels want to go. The pieces must be top level, because the harness measures the outermost element
carrying class `g`.

**Labels are placed by a solver**, `placeLabels` in `src/layout.js`, against the boxes of everything
already drawn — the panel's own heading and captions included. Its constants are measured in
Chromium, and `labelBox` scales them with the label's drawn size: a caption at `SUB` is not as wide
as one at `TEXT`, and pretending otherwise convinced the solver that a whole band across the
free-body diagram was occupied when it was not.

**The panel checks in `test/layout.test.js` must be handed exactly what the scene hands the solver.**
The first version of the polygon check left the pinned heading and caption out, passed on the very
geometry the browser had just failed, and so proved nothing. If you add a line to a panel, add it
there too.

**Three numbers in `layout.js` were swept, not chosen**: the polygon's vertical margin, how far a
side's label starts from its side, and `PLACE_MAX_SHIFT`. Each has a window rather than a direction —
*more* margin round the polygon is worse past 74 units, because a polygon drawn small enough brings
all four of its sides' midpoints together. The comments give the measured numbers.

**`SUB` is 17, not 16, and that is about the control bar.** The figure takes whatever height the bar
leaves it, so a link that adds a two-line "Adjusted:" note shrinks the figure — and at 16 units the
subscripts then rendered at 11.8 px, under the floor. Anything that makes the bar taller has to be
checked against `H.queries()` at **1280 × 720**, which is the tighter of the two budgets. A hint in
the bar that wrapped onto a second line is exactly what that caught once already.

**The built page carries no comments or indentation, and the source keeps all of it.** `strip()` in
`build.js` drops whole-line comments, blank lines and leading whitespace — about half the page's
weight, and none of its behaviour. It works line by line, which is true of JavaScript everywhere
except inside a multi-line template literal, so the build **refuses** a module containing one rather
than mangling it. Trailing comments are left alone on purpose: a trailing `//` cannot be told from
the `//` of a URL in a string without parsing the line.

**The build refuses a renaming import** (`import { a as b }`). Node honours the alias; the inliner
strips the import line and every module shares one scope, so `b` would never exist and the page would
die at run time while every node test passed. That is the one class of bug the suite is blind to by
construction, so the build catches it instead.

## Embedding it

The page has no frame-busting code and GitHub Pages sends no frame-blocking headers, so it can be put
in an iframe. Some learning-management systems restrict what an iframe may load; that is their
setting, not this page's.

It is built for a window about 800 px wide and 750 px tall, so give it those:

```html
<iframe src="https://zimmermant.github.io/beam-cable-pulley-torque/dist/beam_cable_pulley_torque.html?f=200&amp;dir=270&amp;px=0&amp;py=0"
        width="100%" height="750" style="border:0; max-width:800px"
        title="Torque about a pivot: beam held by a cable over a pulley" loading="lazy"></iframe>
```

That preset is the state worth opening on: the textbook problem itself — a 200 lb weight hanging
straight down at D — with moments already taken **about the pin at A**, where F⃗_A's own torque
comes out zero and the figure says so. Drop `px` and `py` and it opens with no pivot picked, which
is the version without torques plus a button.

### The two copies

This is a **separate repository** from `beam-cable-pulley`, not a second page of it, and the physics,
the layout and the figure code are duplicated between them. That was a deliberate choice; the cost
is that a fix to the beam's geometry, the label solver or the build has to be made **twice**. If you
touch one, check the other.

## Licence

MIT — see [LICENSE](LICENSE). The physics is nobody's property; the code is yours to take.
