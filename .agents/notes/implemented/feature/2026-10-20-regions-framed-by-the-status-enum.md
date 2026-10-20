# Agent Note: the regions are the statuses

Status: implemented

## Problem

The TODO list was framed by two regions, and the two were written into the
code: an "unfinished" half above a "finished" half, selected by the item's
`done` boolean. The panel's own note on the subject called the split "the
frame the list is built in", and it was — a frame with exactly two posts.

Then the completion field became an enum
([the status note](./2026-10-20-status-enum-instead-of-a-completion-checkbox.md)):
six states out of the box and as many more as the user curates. The frame did
not follow. A task in progress and a task on hold were both unfinished, so
they shared a header that said "not done" and nothing else; a task that failed
and a task nobody started looked identical from every angle. The list could
say *whether* a task was finished and not one word about *where it was*.

The mismatch was worse than a stale label. The region structure was compiled
into the Client while the status list was data the Host owns and the user
edits: the two had separate lifetimes, and every question about "which region
is this in" had to be answered twice — once in the Host, which decided what
"finished" meant, and once in the Client, which decided where to put it. The
half that decided placement was the half that could not be edited.

The frame had to become the enum.

## Decision

**A TODO list is one collapsible region per status definition, in the order
the user curates them.**

- Each region holds the items whose `status` is that status's id, and wears
  the status's **name** and the status's **own dot** — the same dot the item's
  badge carries, so the header and the items under it read as one thing.
- A region with **nothing in it is not rendered at all**, the rule the
  two-region layout already had. A filter that hides a status leaves no empty
  header behind, and a region appears at the moment there is something to put
  in it.
- A TODO whose status **no definition carries** — a Host that predates the
  enum, or a definition the user retired — is in no region at all, and is
  filed in **one unlabelled region** instead. The alternative was a panel
  showing an empty list over a store full of items, which is the failure this
  package cares most about: the user's data looks gone, and the only thing
  saying otherwise is a notice.
- The **terminal flag** (§5.1) no longer decides *which* region an item is in —
  the status does that. It decides what a region **orders** by: a terminal
  status's region is ordered by `completedAt` descending, because a log whose
  newest entry is not on top is not a log, and every other region follows the
  sort menu. The menu is not contradicted quietly: it is the terminal region
  that overrides.
- The region id **is** the status id, so the fold state is remembered per
  status — a **map keyed by status id** in the persisted preferences, not a
  pair of fixed keys. The two keys the old layout wrote are dropped from the
  stored blob rather than left describing a panel that is not this one.
- A region **opens itself when something lands in it**: a task that changes
  status opens the region it moved into, and a new task opens the region the
  Host filed it under. The Host's answer is the authority there, not a local
  guess — a new TODO starts in the Host's default status, and only the Host
  knows which one that is.
- Note and Prompt are unchanged: one unlabelled region, no header, never
  folds.

## Alternatives considered

**Keep the two halves and let the status live inside them.** The smallest
change, and it keeps the finished log intact. It loses on the thing the enum
was for: the states that are neither "not done" nor "done" have nowhere to go
except the unfinished half, where they are invisible to the reader and
indistinguishable from each other. A half that answers "is it finished" cannot
also answer "what is it doing".

**Keep the halves and add the status as a grouping choice in the sort menu.**
The two frames nested: a region for "finished" and, inside it, a group for
"cancelled". It loses because it says the same thing twice — the region's
header and the group's header would both name the status — and because the
menu's grouping is a *presentation* choice while the region is the *frame*.
The two are not the same kind of thing, and the user changes one of them far
less often than the other. (The status stays out of the sort menu for this
reason, which the
[status note](./2026-10-20-status-enum-instead-of-a-completion-checkbox.md)
records; this note does not reopen it.)

**Give every status a region, including the empty ones.** A stable frame: the
same six headers every time, with counts, and a status that has nothing in it
still tells the user it exists. It loses to the rule the panel already had for
the finished half — a region with nothing in it is not drawn — and that rule
has a reason: a filter that hides a status would leave its header behind, and
a header over an empty list is noise. The frame is stable enough without it,
because the regions that are drawn are exactly the ones with something in
them.

**Keep the two halves, and make the region order the built-in order rather
than the user's.** The order would then be a property of the code again, and
a user who wants "cancelled" above "in progress" could not have it. The status
list's order is data the Host owns; the regions follow it for free.

**Let the terminal flag decide the placement, and the status only the
ordering.** That is the layout this change replaced, and it is the one that
forced "in progress" and "on hold" into one bucket. It loses for the reason
the whole change was made.

## Consequences

- **The list says more.** "处理中" is a heading with a count, not a badge
  buried in a row, and a task that is blocked reads as blocked.
- **The region structure is no longer compiled in.** It is derived from the
  definitions the Host sends, so a new status, a rename, a reorder or a
  deletion re-frames the list with no code involved. That is the point: the
  frame and the list the user curates are the same thing now.
- **The persisted preferences changed shape.** The two fixed keys became a map
  keyed by status id. A panel that has never been opened since the change
  starts with every region folded, which is the rule the two-region layout
  already had.
- **A status that nothing carries draws no region**, so a status the user
  added and then abandoned leaves no trace in the list — but it is still in
  the manager, where it can be used or deleted.
- **The sort menu's terminal override is now per region rather than per half.**
  A region whose status is terminal orders by completion; every other one
  follows the menu. There is no longer a single "finished" region to reason
  about, and the rule travels with the definition.
- **The unfinished/finished distinction survives in three places** rather than
  in the frame: the filter (全部 / 未完成 / 已完成), the strike-through on a
  finished item's name, and the terminal flag in the manager. The frame and the
  distinction are no longer the same thing, which is what the enum was for.
- **A panel talking to a Host that predates the enum shows the items in one
  unlabelled region**, with the skew notice saying why. The frame is derived
  from the definitions, so without them there is no frame — and an item the
  panel cannot place must still be on screen.

## Testing

`node --test` runs the panel suite against the **real** `HubStore` behind the
gateway envelope, so the regions are driven by the definitions the Host
actually sends:

- the regions appear in the **status list's order**, and a status with no
  items draws no region;
- a non-terminal region's items follow the sort menu, while a terminal
  region's items are ordered by completion, newest first, against the menu;
- moving an item between two statuses moves it between two regions, and each
  region opens itself;
- the region's header carries the status's name and its dot;
- the fold state is remembered **per status**, so folding one region's list
  leaves another one open;
- a status the user reorders, renames or deletes in the manager re-frames the
  list with it.

## Related

- [DESIGN.md](../../../../DESIGN.md) §6.1 the regions, §5.1 the status enum
  and the terminal flag. This note owns the reasoning behind §6.1.
- [Agent Note: a status enum instead of a completion
  checkbox](./2026-10-20-status-enum-instead-of-a-completion-checkbox.md) —
  owns the enum itself: the field, the definitions, the CRUD and the badge.
  This note is the second half of that decision: the enum decided *what* a
  task can be, and this one decides *where it is shown*.
- [Agent Note: Host file store and a single-file
  client](../architecture/2026-10-15-host-file-store-and-single-file-client.md)
  — owns the ownership split the derived frame respects: the definitions are
  durable bytes, and the region order is a view over them.
