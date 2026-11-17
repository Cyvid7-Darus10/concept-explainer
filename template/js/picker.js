// Pickers in the design system, in place of native selects whose OS popups
// show raw values. Three shapes, one contract: { el, read(), focus() }.
// - optionGroup: a radiogroup of option cards or a segmented row (2 to 4 choices)
// - listboxPicker: a button and a popover listbox (WAI-ARIA listbox pattern)
// - comboPicker: a text field with suggestions and free entry (combobox)
// Each option is { value, label, desc? }; the value is what gets stored.
let pickerSerial = 0;

function pickerId(prefix) {
  pickerSerial += 1;
  return `${prefix}-${pickerSerial}`;
}

/**
 * Radio cards or a segmented row. Arrow keys move and choose; one tab stop.
 * @param {{ options: object[], value: string, labelledBy?: string, describedBy?: string, variant?: 'cards'|'segmented', onChange?: Function, render?: Function }} spec
 */
function optionGroup({ options, value, labelledBy, describedBy, variant = 'segmented', onChange, render }) {
  let current = options.some((o) => o.value === value) ? value : options[0].value;
  const buttons = options.map((option, index) => h('button', {
    type: 'button', role: 'radio', class: `pick-option${variant === 'cards' ? ' is-card' : ''}`, 'data-value': option.value,
    onclick: () => choose(option.value, true),
    onkeydown: (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      const jump = { Home: 0, End: options.length - 1 }[event.key];
      if (step === undefined && jump === undefined) return;
      event.preventDefault();
      const next = jump !== undefined ? jump : (index + step + options.length) % options.length;
      choose(options[next].value, true);
      buttons[next].focus();
    },
  },
  render ? render(option) : [
    h('span', { class: 'pick-option-label' }, option.label),
    option.desc && variant === 'cards' && h('span', { class: 'pick-option-desc' }, option.desc),
  ]));
  const el = h('div', {
    class: `pick-group is-${variant}`, role: 'radiogroup', 'aria-labelledby': labelledBy, 'aria-describedby': describedBy,
  }, buttons);

  function paint() {
    buttons.forEach((button, i) => {
      const on = options[i].value === current;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    });
  }

  function choose(next, fromUser) {
    if (next === current && fromUser) return;
    current = next;
    paint();
    if (onChange) onChange(current);
  }

  paint();
  return {
    el,
    read: () => current,
    focus: () => { const on = buttons.find((b) => b.getAttribute('aria-checked') === 'true'); if (on) on.focus(); },
    set: (next) => { if (options.some((o) => o.value === next)) { current = next; paint(); } },
  };
}

// Close the open picker on outside pointer or Escape, one at a time.
const PICKER = { open: null };
document.addEventListener('pointerdown', (event) => {
  if (PICKER.open && !PICKER.open.root.contains(event.target)) PICKER.open.close(false);
});

function placePanel(button, panel) {
  panel.classList.remove('is-up', 'is-end');
  const box = button.getBoundingClientRect();
  const height = panel.offsetHeight;
  if (box.bottom + 8 + height > window.innerHeight - 8 && box.top - 8 - height > 8) panel.classList.add('is-up');
  if (box.left + panel.offsetWidth > window.innerWidth - 8) panel.classList.add('is-end');
}

function optionRow(option, id, selected) {
  return h('div', { class: 'picker-option', role: 'option', id, 'aria-selected': String(selected), 'data-value': option.value },
    h('span', { class: 'picker-check', 'aria-hidden': 'true' }),
    h('span', { class: 'picker-text' },
      h('span', { class: 'picker-label' }, option.label),
      option.desc && h('span', { class: 'picker-desc' }, option.desc)));
}

/**
 * A button that opens a listbox popover. Up/Down, Home/End, typeahead,
 * Enter/Space choose, Escape closes and returns focus to the button.
 * @param {{ options: object[], value: string, labelledBy: string, describedBy?: string, onChange?: Function }} spec
 */
