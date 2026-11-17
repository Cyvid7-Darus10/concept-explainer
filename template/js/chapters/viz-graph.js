// Visual kinds with links between parts: state (a state machine) and
// hierarchy (a tree). See viz-core.js for the drawer contract.

const VIZ_STATE = { boxH: 46, rowSlot: 128, level: 22, label: 11.5, vGap: 34 };

// States in reading order: from the first state along its transitions,
// then any the walk did not reach, in data order.
function vizStateOrder(states, transitions) {
  const ids = states.map((st) => st.id);
  if (!ids.length) return [];
  const seen = new Set([ids[0]]);
  const queue = [ids[0]];
  while (queue.length) {
    const id = queue.shift();
    transitions.filter((t) => t.from === id && ids.includes(t.to) && !seen.has(t.to)).forEach((t) => {
      seen.add(t.to);
      queue.push(t.to);
    });
  }
  return [...ids.filter((id) => seen.has(id)), ...ids.filter((id) => !seen.has(id))];
}

// Levels for arcs over [from, to] positions: the shortest arcs sit lowest,
// and two arcs whose spans overlap never share a level.
function vizArcLevels(spans) {
  const order = spans.map((sp, i) => ({ i, lo: Math.min(sp[0], sp[1]), hi: Math.max(sp[0], sp[1]) }))
    .sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo) || a.lo - b.lo);
  const levels = new Array(spans.length).fill(1);
  const taken = [];
  order.forEach((arc) => {
    let level = Math.max(1, arc.hi - arc.lo);
    const clash = (l) => taken.some((o) => o.level === l && arc.lo <= o.hi && o.lo <= arc.hi && !(arc.lo === o.hi || o.lo === arc.hi));
    while (clash(level)) level += 1;
    taken.push({ ...arc, level });
    levels[arc.i] = level;
  });
  return levels;
}

function vizLinkLabel(value, x, y, chars, anchor = 'middle') {
  if (!value) return null;
  return s('text', { class: 'viz-edge-label', x, y, 'text-anchor': anchor, 'dominant-baseline': 'central' }, vizWrap(value, chars, 1)[0]);
}

function vizRelationList(items) {
  if (!items.length) return null;
  return h('ul', { class: 'viz-rel' }, items.map((item) => h('li', null, softBreaks(item))));
}

