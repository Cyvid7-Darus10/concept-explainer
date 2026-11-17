import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadChapters, walk } from './chapters-fake-dom.mjs';

// The v2 chapter renderers and the visuals kit, run against a fake DOM with
// every example and the all-chapters fixture. Layout is checked by numbers
// (coordinates inside the drawing), the browser check covers the pixels.

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const EXAMPLES = {
  pr: read('../examples/pr-cursor-paging.explainer.json'),
  proposal: read('../examples/proposal-live-updates.explainer.json'),
  concept: read('../examples/concept-idempotency-keys.explainer.json'),
  taskflow: read('../examples/taskflow.explainer.json'),
  all: read('./fixtures/chapters-all.explainer.json'),
};

// Parts per kind, as in the Parts column of references/visuals.md.
const PARTS = {
  layers: (v) => v.items.length,
  cycle: (v) => v.items.length,
  funnel: (v) => v.items.length,
  state: (v) => v.states.length,
  compare: (v) => v.rows.length,
  hierarchy: (v) => v.nodes.length,
  beforeAfter: (v) => v.before.items.length + v.after.items.length,
  quadrant: (v) => v.points.length,
  venn: (v) => v.items.length,
};

function allVisuals() {
  return Object.entries(EXAMPLES).flatMap(([name, data]) => [
    ...(data.diagrams || []).map((d) => [`${name}:${d.id}`, d]),
    ...(data.concepts || []).filter((c) => c.visual).map((c, i) => [`${name}:concept${i}`, c.visual]),
  ]);
}

function parts(root) {
  return walk(root).filter((el) => el.getAttribute('role') === 'option');
}

function mountIn(env, el) {
  env.document.body.append(el);
  return el;
}

test('the fixture and the examples cover all nine visual kinds', () => {
  const kinds = new Set(allVisuals().map(([, v]) => v.kind));
  assert.deepEqual([...kinds].sort(), Object.keys(PARTS).sort());
});

test('every visual draws one selectable part per data item, in the documented order', () => {
  const env = loadChapters();
  allVisuals().forEach(([name, visual]) => {
    const mounted = env.ctx.vizMount(visual, { label: name });
    mountIn(env, mounted.root);
    const found = parts(mounted.root);
    assert.equal(found.length, PARTS[visual.kind](visual), `${name} (${visual.kind})`);
    assert.equal(mounted.count(), found.length);
    found.forEach((el, i) => {
      assert.equal(el.getAttribute('data-part'), String(i), `${name} part order`);
      assert.ok(el.getAttribute('aria-label'), `${name} part ${i} has a name`);
    });
  });
});

test('drawings stay inside their width, with no NaN, at phone and desktop widths', () => {
  const env = loadChapters();
  [260, 330, 700, 1040].forEach((width) => {
    allVisuals().forEach(([name, visual]) => {
      const drawing = env.ctx.vizDrawer(visual.kind)(visual, width, 'm');
      assert.ok(Number.isFinite(drawing.height) && drawing.height > 0, `${name} height`);
      const els = [...[drawing.nodes].flat(Infinity).filter(Boolean), ...drawing.parts.map((p) => p.el)].flatMap(walk);
      els.forEach((el) => {
        [...el.attributes.entries()].forEach(([attr, value]) => {
          assert.doesNotMatch(value, /NaN|undefined|Infinity/, `${name} at ${width}: ${el.localName}.${attr}="${value}"`);
        });
        const num = (a) => Number(el.getAttribute(a));
        if (el.localName === 'rect') {
          assert.ok(num('x') >= -1 && num('x') + num('width') <= width + 1, `${name} at ${width}: rect ${num('x')}+${num('width')}`);
          assert.ok(num('y') >= -1 && num('y') + num('height') <= drawing.height + 1, `${name} at ${width}: rect y ${num('y')}+${num('height')} > ${drawing.height}`);
        }
        if (el.localName === 'circle' && !el.closest('marker')) {
          assert.ok(num('cx') - num('r') >= -1 && num('cx') + num('r') <= width + 1, `${name} at ${width}: circle`);
        }
        // Text anchored at its start must start inside; centred text must be centred inside.
        if (el.localName === 'text' && el.getAttribute('x') !== null && !el.getAttribute('transform')) {
          assert.ok(num('x') >= -1 && num('x') <= width + 1, `${name} at ${width}: text x ${num('x')}`);
        }
      });
    });
  });
});

