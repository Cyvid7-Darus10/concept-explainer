# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org).

## Unreleased

Repo Explainer is now **Concept Explainer**: it explains a repo, a PR or MR, a change, a proposal, a migration, an incident or a concept, with visualization and concept breakdown as the main point.

TODO: the GitHub repository is still `Cyvid7-Darus10/repo-explainer`. Renaming it needs the owner's approval; after that, update `repository`, `bugs` and `homepage` in `package.json` and the links in README, CONTRIBUTING and SECURITY. GitHub redirects the old URL.

### Added

- **Explainer types** (`meta.type`, schema v2): `repo`, `pr`, `change`, `proposal`, `migration`, `incident`, `concept`. Each has default chapters, required objects, a preset in `presets/types/` and its own truth rules. See `references/types.md`.
- **New chapters:** `context`, `diff`, `options`, `risks`, `rollout`, `timeline`, and `visuals` (`diagrams[]`). Node `status`, before and after flow pairs, `concepts[].parts` and `concepts[].visual`.
- **Visuals kit:** nine data-only kinds, `layers`, `cycle`, `state`, `compare`, `hierarchy`, `beforeAfter`, `quadrant`, `funnel`, `venn`, each checked by shape. See `references/visuals.md`.
- **`init --type`** writes a starter for any type. **`diff`** drafts `diff[]` and node statuses from git, with every summary left as a TODO.
- **Estimate for every type:** time and cost ranges per model, a recommended model, `--json`, sized by repo files, diff lines or source words. Prices moved to the current family (Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5), checked on claude.com/platform/api on 2026-11-18. See `references/estimate.md`.
- **Explaining playbook** (`references/explaining.md`) and validator warnings for v2 files: analogies say where they break, captions state the takeaway, quiz feedback covers the tempting wrong answer.
- **Examples** for `pr`, `proposal` and `concept`, all passing `--strict`.
- **Dashboard layout.** A sidebar of chapters, an Overview, and one hash-routed view per chapter, with deep links to every part, step, file, option and diagram. Light, dark and system themes.
- **Explainer library.** Every build also lands in `~/.concept-explainer`, with a hub that lists, filters by type and searches every explainer, and the kit page beside it. See `references/library.md`.
- **`library` command:** `list`, `path`, `add`, `remove`, `rebuild`, `open`, `style` and `serve`. `build --no-library` skips publishing.
- **Settings and `config`:** explainer defaults in `<home>/config.json` (audience, depth, language, visuals, chapters per type, quiz, analogies, model, budget, confirm before start, instructions), embedded in every page. `library serve` lets the Settings view save them, on 127.0.0.1 with a per-run token.
- **`install` command.** Links the skill as `concept-explainer` and adds `rules/concept-explainer.md` (both under `$CLAUDE_CONFIG_DIR` when set). Safe to rerun; `--force` keeps backups.
- **Two styles.** `clean` (default) and `playful`, picked with `--style` or the config default, and switchable by readers.

### Changed

- **Renamed** to Concept Explainer. The bin is `concept-explainer`; `repo-explainer` stays as an alias that prints a deprecation note. The package is `concept-explainer`. Pages are titled "X · Concept Explainer".
- **Library home** is `$CONCEPT_EXPLAINER_HOME`, else `$REPO_EXPLAINER_HOME`, else `~/.concept-explainer`. On the first run, `~/.repo-explainer` is renamed to `~/.concept-explainer` (never deleted). `install` removes the old `repo-explainer` link and rule only when they are provably its own.
- `--repo` file checks and file citation warnings apply only to types that cite code (repo, pr, change, migration).
- The look is now a Geist dashboard: Geist type and greys, one orange accent, hairline rings, one 6px radius, and layer colors as small markers. The previous look lives on as the `playful` style.
- Design credit is now Geist (Vercel) for type and greys and Brilliant for lesson pacing. The `playful` style credits Duolingo's design language.

### Fixed

- `--open` on Windows used `cmd /c start`, which ran shell metacharacters found in a path. It now uses `explorer.exe` with the path as one argument.

## 0.1.0 (2026-10-25)

First public release.

- Chapters: architecture map, end-to-end flow player, what changed and why, folder guide, ER diagram, key ideas, quiz, glossary, runbook.
- CLI commands: `scan`, `estimate`, `init`, `changes`, `validate`, `build`, `presets`, `patterns`, `gallery`, `assets`.
- 5 presets and 11 flow patterns.
- Brand, writing-style, lesson-shape and truthfulness checks.
