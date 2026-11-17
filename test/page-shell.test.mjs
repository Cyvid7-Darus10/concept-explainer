import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// "Save as page" (settings.js, pageSnapshot) rebuilds the page from its own
// untouched parts plus a fixed body skeleton. That skeleton must stay in step
// with template/explainer.html, or saved pages would drift from built ones.

const template = readFileSync(new URL('../template/explainer.html', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../template/js/settings.js', import.meta.url), 'utf8');

function snapshotSkeleton() {
  const start = settings.indexOf("'<body>'");
  const end = settings.indexOf("'</body>'", start);
  assert.ok(start > 0 && end > start, 'pageSnapshot lists the body skeleton');
  return [...settings.slice(start, end).matchAll(/'(<[^']+>)'/g)].map((m) => m[1]);
}

test('every fixed body line of a saved page is in the template', () => {
  const lines = snapshotSkeleton();
  assert.ok(lines.length >= 3, 'skip link, app root and noscript line');
  lines.forEach((line) => assert.ok(template.includes(line), `template/explainer.html is missing: ${line}`));
});

test('a saved page carries the same script slots as the template', () => {
  ['<script type="application/json" id="explainer-data">', '<script type="application/json" id="explainer-context">', '<script data-prepaint>']
    .forEach((tag) => {
      assert.ok(template.includes(tag), `template has ${tag}`);
      assert.ok(settings.includes(tag), `pageSnapshot writes ${tag}`);
    });
});

test('a saved page keeps only the style in its context', () => {
  assert.match(settings, /JSON\.stringify\(\{ style \}\)/);
  assert.doesNotMatch(settings, /outerHTML|innerHTML|XMLSerializer/);
});