test('one tab stop: the selected part, or the first when nothing is selected', () => {
  const env = loadChapters();
  const visual = EXAMPLES.all.diagrams.find((d) => d.kind === 'state');
  const mounted = env.ctx.vizMount(visual);
  mountIn(env, mounted.root);
  const stops = () => parts(mounted.root).filter((el) => el.getAttribute('tabindex') === '0');
  assert.equal(stops().length, 1);
  assert.equal(stops()[0].getAttribute('data-part'), '0');
  mounted.select(3);
  assert.equal(stops().length, 1);
  assert.equal(stops()[0].getAttribute('data-part'), '3');
  assert.equal(parts(mounted.root).filter((el) => el.getAttribute('aria-selected') === 'true').length, 1);
});

test('arrow keys, Home, End and Escape move through the parts', () => {
  const env = loadChapters();
  const visual = EXAMPLES.all.diagrams.find((d) => d.kind === 'cycle');
  const picked = [];
  const mounted = env.ctx.vizMount(visual, { onSelect: (i) => picked.push(i) });
  mountIn(env, mounted.root);
  const key = (k) => parts(mounted.root).find((el) => el.getAttribute('data-part') === String(mounted.selected() ?? 0)).dispatch('keydown', { key: k });
  key('ArrowRight');
  assert.equal(mounted.selected(), 1);
  assert.equal(env.document.activeElement.getAttribute('data-part'), '1');
  key('End');
  assert.equal(mounted.selected(), visual.items.length - 1);
  key('ArrowDown');
  assert.equal(mounted.selected(), 0, 'wraps around');
  key('ArrowLeft');
  assert.equal(mounted.selected(), visual.items.length - 1);
  key('Home');
  assert.equal(mounted.selected(), 0);
  key('Escape');
  assert.equal(mounted.selected(), null);
  assert.deepEqual(picked.slice(0, 2), [1, visual.items.length - 1]);
});

test('the detail panel shows the selected part, its detail and its relations', () => {
  const env = loadChapters();
  const visual = EXAMPLES.concept.concepts[2].visual;
  const mounted = env.ctx.vizMount(visual);
  mountIn(env, mounted.root);
  mounted.select(2);
  const panel = walk(mounted.root).find((el) => el.classList.contains('viz-detail'));
  assert.match(panel.textContent, /Stored response/);
  assert.match(panel.textContent, /retry replays/);
  assert.match(panel.textContent, /window ends: Expired/);
});

test('an unknown kind says so instead of drawing', () => {
  const env = loadChapters();
  const mounted = env.ctx.vizMount({ kind: 'pie' });
  assert.match(mounted.root.textContent, /not in the kit/);
  assert.equal(mounted.count(), 0);
  assert.equal(mounted.select(0), null);
});

function renderChapter(env, fn, data) {
  const mount = env.document.createElement('div');
  env.document.body.append(mount);
  const controller = env.ctx[fn](data, mount);
  return { mount, controller };
}

const pressed = (mount, cls) => walk(mount).filter((el) => el.classList.contains(cls) && el.getAttribute('aria-pressed') === 'true');

