// Chapter: rollout. A stepped track: done steps filled, the next step ringed,
// the rest hollow. Across when the steps fit, down otherwise.
// Deep link: #rollout/<index> (from 0).

const CH_TRACK_STEP = 132;

/**
 * @param {object} data explainer data (reads data.rollout)
 * @param {HTMLElement} mount the chapter body
 * @returns {{ open: (parts: string[]) => Element|null }|null}
 */
function chRenderRollout(data, mount) {
  const steps = list(data.rollout).filter((st) => st && typeof st === 'object');
  if (!steps.length) {
    mount.append(h('p', { class: 'empty' }, 'No rollout steps listed.'));
    return null;
  }
  const done = steps.filter((st) => st.done === true).length;
  const next = steps.findIndex((st) => st.done !== true);
  const stateOf = (i) => (steps[i].done === true ? 'done' : i === next ? 'next' : 'todo');
  const stateWord = { done: 'Done', next: 'Next up', todo: 'Not started' };
  const detail = h('aside', { class: 'panel ch-detail', 'aria-live': 'polite' });
  let selected = null;

  const buttons = steps.map((step, i) => h('button', {
    class: `ch-step is-${stateOf(i)}`, type: 'button', 'aria-pressed': 'false',
    'aria-label': `Step ${i + 1}: ${text(step.label)}, ${stateWord[stateOf(i)]}`,
    onclick: () => select(selected === i ? null : i),
  },
  h('span', { class: 'ch-step-node', 'aria-hidden': 'true' }, stateOf(i) === 'done' ? '✓' : String(i + 1)),
  h('span', { class: 'ch-step-text' },
    h('span', { class: 'ch-step-state' }, stateWord[stateOf(i)]),
    h('span', { class: 'ch-step-label' }, softBreaks(text(step.label))))));
  const track = h('ol', { class: 'ch-track', style: `--steps:${steps.length}` }, buttons.map((b, i) => h('li', { class: `is-${stateOf(i)}` }, b)));
  chRoving(buttons, { onMove: (i) => select(i) });

  function select(index, { link = true } = {}) {
    selected = index;
    chMarkCurrent(buttons, index);
    renderDetail();
    if (link) setDeepLink(index === null ? 'rollout' : `rollout/${index}`);
    return index === null ? null : buttons[index];
  }

  function renderDetail() {
    if (selected === null) {
      fill(detail, chEmptyDetail(next >= 0 ? `Next: ${text(steps[next].label)}` : 'Every step is done', 'Pick a step on the track to see what it involves and how to run it.'));
      return;
    }
    const step = steps[selected];
    const state = stateOf(selected);
    fill(detail,
      h('div', { class: 'step-top' }, h('span', { class: 'step-count' }, `Step ${selected + 1} of ${steps.length}`),
        h('span', { class: `ch-state${state === 'done' ? ' is-settled' : ''}${state === 'next' ? ' is-next' : ''}` }, h('span', { class: 'ch-state-mark', 'aria-hidden': 'true' }), stateWord[state])),
      h('h3', null, softBreaks(text(step.label))),
      text(step.detail) && h('p', null, softBreaks(step.detail)),
      text(step.command) && chCommand(step.command),
      chStepper(selected, steps.length, (i) => { select(i); buttons[i].focus(); }, 'step'));
  }

  const progress = h('div', { class: 'ch-progress' },
    h('p', null, h('b', null, `${done} of ${steps.length}`), ' steps done'),
    h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `--share:${done / steps.length}` })));
  const panel = h('div', { class: 'panel ch-track-panel' }, progress, track);
  // Across only when every step gets CH_TRACK_STEP pixels.
  chOnWidth(panel, (width) => track.classList.toggle('is-across', width - 48 >= steps.length * CH_TRACK_STEP));
  select(null, { link: false });
  mount.append(h('div', { class: 'ch-stack' }, panel, detail));
  buttons.forEach((b, i) => riseIn(b, Math.min(i, 8) * 40));
  return {
    open([raw] = []) {
      const index = chIndexPart(raw, steps.length);
      return index === null ? null : select(index, { link: false });
    },
  };
}
