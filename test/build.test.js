import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, cpSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strip, scanForDuplicates, main, MODULES, PAGES, BUILD_MARKER, unsafeToStrip } from '../build.js';

// build.js only calls main() when it is the program node was invoked on, so importing it here does not build.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = PAGES[0].out;

// ---- strip: the two rewrites, as a pure function ----------------------------------------------
test('strip: relative imports (one line or wrapped) and export keywords are removed, declarations kept', () => {
  // with the comment strip OFF, so this test is about imports and exports and nothing else
  const out = strip("import { a } from './a.js';\nimport { b,\n  c } from './b.js';\nexport function f() {}\n  export const nope = 1;\nexport { f };\nconst keep = 2;\n", false);
  assert.ok(!/\bimport\b/.test(out), out);
  assert.ok(!/\bexport\b/.test(out), out);
  assert.ok(!out.includes('c }'), 'the wrapped second line is dropped too');
  assert.ok(out.includes('function f() {}') && out.includes('const keep = 2;') && out.includes('  const nope = 1;'));
});

// ---- scanForDuplicates: the name-collision guard ----------------------------------------------
test('a cross-module duplicate throws and names both files', () => {
  const seen = new Map();
  scanForDuplicates('export const FOO = 1;\n', 'a.js', seen);
  assert.throws(() => scanForDuplicates('export function FOO() {}\n', 'b.js', seen),
    /Duplicate top-level name "FOO" in b\.js; already declared in a\.js/);
});

test('a column-0 destructuring declaration throws', () => {
  assert.throws(() => scanForDuplicates('export const { a, b } = obj;\n', 'weird.js', new Map()), /destructuring/i);
  assert.throws(() => scanForDuplicates('const [first] = list;\n', 'weird2.js', new Map()), /destructuring/i);
});

test('a multi-declarator statement throws, naming the file and the fix', () => {
  const line = 'export const VB = { w: 480, h: 380 }, PAD = 0.12;\n';
  assert.throws(() => scanForDuplicates(line, 'fig.js', new Map()), /fig\.js/);
  assert.throws(() => scanForDuplicates(line, 'fig.js', new Map()), /one name per statement/);
  assert.throws(() => scanForDuplicates('const a = 1, b = 2;\n', 'm.js', new Map()), /one name per statement/);
});

test('a comma inside an object, array, call, string, template or trailing comment is not a second declarator', () => {
  for (const line of [
    "export const COLORS = { a: 'x', b: 'y' };", "export const L = ['a.js', 'b.js'];", 'const f = g(1, 2);',
    "export const M = 'a, b';", 'export const M2 = "a, b";', 'export const M3 = `a, b`;', "export const M4 = 'it\\'s, fine';",
    'export const M5 = 1;  // one, two'
  ]) assert.doesNotThrow(() => scanForDuplicates(line + '\n', 'm.js', new Map()), line);
});

test('an indented function-local const is not a top-level name: it may shadow another module\'s', () => {
  const seen = new Map();
  scanForDuplicates('export function px(x) {\n  return x;\n}\n', 'a.js', seen);
  assert.doesNotThrow(() => scanForDuplicates('export function g() {\n  const px = 1;\n  return px;\n}\n', 'b.js', seen));
  assert.equal(seen.get('px'), 'a.js');
});

