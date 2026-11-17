# The explainer library

Every explainer you build also lands in one local folder, the **library**. Its `index.html` (the hub) lists every explainer and searches inside all of them, so you find an explainer without remembering which repo or session made it.

The code: `scripts/lib/library.mjs` (fs), `scripts/lib/library-model.mjs` (slugs, manifest), `scripts/lib/search-index.mjs` (search entries), `template/library.html` + `template/js/library.js` (the hub page). Keep this page in sync with them.

## Where it lives

`$REPO_EXPLAINER_HOME`, else `~/.repo-explainer`.

```
<home>/
  index.html                  the hub: manifest + search index embedded, works from file://
  library.json                the manifest
  explainers/<slug>/
    explainer.json            a copy of the source data
    index.html                the built explainer, with the library context set
```

The source of truth stays in the repo, at `<repo>/.explainer/explainer.json`. The library holds copies. Rebuild from the repo, never edit the copies.

## Commands

| Command | What it does |
|---|---|
| `build <file> [--repo dir]` | Validates, writes the HTML next to the data, then publishes to the library and prints the hub path. |
| `build <file> --no-library` | Builds without publishing. Use it for tests and throwaway previews. |
| `library` or `library list` | Lists the explainers, newest first. |
| `library path` | Prints the hub path, `<home>/index.html`. |
| `library add <file> [--repo dir]` | Validates and publishes, without writing an HTML copy next to the data. |
| `library remove <slug>` | Deletes that explainer's folder and entry, then refreshes the hub. |
| `library rebuild` | Re-renders every page and the hub from the stored data with the current template. Drops entries whose data is missing or broken, and adopts folders that have data but no entry. |
| `library open` | Opens the hub in the default browser (writes an empty hub first if there is none). |
| `install [--force]` | Links this skill into `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/repo-explainer` and copies `rules/repo-explainer.md` into `${CLAUDE_CONFIG_DIR:-~/.claude}/rules/`. |

Example:

```
$ repo-explainer build .explainer/explainer.json --repo .
✔ 0 error(s), 0 warning(s)
✔ wrote .explainer/explainer.html
✔ added acme-taskflow in the library
  page: /Users/you/.repo-explainer/explainers/acme-taskflow/index.html
  library: /Users/you/.repo-explainer/index.html
```

### `install`

- Safe to run again. A link that already points here and an identical rule are left alone.
- A link that points somewhere else is replaced.
- A real folder at the skill path, or a rule file you edited, is never replaced unless you pass `--force`. Even then it is moved aside to `<name>.backup-<time>`, not deleted.
- It checks both targets before it changes anything, so a refusal leaves nothing half done.

## Slugs

A slug names an explainer's folder and appears in every link.

1. Take `meta.repo` (`owner/name` becomes `owner-name`). Without it, take the `--repo` folder name. Without that, take the data file's folder name (a `.explainer` folder stands for the repo folder above it).
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
      "title": "Taskflow, explained",
      "summary": "A team to-do app. ...",
      "repo": "acme/taskflow",
      "sourcePath": "/work/taskflow/.explainer/explainer.json",
      "repoPath": "/work/taskflow",
      "stack": ["Next.js 15", "TypeScript", "Postgres"],
      "preset": "fullstack-web",
      "commit": "9f3c2ab41e",
      "generatedAt": "2026-10-25",
      "publishedAt": "2026-11-18T03:12:09.101Z",
      "counts": { "layers": 5, "nodes": 11, "flows": 2, "changes": 4, "concepts": 3, "files": 8, "quiz": 3 },
      "layers": [{ "label": "Client", "color": "blue" }]
    }
  ]
}
```

- Entries are sorted newest `publishedAt` first.
- `repo`, `sourcePath`, `repoPath`, `preset`, `commit` and `generatedAt` are `null` when unknown. `stack` and `layers` are always arrays; `counts` always has all seven keys.
- `counts.files` is the number of `tree` entries.
- `layers[].color` is one of the data contract's layer colours. The hub draws it as a small marker, never a fill.

**Reading it.** The manifest is checked on every read: `version` must be 1, `explainers` an array, and each `slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$`. A file that fails to parse or fails the check is moved to `library.json.corrupt-<time>`, and a new manifest is rebuilt from `explainers/*/explainer.json` (paths are unknown then, and `publishedAt` comes from the file time).

**Writing it.** Every file in the library is written to a temp file in the same folder and then renamed into place, so a reader never sees half a file.

## Hub data contract

The hub page reads one JSON object from `<script type="application/json" id="explainer-data">`:

```json
{ "manifest": { "version": 1, "updatedAt": "...", "explainers": [ ... ] }, "index": [ ... ] }
```

It is embedded with the same escaping as explainer data, so no string can close the script tag. The page boots with `bootLibrary()`, built from `dom.js`, `icons.js`, `library.js` and `styles.css`.

### Search index

A flat array. One entry per searchable thing:

```json
{ "slug": "acme-taskflow", "type": "step", "title": "POST /api/tasks", "text": "A normal fetch with the session cookie attached. ...", "href": "explainers/acme-taskflow/index.html#flows/create-task/2" }
```

| `type` | One per | `title` | `text` | `href` hash |
|---|---|---|---|---|
| `explainer` | explainer | `meta.title` | summary and stack | none (opens Overview) |
| `node` | node | `label` | `summary`, `tech` | `#map/<nodeId>` |
| `flow` | flow | `title` | `trigger`, `summary` | `#flows/<flowId>` |
| `step` | flow step | `label` | `detail`, `why` | `#flows/<flowId>/<n>`, n from 1 |
| `change` | change | `title` | `what`, `why` | `#changes/<changeId>` |
| `entity` | data model | `name` | `summary`, field names | `#data/<name>` |
| `concept` | concept | `title` | `body`, `analogy` | `#concepts/<index>`, index from 0 |
| `glossary` | term | `term` | `definition` | `#glossary/<term>` |
| `file` | tree entry | `path` | `note` | `#tree/<path>` |
| `run` | runbook entry | `label` | `command`, `note` | `#run` |

- `change` entries also carry `date`, `kind` and `authorType` when the data has them, so the hub can merge every explainer's changes into one timeline, newest first.
- `href` is relative to the hub. Each id after the chapter key is **one segment, encoded with `encodeURIComponent`**: a tree path `src/a b/x.js` becomes `#tree/src%2Fa%20b%2Fx.js`. A router can split the hash on `/` and decode each segment.
- `text` has whitespace collapsed and is clipped to 240 characters (ending in `…`), to keep the hub small.
- Items without the id their link needs (a node without `id`, a term without `term`) are skipped. Exact duplicates (same type, href and title) are dropped.

### Rules for the hub page

- Render every string as text. Never `innerHTML`.
- Only follow an `href` that matches `^explainers/<slug>/index.html(#...)?$`. Anything else renders as text.
- Deep links into the hub: `#search/<query>` (URI-encoded) and `#changes`.
- Empty state: say how to add one, `repo-explainer build <explainer.json>`.

## Explainer pages in the library

A library page is built with `{"libraryHref":"../../index.html","slug":"<slug>"}` in its `<script type="application/json" id="explainer-context">` tag. A standalone build gets `{}`. When `libraryHref` is set, the page shows a Library link back to the hub.
