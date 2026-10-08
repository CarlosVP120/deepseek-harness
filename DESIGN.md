---
name: EQIDIS AI interface
description: Existing EQIDIS interface with a scenic blank-conversation home
colors:
  home-ground: "var(--dsw-alias-bg-base)"
  home-panel: "var(--dsw-alias-bg-layer-1)"
  home-composer: "var(--dsw-specific-input-major)"
  home-border: "var(--dsw-alias-border-l2)"
  home-text: "var(--dsw-alias-label-primary)"
  home-muted: "var(--dsw-alias-label-secondary)"
  home-hover: "var(--dsw-alias-interactive-bg-hover)"
typography:
  home-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
  home-row:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "13px"
    lineHeight: "20px"
  home-meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "11px"
    lineHeight: "16px"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  panel: "28px"
spacing:
  home-row-gap: "8px"
  home-grid-gap: "12px"
  home-panel-horizontal: "12px"
  home-panel-vertical: "16px"
components:
  home-panel:
    backgroundColor: "{colors.home-panel}"
    rounded: "{rounded.md}"
    padding: "16px 12px"
  home-row:
    textColor: "{colors.home-text}"
    typography: "{typography.home-row}"
    rounded: "{rounded.xs}"
    padding: "8px 4px"
    width: "100%"
  home-row-hover:
    backgroundColor: "{colors.home-hover}"
  home-empty:
    textColor: "{colors.home-muted}"
    typography: "{typography.home-row}"
    padding: "8px 4px 16px"
  home-panel-title:
    textColor: "{colors.home-muted}"
    typography: "{typography.home-title}"
    padding: "0 4px"
---

# EQIDIS AI interface

## Overview

Extend the incumbent interface: shared Modal, Button, Menu and icon components; system typography; existing light/dark tokens; restrained spacing and visible keyboard focus. The authorized home redesign adds the user's pinned navy lighthouse reference as a scenic blank-conversation surface, with compact controls and theme-adaptive panels adapted to real EQIDIS work.

EQIDIS AI uses the company’s coral/purple symbol from eqidis-app and the vector EQIDIS wordmark. The wordmark follows the active text color. Sidebar, conversation hero, browser favicon, welcome artwork and desktop application icon share this identity. Preserve the Spanish slogan and Flash/Pro selection.

**Key Characteristics:**

- Established EQIDIS symbol and adaptive vector wordmark.
- System typography and shared interface primitives.
- Navy ASCII scenery above a theme-adaptive blank-conversation home.
- Compact panels showing real local work and projects.
- Existing light/dark reading, project, and settings surfaces remain in use.

## Colors

### Neutral

Home-ground supplies the blank-conversation background. Home-panel groups work and recent items; home-composer supplies the resident input surface. Home-text carries primary labels, home-muted supports headings and metadata, and translucent home-border and home-hover create restrained separation and row feedback. All home aliases reference incumbent semantic tokens in `ui-theme/src/styles/base.css`; they follow the selected theme.

### Existing identity and state colors

The coral/purple EQIDIS symbol remains an asset-defined identity; it is not replaced by a new home accent. Running dots use the existing semantic success color, errors use the existing theme-dependent error color, and keyboard focus follows the existing business-color focus token. Settings and project dialogs continue to use the incumbent light/dark semantic sheets rather than the home palette.

**The Home Scope Rule.** Scenic home colors follow the application theme on main blank conversations; active conversations and embedded Views keep their existing reading surfaces.

**The Scenic Navigation Rule.** The scenic sidebar owns its background, nested fades, button fills, borders, and hover colors while the dashboard is present, including overrides of macOS vibrancy.

## Typography

System typography remains the interface foundation. The system font stack is defined in `ui-theme/src/styles/base.css`; its brand family remains Montserrat with the system stack as fallback. The new home panel headings, rows, and metadata use the roles in the frontmatter. Metadata and counts use tabular numerals; row titles truncate to a single line with ellipsis.

Scenery glyphs use a 5px monospace canvas font in 4px-by-5px sample cells. This is decorative artwork, not a reading-text size. Retain the existing settings and project typography instead of applying scenery or home label styles globally.

## Layout

The surface contract lives in `.impeccable/surfaces/home.md`. The panorama occupies the full column width and a height of `clamp(280px, 29vw, 390px)`, fading downward. Blank-home content starts 24px below the panorama, using `calc(clamp(280px, 29vw, 390px) + 24px)` top space; the slogan sits entirely on the solid application background. The resident composer retains its DOM and caps the card at 560px, with the current project selector above it.

The dashboard is `min(820px, calc(100% - 48px))` wide, centered with a 54px top and 40px bottom margin. Two equal columns have a 12px gap: working sessions at left, recent sessions at right spanning two rows, and local projects below the working panel. Panels use the documented internal padding. Rows are at least 38px tall.

