# Agent Note: undo a delete from the notice, without a second copy of the store

Status: implemented

## Problem

The delete confirmation was the last step. Deleting an item removed it from the
Host's document, refreshed the list and said nothing that could be undone, and
the panel is a tool people use on a phone-sized overlay where a mistapped
trash control is the ordinary way to lose a note. A confirmation dialog helps
only for the delete the user meant to think about; it does not help the one
that got tapped by accident.

The obvious repair — "keep the last deleted item in the panel" — collides with
the ownership table in [AGENTS.md](../../../../AGENTS.md): items are the
Host's bytes, and the Client holds no second copy of them. A React state
variable holding the removed item is exactly that copy, with a lifetime no
control on screen is responsible for.

## Decision

**The notice holds the removed item, and offers one control while it is on
screen.** `delete` already returns the removed item (the Remote's own comment
says why: so the panel can offer an undo), so `confirmDelete` hands it to the
notice as `{ labelKey, run }` and the notice renders a button beside its text.
The item lives in one ref that is cleared when the notice is replaced, when
its timer expires, and when the tab changes — the three moments the control
leaves the screen. Nothing in the panel is a durable second copy: if the notice
is not there, the item is not there either.

**An undo is a restore, not a re-create.** The Host's `create` honours a
supplied `id` and the timestamps, so the undo sends back the item it was given
and the entry returns with the id other panels already saw, the moment it was
created, and its original place in the sort. A copy with fresh timestamps would
be a different entry with a duplicate body. The id is looked up first because
another panel may have recreated it during the six-second window; a live id is
written as an update so the undo cannot duplicate it.

**The list is re-read before that decision is made.** The notice outlives
renders, so the `state.items` its closure was built with predates the delete
that produced it. An undo that trusted that copy would see the item still
listed and take the update branch for a row the store no longer has. `undoDelete`
therefore `load()`s first, decides on the fresh list, and loads again after the
write; two reads on an undo is the price of not reading a stale one.

**The notice is now a change of state the assistive layer perceives.** A
failure renders as `role="alert"` with `aria-live="assertive"` — the one
message the user has to act on — and a receipt as `role="status"` with
`aria-live="polite"`, read when the reader is free. A failure also stays
longer (six seconds) than a receipt (2.2), since it is the one that may need a
second look.

## Alternatives considered

**Keep the removed item in a separate React state slot beside the notice.** A
cleaner separation between "data being shown" and "presentation", and it would
survive a re-render that replaced the notice text. It loses on lifetime: the
slot and the control are two things that must be cleared together, and the
first code path that forgets leaves an item restorable from a control that is
gone. The notice is the only surface that offers the undo, so it is the only
place whose lifetime matches the item's.

**Soft-delete on the Host: a `deletedAt` field, and every read filters it out.**
The usual undo model, and it would survive a reload. It loses on ownership and
shape: it adds a durable field to every item, moves `SCHEMA_VERSION`, and puts
a filter in front of every query for a window the user is looking at. The
delete is hard, and the undo window belongs to the panel.

**Re-create the item with a fresh id, and accept the duplicate.** The simplest
restore, and it needs no id check. It loses on what the user sees: the entry
comes back with a new id and as the newest row, so a delete-then-undo moves the
item. Two panels would also disagree about whether the restored entry is the
same one.

**Ask the Host to expose `restore(id)` and keep a bin there.** An explicit
Remote method is easier to discover than a notice button. It loses on the
bridge's own rule: `remote.js`, `typert.js`, `lib/remote-surface.js` and the
duplicated roster in `client.js` must all agree, and a method that only serves
a six-second window is a permanent part of that contract. `delete` returning
the removed item was already there for this.

**Bind the undo to a key chord instead of a button.** Faster for a keyboard
user, and no notice geometry to get right. It loses on discoverability: the
person who needs an undo is the one who did not mean the delete, and a chord
nobody was told about is not an affordance. The button names itself in the
notice they are already looking at.

## Consequences

- A delete can be undone for six seconds, and after that it cannot. The window
  is short on purpose: it is a mistap catcher, not a trash can, and a bin is a
  feature the store would have to own.
- Nothing new is persisted and no Host state is added. The removed item exists
  only while its notice does; a reload loses the window, which is the same
  answer a reload gives every other in-memory affordance.
- An undo costs two `list` calls: one to choose between create and update, one
  to draw the result. It is a rare path and both reads are the ordinary ones.
- A Host that returns nothing from `delete` gets a plain "Deleted" notice with
  no control, rather than an undo button that would do nothing. That is the
  skew case, and it is reported by absence instead of by a dead control.
- Deleting a **status definition** still has no undo. It is refused while items
  carry it, which is the case that matters, and the last definition is refused
  outright; the item path is the one a mistap can reach.

## Testing

`tests/client-panel.test.js` drives the real bundle against the real store:

- deleting an item leaves an undo control in its notice;
- undo puts the item back with the same id, `createdAt` and `updatedAt`;
- the control leaves with the notice, and a click after the window restores
  nothing (the six-second timer is captured and fired by hand rather than
  waited out);
- a failure renders as an alert and is given six seconds; a receipt renders as
  a status and leaves on 2.2.

## Related

- [DESIGN.md](../../../../DESIGN.md) §5 the item fields and §8 the modals — the
  facts this decision works within; the notice itself is a Client surface
  DESIGN does not name.
- [Agent Note: windowed long lists, and a panel that exports and imports
  itself](./2026-10-30-windowed-lists-import-export.md) — owns the reason an
  import goes through `create`/`update` rather than a new method, which is the
  same reason the undo does.
- [Agent Note: the Client mounts its own Remote
  contribution](../bug-fix/2026-10-15-client-remote-bridge-mount.md) — the roster
  this decision deliberately did not extend.