test('every v2 chapter renders each example that has its data', () => {
  const env = loadChapters();
  const chapters = { context: 'chRenderContext', diff: 'chRenderDiff', options: 'chRenderOptions', risks: 'chRenderRisks', rollout: 'chRenderRollout', timeline: 'chRenderTimeline', diagrams: 'chRenderVisuals' };
  let rendered = 0;
  Object.entries(EXAMPLES).forEach(([name, data]) => {
    Object.entries(chapters).forEach(([key, fn]) => {
      if (data[key] === undefined) return;
      const { mount, controller } = renderChapter(env, fn, data);
      assert.ok(controller && typeof controller.open === 'function', `${name} ${key}`);
      assert.ok(mount.textContent.length > 20, `${name} ${key} drew something`);
      assert.doesNotMatch(mount.textContent, /undefined|NaN|\[object Object\]/, `${name} ${key}`);
      rendered += 1;
    });
  });
  assert.ok(rendered >= 15, `rendered ${rendered}`);
});

test('chapters with no data say so and return null', () => {
  const env = loadChapters();
  ['chRenderContext', 'chRenderDiff', 'chRenderOptions', 'chRenderRisks', 'chRenderRollout', 'chRenderTimeline', 'chRenderVisuals'].forEach((fn) => {
    const { mount, controller } = renderChapter(env, fn, { meta: { title: 'x' } });
    assert.equal(controller, null, fn);
    assert.ok(walk(mount).some((el) => el.classList.contains('empty')), fn);
  });
});

test('deep links select the item and clicks write them (indexes from 0)', () => {
  const env = loadChapters();
  const data = EXAMPLES.all;
  const cases = [
    ['chRenderRisks', 'ch-risk', ['1'], 'risks/1'],
    ['chRenderRollout', 'ch-step', ['2'], 'rollout/2'],
    ['chRenderTimeline', 'ch-event', ['4'], 'timeline/4'],
    ['chRenderOptions', 'ch-score', ['2'], 'options/2'],
  ];
  cases.forEach(([fn, cls, link, hash]) => {
    const { mount, controller } = renderChapter(env, fn, data);
    const target = controller.open(link);
    assert.ok(target, `${fn} open(${link}) returns its element`);
    assert.equal(controller.open(['99']), null, `${fn} ignores an index out of range`);
    assert.equal(controller.open(['-1']), null);
    assert.equal(controller.open(['x']), null);
    env.window.location.hash = '';
    const buttons = walk(mount).filter((el) => el.classList.contains(cls) && el.getAttribute('aria-pressed') !== 'true');
    buttons[0].click();
    assert.match(env.window.location.hash, new RegExp(`^#${hash.split('/')[0]}/\\d+$`), `${fn} click writes a deep link`);
    assert.equal(pressed(mount, cls).length, 1, `${fn} one pressed`);
  });
});

test('risks keep the data index in deep links while drawing high impact first', () => {
  const env = loadChapters();
  const { mount, controller } = renderChapter(env, 'chRenderRisks', EXAMPLES.pr);
  const cards = walk(mount).filter((el) => el.classList.contains('ch-risk'));
  assert.match(cards[0].textContent, /crafted cursor/, 'the high impact risk comes first');
  const el = controller.open(['2']);
  assert.match(el.textContent, /crafted cursor/, 'index 2 is the third risk in the data');
  env.window.location.hash = '';
  cards[0].click();
  assert.equal(env.window.location.hash, '#risks', 'clicking the selected card clears the selection');
  cards[0].click();
  assert.equal(env.window.location.hash, '#risks/2');
});

test('diff opens a path given as one encoded segment or as split parts', () => {
  const env = loadChapters();
  const { mount, controller } = renderChapter(env, 'chRenderDiff', EXAMPLES.pr);
  const path = 'packages/core/src/tasks/service.ts';
  assert.equal(controller.open([path]).getAttribute('data-path'), path);
  assert.equal(controller.open(path.split('/')).getAttribute('data-path'), path);
  assert.equal(controller.open(['nope.ts']), null);
  walk(mount).filter((el) => el.classList.contains('ch-file'))[0].click();
  assert.equal(env.window.location.hash, `#diff/${encodeURIComponent('packages/core/src/tasks/cursor.ts')}`);
  const detail = walk(mount).find((el) => el.classList.contains('ch-detail'));
  assert.ok(walk(detail).some((el) => el.getAttribute('href') === '#map/cursor'), 'files link to their map nodes');
});

