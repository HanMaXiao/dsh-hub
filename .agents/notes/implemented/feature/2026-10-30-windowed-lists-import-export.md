# Agent Note: windowed long lists, and a panel that exports and imports itself

Status: implemented

## Problem

The list drew every row it had. The body is one scroll container of regions
and groups, and at a thousand items it is a thousand-node tree that every
render, every sort and every region re-frame walks in full. The panel is the
kind of tool people leave open all day over a store that only grows, so the
cost is not a one-off splash — it is every interaction, forever.

There was also no way out of the store. The data lived in one JSON document
on the Host, which is the right home for it, but it meant the only backup was
copying the file by hand out of `$dataDir` and the only way in was editing
that JSON. A user moving between two machines, or restoring a subset of a
store, had no supported path at all.

And the keyboard stopped at the dialog edge. Dialogs let Tab walk out into
the page behind them and dropped the focus wherever it liked on close; a fold
changed nothing a screen reader could perceive; the rows themselves were
reachable only by tabbing through everything before them.

## Decision

### Above 200 items, the body draws a window

The window is the visible slice plus **8 rows of overscan** above and below,
and what it leaves out is drawn as **empty height** — so the scroll range
still describes the whole list and the scrollbar stays where the content is.
The window is taken against the one scroll the body already is, and it is the
same components with a slice: the skeletons, the motion and the fold behaviour
are the windowed path's too. **At or below the threshold the exact previous
path runs**, with no slice at all — a list at the threshold is drawn whole,
so the two behaviours differ only where the old one was already too slow to
use.

The **row pitch is an estimate, corrected once per view**. It starts at a
fixed estimate per view, and the first window drawn measures the rows that
are actually there and corrects it once — once, because a pitch that chased
its own measurement would oscillate on a list whose rows are not all one
height. The overscan is what absorbs the error until then. Region and group
headers are charged fixed heights in the same walk, so a folded region keeps
its header and nothing else exactly as the whole-list render does.

### Import and export go through the Remote that is already there

No new method and no second data path: an **export is built from what `list`
already returned**, and an **import is one `create` or `update` per entry**. A
transfer feature that needed a new method would be a feature the bridge could
not carry.

**An export is a `store.json`, or Markdown.** The JSON carries the document's
own shape — `version`, `items`, `statuses` — rebuilt from the §5 fields the
model defines, with the derived views (the display name, the byte total, the
search haystack) left out rather than written where the Host would only drop
them. Scope is the current tab or everything; `completedAt` travels even
though an update refuses it, because a create honours it and a restored TODO
should keep the moment it was finished instead of being stamped with the
moment it was restored.

**An import maps ids, and the statuses land first.** A known id updates, a
new id creates — counted and shown at the confirm step, because a restore
that lost the definitions would produce entries the store refuses. The
definitions are written first and their ids mapped as they land: a definition
the store does not have is created with an id the **Host** mints, and the
entries that named the file's id are re-pointed at the minted one, or they
would be filed under a status that does not exist. Every entry gets one
reported line, with the reason on every failure, and a region opens itself
when something lands in it — the same rule the status picker follows, because
an import into a folded region would read as a save that did not work.

### The dialogs hold the focus, and the keyboard reaches the rows

Focus moves **into** a dialog when it opens and **back out** to whatever
opened it when it closes; Tab wraps at the two edges rather than walking into
the page behind the scrim. The container itself takes the opening focus
rather than the first control, because a delete confirmation that opens with
Confirm focused answers Enter with the destructive branch. Escape backs out
**one layer at a time** — dialog, then status popover, then menu — bound to
the panel rather than the document, since the focused control is inside this
panel and a document-wide listener would also fire in the application's other
panels.

A **fold is announced** through a permanently mounted `aria-live` region,
because a fold is a state change with no visible text of its own. The **arrow
keys move focus along the drawn rows** — the grid by its measured column
count, the list by one row — and only among the rows that are drawn: the rows
past the window are not on screen to move to, and a walk that promised them
would strand the focus.

The **pickers carry the filter the Host enforces**: the attachment picker
lists the four raster types, the import picker `.json,.md`. Both are filters
and not validations — the Host error path stays the backstop, which is where
the allowlist and the model validation actually live.

## Alternatives considered

**Always window, with no threshold.** One code path, and no second behaviour
to keep in sync. It loses below a few hundred items: windowing costs a layout
walk, an estimated pitch and a scroll listener, and there the whole list is
cheaper to draw than to measure. The threshold is where the estimate starts
paying for itself.

**Virtualise with absolute positioning — translate each row into place —
instead of drawing the gaps as empty height.** The usual virtual-list
implementation, and it removes the layout walk entirely. It loses against
how this panel is already built: the body is regions and groups whose headers
fold, whose arrival is staggered and whose loading state is a skeleton, and a
spacer keeps every one of those rules untouched. A positioned list would
re-implement the fold, the stagger and the skeleton to save one walk.

**Correct the pitch on every scroll, or per frame.** Always-accurate
placement, with no estimate to be wrong. It loses on oscillation: on a list
whose rows are not all one height, the measurement moves the window, which
moves the measurement. Once per view is the version that converges, and the
overscan covers the first frame.

**Add an `export` and an `import` method to the Remote.** The obvious shape
for a transfer feature, and the one that keeps the Client dumb. It loses on
the bridge's own rule: `remote.js` and `typert.js` must describe exactly the
same methods, the Client duplicates the roster in its bundle because the
browser module table cannot reach `lib/`, and a second data path beside the
store is a second thing to keep atomic and to fail loudly. Going through the
`create` and `update` the Remote already publishes means an import is refused
per entry by the same validation that refuses a typo, and the failure report
carries the Host's own reason.

