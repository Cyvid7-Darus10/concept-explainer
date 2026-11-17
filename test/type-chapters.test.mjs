import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { TYPE_RULES } from '../scripts/lib/schema.mjs';

// The explainer page carries its own copy of each type's default chapter
// order (template/js/app.js). It must match the presets and the schema.
const source = readFileSync(new URL('../template/js/app.js', import.meta.url), 'utf8');
const block = source.match(/const TYPE_CHAPTERS = (\{[\s\S]*?\n\});/);
// JSON round trip: arrays from another vm context have their own prototype.
const TYPE_CHAPTERS = JSON.parse(JSON.stringify(vm.runInNewContext(`(${block[1]})`)));
const presetsDir = new URL('../presets/types/', import.meta.url);

test('the page knows a chapter order for every explainer type', () => {
  assert.deepEqual(Object.keys(TYPE_CHAPTERS).sort(), Object.keys(TYPE_RULES).sort());
});

test('each order equals the type preset and the schema rule', () => {
  readdirSync(presetsDir).filter((f) => f.endsWith('.json')).forEach((file) => {
    const preset = JSON.parse(readFileSync(new URL(file, presetsDir), 'utf8'));
    const type = file.replace(/\.json$/, '');
    assert.deepEqual(TYPE_CHAPTERS[type], preset.chapters, `presets/types/${file}`);
  });
  Object.entries(TYPE_RULES).forEach(([type, rule]) => assert.deepEqual(TYPE_CHAPTERS[type], rule.chapters, `TYPE_RULES.${type}`));
});

test('optional chapters are ones the page places itself (the code walkthrough)', () => {
  // chooseChapters puts `code` right after the flows when walkthroughs exist;
  // any other optional chapter would need the same handling there.
  readdirSync(presetsDir).filter((f) => f.endsWith('.json')).forEach((file) => {
    const preset = JSON.parse(readFileSync(new URL(file, presetsDir), 'utf8'));
    (preset.optionalChapters || []).forEach((key) => assert.equal(key, 'code', `presets/types/${file} optional chapter ${key}`));
  });
  assert.match(source, /'code', \.\.\.typeOrder\.slice\(flowsAt \+ 1\)/);
});
