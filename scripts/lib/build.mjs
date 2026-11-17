import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'template');

// Order matters only for readability; all modules share one function scope.
const SCRIPT_ORDER = ['dom.js', 'icons.js', 'map.js', 'models.js', 'flow.js', 'changes.js', 'lessons.js', 'sections.js', 'app.js'];
const LIBRARY_SCRIPT_ORDER = ['dom.js', 'icons.js', 'library.js'];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Serialise data so it can never close the surrounding <script> tag.
 * @param {unknown} data
 * @returns {string}
 */
export function serializeForScript(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}

function readTemplate(templateDir, order = SCRIPT_ORDER, page = 'explainer.html') {
  const read = (file) => {
    try {
      return readFileSync(join(templateDir, file), 'utf8');
    } catch (error) {
      throw new Error(`read template ${file}: ${error.message}`);
    }
  };
  const scripts = order.map((file) => `// ---- ${file} ----\n${read(join('js', file))}`).join('\n');
  return { html: read(page), styles: read('styles.css'), scripts };
}

// One pass over the template, so text inserted for one placeholder (say, a
// title containing "__EXPLAINER_DATA__") is never scanned for another.
// A template without a placeholder (say, no context tag yet) simply skips it.
const PLACEHOLDER_PATTERN = /__TITLE__|__DESCRIPTION__|\/\*__STYLES__\*\/|\/\*__SCRIPTS__\*\/|__EXPLAINER_DATA__|__CONTEXT__/g;

function assemble({ html, styles, scripts }, title, data, bootCall = '', description = '', context = {}) {
  const values = {
    __TITLE__: escapeHtml(title),
    __DESCRIPTION__: escapeHtml(description),
    '/*__STYLES__*/': styles,
    '/*__SCRIPTS__*/': `(() => {\n'use strict';\n${scripts}\n${bootCall}\n})();`,
    __EXPLAINER_DATA__: serializeForScript(data),
    __CONTEXT__: serializeForScript(context),
  };
  return html.replace(PLACEHOLDER_PATTERN, (match) => values[match]);
}

/**
 * Render explainer data into one self-contained HTML file.
 * @param {object} data validated explainer data
 * @param {{ templateDir?: string, context?: { libraryHref?: string, slug?: string } }} [options]
 *   `context` fills the page's explainer-context tag; `{}` for a standalone page.
 * @returns {string}
 */
export function buildExplainer(data, options = {}) {
  const parts = readTemplate(options.templateDir || TEMPLATE_DIR);
  const title = data && data.meta && data.meta.title ? `${data.meta.title} · Repo Explainer` : 'Repo Explainer';
  const description = data && data.meta && typeof data.meta.summary === 'string' ? data.meta.summary : '';
  return assemble(parts, title, data, 'boot();', description, options.context || {});
}

/**
 * Render the library hub: every explainer in the library, searchable.
 * The page reads `{ manifest, index }` from its explainer-data tag.
 * @param {object} manifest library.json contents
 * @param {object[]} searchIndex entries from search-index.mjs
 * @param {{ templateDir?: string }} [options]
 * @returns {string}
 */
export function buildLibrary(manifest, searchIndex, options = {}) {
  const parts = readTemplate(options.templateDir || TEMPLATE_DIR, LIBRARY_SCRIPT_ORDER, 'library.html');
  const count = manifest && Array.isArray(manifest.explainers) ? manifest.explainers.length : 0;
  const description = `${count} explainer${count === 1 ? '' : 's'}: search, browse and open them in one place.`;
  return assemble(parts, 'Explainer library · Repo Explainer', { manifest, index: searchIndex }, 'bootLibrary();', description);
}

/**
 * Render the design-kit gallery (icons, palette, components, patterns).
 * @param {{ kinds: string[], patterns: object[], version?: string }} kit
 * @returns {string}
 */
export function buildGallery(kit, options = {}) {
  const order = SCRIPT_ORDER.filter((f) => f !== 'app.js').concat('gallery.js');
  const parts = readTemplate(options.templateDir || TEMPLATE_DIR, order);
  return assemble(parts, 'Repo Explainer kit', kit, 'bootGallery();', 'Icons, colors, components and flow patterns for Repo Explainer.');
}
