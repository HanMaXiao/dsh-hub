# Agent Note: the import's size and entry caps are fixed, not Config fields

Status: implemented

## Problem

An import is one Remote write per entry, and the dialog read the whole file
before it knew how many entries it had. A two-hundred-megabyte export — or a
file that merely claimed to be one — would be parsed in the render thread before
the first refusal, and the panel would stop answering while the user looked at
a frozen overlay. There was no upper bound at either end: no limit on the bytes
read, and none on the writes the confirm step would offer to run.

The panel already has one size-shaped knob, `maxImageBytes`, chosen per
deployment from the bundle patch. The question was whether these belonged
beside it.

## Decision

Two fixed bounds, checked in this order:

- **8 MB of file**, checked against `file.size` **before the bytes are read**.
  Reading a file to learn it is too large is the cost the check exists to
  avoid.
- **2000 entries** (`items + statuses`), checked after parsing and before the
  confirm step can be pressed. Every entry costs one `create` or `update`, so
  the entry count is the one that bounds the write burst.
- Both refusals keep the dialog open, name what the file actually holds, and
  leave the confirm button disabled. No Remote call is made for either.

They are **module constants, not `Config` fields**. `maxImageBytes` is a
deployment preference — which images this Host will store is a policy choice.
These two are input safety invariants: a deployment that raised them would not
be choosing a policy, it would be choosing whether its panel answers during a
file pick. Raising them is a code change, which is what it should be.

The dialog's copy does not restate the numbers. `translate` supplies the
sentence and the code appends the file's own count and the constant, so the
limit has one home and the message can still say how far over the file is.

## Alternatives considered

**Put both limits in `Config`, beside `maxImageBytes`.** It matches the
"no hardcoded tunables" rule literally, and an operator could lift the cap for
one big migration. It loses on what the field would mean: `maxImageBytes` caps
what the Host *stores*, and is enforced on the write path. These caps exist to
keep the *Client* from blocking its own render thread while it talks to the
Host; an operator raising them would be changing whether the panel is
responsive, which is not a deployment preference.

**Cap the bytes but not the entry count.** One limit to document, and the
frozen-parse cost is gone. It loses on the write burst: 8 MB of tiny entries is
tens of thousands of sequential Remote calls, each a document write on the
Host. The byte cap is about reading, and the entry cap is about writing; they
are not the same bound.

**Cap the entry count but not the bytes.** One limit, and it matches the cost
that actually scales with the store. It loses on a file with one enormous
entry: the count is one, and the parse still blocks the panel. `JSON.parse` has
no streaming form here, so the only way to survive a huge file is not to read
it.

**Parse the file in chunks, or in a worker.** No size limit at all, and the
render thread stays free. It loses on the bridge this panel has: the bundle is
one plain file with no bundler, a worker means a second module the module table
does not load, and the parse is not the only cost — the writes still happen one
by one. A refusal before reading is the cheaper half of the same protection.

**Stop at the first entry the Host refuses, instead of the cap.** The store's
validation is already the backstop for a bad entry, and it reports the reason.
It loses on what it does not catch: a well-formed file of fifty thousand valid
entries passes every check, and the panel is unresponsive long before the first
refusal could happen.

## Consequences

- A legitimate export over either bound can no longer be imported from the
  panel. At 2000 entries the per-entry report is already the slow path; the
  cap is where an import stops being a dialog and becomes a migration, and a
  migration wants the store document, not this form.
- The numbers live in `client.js` only. A Host change cannot raise them, and a
  test that wants a file just over the line builds one rather than lowering a
  constant.
- The refusals are dialog-local: no write is sent, so the store is untouched
  even when the file is malformed at both ends of the checks.
- The import's existing behaviour above neither bound is unchanged, including
  its per-entry report and its opening of the region an entry lands in.

## Testing

`tests/client-panel.test.js`, through the real dialog:

- a file over the size bound is refused and its `text()` is never called;
- a file over the entry bound is refused, names its own count, and writes
  nothing when the confirm button is pressed anyway;
- a file under both bounds still shows its write cost and can be confirmed.

## Related

- [Agent Note: windowed long lists, and a panel that exports and imports
  itself](./2026-10-30-windowed-lists-import-export.md) — owns why an import is
  one write per entry and goes through `create`/`update`; this note bounds that
  path.
- [DESIGN.md](../../../../DESIGN.md) §4 `dataDir` and `maxImageBytes` — the two
  Config fields this decision deliberately does not grow.
