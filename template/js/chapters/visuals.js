// Chapter: visuals (diagrams[]). Pick a diagram, then pick its parts.
// Deep links: #visuals/<diagramId> and #visuals/<diagramId>/<part>, parts
// counted from 0 in the order of references/visuals.md.

function chDiagramId(diagram, index) {
  return text(diagram && typeof diagram.id === 'string' ? diagram.id : '', String(index));
}

/**
 * @param {object} data explainer data (reads data.diagrams)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderVisuals(data, mount) {
  const diagrams = list(data.diagrams).filter((d) => d && typeof d === 'object');
  if (!diagrams.length) {
    mount.append(h('p', { class: 'empty' }, 'No diagrams in this explainer.'));
    return null;
  }
  const figures = new Map();
  const stage = h('div', { class: 'ch-viz-stage' });
  let current = 0;

  const picks = diagrams.map((diagram, i) => h('button', {
    class: 'ch-pick', type: 'button', 'aria-pressed': 'false', onclick: () => show(i),
  },
  h('span', { class: 'ch-pick-top' }, h('span', null, String(i + 1).padStart(2, '0')), h('span', null, VIZ_KIND_NAMES[diagram.kind] || text(diagram.kind, 'Visual'))),
  h('span', { class: 'ch-pick-title' }, softBreaks(text(diagram.title, chDiagramId(diagram, i))))));
  chRoving(picks, { onMove: (i) => show(i) });

  function figureFor(i) {
    if (!figures.has(i)) {
      const diagram = diagrams[i];
      const id = chDiagramId(diagram, i);
      const figure = vizFigure(diagram, {
        headingLevel: 'h2',
        onSelect: (part) => { if (current === i) setDeepLink(part === null ? `visuals/${linkPart(id)}` : `visuals/${linkPart(id)}/${part}`); },
      });
      figures.set(i, figure);
      stage.append(figure.root);
    }
    return figures.get(i);
  }

  function show(i, { link = true } = {}) {
    current = i;
    const figure = figureFor(i);
    figures.forEach((f, j) => { f.root.hidden = j !== i; });
    chMarkCurrent(picks, i);
    if (link) setDeepLink(`visuals/${linkPart(chDiagramId(diagrams[i], i))}`);
    return figure;
  }

  show(0, { link: false });
  mount.append(h('div', { class: 'ch-visuals' },
    diagrams.length > 1 && h('div', { class: 'ch-pick-list', role: 'group', 'aria-label': 'Diagrams' }, picks),
    stage));
  return {
    open([id, part] = []) {
      if (id === undefined) return null;
      const index = diagrams.findIndex((d, i) => chDiagramId(d, i) === id);
      if (index < 0) return null;
      const figure = show(index, { link: false });
      const wanted = chIndexPart(part, figure.count());
      return figure.select(wanted, { silent: true }) || figure.root;
    },
  };
}