At `max-width: 620px`, the dashboard stacks into one column in DOM order, uses `calc(100% - 32px)` width and a 36px top margin. The landscape becomes 280px tall, the blank-home top space becomes 304px, and composer side clearance becomes 12px. Existing sidebar navigation remains accessible. This composition is specific to the authorized home surface rather than a global dialog layout.

## Elevation & Depth

The new home panels use tonal separation and half-pixel borders rather than added box shadows. The panorama has a downward mask that stays opaque through 70% and fades to transparent at 100%. The fallback image is fully visible until the canvas is ready, then hidden. The canvas uses full opacity and caches an full-opacity color underpainting beneath colored glyphs to preserve source luminance and saturation. Light appearance uses the paired daylight panorama, dark appearance uses the evening panorama. Both are generated local assets.

The decorative canvas caches glyph artwork after image load and on ResizeObserver notifications, with device-pixel scaling capped at 2. Cached compositing runs at most 24 frames per second: a sixteen-pixel cloud drift, small water ripples, and a warm ASCII lighthouse beam in dark appearance only. Playback pauses while hidden or outside the viewport and uses the static scene for reduced-motion preferences, including live changes. It makes no external request or model call. Existing shared motion tokens remain 0.1s, 0.2s, and 0.3s with the incumbent cubic-bezier curve; the home rows add no new transition or animation.

## Shapes

Retain the incumbent radius vocabulary from base.css. Home panels use the medium radius and home rows the extra-small radius. Six-pixel running and idle dots are circles. The landscape is clipped and decorative, with pointer events disabled. In forced-colors mode the landscape is hidden; panels and text use system Canvas and CanvasText colors.

## Components

### Home panels and rows

Panel headings are compact muted labels with inline counts. Working, recent, and project items are native button rows using the existing navigation callbacks. Hover adds the home-hover fill. Project rows disable during selection, lower opacity to 0.6, and show a waiting cursor. Preserve native keyboard focus and the shared focus styling; the new home CSS does not add a custom focus-ring variant.

Empty and loading messages appear within their respective panels. Project navigation errors use the existing error token and `role="alert"`. Dates and conversation counts belong to the trailing metadata column. Counts and titles come from actual local catalogs. Archived sessions and child-agent entries stay outside recent work.

### Resident composer

Preserve the existing composer chain and Flash/Pro selector. The home surface changes its card cap and local color aliases while retaining its draft and interaction behavior. Its controls retain the standard theme aliases. Effort, login, and preset selectors stay hidden as established for this surface. Active conversations and embedded Views retain their existing composer geometry and behavior.

### Sidebar navigation

The sidebar retains its incumbent stylesheet and native vibrancy in every view. The scenic home uses semantic application tokens, following light, dark, and system appearance without forcing a palette or changing navigation styling.

### Decorative ASCII panorama

The bundled lighthouse panorama is reconstructed as luminance-mapped colored glyphs over its image fallback. Both layers are decorative and hidden from accessibility traversal. Do not promote the canvas into a navigational or data component.

### Project settings and shared dialogs

Continue using the shared Modal, Button, Menu and icon components. Project settings belong to each workspace row. Name and instructions save explicitly. Uploaded documents list their size and have individual removal actions. Show loading, errors and empty states inside the same dialog. Preserve the established settings-card fill and stroke aliases that derive from the active light/dark theme.

## Do's and Don'ts

### Do:

- Do preserve the established EQIDIS symbol, vector wordmark, Spanish slogan, and Flash/Pro selection.
- Do scope the scenic palette and composition to main blank conversations.
- Do use actual local work and project data with explicit empty, loading, and error states.
- Do retain shared primitives, visible keyboard focus, and the existing light/dark settings and reading guidance.

### Don't:

- Don't invent financial statistics or programming-only panels to populate the home.
- Don't apply the scenic background to active conversations or embedded Views.
- Don't replace the resident composer or existing project-settings save and removal behavior.
- Don't resample glyphs per frame, animate offscreen or hidden scenery, ignore reduced motion, or make external/model requests for the panorama.

Motion refinement: cached sky drifts by up to 16 CSS pixels, the lighthouse sweeps through a roughly ten-second cycle, and water bands ripple independently. Controls remain stationary.

The current panorama pair uses EQIDIS violet (#664899/#674899) and coral (#e86a6e) as natural lighting. Light mode uses a luminous lavender and coral sunset; dark mode uses indigo/violet twilight with coral reflections. Preserve full-color cached underpainting and the existing animation.

The home panorama, slogan, composer and dashboard share one scroll flow. The panorama occupies its own row above the slogan so scrolling preserves their separation in both themes.

Both panorama themes retain their source proportions with a cover crop anchored left and vertically centered. The fallback and ASCII cache share that crop, preserving the lighthouse and matching animation placement on window resize.
