# Contributing

Thanks for helping. This project has two audiences, people and agents, and one rule that keeps them happy: **explainers change data, maintainers change the template.**

## Setup

```sh
git clone https://github.com/Cyvid7-Darus10/repo-explainer
cd repo-explainer
npm run check        # tests + rebuild the example and gallery (never touches your library)
```

No dependencies to install. Node 18.3 or newer.

## Where things live

| Path | What |
|---|---|
| `SKILL.md` | Instructions agents follow. Keep it short and imperative. |
| `bin/repo-explainer.mjs` | The CLI. |
| `scripts/lib/` | Scan, validate, build, changes, estimate, the library (`library.mjs`, `library-model.mjs`, `search-index.mjs`), styles and `install`. Plain ES modules. |
| `template/` | The pages: `explainer.html`, the library hub `library.html`, `styles.css`, and `js/` modules (concatenated at build time). |
| `rules/` | The rule `repo-explainer install` copies into `~/.claude/rules/`. |
| `presets/`, `patterns/` | Repo-type presets and reusable flow shapes (JSON). |
| `references/` | Schema, playbook, design system, UX principles. |
| `test/` | `node:test` suites, including brand guardrails. |

## Pull requests

- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- One logical change per PR. In the description, explain **why**.
- Add or update tests for behaviour changes.
- **Visual changes:** include a before/after screenshot, and check that it still feels right at 375px wide with reduced motion on.
- **Design-system changes** (tokens, radii, colors, motion, either style) must update `references/design-system.md` and `test/brand.test.mjs` in the same PR.
- **Tests never touch your real folders.** Set `REPO_EXPLAINER_HOME` and `CLAUDE_CONFIG_DIR` to temp folders in any test that builds, publishes or installs.
- **Deep links are a contract** between explainer pages and the library search. Change `references/library.md`, `scripts/lib/search-index.mjs` and the router together.
- **New presets or patterns** must pass `test/scan.test.mjs`, which checks they are internally consistent.

## Writing style

Docs and UI copy follow the same rules as explainers: gist first, short sentences, plain words, no dashes as punctuation, no filler.
