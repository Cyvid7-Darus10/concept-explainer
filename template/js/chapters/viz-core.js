// The visuals kit: nine fixed kinds drawn as SVG from data (no SVG or
// images in the data). vizMount() draws one visual, makes every part
// selectable with a detail panel, and keeps one tab stop (arrows move).
// Each kind lives in viz-*.js as vizDraw<Kind>(visual, width), returning
// { nodes, height, parts, highlight? }. Parts are 0 based, in the order of
// the Parts column in references/visuals.md.

const VIZ_FONT = 13;
// Average glyph width per font size, a little wide so Nunito fits too.
const VIZ_CHAR = 0.6;
const VIZ_LINE = 17;
const VIZ_MIN_WIDTH = 260;
const VIZ_STAGGER = 40;
const VIZ_KIND_NAMES = {
  layers: 'Layers', cycle: 'Cycle', state: 'States', compare: 'Comparison', hierarchy: 'Hierarchy',
  beforeAfter: 'Before and after', quadrant: 'Quadrant', funnel: 'Funnel', venn: 'Overlap',
};
const VIZ = { uid: 0 };

function vizDrawer(kind) {
  const drawers = {
    layers: vizDrawLayers, cycle: vizDrawCycle, funnel: vizDrawFunnel, state: vizDrawState, hierarchy: vizDrawHierarchy,
    compare: vizDrawCompare, beforeAfter: vizDrawBeforeAfter, quadrant: vizDrawQuadrant, venn: vizDrawVenn,
  };
  return Object.prototype.hasOwnProperty.call(drawers, kind) ? drawers[kind] : null;
}

function vizUid(prefix) {
  VIZ.uid += 1;
  return `${prefix}-${VIZ.uid}`;
}

/** How many characters of text at `size` px fit in `width` px. */
function vizChars(width, size = VIZ_FONT) {
  return Math.max(3, Math.floor(width / (size * VIZ_CHAR)));
}

/** Text width estimate in px. */
function vizTextWidth(value, size = VIZ_FONT) {
  return String(value).length * size * VIZ_CHAR;
}

/**
 * Wrap text into at most maxLines lines of maxChars. Words longer than a
 * line are split; the last line ends in an ellipsis when text is left over.
 */
