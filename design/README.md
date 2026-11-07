# OpenArc design system

Every visual decision in OpenArc's viewer comes from a design token. Tokens are defined once as JSON, generated into CSS custom properties, and read by both the stylesheet and the diagram layout. That way the layout and the CSS can't drift apart, and a new theme is a single file.

```
design/
  tokens/primitives.json   raw palette and font stacks          never reach CSS
  tokens/foundation.json   grid, space, radius, border, type, motion, opacity, layers
  tokens/components.json   component sizes the layout depends on
  themes/light.json        colours and shadows for one theme
  themes/dark.json
tools/tokens.mjs           JSON → viewer/tokens.css
tools/lint-design.mjs      fails the build if the viewer CSS uses a raw value
```

`node tools/build.mjs <example>` regenerates the tokens, runs the lint and inlines the CSS, so a built page is always in sync with `design/`.

## Layers

| Layer | Example | Who may use it |
|---|---|---|
| **Primitive** | `palette.jade.600` = `oklch(0.58 0.145 158)` | Only themes and other tokens |
| **Semantic** | `color.accent.solid`, `space.4`, `type.heading` | Components |
| **Component** | `card.row-height`, `inspector.width` | Components and the layout code |

Components never refer to a primitive. A colour is always chosen for its role (`color.status.added.solid`), never its hue (`jade.600`). That's what lets a theme change every colour without touching a component.

