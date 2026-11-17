// Library hub: every explainer in the library, searchable in one place.
// Data contract: { manifest, index } as documented in references/library.md.
// Every string goes through text nodes; hrefs must point inside explainers/.
const LIBRARY_HREF = /^explainers\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html(?:#[^\s]*)?$/;
const RESULT_LIMIT = 60;
const STACK_FACETS = 10;
const TYPE_LABELS = {
  explainer: 'Explainer', node: 'Part', flow: 'Flow', step: 'Step', change: 'Change', entity: 'Data', concept: 'Idea',
  glossary: 'Term', file: 'File', run: 'Command', diff: 'Diff', option: 'Option', risk: 'Risk', rollout: 'Rollout',
  event: 'Event', visual: 'Visual', question: 'Question', code: 'Code',
};
const TYPE_ORDER = ['explainer', 'node', 'flow', 'step', 'code', 'option', 'diff', 'risk', 'rollout', 'event', 'entity', 'change', 'concept', 'visual', 'question', 'glossary', 'file', 'run'];
// What each explainer is about (manifest `type`), in words people use.
const KIND_LABELS = {
  repo: 'Repo', pr: 'Pull request', change: 'Change', proposal: 'Proposal', migration: 'Migration', incident: 'Incident', concept: 'Concept',
};
const TAG_FACETS = 10;
const HUB_AUTHORS = [{ id: 'all', label: 'Everyone' }, { id: 'agent', label: 'Agents' }, { id: 'human', label: 'Humans' }];

function libraryHref(value) {
  return typeof value === 'string' && LIBRARY_HREF.test(value) ? value : null;
}

function explainerHref(slug) {
  return libraryHref(`explainers/${slug}/index.html`);
}

function hubDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------- Search ----------
// Every word must appear in the title or text. Title hits rank first, then
// the kind of thing (an explainer before a file).
function scoreEntry(entry, words, phrase) {
  const title = text(entry.title).toLowerCase();
  const hay = `${title} ${text(entry.text).toLowerCase()}`;
  if (!words.every((word) => hay.includes(word))) return null;
  const typeRank = TYPE_ORDER.indexOf(entry.type);
  return (title === phrase ? 20 : 0) + (title.startsWith(phrase) ? 8 : 0)
    + words.filter((word) => title.includes(word)).length * 3 - (typeRank < 0 ? 10 : typeRank) * 0.1;
}

function searchEntries(index, query, allowed) {
  const phrase = query.trim().toLowerCase();
  const words = phrase.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index
    .filter((entry) => allowed.has(entry.slug))
    .map((entry) => ({ entry, score: scoreEntry(entry, words, phrase) }))
    .filter((hit) => hit.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_LIMIT)
    .map((hit) => hit.entry);
}

function groupBySlug(entries) {
  return entries.reduce((groups, entry) => {
    const existing = groups.get(entry.slug) || [];
    return new Map([...groups, [entry.slug, [...existing, entry]]]);
  }, new Map());
}

// ---------- Facets ----------
function stackFacets(explainers) {
  const counts = explainers.flatMap((e) => list(e.stack).map(String)).reduce((map, item) => map.set(item, (map.get(item) || 0) + 1), new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, STACK_FACETS).map(([name]) => name);
}

function typeFacets(explainers) {
  return [...new Set(explainers.map((e) => e.type || 'repo'))].sort();
}

function tagFacets(explainers) {
  const counts = explainers.flatMap((e) => list(e.tags).map(String)).reduce((map, item) => map.set(item, (map.get(item) || 0) + 1), new Map());
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TAG_FACETS).map(([name]) => name);
}

function presetFacets(explainers) {
  return [...new Set(explainers.map((e) => e.preset).filter((p) => typeof p === 'string' && p))].sort();
}