function listboxPicker({ options, value, labelledBy, describedBy, onChange, ariaLabel, buttonContent }) {
  const buttonId = pickerId('picker-button');
  const listId = pickerId('picker-list');
  let current = options.some((o) => o.value === value) ? value : options[0].value;
  let active = 0;
  let typed = '';
  let typedAt = 0;
  const labelOf = (v) => (options.find((o) => o.value === v) || options[0]).label;
  // Compact pickers (an icon button) name themselves with aria-label.
  const valueText = h('span', { class: 'picker-value' }, buttonContent ? buttonContent(current) : labelOf(current));
  const naming = ariaLabel ? { 'aria-label': `${ariaLabel}: ${labelOf(current)}` } : { 'aria-labelledby': `${labelledBy} ${buttonId}` };
  const button = h('button', {
    class: `picker-button${buttonContent ? ' is-compact' : ''}`, type: 'button', id: buttonId, 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
    'aria-controls': listId, 'aria-describedby': describedBy, ...naming,
  }, valueText, !buttonContent && h('span', { class: 'picker-chevron', 'aria-hidden': 'true' }));
  const rows = options.map((option, i) => optionRow(option, `${listId}-${i}`, option.value === current));
  const panel = h('div', {
    class: 'picker-panel', role: 'listbox', id: listId, tabindex: '-1', hidden: true,
    ...(ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-labelledby': labelledBy }),
  }, rows);
  const root = h('div', { class: 'picker' }, button, panel);
  const api = { root, close };

  function paintActive() {
    rows.forEach((row, i) => row.classList.toggle('is-active', i === active));
    panel.setAttribute('aria-activedescendant', rows[active].id);
  }

  function open() {
    if (PICKER.open && PICKER.open !== api) PICKER.open.close(false);
    active = Math.max(0, options.findIndex((o) => o.value === current));
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    placePanel(button, panel);
    paintActive();
    panel.focus({ preventScroll: true });
    PICKER.open = api;
  }

  function close(returnFocus = true) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (PICKER.open === api) PICKER.open = null;
    if (returnFocus) button.focus();
  }

  function show(next) {
    current = next;
    fill(valueText, buttonContent ? buttonContent(current) : labelOf(current));
    if (ariaLabel) button.setAttribute('aria-label', `${ariaLabel}: ${labelOf(current)}`);
    rows.forEach((row, j) => row.setAttribute('aria-selected', String(options[j].value === current)));
  }

  function choose(i) {
    show(options[i].value);
    close(true);
    if (onChange) onChange(current);
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  button.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      open();
    }
  });
  panel.addEventListener('keydown', (event) => {
    const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: options.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      active = Math.min(Math.max(moves[event.key], 0), options.length - 1);
      paintActive();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const now = Date.now();
      typed = now - typedAt > 600 ? event.key.toLowerCase() : typed + event.key.toLowerCase();
      typedAt = now;
      const found = options.findIndex((o) => o.label.toLowerCase().startsWith(typed));
      if (found >= 0) { active = found; paintActive(); }
    }
  });
  rows.forEach((row, i) => {
    row.addEventListener('click', () => choose(i));
    row.addEventListener('pointermove', () => { if (active !== i) { active = i; paintActive(); } });
  });

  return {
    el: root,
    read: () => current,
    focus: () => button.focus(),
    set: (next) => { if (options.some((o) => o.value === next) && next !== current) show(next); },
  };
}

/**
 * A text field with suggestions (combobox). Free entry is allowed; the
 * caller validates it. Down opens and moves, Enter takes the active one.
 * @param {{ options: object[], value: string, id: string, describedBy?: string }} spec
 */
function comboPicker({ options, value, id, describedBy }) {
  const listId = pickerId('combo-list');
  let active = -1;
  let shown = [];
  const input = h('input', {
    class: 'field picker-input', type: 'text', id, value: String(value ?? ''), role: 'combobox', autocomplete: 'off', spellcheck: 'false',
    'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-describedby': describedBy,
  });
  const panel = h('div', { class: 'picker-panel', role: 'listbox', id: listId, hidden: true });
  const root = h('div', { class: 'picker' }, input, panel);
  const api = { root, close: () => close() };

  function render() {
    const q = input.value.trim().toLowerCase();
    shown = options.filter((o) => !q || o.value.toLowerCase().startsWith(q) || o.label.toLowerCase().includes(q)).slice(0, 8);
    fill(panel, ...shown.map((option, i) => optionRow(option, `${listId}-${i}`, option.value === input.value.trim())));
    [...panel.children].forEach((row, i) => row.addEventListener('pointerdown', (event) => { event.preventDefault(); take(i); }));
    if (!shown.length) { close(); return; }
    active = Math.min(active, shown.length - 1);
    paintActive();
  }

  function paintActive() {
    [...panel.children].forEach((row, i) => row.classList.toggle('is-active', i === active));
    if (active >= 0 && panel.children[active]) input.setAttribute('aria-activedescendant', panel.children[active].id);
    else input.removeAttribute('aria-activedescendant');
  }

  function open() {
    if (PICKER.open && PICKER.open !== api) PICKER.open.close(false);
    render();
    if (!shown.length) return;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    placePanel(input, panel);
    PICKER.open = api;
  }

  function close() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
    if (PICKER.open === api) PICKER.open = null;
  }

  function take(i) {
    input.value = shown[i].value;
    close();
    input.focus();
  }

  input.addEventListener('input', () => { active = -1; open(); });
  input.addEventListener('focus', () => open());
  input.addEventListener('blur', () => window.setTimeout(close, 120));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (panel.hidden) open();
      active = Math.min(Math.max(active + (event.key === 'ArrowDown' ? 1 : -1), 0), shown.length - 1);
      paintActive();
    } else if (event.key === 'Enter' && !panel.hidden && active >= 0) {
      event.preventDefault();
      take(active);
    } else if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });

  return { el: root, read: () => input.value.trim(), focus: () => input.focus() };
}
