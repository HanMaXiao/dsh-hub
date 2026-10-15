# AGENTS.md — Archived Agent Notes

Archived Agent Notes under the class directories are frozen historical
snapshots, not current authority. Never edit, reformat, translate, repair,
delete, or move a sealed file; use an active Agent Note, [DESIGN.md](../../../DESIGN.md)
or [README.md](../../../README.md) for new decisions and current facts.

## What an archival change may do

Only these:

1. Move the file from `implemented/<class>/` to `archived/<class>/`.
2. Insert `Archived: YYYY-MM-DD` immediately below the `Status: implemented`
   line, using the archival date.
3. Repair or delete inbound links from active prose.

Make no body edits. Do not translate, reformat, update facts, or repair links
*inside* the note. Existing title punctuation and blank-line layout are
preserved, not prerequisites for archival. Do not inspect or verify links out
of archived notes — a frozen snapshot is allowed to reference things that have
since moved.

## The class folders here

`architecture`, `feature`, `bug-fix`, `simplification`, `process`, `testing` —
the same closed set the active tree uses. `implemented` is deliberately absent
from the archive path: only an implemented note can enter, and moving into the
archive does not change what it decided.

## Before sealing

Run the [`dsh-hub-archive-agent-notes`](../../skills/dsh-hub-archive-agent-notes/SKILL.md)
workflow. There is no machine checker here, so the review it prescribes — the
classification call, the inbound-link sweep, and the confirmation that the
decision is genuinely unlikely to guide future work — is the control. Do not
seal a note whose rationale you are still relying on this week.

After a file is sealed, never edit, move, reformat, or delete it. Archived
notes remain valid inbound-link targets when active prose intentionally cites
history, but nothing in them is a statement about current behavior.
