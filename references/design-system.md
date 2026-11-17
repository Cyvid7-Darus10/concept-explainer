# Design system

> **Credit.** Type (Geist and Geist Mono) and the grey scale come from **Geist**, the Vercel design system. The one-idea-per-step lesson pacing with a Continue button is inspired by **Brilliant**. Repo Explainer is an independent open-source project, not affiliated with or endorsed by Vercel or Brilliant. It ships no Vercel or Brilliant logos or illustrations; the icons and the mark are original.

This page is **read-only context for agents**. The tokens live in `template/styles.css`, and explainers never override them. The look is shared with the owner's other sites (a sidebar dashboard, hairline rings, one orange accent).

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#fafafa` | `#111111` | Page background |
| `--surface` | `#ffffff` | `#1a1a1a` | Cards, panels, sidebar |
| `--line` | `#ebebeb` | `#2c2c2c` | Hairline rings and dividers |
| `--ink` | `#171717` | `#ededed` | Headings, strong text, focus ring |
| `--body` | `#4d4d4d` | `#c4c4c4` | Body text |
| `--muted` | `#666666` | `#a3a3a3` | Captions, mono labels |
| `--quiet` | `#8f8f8f` | `#8c8c8c` | Comments, faint captions |
| `--faint` | `#c9c9c9` | `#4d4d4d` | Idle lines, disabled text |
| `--accent` | `#fc5e32` | `#ff7043` | **Marks and lines only**: current nav marker, rings, progress, the active arrow |
| `--accent-fill` | `#d2430e` | `#c8410e` | Primary buttons, under white text (AA) |
| `--accent-text` | `#c2410c` | `#ff8a5c` | Orange text, when it must be orange (AA) |
| `--good` / `--bad` | `#297a3a` / `#cb2a2f` | `#62c073` / `#ff6166` | Quiz right and wrong, **only** |

**Layer markers.** The six layer colours in the data contract (`green, blue, navy, midnight, yellow, pink`) render as a small square before the layer name and a 2px bar on each box. They are never fills. Values: `#5b9a6e`, `#5b86c4`, `#4a5d8a`, `#76739a`, `#c39a3d`, `#c0689a`, the same in both themes.

**Type.** Geist 400 to 600 for text, Geist Mono for labels, paths and code. Body 15 to 17px. Labels are mono, uppercase, 11 to 12px, letter-spacing `0.071em`. Headings are weight 450 with tight tracking (`-0.05em` at view titles). No serif.

**Shape.** One radius, 6px (`--radius`). 4px for tags, kbd and tooltips. 9999px only for pills, dots and progress bars.

**Depth.** Hairline rings only: `box-shadow: 0 0 0 1px var(--line)` and inset variants. A firmer ring (`--faint`) on hover, an orange ring (`--ring-accent`) for "where you are". No blurred shadows, no gradients, no dark blocks (code blocks are canvas with a hairline).

**Themes.** Light, dark and system, picked with a three-option switch in the sidebar footer (and the phone menu). `system` leaves `data-theme` off and the `prefers-color-scheme` media query decides; `light` and `dark` set `data-theme` on `<html>`. The choice is kept in `localStorage` inside try/catch; the page works without it.

## Layout

- A 256px sticky sidebar from 1024px up: the mark and "Repo Explainer", the repo title, the chapter nav with counts and a small orange square on the current view, then "n / N viewed", the Library link (library builds only), the theme switch, and the generated date and commit.
- Below 1024px: a floating top bar (flush on phones) with the current view name and a Menu button that opens a full-screen sheet with the same nav.
- One view at a time, routed by hash. Overview first, then one view per chapter, each with a mono eyebrow, a heading and one lead sentence, then the component, then Previous and Next.

## Rules and their reasons

| Rule | Why |
|---|---|
| Rings, never blurred shadows | Depth from a hairline reads crisp at every size and in both themes. |
| No gradients | Flat colour keeps diagrams legible. |
| Orange means one thing | Where you are, what is done, the primary action. Used anywhere else it stops meaning anything. |
| Layer colours are markers | Six saturated fills fight the content; a square and a bar are enough to tell layers apart. |
| Icons by `kind` only, hairline stroke in `currentColor` | One family that follows the text colour and the theme. Mixed icon styles look broken. |
| Motion is short (150 to 600ms), eases out, plays once | It explains change (a step advancing, an arrow drawing) instead of decorating. The selected edges on the map flow to show direction. Everything respects `prefers-reduced-motion`. |
| Text is plain | It prevents XSS from repo content and stops one-off restyling. |
| No inner vertical scroll areas | Only the sidebar and the menu sheet scroll on their own. Diagrams scroll sideways. The step card stays sticky only while it fits. |

## Guardrail tests

`test/brand.test.mjs` fails the build if the stylesheet or scripts gain a colour outside the token list above, a `box-shadow` with a blur radius (custom properties such as `--ring` are resolved and checked too), a gradient, a radius outside 6px, `var(--radius)`, 4px, 9999px, 0, 50% (and 1px or 2px for tiny markers), a font other than Geist, `innerHTML` or `eval`, a link from data that skips `safeUrl`, a grid track that cannot shrink, an inner vertical scroll area, or loses the dark theme blocks, the reduced-motion block or the library context slot. Change the tests only together with this document, in the same change.
