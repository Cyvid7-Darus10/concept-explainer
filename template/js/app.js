// Boot: read the embedded data and library context, build the dashboard
// shell (sidebar, phone bar, menu sheet) and show one view per hash.
const DESIGN_CREDIT = 'Lesson pacing inspired by Brilliant. Type and greys from Geist by Vercel. Not affiliated with either.';
const CHAPTERS = [
  { key: 'map', nav: 'Architecture', title: 'The big picture', lead: 'Every box is one part of the system. Pick one to see what it does and who it talks to.', count: (d) => list(d.nodes).length, unit: 'parts', has: (d) => list(d.nodes).length > 0, render: renderMap },
  { key: 'flows', nav: 'Flows', title: 'Follow it end to end', lead: 'Pick a flow and press Continue. Each step is one hop, with the exact file that does the work.', count: (d) => list(d.flows).length, unit: 'flows', has: (d) => list(d.flows).length > 0, render: renderFlows },
  { key: 'changes', nav: 'Changes', title: 'What changed, and why', lead: 'Recent merges from people and agents, each with its reason. Show them on the map to see which parts moved.', count: (d) => list(d.changes).length, unit: 'changes', has: (d) => list(d.changes).length > 0, render: renderChanges },
  { key: 'tree', nav: 'Where things live', title: 'Where things live', lead: 'The folders worth knowing. Key ones are where most changes happen.', count: (d) => list(d.tree).length, unit: 'paths', has: (d) => list(d.tree).length > 0, render: renderTree },
  { key: 'data', nav: 'Data model', title: 'The data', lead: 'What the system stores and how the pieces relate.', count: (d) => list(d.dataModel).length, unit: 'entities', has: (d) => list(d.dataModel).length > 0, render: renderModels },
  { key: 'concepts', nav: 'Key ideas', title: 'Key ideas', lead: 'The few patterns you need to read this code with confidence. One idea at a time.', count: (d) => list(d.concepts).length, unit: 'ideas', has: (d) => list(d.concepts).length > 0, render: renderConcepts },
  { key: 'quiz', nav: 'Check yourself', title: 'Check yourself', lead: 'A few quick questions. If you can answer these, you can find your way around.', count: (d) => list(d.quiz).length, unit: 'questions', has: (d) => list(d.quiz).length > 0, render: renderQuiz },
  { key: 'glossary', nav: 'Glossary', title: 'Glossary', lead: 'Words this codebase uses in its own way.', count: (d) => list(d.glossary).length, unit: 'terms', has: (d) => list(d.glossary).length > 0, render: renderGlossary },
  { key: 'run', nav: 'Run it', title: 'Run it yourself', lead: 'Commands to get it running on your machine.', count: (d) => list(d.runbook).length, unit: 'commands', has: (d) => list(d.runbook).length > 0, render: renderRunbook },
];

function chooseChapters(data) {
  const requested = list(data.meta && data.meta.chapters);
  const order = requested.length ? requested : CHAPTERS.map((c) => c.key);
  return order
    .map((key) => CHAPTERS.find((c) => c.key === key))
    .filter((chapter) => chapter && chapter.has(data))
    .map((chapter) => {
      const intro = (data.intros || {})[chapter.key];
      return { ...chapter, title: text(intro && intro.title, chapter.title), lead: text(intro && intro.lead, chapter.lead) };
    });
}

