# The explainer library

Every explainer you build also lands in one local folder, the **library**. Its `index.html` (the hub) lists every explainer, filters them by type, status and tags, and searches inside all of them, so you find an explainer without remembering which repo or session made it.

The code: `scripts/lib/library.mjs` (fs), `scripts/lib/library-model.mjs` (slugs, manifest), `scripts/lib/search-index.mjs` (search entries), `scripts/lib/config.mjs` (settings), `scripts/lib/serve.mjs` (`library serve`), `template/library.html` and `template/js/library.js` (the hub page). Keep this page in sync with them.

## Where it lives

`$CONCEPT_EXPLAINER_HOME`, else `$REPO_EXPLAINER_HOME` (the old name, still read), else `~/.concept-explainer`.

**Moving from Repo Explainer.** On the first run of any command, when no home is set by env, `~/.repo-explainer` exists and `~/.concept-explainer` does not, the folder is renamed to `~/.concept-explainer` and the CLI prints what it did. Nothing is copied or deleted. If both exist, nothing moves.

```
<home>/
  index.html                  the hub: manifest, search index and config embedded, works from file://
  kit.html                    the kit page (icons, visuals, components, patterns), linked from the hub
  library.json                the manifest
  config.json                 explainer defaults (see Config)
  explainers/<slug>/
    explainer.json            a copy of the source data
    index.html                the built explainer, with the library context set
```

The source of truth stays where it was made, usually `<repo>/.explainer/explainer.json`. The library holds copies. Rebuild from the source, never edit the copies.

## Commands

| Command | What it does |
|---|---|
| `build <file> [--repo dir]` | Validates, writes the HTML next to the data, then publishes to the library and prints the hub path. |
| `build <file> --no-library` | Builds without publishing, and without embedding config. For tests and throwaway previews. |
| `library` or `library list` | Lists the explainers with their type, newest first. |
| `library path` | Prints the hub path, `<home>/index.html`. |
| `library add <file> [--repo dir]` | Validates and publishes, without writing an HTML copy next to the data. |
| `library remove <slug>` | Deletes that explainer's folder and entry, then refreshes the hub. |
| `library rebuild` | Re-renders every page, the hub and the kit from the stored data with the current template and config. Drops entries whose data is missing or broken, and adopts folders that have data but no entry. |
| `library open` | Opens the hub in the default browser (writes an empty hub first if there is none). |
| `library style [clean\|playful]` | Prints the default style, or sets it. |
| `library serve [--port n]` | Serves the library on 127.0.0.1 so Settings can save (see Serve). |
| `config [get\|set\|reset] [--json]` | Prints or changes the explainer defaults (see Config). |
| `install [--force]` | Links this skill into `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/concept-explainer` and copies `rules/concept-explainer.md` into `${CLAUDE_CONFIG_DIR:-~/.claude}/rules/`. |

Every write in the library goes to a temp file in the same folder and is renamed into place, so a reader never sees half a file.

### `install`

- Safe to run again. A link that already points here and an identical rule are left alone.
- A link that points somewhere else is replaced.
- A real folder at the skill path, or a rule file you edited, is never replaced unless you pass `--force`. Even then it is moved aside to `<name>.backup-<time>`, not deleted.
- It checks both targets before it changes anything, so a refusal leaves nothing half done.
- It removes the old `skills/repo-explainer` link only when it points at this skill, and the old `rules/repo-explainer.md` only when its contents are byte for byte a rule this project shipped (checked by sha256). Anything else is reported and kept.

## Styles

Two styles: `clean` (the default) and `playful`. The template draws both; the data never changes.

- `--style clean|playful` works on `build`, `library add` and `library rebuild`. Any other value fails with `unknown style "<value>": use clean or playful`, before anything is written.
- Without the flag, the style is the `style` setting in `config.json`.
- The hub and the kit always use the config style. `library rebuild` restyles every page with the flag, else the config style.

## Config

`<home>/config.json` holds the explainer defaults. The skill reads them first (`config --json`), and the Settings view shows them. Nothing in it is secret.

| Key | Values | Default | Used by |
|---|---|---|---|
| `style` | `clean`, `playful` | `clean` | build default |
| `defaultType` | `auto` or a type | `auto` | skill step 0 (`auto` means identify it) |
| `audience` | `newcomer`, `engineer`, `expert` | `engineer` | tone, depth, glossary size |
| `depth` | `overview`, `standard`, `deep` | `standard` | how many flows, steps and parts |
| `language` | a language tag like `en` or `pt-BR` | `en` | all prose |
| `visuals` | list of visual kinds | `[]` | kinds the skill reaches for first |
| `chapters` | `{ <type>: { <chapter>: true\|false } }` | `{}` | chapters turned off per type (missing means on) |
| `quiz`, `analogies` | `true`, `false` | `true` | whether to write them |
| `model` | `auto` or a model id (`fable-5.2`, `opus-5.5`, `sonnet-5.5`, `haiku-5.5`) | `auto` | the model `estimate` recommends |
| `budgetUsd` | a number of 0 or more, or `null` | `null` | skip the go-ahead wait when the estimate fits |
| `confirmBeforeStart` | `true`, `false` | `true` | the estimate step |
| `instructions` | plain text, at most 2,000 characters | `""` | extra guidance for the skill (house style, terms) |