function facetGroup(label, options, current, onPick, labelOf = (v) => v) {
  if (!options.length) return null;
  const chip = (value, name) => h('button', {
    class: 'facet', type: 'button', 'aria-pressed': String(current === value), onclick: () => onPick(value),
  }, truncatable(h('span', { class: 'facet-text' }, softBreaks(name)), name));
  return h('div', { class: 'facet-group', role: 'group', 'aria-label': label },
    h('span', { class: 'eyebrow quiet' }, label),
    h('span', { class: 'facet-chips' }, chip(null, 'Any'), options.map((option) => chip(option, labelOf(option)))));
}

// ---------- Pieces ----------
function layerMarkers(layers) {
  const items = list(layers).filter((l) => l && l.label);
  if (!items.length) return null;
  return h('span', { class: 'lib-layers', 'aria-label': `Layers: ${items.map((l) => l.label).join(', ')}` },
    items.slice(0, 8).map((l) => h('span', { class: 'layer-dot', title: l.label, style: layerStyle(l.color) })));
}

// A small picture of the explainer: its map (layers as columns, parts as
// boxes, calls as lines) when the manifest carries one.
const THUMB = { w: 240, h: 64, pad: 6 };

function mapThumb(thumb) {
  const layers = list(thumb.layers);
  const nodes = list(thumb.nodes);
  if (!layers.length || !nodes.length) return null;
  const colW = (THUMB.w - THUMB.pad * 2) / layers.length;
  const perCol = layers.map((l) => nodes.filter((n) => n.layer === l.id));
  const rows = Math.max(...perCol.map((c) => c.length), 1);
  const boxH = Math.min(12, (THUMB.h - THUMB.pad * 2 - (rows - 1) * 4) / rows);
  const at = new Map();
  perCol.forEach((col, i) => col.forEach((n, j) => at.set(n.id, {
    x: THUMB.pad + i * colW + 6, y: THUMB.pad + j * (boxH + 4), w: colW - 12, h: boxH,
  })));
  const lines = list(thumb.edges).map((e) => [at.get(e.from), at.get(e.to)]).filter(([a, b]) => a && b)
    .map(([a, b]) => s('line', { class: 'thumb-edge', x1: a.x + a.w, y1: a.y + a.h / 2, x2: b.x, y2: b.y + b.h / 2 }));
  const boxes = perCol.flatMap((col, i) => col.map((n) => {
    const b = at.get(n.id);
    return s('g', { class: 'thumb-layer', style: layerStyle(layers[i].color) },
      s('rect', { class: 'thumb-box', x: b.x, y: b.y, width: b.w, height: b.h, rx: 2 }),
      s('rect', { class: 'thumb-bar', x: b.x, y: b.y, width: 2, height: b.h }));
  }));
  return s('svg', { class: 'lib-thumb', viewBox: `0 0 ${THUMB.w} ${THUMB.h}`, 'aria-hidden': 'true', focusable: 'false' }, lines, boxes);
}

function cardThumb(thumb) {
  if (!thumb || typeof thumb !== 'object') return null;
  if (thumb.kind === 'map') return mapThumb(thumb);
  return h('span', { class: 'lib-thumb is-visual', 'aria-hidden': 'true' }, h('span', { class: 'eyebrow quiet' }, text(thumb.kind, 'visual')));
}

function stackTags(stack, max = 4) {
  const items = list(stack).map(String);
  if (!items.length) return null;
  return h('span', { class: 'lib-stack' },
    items.slice(0, max).map((item) => tag(item)),
    items.length > max && h('span', { class: 'tag', title: items.slice(max).join(', ') }, `+${items.length - max}`));
}

function countsLine(counts) {
  const c = counts || {};
  return [
    c.nodes && plural(c.nodes, 'part'), c.flows && plural(c.flows, 'flow'), c.changes && plural(c.changes, 'change'),
  ].filter(Boolean).join(' · ');
}