test('options mark the chosen one and start on it; undecided says so', () => {
  const env = loadChapters();
  const { mount } = renderChapter(env, 'chRenderOptions', EXAMPLES.proposal);
  const cols = walk(mount).filter((el) => el.classList.contains('ch-opt-col'));
  assert.equal(cols.filter((c) => c.classList.contains('is-chosen')).length, 1);
  assert.ok(cols[2].classList.contains('is-selected'), 'the chosen option is selected first');
  const undecided = { ...EXAMPLES.proposal, meta: { ...EXAMPLES.proposal.meta, status: 'proposed' }, options: EXAMPLES.proposal.options.map(({ chosen, why, ...o }) => o) };
  const second = renderChapter(env, 'chRenderOptions', undecided);
  assert.match(second.mount.textContent, /No option is chosen yet/);
});

test('rollout marks done steps and the next one', () => {
  const env = loadChapters();
  const { mount } = renderChapter(env, 'chRenderRollout', EXAMPLES.pr);
  const steps = walk(mount).filter((el) => el.classList.contains('ch-step'));
  assert.deepEqual(steps.map((el) => ['is-done', 'is-next', 'is-todo'].find((c) => el.classList.contains(c))), ['is-done', 'is-done', 'is-done', 'is-next']);
  assert.match(mount.textContent, /3 of 4/);
});

test('the visuals chapter opens a diagram and a part by deep link', () => {
  const env = loadChapters();
  const { mount, controller } = renderChapter(env, 'chRenderVisuals', EXAMPLES.proposal);
  const el = controller.open(['what-moves', '4']);
  assert.equal(el.getAttribute('data-part'), '4', 'part 4 is the second after item (parts count before then after)');
  assert.equal(el.getAttribute('aria-selected'), 'true');
  const figures = walk(mount).filter((x) => x.classList.contains('viz-figure'));
  assert.equal(figures.filter((f) => !f.hidden).length, 1, 'one diagram shows at a time');
  assert.ok(controller.open(['options-grid']), 'a diagram id alone opens the diagram');
  assert.equal(controller.open(['missing', '0']), null);
  env.window.location.hash = '';
  parts(mount).find((p) => !p.closest('[hidden]') && p.getAttribute('data-part') === '1').click();
  assert.equal(env.window.location.hash, '#visuals/options-grid/1');
});

test('map, flow and concept helpers for the other chapters', () => {
  const env = loadChapters();
  const { ctx } = env;
  const nodes = EXAMPLES.pr.nodes;
  assert.equal(ctx.chNodeStatus(nodes.find((n) => n.status === 'unchanged')), null);
  assert.match(ctx.chNodeStatus(nodes.find((n) => n.status === 'added')).textContent, /added/);
  assert.equal(ctx.chNodeStatusAttrs(nodes.find((n) => n.status === 'changed'))['data-status'], 'changed');
  assert.equal(ctx.chStatusLegend(nodes).length, 2, 'added and changed');
  assert.equal(ctx.chStatusLegend(EXAMPLES.taskflow.nodes), null);
  const flows = EXAMPLES.pr.flows;
  const pair = ctx.chFlowPair(flows, flows[1]);
  assert.equal(pair.before.id, 'next-page-before');
  assert.equal(pair.after.id, 'next-page-after');
  assert.equal(ctx.chFlowGroups(flows).length, 1);
  assert.equal(ctx.chFlowPair(EXAMPLES.taskflow.flows, EXAMPLES.taskflow.flows[0]), null);
  let opened = null;
  const compare = ctx.chPairCompare(pair, ctx.byId(EXAMPLES.pr.nodes), (id, n) => { opened = [id, n]; });
  walk(compare).filter((el) => el.classList.contains('ch-pair-step'))[1].click();
  assert.deepEqual(opened, ['next-page-before', 2]);
  assert.match(compare.textContent, /Cursor codec/, 'a part only the after flow uses is named');
  let picked = null;
  const sw = ctx.chPairSwitch(pair, 'next-page-before', (id) => { picked = id; });
  walk(sw).filter((el) => el.localName === 'button')[1].click();
  assert.equal(picked, 'next-page-after');
  assert.equal(ctx.chVariantTag(flows[0]).textContent, 'Before');
  const extras = ctx.chConceptExtras(EXAMPLES.concept.concepts[0]);
  assert.ok(walk(extras).some((el) => el.localName === 'svg'), 'a concept visual is drawn');
  const chain = walk(extras).filter((el) => el.classList.contains('ch-part'));
  assert.equal(chain.length, 3);
  chain[1].click();
  assert.match(extras.textContent, /A timeout or dropped connection/);
  assert.equal(ctx.chConceptExtras({ title: 'x', body: 'y' }), null);
});

