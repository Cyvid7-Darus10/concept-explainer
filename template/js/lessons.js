// Chapter: key concepts, one idea per card. (The quiz follows.)
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
      concept.analogy && h('div', { class: 'why' }, h('p', { class: 'eyebrow quiet' }, 'Think of it like'), h('p', null, softBreaks(concept.analogy))),
      chConceptExtras(concept),
      concept.file && h('div', { class: 'code-head' }, fileChip(concept.file), chWalkthroughLink(data, concept.file)),
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
      if (!(Number.isInteger(wanted) && wanted >= 0 && wanted < concepts.length)) return null;
      show(wanted, { animate: false, link: false });
      return card;
    },
  };
}

// Chapter: check yourself. One question at a time, Brilliant pacing: pick an
// answer, then Check. A wrong first try says "Not yet" and lets you retry; a
// second wrong try (or Show answer) reveals the answer and the reason.
// Answers are remembered per explainer in this browser only.
const QUIZ_TRIES = 2;
const PATHISH = /^[^\s]*[/\\][^\s]*$|^[\w.-]+\.(?:[a-z]{1,5})(?::\d+)?$|\(\)|=>|::/i;

function quizStoreKey(meta) {
  return `concept-explainer:quiz:${text(meta && meta.repo, meta && meta.title)}:${text(meta && meta.commit, '')}`;
}

function loadQuiz(key, count) {
  try {
    const saved = JSON.parse(readStore(key) || 'null');
    if (!saved || !Array.isArray(saved.answers)) return null;
    return { index: Math.min(Math.max(0, saved.index | 0), count), answers: saved.answers.slice(0, count) };
  } catch (error) {
    return null;
  }
}

// Where a question is taught: a node or flow named in the question, the
// right option or the explanation; a cited path that belongs to a node.
function quizLesson(question, data) {
  const hay = [question.question, question.explain, list(question.options)[question.answer]].map((v) => text(v)).join(' ').toLowerCase();
  if (!hay) return null;
  const node = list(data.nodes).find((n) => (n.label && hay.includes(String(n.label).toLowerCase()))
    || list(n.files).some((f) => hay.includes(String(f).replace(/:\d+.*$/, '').toLowerCase())));
  if (node) return { href: `#map/${linkPart(node.id)}`, label: node.label };
  const flow = list(data.flows).find((f) => f.title && hay.includes(String(f.title).toLowerCase()));
  if (flow) return { href: `#flows/${linkPart(flow.id)}`, label: flow.title };
  const concept = list(data.concepts).findIndex((c) => c.title && hay.includes(String(c.title).toLowerCase()));
  if (concept >= 0) return { href: `#concepts/${concept}`, label: data.concepts[concept].title };
  return null;
}

function optionLabel(option) {
  const value = String(option);
  if (PATHISH.test(value.trim())) {
    return truncatable(h('span', { class: 'option-text is-code' }), value, { mode: 'middle' });
  }
  return h('span', { class: 'option-text' }, softBreaks(value));
}

