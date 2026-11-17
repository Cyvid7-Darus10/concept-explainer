// Chapter: risks. An impact grid: high, medium and low rows, each risk a
// card in its row. Picking one shows its mitigation and owner.
// Deep link: #risks/<index> (from 0, in data order).

const CH_IMPACTS = [['high', 'High', 3], ['medium', 'Medium', 2], ['low', 'Low', 1]];

function chImpactMeter(level) {
  return h('span', { class: 'ch-meter', 'aria-hidden': 'true' }, [1, 2, 3].map((n) => h('i', { class: n <= level ? 'is-on' : '' })));
}

/**
 * @param {object} data explainer data (reads data.risks)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderRisks(data, mount) {
  const risks = list(data.risks).filter((r) => r && typeof r === 'object');
  if (!risks.length) {
    mount.append(h('p', { class: 'empty' }, 'No risks listed.'));
    return null;
  }
  const impactOf = (risk) => (CH_IMPACTS.some(([key]) => key === risk.impact) ? risk.impact : 'medium');
  const detail = h('aside', { class: 'panel ch-detail', 'aria-live': 'polite' });
  const cards = new Map();
  let selected = null;

  // Visual order: high first; the deep-link index stays the data index.
  const order = CH_IMPACTS.flatMap(([key]) => risks.map((risk, i) => [risk, i]).filter(([risk]) => impactOf(risk) === key).map(([, i]) => i));
  order.forEach((i) => {
    const risk = risks[i];
    cards.set(i, h('button', {
      class: 'ch-risk', type: 'button', 'aria-pressed': 'false', onclick: () => select(selected === i ? null : i),
    }, h('span', { class: 'ch-risk-text' }, softBreaks(text(risk.risk))), text(risk.owner) && h('span', { class: 'ch-risk-owner' }, softBreaks(risk.owner))));
  });
  const buttons = order.map((i) => cards.get(i));
  chRoving(buttons, { onMove: (k) => select(order[k]) });

  function select(index, { link = true } = {}) {
    selected = index;
    chMarkCurrent(buttons, index === null ? null : order.indexOf(index));
    renderDetail();
    if (link) setDeepLink(index === null ? 'risks' : `risks/${index}`);
    return index === null ? null : cards.get(index);
  }

  function renderDetail() {
    if (selected === null) {
      fill(detail, chEmptyDetail('Pick a risk', 'Risks sit in rows by impact, the worst at the top. Each one shows how it is handled.'));
      return;
    }
    const risk = risks[selected];
    const [, label, level] = CH_IMPACTS.find(([key]) => key === impactOf(risk));
    const at = order.indexOf(selected);
    fill(detail,
      h('div', { class: 'step-top' }, h('span', { class: 'ch-impact' }, chImpactMeter(level), `${label} impact`)),
      h('h3', null, softBreaks(text(risk.risk))),
      h('div', { class: 'why why-risk' }, h('p', { class: 'eyebrow quiet' }, 'How it is handled'), h('p', null, softBreaks(text(risk.mitigation, 'No mitigation recorded.')))),
      text(risk.owner) && h('p', { class: 'ch-owner' }, h('span', { class: 'detail-label' }, 'Owner'), softBreaks(risk.owner)),
      chStepper(at, order.length, (k) => { select(order[k]); buttons[k].focus(); }, 'risk'));
  }

  const grid = h('div', { class: 'panel ch-impact-grid', role: 'group', 'aria-label': 'Risks by impact' }, CH_IMPACTS.map(([key, label, level]) => {
    const inRow = order.filter((i) => impactOf(risks[i]) === key);
    return h('div', { class: `ch-impact-row is-${key}` },
      h('div', { class: 'ch-impact-head' }, chImpactMeter(level), h('span', { class: 'ch-impact-name' }, label), h('span', { class: 'ch-impact-count' }, String(inRow.length))),
      h('div', { class: 'ch-impact-cells' }, inRow.length ? inRow.map((i) => cards.get(i)) : h('span', { class: 'ch-ctx-none' }, 'None')));
  }));
  select(null, { link: false });
  mount.append(h('div', { class: 'ch-cq' }, h('div', { class: 'ch-split' }, grid, detail)));
  buttons.forEach((card, k) => riseIn(card, Math.min(k, 8) * 30));
  return {
    open([raw] = []) {
      const index = chIndexPart(raw, risks.length);
      return index === null ? null : select(index, { link: false });
    },
  };
}
