# AGENTS.md — Proposed Agent Notes

These Agent Notes are proposals under review; nothing here has shipped. Follow
the [root instructions](../../../AGENTS.md) and the
[Agent Note format](../README.md#the-file-format).

## Write for the reader who will decide, not the one who proposed

A proposal is written to be argued with. The reader is deciding whether to
build it, so lead with the problem and the shape of the change, and spend the
detail on what makes it expensive or risky to say yes to.

The future tense is correct here. Migration steps, open questions, and
"the change would do X" all belong in the body — a proposal written in the
past tense reads as a decision nobody made.

## The four required sections

- `## Problem` — the motivation, written to stand without the solution.
- `## Proposal` — the intended change, with the files it touches named.
- `## Alternatives considered` — one bold-led paragraph per real option that
  lost, and why. See [the mandate](../README.md#alternatives-considered--mandatory).
- `## Acceptance criteria` — the observable state that means done. "The panel
  opens faster" is not one; "opening the panel on a 2000-item store completes
  under 200 ms" is.
- `## Risks` — both what could go wrong and what the change knowingly gives up.

Name the [DESIGN.md](../../../DESIGN.md) section a proposal would change, if it
changes one. A proposal that contradicts the contract is either the most
important note in the tree or the one that should never have been drafted.

## A proposal never sits forever

A proposal that is no longer worth pursuing is **rejected**, not deleted and not
archived: move it to `rejected/`, put the one-line reason on the `Status:` line,
and freeze the body. Archive is for implemented notes only.
