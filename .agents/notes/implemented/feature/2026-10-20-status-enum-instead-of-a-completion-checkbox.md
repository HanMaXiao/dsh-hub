# Agent Note: a status enum instead of a completion checkbox

Status: implemented

## Problem

A TODO carried one bit. The trailing control on every item was a checkbox, and
the bit behind it answered exactly one question: finished or not.

One bit is a shape the panel can *show* but not one a person can *work with*.
There is no "in progress" and no "on hold", so a task that is blocked looks
exactly like a task nobody started, and a task that is being worked on looks
exactly like a task that was forgotten. A user who wants to say "this is
waiting on someone else" has nowhere to say it, and the workaround — a note
field, a category, a prefix in the title — is a convention the panel cannot
enforce and cannot display.

The request behind the change was for the field to look and behave like a
Feishu 完成状态 column: a **single-select over a list the user curates**, with
the option's colour carried by the field itself. That implies two things the
boolean could not be: more than two states, and a list the user owns.

The panel already had the vocabulary of a single-select — it draws its own
closed choices as radio rows, because a native `<select>`'s popup is painted
by the OS in the OS's colours — and the Host already had the vocabulary of a
durable, user-owned list of things: it stores the items. What neither half had
was a place for a *definition* to live.

## Decision

**A TODO stores the id of one status definition, and the definitions are a
durable list beside the items, owned by the Host and edited through the same
Remote.**

### The status replaced `done`, and there is one completion fact

The stored TODO carries `status` where it used to carry `done: boolean`. The
boolean is gone from the stored shape, and "finished or not" is answered by the
definition's own **terminal flag** — read by one rule, in one place, so the two
cannot drift apart. What a terminal status *means* for the list is settled in
[the regions note](./2026-10-20-regions-framed-by-the-status-enum.md).

Keeping both would have been the smaller diff and the worse design: a second
source for a fact the store owns is exactly the failure mode this package has
already paid for once, in `completedAt`.

The migration is total and lossless in both directions, and needs no schema
bump. An item written before `status` existed carries `done` instead:
`done: true` reads as the terminal status named `done` and `done: false` reads
as the default, and the boolean is dropped from the stored shape on the next
write. A patch carrying `done` and no `status` — a Client older than this
build — is mapped the same way, so a stale panel still writes a completion
instead of dropping it. `SCHEMA_VERSION` stays at 1: a document written before
the enum existed is still a valid v1 document.

An **unknown status id is rejected**, on the same terms as an unknown `kind`
or `priority` and with the same reason: there is no defensible default for a
state nobody defined. Guessing would file a task under a state its user never
chose.

### The definitions are the Host's, like the items

`statuses` is a second array in the same document, so the definitions are
durable bytes and the Host owns them exactly as it owns an item. The Remote
grew three methods — `createStatus`, `updateStatus`, `deleteStatus` — beside
the four it already had, and `list` now returns the definitions with the
items. The Client keeps no second copy: a panel that curated its own list
would show a status the store does not have, and would lose it on the next
reload.

A definition is `{ id, label, labelKey, tone, done }`. The **id** is what an
item stores, so a rename never rewrites the items and a recycled name can
never be mistaken for the state it replaced. The **label** is the user's own
text; the **labelKey** is a locale key, and a definition the user never
renamed follows the application's language while a renamed one keeps its own
text. The **tone** is a closed vocabulary of seven names that map to pairs of
design tokens. The **done** flag is the terminal flag.

Two deletions are refused, both loudly. The **last** definition cannot go: a
TODO with no status has nowhere to sit. A definition that items still carry
cannot go either, and the message says how many items are in the way — moving
them silently to another state would be a data change the user did not ask
for, and it is the kind of change that is only discovered later.

Flipping a definition's terminal flag **re-stamps the items carrying it**: one
that has just become finished gets a stamp, one that is no longer finished
loses it. Without that, retiring a definition as "finished" would leave its
items in the finished log forever, ordered by a moment that no longer meant
anything.

### The badge is the item's own control, and it is a colour

