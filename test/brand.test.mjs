import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Guardrails from references/design-system.md. If one of these fails, the
// change is a design-system change: update that document in the same PR.

const css = readFileSync(new URL('../template/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../template/explainer.html', import.meta.url), 'utf8');
const jsDir = new URL('../template/js/', import.meta.url);
// Comments may name banned things ("never innerHTML"); only code counts.
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const js = stripComments(readdirSync(jsDir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, jsDir), 'utf8')).join('\n'));
const cssCode = stripComments(css);

// Geist greys, the one orange (marks, fills, text), quiz right/wrong, and
// the six layer markers. Light values first, then the dark theme.
const ALLOWED_COLORS = new Set([
  '#fafafa', '#ffffff', '#fff', '#ebebeb', '#171717', '#4d4d4d', '#666666', '#8f8f8f', '#c9c9c9',
  '#fc5e32', '#d2430e', '#b83a0b', '#c2410c', '#297a3a', '#cb2a2f',
  '#111111', '#1a1a1a', '#2c2c2c', '#ededed', '#c4c4c4', '#a3a3a3', '#8c8c8c', '#5a5a5a',
  '#ff7043', '#c8410e', '#e0521c', '#ff8a5c', '#62c073', '#ff6166',
  '#5b9a6e', '#5b86c4', '#4a5d8a', '#76739a', '#c39a3d', '#c0689a',
]);
const ALLOWED_RADII = new Set(['6px', 'var(--radius)', '4px', '9999px', '0', '50%', '1px', '2px']);

// Split on commas that are not inside parentheses.
function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// Every definition of a custom property, so var(--ring) can be checked too.
const customProps = [...cssCode.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)]
  .reduce((map, [, name, value]) => map.set(name, [...(map.get(name) || []), value.trim()]), new Map());

function shadowLayers(value, seen = new Set()) {
  return splitTopLevel(value).flatMap((layer) => {
    const ref = layer.match(/^var\((--[\w-]+)\)$/);
    if (!ref) return [layer];
    if (seen.has(ref[1])) return [];
    const definitions = customProps.get(ref[1]) || [];
    assert.ok(definitions.length, `box-shadow uses ${ref[1]}, which is never defined`);
    return definitions.flatMap((def) => shadowLayers(def, new Set([...seen, ref[1]])));
  });
}

test('box-shadow is only ever a ring: every shadow has blur 0', () => {
  const values = [...cssCode.matchAll(/box-shadow\s*:\s*([^;{}]+);/g)].map((m) => m[1].trim())
    .concat([...customProps.entries()].filter(([name]) => /^--ring/.test(name)).flatMap(([, defs]) => defs));
  assert.ok(values.length > 0, 'expected hairline rings in the stylesheet');
  const blurred = values.flatMap((value) => (value === 'none' ? [] : shadowLayers(value)))
    .filter((layer) => {
      const lengths = layer.replace(/var\([^)]*\)|rgb\([^)]*\)|#[0-9a-f]+|currentColor|inset/gi, ' ').trim().split(/\s+/).filter(Boolean);
      assert.ok(lengths.length >= 2 && lengths.length <= 4, `unreadable shadow "${layer}"`);
      return lengths.length >= 3 && parseFloat(lengths[2]) !== 0;
    });
  assert.deepEqual(blurred, [], `blurred shadows: ${blurred.join(' | ')}`);
  assert.doesNotMatch(cssCode, /text-shadow|drop-shadow/);
  assert.doesNotMatch(js, /boxShadow|box-shadow|drop-shadow|textShadow/);
});

test('no gradients', () => {
  assert.doesNotMatch(css, /gradient\(/);
  assert.doesNotMatch(js, /gradient/i);
});

test('every hex color is a design token value', () => {
  const used = new Set([...`${css}\n${js}`.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()));
  const strays = [...used].filter((c) => !ALLOWED_COLORS.has(c));
  assert.deepEqual(strays, [], `colors outside the tokens: ${strays.join(', ')}`);
});

test('the orange is the only accent: no other brand colours in the stylesheet', () => {
  assert.match(css, /--accent: #fc5e32;/);
  assert.doesNotMatch(`${css}\n${js}`, /#58cc02|#1cb0f6|#ffc800|#ff4b4b/i, 'the old Duolingo palette is gone');
});

test('border radii stay on the scale', () => {
  const radii = [...cssCode.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim());
  const strays = radii.filter((r) => !ALLOWED_RADII.has(r));
  assert.deepEqual(strays, [], `unexpected radii: ${strays.join(', ')}`);
  assert.match(css, /--radius: 6px;/);
});

test('light, dark and system themes share the same tokens', () => {
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\] \{/);
  assert.match(js, /function applyTheme\(/);
  assert.match(js, /window\.localStorage/);
});

test('reduced motion disables every animation and transition', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;[\s\S]*?transition: none !important;/);
  assert.match(js, /function reducedMotion\(\)/);
});

test('rendering never uses innerHTML or eval', () => {
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
});

test('fonts are Geist and Geist Mono, with no Nunito left', () => {
  assert.match(css, /--sans: "Geist"/);
  assert.match(css, /--mono: "Geist Mono"/);
  assert.match(html, /family=Geist:[^"]*family=Geist\+Mono/);
  assert.doesNotMatch(`${css}\n${html}\n${js}`, /Nunito|JetBrains/i);
});

test('links from data go through the http(s) allowlist', () => {
  assert.doesNotMatch(js, /href: change\.url/);
  assert.match(js, /href: safeUrl\(/);
});

test('the page carries the library context slot', () => {
  assert.match(html, /<script type="application\/json" id="explainer-context">__CONTEXT__<\/script>/);
});

// Overflow guardrails. Long identifiers and paths must wrap inside their box;
// test/fixtures/stress.explainer.json is the visual check for this.
test('long words wrap instead of stretching their box', () => {
  assert.match(css, /body \{[^}]*overflow-wrap: break-word;/);
});

test('grid tracks can shrink below their longest word', () => {
  const bare = [...css.matchAll(/grid-template-columns:\s*([^;]+);/g)]
    .map((m) => m[1])
    .filter((value) => /(^|[\s(,])1fr/.test(value.replace(/minmax\((?:[^()]|\([^()]*\))*\)/g, '')));
  assert.deepEqual(bare, [], `use minmax(0, 1fr) instead of 1fr: ${bare.join(' | ')}`);
});

test('no inner vertical scroll areas inside the content', () => {
  const scrollers = [...cssCode.matchAll(/([^{}]+)\{[^}]*overflow-y:\s*(auto|scroll)/g)].map((m) => m[1].trim());
  const allowed = scrollers.filter((sel) => !/\.side\b|\.sheet\b/.test(sel));
  assert.deepEqual(allowed, [], `only the sidebar and the menu sheet may scroll on their own: ${allowed.join(' | ')}`);
});
