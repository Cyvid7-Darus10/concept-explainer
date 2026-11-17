// Library hub (stub). Lists every explainer and searches the embedded index.
// Data contract: { manifest, index } as documented in references/library.md.
// Every string goes through text nodes; hrefs must point inside explainers/.
const LIBRARY_HREF = /^explainers\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html(?:#[^\s]*)?$/;
const RESULT_LIMIT = 50;

function libraryHref(value) {
  return typeof value === 'string' && LIBRARY_HREF.test(value) ? value : null;
}

function libraryMatches(index, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index.filter((entry) => {
    const hay = `${text(entry.title)} ${text(entry.text)}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  }).slice(0, RESULT_LIMIT);
}

function libraryCard(entry) {
  const href = libraryHref(`explainers/${entry.slug}/index.html`);
  return h('li', { class: 'card' },
    h('h3', null, href ? h('a', { class: 'link', href }, text(entry.title, entry.slug)) : text(entry.title, entry.slug)),
    h('p', null, text(entry.summary)),
    list(entry.stack).length > 0 && h('p', null, list(entry.stack).map((item) => h('span', { class: 'chip' }, String(item)))));
}

function libraryResult(entry, titles) {
  const href = libraryHref(entry.href);
  return h('li', null,
    h('span', { class: 'tag' }, text(entry.type)), ' ',
    href ? h('a', { class: 'link', href }, text(entry.title)) : text(entry.title),
    ' · ', titles.get(entry.slug) || text(entry.slug),
    text(entry.text) && h('p', null, text(entry.text)));
}

function readSearchHash() {
  const match = window.location.hash.match(/^#search\/(.*)$/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return '';
  }
}

function bootLibrary() {
  const app = document.getElementById('app');
  let data;
  try {
    data = JSON.parse(document.getElementById('explainer-data').textContent);
  } catch (error) {
    fill(app, h('p', { class: 'fatal' }, 'The library data could not be read. Run "repo-explainer library rebuild".'));
    return;
  }
  const explainers = list(data && data.manifest && data.manifest.explainers);
  const index = list(data && data.index);
  const titles = new Map(explainers.map((e) => [e.slug, text(e.title, e.slug)]));
  const results = h('ul', { class: 'search-results', 'aria-live': 'polite' });
  const input = h('input', { class: 'search', type: 'search', placeholder: 'Search every explainer', 'aria-label': 'Search every explainer' });

  const render = () => {
    const query = input.value.trim();
    const found = libraryMatches(index, query);
    fill(results, query && !found.length ? h('li', { class: 'empty' }, 'No matches.') : found.map((entry) => libraryResult(entry, titles)));
  };
  input.addEventListener('input', () => {
    const query = input.value.trim();
    history.replaceState(null, '', query ? `#search/${encodeURIComponent(query)}` : '#');
    render();
  });
  document.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if ((event.key === '/' && !typing) || (event.key === 'k' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      input.focus();
    }
  });

  const body = explainers.length
    ? h('ul', { class: 'library-grid' }, explainers.map(libraryCard))
    : h('p', { class: 'empty' }, 'No explainers yet. Run "repo-explainer build <explainer.json>" to add one.');
  fill(app, h('main', { id: 'main', class: 'wrap' },
    h('h1', null, 'Explainer library'),
    h('p', null, `${explainers.length} explainer${explainers.length === 1 ? '' : 's'}`),
    input, results, body));
  input.value = readSearchHash();
  render();
  app.removeAttribute('aria-busy');
}
