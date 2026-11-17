// Library hub: every explainer in the library, searchable in one place.
// Data contract: { manifest, index } as documented in references/library.md.
// Every string goes through text nodes; hrefs must point inside explainers/.
const LIBRARY_HREF = /^explainers\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html(?:#[^\s]*)?$/;
const RESULT_LIMIT = 60;
const STACK_FACETS = 10;
const TYPE_LABELS = {
  explainer: 'Explainer', node: 'Part', flow: 'Flow', step: 'Step', change: 'Change',
  entity: 'Data', concept: 'Idea', glossary: 'Term', file: 'File', run: 'Command',
};
const TYPE_ORDER = ['explainer', 'node', 'flow', 'step', 'entity', 'change', 'concept', 'glossary', 'file', 'run'];
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

function presetFacets(explainers) {
  return [...new Set(explainers.map((e) => e.preset).filter((p) => typeof p === 'string' && p))].sort();
}

function facetGroup(label, options, current, onPick) {
  if (!options.length) return null;
  const chip = (value, name) => h('button', {
    class: 'facet', type: 'button', 'aria-pressed': String(current === value), title: name, onclick: () => onPick(value),
  }, h('span', { class: 'facet-text' }, name));
  return h('div', { class: 'facet-group', role: 'group', 'aria-label': label },
    h('span', { class: 'eyebrow quiet' }, label),
    h('span', { class: 'facet-chips' }, chip(null, 'Any'), options.map((option) => chip(option, option))));
}

// ---------- Pieces ----------
function layerMarkers(layers) {
  const items = list(layers).filter((l) => l && l.label);
  if (!items.length) return null;
  return h('span', { class: 'lib-layers', 'aria-label': `Layers: ${items.map((l) => l.label).join(', ')}` },
    items.slice(0, 8).map((l) => h('span', { class: 'layer-dot', title: l.label, style: layerStyle(l.color) })));
}

function stackTags(stack, max = 4) {
  const items = list(stack).map(String);
  if (!items.length) return null;
  return h('span', { class: 'lib-stack' },
    items.slice(0, max).map((item) => h('span', { class: 'tag', title: item }, item)),
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
    h('span', { class: 'top-row' }, h('span', null, dated || 'Undated'), explainer.commit && h('span', null, String(explainer.commit).slice(0, 7))),
    h('span', { class: `card-title ${fitClass(explainer.title)}` }, text(explainer.title, explainer.slug)),
    explainer.repo && h('span', { class: 'lib-repo', title: explainer.repo }, explainer.repo),
    text(explainer.summary) && h('span', { class: 'line lib-summary' }, explainer.summary),
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
    if (start > cursor) parts.push(source.slice(cursor, start));
    parts.push(h('mark', null, source.slice(start, end)));
    cursor = end;
  });
  if (cursor < source.length) parts.push(source.slice(cursor));
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
      text(entry.text) && h('span', { class: 'result-snippet' }, highlight(entry.text, words))),
  ];
  return h('li', null, href ? h('a', { class: 'result-link', href }, body) : h('span', { class: 'result-link is-plain' }, body));
}

function resultGroups(groups, titles, words) {
  return [...groups.entries()].map(([slug, entries]) => h('section', { class: 'panel result-group', 'aria-label': titles.get(slug) || slug },
    h('div', { class: 'panel-bar' }, h('span', { class: 'result-group-title', title: titles.get(slug) || slug }, titles.get(slug) || slug), h('span', null, plural(entries.length, 'match', 'matches'))),
    h('ul', { class: 'rows' }, entries.map((entry) => resultRow(entry, words)))));
}

function emptyLibrary() {
  return h('section', { class: 'panel lib-empty' },
    h('p', { class: 'eyebrow quiet' }, 'No explainers yet'),
    h('h2', null, 'Build one and it lands here'),
    h('p', null, 'Every explainer you build is added to this library. From a repo with an explainer.json, run:'),
    codeBlock('repo-explainer build <explainer.json>', 'sh'),
    h('p', null, 'Then reload this page.'));
}

function changeRow(entry, titles) {
  const href = libraryHref(entry.href);
  const isAgent = entry.authorType === 'agent';
  const body = [
    h('span', { class: 'row-date' }, hubDate(entry.date) || 'Undated'),
    h('span', { class: 'result-text' },
      h('span', { class: 'row-title' }, text(entry.title, 'Untitled')),
      h('span', { class: 'result-snippet' }, titles.get(entry.slug) || entry.slug)),
    h('span', { class: 'hub-change-tags' },
      entry.authorType && tag(isAgent ? 'Agent' : 'Human', isAgent ? 'tag-agent' : 'tag-human'),
      entry.kind && tag(entry.kind)),
  ];
  return h('li', null, href ? h('a', { class: 'row-link hub-change', href }, body) : h('span', { class: 'row-link hub-change' }, body));
}

// ---------- Shell ----------
function hubNav(views, explainers, links) {
  const item = (key, label, count) => {
    const a = h('a', { href: `#${key}`, 'data-nav': key }, h('span', { class: 'nav-label' }, label), h('span', { class: 'nav-count' }, String(count)));
    links.push(a);
    return h('li', null, a);
  };
  return h('nav', { class: 'links', 'aria-label': 'Library' },
    h('ul', null, views.map((v) => item(v.key, v.nav, v.count))),
    explainers.length > 0 && [h('p', { class: 'side-label' }, 'Explainers'),
      h('ul', { class: 'hub-repos' }, explainers.map((e) => {
        const href = explainerHref(e.slug);
        const label = h('span', { class: 'nav-label' }, text(e.title, e.slug));
        return h('li', null, href ? h('a', { href, title: text(e.title, e.slug) }, label) : label);
      }))]);
}