function explainerCard(explainer) {
  const href = explainerHref(explainer.slug);
  const dated = hubDate(explainer.generatedAt) || hubDate(explainer.publishedAt);
  const parts = [
    h('span', { class: 'top-row' }, h('span', null, KIND_LABELS[explainer.type] || 'Repo', explainer.origin === 'import' && h('span', { class: 'tag tag-imported' }, 'Imported')),
      h('span', null, dated || 'Undated')),
    cardThumb(explainer.thumb),
    h('span', { class: `card-title ${fitClass(explainer.title)}` }, softBreaks(text(explainer.title, explainer.slug))),
    explainer.repo && truncatable(h('span', { class: 'lib-repo' }), explainer.repo, { mode: 'middle' }),
    text(explainer.summary) && truncatable(h('span', { class: 'line lib-summary' }, softBreaks(explainer.summary)), explainer.summary),
    (explainer.status || list(explainer.tags).length > 0) && h('span', { class: 'lib-stack' },
      explainer.status && tag(explainer.status, 'tag-status'), list(explainer.tags).slice(0, 3).map((t) => tag(`#${t}`))),
    stackTags(explainer.stack),
    layerMarkers(explainer.layers),
    h('span', { class: 'card-foot' }, h('span', { class: 'lib-counts' }, countsLine(explainer.counts)), h('span', { class: 'card-open' }, 'Open')),
  ];
  return href ? h('a', { class: 'card lib-card', href }, parts) : h('div', { class: 'card lib-card' }, parts);
}

// Wrap each query word found in the text in <mark>, as text nodes only.
function highlight(value, words) {
  const source = String(value);
  const lower = source.toLowerCase();
  const ranges = words.flatMap((word) => {
    const found = [];
    for (let at = lower.indexOf(word); at >= 0 && word; at = lower.indexOf(word, at + word.length)) found.push([at, at + word.length]);
    return found;
  }).sort((a, b) => a[0] - b[0])
    .reduce((merged, range) => {
      const last = merged[merged.length - 1];
      return last && range[0] <= last[1] ? [...merged.slice(0, -1), [last[0], Math.max(last[1], range[1])]] : [...merged, range];
    }, []);
  const parts = [];
  let cursor = 0;
  ranges.forEach(([start, end]) => {
    if (start > cursor) parts.push(...softBreaks(source.slice(cursor, start)));
    parts.push(h('mark', null, softBreaks(source.slice(start, end))));
    cursor = end;
  });
  if (cursor < source.length) parts.push(...softBreaks(source.slice(cursor)));
  return parts;
}

