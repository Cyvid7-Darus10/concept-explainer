// Settings: one view shared by the explainer pages, the kit and the hub.
// Reading choices live in this browser (localStorage, in try/catch). Explainer
// defaults live in <home>/config.json: saved through `library serve` when the
// page was opened that way, else shown as `config set` commands to copy.
const READING_PREFS = [
  {
    key: 'motion', label: 'Motion', storeKey: 'concept-explainer:motion', fallback: 'system',
    hint: 'Reduced stops sliding cards, drawing arrows and moving dots.',
    choices: [{ choice: 'system', label: 'System' }, { choice: 'reduce', label: 'Reduced' }],
  },
  {
    key: 'text', label: 'Text size', storeKey: 'concept-explainer:text', fallback: 'default',
    hint: 'Large makes every page about an eighth bigger.',
    choices: [{ choice: 'default', label: 'Default' }, { choice: 'large', label: 'Large' }],
  },
  {
    key: 'density', label: 'Density', storeKey: 'concept-explainer:density', fallback: 'comfortable',
    hint: 'Compact fits more on the screen.',
    choices: [{ choice: 'comfortable', label: 'Comfortable' }, { choice: 'compact', label: 'Compact' }],
  },
];

// The valid values come from the build (context.enums, scripts/lib/page-enums.mjs),
// so the form never keeps its own list that can drift. The lists below are
// labels for people, and the values for a page built before enums existed.
// The CLI and the server check every value again.
const PAGE_ENUMS = (() => {
  const enums = readContext().enums;
  return enums && typeof enums === 'object' && !Array.isArray(enums) ? enums : {};
})();

function enumList(name, fallback) {
  const values = PAGE_ENUMS[name];
  return Array.isArray(values) && values.length && values.every((v) => typeof v === 'string') ? values : fallback;
}

