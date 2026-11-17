// DOM helpers. Every string from the data file goes through text nodes or
// setAttribute, never innerHTML, so repo content cannot inject markup.
const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el, attrs) {
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([name, v]) => { el.dataset[name] = v; });
    } else {
      el.setAttribute(key === 'className' ? 'class' : key, value === true ? '' : String(value));
    }
  });
  return el;
}

function appendChildren(el, children) {
  children.flat(Infinity).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return el;
}

// replaceChildren() would stringify skipped (undefined/false) slots.
function fill(el, ...children) {
  el.replaceChildren();
  return appendChildren(el, children);
}

function h(tag, attrs, ...children) {
  return appendChildren(applyAttrs(document.createElement(tag), attrs), children);
}

function s(tag, attrs, ...children) {
  return appendChildren(applyAttrs(document.createElementNS(SVG_NS, tag), attrs), children);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// The device setting, or the reader's own Motion choice in Settings.
function reducedMotion() {
  return document.documentElement.dataset.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function byId(items) {
  return new Map(list(items).map((item) => [item.id, item]));
}

function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(`explainer:${name}`, { detail }));
}

function on(name, handler) {
  document.addEventListener(`explainer:${name}`, (event) => handler(event.detail));
}

// Only http(s) links render; anything else (javascript:, data:) becomes text.
// Control characters and spaces can hide a scheme ("java\tscript:"), so any
// link holding one is refused outright.
const UNSAFE_URL_CHARS = /[\u0000-\u0020\u007f]/;

function safeUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) && !UNSAFE_URL_CHARS.test(trimmed) ? trimmed : null;
}

// A path with soft break points after each "/", so it wraps at folder
// boundaries. <wbr> adds no characters, so copying gives the exact path.
function breakablePath(path) {
  return String(path).split(/(?<=\/)/).flatMap((part, i) => {
    const pieces = part.length > TOKEN_MAX ? softBreaks(part) : [part];
    return i ? [h('wbr'), ...pieces] : pieces;
  });
}

// A file:line citation. Long paths keep the first folder and the file name.
function fileChip(path) {
  return truncatable(h('span', { class: 'chip-file' }), path, { mode: 'middle' });
}

// Browser storage is a per-reader convenience only: it can be missing or
// throw (private windows, file:// rules), and the page works without it.
// Keys were renamed from repo-explainer:* to concept-explainer:*. An old
// value is read once, moved to the new key, and the old key removed.
const STORE_PREFIX = 'concept-explainer:';
const LEGACY_PREFIX = 'repo-explainer:';

function readStore(key) {
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null || !key.startsWith(STORE_PREFIX)) return value;
    const legacyKey = `${LEGACY_PREFIX}${key.slice(STORE_PREFIX.length)}`;
    const legacy = window.localStorage.getItem(legacyKey);
    if (legacy !== null) {
      window.localStorage.setItem(key, legacy);
      window.localStorage.removeItem(legacyKey);
    }
    return legacy;
  } catch (error) {
    return null;
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

// Record where the reader is inside a view (a node, a step) without adding a
// history entry: Back still goes to the previous view.
function setDeepLink(hash) {
  const next = `#${hash}`;
  if (window.location.hash === next) return;
  try {
    window.history.replaceState(window.history.state, '', next);
  } catch (error) {
    // Some file:// contexts refuse history writes; the view still works.
  }
}

function linkPart(value) {
  return encodeURIComponent(String(value));
}

// A small mono label: kinds, authors, PK/FK. Never coloured fills.
function tag(label, extra = '') {
  return truncatable(h('span', { class: `tag${extra ? ` ${extra}` : ''}` }, softBreaks(label)), label);
}

// Display titles step down a size when their longest word is long, so an
// identifier like AbstractSingletonProxyFactoryBean breaks cleanly.
function fitClass(value) {
  // Long tokens are shown shortened (softBreaks), so size by what is shown.
  const shown = (word) => (word.length > TOKEN_MAX ? shortenToken(word).length : word.length);
  const longest = String(value || '').split(/\s+/).reduce((max, word) => Math.max(max, shown(word)), 0);
  if (longest > 32) return 'fit-xlong';
  if (longest > 18) return 'fit-long';
  return '';
}

// Tiny, safe highlighter: tokenises into spans, never parses HTML.
const CODE_TOKEN = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|async|await|export|import|from|class|def|if|else|for|while|new|throw|try|catch|func|go|type|interface|struct|public|private|select|insert|update|delete|where|SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)\b/g;

