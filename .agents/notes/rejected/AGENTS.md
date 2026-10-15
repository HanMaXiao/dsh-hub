# AGENTS.md — Rejected Agent Notes

These Agent Notes record a proposal that was considered and declined. Follow the
[root instructions](../../../AGENTS.md) and the
[Agent Note format](../README.md#the-file-format).

## The verdict is the point

A rejected Agent Note is frozen **as the proposal was written**. Do not rewrite
the body to sound like a decision that was never made, and do not soften the
proposal into something nobody would have proposed.

What makes it readable is the one-line reason on the `Status:` line:

```markdown
Status: rejected — browser storage cannot survive a cleared profile, and the divergence is silent
```

The reason is content, not metadata. It is what a reader who has just thought of
the same idea is looking for.

Only four things apply to a rejected note: the header block, the `## Problem`
opener, a `## Proposal` section, and the
[Alternatives-considered mandate](../README.md#alternatives-considered--mandatory).
It keeps whatever other proposal-time sections it had, including
`## Acceptance criteria` and `## Risks`.

## Keep only what prevents a repeat

A rejected note earns its place only while the losing proposal is still a
**tempting, meaningful mistake** that someone might try again. If the idea is
obsolete, superseded by a later decision, no longer plausible, or simply too
small to be worth retrying, delete the file and repair or delete inbound links.
Classify with
[`dsh-hub-archive-agent-notes`](../../skills/dsh-hub-archive-agent-notes/SKILL.md)
rather than by age or length.

Never archive a rejected note. The archive accepts implemented notes only.
