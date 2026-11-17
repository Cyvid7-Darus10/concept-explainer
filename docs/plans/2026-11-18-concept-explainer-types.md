# Concept Explainer: rename + explainer types (2026-11-18)

Owner request: rename Repo Explainer to **Concept Explainer**, because it should explain more than a
repo: a PR/MR, a single change, a proposal, a tech change, and so on. The skill first identifies what it
is explaining, then fills the **same object format**, so the library can categorise and filter by type.

## 0. The point: show it, don't tell it

Owner: "the main purpose is the visualization, and concept breakdown using diagrams, graphics and so on".
So every chapter is a picture first and text second. Rules:
- **Every new chapter object renders as a diagram, not a list.** `options` = side-by-side comparison
  matrix with the chosen column marked; `risks` = impact grid (low/medium/high rows) with mitigation on
  select; `rollout` = a stepped track with done/next markers; `timeline` = a horizontal time axis with
  typed event markers; `diff` = a file bar chart (+/− lines, status markers) linked to map nodes that
  glow with their `status`; `context` = a problem → goals → non-goals visual, not paragraphs.
- **Concept breakdown.** `concepts[]` may carry `parts[]` (`{ label, detail? }`, 2 to 6) and a
  `visual` (`{ kind, ... }` below), so one big idea is broken into drawn pieces you click through.
- **A generic `diagrams[]` chapter** (key `visuals`) for anything the fixed chapters do not cover, from a
  fixed kit (no free-form SVG, no images from data, data only):
  | kind | Data | Draws |
  |---|---|---|
  | `layers` | `items[{label, detail?}]` top to bottom | a stack (OSI, app layers) |
  | `cycle` | `items[]` | a loop (event loop, TDD, OAuth refresh) |
  | `state` | `states[{id,label}]`, `transitions[{from,to,label}]` | a state machine |
  | `compare` | `columns[]`, `rows[{label, values[]}]` | a comparison table drawn as a grid of marks |
  | `hierarchy` | `nodes[{id,label,parent?}]` | a tree / org of parts |
  | `beforeAfter` | `before{items[]}`, `after{items[]}`, `notes[]` | two panels with what moved |
  | `quadrant` | `axes{x,y}`, `points[{label,x,y}]` (0 to 1) | a 2x2 |
  | `funnel` | `items[{label, value?}]` | narrowing stages |
  | `venn` | `sets[{id,label}]` (2 or 3), `items[{label, in[]}]` | overlap of 2 to 3 groups |
  Each diagram has `title`, `caption` (one sentence), and is selectable part by part with a detail
  panel, keyboard reachable, with the same one-shot motion and reduced-motion rules. Deep link
  `#visuals/<diagramId>/<partIndex>`.
- Explainer types lean on these: `concept` is mostly `concepts` with `parts` + `visuals`; `proposal`
  and `migration` use `beforeAfter`/`compare`; `incident` uses `timeline` + `state`.
- The hub card for each explainer shows a small, generated thumbnail of its main diagram (the map, or
  the first visual) drawn by the same code, so the library reads visually too.

## 1. One schema, a `type` per explainer

`meta.type` (required from schema v2; v1 files without it are read as `repo`):

| type | Explains | Typical source | Default chapters (in order) |
|---|---|---|---|
| `repo` | A whole codebase | a repo path | map, flows, changes, tree, data, concepts, quiz, glossary, run |
| `pr` | One PR / MR | PR/MR url or branch diff | context, diff, map, flows, risks, rollout, quiz |
| `change` | One commit or a small range | SHA / range | context, diff, flows, risks, quiz |
| `proposal` | An RFC, design doc or idea not built yet | doc, issue, notes | context, options, map, flows, risks, rollout, quiz |
| `migration` | A tech change: upgrade, re-platform, swap a library | plan + code | context, options, map, flows, rollout, risks, quiz |
| `incident` | A post-mortem | incident notes, logs | context, timeline, flows, risks, rollout, quiz |
| `concept` | A technical idea not tied to one repo (OAuth, CRDTs) | docs, specs | concepts, map, flows, glossary, quiz |