// The library context is optional: missing, broken or unfilled means standalone.
function readContext() {
  const el = document.getElementById('explainer-context');
  const raw = el ? el.textContent.trim() : '';
  if (!raw || raw === '__CONTEXT__') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

// A relative link (../../index.html) or an http(s) one. No other schemes.
function safeHref(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (safeUrl(trimmed)) return safeUrl(trimmed);
  return /^[a-z][a-z0-9+.-]*:|^\/\//i.test(trimmed) ? null : trimmed;
}

// ---------- Viewed chapters (this browser only) ----------
function viewedStore(meta) {
  const key = `repo-explainer:viewed:${text(meta.repo, meta.title)}:${text(meta.commit, '')}`;
  let viewed = new Set();
  try {
    viewed = new Set(list(JSON.parse(readStore(key) || '[]')).filter((v) => typeof v === 'string'));
  } catch (error) {
    viewed = new Set();
  }
  return {
    has: (k) => viewed.has(k),
    add: (k) => {
      if (viewed.has(k)) return;
      viewed = new Set([...viewed, k]);
      writeStore(key, JSON.stringify([...viewed]));
    },
    size: (keys) => keys.filter((k) => viewed.has(k)).length,
  };
}

// ---------- Shell ----------
function navList(chapters, data, links) {
  const item = (key, label, count) => {
    const a = h('a', { href: `#${key}`, 'data-nav': key },
      h('span', { class: 'nav-label' }, label),
      count !== null && h('span', { class: 'nav-count' }, String(count)));
    links.push(a);
    return h('li', null, a);
  };
  return h('nav', { class: 'links', 'aria-label': 'Explainer' },
    h('ul', null, item('overview', 'Overview', null)),
    h('p', { class: 'side-label' }, 'Chapters'),
    h('ul', null, chapters.map((c) => item(c.key, c.nav, c.count(data)))));
}

function footBits(meta, context, registry, progressLines) {
  const library = safeHref(context.libraryHref);
  const progress = h('p', { class: 'side-progress' });
  progressLines.push(progress);
  return [
    progress,
    library && h('div', { class: 'side-util' }, h('a', { class: 'util', href: library }, h('span', { class: 'util-ic' }, icon('library_shelf')), 'Library')),
    h('div', { class: 'side-theme' }, h('span', { class: 'side-theme-label' }, 'Theme'), themeSwitch(registry)),
    (meta.generatedAt || meta.commit) && h('p', { class: 'side-stamp' },
      meta.generatedAt && h('span', null, `Generated ${formatDate(meta.generatedAt)}`),
      meta.commit && h('span', null, `Commit ${String(meta.commit).slice(0, 7)}`)),
  ];
}

function brandRow() {
  return h('a', { class: 'brand', href: '#overview' }, brandMark(), h('span', { class: 'name' }, 'Repo Explainer'));
}

function buildShell(data, chapters, context, registry) {
  const meta = data.meta;
  const links = [];
  const progressLines = [];
  const side = h('aside', { class: 'side', 'aria-label': 'Sidebar' },
    brandRow(),
    h('div', { class: 'side-repo' }, h('b', null, meta.title), meta.repo && h('span', { class: 'mono' }, meta.repo)),
    navList(chapters, data, links),
    h('div', { class: 'side-foot' }, footBits(meta, context, registry, progressLines)));

  const closeButton = h('button', { class: 'btn sheet-close', type: 'button' }, h('span', { class: 'close-icon', 'aria-hidden': 'true' }), 'Close');
  const sheet = h('dialog', { class: 'sheet', 'aria-label': 'Menu' },
    h('div', { class: 'sheet-head' }, h('span', { class: 'name' }, meta.title), closeButton),
    navList(chapters, data, links),
    h('div', { class: 'sheet-foot' }, footBits(meta, context, registry, progressLines)));
  closeButton.addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('a[href^="#"]')) sheet.close();
  });

  const barView = h('span', { class: 'bar-view' });
  const library = safeHref(context.libraryHref);
  const menuButton = h('button', { class: 'btn menu-button', type: 'button', 'aria-haspopup': 'dialog', onclick: () => sheet.showModal() },
    h('span', { class: 'menu-icon', 'aria-hidden': 'true' }), 'Menu');
  const top = h('header', { class: 'top' }, h('div', { class: 'bar' },
    h('a', { class: 'brand', href: '#overview', 'aria-label': 'Overview' }, brandMark(),
      h('span', { class: 'bar-names' }, h('span', { class: 'name' }, meta.title), barView)),
    h('div', { class: 'bar-actions' },
      library && h('a', { class: 'btn bar-library', href: library }, 'Library'),
      menuButton)));
  return { side, sheet, top, links, progressLines, barView };
}

// ---------- Views ----------
function viewHead(key, eyebrow, title, lead) {
  return h('header', { class: 'view-head' },
    h('p', { class: 'eyebrow quiet' }, eyebrow),
    h('h1', { id: `view-${key}-title`, tabindex: '-1' }, title),
    lead && h('p', { class: 'view-lead' }, lead));
}

function pager(chapters, index) {
  const prev = index > 0 ? chapters[index - 1] : { key: 'overview', nav: 'Overview' };
  const next = chapters[index + 1];
  const cell = (chapter, label, cls) => h('a', { class: `pager-link ${cls}`, href: `#${chapter.key}` },
    h('span', { class: 'eyebrow quiet' }, label), h('span', { class: 'pager-title' }, chapter.nav));
  return h('nav', { class: 'pager', 'aria-label': 'Chapters' },
    cell(prev, 'Previous', 'is-prev'),
    next ? cell(next, 'Next', 'is-next') : cell({ key: 'overview', nav: 'Overview' }, 'Done', 'is-next'));
}

