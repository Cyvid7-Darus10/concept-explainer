# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- **Dashboard layout.** A sidebar of chapters, an Overview, and one hash-routed view per chapter. Links open a part, a flow step, a change, an entity, a term or a folder directly (`#flows/<id>/<n>` and friends). Light, dark and system themes.
- **Explainer library.** Every build also lands in `~/.repo-explainer` (or `$REPO_EXPLAINER_HOME`), with a hub page that lists and searches every explainer. See `references/library.md`.
- **`library` command:** `list`, `path`, `add`, `remove`, `rebuild`, `open` and `style`. `build --no-library` skips publishing.
- **`install` command.** Links the skill into `~/.claude/skills/` and adds `rules/repo-explainer.md` to `~/.claude/rules/` (both under `$CLAUDE_CONFIG_DIR` when set). Safe to rerun; `--force` keeps backups.
- **Two styles.** `clean` (default) and `playful`, picked with `--style` or a library default (`library style`), and switchable by readers in the sidebar.

### Changed

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