function codeBlock(code, lang) {
  const pre = h('pre', { class: 'code', 'data-lang': lang || '' });
  const source = String(code);
  let last = 0;
  source.replace(CODE_TOKEN, (match, comment, str, keyword, offset) => {
    if (offset > last) pre.append(document.createTextNode(source.slice(last, offset)));
    const cls = comment ? 'cm' : str ? 'st' : 'hl';
    pre.append(h('span', { class: cls }, match));
    last = offset + match.length;
    return match;
  });
  if (last < source.length) pre.append(document.createTextNode(source.slice(last)));
  return pre;
}

// Motion helpers (Web Animations API). All motion is skipped for users who
// ask for reduced motion; nothing depends on an animation finishing.
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function motion(el, keyframes, options) {
  if (reducedMotion() || !el.animate) return null;
  return el.animate(keyframes, { duration: 240, easing: EASE_OUT, ...options });
}

function slideIn(el, direction = 1) {
  return motion(el, [{ opacity: 0, transform: `translateX(${direction * 14}px)` }, { opacity: 1, transform: 'none' }]);
}

function riseIn(el, delay = 0) {
  return motion(el, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { delay, fill: 'backwards' });
}

function pop(el) {
  return motion(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 320 });
}

function shake(el) {
  return motion(el, [{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 320, easing: 'ease-in-out' });
}

// Draw an SVG path from start to end, then reveal its arrowhead.
function drawPath(path, marker) {
  const anim = motion(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 420 });
  if (!anim) {
    path.setAttribute('marker-end', marker);
    return;
  }
  path.setAttribute('pathLength', '1');
  path.style.strokeDasharray = '1';
  anim.onfinish = () => {
    path.style.strokeDasharray = '';
    path.removeAttribute('pathLength');
    path.setAttribute('marker-end', marker);
  };
}

// ---------- Look: theme (system, light, dark) and style (clean, playful) ----------
// Shared by the explainer, the kit and the hub. Choices are per reader and
// live in localStorage; the page works when storage is blocked.
const THEME_KEY = 'concept-explainer:theme';
const STYLE_KEY = 'concept-explainer:style';
const THEME_CHOICES = [
  { choice: 'system', label: 'System' },
  { choice: 'light', label: 'Light' },
  { choice: 'dark', label: 'Dark' },
];
const STYLE_CHOICES = [
  { choice: 'clean', label: 'Clean' },
  { choice: 'playful', label: 'Playful' },
];
let pageDefaultStyle = 'clean';

function storedTheme() {
  const value = readStore(THEME_KEY);
  return THEME_CHOICES.some((t) => t.choice === value) ? value : 'system';
}

// "system" leaves data-theme off so the CSS media query decides.
function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === 'light' || choice === 'dark') root.dataset.theme = choice;
  else delete root.dataset.theme;
}

// The page default comes from the build (context.style); a reader's own
// choice wins over it.
function setDefaultStyle(value) {
  pageDefaultStyle = value === 'playful' ? 'playful' : 'clean';
}

function storedStyle() {
  const value = readStore(STYLE_KEY);
  return STYLE_CHOICES.some((t) => t.choice === value) ? value : pageDefaultStyle;
}

function applyStyle(choice) {
  document.documentElement.dataset.style = choice === 'playful' ? 'playful' : 'clean';
}

function applyLook(context) {
  setDefaultStyle(context && context.style);
  applyTheme(storedTheme());
  applyStyle(storedStyle());
}

// One registry per page repaints every switch (sidebar and menu copies).
function themeRegistry() {
  const switches = [];
  const listeners = [];
  return {
    add: (entry) => switches.push(entry),
    onChange: (fn) => listeners.push(fn),
    paint: () => {
      switches.forEach(({ buttons, choices, read }) => {
        const picked = read();
        buttons.forEach((button, i) => {
          const on = choices[i].choice === picked;
          button.setAttribute('aria-checked', String(on));
          button.tabIndex = on ? 0 : -1;
        });
      });
    },
    changed: () => {
      listeners.forEach((fn) => fn());
      // A style switch changes fonts and paddings: re-measure cut text.
      if (typeof recheckTruncation === 'function') window.requestAnimationFrame(recheckTruncation);
    },
  };
}