function enumNumber(name, fallback) {
  const value = PAGE_ENUMS[name];
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Every value the build allows, labelled when the page has a label for it.
function enumOptions(name, labelled, lead = []) {
  const values = [...new Set([...lead, ...enumList(name, labelled.map((o) => o.value))])];
  return values.map((value) => labelled.find((o) => o.value === value) || opt(value, value));
}

const LANGUAGE_PATTERN = (() => {
  try {
    return typeof PAGE_ENUMS.languagePattern === 'string' ? new RegExp(PAGE_ENUMS.languagePattern) : null;
  } catch (error) {
    return null;
  }
})() || /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

function opt(value, label, desc) {
  return { value, label, desc };
}
const ON_OFF = [opt('on', 'On'), opt('off', 'Off')];
const CONFIG_FIELDS = {
  style: { label: 'Style', kind: 'style', help: 'The look new explainers open in. Readers can still switch.',
    options: enumOptions('styles', [opt('clean', 'Clean', 'Calm greys and one orange accent.'), opt('playful', 'Playful', 'Bright, rounded and pressable.')]) },
  defaultType: { label: 'Explainer type', kind: 'list', help: 'What the skill makes when you do not say.',
    options: enumOptions('types', [
      opt('auto', 'Auto detect', 'The skill picks from what you point it at'),
      opt('repo', 'Repo', 'A whole codebase: parts, flows, data'),
      opt('pr', 'Pull request', 'One PR or MR, its diff and risks'),
      opt('change', 'Change', 'A commit range or a release'),
      opt('proposal', 'Proposal', 'An RFC or design doc and its options'),
      opt('migration', 'Migration', 'Moving from one system to another'),
      opt('incident', 'Incident', 'What broke, why, and the fix'),
      opt('concept', 'Concept', 'An idea or technique, no code needed'),
    ], ['auto']) },
  audience: { label: 'Audience', kind: 'cards', help: 'Sets tone, depth and how many terms get explained.',
    options: enumOptions('audience', [opt('newcomer', 'Newcomer', 'New to the code or the field'), opt('engineer', 'Engineer', 'Works in code day to day'), opt('expert', 'Expert', 'Wants the edges and trade-offs')]) },
  depth: { label: 'Depth', kind: 'cards', help: 'How many parts, flows and steps to trace.',
    options: enumOptions('depth', [opt('overview', 'Overview', 'The shape in a few minutes'), opt('standard', 'Standard', 'The main flows and parts'), opt('deep', 'Deep', 'Every important path')]) },
  language: { label: 'Language', kind: 'combo', help: 'A language tag, like en or pt-BR. Pick one or type your own.',
    options: [
      opt('en', 'en', 'English'), opt('en-GB', 'en-GB', 'English (UK)'), opt('es', 'es', 'Spanish'), opt('fr', 'fr', 'French'),
      opt('de', 'de', 'German'), opt('it', 'it', 'Italian'), opt('pt-BR', 'pt-BR', 'Portuguese (Brazil)'), opt('pt-PT', 'pt-PT', 'Portuguese (Portugal)'),
      opt('nl', 'nl', 'Dutch'), opt('sv', 'sv', 'Swedish'), opt('pl', 'pl', 'Polish'), opt('tr', 'tr', 'Turkish'),
      opt('ru', 'ru', 'Russian'), opt('uk', 'uk', 'Ukrainian'), opt('ja', 'ja', 'Japanese'), opt('ko', 'ko', 'Korean'),
      opt('zh-CN', 'zh-CN', 'Chinese (Simplified)'), opt('zh-TW', 'zh-TW', 'Chinese (Traditional)'), opt('hi', 'hi', 'Hindi'),
      opt('id', 'id', 'Indonesian'), opt('vi', 'vi', 'Vietnamese'), opt('fil', 'fil', 'Filipino'), opt('ar', 'ar', 'Arabic'), opt('he', 'he', 'Hebrew'),
    ] },
  visuals: { label: 'Preferred visuals', kind: 'multi', options: enumList('visualKinds', ['layers', 'cycle', 'state', 'compare', 'hierarchy', 'beforeAfter', 'quadrant', 'funnel', 'venn']), help: 'Picked first when a chapter can use a picture.' },
  codeWalkthrough: { label: 'Code walkthrough', kind: 'cards', help: 'A line-by-line tour of the few lines that carry the idea.',
    options: enumOptions('codeWalkthrough', [opt('auto', 'Auto', 'When the code is the point'), opt('always', 'Always', 'Add one to every explainer'), opt('never', 'Never', 'Leave it out')]) },
  quiz: { label: 'Quiz', kind: 'onoff', help: 'End explainers with a few questions.' },
  analogies: { label: 'Analogies', kind: 'onoff', help: 'Add a "think of it like" line to key ideas.' },
  model: { label: 'Model for estimates', kind: 'list', help: 'Used to price a run before it starts.',
    options: enumOptions('models', [opt('auto', 'Auto', 'Let the estimate pick'), opt('fable-5.2', 'Fable 5.2'), opt('opus-5.5', 'Opus 5.5'), opt('sonnet-5.5', 'Sonnet 5.5'), opt('haiku-5.5', 'Haiku 5.5')]) },
  budgetUsd: { label: 'Budget in US dollars', kind: 'number', help: 'Start without asking when the estimate fits. Leave empty to always ask.' },
  confirmBeforeStart: { label: 'Confirm before starting', kind: 'onoff', help: 'Show the estimate and wait for a yes.' },
  instructions: { label: 'House instructions', kind: 'textarea', help: 'Plain text added to every run: house style, terms to use. Never overrides the truth rules.' },
};
const optionValues = (field) => field.options.map((o) => (typeof o === 'string' ? o : o.value));
const CONFIG_FIELD_DEFAULTS = {
  style: 'clean', defaultType: 'auto', audience: 'engineer', depth: 'standard', language: 'en', visuals: [], chapters: {}, codeWalkthrough: 'auto',
  quiz: true, analogies: true, model: 'auto', budgetUsd: null, confirmBeforeStart: true, instructions: '',
};
const INSTRUCTIONS_LIMIT = enumNumber('instructionsLimit', 2000);
const CLI_NAME = 'concept-explainer';

function readingValue(pref) {
  const value = readStore(pref.storeKey);
  return pref.choices.some((c) => c.choice === value) ? value : pref.fallback;
}

// data-motion, data-text, data-density on <html>; defaults leave them off.
function applyReading() {
  const root = document.documentElement;
  READING_PREFS.forEach((pref) => {
    const value = readingValue(pref);
    if (value === pref.fallback) delete root.dataset[pref.key];
    else root.dataset[pref.key] = value;
  });
}

function readingSwitch(registry, pref) {
  return choiceSwitch(registry, {
    choices: pref.choices, read: () => readingValue(pref), label: pref.label, className: 'theme-switch style-switch', withIcons: false,
    write: (choice) => { writeStore(pref.storeKey, choice); applyReading(); },
  });
}

// `library serve` opens pages with #token=<t>. Keep it for this tab only and
// clear it from the address before the router reads the hash.
const SERVE_TOKEN_KEY = 'concept-explainer:serve-token';

function withServe(context) {
  const served = /^https?:$/.test(window.location.protocol);
  const match = window.location.hash.match(/^#token=([A-Za-z0-9_-]{8,256})$/);
  let token = null;
  if (match) {
    token = match[1];
    try {
      window.sessionStorage.setItem(SERVE_TOKEN_KEY, token);
    } catch (error) {
      // Without session storage the token still works until reload.
    }
    try {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    } catch (error) {
      window.location.hash = '';
    }
  } else if (served) {
    try {
      token = window.sessionStorage.getItem(SERVE_TOKEN_KEY);
    } catch (error) {
      token = null;
    }
  }
  if (!served || !token) return context;
  return { ...context, serve: { ...(context.serve || {}), token } };
}

// ---------- Quick theme: a small menu by the gear, and Shift+D ----------
const THEME_ICON_OPTIONS = THEME_CHOICES.map((t) => ({ value: t.choice, label: t.label }));

function setTheme(registry, choice) {
  writeStore(THEME_KEY, choice);
  applyTheme(choice);
  registry.paint();
  registry.changed();
}

// The theme menu, kept in sync with every other theme control on the page.
function quickTheme(registry) {
  const picker = listboxPicker({
    options: THEME_ICON_OPTIONS, value: storedTheme(), ariaLabel: 'Theme',
    buttonContent: (value) => icon(value), onChange: (choice) => setTheme(registry, choice),
  });
  registry.onChange(() => picker.set(storedTheme()));
  return h('div', { class: 'quick-theme' }, picker.el);
}

// Shift+D cycles light, dark, system. Ignored while typing.
function installThemeShortcut(registry) {
  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  document.body.append(live);
  const order = ['light', 'dark', 'system'];
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'D' || !event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    const next = order[(order.indexOf(storedTheme()) + 1) % order.length];
    setTheme(registry, next);
    live.textContent = `${THEME_CHOICES.find((t) => t.choice === next).label} theme`;
  });
}