The trailing control on a card's title row and on a list row is a **status
badge**: a button carrying a dot and the status's text. Clicking it opens a
popover listing the definitions, and a management dialog behind it adds,
renames, re-colours, re-orders and deletes them. The create and edit forms
still carry **no** completion control (DESIGN §8), and the round trip still
carries the status, so editing a title does not clear it.

The badge's colour is the one place in the panel where two colours are mixed
on purpose: a wash of the tone's first token is laid in from the left, a wash
of the second from the right, each masked by a radial gradient that fades it
towards the other side, so the two bleed into each other and overlap in the
middle rather than meeting at a seam. The pane behind them is frosted
(`backdrop-filter`), so the badge sits *on* the card rather than over it.

The tone is a **name**, not a colour the user picks. The panel's rule is that
every colour is a `--dsw-alias-*` token, and a free colour picker would have
to break it — and would make the badge unreadable in the other theme.

### What was deliberately not done

The status is **not** a grouping choice in the sort menu, and a status is
changed on the item itself rather than through a menu that arranges it. The
list is framed by the statuses — one region each
([the regions note](./2026-10-20-regions-framed-by-the-status-enum.md)) — so a
grouping choice for the status would put a status header inside a region that
is already named by one.

## Alternatives considered

**Keep the boolean and add a second field beside it.** The smallest diff, and
the one that would have let the old checkbox keep working. It loses on the one
thing this repository keeps getting right: two fields holding the same fact
disagree the first time one of them is written and the other is not. A task
marked `done: true` with `status: 'doing'` has no answer to "is this finished",
and every consumer of the answer would have to pick one — which is the bug
this change exists to remove.

**Keep the boolean and add an independent "stage" field.** The same objection
with a different name, and worse: the two fields would not even mean the same
thing, so nothing would notice them drifting.

**Store the status list in the browser, beside the presentation preferences.**
The panel already keeps its dock edge and its view in `localStorage`, so the
precedent is right there. It loses because the definitions are data the user
curated and expects to survive a refresh, a crash and a cleared profile — the
same argument that decided where the items live
([the architecture note](../architecture/2026-10-15-host-file-store-and-single-file-client.md)),
and a second copy of a list the Host also holds is a split-brain waiting for
the first reload.

**Keep the status a closed enum in the Host, with no user editing.** The
cheapest version of the feature, and the one the data model alone would
suggest. It loses on the request itself: the point of a single-select over a
curated list is that the user curates it, and a fixed six means a user who
works in "待评审 / 待发布 / 已上线" has to shoehorn their process into
"待处理 / 处理中 / 已完成".

**Let the user pick an arbitrary colour per status.** It is what Feishu and
most other tables let you do, and it is the most attractive option. It loses
on the panel's own rule: every colour here is a `--dsw-alias-*` token, so a
stored `#a3f` would be a literal colour the theme cannot adjust and the dark
theme cannot keep readable. The tone is the compromise that keeps the
definition user-owned and the palette owned by the application.

**Let deleting a definition move its items to another one.** The convenience
every table offers. It loses because it is a silent data change: a status the
user named "已上线" would quietly become "待处理", and the item's history would
read as a mistake rather than as a deletion. The refusal says how many items
are in the way, which is a sentence the user can act on.

**Bump `SCHEMA_VERSION` and write a migration.** Honest versioning for a field
swap. It would make every existing store fail loudly on upgrade until a
migration ran, and the migration would only ever map a boolean onto a status —
work whose output is identical to the default path. The precedent is the same
one the `title` field set
([the title note](../feature/2026-10-15-stored-title-with-derived-name.md)):
an additive read path needs no migration, and pretending otherwise turns every
existing store into a corrupt one.

**Offer the status as a grouping choice in the sort menu.** The obvious thing
to add alongside an enum, and the one Feishu offers. It loses because the
panel's list is already framed by completion: a group header per status inside
a region that is already one completion state says the same thing twice, and
the list of statuses is a list the user edits, so every header would have to be
rebuilt whenever a status is renamed or retired. A status is changed on the
item, one click away, which is where a single-select belongs. (The frame has
since become the statuses themselves — one region each — which sharpens the
same reason; see
[the regions note](./2026-10-20-regions-framed-by-the-status-enum.md).)

