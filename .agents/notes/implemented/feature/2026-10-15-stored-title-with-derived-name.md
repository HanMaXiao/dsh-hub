# Agent Note: a stored title, with the display name derived from it

Status: implemented

## Problem

The item's name was the first line of its content. There was no title to edit,
so the panel could only *display* a heading and could never *have* one: a TODO
whose first line happened to be a date read as a date everywhere, an item's
label changed the moment its content was edited, and sorting by `名称` sorted by
whatever the writer happened to type first.

This reverses a decision this repository recorded rather than merely left out.
DESIGN §6 said:

> Obsidian's `作者` and `标题` are **dropped** — no equivalent in this model, and
> `标题` duplicates `名称`. Do not render empty entries for them.

That reasoning was correct *then*. `标题` and `名称` were the same fact because
`名称` was itself derived from the body, so a menu entry for each would have
been two labels on one column. But the conclusion it drew — that a stored title
is impossible here — was never true. The panel stores notes and prompts; a note
with a title and a first body line are not the same thing, and the author was
the only one of the two that genuinely has no field behind it.

## Decision

**`title` is a stored, optional, trimmed field on all three kinds. The display
and sort `name` stays derived, in the Client.**

The Host owns `title` as durable content (`lib/model.js`): optional, trimmed,
absent or blank stored as `''`, refused with a named field when it is not a
string, and settable by a patch. It joins `common`, so all three kinds carry it
identically.

The Client keeps the derived view it has always owned: `name` is the title when
there is one, otherwise the first line of the content. That fallback is the whole
reason this is safe — an item written before the field existed, or one the user
simply never titled, reads exactly as it did before, and the panel still never
shows a blank row.

`SCHEMA_VERSION` does **not** move. The version guards the document shape, and a
document written before the field existed is still a valid v1 document: every
item normalises to `title: ''`. An additive field with a default needs no
migration, and pretending otherwise would have forced every existing store to be
declared corrupt — which is the one outcome this package's loud-failure rule
exists to prevent.

The create/edit form gained a title input above the content field, and `title`
joins the payload on both `create` and `update`.

The title also counts toward `size`, because it is stored bytes like any other
and `大小` claims to be the item's own byte count.

## Alternatives considered

**Require a title.** Every item would have a name by construction, and the derived fallback could be deleted along with a real class of blank rows. It loses because it makes a field mandatory that most quick captures do not have — the writer types the body first and the title later, or never. Forcing it moves the friction to exactly the moment the user is least willing to pay it.

**Make the title required on write but tolerate its absence on read.** The best of both, on paper. It loses on the write half for the reason above, and on the read half it is exactly what `optionalText` already does with an empty default — so it would add a second, inconsistent path for the same state.

**Derive the title from the first line and store *that*, so the two never disagree.** No fallback branch, one source of truth. It loses the feature: the title cannot differ from the first line, which is the entire request. It also re-couples the title to the content, so editing the first line would silently rename the item.

**Have the Host compute and store `name`.** It would make the sort a Host concern and let the Client stop deriving anything. It breaks the ownership table that makes this package navigable — the Host would own a display decision, and the two halves would then disagree the first time a name had to change without a content change.

**Bump `SCHEMA_VERSION` and write a migration.** Honest versioning for an additive change nobody needs a migration for. It would make every existing store fail loudly on upgrade until a migration ran, and the migration would only ever add `title: ''` — work whose output is identical to the default path.

## Consequences

- Every item now carries `title`, so a store written after this change is one
  field larger per item. Untitled items store the empty string rather than
  omitting the key, which keeps the canonical shape uniform — the same trade the
  other optional fields already make.
- `firstLine` still exists and still does the whitespace collapsing for both
  paths, so a title with a newline in it renders as one line rather than breaking
  a card.
- Search now matches the title as well as the body: an item is findable by the
  words in its name, which it was not before when the name lived in the body.
- The form is one field taller. That is the cost of the feature, and it sits above
  the content field so the shape of an entry is written top-down.
- `DESIGN §6`'s list of dropped fields now reads one item instead of two, and
  `标题` has moved out of it for a different reason than it went in — recorded in
  both places so nobody re-derives the old reasoning and repeats it.
- **The field is only as good as the Host accepting it.** The Host discards a
  field it does not recognise, by design, so a panel that knows `title` talking
  to a Host that does not loses every title the user typed — with no error
  anywhere, and the symptom reads as "my edit did not stick". That is the second
  time this pair of halves drifted apart silently (the first was the bridge
  itself), so the panel now checks the §5 key list it writes against what comes
  back on `list`: normalisation on the Host is total, so a **missing key** — as
  opposed to an empty one — can only mean the running Host predates the field.
  It says so, names the field, and says to restart. The check reads one item and
  an empty store says nothing, so it costs nothing on a healthy pair.
- `tests/model.test.js` asserts the canonical key set per kind, so adding a field
  fails three tests at once rather than passing quietly.

## Testing

`node --test` runs 104 tests. Seven are about this field:

- the canonical key sets carry `title` for all three kinds;
- a title is trimmed, and blank, empty and `null` all store as `''`;
- a non-string title is refused naming the field, like every other field;
- a patch may set the title, omitting it leaves the stored one alone, and
  clearing it is a change rather than an omission;
- an item stored before titles existed still normalises, which is the assertion
  that stands in for "no migration".

`tests/client-panel.test.js` drives the form against the **real** `HubStore`
behind the gateway envelope: a titled item shows its title in the list, an
untitled one still shows its first line, the edit form opens on the stored title
and can change it, a Note saves it too (its payload shape differs from a
TODO's), and a Host simulated as pre-`title` raises the skew notice instead of
losing the field quietly.

## Related

- [DESIGN.md](../../../../DESIGN.md) §5 the model, §6 the sort — this note owns
  the reasoning behind the field and the fallback.
- [Agent Note: Host file store and a single-file client](../architecture/2026-10-15-host-file-store-and-single-file-client.md)
  — owns the ownership split this field respects, and its account of what the
  Client derives.