/** state: boxes in a row (wide) or a column (narrow); transitions as arcs. */
function vizDrawState(visual, width, marker) {
  const states = list(visual.states).filter((st) => st && st.id !== undefined);
  const transitions = list(visual.transitions).filter((t) => t && states.some((st) => st.id === t.from) && states.some((st) => st.id === t.to));
  const order = vizStateOrder(states, transitions);
  const pos = new Map(order.map((id, i) => [id, i]));
  const row = width / Math.max(order.length, 1) >= VIZ_STATE.rowSlot;
  const label = (id) => text((states.find((st) => st.id === id) || {}).label, String(id));
  const boxes = new Map();
  const links = [];
  let height;
  let keyList = null;

  const span = (tr) => Math.abs(pos.get(tr.to) - pos.get(tr.from));
  const ahead = (tr) => pos.get(tr.to) > pos.get(tr.from);
  if (row) {
    const slot = width / order.length;
    const boxW = Math.min(slot - 28, 170);
    // Forward arcs go above the boxes, backward ones below; each side stacks its own levels.
    const above = transitions.filter((tr) => tr.from !== tr.to && ahead(tr));
    const below = transitions.filter((tr) => tr.from !== tr.to && !ahead(tr));
    const levelsAbove = vizArcLevels(above.map((tr) => [pos.get(tr.from), pos.get(tr.to)]));
    const levelsBelow = vizArcLevels(below.map((tr) => [pos.get(tr.from), pos.get(tr.to)]));
    const selfs = transitions.some((tr) => tr.from === tr.to);
    const up = Math.max(selfs ? 1 : 0, ...levelsAbove, 0);
    const down = Math.max(...levelsBelow, 0);
    const top = up ? 30 + up * VIZ_STATE.level : 6;
    order.forEach((id, i) => boxes.set(id, { x: i * slot + (slot - boxW) / 2, y: top, w: boxW, h: VIZ_STATE.boxH }));
    const chars = vizChars(Math.max(slot * 0.9, 70), VIZ_STATE.label);
    transitions.forEach((tr) => {
      const a = boxes.get(tr.from);
      const b = boxes.get(tr.to);
      let d;
      let lx;
      let ly;
      if (tr.from === tr.to) {
        const x = a.x + a.w - 18;
        d = `M${x - 10},${a.y} C${x - 14},${a.y - 30} ${x + 22},${a.y - 30} ${x + 10},${a.y - 2}`;
        lx = x + 6;
        ly = a.y - 34;
      } else {
        const forward = ahead(tr);
        const level = forward ? levelsAbove[above.indexOf(tr)] : levelsBelow[below.indexOf(tr)];
        const lift = (12 + level * VIZ_STATE.level) * 1.33;
        const x1 = a.x + a.w / 2 + (forward ? a.w * 0.18 : -a.w * 0.18);
        const x2 = b.x + b.w / 2 + (forward ? -b.w * 0.18 : b.w * 0.18);
        const y = forward ? a.y : a.y + a.h;
        const cy = forward ? y - lift : y + lift;
        d = `M${x1},${y} C${x1},${cy} ${x2},${cy} ${x2},${y + (forward ? -3 : 3)}`;
        lx = (x1 + x2) / 2;
        // The label sits just outside the arc's apex, so the line never crosses it.
        ly = forward ? y - lift * 0.75 - 9 : y + lift * 0.75 + 9;
      }
      links.push({ t: tr, path: s('path', { class: 'viz-link', d, 'marker-end': `url(#${marker}-rest)`, 'data-marker': marker }), label: vizLinkLabel(tr.label, lx, ly, chars) });
    });
    height = top + VIZ_STATE.boxH + (down ? 24 + down * VIZ_STATE.level : 6);
  } else {
    const boxW = Math.min(200, Math.max(120, Math.round(width * 0.42)));
    order.forEach((id, i) => boxes.set(id, { x: 1, y: 1 + i * (VIZ_STATE.boxH + VIZ_STATE.vGap), w: boxW, h: VIZ_STATE.boxH }));
    const right = boxW + 1;
    // Every transition that is not a next-door step down bends out to the right, on its own level.
    const bends = transitions.filter((tr) => !(ahead(tr) && span(tr) === 1));
    const levels = vizArcLevels(bends.map((tr) => [pos.get(tr.from), pos.get(tr.to)]));
    const maxLevel = Math.max(1, ...levels);
    const step = Math.min(VIZ_STATE.level, Math.max(10, (width - right - 24) / maxLevel));
    // Labels would cross the arcs here, so each arc gets a numbered badge and
    // the key under the drawing spells it out.
    transitions.forEach((tr, k) => {
      const a = boxes.get(tr.from);
      const b = boxes.get(tr.to);
      let d;
      let bx;
      let by;
      if (ahead(tr) && span(tr) === 1) {
        d = `M${a.x + a.w / 2},${a.y + a.h} L${b.x + b.w / 2},${b.y - 3}`;
        bx = a.x + a.w / 2;
        by = (a.y + a.h + b.y) / 2;
      } else {
        const bulge = right + 8 + levels[bends.indexOf(tr)] * step;
        const y1 = tr.from === tr.to ? a.y + 12 : a.y + a.h / 2 + (ahead(tr) ? 8 : -8);
        const y2 = tr.from === tr.to ? a.y + a.h - 12 : b.y + b.h / 2 + (ahead(tr) ? -8 : 8);
        const reach = right + (bulge - right) * 1.33;
        d = `M${right},${y1} C${reach},${y1} ${reach},${y2} ${right + 3},${y2}`;
        bx = bulge;
        by = (y1 + y2) / 2;
      }
      const badge = s('g', { class: 'viz-badge' }, s('circle', { cx: bx, cy: by, r: 8 }),
        s('text', { x: bx, y: by, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, String(k + 1)));
      links.push({ t: tr, path: s('path', { class: 'viz-link', d, 'marker-end': `url(#${marker}-rest)`, 'data-marker': marker }), label: badge });
    });
    keyList = h('ol', { class: 'viz-key-list', 'aria-label': 'Transitions' }, transitions.map((tr, k) => h('li', null,
      h('span', { class: 'viz-key-n', 'aria-hidden': 'true' }, String(k + 1)),
      h('span', null, tr.label ? `${tr.label}: ` : '', softBreaks(`${label(tr.from)} \u2192 ${label(tr.to)}`)))));
    height = order.length * (VIZ_STATE.boxH + VIZ_STATE.vGap) - VIZ_STATE.vGap + 2;
  }

  const parts = states.map((st, i) => {
    const box = boxes.get(st.id);
    const out = transitions.filter((t) => t.from === st.id);
    const into = transitions.filter((t) => t.to === st.id && t.from !== st.id);
    const describe = (t, other) => `${t.label ? `${t.label}: ` : ''}${label(other)}`;
    return vizPart([
      vizRoundRect(box.x, box.y, box.w, box.h),
      vizText(vizWrap(text(st.label, String(st.id)), vizChars(box.w - 18), 2), { x: box.x + box.w / 2, y: box.y + box.h / 2, anchor: 'middle' }),
    ], {
      label: text(st.label, String(st.id)),
      kicker: `State ${i + 1} of ${states.length}${out.length ? '' : ', an end state'}`,
      detail: out.length ? '' : 'Nothing leaves this state.',
      facts: [
        ['Can go to', vizRelationList(out.map((t) => describe(t, t.to)))],
        ['Reached from', vizRelationList(into.map((t) => describe(t, t.from)))],
      ],
      id: st.id,
    });
  });
  return {
    nodes: [links.map((l) => l.path), links.map((l) => l.label)],
    parts,
    height,
    legend: keyList,
    highlight(index) {
      const id = index === null ? null : parts[index].id;
      links.forEach((l) => {
        const on = id !== null && (l.t.from === id || l.t.to === id);
        vizLinkOn(l.path, on);
        if (l.label) l.label.classList.toggle('is-on', on);
      });
      parts.forEach((part, i) => part.el.classList.toggle('is-related', id !== null && i !== index
        && links.some((l) => (l.t.from === id && l.t.to === part.id) || (l.t.to === id && l.t.from === part.id))));
    },
  };
}

const VIZ_TREE = { boxH: 44, level: 40, slot: 112, row: 40, rowGap: 8, indent: 22 };

/** hierarchy: a top-down tree when its leaves fit, else an indented outline. */
function vizDrawHierarchy(visual, width, marker) {
  const nodes = list(visual.nodes).filter((n) => n && n.id !== undefined);
  const ids = new Set(nodes.map((n) => n.id));
  const parentOf = (n) => (n.parent !== undefined && ids.has(n.parent) && n.parent !== n.id ? n.parent : null);
  const children = (id) => nodes.filter((n) => parentOf(n) === id);
  const roots = nodes.filter((n) => parentOf(n) === null);
  const boxes = new Map();
  const depth = new Map();
  const seen = new Set();
  const walk = (n, d, visit) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    depth.set(n.id, d);
    visit(n, d);
    children(n.id).forEach((c) => walk(c, d + 1, visit));
  };
  const leaves = [];
  roots.forEach((r) => walk(r, 0, (n) => { if (!children(n.id).length) leaves.push(n.id); }));
  const maxDepth = Math.max(0, ...depth.values());
  const topDown = width / Math.max(leaves.length, 1) >= VIZ_TREE.slot;
  const links = [];
  let height;

  if (topDown) {
    const slot = width / leaves.length;
    const boxW = Math.min(slot - 10, 180);
    const centre = new Map();
    const place = (n) => {
      const kids = children(n.id).filter((c) => depth.get(c.id) === depth.get(n.id) + 1);
      if (!kids.length) centre.set(n.id, (leaves.indexOf(n.id) + 0.5) * slot);
      else {
        kids.forEach(place);
        centre.set(n.id, (centre.get(kids[0].id) + centre.get(kids[kids.length - 1].id)) / 2);
      }
    };
    roots.forEach(place);
    nodes.forEach((n) => {
      const cx = centre.get(n.id) ?? width / 2;
      boxes.set(n.id, { x: cx - boxW / 2, y: 1 + depth.get(n.id) * (VIZ_TREE.boxH + VIZ_TREE.level), w: boxW, h: VIZ_TREE.boxH });
    });
    nodes.forEach((n) => {
      const p = parentOf(n);
      if (p === null) return;
      const a = boxes.get(p);
      const b = boxes.get(n.id);
      const mid = a.y + a.h + VIZ_TREE.level / 2;
      links.push({ from: p, to: n.id, path: s('path', { class: 'viz-link', d: `M${a.x + a.w / 2},${a.y + a.h} V${mid} H${b.x + b.w / 2} V${b.y}` }) });
    });
    height = (maxDepth + 1) * (VIZ_TREE.boxH + VIZ_TREE.level) - VIZ_TREE.level + 2;
  } else {
    let y = 1;
    seen.clear();
    roots.forEach((r) => walk(r, 0, (n, d) => {
      const x = 1 + d * VIZ_TREE.indent;
      boxes.set(n.id, { x, y, w: width - x - 1, h: VIZ_TREE.row });
      y += VIZ_TREE.row + VIZ_TREE.rowGap;
    }));
    nodes.forEach((n) => {
      const p = parentOf(n);
      if (p === null || !boxes.has(n.id)) return;
      const a = boxes.get(p);
      const b = boxes.get(n.id);
      links.push({ from: p, to: n.id, path: s('path', { class: 'viz-link', d: `M${a.x + 11},${a.y + a.h} V${b.y + b.h / 2} H${b.x}` }) });
    });
    height = y - VIZ_TREE.rowGap + 1;
  }

  const labelOf = (id) => text((nodes.find((n) => n.id === id) || {}).label, String(id));
  const parts = nodes.filter((n) => boxes.has(n.id)).map((n) => {
    const box = boxes.get(n.id);
    const kids = children(n.id);
    const p = parentOf(n);
    const lines = vizWrap(text(n.label, String(n.id)), vizChars(box.w - 20), topDown ? 2 : 1);
    return vizPart([
      vizRoundRect(box.x, box.y, box.w, box.h),
      vizText(lines, { x: topDown ? box.x + box.w / 2 : box.x + 12, y: box.y + box.h / 2, anchor: topDown ? 'middle' : 'start' }),
    ], {
      label: text(n.label, String(n.id)),
      kicker: p === null ? 'The whole' : `Level ${depth.get(n.id) + 1}`,
      facts: [['Part of', p !== null ? labelOf(p) : null], ['Made of', vizRelationList(kids.map((k) => labelOf(k.id)))]],
      id: n.id,
    });
  });
  return {
    nodes: links.map((l) => l.path),
    parts,
    height,
    highlight(index) {
      const id = index === null ? null : parts[index].id;
      const line = new Set();
      for (let at = id; at !== null && at !== undefined;) {
        const node = nodes.find((n) => n.id === at);
        const up = node ? parentOf(node) : null;
        if (up === null) break;
        line.add(`${up}>${at}`);
        at = up;
      }
      links.forEach((l) => l.path.classList.toggle('is-on', line.has(`${l.from}>${l.to}`) || (id !== null && l.from === id)));
      parts.forEach((part) => part.el.classList.toggle('is-related', id !== null && part.id !== id
        && (links.some((l) => l.from === id && l.to === part.id) || [...line].some((key) => key.startsWith(`${part.id}>`)))));
    },
  };
}