function queryWords(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function resultRow(entry, words) {
  const href = libraryHref(entry.href);
  const body = [
    h('span', { class: 'tag result-type' }, TYPE_LABELS[entry.type] || text(entry.type, 'Item')),
    h('span', { class: 'result-text' },
      h('span', { class: 'result-title' }, highlight(text(entry.title, 'Untitled'), words)),
      text(entry.text) && truncatable(h('span', { class: 'result-snippet' }, highlight(entry.text, words)), entry.text)),
  ];
  return h('li', null, href ? h('a', { class: 'result-link', href }, body) : h('span', { class: 'result-link is-plain' }, body));
}

function resultGroups(groups, titles, words) {
  return [...groups.entries()].map(([slug, entries]) => h('section', { class: 'panel result-group', 'aria-label': titles.get(slug) || slug },
    h('div', { class: 'panel-bar' }, truncatable(h('span', { class: 'result-group-title' }, softBreaks(titles.get(slug) || slug)), titles.get(slug) || slug), h('span', null, plural(entries.length, 'match', 'matches'))),
    h('ul', { class: 'rows' }, entries.map((entry) => resultRow(entry, words)))));
}

function emptyLibrary() {
  return h('section', { class: 'panel lib-empty' },
    h('p', { class: 'eyebrow quiet' }, 'No explainers yet'),
    h('h2', null, 'Build one and it lands here'),
    h('p', null, 'Every explainer you build is added to this library. From a repo with an explainer.json, run:'),
    codeBlock('concept-explainer build <explainer.json>', 'sh'),
    h('p', null, 'Then reload this page.'));
}

function changeRow(entry, titles) {
  const href = libraryHref(entry.href);
  const isAgent = entry.authorType === 'agent';
  const body = [
    h('span', { class: 'row-date' }, hubDate(entry.date) || 'Undated'),
    h('span', { class: 'result-text' },
      h('span', { class: 'row-title' }, softBreaks(text(entry.title, 'Untitled'))),
      h('span', { class: 'result-snippet' }, softBreaks(titles.get(entry.slug) || entry.slug))),
    h('span', { class: 'hub-change-tags' },
      entry.authorType && tag(isAgent ? 'Agent' : 'Human', isAgent ? 'tag-agent' : 'tag-human'),
      entry.kind && tag(entry.kind)),
  ];
  return h('li', null, href ? h('a', { class: 'row-link hub-change', href }, body) : h('span', { class: 'row-link hub-change' }, body));
}

// ---------- Shell ----------
function hubNav(views, explainers, links, kitHref) {
  const item = (key, label, count) => {
    const a = h('a', { href: `#${key}`, 'data-nav': key }, h('span', { class: 'nav-label' }, label), h('span', { class: 'nav-count' }, String(count)));
    links.push(a);
    return h('li', null, a);
  };
  return h('nav', { class: 'links', 'aria-label': 'Library' },
    h('ul', null, views.map((v) => item(v.key, v.nav, v.count)),
      kitHref && h('li', null, h('a', { href: kitHref, class: 'nav-external' }, h('span', { class: 'nav-label' }, 'Design kit')))),
    explainers.length > 0 && [h('p', { class: 'side-label' }, 'Explainers'),
      h('ul', { class: 'hub-repos' }, explainers.map((e) => {
        const href = explainerHref(e.slug);
        const label = truncatable(h('span', { class: 'nav-label' }, softBreaks(text(e.title, e.slug))), text(e.title, e.slug));
        return h('li', null, href ? h('a', { href }, label) : label);
      }))]);
}

function hubShell(views, explainers, updatedAt, registry, kitHref) {
  const links = [];
  const foot = () => {
    const gear = settingsLink('#settings');
    links.push(gear.querySelector('a'));
    return [
      footMeta([plural(explainers.length, 'explainer'), updatedAt]),
      h('div', { class: 'foot-row' }, gear, themeSwitch(registry)),
    ];
  };
  const side = h('aside', { class: 'side', 'aria-label': 'Sidebar' },
    h('a', { class: 'brand', href: '#all' }, brandMark(), h('span', { class: 'name' }, 'Concept Explainer')),
    h('div', { class: 'side-repo' }, h('b', null, 'Explainer library'), h('span', { class: 'mono' }, plural(explainers.length, 'explainer'))),
    hubNav(views, explainers, links, kitHref),
    h('div', { class: 'side-foot' }, foot()));
  const closeButton = h('button', { class: 'btn sheet-close', type: 'button' }, h('span', { class: 'close-icon', 'aria-hidden': 'true' }), 'Close');
  const sheet = h('dialog', { class: 'sheet', 'aria-label': 'Menu' },
    h('div', { class: 'sheet-head' }, h('span', { class: 'name' }, 'Explainer library'), closeButton),
    hubNav(views, explainers, links, kitHref),
    h('div', { class: 'sheet-foot' }, foot()));
  closeButton.addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('a')) sheet.close();
  });
  const barView = h('span', { class: 'bar-view' });
  const top = h('header', { class: 'top' }, h('div', { class: 'bar' },
    h('a', { class: 'brand', href: '#all', 'aria-label': 'All explainers' }, brandMark(),
      h('span', { class: 'bar-names' }, h('span', { class: 'name' }, 'Explainer library'), barView)),
    h('div', { class: 'bar-actions' },
      quickTheme(registry),
      h('button', { class: 'btn menu-button', type: 'button', 'aria-haspopup': 'dialog', onclick: () => sheet.showModal() },
        h('span', { class: 'menu-icon', 'aria-hidden': 'true' }), 'Menu'))));
  return { side, sheet, top, links, barView };
}

// ---------- Views ----------
function readHubHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (raw === 'changes') return { view: 'changes', query: '' };
  if (raw === 'settings') return { view: 'settings', query: '' };
  const match = raw.match(/^search\/(.*)$/);
  if (!match) return { view: 'all', query: '' };
  try {
    return { view: 'all', query: decodeURIComponent(match[1]) };
  } catch (error) {
    return { view: 'all', query: match[1] };
  }
}