Every type uses the same top-level objects. A type only changes which chapters are expected, the
default chapter order, the lead copy, and what the validator requires (`repo` needs `nodes` + `flows`;
`pr`/`change` need `context` + `diff`; `proposal`/`migration` need `context` + `options`;
`incident` needs `context` + `timeline`; `concept` needs `concepts`). `--repo` file checks apply only
when the type cites code.

### New optional `meta` fields
- `type` (above), `source`: `{ kind: "repo"|"pr"|"commit"|"doc"|"issue"|"url"|"notes", ref, url? }`
  (url through the http(s) allowlist), `status` for proposal/migration/pr:
  `draft|proposed|accepted|rejected|in-progress|merged|done`, `tags[]` (≤ 8, free text, used for filters).

### New chapter objects (all optional, used by the types above)
- `context`: `{ problem, goals[], nonGoals[], background? }` (plain text, short).
- `diff`: `[{ path, status: added|modified|removed|renamed, summary, nodes[]?, lines?: "+12 -3" }]`
  A file-by-file walkthrough; `key: true` on the 2-4 files a reviewer must read.
- `options`: `[{ title, summary, pros[], cons[], chosen?: true, why? }]` (exactly one `chosen` when the
  decision is made; none while `status` is draft/proposed).
- `risks`: `[{ risk, impact: low|medium|high, mitigation, owner? }]`.
- `rollout`: `[{ label, detail?, done?: boolean, command? }]` ordered steps / checklist.
- `timeline`: `[{ at, label, detail?, kind?: detect|act|fix|learn }]` for incidents.
- Node `status`: `added|changed|removed|unchanged` on `nodes[]` so `pr`, `change`, `proposal` and
  `migration` maps highlight what moves (a small marker + legend, never a big fill).
- Flows may set `variant: "before"|"after"` with a shared `pair` id to show before/after side by side.

`CHAPTER_KEYS` grows to include `context, diff, options, risks, rollout, timeline`. Deep links follow the
existing contract: `#context`, `#diff/<path>`, `#options/<index>`, `#risks/<index>`, `#rollout/<index>`,
`#timeline/<index>`. Search index gets matching types: `diff`, `option`, `risk`, `rollout`, `event`.

## 2. Presets become per type

`presets/` keeps the stack presets for `repo` and adds one preset per other type (`pr`, `change`,
`proposal`, `migration`, `incident`, `concept`) carrying `type`, `chapters`, `mustCover` questions and
starter objects. `init` takes `--type` (and `--preset` for repo stacks). `scan` is still repo-only; a
new `pr` helper (`concept-explainer diff <repo> --base <ref> [--head <ref>]`) drafts `diff[]` and node
statuses from `git diff --numstat` + node `files` mapping, never inventing summaries (TODO markers).

## 3. Skill: identify first

SKILL.md gains step 0 "Identify what you are explaining" with a decision table (input looks like X =>
type Y), asking the user only when it is genuinely ambiguous. Then the type picks the preset, the
chapters and the truth rules (PR: cite diff lines; proposal: never present proposed parts as built,
status must be honest; incident: times from the record only; concept: cite sources by url).

### Estimate before starting (owner request)

Right after identifying the type, the skill must run `concept-explainer estimate <input> --type <type>`
and show the user **how long it will take and what it will cost** before any investigation starts, then
wait for a go-ahead (one short question; skip the wait only if the user already said "just do it" or
gave a budget the estimate fits).
- Input size per type: `repo` = files/lines read (existing estimate logic), `pr`/`change` = diff size
  (`--base/--head` or a SHA range) plus touched files, `proposal`/`incident`/`concept` = source doc
  length (`--source <file|dir>`, words), `migration` = both.
