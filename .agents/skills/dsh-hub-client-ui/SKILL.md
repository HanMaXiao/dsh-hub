---
name: dsh-hub-client-ui
description: Design and review dsh-hub panel UI changes in client.js — theme-token discipline, zero-emoji iconography, seat and bridge safety, docking behaviour, feedback surfaces, empty and loading states, grid and list views, and locale ownership. Use when adding or changing product-user-visible panel behavior, or when reviewing such a change.
---

# dsh-hub Client UI

Guidance for the judgment calls a test cannot make: what gets reused, where
feedback appears, and how the panel behaves at window edges and across themes.
[DESIGN.md](../../../DESIGN.md) §8 and §9 state the requirements; this skill
adds judgment on top, not a second copy of them. Client-side changes need only a
page refresh — the client module table is re-read per load.

## The non-negotiables

- **Zero emoji.** Every affordance is an inline SVG with an `aria-label`. No
  Unicode pictographs in copy, comments or identifiers.
- **No literal colour.** Every colour is a `--dsw-alias-*` token; the icon
  artwork is the only exception, and only inside the SVG.
- **Do not `require` a Harness Client package.** React comes from the module
  table; all controls are written here.
- **All text is locale-owned.** `zh` and `en` dictionaries with identical key
  sets; nothing user-visible is a bare string literal in a component.
- **One file.** `client.js` cannot be split — organise with banner comments
  instead of extracting modules.

## Visual foundation

- **Reuse the token or value already in this file before introducing a
  literal.** Search `client.js` for the token or the treatment you are about to
  invent; a parallel implementation of a spacing, radius, or card treatment is a
  defect even when it looks right in isolation.
- **Verify every colour in both light and dark.** Dimmed tones suit decorative
  surfaces and routinely fail on text under one theme — check the pair both ways
  before it ships.
- **Font weight tops out at 500** in the stylesheet you add or change.
  Differentiate with size or ink. Pick sizes from an existing role in this file
  rather than inventing one for a single element.
- **Icon, text, and neighbours align to a deliberate axis** — baseline, vertical
  centre, or a shared edge — and stay proportionate to the text beside them.

## Seats and the bridge

- **`shell.overlay` registers `hub.panel` and nothing else.** Use a fresh id;
  reusing a shipped id replaces that cell. The layer is click-through; the entry
  opts back into `pointer-events`. Never append a second application tree to
  `document.body`.
- **Do not register `sidebar.panellist`.** Every row of that slot is a
  `layout.selectPanel(id)` route: `SidebarRoot` calls it unconditionally on
  click, and `LayoutController.selectPanel` throws for any id with no `main`
  keyed entry (`ui-layout/src/client/service.ts:73`). A panel living in
  `shell.overlay` has no main panel, so a row registered there is a
  crash-on-click button, and absorbing the throw with a null-rendering `main`
  entry only trades the crash for a one-frame flash. The collapsed handle from
  [DESIGN.md §9](../../../DESIGN.md) is always on screen and is the intended
  affordance — do not add a second toggle for it.
- **The bridge is the Typert Remote.** `host.call` and `styles.insert` are
  `cordis_run` builtins and are not available to a `dsh.client` bundle. Read
  `ctx.get('remote')?.hub` **at call time, every time** — the carrier may arrive
  after first render and may vanish on unload.
- **A missing carrier is a persistent failure state**, not an exception and
  never a `localStorage` fallback. A silent fallback leaves the user's data
  healthy-looking in a second place, and they find out when it has diverged.
- **The returned `inject` is `['slots', 'locale']`.** Never add `remote`: a
  service listed there parks the fiber forever when the composition cannot
  satisfy it. `package.json`'s `dsh.client.inject` is a different field owned by
  the Lead.

## Views and states

- **Empty state: one prominent add button.** Nothing else.
- **Two distinct skeletons**, one for the card grid and one for the row list,
  both pulsing. A shared skeleton is a defect: the two views have genuinely
  different shapes and a single one reads as a layout bug.
- **Grid:** `repeat(auto-fill, minmax(min(100%, var(--hub-card-min)), 1fr))`
  plus a `ResizeObserver`, so the n×m layout follows the window. Grid and list
  each keep their own loading state; the choice is persisted.
- **Modals: create, delete-confirm, and detail.** The detail modal's top-right
  holds the copy button and the close button.
- **A failed operation keeps the data visible.** A failed delete keeps its row
  and the toast announces the failure; never blank content to show an error for
  a transient operation.
- **In-place notices are for states tied to the panel itself** — a `list` call
  that failed with its Retry action, or a field validation on the form that
  owns the field. Error copy is plain language, one sentence, naming the path
  when the failure is a store path.

## Docking

Four edges, collapsed to a slim handle strip that occludes nothing. Pointer
entering the handle — or a click — expands it; pointer leaving plus an idle
delay collapses it again. The chosen edge is persisted. Expanding is a change
of presentation, never of state: closing the panel and reopening it returns the
same items, the same sort field and direction, and the same view.

## Sort menu

One field, one direction, optional grouping — each radio-selected, not a
comparator chain. Read [DESIGN.md §6](../../../DESIGN.md) before touching it.
`作者` and `标题` are **deliberately absent**: no model field backs them and
`标题` duplicates `名称`. Do not render empty entries for them. Every comparator
ends with `createdAt` then `id` ascending so equal keys never reorder between
renders. Size is computed in the client from the item's content plus
attachment bytes — the Host stores no denormalised size.

## Before handing over

Open the panel in both themes, at a narrow and a wide window, in grid and list,
with a failed carrier and with a `maxImageBytes` rejection. Check each surface
against the list above, then run
[`dsh-hub-pre-push-checks`](../dsh-hub-pre-push-checks/SKILL.md).
