# Agent Note: priority is two dimensions in one quadrant matrix

Status: implemented

## Problem

A TODO stored one priority enum. It was labelled with a single word and could
not answer the Eisenhower question the user actually asks: *is this important,
and is it urgent?* The shipped form painted four choices in a row, so even
after adding a second field the user would have had to set urgency, then set
importance, and one edit could leave the two half-updated. The request was a
clickable four-quadrant panel that sets both dimensions in one gesture and
shows the stored pair back.

## Decision

**Store two independent fields, and keep the shipped key.** `priority` remains
the urgency dimension (`low | normal | high | urgent`); `importance` is new
(`low | normal | high | critical`). The names are deliberately different
vocabularies: importance is never "urgent". Renaming `priority` to `urgency`
would rewrite every existing document for a label, so the wire and disk keep
the old key while the panel calls it 紧急程度. The field list is in
[DESIGN.md §5](../../../../DESIGN.md#5-data-model).

**`importance` is additive.** A document written before it existed reads as
`normal`, and no schema bump is needed: the missing key is a defined state, not
corruption, exactly like `title` and `completedAt`. It cannot be back-filled
from urgency — a low-urgency task may be the most important thing on the list —
so the default is the honest "not yet chosen" value and the first matrix click
writes the real pair. The Host rejects an unknown importance on the same terms
as an unknown `kind` or `priority`
([DESIGN.md §5](../../../../DESIGN.md#5-data-model)).

**One matrix, four quadrants, one patch.** The form's old radio row is replaced
by four `role="radio"` quadrant buttons. A value at `high` or above is the high
half of its axis; `low` and `normal` are the low half. A click's quadrant picks
the half of each axis, and the point's position inside the quadrant picks one of
the two strengths on that half. Both fields move in a single `onPick`, so a
second click replaces the pair and the two dimensions cannot be left half-set.
The interaction, axes, marker and colour rules are stated in
[DESIGN.md §8.6](../../../../DESIGN.md#86-the-priority-matrix).

**The matrix sets the draft; the form's confirm writes it.** Every other form
field works that way, and the form is where the old priority control lived. The
item's own card remains the click-to-detail surface; the item's chips echo both
dimensions after the write. Sorting and grouping gained one entry per dimension;
JSON export/import carries `importance` through the same field set as
`priority`.

## Alternatives considered

**Add a second radio row beside the first.** Two controls, no new geometry, and
each dimension stays obvious. It loses on the requirement that one gesture mark
both: the user would make two choices per task, and the second could be skipped
or applied to a stale draft — the exact half-updated state the matrix exists to
prevent.

**Store one combined quadrant enum instead of two fields.** Four values
(`do`, `plan`, `delegate`, `drop`) would make the matrix trivial to render. It
loses on the requested data contract: the two dimensions must be stored
independently, so they can be sorted, grouped and re-marked separately, and a
single enum would throw away the strength the old urgency field already
carried.

**Make both dimensions binary (`high` / `low`).** The doctrine is a 2×2, so
this is the smallest faithful model. It loses on the existing data and on the
click's position: the shipped urgency has four levels, and a point inside a
quadrant could no longer mean anything finer than the quadrant itself. Keeping
four levels per axis makes the 4×4 sub-grid meaningful and lets an existing
four-level urgency load unchanged.

**Set only the quadrant's pair and ignore the click position.** Every point in
a quadrant would write the same two values, which is simpler and still
technically "click the quadrant". It loses on the same point as the binary
option: the control would throw away the position the user just aimed with, and
the four levels on each axis would collapse to two.

**Put the matrix on every card for direct editing.** It would remove the edit
dialog from the common re-mark. It loses on scope and on the card's own
contract: a card is a row summary and its click opens the detail; a matrix in
the card would be a second interactive surface inside a button, and the request
is the form's priority control, not a new item-level editor.

**Rename `priority` to `urgency`.** The clearest names on the wire. It loses on
migration: the stored key is durable bytes and every document, export and test
would need a rewrite for a label the Client already owns.

## Consequences

- Every TODO now carries both dimensions, and every old document reads with
  `importance: 'normal'` until it is re-marked. That default sits in the
  low/low quadrant, so an old or new task can look "not important, not urgent"
  before the user marks it; the alternative was inventing an importance the
  user never chose.
- The `REQUIRED_KEYS` skew check gains a field, so a Host older than this build
  now reports `importance` missing instead of silently dropping the second half
  of a save.
- The matrix is the second meaningful-colour surface in the panel. The status
  badge's contract was amended in
  [DESIGN.md §8.3](../../../../DESIGN.md#83-the-status-badge) rather than
  silently broken; the matrix uses one token wash per quadrant, not the badge's
  two-token mix.
- Markdown export gained an importance line, and JSON export/import pass the
  field through; neither adds a Remote method, because both already rebuild the
  §5 shape.
- The sort and group menus now offer 紧急程度 and 重要程度 separately. The old
  single "标记" entry is gone. The field id stays `priority`, so a stored
  document and any code that names it still mean urgency; the menu simply no
  longer presents one dimension as if it were the whole priority.

## Testing

`tests/model.test.js` pins the default, both enums, the independent patch path
and the new rejection. `tests/client-panel.test.js` renders the matrix, drives
one click across both the quadrant half and the position within it, proves a
second click replaces the pair, re-marks an existing low/low TODO, marks a new
one before creation, and checks both chips echo the stored values. The JSON
round-trip and import tests carry `importance` through the file.
