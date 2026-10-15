---
name: dsh-hub-new-agent-note
description: Use when a change to dsh-hub carries decision rationale that code, tests, and DESIGN.md do not already explain — checks whether a note is warranted, picks the lifecycle and class, applies the required skeleton, and records the alternatives that lost.
---

# Write a dsh-hub Agent Note

An Agent Note records the *why* and the *what we gave up*. [DESIGN.md](../../../DESIGN.md)
records what is true; a note records why this shape was chosen over the
neighbour a reasonable implementer would have picked. Both are required: a fact
without its rationale is re-litigated the next time somebody wants to change it.

## Decide whether to write one

Write one when the answer to any of these is yes:

- Would the next reader otherwise ask why the obvious alternative was not used?
- Does the change knowingly give something up, and the giving-up needs to
  survive the person who made the choice?
- Does the change settle a boundary — which of the two owners holds what, what
  crosses the bridge, what may be split — that a later change could erode?

Do not write one for: mechanical edits, renames that keep behavior, bug fixes
with one obvious fix, or local UI presentation and interaction changes. Update
the note that already owns the decision instead of adding a second one.

If the change contradicts [DESIGN.md](../../../DESIGN.md), the note is not
optional — either the contract changes too, in the same change, or the note
records why it does not.

## Check supersession first

Before drafting, search the active tree for a note covering the same decision,
mechanism, or rejected alternative. If one exists:

- **Same decision, same content?** Update it; do not add a duplicate.
- **Fully superseded?** Follow the consolidation rule in
  [the Agent Note rules](../../notes/README.md#when-to-write-one) — preserve
  every unique rationale, alternative and consequence in the new owner, repair
  inbound links, delete the old note.
- **Partially superseded?** Keep both, cross-link them, and update every fact
  that remains current.

Use [`dsh-hub-archive-agent-notes`](../dsh-hub-archive-agent-notes/SKILL.md)
for the classification. Do not defer a known match to a later corpus audit.

## Choose the lifecycle and class

| The situation | Lifecycle |
|---|---|
| Considered, decided, shipped | `implemented/` |
| Still to be argued about | `proposed/` |
| Considered and declined | `rejected/` |
| Shipped, complete, no longer guiding work | `archived/` |

Class is the *kind* of decision — `architecture` (structure of the shipped
source: ownership, the bridge, what may be split), `feature`, `bug-fix`,
`simplification`, `process` (workflow around the code), `testing`. The full
table is in [Classification](../../notes/README.md#classification).

Path: `{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`, dated when the topic was
**first** proposed — a note keeps its date when it moves between lifecycles.

## Write it

Header block, exactly:

```markdown
# Agent Note: <title>

Status: proposed | implemented | rejected — <one-line reason>
```

The `Status:` value must match the folder. No dates or parentheticals in the
status line; the filename carries the date and the folder carries the state.

Then the skeleton for that lifecycle, and **one bold-led paragraph per
alternative that actually lost**:

```markdown
## Problem
## Decision
…bespoke sections…
## Alternatives considered
## Consequences
```

A bold lead names the loser and the reason in the same breath —
`**Store items in browser \`localStorage\`.** …`. Bespoke technical sections
between the required ones are welcome; extra top-level sections beyond them
should state present-tense fact or they are plan-speak left over from the
proposal.

Alternatives are recorded, never invented. Write the options that were actually
weighed, including the ones that look obviously wrong now — that is precisely
the reader's question.

## Chinese counterpart — a judgment call

A `.zh.md` twin is **recommended, not mandatory**. Write one when the note
records a decision a Chinese-reading maintainer may have to defend or revisit.
Skip it for narrow factual records whose content is paths, field names and byte
limits. When you write one, mirror the section order, keep `# Agent Note: ` and
the `Status:` line in English, and update both in the same change.

## Finish

Re-read the file against the checklist: status matches the folder, `## Problem`
stands without the solution, every real alternative has a bold-led paragraph,
the consequence section says what the trade-off **cost and bought**, and every
cross-reference is a relative markdown link. Then run
[`dsh-hub-pre-push-checks`](../dsh-hub-pre-push-checks/SKILL.md).