- `config set <key> <value>` checks the value and names the key on any error. Unknown keys are refused. `config set chapters.pr.risks off` sets one chapter. `config set visuals venn,cycle` sets a list. `config set budgetUsd none` clears the budget.
- Reading is tolerant: a broken file or a bad value falls back to the default, key by key. Saving is strict.
- `instructions` is plain text. It is never run, the skill shows it to the user before using it, and it never overrides the truth rules or the template rules.

## Slugs

A slug names an explainer's folder and appears in every link.

1. Take `meta.repo` (`owner/name` becomes `owner-name`). Without it, take the `--repo` folder name. Without that, take the data file's folder name (a `.explainer` folder stands for the folder above it).
2. Lowercase, keep `[a-z0-9]`, join the rest with single `-`, at most 64 characters. Accents are dropped. An empty result becomes `explainer`.
3. **Same source, same slug.** Publishing again updates the entry when the source matches: the same `meta.repo`, else the same repo folder, else the same data file.
4. **Different source, new slug.** If the slug is taken by a different source, add `-2`, `-3` and so on (still within 64 characters).

## Manifest (`library.json`)

```json
{
  "version": 1,
  "updatedAt": "2026-11-18T03:12:09.101Z",
  "explainers": [
    {
      "slug": "acme-taskflow",
      "type": "pr",
      "title": "PR 512: cursor paging for the task list, explained",
      "summary": "The task list used page numbers...",
      "repo": "acme/taskflow",
      "sourcePath": "/work/taskflow/.explainer/explainer.json",
      "repoPath": "/work/taskflow",
      "stack": ["Next.js 15", "TypeScript", "Postgres", "Prisma"],
      "preset": null,
      "status": "merged",
      "tags": ["pagination", "api", "performance"],
      "source": { "kind": "pr", "ref": "#512", "url": "https://github.com/acme/taskflow/pull/512" },
      "commit": "4be19c07d2",
      "generatedAt": "2026-11-18",
      "publishedAt": "2026-11-18T03:12:09.101Z",
      "counts": { "layers": 4, "nodes": 6, "flows": 2, "changes": 0, "concepts": 0, "files": 0, "quiz": 3, "diff": 6, "options": 0, "risks": 3, "rollout": 4, "timeline": 0, "diagrams": 0 },
      "layers": [{ "label": "Client", "color": "blue" }]
    }
  ]
}
```

- Entries are sorted newest `publishedAt` first.
- `type` is always set (`repo` for files without `meta.type`). `repo`, `sourcePath`, `repoPath`, `preset`, `status`, `source`, `commit` and `generatedAt` are `null` when unknown. `stack`, `tags` and `layers` are always arrays; `counts` always has all thirteen keys.
- `counts.files` is the number of `tree` entries; `counts.diff` the number of diff files.
- `source.url` is present only when it is http or https.

**Reading it.** The manifest is checked on every read: `version` must be 1, `explainers` an array, and each `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$`. A file that fails to parse or fails the check is moved to `library.json.corrupt-<time>`, and a new manifest is rebuilt from `explainers/*/explainer.json` (paths are unknown then, and `publishedAt` comes from the file time).

## Page contract (hub, kit and explainer pages)

This is what the template reads. Every value is embedded with the same escaping as explainer data, so no string can close a script tag.

### Hub data

The hub reads one JSON object from `<script type="application/json" id="explainer-data">` and boots with `bootLibrary()`:

```json
{
  "style": "clean",
  "config": { "style": "clean", "defaultType": "auto", "audience": "engineer", "...": "every config key" },
  "kitHref": "kit.html",
  "manifest": { "version": 1, "updatedAt": "...", "explainers": [] },
  "index": []
}
```

Its `#explainer-context` tag holds `{ "style", "config" }`.

### Explainer and kit context

`<script type="application/json" id="explainer-context">` holds:

| Page | Context |
|---|---|
| Library explainer page | `{ "libraryHref": "../../index.html", "slug", "style", "config" }` |
| Library kit page (`kit.html`) | `{ "libraryHref": "index.html", "style", "config" }` |
| Standalone build | `{ "style", "config" }` |
| `build --no-library` | `{ "style" }` (no config: the page uses defaults) |

When `libraryHref` is set, the page shows a Library link back to the hub.

### Search index

A flat array. One entry per searchable thing:

```json
{ "slug": "acme-taskflow", "type": "step", "title": "Seeks past the cursor", "text": "WHERE (createdAt, id) < (cursor) uses the new index...", "href": "explainers/acme-taskflow/index.html#flows/next-page-after/4" }
```