test('text from data stays text: no element is ever made from it', () => {
  const env = loadChapters();
  const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const data = {
    meta: { title: evil, status: 'accepted' },
    context: { problem: evil, goals: [evil], nonGoals: [evil], background: evil },
    diff: [{ path: evil, status: 'added', summary: evil, lines: '+1 -1', nodes: [] }],
    options: [{ title: evil, summary: evil, pros: [evil], cons: [evil], chosen: true, why: evil, url: 'javascript:alert(3)' }, { title: 'b', summary: 'b', pros: [], cons: [] }],
    risks: [{ risk: evil, impact: 'high', mitigation: evil, owner: evil }],
    rollout: [{ label: evil, detail: evil, command: evil, done: true }],
    timeline: [{ at: evil, label: evil, detail: evil, kind: 'act' }],
    diagrams: [{ id: evil, kind: 'venn', title: evil, caption: evil, sets: [{ id: 'a', label: evil }, { id: 'b', label: evil }], items: [{ label: evil, in: ['a', 'b'] }] }],
  };
  ['chRenderContext', 'chRenderDiff', 'chRenderOptions', 'chRenderRisks', 'chRenderRollout', 'chRenderTimeline', 'chRenderVisuals'].forEach((fn) => {
    const { mount, controller } = renderChapter(env, fn, data);
    if (controller) controller.open(['0']);
    walk(mount).filter((el) => el.localName === 'button').forEach((b) => b.click());
  });
  assert.ok(!env.created.some((el) => ['img', 'script'].includes(el.localName)), 'no img or script element');
  assert.ok(!env.created.some((el) => el.getAttribute('href') && /javascript:/i.test(el.getAttribute('href'))), 'no javascript: link');
});

test('code walkthrough: steps from 1 in deep links, lines highlighted, takeaway at the end', () => {
  const env = loadChapters();
  const data = EXAMPLES.pr;
  const { mount, controller } = renderChapter(env, 'chRenderCode', data);
  const rows = () => walk(mount).filter((el) => el.classList.contains('ch-code-row'));
  const current = () => rows().filter((r) => r.classList.contains('is-current')).map((r) => r.getAttribute('data-line'));
  assert.deepEqual(current(), ['10'], 'starts on step 1 of the first walkthrough');
  assert.equal(rows()[0].getAttribute('data-line'), '9', 'line numbers are the file line numbers');
  assert.ok(controller.open(['keyset-query', '2']));
  assert.deepEqual(current(), ['55', '56', '57', '58', '59', '60']);
  assert.match(mount.textContent, /Step 2 of 5/);
  assert.ok(walk(mount).some((el) => el.getAttribute('href') === '#glossary/Keyset%20query'), 'refs link to the glossary');
  assert.ok(walk(mount).some((el) => el.getAttribute('href') === '#flows/next-page-after/4'), 'refs link to the flow step');
  env.window.location.hash = '';
  walk(mount).find((el) => el.localName === 'button' && el.textContent === 'Continue').click();
  assert.equal(env.window.location.hash, '#code/keyset-query/3');
  walk(mount).find((el) => el.getAttribute('aria-label') === 'Line 63, step 4').click();
  assert.equal(env.window.location.hash, '#code/keyset-query/4', 'a line number jumps to its step');
  controller.open(['keyset-query', 'done']);
  assert.deepEqual(current(), [], 'no line is current on the takeaway');
  assert.match(mount.textContent, /Paging by position/);
  assert.equal(controller.open(['missing', '1']), null);
  controller.open(['cursor-codec', '99']);
  assert.deepEqual(current(), ['10'], 'an out of range step falls back to the first');
});