function moveFocus(container, step) {
  const items = [...container.querySelectorAll('a.result-link')];
  const index = items.indexOf(document.activeElement);
  const next = items[Math.min(Math.max(index + step, 0), items.length - 1)];
  if (next) next.focus();
  return next;
}

function bootLibrary() {
  const pageContext = readContext();
  applyLook(pageContext);
  applyReading();
  const app = document.getElementById('app');
  let data;
  try {
    data = JSON.parse(document.getElementById('explainer-data').textContent);
  } catch (error) {
    withServe(pageContext);
    fill(app, h('div', { class: 'fatal', role: 'alert' }, h('h1', null, 'The library could not load'),
      h('p', null, 'Its data is not valid JSON. Run "concept-explainer library rebuild" to write it again.')));
    return;
  }
  // The hub's data may name the serve endpoints; the token comes from the URL.
  const dataServe = data && data.serve && typeof data.serve === 'object' ? { serve: { ...data.serve, ...(pageContext.serve || {}) } } : {};
  const context = withServe({ ...pageContext, ...dataServe });
  const manifest = (data && data.manifest) || {};
  const explainers = list(manifest.explainers).filter((e) => e && typeof e.slug === 'string');
  const index = list(data && data.index).filter((e) => e && typeof e.slug === 'string');
  const titles = new Map(explainers.map((e) => [e.slug, text(e.title, e.slug)]));
  const changes = index.filter((e) => e.type === 'change').sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const stacks = stackFacets(explainers);
  const presets = presetFacets(explainers);
  const kinds = typeFacets(explainers);
  const tags = tagFacets(explainers);
  const views = [
    { key: 'all', nav: 'All explainers', count: explainers.length },
    { key: 'changes', nav: 'Recent changes', count: changes.length },
  ];
  const registry = themeRegistry();
  const shortDate = manifest.updatedAt && !Number.isNaN(new Date(manifest.updatedAt).getTime())
    ? new Date(manifest.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const shell = hubShell(views, explainers, shortDate, registry, safeHref(data && data.kitHref));
  const selected = new Set();
  const getSelection = () => {
    const shown = explainers.filter((e) => allowedSlugs().has(e.slug)).map((e) => e.slug);
    const filtered = Boolean(state.stack || state.preset || state.type || state.tag || input.value.trim());
    if (selected.size) return { slugs: [...selected], args: [...selected].map(shellQuote).join(' '), label: plural(selected.size, 'picked explainer') };
    if (!filtered) return { slugs: [], params: {}, args: '', label: 'the whole library' };
    // The CLI can select by type, tag, stack and search; a preset filter falls back to the shown slugs.
    if (!state.preset) {
      const params = Object.fromEntries([['type', state.type], ['tag', state.tag], ['stack', state.stack], ['search', input.value.trim()]].filter(([, v]) => v));
      const args = Object.entries(params).map(([k, v]) => `--${k} ${shellQuote(v)}`).join(' ');
      return { slugs: [], params, args, label: plural(shown.length, 'explainer') };
    }
    return { slugs: shown, args: shown.map(shellQuote).join(' '), label: plural(shown.length, 'explainer') };
  };
  const settings = settingsView(registry, {
    context, config: context.config || (data && data.config) || null, extra: [hubShareGroup(context, getSelection)],
  });
  let state = { stack: null, preset: null, type: null, tag: null, author: 'all' };
  let focusSearchNext = false;

  const input = h('input', {
    class: 'search hub-search', type: 'search', placeholder: 'Search every explainer', 'aria-label': 'Search every explainer',
    'aria-describedby': 'hub-search-hint', autocomplete: 'off', spellcheck: 'false',
  });
  const hint = h('span', { class: 'search-hint', id: 'hub-search-hint' }, 'Press ', h('kbd', null, '/'), ' to search, ', h('kbd', null, '↓'), ' to move through results.');
  const status = h('p', { class: 'hub-status', 'aria-live': 'polite' });
  const filters = h('div', { class: 'hub-filters' });
  const results = h('div', { class: 'hub-results' });
  const grid = h('ul', { class: 'cards lib-grid' });
  const pickBar = h('div', { class: 'pick-bar' });
  const changesList = h('ul', { class: 'rows' });
  const authorBar = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter by author' });

  const allView = h('section', { class: 'view hub-view', 'data-view': 'all', 'aria-labelledby': 'view-all-title' },
    h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow quiet' }, 'Library'),
      h('h1', { id: 'view-all-title', tabindex: '-1' }, 'Explainer library'),
      h('p', { class: 'view-lead' }, explainers.length
        ? `${plural(explainers.length, 'explainer')}. Search inside all of them, or open one.`
        : 'Explainers you build show up here.')),
    explainers.length > 0 && h('div', { class: 'hub-search-wrap' }, input, hint),
    explainers.length > 1 && filters,
    status, results,
    explainers.length > 0 && pickBar,
    explainers.length ? grid : emptyLibrary());
  const changesView = h('section', { class: 'view hub-view', 'data-view': 'changes', hidden: true, 'aria-labelledby': 'view-changes-title' },
    h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow quiet' }, 'Across every explainer'),
      h('h1', { id: 'view-changes-title', tabindex: '-1' }, 'Recent changes'),
      h('p', { class: 'view-lead' }, 'Every recorded change, newest first. Open one to see it in its explainer.')),
    changes.length ? [authorBar, h('div', { class: 'panel' }, changesList)] : h('p', { class: 'empty' }, 'No changes recorded yet.'));

  function allowedSlugs() {
    return new Set(explainers
      .filter((e) => (!state.stack || list(e.stack).map(String).includes(state.stack)) && (!state.preset || e.preset === state.preset)
        && (!state.type || (e.type || 'repo') === state.type) && (!state.tag || list(e.tags).map(String).includes(state.tag)))
      .map((e) => e.slug));
  }

  function renderAll() {
    const allowed = allowedSlugs();
    const query = input.value.trim();
    fill(filters,
      kinds.length > 1 && facetGroup('Type', kinds, state.type, (value) => { state = { ...state, type: value }; renderAll(); }, (v) => KIND_LABELS[v] || v),
      facetGroup('Tag', tags, state.tag, (value) => { state = { ...state, tag: value }; renderAll(); }, (v) => `#${v}`),
      facetGroup('Stack', stacks, state.stack, (value) => { state = { ...state, stack: value }; renderAll(); }),
      facetGroup('Preset', presets, state.preset, (value) => { state = { ...state, preset: value }; renderAll(); }));
    const shown = explainers.filter((e) => allowed.has(e.slug));
    if (query) {
      const hits = searchEntries(index, query, allowed);
      const groups = groupBySlug(hits);
      status.textContent = hits.length
        ? `${plural(hits.length, 'result')} in ${plural(groups.size, 'explainer')}${hits.length === RESULT_LIMIT ? ', showing the best' : ''}.`
        : `Nothing matches "${query}".`;
      fill(results, ...resultGroups(groups, titles, queryWords(query)));
      grid.hidden = true;
    } else {
      status.textContent = explainers.length && shown.length !== explainers.length ? `${plural(shown.length, 'explainer')} match these filters.` : '';
      fill(results);
      grid.hidden = false;
    }
    fill(grid, ...(shown.length ? shown.map((e) => h('li', { class: 'lib-item' }, explainerCard(e), pickBox(e))) : [h('li', { class: 'empty' }, 'No explainer matches these filters.')]));
    paintPicks(shown);
  }

  // Pick explainers to export. The box sits beside the card link, not in it.
  function pickBox(explainer) {
    const box = h('input', {
      type: 'checkbox', class: 'pick-input', checked: selected.has(explainer.slug), 'aria-label': `Pick ${text(explainer.title, explainer.slug)} to export`,
      onchange: () => { if (box.checked) selected.add(explainer.slug); else selected.delete(explainer.slug); paintPicks(); },
    });
    return h('label', { class: 'card-pick' }, box);
  }

  function paintPicks(shown = explainers.filter((e) => allowedSlugs().has(e.slug))) {
    fill(pickBar,
      h('span', { class: 'pick-count' }, selected.size ? `${plural(selected.size, 'explainer')} picked` : 'Pick explainers to export them'),
      h('button', { class: 'link', type: 'button', onclick: () => { shown.forEach((e) => selected.add(e.slug)); renderAll(); } }, `Pick all ${shown.length} shown`),
      selected.size > 0 && h('button', { class: 'link', type: 'button', onclick: () => { selected.clear(); renderAll(); } }, 'Clear'),
      h('a', { class: 'link', href: '#settings' }, selected.size ? 'Export them' : 'Export or import'));
  }

  function renderChanges() {
    fill(authorBar, ...HUB_AUTHORS.map((a) => h('button', {
      class: 'seg-option', type: 'button', 'aria-pressed': String(state.author === a.id),
      onclick: () => { state = { ...state, author: a.id }; renderChanges(); },
    }, a.label)));
    const rows = changes.filter((c) => state.author === 'all' || c.authorType === state.author);
    fill(changesList, ...(rows.length ? rows.map((c) => changeRow(c, titles)) : [h('li', { class: 'empty' }, 'Nothing matches this filter.')]));
  }

  function route({ initial = false } = {}) {
    const { view, query } = readHubHash();
    allView.hidden = view !== 'all';
    changesView.hidden = view !== 'changes';
    settings.section.hidden = view !== 'settings';
    shell.links.forEach((a) => {
      if (a.dataset.nav === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const viewName = { changes: 'Recent changes', settings: 'Settings' }[view] || 'All explainers';
    shell.barView.textContent = viewName;
    document.title = `${view === 'all' ? 'Explainer library' : viewName} · Concept Explainer`;
    if (view === 'all' && input.value !== query) input.value = query;
    if (view === 'all') renderAll(); else if (view === 'changes') renderChanges();
    if (initial && !window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (focusSearchNext) {
      focusSearchNext = false;
      input.focus();
      input.select();
    } else if (!(initial && query)) {
      const heading = ({ changes: changesView, settings: settings.section }[view] || allView).querySelector('h1');
      if (heading) heading.focus({ preventScroll: true });
    }
  }

  input.addEventListener('input', () => {
    const query = input.value.trim();
    setDeepLink(query ? `search/${encodeURIComponent(query)}` : 'all');
    renderAll();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && moveFocus(results, 1)) event.preventDefault();
    if (event.key === 'Escape' && input.value) {
      input.value = '';
      setDeepLink('all');
      renderAll();
    }
  });
  results.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(results, 1); }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const items = [...results.querySelectorAll('a.result-link')];
      if (items.indexOf(document.activeElement) <= 0) input.focus(); else moveFocus(results, -1);
    }
    if (event.key === 'Escape') { event.preventDefault(); input.focus(); }
  });
  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest && event.target.closest('input, textarea, [contenteditable="true"]');
    const wantsSearch = (event.key === '/' && !typing) || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey));
    if (!wantsSearch || !explainers.length) return;
    event.preventDefault();
    if (shell.sheet.open) shell.sheet.close();
    if (readHubHash().view !== 'all') {
      focusSearchNext = true;
      window.location.hash = 'all';
      return;
    }
    input.focus();
    input.select();
  });

  const main = h('main', { id: 'main', class: 'main-col', tabindex: '-1' }, shell.top,
    h('div', { class: 'wrap' }, allView, changesView, settings.section,
      h('footer', { class: 'site-footer' }, h('p', null, 'Built by concept-explainer. Rebuild every page with "concept-explainer library rebuild".'))));
  fill(app, h('div', { class: 'app' }, shell.side, main), shell.sheet);
  app.removeAttribute('aria-busy');
  registry.paint();
  installThemeShortcut(registry);
  wireSkipLink(main);
  window.addEventListener('hashchange', () => route());
  route({ initial: true });
  if (readHubHash().query) input.focus();
}
