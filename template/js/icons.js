// Hairline icons for each component kind: one stroke weight, no fills,
// drawn in currentColor so they follow the text colour and the theme.
// scripts/lib/assets.mjs runs this file on its own with a string `s()`,
// so it must not use anything but `s` from the other modules.

// Layer colours stay in the data contract but render only as small markers
// and thin bars. `ink` is the marker; `wash` and `text` keep the old shape.
const LAYER_MARKERS = {
  green: '#5b9a6e',
  blue: '#5b86c4',
  navy: '#4a5d8a',
  midnight: '#76739a',
  yellow: '#c39a3d',
  pink: '#c0689a',
};

const PALETTE = Object.fromEntries(Object.entries(LAYER_MARKERS)
  .map(([name, hex]) => [name, { ink: hex, wash: hex, text: hex }]));

function paletteFor(name) {
  return PALETTE[name] || PALETTE.green;
}

const ICON_SHAPES = {
  user: () => [
    s('circle', { cx: 12, cy: 8, r: 3.5 }),
    s('path', { d: 'M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7' }),
  ],
  ui: () => [
    s('rect', { x: 3, y: 4, width: 18, height: 16, rx: 2 }),
    s('path', { d: 'M3 8.5h18M7 12.5h5M7 16h9' }),
  ],
  mobile: () => [
    s('rect', { x: 7, y: 2.5, width: 10, height: 19, rx: 2 }),
    s('path', { d: 'M11 18.5h2' }),
  ],
  api: () => [
    s('path', { d: 'M4 9h15M15.5 5.5L19 9l-3.5 3.5' }),
    s('path', { d: 'M20 15H5M8.5 11.5L5 15l3.5 3.5' }),
  ],
  service: () => [
    s('path', { d: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z' }),
    s('circle', { cx: 12, cy: 12, r: 2.5 }),
  ],
  db: () => [
    s('ellipse', { cx: 12, cy: 6, rx: 7, ry: 2.5 }),
    s('path', { d: 'M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6' }),
    s('path', { d: 'M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5' }),
  ],
  queue: () => [
    s('rect', { x: 3, y: 7, width: 4.5, height: 10, rx: 1 }),
    s('rect', { x: 9.75, y: 7, width: 4.5, height: 10, rx: 1 }),
    s('rect', { x: 16.5, y: 7, width: 4.5, height: 10, rx: 1 }),
  ],
  cache: () => [
    s('path', { d: 'M13 3L5 13.5h6L10 21l8-10.5h-6z' }),
  ],
  external: () => [
    s('path', { d: 'M7 18.5a4 4 0 01-.6-7.96A5.5 5.5 0 0117 9a4.5 4.5 0 01.5 9.5z' }),
  ],
  job: () => [
    s('circle', { cx: 12, cy: 12, r: 8.5 }),
    s('path', { d: 'M12 7.5V12l3 2' }),
  ],
  cli: () => [
    s('rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 2 }),
    s('path', { d: 'M7 10l3 2-3 2M12.5 15h4.5' }),
  ],
  auth: () => [
    s('rect', { x: 5, y: 10.5, width: 14, height: 10, rx: 2 }),
    s('path', { d: 'M8 10.5V7.5a4 4 0 018 0v3M12 14.5v2' }),
  ],
  storage: () => [
    s('rect', { x: 3, y: 4, width: 18, height: 5, rx: 1 }),
    s('path', { d: 'M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M10 13h4' }),
  ],
  library: () => [
    s('rect', { x: 3.5, y: 4, width: 4, height: 16, rx: 1 }),
    s('rect', { x: 9.5, y: 6, width: 4, height: 14, rx: 1 }),
    s('path', { d: 'M15.4 7.2l3.3-1 3 13-3.3 1z' }),
  ],
  folder: () => [
    s('path', { d: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z' }),
  ],
  file: () => [
    s('path', { d: 'M6 3h8l4 4v14H6z' }),
    s('path', { d: 'M14 3v4h4' }),
  ],
  robot: () => [
    s('rect', { x: 4.5, y: 8, width: 15, height: 11, rx: 2.5 }),
    s('path', { d: 'M12 8V5' }),
    s('circle', { cx: 12, cy: 4, r: 1 }),
    s('circle', { cx: 9, cy: 13.5, r: 1.2 }),
    s('circle', { cx: 15, cy: 13.5, r: 1.2 }),
  ],
  trophy: () => [
    s('path', { d: 'M8 4h8v5a4 4 0 01-8 0z' }),
    s('path', { d: 'M8 6H5.5a2.5 2.5 0 002.7 3.6M16 6h2.5a2.5 2.5 0 01-2.7 3.6M12 13v4M8.5 20h7M10 17h4v3h-4z' }),
  ],
  // Interface glyphs (not node kinds).
  system: () => [
    s('rect', { x: 3.5, y: 4.5, width: 17, height: 11.5, rx: 1.8 }),
    s('path', { d: 'M9 20h6M12 16v4' }),
  ],
  light: () => [
    s('circle', { cx: 12, cy: 12, r: 3.9 }),
    s('path', { d: 'M12 2.7v2.1M12 19.2v2.1M2.7 12h2.1M19.2 12h2.1M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M5.4 18.6l1.5-1.5M17.1 6.9l1.5-1.5' }),
  ],
  dark: () => [
    s('path', { d: 'M19.2 14.4A7.8 7.8 0 019.6 4.8a7.8 7.8 0 109.6 9.6z' }),
  ],
  library_shelf: () => [
    s('rect', { x: 3.5, y: 3.5, width: 7, height: 7, rx: 1 }),
    s('rect', { x: 13.5, y: 3.5, width: 7, height: 7, rx: 1 }),
    s('rect', { x: 3.5, y: 13.5, width: 7, height: 7, rx: 1 }),
    s('rect', { x: 13.5, y: 13.5, width: 7, height: 7, rx: 1 }),
  ],
};

const KIND_ALIASES = { frontend: 'ui', web: 'ui', page: 'ui', server: 'service', worker: 'job', cron: 'job', database: 'db', bucket: 'storage', thirdparty: 'external', package: 'library' };

function icon(kind, attrs = {}) {
  const key = ICON_SHAPES[kind] ? kind : KIND_ALIASES[kind] || 'service';
  return s('svg', {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', ...attrs,
  }, ICON_SHAPES[key]());
}

// The mark: an orange tile holding a tiny three-part map, drawn as hairlines.
function brandMark() {
  return s('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true', focusable: 'false', class: 'brand-mark' },
    s('rect', { class: 'brand-mark-tile', x: 2, y: 2, width: 28, height: 28, rx: 6, fill: '#fc5e32' }),
    s('path', { d: 'M10.5 11h11M10.5 11l5.5 10.5M21.5 11L16 21.5', fill: 'none', stroke: '#ffffff', 'stroke-width': 1.75, 'stroke-linecap': 'round' }),
    s('circle', { cx: 10.5, cy: 11, r: 2.5, fill: '#ffffff' }),
    s('circle', { cx: 21.5, cy: 11, r: 2.5, fill: '#ffffff' }),
    s('circle', { cx: 16, cy: 21.5, r: 2.5, fill: '#ffffff' }));
}