const plain = (v) => JSON.parse(JSON.stringify(v));

test('code walkthrough: keys move steps, illustrative code is tagged, tokens stay text', () => {
  const env = loadChapters();
  const { mount } = renderChapter(env, 'chRenderCode', EXAMPLES.concept);
  assert.match(mount.textContent, /Illustrative, not from a repo/);
  const root = walk(mount).find((el) => el.classList.contains('ch-code-chapter'));
  const note = () => walk(mount).find((el) => el.classList.contains('ch-code-note')).textContent;
  const first = note();
  root.dispatch('keydown', { key: 'j' });
  assert.notEqual(note(), first);
  root.dispatch('keydown', { key: 'k' });
  assert.equal(note(), first);
  root.dispatch('keydown', { key: 'ArrowRight' });
  assert.match(env.window.location.hash, /^#code\/middleware\/2$/);
  const comment = plain(env.ctx.chCodeTokens('const a = "x" // note', 'javascript', { block: false }));
  assert.deepEqual(comment, [['kw', 'const'], [null, ' a = '], ['st', '"x"'], [null, ' '], ['cm', '// note']]);
  const state = { block: false };
  assert.deepEqual(plain(env.ctx.chCodeTokens('x /* open', 'ts', state).at(-1)), ['cm', '/* open']);
  assert.deepEqual(plain(env.ctx.chCodeTokens('still */ y', 'ts', state)), [['cm', 'still */'], [null, ' y']]);
  assert.deepEqual(plain(env.ctx.chCodeTokens('x = 1  # py', 'python', { block: false }).at(-1)), ['cm', '# py']);
  const evil = { walkthroughs: [{ id: 'e', title: '<b>t</b>', file: 'a.js:1-5', why: '<script>x</script>', code: '<img src=x>\n<script>alert(1)</script>\n3\n4\n5', steps: [{ lines: '1', note: '<i>n</i>' }, { lines: '2', note: 'n' }], takeaway: 't' }] };
  renderChapter(env, 'chRenderCode', evil);
  assert.ok(!env.created.some((el) => ['img', 'script', 'b', 'i'].includes(el.localName)));
});

test('a flow step or concept that cites covered code links to its walkthrough step', () => {
  const env = loadChapters();
  assert.equal(env.ctx.chWalkthroughFor(EXAMPLES.pr, 'packages/core/src/tasks/service.ts:58'), '#code/keyset-query/2');
  assert.equal(env.ctx.chWalkthroughFor(EXAMPLES.pr, 'packages/core/src/tasks/service.ts:52'), '#code/keyset-query/1', 'an uncovered line opens step 1');
  assert.equal(env.ctx.chWalkthroughFor(EXAMPLES.pr, 'packages/core/src/tasks/service.ts:120'), null);
  assert.equal(env.ctx.chWalkthroughFor(EXAMPLES.taskflow, 'apps/web/app/api/tasks/route.ts:18'), '#code/create-task-route/2');
  assert.equal(env.ctx.chWalkthroughLink(EXAMPLES.taskflow, 'nope.ts:1'), null);
  assert.equal(env.ctx.chWalkthroughLink(EXAMPLES.taskflow, 'apps/web/app/api/tasks/route.ts:20').textContent, 'Walk through this code');
});
