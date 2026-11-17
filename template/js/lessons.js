// Chapters: key concepts (one idea per card) and the check-yourself quiz.
function renderConcepts(data, mount) {
  const concepts = list(data.concepts);
  if (!concepts.length) return null;
  let index = 0;
  const card = h('article', { class: 'panel concept-card', 'aria-live': 'polite' });
  const controls = h('div', { class: 'step-controls' });

  function show(next, { animate = true, link = true } = {}) {
    const target = Math.min(Math.max(next, 0), concepts.length - 1);
    const direction = target >= index ? 1 : -1;
    index = target;
    render();
    if (link) setDeepLink(`concepts/${index}`);
    if (animate) slideIn(card, direction);
  }

  function render() {
    const concept = concepts[index];
    fill(card,
      h('span', { class: 'step-count' }, `Idea ${index + 1} of ${concepts.length}`),
      h('h3', null, softBreaks(concept.title)),
      h('p', { class: 'concept-body' }, softBreaks(concept.body)),
      concept.analogy && h('div', { class: 'why' }, h('p', { class: 'eyebrow quiet' }, 'Think of it like'), h('p', null, concept.analogy)),
      concept.file && h('div', { class: 'code-head' }, fileChip(concept.file)),
      concept.code && codeBlock(concept.code, concept.lang),
      controls,
    );
    fill(controls,
      stepDots(concepts.length, index, (i) => show(i)),
      h('button', { class: 'btn', type: 'button', disabled: index === 0, onclick: () => show(index - 1) }, 'Back'),
      h('button', { class: 'btn primary', type: 'button', disabled: index === concepts.length - 1, onclick: () => show(index + 1) }, 'Continue'),
    );
  }

  render();
  mount.append(h('div', { class: 'lesson' }, card));
  return {
    open([raw] = []) {
      const wanted = Number.parseInt(raw, 10);
      if (Number.isInteger(wanted) && wanted >= 0 && wanted < concepts.length) show(wanted, { animate: false, link: false });
      return null;
    },
  };
}

function renderQuiz(data, mount) {
  const questions = list(data.quiz);
  if (!questions.length) return null;
  let results = {};
  const bar = h('span');
  const label = h('b');
  const note = h('span', { class: 'score-note' });
  const score = h('div', { class: 'panel score', 'aria-live': 'polite' },
    h('p', { class: 'eyebrow quiet' }, 'Score'), label, h('div', { class: 'meter', 'aria-hidden': 'true' }, bar), note);

  function paint() {
    const right = Object.values(results).filter(Boolean).length;
    const answered = Object.keys(results).length;
    label.textContent = `${right} of ${questions.length} correct`;
    bar.style.setProperty('--share', String(right / questions.length));
    note.textContent = answered < questions.length ? `${questions.length - answered} left` : right === questions.length ? 'Perfect score.' : 'Nice work.';
  }

  function record(index, correct) {
    results = { ...results, [index]: correct };
    paint();
  }

  paint();
  mount.append(h('div', { class: 'lesson quiz' }, questions.map((q, i) => questionCard(q, i, record)), score));
  return null;
}

function questionCard(question, index, record) {
  const options = list(question.options);
  let picked = null;
  const optionEls = options.map((option, i) => h('button', {
    class: 'option', type: 'button', role: 'radio', 'aria-checked': 'false',
    onclick: () => pick(i),
  }, h('span', { class: 'key' }, String(i + 1)), h('span', { class: 'option-text' }, option)));
  const check = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: grade }, 'Check');
  const feedback = h('div', { 'aria-live': 'polite' });

  function pick(i) {
    picked = i;
    optionEls.forEach((el, j) => el.setAttribute('aria-checked', String(j === i)));
    check.disabled = false;
  }

  function grade() {
    const correct = picked === question.answer;
    optionEls.forEach((el, j) => {
      el.disabled = true;
      el.classList.toggle('is-correct', j === question.answer);
      el.classList.toggle('is-wrong', j === picked && !correct);
    });
    check.remove();
    const pickedEl = optionEls[picked];
    if (correct) pop(pickedEl); else shake(pickedEl);
    fill(feedback, h('div', { class: `feedback ${correct ? 'is-correct' : 'is-wrong'}` },
      h('b', null, correct ? 'Correct' : 'Not quite'),
      h('p', null, text(question.explain, correct ? 'You got it.' : `The answer is “${options[question.answer]}”.`))));
    riseIn(feedback.firstElementChild);
    record(index, correct);
  }

  return h('article', { class: 'panel question' },
    h('span', { class: 'step-count' }, `Question ${index + 1}`),
    h('h3', null, question.question),
    h('div', { class: 'options', role: 'radiogroup', 'aria-label': question.question }, optionEls),
    feedback,
    h('div', { class: 'question-actions' }, check));
}