// ---- main() against scratch directories OUTSIDE the repo ----------------------------------------
test('main() builds byte-reproducibly, within the byte budget, without touching dist/', () => {
  const dirA = mkdtempSync(join(tmpdir(), 'sim-build-a-'));
  const dirB = mkdtempSync(join(tmpdir(), 'sim-build-b-'));
  try {
    main(dirA);
    main(dirB);
    const a = readFileSync(join(dirA, OUT)), b = readFileSync(join(dirB, OUT));
    assert.ok(a.length > 1000 && a.length < 250_000, `${OUT}: ${a.length} bytes`);
    assert.deepStrictEqual(a, b, 'two builds must be byte-identical');
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('every built page carries the build marker exactly once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sim-build-m-'));
  try {
    main(dir);
    for (const p of PAGES) assert.equal(readFileSync(join(dir, p.out), 'utf8').split(BUILD_MARKER).length - 1, 1, p.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('main() removes stale pages of an earlier build (.html with the marker, not in PAGES) and nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sim-build-s-'));
  try {
    writeFileSync(join(dir, 'old_name.html'), `<!DOCTYPE html>\n${BUILD_MARKER}\n<p>an earlier build</p>`);
    writeFileSync(join(dir, 'hand_written.html'), '<!DOCTYPE html><p>not ours: no marker</p>');
    writeFileSync(join(dir, 'notes.txt'), `${BUILD_MARKER} but not an .html file`);
    writeFileSync(join(dir, 'also_old.htm'), `${BUILD_MARKER} wrong extension`);
    main(dir);
    assert.ok(!existsSync(join(dir, 'old_name.html')), 'the stale page is removed');
    assert.ok(existsSync(join(dir, 'hand_written.html')), 'an .html without the marker is left alone');
    assert.ok(existsSync(join(dir, 'notes.txt')) && existsSync(join(dir, 'also_old.htm')), 'only .html files are touched');
    for (const p of PAGES) assert.ok(existsSync(join(dir, p.out)), `${p.out} is written`);
    main(dir);                                       // a second build is a no-op for what is already right
    assert.ok(existsSync(join(dir, 'hand_written.html')));
    for (const p of PAGES) assert.ok(existsSync(join(dir, p.out)), `${p.out} survives its own rebuild`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the built page has no external URL, script or stylesheet, no leftover marker, no import or export line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sim-build-c-'));
  try {
    main(dir);
    const html = readFileSync(join(dir, OUT), 'utf8');
    assert.ok(!/https?:\/\//.test(html.split('http://www.w3.org/2000/svg').join('')), 'an external URL');
    assert.ok(!/<script[^>]+src=/.test(html), 'an external script');
    assert.ok(!/<link[^>]+href=/.test(html), 'an external stylesheet');
    assert.ok(!html.includes('<!--INLINE_'));
    assert.ok(!/^\s*(import|export)\s/m.test(html.slice(html.indexOf('<script>'))), 'an import or export line survived');
    assert.ok(html.includes('<script>\n(function () {\n"use strict";\n') && html.includes('\n})();\n</script>'), 'one strict IIFE');
    for (const m of MODULES) assert.ok(html.includes(`// ===== ${m} =====`), `${m} is missing`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every src/*.js file is listed in a page\'s module list, and nothing is listed that is not there', () => {
  const files = readdirSync(join(repoRoot, 'src')).filter(f => f.endsWith('.js')).sort();
  const listed = new Set(PAGES.flatMap(p => p.modules));
  assert.deepEqual(files.filter(f => !listed.has(f)), [], 'src/ files missing from the build lists');
  assert.deepEqual([...listed].filter(f => !files.includes(f)), [], 'listed but not in src/');
  assert.equal(MODULES.at(-1), 'app.js', 'app.js runs last');
});

// ---- main()'s refusals, against a scratch copy of the build (build.js, package.json, src/) ----
async function inCopy(edit, check) {
  const dir = mkdtempSync(join(tmpdir(), 'sim-copy-'));
  try {
    for (const f of ['src', 'build.js', 'package.json']) cpSync(join(repoRoot, f), join(dir, f), { recursive: true });
    edit(dir);
    const copy = await import(pathToFileURL(join(dir, 'build.js')).href);
    const out = join(dir, 'out');
    return await check(() => copy.main(out), out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const addTo = (file, text) => (dir) => appendFileSync(join(dir, 'src', file), text);
const rewrite = (file, from, to) => (dir) => {
  const p = join(dir, 'src', file);
  const before = readFileSync(p, 'utf8');
  assert.ok(before.includes(from), `${file} lacks ${from}`);
  writeFileSync(p, before.replace(from, () => to));
};

test('main() refuses a duplicate top-level name across modules, and writes nothing', async () => {
  await inCopy((dir) => { addTo('physics.js', '\nexport const SAME = 1;\n')(dir); addTo('app.js', '\nexport const SAME = 2;\n')(dir); }, (run, out) => {
    assert.throws(run, /Duplicate top-level name "SAME" in app\.js; already declared in physics\.js/);
    assert.ok(!existsSync(join(out, OUT)));
  });
});

test('main() refuses destructuring and multi-declarator statements at the top level', async () => {
  await inCopy(addTo('format.js', '\nexport const { A_PART } = { A_PART: 1 };\n'), (run) => assert.throws(run, /destructuring/i));
  await inCopy(addTo('format.js', '\nexport const ONE = 1, TWO = 2;\n'), (run) => assert.throws(run, /one name per statement/));
});

test('main() refuses a bundle that does not parse', async () => {
  await inCopy(addTo('format.js', '\nconst BROKEN_BUNDLE = ;\n'), (run) => {
    assert.throws(run, /the main page's assembled bundle does not parse as JavaScript/);
  });
});

test('main() refuses a template that lost an inline marker', async () => {
  for (const marker of ['<!--INLINE_CSS-->', '<!--INLINE_JS-->']) {
    await inCopy(rewrite('index.template.html', marker, ''), (run, out) => {
      assert.throws(run, /index\.template\.html is missing one of its inline markers/);
      assert.ok(!existsSync(join(out, OUT)));
    });
  }
});

test('main() refuses an external URL, script tag or stylesheet', async () => {
  await inCopy(addTo('format.js', "\nexport const SOME_REMOTE = 'https://example.org/x.js';\n"), (run) => {
    assert.throws(run, /Build failed \(main page\)[\s\S]*an external URL is present/);
  });
  await inCopy(rewrite('index.template.html', '</head>', '<script src="x.js"></script></head>'), (run) => {
    assert.throws(run, /an external script tag is present/);
  });
  await inCopy(rewrite('index.template.html', '</head>', '<link rel="stylesheet" href="x.css"></head>'), (run) => {
    assert.throws(run, /an external stylesheet is present/);
  });
});

test('main() notices an import line that survived strip, in a bundle that still parses', async () => {
  // A DYNAMIC import, wrapped onto its own line. strip() only drops an import that has a `from`, so
  // this one survives, and unlike a static import it is an expression, so the bundle still parses
  // and the text check is the only thing standing between it and a page that fetches at run time.
  //
  // This used to be a multi-line template literal holding the words `import` and `export`, which was
  // the only other way to get such a line past the parser. The strip now refuses a module with one
  // of those at all (it would rewrite the text inside it), so that fixture can no longer be built --
  // which also leaves build.js's matching `^export` check with no parseable fixture of its own. It
  // is kept as belt and braces; this is the half that can still be shown to fire.
  await inCopy(addTo('format.js', "\nexport const LATER = () =>\nimport ('./format.js');\n"), (run) => {
    assert.throws(run, /an import statement survived/);
  });
});

test('the budget is measured in bytes: 90,000 three-byte characters are 270,000 bytes though .length says 90,000', async () => {
  // a RULE, not a comment: comments are stripped out of the built page, so one could never blow a budget
  await inCopy(addTo('styles.css', `\n:root { --pad: ${'—'.repeat(90_000)}; }\n`), (run) => {
    assert.throws(run, /over the 250 KB budget/);
  });
  await inCopy(addTo('format.js', `\nexport const HUGE_TEXT = '${'x'.repeat(260_000)}';\n`), (run) => {
    assert.throws(run, /over the 250 KB budget/);
  });
});

test('main() splices CSS and JavaScript verbatim: $& and $$ in them are not replacement patterns', async () => {
  const css = ":root { --dollars: $& $' $` $$ $1; }";   // a rule, not a comment: a comment would be stripped
  await inCopy((dir) => {
    appendFileSync(join(dir, 'src', 'styles.css'), `\n${css}\n`);
    appendFileSync(join(dir, 'src', 'format.js'), `\nexport const DOLLARS = '$& $$ $1';\n`);
  }, (run, out) => {
    run();
    const html = readFileSync(join(out, OUT), 'utf8');
    assert.ok(html.includes(css), 'the CSS arrived unchanged');
    assert.ok(html.includes(`const DOLLARS = '$& $$ $1';`), 'the JavaScript arrived unchanged');
  });
});

// Every page's module list must be CLOSED UNDER IMPORTS: if a page includes a module, it must also
// include everything that module imports. Listing each file on *some* page is not enough -- a page
// can drop a module it actually uses and still look fine, because the bundle still parses and the
// node tests import the sources directly rather than the built page.
test('each page carries every module its own modules import', async () => {
  const { readdirSync } = await import('node:fs');
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const importsOf = (file) => {
    const code = readFileSync(join(srcDir, file), 'utf8');
    return [...code.matchAll(/^\s*import\s[^;]*?from\s+'\.\/([\w.-]+)'/gm)].map(m => m[1]);
  };
  const all = readdirSync(srcDir).filter(f => f.endsWith('.js'));
  for (const f of all) for (const dep of importsOf(f)) {
    assert.ok(all.includes(dep), `${f} imports ${dep}, which is not in src/`);
  }
  for (const page of PAGES) {
    const listed = new Set(page.modules);
    for (const m of page.modules) {
      for (const dep of importsOf(m)) {
        assert.ok(listed.has(dep), `${page.name}: ${m} imports ${dep}, which the page does not include`);
      }
    }
    // and a module must come after everything it imports, or the bundle runs in the wrong order
    page.modules.forEach((m, i) => {
      for (const dep of importsOf(m)) {
        assert.ok(page.modules.indexOf(dep) < i, `${page.name}: ${m} is bundled before ${dep}, which it imports`);
      }
    });
  }
});

test('no page carries a module that nothing in it imports (except its own entry module)', () => {
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const importsOf = (file) => [...readFileSync(join(srcDir, file), 'utf8')
    .matchAll(/^\s*import\s[^;]*?from\s+'\.\/([\w.-]+)'/gm)].map(m => m[1]);
  for (const page of PAGES) {
    const needed = new Set(page.modules.flatMap(importsOf));
    const entry = page.modules.at(-1);
    for (const m of page.modules) {
      if (m === entry) continue;
      assert.ok(needed.has(m), `${page.name}: ${m} is bundled but nothing in that page imports it`);
    }
  }
});

// ---- the comment strip: most of the built page's weight, and none of its behaviour -------------
test('the built page carries no comments, while the source keeps every one of them', async () => {
  // Built here rather than read from dist/: the mutation audit runs this suite in a scratch copy of
  // src/ that has no dist/ at all, and a test that cannot run there turns the whole audit void.
  const html = await inCopy(() => {}, (run, out) => { run(); return readFileSync(join(out, OUT), 'utf8'); });
  const lines = html.split('\n');
  const jsComments = lines.filter(l => /^\s*\/\//.test(l) && !/^\s*\/\/ =====/.test(l));
  assert.deepEqual(jsComments.slice(0, 3), [], `${jsComments.length} comment line(s) survived into the page`);
  assert.ok(!/\/\*[\s\S]*?\*\//.test(html.slice(html.indexOf('<style>'), html.indexOf('</style>'))),
    'a CSS comment survived into the page');
  // the source is the documentation, and it keeps all of it
  const src = readFileSync(join(repoRoot, 'src', 'layout.js'), 'utf8');
  assert.ok(src.split('\n').filter(l => /^\s*\/\//.test(l)).length > 100, 'src/layout.js lost its comments');
});

test('strip drops whole-line comments, blank lines and indentation, and never a trailing comment', () => {
  const code = "// a comment\n  // indented too\n\nconst NS = 'http://www.w3.org/2000/svg';\n  const a = 1; // kept: a trailing // cannot be told from a URL\n";
  const out = strip(code);
  assert.ok(!out.includes('a comment') && !out.includes('indented too'));
  assert.ok(out.includes("'http://www.w3.org/2000/svg'"), 'a URL in a string is not a comment');
  assert.ok(out.includes('// kept:'), 'a trailing comment is left alone on purpose');
  assert.ok(!/^\s*$/m.test(out), 'blank lines go too');
  assert.ok(/^const a = 1;/m.test(out), 'and the indentation a reader needed but the page does not');
  const kept = strip(code, false);
  assert.ok(kept.includes('a comment') && /^  const a = 1;/m.test(kept), 'the strip can be turned off');
});

test('the build REFUSES to strip a module with a multi-line template literal', async () => {
  // Inside one, a blank line, an indent and a line starting with // are all text that matters, and
  // the strip would rewrite every one of them. There is no such literal in src/, and this is what
  // keeps it that way.
  assert.equal(unsafeToStrip('const a = 1; // fine\nconst b = `x ${y} z`;'), null);
  assert.ok(unsafeToStrip('const s = `line\n  indented\n`;'), 'a literal over two lines is refused');
  await inCopy(addTo('format.js', '\nexport const RISKY = `one\n  two\n`;\n'), (run) => {
    assert.throws(run, /template literal that runs over more than one line/);
  });
});

test('main() refuses an import that renames what it brings in', async () => {
  // Node honours `import { a as b }`, the inliner cannot: the modules share one scope and the import
  // line is stripped, so `b` never exists and the page dies with a ReferenceError at run time while
  // every node test still passes. This is the one class of bug the test suite is blind to by
  // construction, so the build has to be the thing that catches it.
  await inCopy(rewrite('svg.js', "import { arrowGeometry, torqueArc } from './layout.js';",
    "import { arrowGeometry as geometry, torqueArc } from './layout.js';"), (run) => {
    assert.throws(run, /Renaming import in svg\.js.*arrowGeometry as geometry/s);
  });
});
