// The kit page: every reusable piece, rendered by the same code the explainer
// uses. Agents look things up here instead of drawing their own.
const KIT_SECTIONS = [
  { id: 'kit-icons', nav: 'Icons' },
  { id: 'kit-layers', nav: 'Layer markers' },
  { id: 'kit-tokens', nav: 'Tokens' },
  { id: 'kit-components', nav: 'Components' },
  { id: 'kit-patterns', nav: 'Flow patterns' },
];
const KIT_TOKENS = [
  ['--canvas', '#fafafa', 'Page background'],
  ['--surface', '#ffffff', 'Cards, panels, sidebar'],
  ['--line', '#ebebeb', 'Hairline rings and dividers'],
  ['--ink', '#171717', 'Headings and strong text'],
  ['--body', '#4d4d4d', 'Body text'],
  ['--muted', '#666666', 'Captions and mono labels'],
  ['--faint', '#c9c9c9', 'Idle lines and disabled text'],
  ['--accent', '#fc5e32', 'Marks, rings, progress. Never text.'],
  ['--accent-fill', '#d2430e', 'Primary buttons, under white text'],
  ['--accent-text', '#c2410c', 'Orange text, when it must be orange'],
  ['--good', '#297a3a', 'Correct answers only'],
  ['--bad', '#cb2a2f', 'Wrong answers only'],
];

function kitSection(id, title, lead, ...children) {
  return h('section', { class: 'kit-section', id, 'aria-labelledby': `${id}-title` },
    h('header', null, h('h2', { id: `${id}-title` }, title), h('p', null, lead)),
    children);
}

function swatch([name, value, note]) {
  return h('div', { class: 'panel kit-swatch' },
    h('div', { class: 'kit-chip', style: `background:var(${name})` }),
    h('b', null, name), h('code', null, value), note && h('p', null, note));
}

function kitSidebar(registry, version) {
  return h('aside', { class: 'side', 'aria-label': 'Sidebar' },
    h('a', { class: 'brand', href: '#main' }, brandMark(), h('span', { class: 'name' }, 'Repo Explainer')),
    h('div', { class: 'side-repo' }, h('b', null, 'Design kit'), h('span', { class: 'mono' }, `v${version}`)),
    h('nav', { class: 'links', 'aria-label': 'Kit' }, h('ul', null, KIT_SECTIONS.map((sec) => h('li', null,
      h('a', { href: `#${sec.id}` }, h('span', { class: 'nav-label' }, sec.nav)))))),
    h('div', { class: 'side-foot' },
      h('div', { class: 'side-theme' }, h('span', { class: 'side-theme-label' }, 'Theme'), themeSwitch(registry))));
}

function kitComponents() {
  return h('div', { class: 'panel kit-stack' },
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', type: 'button' }, 'Continue'),
      h('button', { class: 'btn', type: 'button' }, 'Back'),
      h('button', { class: 'btn small', type: 'button' }, 'Show on map'),
      h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Check')),
    h('div', { class: 'btn-row' },
      h('span', { class: 'chip' }, 'Next.js'), fileChip('src/app/api/route.ts:42'),
      ['request', 'response', 'async', 'data'].map((k) => tag(k, `tag-${k}`)),
      tag('Agent', 'tag-agent'), tag('Human', 'tag-human'), tag('New', 'tag-new'), tag('Key', 'tag-key')),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Example filter' },
      h('button', { class: 'seg-option', type: 'button', 'aria-pressed': 'true' }, 'Everyone'),
      h('button', { class: 'seg-option', type: 'button', 'aria-pressed': 'false' }, 'Agents'),
      h('button', { class: 'seg-option', type: 'button', 'aria-pressed': 'false' }, 'Humans')),
    h('div', { class: 'why' }, h('p', { class: 'eyebrow quiet' }, 'Why it works this way'),
      h('p', null, 'Notes hold the reason behind a step: the part a reader cannot get from the code.')),
    codeBlock("// code blocks use a tiny safe highlighter\nconst task = await tasks.create(userId, input)\nreturn Response.json(task, { status: 201 })", 'ts'),
    stepDots(6, 2, () => {}),
    h('div', { class: 'options' },
      h('button', { class: 'option', type: 'button' }, h('span', { class: 'key' }, '1'), h('span', { class: 'option-text' }, 'Unanswered option')),
      h('button', { class: 'option', type: 'button', 'aria-checked': 'true' }, h('span', { class: 'key' }, '2'), h('span', { class: 'option-text' }, 'Selected option')),
      h('button', { class: 'option is-correct', type: 'button' }, h('span', { class: 'key' }, '3'), h('span', { class: 'option-text' }, 'Correct')),
      h('button', { class: 'option is-wrong', type: 'button' }, h('span', { class: 'key' }, '4'), h('span', { class: 'option-text' }, 'Wrong'))));
}