// A radio group of buttons; arrow keys move and choose, one tab stop.
function choiceSwitch(registry, { choices, read, write, label, className, withIcons }) {
  const choose = (choice) => {
    write(choice);
    registry.paint();
    registry.changed();
  };
  const buttons = choices.map((option, index) => h('button', {
    class: 'ts-option', type: 'button', role: 'radio', 'data-label': option.label,
    'aria-label': withIcons ? `${option.label} ${label.toLowerCase()}` : null, title: withIcons ? `${option.label} ${label.toLowerCase()}` : null,
    onclick: () => choose(option.choice),
    onkeydown: (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = (index + step + choices.length) % choices.length;
      choose(choices[next].choice);
      buttons[next].focus();
    },
  }, withIcons ? icon(option.choice) : option.label));
  registry.add({ buttons, choices, read });
  return h('div', { class: className, role: 'radiogroup', 'aria-label': label }, buttons);
}

function themeSwitch(registry) {
  return choiceSwitch(registry, {
    choices: THEME_CHOICES, read: storedTheme, label: 'Theme', className: 'theme-switch', withIcons: true,
    write: (choice) => { writeStore(THEME_KEY, choice); applyTheme(choice); },
  });
}

function styleSwitch(registry) {
  return choiceSwitch(registry, {
    choices: STYLE_CHOICES, read: storedStyle, label: 'Style', className: 'theme-switch style-switch', withIcons: false,
    write: (choice) => { writeStore(STYLE_KEY, choice); applyStyle(choice); },
  });
}



// ---------- Page context (library builds) ----------
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
// A link from the build (library, kit): resolved against this page, and
// kept only when it lands on http(s), or on a file next to this file page.
function safeHref(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || UNSAFE_URL_CHARS.test(trimmed) || trimmed.startsWith('//') || trimmed.startsWith('\\')) return null;
  let url;
  try {
    url = new URL(trimmed, window.location.href);
  } catch (error) {
    return null;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') return trimmed;
  if (url.protocol === 'file:' && window.location.protocol === 'file:' && url.host === window.location.host) return trimmed;
  return null;
}

// The skip link moves focus only; a "#main" hash would read as a view name.
function wireSkipLink(main) {
  const skip = document.querySelector('.skip');
  if (!skip || !main) return;
  skip.addEventListener('click', (event) => {
    event.preventDefault();
    main.focus();
  });
}



// ---------- Long names: soft breaks, truncation and the "?" hint ----------
const SOFT_BREAK_MIN = 12;
// Tokens longer than this (in characters, so it is deterministic) are shown
// shortened in the middle with a "?" hint holding the full token.
const TOKEN_MAX = 24;

function breakToken(token) {
  const marked = token
    .replace(/([a-z])(?=[A-Z])/g, '$1\u0000')
    .replace(/([A-Z])(?=[A-Z][a-z])/g, '$1\u0000')
    .replace(/([/._\-:@])(?=[^\s/._\-:@])/g, '$1\u0000')
    .replace(/([A-Za-z])(?=\d)|(\d)(?=[A-Za-z])/g, '$1$2\u0000');
  // Never leave a piece under 3 characters on its own line ("Factory|B").
  const parts = marked.split('\u0000').reduce((acc, part) => {
    if (acc.length && (part.length < 3 || acc[acc.length - 1].length < 3)) return [...acc.slice(0, -1), acc[acc.length - 1] + part];
    return [...acc, part];
  }, []);
  return parts.flatMap((part, i) => (i ? [h('wbr'), part] : [part]));
}

// Keep both ends: "AbstractSingleton…Implementation", "packages/…/handler.ts",
// "@scope/…implementation".
function shortenToken(token) {
  const cut = (value, keepHead, keepTail) => `${value.slice(0, keepHead)}…${value.slice(value.length - keepTail)}`;
  if (token.includes('/')) {
    const parts = token.split('/').filter(Boolean);
    const first = parts[0].length > 16 ? `${parts[0].slice(0, 14)}…` : parts[0];
    const last = parts[parts.length - 1];
    const tail = last.length > 18 ? cut(last, 6, 10) : last;
    return parts.length > 1 ? `${first}/…/${tail}`.replace('…/…', '…') : cut(token, 12, 10);
  }
  const pieces = token.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[._:-])/);
  if (pieces.length < 3) return cut(token, 12, 10);
  let head = '';
  let i = 0;
  while (i < pieces.length && head.length < 12) { head += pieces[i]; i += 1; }
  let tail = '';
  let j = pieces.length - 1;
  while (j >= i && tail.length < 10) { tail = pieces[j] + tail; j -= 1; }
  if (head.length > 18) head = head.slice(0, 16);
  if (tail.length > 16) tail = tail.slice(tail.length - 14);
  return head.length + tail.length + 1 < token.length ? `${head}…${tail}` : cut(token, 12, 10);
}