**Write the export in a bespoke dump format of our own.** Room to version the
transfer format independently of `SCHEMA_VERSION`, and room to change the
model without breaking old files. It loses on round-tripping: a file the
panel writes is then a file the store could have written, so an export
imported into a fresh store restores it exactly, and the document a user
opens by hand is the same shape the README documents. The version field
already rides along in the export for the day the shape does move.

**Import by replacing the document wholesale — one write of the file's
items.** The fastest import, and the shape a "restore" button usually has. It
loses on what an import is for here: the user picks a file to merge entries
into a store that already has entries, so a wholesale replace would delete
everything the file does not mention — a silent data change, the failure this
package keeps refusing on its own terms. Per-entry create/update is also what
makes the per-entry report possible at all.

**Move focus to the first control when a dialog opens.** The conventional
autofocus, and what most dialogs do. It loses on the destructive case this
panel actually ships: a delete confirmation that opens with Confirm focused
answers Enter with the destructive branch. The container takes the focus
instead — tabbable, and one Tab from the first control the user asked for.

**Bind Escape on the document.** The usual listener placement, and the one
that works no matter where focus wandered. It loses because the panel is one
overlay inside a larger application: a document-wide handler fires in the
other panels too, and the focused control is inside this panel anyway. It is
bound to the panel, and it backs out one layer at a time rather than closing
everything at once.

**Let the arrow keys walk the whole list, including the rows past the
window.** A keyboard user expects the arrows to reach every row. It loses
because those rows are not on screen: focus would land on nothing and the
walk would strand. The window is what the arrows walk; the scrollbar and the
search box are how the rest of the list is reached.

## Consequences

- A thousand-item list costs a window, not a thousand nodes, and a list at
  the threshold is byte-for-byte the old path — the threshold is a rendering
  constant, not a tunable, and the panel's `Config` fields stay the two the
  bundle patch already carries.
- The scroll range still describes the whole list, so the scrollbar, "scroll
  to the end" and the last row all keep working; what changed is only how
  many nodes exist.
- The pitch is wrong by up to its estimate until the first window is drawn. A
  list whose rows are much taller than the estimate renders a little late and
  a shorter one a little early; the overscan is what hides it.
- Import and export needed no bridge change, so a new Remote method still
  means editing `lib/remote-surface.js` **and** the duplicated roster in
  `client.js` — this feature needed neither.
- An import is one write per entry, so a large file is a large number of
  round trips. The confirm step counts them first and the report names every
  failure, which is the only honest shape for a merge the user cannot undo
  entry by entry.
- An import that renames an entry's kind is sent the kind and refused by the
  Host with the reason, rather than silently writing the other kind's content
  field into nothing. A definition the file renames takes the text and gives
  up its locale key — the same rule the manager follows — and one it leaves
  alone keeps following the application.
- The persisted preferences are untouched: the fold map is keyed by status id
  and the windowed path reads the same map the whole-list path does.
- The keyboard can now reach every drawn row by arrows, a fold is perceivable
  without sight, and a dialog no longer leaks focus into the page behind it.

## Testing

`node --test` runs 228 tests. About twenty are about this change, all of them
driving the real bundle:

- a long list keeps its skeleton and then draws a window; the window follows
  the scroll and the last row is still reachable; the list view windows as
  well and its rows stay rows; a list at the threshold is drawn whole; a
  windowed region still folds, and folds to its count;
- exporting the current tab writes a `store.json` of that tab; exporting
  everything writes every kind, and Markdown writes prose; a JSON export of
  everything round-trips through the store's own shape;
- an import is confirmed before it runs and reports what it would do;
  importing updates a known id and creates a new one; an export imported into
  a fresh store restores it; an entry the Host refuses is reported by name
  and nothing is written for it; a file that renames an entry kind is refused
  by the Host and reported; a file that is not an export is refused at the
  dialog, not at the store; an empty export is refused rather than imported
  as nothing;
- Escape closes a dialog; Tab wraps inside a dialog instead of walking out of
  it; a fold is announced, and so is an unfold; arrow keys move focus along
  the list rows and along the grid cards; the file pickers carry the filter
  the Host enforces.

## Related

- [DESIGN.md](../../../../DESIGN.md) §8 the modals and the views, §6.1 the
  regions — this note owns the reasoning behind the window, the transfer
  dialogs and the keyboard paths; the sections state the facts.
- [Agent Note: the regions are the
  statuses](./2026-10-20-regions-framed-by-the-status-enum.md) — owns the
  fold semantics the windowed path preserves (a folded region keeps its
  header and nothing else, in the windowed render as in the whole-list one)
  and the rule an import follows when it opens the region something landed
  in.
- [Agent Note: the Client mounts its own Remote
  contribution](../bug-fix/2026-10-15-client-remote-bridge-mount.md) — owns
  the bridge this feature deliberately does not extend: no new method, no
  second data path.
- [Agent Note: a stored title, with the display name derived from
  it](../feature/2026-10-15-stored-title-with-derived-name.md) — owns the
  derived fields an export leaves out: the export is rebuilt from the §5
  stored shape, because a derived value written into a document is one the
  Host would only drop.
- [Agent Note: a cached read, a serialised write, and an attachment
  allowlist](../architecture/2026-10-30-store-cache-and-serialized-writes.md)
  — the Host half of the same release: the import's per-entry writes are
  serialised by the write lane, and the pickers' raster filter is the Client
  half of the allowlist.