function bootGallery() {
  applyTheme(storedTheme());
  const data = JSON.parse(document.getElementById('explainer-data').textContent);
  const kinds = list(data.kinds);
  const patterns = list(data.patterns);
  const version = String(data.version || '');
  const registry = themeRegistry();
  const app = document.getElementById('app');
  const top = h('header', { class: 'top' }, h('div', { class: 'bar' },
    h('a', { class: 'brand', href: '#main' }, brandMark(), h('span', { class: 'name' }, 'Repo Explainer kit')),
    themeSwitch(registry)));
  const main = h('main', { id: 'main', class: 'main-col', tabindex: '-1' }, top, h('div', { class: 'wrap' },
    h('div', { class: 'view' },
      h('header', { class: 'view-head' },
        h('p', { class: 'eyebrow quiet' }, `Design kit · v${version}`),
        h('h1', null, 'Repo Explainer kit'),
        h('p', { class: 'view-lead' }, 'Everything an explainer is made of. Reuse these by name in your data file. Never redraw, recolour or restyle them.'),
        h('p', { class: 'kit-credit' }, `Design credit: ${DESIGN_CREDIT_KIT}`)),
      h('div', { class: 'panel kit-logo' }, brandMark()),

      kitSection('kit-icons', 'Icons', 'Set a node "kind" to one of these names. Unknown kinds fall back to "service". One hairline weight, drawn in the text colour.',
        h('div', { class: 'kit-grid' }, [...kinds, 'robot', 'trophy', 'folder', 'file'].map((kind) => h('div', { class: 'panel kit-icon' },
          icon(kind), h('code', null, kind), kinds.includes(kind) ? null : tag('UI only'))))),

      kitSection('kit-layers', 'Layer markers', 'Set a layer "color" to one of these names. It shows as a small square and a thin bar on each box, never as a fill.',
        h('div', { class: 'kit-grid kit-grid-wide' }, Object.entries(PALETTE).map(([name, colors]) => h('div', { class: 'panel kit-layer map-col', style: `--layer:${colors.ink}` },
          h('span', { class: 'map-col-head' }, name),
          h('button', { class: 'node', type: 'button' }, h('span', { class: 'node-icon' }, icon('service')),
            h('span', { class: 'node-text' }, h('span', { class: 'node-label' }, 'A component'), h('span', { class: 'node-tech' }, colors.ink))))))),

      kitSection('kit-tokens', 'Tokens', 'Fixed. These are the only colours in styles.css. Each switches value in the dark theme. Explainers never add others.',
        h('div', { class: 'kit-grid kit-grid-wide' }, KIT_TOKENS.map(swatch))),

      kitSection('kit-components', 'Components', 'All of these come from the data file. Depth is a hairline ring, never a shadow.', kitComponents()),

      kitSection('kit-patterns', 'Flow patterns', 'Starting points for flows. Run `repo-explainer patterns <id>`, copy the steps, rename roles to your node ids, add file:line to every step.',
        h('div', { class: 'kit-grid kit-grid-wide' }, patterns.map((pattern) => h('article', { class: 'panel kit-pattern' },
          h('code', null, pattern.id), h('h3', null, pattern.name), h('p', null, pattern.use),
          h('div', { class: 'step-route' }, list(pattern.roles).map((role, i) => [i > 0 && h('span', { class: 'arrow-glyph' }, '→'), h('span', { class: 'chip' }, role)])))))),
      h('footer', { class: 'site-footer' }, h('p', null, DESIGN_CREDIT_KIT)))));
  fill(app, h('div', { class: 'app' }, kitSidebar(registry, version), main));
  app.removeAttribute('aria-busy');
  registry.paint();
}

const DESIGN_CREDIT_KIT = 'The one-idea-per-step lesson flow is inspired by Brilliant. Type (Geist, Geist Mono) and the grey scale come from Geist, the Vercel design system. Repo Explainer is not affiliated with or endorsed by Brilliant or Vercel.';
