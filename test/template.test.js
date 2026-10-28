import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, SLIDER_FIELDS, UNIT_JOIN, fieldShow, snapAt } from '../src/fields.js';
import { parsePresets } from '../src/presets.js';
import { PAGES } from '../build.js';
import { VB } from '../src/layout.js';

// The page is the four diagrams and a reading bar -- no control at all, because the figure is the
// control. These tests pin that down as text: that every input is read back, that the snap is marked
// in words beside its reading, and that no slider has crept back in.
const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const html = readFileSync(join(src, 'index.template.html'), 'utf8');
const css = readFileSync(join(src, 'styles.css'), 'utf8');
const count = (s, re) => (s.match(re) || []).length;
const sepHtml = (unit) => (Object.hasOwn(UNIT_JOIN, unit) ? UNIT_JOIN[unit] : '&nbsp;');
const symHtml = (f) => (f.sub ? `${f.symbol}<sub>${f.sub}</sub>` : f.symbol);

test('one page, and it has both inline markers exactly once', () => {
  assert.equal(PAGES.length, 1);
  assert.equal(PAGES[0].template, 'index.template.html');
  for (const marker of ['<!--INLINE_CSS-->', '<!--INLINE_JS-->']) {
    assert.equal(count(html, new RegExp(marker, 'g')), 1, marker);
  }
});

test('every id app.js looks up is in the page', () => {
  const app = readFileSync(join(src, 'app.js'), 'utf8');
  const ids = [...app.matchAll(/getElementById\('([\w-]+)'\)/g)].map(m => m[1]);
  // three, not four: with the sliders gone app.js no longer looks up #controls, which is now only a
  // box for the CSS and a handle for the browser harness
  assert.ok(ids.length >= 3, `only ${ids.length} ids found in app.js`);
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `#${id} is missing from the page`);
});