function renderQuiz(data, mount) {
  const questions = list(data.quiz);
  if (!questions.length) return null;
  const key = quizStoreKey(data.meta);
  const saved = loadQuiz(key, questions.length);
  let state = saved || { index: 0, answers: [] };
  const card = h('article', { class: 'panel quiz-card' });

  const answerOf = (i) => state.answers[i] || { tries: [], status: 'open', picked: null };
  const persist = () => writeStore(key, JSON.stringify({ index: state.index, answers: state.answers }));

  function setAnswer(i, next) {
    const answers = [...state.answers];
    answers[i] = { ...answerOf(i), ...next };
    state = { ...state, answers };
    persist();
  }

  function go(index, { focus = true, link = true } = {}) {
    state = { ...state, index: Math.min(Math.max(index, 0), questions.length) };
    persist();
    if (link) setDeepLink(state.index >= questions.length ? 'quiz/done' : `quiz/${state.index + 1}`);
    render({ focus });
  }

  function reset() {
    state = { index: 0, answers: [] };
    persist();
    go(0);
  }

  function render({ focus = false } = {}) {
    fill(card, ...(state.index >= questions.length ? endScreen() : questionScreen(state.index)));
    if (focus) {
      const head = card.querySelector('[data-focus]');
      if (head) head.focus({ preventScroll: true });
    }
  }

  function progress(current) {
    return h('div', { class: 'step-dots quiz-dots' }, questions.map((_, i) => {
      const status = answerOf(i).status;
      return h('button', {
        type: 'button', class: [i === current ? 'is-current' : '', status !== 'open' ? 'is-done' : ''].join(' ').trim(),
        'aria-label': `Question ${i + 1}${status === 'right' ? ', right' : status === 'missed' ? ', missed' : ''}`,
        'aria-current': i === current ? 'step' : null, onclick: () => go(i),
      });
    }));
  }

  function questionScreen(i) {
    const question = questions[i];
    const options = list(question.options);
    const answer = answerOf(i);
    const resolved = answer.status === 'right' || answer.status === 'missed';
    const optionEls = options.map((option, j) => {
      const tried = answer.tries.includes(j);
      const isAnswer = resolved && j === question.answer;
      const el = h('button', {
        class: ['option', tried && !isAnswer ? 'is-tried' : '', isAnswer ? 'is-answer' : ''].join(' ').trim(),
        type: 'button', role: 'radio', 'aria-checked': String(answer.picked === j), tabindex: '-1', disabled: resolved,
        onclick: () => pick(j),
      },
      h('span', { class: 'key' }, String(j + 1)), optionLabel(option),
      isAnswer && h('span', { class: 'tag tag-answer' }, 'Correct answer'),
      tried && !isAnswer && h('span', { class: 'option-note' }, 'Your try'));
      return el;
    });
    const focusable = optionEls[answer.picked ?? 0] || optionEls[0];
    if (focusable && !resolved) focusable.tabIndex = 0;

    function pick(j) {
      setAnswer(i, { picked: j });
      render();
      const el = card.querySelectorAll('.option')[j];
      if (el) el.focus();
    }

    function check() {
      const current = answerOf(i);
      if (current.picked === null || current.picked === undefined) return;
      const right = current.picked === question.answer;
      const tries = [...current.tries, current.picked];
      const status = right ? (tries.length === 1 ? 'right' : 'right-late') : tries.length >= QUIZ_TRIES ? 'missed' : 'retry';
      setAnswer(i, { tries, status: status === 'right-late' ? 'missed' : status, firstTry: right && tries.length === 1, picked: right ? current.picked : null, late: status === 'right-late' });
      render({ focus: true });
      const chosen = card.querySelectorAll('.option')[tries[tries.length - 1]];
      if (chosen) { if (right) pop(chosen); else shake(chosen); }
    }

    const group = h('div', {
      class: 'options', role: 'radiogroup', 'aria-label': question.question,
      onkeydown: (event) => {
        if (resolved) return;
        const move = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
        const number = Number.parseInt(event.key, 10);
        if (move) {
          event.preventDefault();
          const from = answerOf(i).picked ?? -1;
          pick((from + move + options.length) % options.length);
        } else if (number >= 1 && number <= options.length) {
          event.preventDefault();
          pick(number - 1);
        } else if (event.key === 'Enter' && answerOf(i).picked !== null && answerOf(i).picked !== undefined) {
          event.preventDefault();
          check();
        }
      },
    }, optionEls);

    const feedback = feedbackPanel(question, answer);
    const checkButton = !resolved && h('button', {
      class: 'btn primary', type: 'button', disabled: answer.picked === null || answer.picked === undefined, onclick: check,
    }, answer.status === 'retry' ? 'Check again' : 'Check');
    const showAnswer = answer.status === 'retry' && h('button', {
      class: 'link quiz-reveal', type: 'button',
      onclick: () => { setAnswer(i, { status: 'missed', picked: null }); render({ focus: true }); },
    }, 'Show answer');
    const last = i === questions.length - 1;
    return [
      h('div', { class: 'quiz-top' },
        h('span', { class: 'step-count' }, `Question ${i + 1} of ${questions.length}`),
        h('button', { class: 'link quiz-reset', type: 'button', onclick: reset }, 'Reset')),
      progress(i),
      h('h3', { class: 'quiz-q', tabindex: '-1', 'data-focus': answer.status === 'open' ? '' : null }, softBreaks(question.question)),
      group,
      feedback,
      h('div', { class: 'step-controls quiz-controls' },
        h('button', { class: 'btn', type: 'button', disabled: i === 0, onclick: () => go(i - 1) }, 'Back'),
        showAnswer,
        resolved
          ? h('button', { class: 'btn primary', type: 'button', onclick: () => go(i + 1) }, last ? 'See your score' : 'Continue')
          : checkButton),
      h('p', { class: 'kbd-hint' }, 'Tip: press ', h('kbd', null, '1'), ' to ', h('kbd', null, String(options.length)), ' to pick, ', h('kbd', null, 'Enter'), ' to check.'),
    ];
  }

  function feedbackPanel(question, answer) {
    const live = h('div', { class: 'quiz-live', 'aria-live': 'polite' });
    if (answer.status === 'open') return live;
    const correctText = list(question.options)[question.answer];
    const explain = text(question.explain, `The answer is “${correctText}”.`);
    const states = {
      retry: { cls: 'is-retry', head: 'Not yet. Try again.', body: 'Pick another answer, or show the answer.' },
      right: { cls: 'is-right', head: 'Right', body: explain },
      missed: { cls: 'is-missed', head: answer.late ? 'Right on the second try' : 'Why', body: explain },
    };
    const view = states[answer.status] || states.missed;
    live.append(h('div', { class: `feedback ${view.cls}` },
      h('p', { class: 'feedback-head', tabindex: '-1', 'data-focus': '' }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), view.head),
      h('p', null, softBreaks(view.body))));
    return live;
  }

  function endScreen() {
    const firstTry = questions.filter((_, i) => answerOf(i).status === 'right').length;
    const missed = questions.map((q, i) => ({ q, i, a: answerOf(i) })).filter(({ a }) => a.status !== 'right');
    return [
      h('div', { class: 'quiz-top' }, h('span', { class: 'step-count' }, 'Your score'),
        h('button', { class: 'link quiz-reset', type: 'button', onclick: reset }, 'Reset')),
      progress(-1),
      h('h3', { class: 'quiz-score', tabindex: '-1', 'data-focus': '' }, `${firstTry} of ${questions.length} on the first try`),
      h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `--share:${firstTry / questions.length}` })),
      missed.length
        ? h('div', { class: 'quiz-missed' },
          h('p', { class: 'eyebrow quiet' }, 'To revisit'),
          h('ul', { class: 'rows' }, missed.map(({ q, i }) => {
            const lesson = quizLesson(q, data);
            return h('li', { class: 'quiz-missed-row' },
              h('button', { class: 'link', type: 'button', onclick: () => go(i) }, softBreaks(`${i + 1}. ${q.question}`)),
              lesson && h('a', { class: 'quiz-lesson', href: lesson.href }, softBreaks(`Read: ${lesson.label}`)));
          })))
        : h('p', { class: 'quiz-perfect' }, 'Every answer right on the first try. This chapter is done.'),
      h('div', { class: 'step-controls quiz-controls' },
        h('button', { class: 'btn', type: 'button', onclick: () => go(questions.length - 1) }, 'Back'),
        h('button', { class: 'btn primary', type: 'button', onclick: reset }, 'Try again')),
    ];
  }

  mount.append(h('div', { class: 'lesson quiz' }, card));
  render();
  return {
    open([n] = []) {
      if (n === 'done') { go(questions.length, { focus: false, link: false }); return card; }
      const wanted = Number.parseInt(n, 10);
      if (!(Number.isInteger(wanted) && wanted >= 1 && wanted <= questions.length)) return null;
      go(wanted - 1, { focus: false, link: false });
      return card;
    },
  };
}