function chapterView(chapter, index, chapters, data, ctx) {
  const body = h('div', { class: 'view-body' });
  const section = h('section', { class: 'view', 'data-view': chapter.key, hidden: true, 'aria-labelledby': `view-${chapter.key}-title` },
    viewHead(chapter.key, `Chapter ${index + 1} of ${chapters.length}`, chapter.title, chapter.lead),
    body,
    pager(chapters, index));
  let controller = null;
  try {
    controller = chapter.render(data, body, ctx) || null;
  } catch (error) {
    body.append(h('p', { class: 'empty' }, `This chapter could not be drawn: ${error.message}`));
  }
  return { key: chapter.key, title: chapter.title, nav: chapter.nav, section, controller };
}

function overviewView(data, ctx) {
  const body = h('div', { class: 'view-body' });
  const section = h('section', { class: 'view view-overview', 'data-view': 'overview', hidden: true, 'aria-labelledby': 'view-overview-title' }, body);
  const controller = renderOverview(data, body, ctx);
  return { key: 'overview', title: 'Overview', nav: 'Overview', section, controller };
}

// ---------- Routing (deep-link contract: references/library.md) ----------
function decodePart(part) {
  try {
    return decodeURIComponent(part);
  } catch (error) {
    return part;
  }
}

function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return { view: 'overview', parts: [] };
  const [head, ...rest] = raw.split('/');
  return { view: decodePart(head), parts: rest.map(decodePart).filter((p) => p !== '') };
}

function createRouter(views, shell, chapters, viewed, meta) {
  const chapterKeys = chapters.map((c) => c.key);
  function paintProgress() {
    const line = `${viewed.size(chapterKeys)} / ${chapterKeys.length} viewed`;
    shell.progressLines.forEach((el) => { el.textContent = line; });
    shell.links.forEach((a) => a.classList.toggle('is-viewed', viewed.has(a.dataset.nav)));
  }

  function show(view) {
    views.forEach((v) => { v.section.hidden = v !== view; });
    shell.links.forEach((a) => {
      if (a.dataset.nav === view.key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    shell.barView.textContent = view.nav;
    document.title = view.key === 'overview' ? `${meta.title} · Repo Explainer` : `${view.title} · ${meta.title}`;
    if (view.key !== 'overview') viewed.add(view.key);
    paintProgress();
  }

  function route({ initial = false } = {}) {
    const { view: key, parts } = parseHash(window.location.hash);
    const view = views.find((v) => v.key === key) || views[0];
    show(view);
    let target = null;
    try {
      target = view.controller && view.controller.open ? view.controller.open(view.key === key ? parts : []) : null;
    } catch (error) {
      target = null;
    }
    if (initial && !window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const heading = view.section.querySelector('h1');
    if (heading) heading.focus({ preventScroll: true });
    if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'instant' });
  }

  window.addEventListener('hashchange', () => route());
  return { route };
}

function fatal(app, message) {
  fill(app, h('div', { class: 'fatal', role: 'alert' }, h('h1', null, 'This explainer could not load'), h('p', null, message)));
}

function boot() {
  applyTheme(storedTheme());
  const app = document.getElementById('app');
  let data;
  try {
    data = JSON.parse(document.getElementById('explainer-data').textContent);
  } catch (error) {
    fatal(app, `The embedded data is not valid JSON (${error.message}). Rebuild it with repo-explainer build.`);
    return;
  }
  if (!data || !data.meta || !data.meta.title) {
    fatal(app, 'The embedded data has no meta.title. Run repo-explainer validate to see what is missing.');
    return;
  }
  const context = readContext();
  const chapters = chooseChapters(data);
  const viewed = viewedStore(data.meta);
  const registry = themeRegistry();
  const shell = buildShell(data, chapters, context, registry);
  const ctx = { chapters, viewed, context };
  const views = [overviewView(data, ctx), ...chapters.map((c, i) => chapterView(c, i, chapters, data, ctx))];
  const meta = data.meta;
  const stamp = [meta.generatedAt && `Generated ${formatDate(meta.generatedAt)}`, meta.commit && `at ${String(meta.commit).slice(0, 7)}`].filter(Boolean).join(' ');
  const main = h('main', { id: 'main', class: 'main-col', tabindex: '-1' },
    shell.top,
    h('div', { class: 'wrap' }, views.map((v) => v.section),
      h('footer', { class: 'site-footer' },
        h('p', null, `${stamp ? `${stamp} ` : ''}with repo-explainer.`),
        h('p', null, DESIGN_CREDIT))));
  fill(app, h('div', { class: 'app' }, shell.side, main), shell.sheet);
  app.removeAttribute('aria-busy');
  registry.paint();
  // The skip link moves focus only; a "#main" hash would read as a view name.
  const skip = document.querySelector('.skip');
  if (skip) {
    skip.addEventListener('click', (event) => {
      event.preventDefault();
      main.focus();
    });
  }
  createRouter(views, shell, chapters, viewed, data.meta).route({ initial: true });
}