Tokens use the [W3C Design Tokens format](https://tr.designtokens.org/format/): each token has a `$value` and a `$type`, groups can set `$type` for everything inside them, and `{group.token}` refers to another token. Tools such as Style Dictionary and Tokens Studio read the same files.

## Grid

| Token | Value | Use |
|---|---|---|
| `grid.baseline` | 4px | Every line height and vertical size is a multiple of this |
| `grid.unit` | 8px | Component sizes and diagram positions snap to it |
| `grid.canvas` | 24px | Spacing of the dots on the canvas |

The diagram layout reads card sizes from the component tokens, measures each card's content, rounds its width up to `grid.unit`, gives every card in a column the column's widest width, and snaps positions to the grid. Nothing on the canvas is placed by hand.

## Spacing

`space.0` to `space.16` run on a 4px step: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. The number is the multiple of 4, so `space.4` is 16px. Use these for padding, margins and gaps. If none fits, the layout needs rethinking, not a new value.

## Radius, borders, layers, motion

- **Radius:** `xs` 4 (pills, tags), `sm` 6 (chips), `md` 8 (controls, code blocks), `lg` 12 (cards), `full` (dots, badges).
- **Border:** `border.width` 1px for hairlines, `border.width-strong` 2px for emphasis (note rules, focus, block rails). Outlines are drawn inside the element (`outline-offset: -1px`) so borders never change a component's size.
- **Layers:** `layer.canvas-controls` < `layer.panel` < `layer.overlay`.
- **Motion:** `duration.fast` 120ms (hover), `base` 200ms (panels, dimming), `slow` 320ms (camera moves); `easing.standard`.
- **Opacity:** `dimmed`, `dimmed-row` and `dimmed-edge` for whatever is outside the current focus.

## Typography

Two families: **Inter** for interface text and **JetBrains Mono** for code and anything copied from code. There are 14 roles but only seven sizes (11, 12, 13, 14, 15, 16 and 20px), and every line height sits on the 4px baseline.

| Role | Family | Size / line | Weight | Used for |
|---|---|---|---|---|
| `display` | Inter | 20 / 28 | 600 | Change title |
| `title-code` | Mono | 20 / 28 | 600 | Inspected member |
| `heading` | Inter | 16 / 24 | 600 | Component name on a card |
| `lead` | Inter | 15 / 24 | 400 | Member summary |
| `body` | Inter | 14 / 20 | 400 | Default text |
| `body-strong` | Inter | 14 / 20 | 600 | Flow names, brand |
| `body-sm` | Inter | 13 / 20 | 400 | Summaries, notes |
| `caption` | Inter | 12 / 16 | 400 | Component summary on a card |
| `label` | Inter | 12 / 16 | 500 | Buttons, legend, small controls |
| `overline` | Inter | 11 / 16 | 600, uppercase, +0.08em | Section headings, status pills |
| `code` | Mono | 12 / 20 | 400 | Klar and source blocks |
| `code-strong` | Mono | 13 / 20 | 500 | Member names |
| `code-sm` | Mono | 12 / 16 | 400 | Signatures, counts |
| `code-meta` | Mono | 11 / 16 | 500 | Kinds, paths, line numbers |

Apply a role with its class (`class="type-heading"`), which sets font, tracking and case together. The stylesheet doesn't set `font-size` or `line-height` anywhere else; the lint enforces this.

## Colour

The default palette, **Harmonic**, is defined in [OKLCH](https://oklch.com), where equal lightness looks equally light to the eye. That makes three rules possible:

- **Neutrals carry the accent's hue.** The greys are the logo indigo (hue 275) at very low chroma, so surfaces, text and accent belong to one family.
- **Status colours are siblings.** Jade (added, hue 158), saffron (changed, 70) and vermilion (removed, 22) share lightness and chroma at each step and differ only in hue, so none of them shouts louder than the others. Saffron sits a touch lighter, because yellow turns brown below L 0.6.
- **Syntax colours follow the same steps.** Azure (names) and magenta (values) use the same lightness as the status solids.

Ramps are named by hue (`neutral`, `indigo`, `jade`, `saffron`, `vermilion`, `azure`, `magenta`), and only themes refer to them. The logo indigo stays in hex (`#4353d6` light, `#8e99ff` dark).

Each theme defines the same set of colour roles:

| Group | Tokens | Meaning |
|---|---|---|
| `color.canvas` | `bg`, `dot` | The diagram background and its grid |
| `color.surface` | `panel`, `card`, `sunken`, `hover`, `selected` | Backgrounds, from panels to pressed states. `sunken` is for context cards and code |
| `color.border` | `subtle`, `default`, `strong` | Dividers inside a component, outlines, and emphasis |
| `color.text` | `primary`, `secondary`, `tertiary`, `quaternary`, `on-accent` | Four steps of emphasis, plus text on an accent fill |
| `color.accent` | `solid`, `text`, `subtle`, `rail` | Selection, flows, focus, and Klar block rails |
| `color.status.<status>` | `solid`, `text`, `subtle` | One set each for `added`, `changed`, `removed` and `context`. `solid` for marks and edges, `text` for words on `subtle` |
| `color.syntax` | `control`, `declaration`, `name`, `value`, `verb`, `operator`, `effect`, `comment` | Klar highlighting, one per token class in the [Klar spec](../spec/klar.md#13-highlighting) |
| `shadow` | `raised`, `overlay` | Cards and controls; the inspector |

Status always means the same thing everywhere: green is added, amber is changed, red is removed, grey is context. Accent (indigo) is reserved for what the reader is doing (selection, flows, focus), so it never competes with status.

## Themes

The theme is chosen in [`openarc.config.json`](../openarc.config.json) with the `theme` setting. The default, `system`, follows the reader's operating system between `light` and `dark`. Any other value names a theme file, and the build sets `data-theme` on the page's `<html>` to fix it.

### Adding a theme

1. Copy `design/themes/light.json` (or `dark.json`) to `design/themes/<name>.json`.
2. Set `$extensions.openarc.name` to `<name>` and `scheme` to `light` or `dark`.
3. Point each token at a primitive, adding primitives to `design/tokens/primitives.json` if you need new colours.
4. Run the build. It fails if the new theme is missing a token or defines one the others don't.
5. Set `"theme": "<name>"` in `openarc.config.json` to use it.

Its CSS appears as `:root[data-theme="<name>"]`. Only colours and shadows are themeable. Spacing, type and sizes are shared, so the diagram has the same layout in every theme.

## Rules

`tools/lint-design.mjs` checks the viewer stylesheet on every build and rejects:

- colour literals (`#hex`, `rgb()`, `hsl()`)
- pixel lengths and durations
- numeric font weights
- `font-size` and `line-height` outside the type roles

Media query conditions are exempt, because CSS custom properties can't be used there.

`tools/contrast.mjs` measures WCAG contrast for every colour pairing the viewer uses, in every theme, and the build fails if one falls short: 4.5:1 for text, including Klar on added and removed lines, and 3:1 for status marks, edges and de-emphasised metadata. Run `node tools/contrast.mjs --all` to see every ratio.
