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

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
function safeUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

// A path with soft break points after each "/", so it wraps at folder
// boundaries. <wbr> adds no characters, so copying gives the exact path.
function breakablePath(path) {
  return String(path).split(/(?<=\/)/).flatMap((part, i) => (i ? [h('wbr'), part] : [part]));
}

function fileChip(path) {
  return h('span', { class: 'chip-file', title: path }, path);
}

// Browser storage is a per-reader convenience only: it can be missing or
// throw (private windows, file:// rules), and the page works without it.
function readStore(key) {
  try {
    return window.localStorage.getItem(key);
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
  return h('span', { class: `tag${extra ? ` ${extra}` : ''}` }, label);
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

// ---------- Theme: system, light, dark. Shared by the explainer and the kit. ----------
const THEME_KEY = 'repo-explainer:theme';
const THEME_CHOICES = [
  { choice: 'system', label: 'System' },
  { choice: 'light', label: 'Light' },
  { choice: 'dark', label: 'Dark' },
];

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

function themeSwitch(registry) {
  const buttons = THEME_CHOICES.map((option, index) => h('button', {
    class: 'ts-option', type: 'button', role: 'radio', 'aria-label': `${option.label} theme`, title: `${option.label} theme`, 'data-label': option.label,
    onclick: () => choose(option.choice),
    onkeydown: (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = THEME_CHOICES[(index + step + THEME_CHOICES.length) % THEME_CHOICES.length];
      choose(next.choice);
      registry.focus(next.choice, event.currentTarget.parentElement);
    },
  }, icon(option.choice)));
  const el = h('div', { class: 'theme-switch', role: 'radiogroup', 'aria-label': 'Colour theme' }, buttons);
  function choose(choice) {
    writeStore(THEME_KEY, choice);
    applyTheme(choice);
    registry.paint();
  }
  registry.add(el);
  return el;
}

function themeRegistry() {
  const groups = [];
  return {
    add: (el) => groups.push(el),
    paint: () => {
      const picked = storedTheme();
      groups.forEach((group) => [...group.children].forEach((button, i) => {
        const on = THEME_CHOICES[i].choice === picked;
        button.setAttribute('aria-checked', String(on));
        button.tabIndex = on ? 0 : -1;
      }));
    },
    focus: (choice, group) => {
      const index = THEME_CHOICES.findIndex((t) => t.choice === choice);
      if (group && group.children[index]) group.children[index].focus();
    },
  };
}