- Output: a small table per model (current Claude models, prices kept in `scripts/lib/estimate.mjs`
  with a "prices as of" date) with tokens in/out, cost range (low to high), and wall-clock time range
  (agent minutes, from a tokens-per-minute assumption documented next to the prices), plus the
  recommended model. Ranges, never false precision; state the assumptions in one line.
- `--json` for agents. Tests cover every type.
- After the build, the hand-off reports the estimate next to what actually happened if known.

## 4. Rename

- Product name **Concept Explainer** everywhere in UI, docs, credits, titles (`<title>: X · Concept Explainer`).
- Skill name `concept-explainer`; CLI bin `concept-explainer` with `repo-explainer` kept as an alias bin
  that prints a one-line deprecation note to stderr.
- Library home `$CONCEPT_EXPLAINER_HOME` else `~/.concept-explainer`; `REPO_EXPLAINER_HOME` still read
  as a fallback. On first run, if `~/.repo-explainer` exists and the new home does not, move it
  (rename) and print what happened; never delete data.
- `install` links the skill as `concept-explainer`, writes `rules/concept-explainer.md`, and removes the
  old `repo-explainer` symlink/rule only if they are ours (symlink pointing into this repo / identical
  file).
- package name `concept-explainer`; repository URLs updated once the GitHub repo is renamed
  (owner approval needed for the GitHub rename; GitHub redirects the old URL).

## 5. Hub

- Type is a first-class filter: a type segmented filter / sidebar group ("Repos", "PRs", "Changes",
  "Proposals", "Migrations", "Incidents", "Concepts") with counts, plus tag and stack filters.
- Cards show a mono type tag and `status` when present. Search results show the type.
- Deep link `#type/<type>`.

## 6. Settings (owner request)

Theme controls move out of the sidebar footer into a **Settings** view (sidebar footer keeps one
"Settings" item with a gear icon; deep link `#settings`), in the hub and in every explainer page.
Two groups, clearly labelled:

**Reading (this browser only, localStorage in try/catch):** theme (light/dark/system), style
(clean/playful), motion (system/reduced), text size (default/large), density (comfortable/compact).

**Explainer defaults (the skill reads these, stored in `<home>/config.json`):**
| key | values | used by |
|---|---|---|
| `style` | clean, playful | build default |
| `defaultType` | auto, repo, pr, change, proposal, migration, incident, concept | skill step 0 (auto = identify) |
| `audience` | newcomer, engineer, expert | tone, depth, glossary size |
| `depth` | overview, standard, deep | flows/steps/parts counts |
| `language` | BCP 47 tag, default `en` | all prose |
| `visuals` | preferred visual kinds (multi) | skill picks these first |
| `chapters` | per type: on/off list | which chapters the skill fills |
| `quiz`, `analogies` | on/off | |
| `model` | recommended model id for estimates | estimate default |
| `budgetUsd` | number or null | skip the go-ahead wait when the estimate fits |
| `confirmBeforeStart` | true/false (default true) | estimate step |
| `instructions` | free text, at most 2,000 chars | appended guidance for the skill (house style, terms) |

- CLI: `concept-explainer config` (print), `config get <key>`, `config set <key> <value>`,
  `config reset`, `config --json` (the skill runs this first). Validated with clear errors; unknown
  keys rejected; `instructions` is plain text, never executed, shown back to the user before use.
- Saving from the page: a page opened from file:// cannot write files, so Settings shows the
  current values (embedded at build/rebuild time) and, on change, gives a ready `config set` command
  to copy plus "Download config.json". When opened through `concept-explainer library serve`
  (binds 127.0.0.1 only, random port, a random per-run token required on every write via header,
  Origin/Host checked, JSON body validated with the same schema, no other write endpoints, no
  directory listing outside the library), Settings saves directly and the hub regenerates.
- SKILL.md: step 0 runs `config --json` and applies it; `instructions` never override truth rules or
  the never-edit-template rules.