function vizWrap(value, maxChars, maxLines = 3) {
  const room = Math.max(3, maxChars);
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean)
    .flatMap((word) => (word.length <= room ? [word] : word.match(new RegExp(`.{1,${room - 1}}`, 'g')).map((piece, i, all) => (i < all.length - 1 ? `${piece}-` : piece))));
  const lines = [];
  let current = '';
  let rest = false;
  words.forEach((word) => {
    if (rest) return;
    const next = current ? `${current} ${word}` : word;
    if (next.length <= room) { current = next; return; }
    if (lines.length === maxLines - 1) { rest = true; return; }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  if (rest || lines.length > maxLines) {
    const last = lines.slice(0, maxLines);
    const tail = last[last.length - 1];
    last[last.length - 1] = `${tail.length >= room ? tail.slice(0, room - 1) : tail}…`;
    return last;
  }
  return lines.length ? lines : [''];
}

/** An SVG text block, one tspan per line, centred on y when `middle`. */
function vizText(lines, { x, y, cls = 'viz-label', anchor = 'start', lineHeight = VIZ_LINE, middle = true }) {
  const top = middle ? y - ((lines.length - 1) * lineHeight) / 2 : y;
  return s('text', { class: cls, x, y: top, 'text-anchor': anchor, 'dominant-baseline': 'central' },
    lines.map((line, i) => s('tspan', { x, dy: i === 0 ? 0 : lineHeight }, line)));
}

/** Arrowhead markers for one SVG (ids are unique per drawing). */
function vizMarkers(id) {
  const marker = (suffix, cls) => s('marker', {
    id: `${id}-${suffix}`, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 8, markerHeight: 8, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse',
  }, s('path', { class: `viz-tip ${cls}`, d: 'M0,1 L9,5 L0,9 z' }));
  return s('defs', null, marker('rest', 'is-rest'), marker('on', 'is-on'));
}

/** A part: a group with a hit area. The framework adds role, focus and clicks. */
function vizPart(children, info) {
  return { el: s('g', { class: 'viz-part' }, children), ...info };
}

function vizRoundRect(x, y, width, height, cls = 'viz-box') {
  return s('rect', { class: cls, x: x + 0.5, y: y + 0.5, width: Math.max(0, width - 1), height: Math.max(0, height - 1) });
}

function vizFacts(facts) {
  const rows = list(facts).filter((row) => row && row[1] !== undefined && row[1] !== null && row[1] !== '');
  if (!rows.length) return null;
  return h('dl', { class: 'viz-facts' }, rows.map(([label, value]) => h('div', null,
    h('dt', null, label), h('dd', null, value instanceof Node || Array.isArray(value) ? value : softBreaks(String(value))))));
}

/**
 * Draw one visual with its detail panel.
 * @param {object} visual { kind, ...shape } (title and caption are shown by the caller)
 * @param {{ label?: string, onSelect?: (index: number|null) => void, compact?: boolean }} [options]
 * @returns {{ root: HTMLElement, select: (index: number|null, opts?: object) => HTMLElement|null, count: () => number, selected: () => number|null }}
 */
function vizMount(visual, { label = '', onSelect = null, compact = false } = {}) {
  const drawer = vizDrawer(visual && visual.kind);
  const stage = h('div', { class: 'viz-stage' });
  const detail = h('div', { class: 'viz-detail', 'aria-live': 'polite' });
  const root = h('div', { class: `viz viz-${drawer ? visual.kind : 'unknown'}${compact ? ' is-compact' : ''}` }, stage, detail);
  const id = vizUid('viz');
  let drawing = null;
  let svg = null;
  let selected = null;
  let drawn = false;

  if (!drawer) {
    fill(stage, h('p', { class: 'empty' }, `This visual kind (${text(visual && visual.kind, 'none')}) is not in the kit.`));
    return { root, select: () => null, count: () => 0, selected: () => null };
  }

  function paint() {
    if (!drawing) return;
    drawing.parts.forEach((part, i) => {
      const on = i === selected;
      part.el.classList.toggle('is-selected', on);
      part.el.setAttribute('aria-selected', String(on));
      part.el.setAttribute('tabindex', on || (selected === null && i === 0) ? '0' : '-1');
    });
    svg.classList.toggle('has-selection', selected !== null);
    if (drawing.highlight) drawing.highlight(selected);
  }

  function renderDetail() {
    if (selected === null || !drawing) {
      fill(detail, chEmptyDetail('Pick any part of the drawing', 'Click a part, or Tab to the drawing and use the arrow keys. Each part shows what it does here.'));
      return;
    }
    const part = drawing.parts[selected];
    fill(detail,
      h('p', { class: 'eyebrow quiet' }, part.kicker || `Part ${selected + 1} of ${drawing.parts.length}`),
      h('h3', null, softBreaks(part.label)),
      part.detail && h('p', { class: 'viz-detail-text' }, softBreaks(part.detail)),
      vizFacts(part.facts),
      drawing.parts.length > 1 && chStepper(selected, drawing.parts.length, (i) => select(i, { focus: false })));
  }

  function draw(width, { measured = true } = {}) {
    const focusedIndex = drawing ? drawing.parts.findIndex((p) => p.el === document.activeElement) : -1;
    const room = Math.max(VIZ_MIN_WIDTH, Math.floor(width));
    drawing = drawer(visual, room, `${id}-m`);
    svg = s('svg', {
      class: 'viz-svg', width: room, height: Math.ceil(drawing.height), viewBox: `0 0 ${room} ${Math.ceil(drawing.height)}`,
      role: 'listbox', 'aria-label': text(label, VIZ_KIND_NAMES[visual.kind]), 'aria-orientation': 'vertical',
    }, vizMarkers(`${id}-m`), drawing.nodes, drawing.parts.map((p) => p.el));
    drawing.parts.forEach((part, i) => {
      part.el.setAttribute('role', 'option');
      part.el.setAttribute('aria-label', part.aria || [part.label, part.detail].filter(Boolean).join('. '));
      part.el.dataset.part = String(i);
      part.el.prepend(s('title', null, part.label));
      part.el.addEventListener('click', () => select(selected === i ? null : i, { focus: false }));
    });
    fill(stage, svg, drawing.legend || null);
    paint();
    if (focusedIndex >= 0 && drawing.parts[focusedIndex]) drawing.parts[focusedIndex].el.focus({ preventScroll: true });
    // One-shot entrance, the first time the drawing is really on screen.
    if (!drawn && measured && stage.isConnected) {
      drawn = true;
      drawing.parts.forEach((part, i) => motion(part.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: Math.min(i, 8) * VIZ_STAGGER, fill: 'backwards' }));
    }
  }

  function select(index, { focus = false, silent = false } = {}) {
    const count = drawing ? drawing.parts.length : 0;
    const next = index === null || index === undefined ? null : Math.min(Math.max(index, 0), count - 1);
    selected = count ? next : null;
    paint();
    renderDetail();
    const el = selected !== null && drawing ? drawing.parts[selected].el : null;
    if (focus && el) el.focus({ preventScroll: true });
    if (!silent && onSelect) onSelect(selected);
    return el;
  }

  stage.addEventListener('keydown', (event) => {
    const host = event.target.closest && event.target.closest('[data-part]');
    if (!host || !drawing) return;
    const index = Number(host.dataset.part);
    const count = drawing.parts.length;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    let next = null;
    if (step) next = (index + step + count) % count;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = count - 1;
    if (event.key === 'Enter' || event.key === ' ') next = index;
    if (event.key === 'Escape' && selected !== null) {
      event.preventDefault();
      select(null);
      host.focus();
      return;
    }
    if (next === null) return;
    event.preventDefault();
    select(next, { focus: true });
  });

  // Drawn at the width it gets, and again when that width changes.
  draw(640, { measured: false });
  renderDetail();
  chOnWidth(stage, (width) => { if (width > 0) draw(width); });
  return { root, select, count: () => (drawing ? drawing.parts.length : 0), selected: () => selected };
}

/** A visual with its title and caption (the takeaway) above the drawing. */
function vizFigure(visual, { title, caption, onSelect, headingLevel = 'h3', compact = false } = {}) {
  const heading = text(title || visual.title);
  const takeaway = text(caption || visual.caption);
  const mounted = vizMount(visual, { label: heading || takeaway, onSelect, compact });
  const figure = h('figure', { class: `viz-figure${compact ? ' is-compact' : ''}` },
    (heading || takeaway) && h('figcaption', { class: 'viz-cap' },
      h('span', { class: 'eyebrow quiet' }, VIZ_KIND_NAMES[visual.kind] || 'Visual'),
      heading && h(headingLevel, { class: 'viz-title' }, softBreaks(heading)),
      takeaway && h('p', { class: 'viz-caption' }, softBreaks(takeaway))),
    mounted.root);
  return { ...mounted, root: figure };
}