| `type` | One per | `title` | `text` | `href` hash |
|---|---|---|---|---|
| `explainer` | explainer | `meta.title` | summary, `context.problem`, stack | none (opens Overview) |
| `node` | node | `label` | `summary`, `tech` | `#map/<nodeId>` |
| `flow` | flow | `title` | `trigger`, `summary` | `#flows/<flowId>` |
| `step` | flow step | `label` | `detail`, `why` | `#flows/<flowId>/<n>`, n from 1 |
| `change` | change | `title` | `what`, `why` | `#changes/<changeId>` |
| `entity` | data model | `name` | `summary`, field names | `#data/<name>` |
| `concept` | concept | `title` | `body`, `analogy` | `#concepts/<index>`, from 0 |
| `glossary` | term | `term` | `definition` | `#glossary/<term>` |
| `file` | tree entry | `path` | `note` | `#tree/<path>` |
| `run` | runbook entry | `label` | `command`, `note` | `#run` |
| `diff` | diff file | `path` | `summary`, `status` | `#diff/<path>` |
| `option` | option | `title` | `summary`, `why` | `#options/<index>`, from 0 |
| `risk` | risk | `risk` | `mitigation`, impact | `#risks/<index>`, from 0 |
| `rollout` | rollout step | `label` | `detail`, `command` | `#rollout/<index>`, from 0 |
| `event` | timeline event | `label` | `at`, `detail` | `#timeline/<index>`, from 0 |
| `visual` | diagram | `title` | `caption` | `#visuals/<diagramId>` |
| `question` | quiz question | `question` | `explain` | `#quiz/<n>`, n from 1 |

- `change` entries also carry `date`, `kind` and `authorType` when the data has them, so the hub can merge every explainer's changes into one timeline, newest first.
- `href` is relative to the hub. Each id after the chapter key is **one segment, encoded with `encodeURIComponent`**: `src/a b/x.js` becomes `#tree/src%2Fa%20b%2Fx.js`. A router splits the hash on `/` and decodes each segment.
- `text` has whitespace collapsed and is clipped to 240 characters (ending in `…`).
- Items without the id their link needs are skipped. Exact duplicates (same type, href and title) are dropped.

### Rules for the hub page

- Render every string as text. Never `innerHTML`.
- Only follow an `href` that matches `^explainers/<slug>/index.html(#...)?$`. Anything else renders as text.
- Deep links into the hub: `#search/<query>` (URI encoded), `#changes`, `#type/<type>`, `#settings`.
- Empty state: say how to add one, `concept-explainer build <explainer.json>`.

## Serve

A page opened from `file://` cannot write files, so Settings there shows the current values and, on a change, a ready `concept-explainer config set` command to copy and a "Download config.json" button.

`concept-explainer library serve [--port n]` serves the library so Settings can save directly:

- Binds to **127.0.0.1 only**, on a random port unless `--port` is given. Prints `http://127.0.0.1:<port>/index.html#token=<token>` and runs until Ctrl+C.
- A fresh random **token** per run (48 hex characters) travels to the page in the URL fragment, so it never reaches a server log or a Referer header.
- **Host** must be `127.0.0.1:<port>` or `localhost:<port>` on every request (blocks DNS rebinding).
- **Files:** `GET` and `HEAD` only, for files under the library home. A folder serves its `index.html`; there is no directory listing. `..`, encoded traversal, NUL bytes and symlinks that leave the library are refused. Responses carry `nosniff`, `no-store`, `no-referrer` and `DENY` framing headers.
- **API:** `GET /api/config` returns `{ "config": {...} }`. `POST /api/config` is the only write.

### Page side of serve

How a page knows it is served, and how it saves:

1. **Detect.** `location.protocol` is `http:`, `location.hostname` is `127.0.0.1` or `localhost`, and the hash starts with `token=` on first load. Read the token, keep it in `sessionStorage` (inside try/catch) so other pages from the same origin have it, then replace the hash with the normal route (`history.replaceState`). Without a token, behave as on `file://`.
2. **Read.** `GET /api/config` for the live values (the embedded config can be older).
3. **Save.** Send the changed keys only:

```
POST /api/config
Content-Type: application/json
X-Concept-Explainer-Token: <token>

{ "audience": "expert", "chapters": { "pr": { "risks": false } } }
```

The browser adds `Origin`, which must be `http://127.0.0.1:<port>` or `http://localhost:<port>`. The body is at most 64 KB, a JSON object of config keys, checked with the same rules as `config set`. Changes merge into the saved config.

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ "config": {...} }` | Saved; every page, the hub and the kit were rebuilt. Reload to see them. |
| 400 | `{ "error": "save config: audience: \"kids\" is not one of ..." }` | Bad JSON or a bad value; nothing saved. Show the message. |
| 403 | `{ "error": "wrong or missing token" }` or `wrong origin` or `wrong host` | Refused; nothing saved. |
| 405, 413, 415 | `{ "error": "..." }` | Wrong method, body too large, not JSON. |
