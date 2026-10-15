---
name: dsh-hub-archive-agent-notes
description: Use when adding, auditing, pruning, archiving or reviewing Agent Notes in dsh-hub; checks every new note for superseded active records, deletes small UI and purely mechanical records, classifies other implemented notes by future decision value, deletes rejected notes that no longer prevent a tempting mistake, and applies the frozen archived/{class} rules.
---

# Archive dsh-hub Agent Notes

Reduce the active decision corpus without erasing history that can still guide
work. Judge every note semantically: word count and age are discovery aids,
never archive criteria.

There is no machine checker in this repository. The review this skill
prescribes **is** the control — do not skip the classification call and move
the file.

## Read the contracts

Read [the Agent Note rules](../../notes/README.md), the
[archive instructions](../../notes/archived/AGENTS.md), and the lifecycle
instructions for each note in scope. Use the current code, [DESIGN.md](../../../DESIGN.md),
[README.md](../../../README.md), `cordis.patch.yml`, newer Agent Notes, and
inbound links to establish whether a rationale still owns or constrains
anything.

## Check supersession when adding a note

Before drafting a new note, audit the active notes covering the same decision,
mechanism, or rejected alternative. Classify each match while writing the new
one: consolidate a full supersession into the new owner, keep and cross-link a
partial supersession, reject an obsolete proposal, archive a qualifying
implemented note, delete a rejected note that no longer prevents a plausible
mistake. Do not defer a known match to a later corpus audit.

## Classify by future value

Apply these lifecycle-specific outcomes:

- **Implemented — delete:** delete a note that only describes a small UI
  adjustment or a purely mechanical change, and repair or remove inbound
  links. A local bug fix, a performance change, a new capability, or a
  substantive behavior decision does not qualify merely because it is
  implemented. Apply this before the keep/archive classification.
- **Implemented — keep active:** keep a note when its rationale, alternatives,
  negative guarantee, ownership boundary, or reintroduction condition is likely
  to guide a future change. Classify the decision, not the mechanics of its
  implementation: a rename or an extraction can still record a lasting naming
  or ownership rule. Length does not matter.
- **Implemented — archive:** archive a substantive historical decision when it
  is complete and unlikely to guide future work, but its historical rationale
  still warrants preservation. Do not archive records that meet the
  direct-deletion criterion.
- **Proposed — never archive:** keep a live proposal active; if it is no longer
  worth pursuing, reject it with an honest reason and satisfy the
  [rejected lifecycle format](../../notes/rejected/AGENTS.md).
- **Rejected — keep only as a guardrail:** retain a rejection only when the
  losing proposal remains a tempting, meaningful mistake and the note explains
  why it loses.
- **Rejected — delete:** delete the file when the rejected idea is obsolete,
  superseded, no longer plausible, or unlikely to prevent re-litigation. Repair
  or delete inbound links.

Do not archive toward a quota. Inspect every note in scope, classify analogous
groups under one principle, and record genuinely borderline decisions for the
handoff.

## Calibrated examples for this package

Delete implemented notes about: a re-laid-out card grid, a renamed sort field
with unchanged behavior, a colour token swap, a docking edge default.

Keep implemented notes about: the Host/Client ownership split, the Typert
Remote as the only bridge, inline base64 attachments with `maxImageBytes` as a
read-cost ceiling, the three-state theme being application-owned, the
single-file client. Those are the notes a future change keeps trying to
undone.

For rejected notes: keep the one that says "do not split `client.js`" for as
long as the protocol still forces it; delete the one whose premise was a
feature that no longer exists.

## Archive one implemented note

1. Move the file from `implemented/<class>/` to `archived/<class>/`.
   `implemented` is deliberately absent from the archive path.
2. Make no body edits. Insert only `Archived: YYYY-MM-DD` immediately below
   `Status: implemented`, using the archival date. Existing title punctuation
   and blank-line layout are preserved, not prerequisites for archival.
3. Move the `.zh.md` counterpart too, if one exists, with the same date line and
   the same frozen body.
4. Search for inbound links from active prose. Redirect them to current
   authority, retarget them to the archived path only when the historical
   snapshot is intentionally cited, or delete them. Never verify or repair
   links *out* of the archived note.
5. Re-read [archived/AGENTS.md](../../notes/archived/AGENTS.md) and confirm each
   permitted change is the only one you made.

After a note is sealed, never edit, move, reformat, translate or delete it.
Archived notes remain valid inbound-link targets but are historical snapshots,
not authority for current behavior.

## Validate and report

Run `node --test` if the classification touched anything referenced by a test,
and re-read the archived file to confirm the body is byte-identical apart from
the archive-date line. Select any further evidence through
[`dsh-hub-pre-push-checks`](../dsh-hub-pre-push-checks/SKILL.md).

Report: implemented notes kept, deleted or archived; rejected notes kept or
deleted; proposals rejected if any; and every genuinely borderline case with
its word count and chosen outcome.