// The shortened token: visible short form (not read, not copied), the full
// token for screen readers and copy, and the hint.
function shortToken(token) {
  // The hidden full token goes first: as an out-of-flow box it can mark a
  // line break, and at the front that break never shows.
  return h('span', { class: 'token-short' },
    h('span', { class: 'sr-only token-full' }, token),
    h('span', { class: 'token-visible', 'aria-hidden': 'true' }, shortenToken(token).split('…').flatMap((part, i) => (i ? [h('wbr'), '…', ...breakToken(part)] : breakToken(part)))),
    tokenHint(token));
}

// Text with <wbr> at natural joints of long tokens: camelCase humps
// (fooBar, HTTPServer), after / . _ - : @, and between letters and digits.
// Tokens over TOKEN_MAX are shortened instead. overflow-wrap: anywhere in
// CSS stays only as the last resort.
function softBreaks(value) {
  return String(value ?? '').split(/(\s+)/).flatMap((token) => {
    if (token.length < SOFT_BREAK_MIN || /^\s+$/.test(token)) return [token];
    const core = token.match(/^([("'“‘[]*)(.*?)([)"'”’\].,;:!?]*)$/);
    const [, lead, body, trail] = core || ['', '', token, ''];
    if (body.length > TOKEN_MAX) return [lead, shortToken(body), trail].filter(Boolean);
    return [lead, ...breakToken(body), trail].filter((part) => part !== '');
  });
}

// Shorter forms of a path or slug, longest first: keep the first segment and
// the file name with its :line; for a plain slug keep the start and the end.
function middleForms(full) {
  const parts = full.split('/');
  if (parts.length > 2) {
    const tails = Array.from({ length: parts.length - 2 }, (_, i) => parts.slice(parts.length - 1 - (parts.length - 3 - i)).join('/'));
    return [...tails.map((tail) => `${parts[0]}/…/${tail}`), `…/${parts[parts.length - 1]}`];
  }
  const cuts = [];
  for (let keep = full.length - 4; keep > 8; keep -= Math.max(2, Math.round(keep / 8))) {
    const head = Math.ceil(keep * 0.4);
    cuts.push(`${full.slice(0, head)}…${full.slice(full.length - (keep - head))}`);
  }
  return cuts;
}

const TRUNC = { watched: new Set(), observer: null, tip: null, anchor: null, pinned: false, nestedWatch: null };

function truncTip() {
  if (TRUNC.tip) return TRUNC.tip;
  const tip = h('div', { class: 'trunc-tip', id: 'trunc-tip', role: 'tooltip', hidden: true });
  if (typeof tip.showPopover === 'function') tip.setAttribute('popover', 'manual');
  document.body.append(tip);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTip(); });
  document.addEventListener('pointerdown', (event) => {
    if (TRUNC.anchor && !TRUNC.anchor.contains(event.target)) hideTip();
  });
  window.addEventListener('scroll', () => { if (!TRUNC.pinned) hideTip(); }, { passive: true });
  TRUNC.tip = tip;
  return tip;
}

function showTip(anchor, full, pinned = false) {
  const tip = truncTip();
  tip.textContent = full;
  tip.hidden = false;
  if (tip.showPopover && !tip.matches(':popover-open')) tip.showPopover();
  const box = anchor.getBoundingClientRect();
  const width = Math.min(tip.offsetWidth, window.innerWidth - 16);
  const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), window.innerWidth - width - 8);
  const below = box.bottom + 6 + tip.offsetHeight <= window.innerHeight - 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${below ? box.bottom + 6 : Math.max(8, box.top - 6 - tip.offsetHeight)}px`;
  if (TRUNC.anchor && TRUNC.anchor !== anchor) TRUNC.anchor.setAttribute('aria-expanded', 'false');
  TRUNC.anchor = anchor;
  TRUNC.pinned = pinned;
  if (anchor.tagName === 'BUTTON') anchor.setAttribute('aria-expanded', 'true');
}

function hideTip() {
  const tip = TRUNC.tip;
  if (!tip || tip.hidden) return;
  if (tip.hidePopover && tip.matches(':popover-open')) tip.hidePopover();
  tip.hidden = true;
  if (TRUNC.anchor && TRUNC.anchor.tagName === 'BUTTON') TRUNC.anchor.setAttribute('aria-expanded', 'false');
  TRUNC.anchor = null;
  TRUNC.pinned = false;
}

// The hint for a shortened token. It starts as a button; inside a link or
// button (known only once attached) it becomes a plain marker instead.
function tokenHint(full) {
  const button = h('button', {
    class: 'trunc-hint token-hint', type: 'button', 'aria-label': 'Show full name', 'aria-expanded': 'false', 'aria-describedby': 'trunc-tip',
  }, '?');
  wireHintButton(button, full);
  button.dataset.full = full;
  watchNestedHints();
  return button;
}

function wireHintButton(button, full) {
  button.addEventListener('mouseenter', () => showTip(button, full));
  button.addEventListener('mouseleave', () => { if (!TRUNC.pinned) hideTip(); });
  button.addEventListener('focus', () => showTip(button, full));
  button.addEventListener('blur', () => { if (!TRUNC.pinned) hideTip(); });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (TRUNC.anchor === button && TRUNC.pinned) hideTip(); else showTip(button, full, true);
  });
}

// A button inside a link or button is invalid: swap such token hints for
// plain markers as soon as they are attached.
function fixNestedHints(root) {
  const hints = root.matches && root.matches('button.token-hint') ? [root] : [...(root.querySelectorAll ? root.querySelectorAll('button.token-hint') : [])];
  hints.forEach((button) => {
    const host = button.parentElement && button.parentElement.closest('a, button, [role="button"], [role="radio"], [role="option"]');
    if (!host) return;
    const mark = h('span', { class: 'trunc-hint token-hint', 'aria-hidden': 'true' }, '?');
    const full = button.dataset.full;
    mark.addEventListener('mouseenter', () => showTip(mark, full));
    mark.addEventListener('mouseleave', () => { if (!TRUNC.pinned) hideTip(); });
    button.replaceWith(mark);
  });
}

function watchNestedHints() {
  if (TRUNC.nestedWatch || !('MutationObserver' in window)) return;
  TRUNC.nestedWatch = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node.nodeType === 1) fixNestedHints(node);
  })));
  TRUNC.nestedWatch.observe(document.documentElement, { childList: true, subtree: true });
}

// Inside a link or button a nested button is invalid, so the hint is a plain
// marker there, shown on hover and when the link itself has focus.
function truncHint(el, full) {
  const host = el.parentElement && el.parentElement.closest('a, button, [role="button"]');
  if (host) {
    const mark = h('span', { class: 'trunc-hint', 'aria-hidden': 'true' }, '?');
    mark.addEventListener('mouseenter', () => showTip(mark, full));
    mark.addEventListener('mouseleave', () => { if (!TRUNC.pinned) hideTip(); });
    host.addEventListener('focus', () => { if (mark.isConnected) showTip(mark, full); });
    host.addEventListener('blur', () => { if (TRUNC.anchor === mark) hideTip(); });
    return mark;
  }
  const button = h('button', {
    class: 'trunc-hint', type: 'button', 'aria-label': 'Show full name', 'aria-expanded': 'false', 'aria-describedby': 'trunc-tip',
  }, '?');
  wireHintButton(button, full);
  return button;
}

function isCut(el) {
  return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 1;
}

// Exact width of the visible text against the content box: CSS ellipsis
// appears at any sub-pixel overflow, which rounded scrollWidth can miss.
function textFits(el, span) {
  const style = getComputedStyle(el);
  // Fractional widths: clientWidth rounds and would call an exact fit a cut.
  const room = el.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
  // Ellipsis shows on any real overflow; a box sized to its text is equal.
  return span.getBoundingClientRect().width <= room + 0.05;
}

function checkTruncation(el) {
  const state = el.__trunc;
  if (!state || !el.isConnected || !el.getClientRects().length) return;
  el.classList.remove('is-truncated');
  if (state.hint) state.hint.remove();
  if (state.mode === 'middle') state.visible.textContent = state.full;
  let cut = state.mode === 'middle' ? !textFits(el, state.visible) : isCut(el);
  if (cut) {
    el.classList.add('is-truncated');
    if (state.mode === 'middle') {
      const forms = middleForms(state.full);
      const fits = forms.find((form) => { state.visible.textContent = form; return textFits(el, state.visible); });
      if (!fits) state.visible.textContent = forms[forms.length - 1] || state.full;
    }
    cut = true;
    state.hint = state.hint || truncHint(el, state.full);
    el.append(state.hint);
  }
  el.dataset.truncated = String(cut);
}

/**
 * Mark an element whose text may be cut (CSS ellipsis or line clamp, or
 * mode "middle" for paths). A "?" hint with the full text appears only while
 * the text is really cut.
 */
function truncatable(el, full, { mode = 'end' } = {}) {
  const text = String(full ?? '');
  el.removeAttribute('title');
  el.classList.add('truncatable');
  if (mode === 'middle') {
    const visible = h('span', { class: 'trunc-visible', 'aria-hidden': 'true' }, text);
    fill(el, visible, h('span', { class: 'sr-only' }, text));
    el.__trunc = { full: text, mode, visible, hint: null };
  } else {
    el.__trunc = { full: text, mode, hint: null };
  }
  if (!TRUNC.observer && 'ResizeObserver' in window) {
    TRUNC.observer = new ResizeObserver((entries) => entries.forEach((entry) => checkTruncation(entry.target)));
    // Web fonts load after first render; widths change when they land.
    if (document.fonts) {
      document.fonts.ready.then(recheckTruncation);
      document.fonts.addEventListener('loadingdone', recheckTruncation);
    }
  }
  TRUNC.watched.add(el);
  if (TRUNC.observer) TRUNC.observer.observe(el);
  return el;
}

// Re-check every watched element, for example after a style switch.
function recheckTruncation() {
  TRUNC.watched.forEach((el) => {
    if (!el.isConnected) TRUNC.watched.delete(el);
    else checkTruncation(el);
  });
}

// The credit follows the style on screen: Clean owes its type and greys to
// Geist, Playful its palette and rounded type to Duolingo's design language.
const CREDIT_CLEAN = 'Lesson pacing inspired by Brilliant. Type and greys from Geist by Vercel. Not affiliated with either.';
const CREDIT_PLAYFUL = 'Lesson pacing inspired by Brilliant. Palette and rounded type (Nunito) inspired by Duolingo\'s design language. Not affiliated with either.';

function designCredit() {
  return h('p', { class: 'credit' }, h('span', { class: 'credit-clean' }, CREDIT_CLEAN), h('span', { class: 'credit-playful' }, CREDIT_PLAYFUL));
}

// Break points only (no shortening), for text that wraps or is clamped.
function wordBreaks(value) {
  return String(value ?? '').split(/(\s+)/).flatMap((token) => (token.length < SOFT_BREAK_MIN || /^\s+$/.test(token) ? [token] : breakToken(token)));
}

// ---------- Navigation state, shared by the explainer, the hub and the kit ----------
// Mark the current item in every nav copy; in a visible sidebar, bring it
// into view inside the nav (a reader action, never on scroll).
function setNavCurrent(links, key) {
  links.forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const current = links.find((a) => a.dataset.nav === key && a.closest('.side') && a.getClientRects().length);
  if (!current) return;
  current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  // Web fonts can change row heights after the first paint: check again then.
  if (document.fonts) document.fonts.ready.then(() => { if (current.getAttribute('aria-current') === 'page') current.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
}

// data-more="below" while the nav has rows under its bottom edge.
function watchNavMore(nav) {
  if (!nav) return;
  const paint = () => {
    const more = nav.scrollTop + nav.clientHeight < nav.scrollHeight - 2;
    if (more) nav.dataset.more = 'below'; else delete nav.dataset.more;
  };
  nav.addEventListener('scroll', paint, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(paint).observe(nav);
  paint();
}

// ---------- Dates ----------
// A date-only value (2026-11-17) is a calendar day: show that day wherever
// the reader is. A value with a time is a moment: show the reader's own day
// for it, so 2026-11-17T20:00Z reads Nov 18 in Manila.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function displayDate(value, { year = true, fallback = '' } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return fallback;
  const options = { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) };
  return date.toLocaleDateString(undefined, DATE_ONLY.test(raw) ? { ...options, timeZone: 'UTC' } : options);
}