test('the figure is the one the layout draws, and is left to letterbox itself', () => {
  const m = html.match(/<svg id="fig" viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(m, 'no <svg id="fig" viewBox="0 0 w h">');
  assert.deepEqual([Number(m[1]), Number(m[2])], [VB.w, VB.h]);
  assert.ok(!/preserveAspectRatio/.test(html), 'the default "meet" is what fits the figure to the window');
  assert.ok(/role="img"/.test(html) && /aria-label="[^"]{120,}"/.test(html), 'the figure needs a real description');
});

test('every input is read back in the bar, with its symbol and its unit', () => {
  for (const f of FIELDS) {
    const want = `<b id="${f.id}-readout" class="readout">${fieldShow(f, f.default)}</b>${sepHtml(f.unit)}${f.unit}`;
    assert.ok(html.includes(want), `${f.key}: the bar must read "${want}"`);
    assert.ok(html.includes(symHtml(f)), `${f.key}: and name the quantity it is reading`);
  }
  assert.ok(html.includes('id="pivot-readout"'), 'and the pivot is read back too');
});

test('the pivot picker is a real button, says what it does, and can be undone', () => {
  assert.match(html, /<button type="button" id="pick" class="btn">Pick a pivot point<\/button>/);
  assert.match(html, /<button type="button" id="clear-pivot"[^>]*hidden>Clear<\/button>/);
  assert.equal(count(html, /<button\b/g), 2, 'the picker and its undo, and nothing else to push');
  // the states a button can be in, all four of them, in the stylesheet
  for (const state of [':hover', ':active', ':focus-visible']) {
    assert.ok(css.includes(`.btn${state}`), `the button needs a ${state} style`);
  }
  assert.ok(css.includes('.btn.on'), 'and an ARMED style, which is the state that matters most');
  assert.ok(css.includes('#fig.picking'), 'and the figure says so too, with the cursor');
});

test('no slider has crept back in: the page has no control to push at all', () => {
  assert.equal(SLIDER_FIELDS.length, 0, 'a slider would need markup, binding, a keyboard flag and its own tests');
  assert.equal(count(html, /<input\b/g), 0, 'no input element of any kind');
  assert.ok(!/type="range"/.test(html));
  // the RULES, not the word: a comment may still explain why there is no slider here
  assert.ok(!/input\[type=range\]/.test(css), 'no slider styling left behind to ship with the page');
  assert.ok(!/::-webkit-slider|::-moz-range/.test(css), 'nor the per-engine thumb and track rules');
  assert.ok(!/^\.(zs|zl|zt)[\s{.]/m.test(css), 'nor the scale, track and tick classes a slider needed');
});

test('an input with no slider would really have none, and the page says the arrow can be dragged too', () => {
  for (const f of FIELDS.filter(g => g.noSlider)) {
    assert.ok(!html.includes(`${f.id}-slider`), `${f.key} should have no slider`);
  }
  assert.equal(count(html, /<input\b/g), SLIDER_FIELDS.length, 'exactly one input per slider field, and no others');
  // Where the page says the arrow can be dragged is the FIGURE, beside the arrow itself (the "drag
  // the arrowhead" caption under "The situation", and the svg's own description for a screen
  // reader) -- not a hint in the bar, which only repeated it and was long enough to wrap the bar
  // onto a second line and push the figure under the 12 px floor.
  assert.match(html.match(/aria-label="([^"]*)"/)[1], /dragged/, 'the figure has to say the arrow is draggable');
  assert.ok(!/class="hint"/.test(html), 'and not say it twice, in a bar that has no room for it');
  for (const f of FIELDS) assert.ok(html.includes(`id="${f.id}-readout"`), `${f.key}: every input is read back on the page`);
});

test('the snapped direction is marked in words beside its reading, for that field and no other', () => {
  const snapFields = FIELDS.filter(f => f.snap);
  assert.ok(snapFields.length >= 1, 'the direction sticks at straight down and should be marked');
  assert.equal(count(html, /class="snap-label"/g), snapFields.length, 'one chip per snapping input');
  for (const f of snapFields) assert.ok(html.includes(`id="${f.id}-snap" class="snap-label"`), `${f.key}`);
  assert.ok(css.includes('.snap-label.on'), 'the chip lights up when the input sits on its snap value');
  // The chip says what the value MEANS, not just that there is one: a student who has dragged the
  // force a little off straight down has to be able to tell that is what the chip went out for.
  assert.ok(html.includes('>straight down<'), 'the chip has to name the direction it marks');
  assert.ok(/270/.test(String(snapAt(snapFields[0]))), 'and that direction is the one the field snaps to');
});

test('nothing from the fuller page crept back in: no reading panel, no reset, no second page', () => {
  for (const id of ['calc', 'reset', 'status']) assert.ok(!html.includes(`id="${id}"`), `#${id} should not be here`);
  assert.equal(count(html, /<button\b/g), 2, 'the drag, and the pivot picker with its undo');
  assert.ok(html.includes('id="from-link"'), 'but a link that presets the page still says so');
});

test('the page is exactly the window tall and never scrolls', () => {
  assert.ok(/body\s*\{[^}]*height:\s*100vh/.test(css));
  assert.ok(/body\s*\{[^}]*overflow:\s*hidden/.test(css));
  assert.ok(/\.fig-fill\s*\{[^}]*position:\s*relative/.test(css));
  assert.ok(/#fig\s*\{[^}]*position:\s*absolute/.test(css));
});

test('a subscript on the page is pinned at the 12 px floor, not left to the browser', () => {
  assert.ok(/#controls sub\s*\{[^}]*font-size:\s*12px/.test(css),
    'the browser default is 83% of the parent, which lands within a whisker of the floor');
  assert.ok(/<sub>/.test(html), 'and the page really has a subscript to pin');
});

test('the page works in the units the figure is dimensioned in: pounds and degrees', () => {
  assert.deepEqual(FIELDS.map(f => f.unit), ['lb', '°'], 'a force in pounds, an angle in degrees');
  assert.equal(FIELDS[0].unitWord, 'pounds');
  assert.equal(FIELDS[1].unitWord, 'degrees');
  assert.ok(/<\/b>&nbsp;lb/.test(html), 'the force is read back in pounds');
  assert.ok(/<\/b>°/.test(html), 'and the direction in degrees, with no space before the sign');
  assert.ok(!/\bN\b|newton/i.test(html), 'nothing on the page is in newtons: the figure is in feet and pounds');
});

test('the drag handle shows every state it can be in', () => {
  for (const state of [':hover', ':focus-visible']) {
    assert.ok(css.includes(`.load-handle${state}`), `the handle needs a ${state} style`);
  }
  assert.ok(css.includes('.dragging'), 'and a grabbed state');
});

test('the example in the page\'s own aria text is honest about what can be dragged', () => {
  const aria = html.match(/aria-label="([^"]*)"/)[1];
  assert.ok(/drag/i.test(aria));
  assert.ok(!/\d/.test(aria), 'digits in aria text read as bare numbers: spell them out');
});

test('a link can preset every input, including the ones with no slider', () => {
  const q = '?' + FIELDS.map(f => `${f.key}=${f.default}`).join('&');
  const p = parsePresets(q);
  for (const f of FIELDS) assert.equal(p.values[f.key], f.default, f.key);
  assert.deepEqual(p.ignored, []);
});
