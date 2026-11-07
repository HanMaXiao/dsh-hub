# Agent Note: adopt the write's row, and keep the reader's place

Status: implemented

## Problem

Every write in the panel ended with a full `list()`: a create, an edit, a delete,
an undo, a status change. `load()` dispatches `load/start`, which replaces the
body's content with the loading skeleton — and the body is the scroll container.
A container whose content shrinks is clamped by the browser to offset zero, so
each of those writes threw the reader back to the top of a long list. On a
status change it also re-read the whole document and replaced every item object,
so a one-row edit paid for a full refresh. The data was right; the view was
thrown away to get it.

## Decision

**A write's response is adopted, and `list()` is reserved for what a write
cannot describe.** The Remote answers `create`, `update` and `delete` with the
stored or removed item, so the panel normalises that one item and replaces,
appends or removes exactly that entry in `state.items`. No read, no `loading`
phase, no skeleton, and every other item keeps its identity. The status picker,
the create/edit form, the delete confirmation and its undo all take this path.
What is shown still comes only from the Host's answer, so a refused write cannot
leave the panel displaying bytes the store never took.

**A refresh that has to happen is quiet.** Import, the status-definition CRUD and
the undo's pre-write existence check still read the document, because they change
more than the write returns: an import writes many rows, and flipping a status's
terminal flag restamps rows the definition does not carry. `load({ quiet: true })`
reads without dispatching `load/start`, so the rows on screen stay until the read
lands, the body never collapses and the offset is never clamped. The first read
and the retry are **not** quiet — an empty panel has no position to lose, and the
skeleton is how it says it is working.

**A single-row write owes the view its offset.** The body's `scrollTop` is taken
when the write starts (`holdScroll`), carried in a ref, and written back by a
layout effect on the commit that changes the rows, before paint. A reader who
scrolls while the write is in flight withdraws the restore: the body's
`onScroll` clears the armed offset when it sees a different one, because that
scroll is newer than the click. Picking the status a row already has writes
nothing at all.

**The skew check rides every item the Host returns.** The §5 field check is not
a `list`-only rule: Host normalisation is total, so a missing key on a write's
response means exactly what it means on a list — the running Host predates the
field. A create against an older Host therefore still says so, even when the
store was empty at mount and the list never mentioned it.

## Alternatives considered

**Keep the post-write `list()`, and restore the scroll after it.** The obvious
fix, and the one this change replaces. It loses on what the user sees: the
skeleton replaces the rows, the browser clamps the offset before any effect can
put it back, so the flash and the jump remain; the read itself is not free (the
Host serialises the document and the tree re-renders), and it replaces every
item for a one-row edit.

**Update the row from the patch locally, without waiting for the answer.** The
fastest path, and it needs no round trip before the row changes. It loses on
truth: the Host trims, defaults, stamps `updatedAt` / `completedAt` and drops
unknown fields, so a local guess can show a title the store did not keep, and a
refused write needs a rollback path that is itself a second source of truth.

**Reload in the background into a shadow document, then diff it into the
visible list.** It would keep the cross-window freshness the old reload gave.
It loses on ownership and cost: a second copy of the document in the browser is
the second owner AGENTS forbids, and diffing normalized items is a second
reconciliation path for a window that only matters when two windows edit at
once.

**Anchor the scroll to the operated row instead of restoring the offset.** It
would keep the row under the pointer even when a folded region above opens.
It loses on the contract the reader is given: the list stays put, it does not
follow the row across the document — and after a delete there is no row left to
anchor to.

**Make every refresh quiet, including the first.** The uniform rule. It loses
on the empty and loading state: before the first read there is nothing to keep,
and a panel that shows nothing while it loads reads as broken. The skeleton is
the only "working" signal the panel has.

## Consequences

- The scroll position survives a status change, a create, an edit, a delete and
  an undo, and no write swaps the body for the skeleton. Only the first read
  and a retry after a failure do — the two moments with no rows to preserve.
- Only the affected entry is replaced; the other item objects keep their
  identity. The panel still re-renders — the changed row has to be drawn — but
  no longer re-reads the whole document to do it.
- **Cost: a local write no longer picks up another window's changes to other
  rows.** Freshness now comes from the mount read, the quiet refreshes (import,
  status definitions, undo) and the retry button. Two windows editing at once
  can disagree until one of those runs.
- The §5 version-skew notice now fires from a write response too, so a store
  that was empty at mount is not silent about a Host that is behind.
- A write whose answer cannot be normalised falls back to a quiet read: the
  position is kept, and the fallback pays one read.
- An undo reads once instead of twice: the read decides create versus update,
  and the row itself comes back in the write's response.

## Testing

`tests/client-panel.test.js` drives the real bundle against the real store:

- a status change, a create and an edit each land without a `list()` call, and
  the changed row is drawn from what the Host returned;
- a delete lands without a reload, and its undo reads once, quietly;
- short, medium and windowed lists keep the body's offset across those writes,
  and the long case keeps the same window instead of the top of the list;
- an offset the landing commit `clamps` is put back, so the restore wins over
  the clamp it caused — and a newer scroll by the reader withdraws it instead;
- the body ref still reaches the measuring ref (`ResizeObserver` observes the
  body), so moving the scroll restore onto its own ref did not orphan the
  measurement.

## Related

- [DESIGN.md](../../../../DESIGN.md) §5 owns the item fields and the skew rule,
  §6 the ordering, §6.1 the regions a moved row lands in — the facts this
  decision works within.
- [Agent Note: undo a delete from the notice, without a second copy of the
  store](../feature/2026-11-05-undo-a-delete-from-its-notice.md) — owns the
  undo's restore semantics and its pre-write read; this note changes how that
  read is made and how its write's answer is applied.
- [Agent Note: windowed long lists, and a panel that exports and imports
  itself](../feature/2026-10-30-windowed-lists-import-export.md) — owns the
  scroll container and the window that makes the offset worth keeping.
- [AGENTS.md](../../../../AGENTS.md) — the ownership table: items are the
  Host's bytes, and the Client keeps no second copy of them.
