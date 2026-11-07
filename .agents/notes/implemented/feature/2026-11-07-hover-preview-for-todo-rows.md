# Agent Note: a hover preview for TODO rows

Status: implemented

## Problem

A row is a summary, and the panel is deliberately narrow: a card shows one line
of name and three lines of body ([DESIGN.md](../../../../DESIGN.md) §8), a list
row one line of each. On a narrow window the body is truncated further, and the
only way to read it in full was to open the item — one click, a dialog, a close.
That is a poor trade for "which of these two tasks is which", the question a
long list is actually used for.

The row already has a hover reply — the fill, the accent bar, the halo — so the
pointer is already on the item. The feature is the second half of that reply:
show the row's own full text without asking for the click that opens the dialog.

## Decision

**One hover preview for the panel, opened by hover intent.** Pointing at a TODO
for ~260 ms opens a single card showing the full title and the full body,
wrapped; moving off the row, scrolling the body, or opening anything modal
closes it. Hover intent rather than raw hover, because a pointer crossing the
list on its way somewhere else would otherwise flash a card per row. Any change
of what is drawn — a tab switch, a query keystroke, a fold, a refresh — also
cancels an armed card: those replace the row without ever firing a
`pointerleave` on it.

**The card is placed by the pointer, not by the row.** It prefers the pointer's
lower right, flips to the other side when it would leave the window, and is
finally clamped clear of the edges; its width is capped at the window width, so
the same surface serves a narrow and a wide window. A row-anchored card would
leave the panel (the card is wider than the panel on a narrow window) and would
need repositioning as the body scrolls. The geometry is re-read when the panel's
measured size changes, so a window resize re-places a card that is open.

**Following the pointer costs no render.** The card's position is a transform
written straight to the element (`placeHoverPreview`), coalesced to one write
per animation frame; the pointer position lives in a ref. The list is not
re-rendered on pointer movement — a render per move would rebuild every drawn
row for a decoration, which is exactly the list-rendering cost this change may
not add.

**It never takes the click it sits over.** The card is `pointer-events: none`
and `aria-hidden`: the row keeps its `role="button"` and its click-to-detail,
and the detail dialog stays the accessible full-text surface. The preview is a
shortcut beside that path, not a replacement for it. Its layer also sits below
the tab capsule and the notice, so a card near the panel's bottom edge cannot
cover the undo control or a tab — both take input the card would otherwise hide.

**TODO only, and no touch path.** The preview exists for the kind the request
names and whose row is the one a narrow list truncates hardest. A `touch`
pointer opens it for nothing — its tap is the detail dialog, which the row
already handles — so a touch pointer never arms the timer.

**It is a floating surface, made the way the others are.** Background
`--dsw-alias-bg-layer-3`, the raised border and shadow of the status popover,
title at 500 weight, body in secondary ink, opacity-only entry motion that
`prefers-reduced-motion` removes. The card's height is capped at the window
height; a body longer than that is clipped, and the dialog is where it is read
in full.

## Alternatives considered

**Use the native `title` attribute on the row.** One attribute, no CSS, no
placement code. It loses on what it can show: a platform tooltip is
single-line-ish, unthemed, unclamped, and on some platforms slow to appear — it
cannot wrap a full body or follow the panel's design language.

**Anchor the card to the row, like a tooltip, instead of the pointer.** Calmer
as the pointer moves, and placement is measured once per hover. It loses on the
narrow case this feature exists for: the card is wider than the panel, so it
still has to leave the panel and be clamped to the window; and the row lives
inside the scroller, so the card would need repositioning on scroll anyway.

**Track the pointer in React state and render the card from it.** The simplest
version to write and to test through the harness. It loses on the requirement
that the list's rendering cost not change: a pointer moving across the list
would re-render every drawn row per movement, and the direct transform write is
one style mutation per frame instead.

**Expand the truncated text in place on hover instead of floating a card.** No
second surface, and the text lands where the row is. It loses on layout: the
row would grow under the pointer and push every row below it down, and in a
windowed list it would change the row pitch the window is placed by — a
reflow the user did not ask for, on every hover.

**Show it for every kind.** Uniform across TODO, Note and Prompt. It loses on
scope: the request is the TODO list, and the preview is the half that answers
the narrow status-framed list; Notes and Prompts keep their rows and dialog and
are not changed by this decision.

## Consequences

- A truncated TODO is readable without a click, at both window widths; the
  click-to-detail path is untouched and remains the keyboard and accessible
  path.
- A row gains one pointer pair per drawn row and one body-level pointer handler.
  Neither renders on movement: the preview's position is a direct style write.
- The preview duplicates text the detail dialog also shows. That is deliberate
  for a transient shortcut, and it is `aria-hidden` so the assistive layer is
  not given a second copy.
- A body taller than the window is clipped by the card, not scrolled: a
  click-through card must not become a second reading surface, and the dialog
  is where a document-sized body belongs.
- A folded panel drops the preview with its rows; a preview armed before the
  fold cannot come back with the next expansion.

## Testing

`tests/client-panel.test.js` drives the real bundle:

- hovering a TODO shows its full title and full body, with the placement beside
  the pointer in the surface's own coordinates;
- the card follows the pointer without adding a panel render
  (`panel.renders` is unchanged across a pointer move);
- a 360×640 window flips the card and clamps it 8px inside the edge;
- leaving the row, scrolling the body and clicking the row each close it, and
  the click still opens the detail dialog;
- a pointer crossing a row for less than the delay opens nothing, and leaving
  before the delay cancels the armed card;
- a tab switch cancels an armed card and a search keystroke closes an open one,
  neither of which fires a `pointerleave` on the row it replaced;
- a Note never previews, and a `touch` pointer never arms the timer;
- the stylesheet keeps the card click-through, raised on the shared plane and
  at the 500-weight cap.

## Related

- [DESIGN.md](../../../../DESIGN.md) §8.5 states the surface's contract; §8.2
  owns the motion rules it follows and §6.1 the regions the rows sit in.
- [Agent Note: windowed long lists, and a panel that exports and imports
  itself](./2026-10-30-windowed-lists-import-export.md) — owns the window that
  decides which rows are drawn, and therefore which rows can be hovered.
- [dsh-hub-client-ui](../../../skills/dsh-hub-client-ui/SKILL.md) — the visual
  rules this surface reuses rather than reinvents.