function hubShell(views, explainers, updatedAt, registry) {
  const links = [];
  const foot = () => [
    h('p', { class: 'side-progress' }, `${plural(explainers.length, 'explainer')}${updatedAt ? `, updated ${updatedAt}` : ''}`),
    lookControls(registry),
  ];
  const side = h('aside', { class: 'side', 'aria-label': 'Sidebar' },
    h('a', { class: 'brand', href: '#all' }, brandMark(), h('span', { class: 'name' }, 'Repo Explainer')),
    h('div', { class: 'side-repo' }, h('b', null, 'Explainer library'), h('span', { class: 'mono' }, plural(explainers.length, 'explainer'))),
    hubNav(views, explainers, links),
    h('div', { class: 'side-foot' }, foot()));
  const closeButton = h('button', { class: 'btn sheet-close', type: 'button' }, h('span', { class: 'close-icon', 'aria-hidden': 'true' }), 'Close');
  const sheet = h('dialog', { class: 'sheet', 'aria-label': 'Menu' },
    h('div', { class: 'sheet-head' }, h('span', { class: 'name' }, 'Explainer library'), closeButton),
    hubNav(views, explainers, links),
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
      h('button', { class: 'btn menu-button', type: 'button', 'aria-haspopup': 'dialog', onclick: () => sheet.showModal() },
        h('span', { class: 'menu-icon', 'aria-hidden': 'true' }), 'Menu'))));
  return { side, sheet, top, links, barView };
}

// ---------- Views ----------
function readHubHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (raw === 'changes') return { view: 'changes', query: '' };
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
  applyLook(readContext());
  const app = document.getElementById('app');
  let data;
  try {
    data = JSON.parse(document.getElementById('explainer-data').textContent);
  } catch (error) {
    fill(app, h('div', { class: 'fatal', role: 'alert' }, h('h1', null, 'The library could not load'),
      h('p', null, 'Its data is not valid JSON. Run "repo-explainer library rebuild" to write it again.')));
    return;
  }
  const manifest = (data && data.manifest) || {};
  const explainers = list(manifest.explainers).filter((e) => e && typeof e.slug === 'string');
  const index = list(data && data.index).filter((e) => e && typeof e.slug === 'string');
  const titles = new Map(explainers.map((e) => [e.slug, text(e.title, e.slug)]));
  const changes = index.filter((e) => e.type === 'change').sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const stacks = stackFacets(explainers);
  const presets = presetFacets(explainers);
  const views = [
    { key: 'all', nav: 'All explainers', count: explainers.length },
    { key: 'changes', nav: 'Recent changes', count: changes.length },
  ];
  const registry = themeRegistry();
  const shell = hubShell(views, explainers, hubDate(manifest.updatedAt), registry);
  let state = { stack: null, preset: null, author: 'all' };
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
    explainers.length ? grid : emptyLibrary());
  const changesView = h('section', { class: 'view hub-view', 'data-view': 'changes', hidden: true, 'aria-labelledby': 'view-changes-title' },
    h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow quiet' }, 'Across every explainer'),
      h('h1', { id: 'view-changes-title', tabindex: '-1' }, 'Recent changes'),
      h('p', { class: 'view-lead' }, 'Every recorded change, newest first. Open one to see it in its explainer.')),
    changes.length ? [authorBar, h('div', { class: 'panel' }, changesList)] : h('p', { class: 'empty' }, 'No changes recorded yet.'));

  function allowedSlugs() {
    return new Set(explainers
      .filter((e) => (!state.stack || list(e.stack).map(String).includes(state.stack)) && (!state.preset || e.preset === state.preset))
      .map((e) => e.slug));
  }

  function renderAll() {
    const allowed = allowedSlugs();
    const query = input.value.trim();
    fill(filters,
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
    fill(grid, ...(shown.length ? shown.map((e) => h('li', null, explainerCard(e))) : [h('li', { class: 'empty' }, 'No explainer matches these filters.')]));
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
    shell.links.forEach((a) => {
      if (a.dataset.nav === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    shell.barView.textContent = view === 'changes' ? 'Recent changes' : 'All explainers';
    document.title = `${view === 'changes' ? 'Recent changes' : 'Explainer library'} · Repo Explainer`;
    if (view === 'all' && input.value !== query) input.value = query;
    if (view === 'all') renderAll(); else renderChanges();
    if (initial && !window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (focusSearchNext) {
      focusSearchNext = false;
      input.focus();
      input.select();
    } else if (!(initial && query)) {
      const heading = (view === 'changes' ? changesView : allView).querySelector('h1');
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
    h('div', { class: 'wrap' }, allView, changesView,
      h('footer', { class: 'site-footer' }, h('p', null, 'Built by repo-explainer. Rebuild every page with "repo-explainer library rebuild".'))));
  fill(app, h('div', { class: 'app' }, shell.side, main), shell.sheet);
  app.removeAttribute('aria-busy');
  registry.paint();
  wireSkipLink(main);
  window.addEventListener('hashchange', () => route());
  route({ initial: true });
  if (readHubHash().query) input.focus();
}