// One compact line of facts for the sidebar footer, cut with a hint if long.
function footMeta(parts) {
  const line = parts.filter(Boolean).join(' · ');
  return truncatable(h('p', { class: 'side-stamp' }, line), line);
}

// The gear item for the sidebar and menu footers.
function settingsLink(href) {
  return h('div', { class: 'side-util' },
    h('a', { class: 'util', href, 'data-nav': 'settings' }, h('span', { class: 'util-ic' }, icon('settings')), 'Settings'));
}

function settingRow(id, label, control, hint) {
  return h('div', { class: 'setting-row' },
    h('span', { class: 'setting-label', id: `${id}-label` }, label),
    control,
    hint && h('p', { class: 'setting-hint', id: `${id}-hint` }, hint));
}

function readingGroup(registry) {
  const labelled = (el, id) => {
    el.setAttribute('aria-labelledby', `${id}-label`);
    el.setAttribute('aria-describedby', `${id}-hint`);
    el.removeAttribute('aria-label');
    return el;
  };
  return h('fieldset', { class: 'panel settings-group' },
    h('legend', { class: 'settings-legend' }, h('span', null, 'Reading'), h('span', { class: 'eyebrow quiet' }, 'This browser only')),
    settingRow('set-theme', 'Theme', labelled(themeSwitch(registry), 'set-theme'), 'System follows your device.'),
    settingRow('set-style', 'Style', labelled(styleSwitch(registry), 'set-style'), 'Clean is calm and grey. Playful is bright and rounded.'),
    READING_PREFS.map((pref) => settingRow(`set-${pref.key}`, pref.label, labelled(readingSwitch(registry, pref), `set-${pref.key}`), pref.hint)));
}

// ---------- Explainer defaults ----------
function normalizeDefaults(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(Object.entries(CONFIG_FIELD_DEFAULTS).map(([key, fallback]) => {
    const value = source[key];
    return [key, value === undefined || fieldErrors(key, value).length ? JSON.parse(JSON.stringify(fallback)) : value];
  }));
}

function fieldErrors(key, value) {
  const field = CONFIG_FIELDS[key];
  if (key === 'chapters') return value && typeof value === 'object' && !Array.isArray(value) ? [] : ['Must be a list of chapters per type.'];
  if (!field) return [];
  if (['style', 'list', 'cards'].includes(field.kind)) return optionValues(field).includes(value) ? [] : ['Pick one of the listed choices.'];
  if (field.kind === 'onoff') return typeof value === 'boolean' ? [] : ['Must be on or off.'];
  if (field.kind === 'multi') return Array.isArray(value) && value.every((v) => field.options.includes(v)) ? [] : ['Pick from the listed kinds.'];
  if (key === 'language') return typeof value === 'string' && LANGUAGE_PATTERN.test(value) ? [] : ['Use a language tag like en or pt-BR.'];
  if (key === 'budgetUsd') return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? [] : ['Use a number of 0 or more, or leave it empty.'];
  if (key === 'instructions') {
    if (typeof value !== 'string') return ['Must be text.'];
    if (value.length > INSTRUCTIONS_LIMIT) return [`${value.length} characters. Keep it to ${INSTRUCTIONS_LIMIT}.`];
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? ['Remove control characters. Use plain text.'] : [];
  }
  return [];
}

function shellQuote(value) {
  const textValue = String(value);
  return /^[\w.,:@/-]+$/.test(textValue) ? textValue : `'${textValue.replace(/'/g, "'\\''")}'`;
}

function commandValue(key, value) {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (key === 'budgetUsd') return value === null ? 'none' : String(value);
  if (key === 'visuals') return shellQuote(value.join(','));
  if (key === 'chapters') return shellQuote(JSON.stringify(value));
  return shellQuote(value);
}

function copyButton(getText, label = 'Copy') {
  const button = h('button', { class: 'btn small', type: 'button' }, label);
  button.addEventListener('click', () => {
    navigator.clipboard.writeText(getText())
      .then(() => { button.textContent = 'Copied'; button.dataset.state = 'done'; })
      .catch(() => { button.textContent = 'Select to copy'; });
  });
  return button;
}