**Draw the badge in one flat colour, and let the dot carry the meaning.** The
simpler rendering, and it is what a first pass usually looks like. It loses
because a flat fill reads as "a label with a border" rather than as a state:
the blend is what says the badge is coloured by something, and the frosted
pane is what makes it sit on the card instead of over it.

## Consequences

- **The badge is the completion control, so the old checkbox is gone.** The
  panel's rule that completion lives on the item rather than in a form still
  holds; what changed is that the control is a choice rather than a toggle,
  and reaching it is still one activation.
- **A TODO's state is now expressible**: in progress, blocked, failed and
  cancelled are four states the panel can name, colour and file under, and the
  list frames itself by them
  ([the regions note](./2026-10-20-regions-framed-by-the-status-enum.md)).
- **The document is one array larger.** The definitions ride along with the
  items, so one backup still covers both, and `list` still reads one document.
- **The panel cannot function against a Host that predates the enum.** A Host
  that sends no definitions leaves the badge unpainted, the notice says the
  Host is behind and names the field, and the panel still renders. The same
  skew notice already covers `title`; `status` joins the key list it checks.
- **The definitions are the Host's, so they cost a round trip.** Every rename,
  every tone change and every reorder is a write followed by a reload. A
  rename commits on blur rather than on every keystroke, because a write per
  character is a write per character.
- **A terminal flag is user data, and it moves items between the regions.** A
  definition retired as "finished" brings its tasks with it, and the re-stamp
  keeps the log's order honest.
- **The tone vocabulary is closed.** A status can be one of seven looks, which
  is fewer than a free colour picker offers and more than the panel had. The
  mapping lives in one stylesheet block, so adding a tone is one rule and one
  token pair.

## Testing

`node --test` runs 186 tests. About thirty of them are about this change.

- `tests/model.test.js`: a legacy item carrying `done` reads as the `done`
  status and a legacy `done: false` reads as the default; an unknown status id
  is rejected and the message names `status`; `completedAt` is stamped on
  entering a terminal status, cleared on leaving one and preserved otherwise;
  a patch-supplied `completedAt` is refused; a patch carrying the old boolean
  is mapped rather than dropped.
- `tests/store.test.js`: a document with no `statuses` key reads as one
  carrying the built-ins; a malformed list stops the mount and names the path;
  a definition can be created, renamed (which gives up its locale key),
  re-toned, re-ordered and deleted; the last definition cannot be deleted and
  one that items still carry cannot be deleted either, with the count in the
  message; flipping the terminal flag re-stamps the items that carry it.
- `tests/client-panel.test.js` drives the real bundle against the **real**
  `HubStore` behind the gateway envelope: the badge is on the item and shows
  the status's text, it opens the picker and not the item, the picker is placed
  inside the panel and flips above the badge when there is no room below it,
  choosing a status writes it through the Remote and moves the item into that
  status's region, the manager adds, renames, re-colours, re-toggles, re-orders
  and deletes through the Remote, a status that items still carry surfaces the
  Host's refusal, a Host that sends no definitions still renders the panel, and
  the badge's own rules are made of tokens only.
- `tests/client-bridge.test.js` and `tests/typert.test.js` hold the Client's
  duplicated roster and the manifest to the Host's, including the three new
  methods and the `deleteStatus` → `removeStatus` implementation.

## Related

- [DESIGN.md](../../../../DESIGN.md) §5.1 the status enum, §8.3 the badge.
  This note owns the reasoning behind them.
- [Agent Note: the regions are the
  statuses](./2026-10-20-regions-framed-by-the-status-enum.md) — the second
  half of this decision: the enum decides *what* a task can be, and that note
  decides *where it is shown*.
- [Agent Note: Host file store and a single-file
  client](../architecture/2026-10-15-host-file-store-and-single-file-client.md)
  — owns the ownership split the definitions respect.
- [Agent Note: a stored title, with the display name derived from
  it](../feature/2026-10-15-stored-title-with-derived-name.md) — the precedent
  for an additive field and a no-migration read path.