function downloadBlob(filename, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = h('a', { href: url, download: filename, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A small picture of each style, drawn with the style's own colours.
function stylePreview(option) {
  return [
    h('span', { class: `style-preview is-${option.value}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('span', { class: 'pick-option-label' }, option.label),
    h('span', { class: 'pick-option-desc' }, option.desc),
  ];
}

// One control per field, all with the same shape: { el, read(), focus() }.
function fieldControl(key, value, id, describedBy) {
  const field = CONFIG_FIELDS[key];
  const labelledBy = `${id}-label`;
  if (field.kind === 'style') return optionGroup({ options: field.options, value, labelledBy, describedBy, variant: 'cards', render: stylePreview });
  if (field.kind === 'cards') return optionGroup({ options: field.options, value, labelledBy, describedBy, variant: 'cards' });
  if (field.kind === 'onoff') {
    const group = optionGroup({ options: ON_OFF, value: value ? 'on' : 'off', labelledBy, describedBy });
    return { ...group, read: () => group.read() === 'on' };
  }
  if (field.kind === 'list') return listboxPicker({ options: field.options, value, labelledBy, describedBy });
  if (field.kind === 'combo') return comboPicker({ options: field.options, value, id, describedBy });
  if (field.kind === 'multi') {
    const el = h('div', { class: 'multi', role: 'group', 'aria-labelledby': labelledBy, 'aria-describedby': describedBy },
      field.options.map((option) => h('label', { class: 'multi-option' },
        h('input', { type: 'checkbox', name: key, value: option, checked: value.includes(option) }), h('span', null, option))));
    return { el, read: () => [...el.querySelectorAll('input:checked')].map((input) => input.value), focus: () => el.querySelector('input').focus() };
  }
  if (field.kind === 'number') {
    const el = h('input', { class: 'field', type: 'number', id, min: '0', step: '0.5', inputmode: 'decimal', value: value === null ? '' : String(value), 'aria-describedby': describedBy });
    return { el, read: () => (el.value.trim() === '' ? null : Number(el.value.trim())), focus: () => el.focus() };
  }
  const el = h('textarea', { class: 'field', id, rows: '5', maxlength: String(INSTRUCTIONS_LIMIT * 2), 'aria-describedby': describedBy }, value);
  return { el, read: () => el.value, focus: () => el.focus() };
}

function defaultsGroup(context, initialConfig) {
  let saved = normalizeDefaults(initialConfig);
  const serve = context && context.serve && typeof context.serve.token === 'string' ? context.serve : null;
  const status = h('p', { class: 'settings-status', role: 'status', 'aria-live': 'polite' });
  const commands = h('div', { class: 'settings-commands' });
  const errorsFor = {};
  const rows = Object.keys(CONFIG_FIELDS).map((key) => {
    const id = `cfg-${key}`;
    const errorId = `${id}-error`;
    const control = fieldControl(key, saved[key], id, `${id}-hint ${errorId}`);
    const error = h('p', { class: 'field-error', id: errorId });
    errorsFor[key] = { error, control };
    const field = CONFIG_FIELDS[key];
    const labelFor = ['number', 'textarea', 'combo'].includes(field.kind);
    const label = labelFor
      ? h('label', { class: 'setting-label', for: id, id: `${id}-label` }, field.label)
      : h('span', { class: 'setting-label', id: `${id}-label` }, field.label);
    const wide = ['textarea', 'multi', 'style', 'cards'].includes(field.kind);
    return h('div', { class: `setting-row${wide ? ' is-wide' : ''}`, 'data-field': key },
      label, control.el, h('p', { class: 'setting-hint', id: `${id}-hint` }, field.help), error);
  });
  const counter = h('span', { class: 'setting-count', 'aria-live': 'polite' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, serve ? 'Save' : 'Show the commands');
  const form = h('form', { class: 'settings-form', novalidate: true }, rows,
    h('p', { class: 'setting-hint' }, 'Chapters per type are set from the command line: ',
      h('code', null, `${CLI_NAME} config set chapters '{"repo":{"quiz":false}}'`)),
    h('div', { class: 'settings-actions' },
      submit,
      h('button', { class: 'btn', type: 'button', onclick: () => downloadBlob('config.json', `${JSON.stringify(current(), null, 2)}\n`) }, icon('download'), 'Download config.json'),
      status),
    commands);

  const instructions = errorsFor.instructions.control.el;
  const paintCount = () => { counter.textContent = `${instructions.value.length} / ${INSTRUCTIONS_LIMIT}`; };
  instructions.after(counter);
  instructions.addEventListener('input', paintCount);
  paintCount();

  function current() {
    return { ...saved, ...Object.fromEntries(Object.keys(CONFIG_FIELDS).map((key) => [key, errorsFor[key].control.read()])) };
  }

  function validate(values) {
    let firstBad = null;
    Object.keys(CONFIG_FIELDS).forEach((key) => {
      const problems = fieldErrors(key, values[key]);
      const { error, control } = errorsFor[key];
      error.textContent = problems.join(' ');
      const target = control.el.matches('input, textarea') ? control.el : control.el.querySelector('input, [role="radiogroup"], .picker-button') || control.el;
      target.setAttribute('aria-invalid', String(problems.length > 0));
      if (problems.length && !firstBad) firstBad = control;
    });
    return firstBad;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = current();
    const bad = validate(values);
    if (bad) {
      status.textContent = 'Fix the marked fields first.';
      bad.focus();
      return;
    }
    const changed = Object.keys(values).filter((key) => JSON.stringify(values[key]) !== JSON.stringify(saved[key]));
    if (!changed.length) {
      status.textContent = 'Nothing changed.';
      fill(commands);
      return;
    }
    if (serve) {
      // One save at a time: a second press while the first runs does nothing.
      if (submit.disabled) return;
      submit.disabled = true;
      status.textContent = 'Saving…';
      serveFetch(context, serveApi(context, 'config'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(changed.map((key) => [key, values[key]]))),
      }).then(({ json: body }) => {
        saved = normalizeDefaults(body && body.config ? body.config : values);
        // The server rebuilt the pages with the new defaults: load them.
        status.textContent = `Saved ${countLabel(changed.length, 'setting')}. Reloading with the new defaults.`;
        window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
      }).catch((error) => {
        submit.disabled = false;
        status.textContent = `Could not save: ${error.message}`;
      });
      return;
    }
    const lines = changed.map((key) => `${CLI_NAME} config set ${key} ${commandValue(key, values[key])}`);
    status.textContent = `This page cannot write files. Run ${lines.length === 1 ? 'this command' : 'these commands'}, or download config.json.`;
    fill(commands,
      h('ul', { class: 'command-list' }, lines.map((line) => h('li', null, h('code', null, line), copyButton(() => line)))),
      lines.length > 1 && copyButton(() => lines.join('\n'), 'Copy all'));
  });

  return h('section', { class: 'panel settings-group', 'aria-labelledby': 'settings-defaults-title' },
    h('div', { class: 'settings-legend' }, h('h2', { id: 'settings-defaults-title' }, 'Explainer defaults'),
      h('span', { class: 'eyebrow quiet' }, serve ? 'Saved to config.json' : 'Read from config.json')),
    h('p', { class: 'setting-hint' }, 'What the skill uses for the next explainer you build.'),
    form);
}

function countLabel(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

// Explainer defaults always show: the built-in defaults merged with what the
// page carries (never the free-text instructions). Under `library serve` the
// real config, instructions included, comes from GET /api/config.
function defaultsSlot(context, config) {
  const slot = h('div', { class: 'settings-slot' }, defaultsGroup(context, config || {}));
  const serve = context && context.serve && typeof context.serve.token === 'string' ? context.serve : null;
  if (serve) {
    serveFetch(context, serveApi(context, 'config'))
      .then(({ json }) => { if (json && json.config) fill(slot, defaultsGroup(context, json.config)); })
      .catch(() => { /* keep the embedded values; Save reports any server problem */ });
  }
  return slot;
}

/**
 * The Settings view. `config` holds the current explainer defaults, when the
 * page has them (context.config on explainer pages, data.config on the hub).
 * @returns {{ key: string, title: string, nav: string, section: HTMLElement, controller: object }}
 */
function settingsView(registry, { context = {}, config = null, extra = [] } = {}) {
  const section = h('section', { class: 'view settings-view', 'data-view': 'settings', hidden: true, 'aria-labelledby': 'view-settings-title' },
    h('header', { class: 'view-head' },
      h('p', { class: 'eyebrow quiet' }, 'Settings'),
      h('h1', { id: 'view-settings-title', tabindex: '-1' }, 'Settings'),
      h('p', { class: 'view-lead' }, 'Reading choices stay in this browser. Explainer defaults shape the next explainer you build.')),
    h('div', { class: 'settings-body' },
      readingGroup(registry),
      defaultsSlot(context, config),
      extra));
  return { key: 'settings', title: 'Settings', nav: 'Settings', section, controller: null };
}

// ---------- Share ----------
const BUNDLE_FORMAT = typeof PAGE_ENUMS.bundleFormat === 'string' && PAGE_ENUMS.bundleFormat ? PAGE_ENUMS.bundleFormat : 'concept-explainer-bundle';
const BUNDLE_MAX_BYTES = enumNumber('bundleMaxBytes', 10 * 1024 * 1024);
const BUNDLE_MAX_LABEL = `${Math.round(BUNDLE_MAX_BYTES / 1024 / 1024)} MB`;
// Long enough to read "Saved", short enough not to wait on.
const RELOAD_DELAY_MS = 900;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LOCAL_PATH_KEYS = new Set(['sourcePath', 'repoPath']);

// The library slug when the page knows it. Otherwise the bundle leaves it
// empty and the importer derives one, so there is one slug rule.
function knownSlug(context) {
  return context && typeof context.slug === 'string' && SLUG_PATTERN.test(context.slug) ? context.slug : '';
}

// Data only, without local paths: the importer rebuilds pages itself.
function withoutLocalPaths(value) {
  if (Array.isArray(value)) return value.map(withoutLocalPaths);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !LOCAL_PATH_KEYS.has(key)).map(([key, v]) => [key, withoutLocalPaths(v)]));
}

function bundleOf(entries) {
  return { format: BUNDLE_FORMAT, version: 1, exportedAt: new Date().toISOString(), explainers: entries };
}

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESC[ch]);
}

// The page as it was built, from parts that never change after load: head
// attributes, the style and script text, and the embedded data. The context
// keeps the style, chapters and choice lists, so a shared copy has no token or library link.
// The library's font rules point at its fonts/ folder, which a saved
// page does not have: they go, and the system fonts in each stack take over.
// Spelled in pieces: built pages are checked for these words in their source.
const FONT_FACE_BLOCK = new RegExp(`^(\\s*)(?:@${'font'}-face\\{[^}]*\\}\\n?)+`);
const CSP_NAME = ['Content', 'Security', 'Policy'].join('-');

function sha256Source(text) {
  const subtle = window.crypto && window.crypto.subtle;
  if (!subtle) return Promise.resolve(null);
  return subtle.digest('SHA-256', new TextEncoder().encode(text)).then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return `'sha256-${window.btoa(binary)}'`;
  }).catch(() => null);
}

// The page's own policy, verbatim: the scripts are copied unchanged, so their
// hashes still hold. Only the style hash follows the trimmed stylesheet.
function savedCsp(styleText, styleHash) {
  const tag = [...document.head.querySelectorAll('meta[http-equiv]')].find((m) => m.getAttribute('http-equiv') === CSP_NAME);
  const policy = tag ? tag.getAttribute('content') : '';
  if (!policy) return '';
  const next = styleHash ? policy.replace(/style-src [^;]*/, `style-src ${styleHash}`) : policy;
  // Quotes in the policy stay as they are, so it reads byte for byte the same.
  return `<meta http-equiv="${CSP_NAME}" content="${next.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
}

// Resolves to the page text. With no Web Crypto the stylesheet stays whole,
// so the policy's hash for it still matches.
function savedPage(style) {
  const full = (document.head.querySelector('style') || {}).textContent || '';
  const trimmed = full.replace(FONT_FACE_BLOCK, '$1');
  if (trimmed === full) return Promise.resolve(pageSnapshot(style, full, savedCsp(full, null)));
  return sha256Source(trimmed).then((hash) => (hash
    ? pageSnapshot(style, trimmed, savedCsp(trimmed, hash))
    : pageSnapshot(style, full, savedCsp(full, null))));
}

function pageSnapshot(style, styleText, cspTag) {
  const head = document.head;
  const meta = [...head.querySelectorAll('meta[name], meta[property], meta[charset]')].map((m) => {
    if (m.hasAttribute('charset')) return `<meta charset="${escapeAttr(m.getAttribute('charset'))}">`;
    const key = m.hasAttribute('name') ? 'name' : 'property';
    return `<meta ${key}="${escapeAttr(m.getAttribute(key))}" content="${escapeAttr(m.getAttribute('content'))}">`;
  });
  const links = [...head.querySelectorAll('link[rel]')].map((l) => {
    const cross = l.hasAttribute('crossorigin') ? ' crossorigin' : '';
    return `<link rel="${escapeAttr(l.getAttribute('rel'))}" href="${escapeAttr(l.getAttribute('href'))}"${cross}>`;
  });
  const prepaint = head.querySelector('script[data-prepaint]');
  const main = [...document.querySelectorAll('body > script:not([type])')].pop();
  const dataText = document.getElementById('explainer-data').textContent;
  // The build's chapter list and choice lists carry over; the token, slug and
  // library link do not.
  const built = readContext();
  const kept = { style, ...(Array.isArray(built.chapters) ? { chapters: built.chapters } : {}), ...(built.enums ? { enums: built.enums } : {}) };
  const contextText = JSON.stringify(kept).replace(/</g, '\\u003c');
  return [
    '<!doctype html>', '<html lang="en">', '<head>', ...meta.slice(0, 1), cspTag, ...meta.slice(1), `<title>${escapeAttr(document.querySelector('title') ? document.querySelector('title').textContent : 'Explainer')}</title>`,
    ...links, prepaint ? `<script data-prepaint>${prepaint.textContent}<\/script>` : '', `<style>${styleText}</style>`, '</head>', '<body>',
    '<a class="skip" href="#main">Skip to content</a>', '<div id="app" aria-busy="true"></div>',
    '<noscript><p class="noscript">This explainer needs JavaScript to draw its diagrams.</p></noscript>',
    `<script type="application/json" id="explainer-data">${dataText}<\/script>`,
    `<script type="application/json" id="explainer-context">${contextText}<\/script>`,
    `<script>${main ? main.textContent : ''}<\/script>`, '</body>', '</html>', '',
  ].join('\n');
}

function shareRow(title, body, actions) {
  return h('div', { class: 'setting-row is-wide share-row' },
    h('span', { class: 'setting-label' }, title), h('p', { class: 'setting-hint' }, body), h('div', { class: 'btn-row' }, actions));
}

// Explainer page: export this one, or save the page itself.
function explainerShareGroup(data, context) {
  const slug = knownSlug(context);
  const fileName = `${slug || 'explainer'}.explainers.json`;
  const status = h('p', { class: 'settings-status', role: 'status', 'aria-live': 'polite' });
  const exportButton = h('button', { class: 'btn', type: 'button' }, icon('download'), 'Export this explainer');
  exportButton.addEventListener('click', () => {
    downloadBlob(fileName, `${JSON.stringify(bundleOf([{ slug, data: withoutLocalPaths(data) }]), null, 2)}\n`);
    status.textContent = `Downloaded ${fileName}. Import it with ${CLI_NAME} import.`;
  });
  const pageButton = h('button', { class: 'btn', type: 'button' }, icon('download'), 'Save as page');
  pageButton.addEventListener('click', () => {
    const pageName = `${slug || 'explainer'}.html`;
    savedPage(storedStyle()).then((page) => {
      downloadBlob(pageName, page, 'text/html');
      status.textContent = `Downloaded ${pageName}. It opens on its own, with no library.`;
    }).catch((error) => { status.textContent = `Could not save the page: ${error.message}`; });
  });
  return h('section', { class: 'panel settings-group', 'aria-labelledby': 'settings-share-title' },
    h('div', { class: 'settings-legend' }, h('h2', { id: 'settings-share-title' }, 'Share'), h('span', { class: 'eyebrow quiet' }, 'Data only, no local paths')),
    shareRow('Export', 'A bundle someone else can import into their own library. It holds the explainer data, never the page code.', exportButton),
    shareRow('Page', 'One file that opens in any browser, offline.', pageButton),
    status);
}

// serve.api is { config, export, import }; a bare string is the config path.
function serveApi(context, name) {
  const api = context && context.serve && context.serve.api;
  if (api && typeof api === 'object' && typeof api[name] === 'string' && api[name].startsWith('/api/')) return api[name];
  if (name === 'config' && typeof api === 'string' && api.startsWith('/api/')) return api;
  return `/api/${name}`;
}

function serveFetch(context, url, options = {}) {
  return fetch(url, { ...options, headers: { ...(options.headers || {}), 'x-concept-explainer-token': context.serve.token } })
    .then((response) => response.text().then((body) => {
      let json = null;
      try {
        json = body ? JSON.parse(body) : null;
      } catch (error) {
        json = null;
      }
      if (!response.ok) throw new Error((json && (list(json.errors).join(' ') || json.error)) || `The server answered ${response.status}.`);
      return { json, body };
    }));
}

function commandBlock(lines) {
  return h('ul', { class: 'command-list' }, lines.map((line) => h('li', null, h('code', null, line), copyButton(() => line))));
}

const IMPORT_GROUPS = [['added', 'Added'], ['replaced', 'Replaced'], ['skipped', 'Skipped'], ['rejected', 'Rejected']];

function importSummary(result) {
  const rows = IMPORT_GROUPS.flatMap(([key, label]) => list(result && result[key]).map((item) => ({ label, item })));
  if (!rows.length) return h('p', { class: 'setting-hint' }, 'The bundle holds no explainers.');
  return h('table', { class: 'import-table' },
    h('caption', { class: 'sr-only' }, 'What the import would do'),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Result'), h('th', { scope: 'col' }, 'Explainer'), h('th', { scope: 'col' }, 'Why'))),
    h('tbody', null, rows.map(({ label, item }) => h('tr', { class: `is-${label.toLowerCase()}` },
      h('td', null, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), label),
      h('td', null, softBreaks(text(item.title, text(item.slug, Number.isInteger(item.index) ? `Item ${item.index + 1}` : 'Untitled')))),
      h('td', null, list(item.reasons).length ? list(item.reasons).join(' ') : text(item.reason, text(item.note, '')))))));
}

// Hub: export the picked explainers (or the filter), import a bundle.
function hubShareGroup(context, getSelection) {
  const served = Boolean(context && context.serve && context.serve.token);
  // Each action reports right above its own output.
  const status = h('p', { class: 'settings-status', role: 'status', 'aria-live': 'polite' });
  const importStatus = h('p', { class: 'settings-status', role: 'status', 'aria-live': 'polite' });
  const exportOut = h('div', { class: 'settings-commands' });
  const exportButton = h('button', { class: 'btn', type: 'button' }, icon('download'), 'Export');
  exportButton.addEventListener('click', () => {
    const { slugs, args, label, none } = getSelection();
    if (none) {
      status.textContent = 'No explainers match the filter, so there is nothing to export.';
      fill(exportOut);
      return;
    }
    if (served) {
      status.textContent = 'Preparing the bundle…';
      const query = slugs.length ? `?slugs=${slugs.map(encodeURIComponent).join(',')}` : '';
      serveFetch(context, `${serveApi(context, 'export')}${query}`)
        .then(({ body }) => {
          const many = `explainers-${new Date().toISOString().slice(0, 10)}.explainers.json`;
          downloadBlob(slugs.length === 1 ? `${slugs[0]}.explainers.json` : many, body);
          status.textContent = `Downloaded ${label}.`;
        })
        .catch((error) => { status.textContent = `Could not export: ${error.message}`; });
      return;
    }
    status.textContent = `This page cannot read the library files. Run this to export ${label}:`;
    fill(exportOut, commandBlock([`${CLI_NAME} export ${args}`.trim()]));
  });

  const importOut = h('div', { class: 'settings-commands' });
  const importRow = served ? importServed(context, importStatus, importOut) : [
    h('p', { class: 'setting-hint' }, 'This page cannot write to the library. Run this with the bundle you received:'),
    commandBlock([`${CLI_NAME} import <file.explainers.json> --dry-run`, `${CLI_NAME} import <file.explainers.json> --on-conflict rename`]),
  ];
  return h('section', { class: 'panel settings-group', 'aria-labelledby': 'settings-share-title' },
    h('div', { class: 'settings-legend' }, h('h2', { id: 'settings-share-title' }, 'Share'), h('span', { class: 'eyebrow quiet' }, 'Data only, no local paths')),
    h('div', { class: 'setting-row is-wide share-row' }, h('span', { class: 'setting-label' }, 'Export'),
      h('p', { class: 'setting-hint' }, 'Pick explainers with the boxes on their cards, or export every one the current filter shows.'),
      h('div', { class: 'btn-row' }, exportButton), status, exportOut),
    h('div', { class: 'setting-row is-wide share-row' }, h('span', { class: 'setting-label' }, 'Import'), importRow, importStatus, importOut));
}

function fileSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// One unit in the control column: drop zone, conflict choice, dry-run
// summary, then the Import button.
function importServed(context, status, out) {
  const input = h('input', { class: 'sr-only', type: 'file', id: 'import-file', accept: '.json,application/json', tabindex: '-1', 'aria-hidden': 'true' });
  const choose = h('button', { class: 'link drop-choose', type: 'button', onclick: () => input.click() }, 'or choose a file');
  const picked = h('div', { class: 'drop-picked', hidden: true });
  const zone = h('div', { class: 'drop-zone', 'aria-describedby': 'import-file-hint' },
    icon('upload'), h('span', { class: 'drop-title' }, 'Drop a .explainers.json file'), choose, picked);
  let pending = null;
  let busy = false;
  let checkId = 0;
  let run = () => {};
  const conflict = optionGroup({
    variant: 'cards', value: 'rename', labelledBy: 'import-conflict-label', describedBy: 'import-conflict-hint',
    options: [
      { value: 'rename', label: 'Keep both', desc: 'Renames the new one with a -2' },
      { value: 'skip', label: 'Skip', desc: 'Keeps the one you have' },
      { value: 'replace', label: 'Replace', desc: 'Only one from the same source' },
    ],
    onChange: () => run(true),
  });
  const clear = () => {
    if (busy) return;
    pending = null;
    picked.hidden = true;
    zone.classList.remove('has-file');
    input.value = '';
    fill(out);
    status.textContent = '';
    choose.focus();
  };
  run = (dryRun, applyButton) => {
    // While an import runs, nothing else starts: a double press imports once.
    if (!pending || busy) return;
    const job = pending;
    const id = ++checkId;
    if (!dryRun) {
      busy = true;
      pending = null;
      if (applyButton) applyButton.disabled = true;
    }
    status.textContent = dryRun ? 'Checking the bundle…' : 'Importing…';
    serveFetch(context, `${serveApi(context, 'import')}?onConflict=${conflict.read()}${dryRun ? '&dryRun=1' : ''}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: job.text,
    }).then(({ json: raw }) => {
      // A newer check (the conflict choice changed) replaces this one.
      if (dryRun && (id !== checkId || pending !== job)) return;
      // The server wraps the result in { summary }; accept the bare shape too.
      const json = raw && raw.summary && typeof raw.summary === 'object' ? raw.summary : raw;
      if (dryRun) {
        status.textContent = `Here is what importing ${job.name} would do. Nothing has changed yet.`;
        const apply = h('button', { class: 'btn primary', type: 'button' }, 'Import');
        apply.addEventListener('click', () => run(false, apply));
        fill(out, importSummary(json), h('div', { class: 'btn-row' }, apply));
      } else {
        status.textContent = 'Imported. Reload the library to see the new explainers.';
        fill(out, importSummary(json), h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => window.location.reload() }, 'Reload')));
        busy = false;
      }
    }).catch((error) => {
      if (!dryRun) {
        // Nothing was imported: the same file can be tried again.
        busy = false;
        pending = job;
        if (applyButton) applyButton.disabled = false;
      }
      status.textContent = `Could not import: ${error.message}`;
    });
  };
  const take = (file) => {
    if (!file || busy) return;
    if (file.size > BUNDLE_MAX_BYTES) { status.textContent = `${file.name} is over ${BUNDLE_MAX_LABEL}. Bundles must be smaller.`; return; }
    file.text().then((body) => {
      pending = { name: file.name, text: body };
      zone.classList.add('has-file');
      fill(picked, h('span', { class: 'drop-file' }, softBreaks(file.name)), h('span', { class: 'drop-size' }, fileSize(file.size)),
        h('button', { class: 'link', type: 'button', onclick: clear }, 'Remove'));
      picked.hidden = false;
      run(true);
    }).catch(() => { status.textContent = `Could not read ${file.name}.`; });
  };
  input.addEventListener('change', () => take(input.files && input.files[0]));
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-over');
    take(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
  });
  return h('div', { class: 'import-controls' }, input, zone,
    h('p', { class: 'setting-hint', id: 'import-file-hint' }, `A bundle someone exported. Up to ${BUNDLE_MAX_LABEL}. Nothing changes until you press Import.`),
    h('div', { class: 'import-field' },
      h('span', { class: 'setting-label', id: 'import-conflict-label' }, 'If it is already in your library'),
      conflict.el,
      h('p', { class: 'setting-hint', id: 'import-conflict-hint' }, 'Applies to explainers with the same name.')));
}
