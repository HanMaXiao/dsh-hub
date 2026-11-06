---
name: dsh-hub-orchestrated-rollout
description: Use when a dsh-hub change spans several independent packages — audit the tree, split work so one file has one owner, dispatch parallel sessions in worktrees, land each package by PR, align docs last, and resync main. Do not use for a single-file edit.
---

# dsh-hub Orchestrated Rollout

A rollout is several packages landing on `main` in an order that keeps every
intermediate state green. The work is sequencing and isolation, not a second
copy of the per-package checklist: evidence for one package is
[`dsh-hub-pre-push-checks`](../dsh-hub-pre-push-checks/SKILL.md), and durable
rationale is [`dsh-hub-new-agent-note`](../dsh-hub-new-agent-note/SKILL.md).
This skill owns only what those two do not: the order, the file ownership, the
worktree isolation, and the close-out.

Read [DESIGN.md](../../../DESIGN.md) and the ownership table in
[AGENTS.md](../../../AGENTS.md) before splitting anything. `DESIGN.md` outranks
`AGENTS.md`, which outranks the Agent Notes.

## 0. Establish the baseline before touching a file

1. `git status --porcelain`. A **tracked** file with uncommitted changes stops
   the rollout until it is committed or explicitly set aside; never build on a
   dirty tree. Untracked scan artifacts from the last audit are expected — see
   step 1.
2. `node --test`. It is the only gate: no build, no lint, no typecheck. Record
   the pass count — it is the "before" number the close-out report needs. A
   round that started at 228 and shipped at 273 is a normal shape.
3. Confirm the branch and the remote you think you are on: `git branch -vv`,
   `git remote -v`, `gh auth status`.

## 1. Audit into a dated artifact, with the refusals written down

Put the scan under `YYYY-MM-DD/advisor-plan/outputs/optimization-plan.md`
(today's folder, e.g. `2026-11-05/advisor-plan/outputs/optimization-plan.md`).
It is a local, untracked working artifact: do not commit it into the package,
and do not turn it into a PR. Packages are the unit of change.

The artifact carries three things the dispatch cannot reconstruct:

- **A recommendation list, each item marked do or do-not with a reason.** The
  refusals are load-bearing: a later session that sees only the "do" list will
  rediscover a tempting bad idea and implement it.
- **An evidence table** — command and result summary — filled with commands
  actually run. Useful in this repo: `node --test`,
  `node --test --experimental-test-coverage`, `npm pack --dry-run`,
  `git tag -l`, `gh release list`, and
  `gh api repos/<owner>/<repo>/branches/main/protection`.
- **A package split** (step 2) with each package's files, dependencies and
  acceptance.

Do not write a recommendation whose only evidence is taste. If a claim about
branch protection, package contents, or versions matters, measure it with the
command that reads the live state; prose in `README.md` is not the authority
when it disagrees with the API.

## 2. Split so one file belongs to exactly one package

The invariant is **one file, one package**. Two sessions that edit the same file
overwrite each other's worktree commit, and a rebase cannot reconcile two
independent rewrites of one file. A file may be **read** by several packages —
a text guard that reads `client.js` is safe beside a package that edits it.

Split by file, not by theme. A real round split like this:

| Package | Files |
|---|---|
| client feature | `client.js` + `tests/client-panel.test.js` |
| Host failure tests | `tests/remote-errors.test.js` + `tests/store-failure-paths.test.js` |
| style guards | `tests/style-guards.test.js` |
| release metadata | `package.json`, `locale/*.json`, `CHANGELOG.md` |
| documentation | `README.md`, `DESIGN.md`, `AGENTS.md` |

Rules that follow from that table:

- **A test travels with the source whose behavior it pins.** A new guard test
  that only reads sources as text can stand alone.
- **Docs are a package, never a tail of every package.** They are dispatched
  after the behavior packages merge, so they describe shipped facts. A design
  contract change (DESIGN.md) is the exception: it lands with the behavior that
  changes it.
- **Lead-owned files are never edited by an agent.** `package.json`,
  `cordis.patch.yml` and `icon.svg` are the Lead's. A package that "needs" one
  either hands that part over or is re-split so the editable parts ship and the
  Lead-owned change is described precisely in the report.
- **A guard that pins a fact after a later step is ordered after that step.** A
  version-consistency check added before the Lead bumps the version is red by
  construction. Either put the guard in the bump's package or leave it out of
  this rollout.
- **A dependency means a later merge, not a shared file.** If two packages need
  the same code, merge them or move the shared part into the earlier package.

Give every package a completion definition that names the test command and the
behavior it must pin. "Tests pass" is not one.

## 3. Dispatch each package in its own worktree

The main worktree stays on `main`, clean, and is the only place that owns
`node_modules`. Never `checkout` a feature branch there and never let a second
session share it.

```sh
git -C <repo> fetch origin
git -C <repo> worktree add <repo-parent>/.worktrees/<name> -b <branch> origin/main
```

A fresh worktree has no `node_modules`, so `node --test` fails on missing
dependencies. Link the main tree's directory before running anything:

```powershell
New-Item -ItemType Junction `
  -Path <repo-parent>/.worktrees/<name>/node_modules `
  -Target <repo>/node_modules
```

`pnpm install --frozen-lockfile` is the alternative when a separate copy is
preferred. Remove the junction **before** delivering the worktree: an untracked
link inside it makes `git worktree remove` refuse.

Brief each session with the package table row, the invariant it must not break,
and the reload rule: a Host change needs a **process restart**, a Client change
needs only a **page refresh**. A session that edits outside its file list is a
split bug — stop it and re-split rather than merging the stray edit.

## 4. Land one PR at a time

```sh
gh pr create --base main
```

Then wait for the required check `node --test` to go green and merge:

```sh
gh pr merge <n> --squash
```

Branch protection is live state, so re-read it instead of trusting prose
elsewhere in the repo: `gh api repos/<owner>/<repo>/branches/main/protection`.
The measured policy for this repository is a required `node --test` check,
strict up-to-date, linear history, no force push, and **zero approving reviews
required**. A document claiming one required approval is behind the API.

Order: independent packages in any order, then the package that depends on
them, then docs, then any Lead-owned version step. Three known failures and
what to do about each:

- **`gh pr merge --delete-branch` fails locally at `checkout main`.** The main
  worktree already has `main` checked out, so the local checkout cannot move.
  The server-side merge and the remote branch deletion have already succeeded.
  Do the local cleanup by hand; do not retry and do not roll back.
- **`git push` fails with `remote: fatal error in commit_refs` on some branch
  names.** Push a temporary branch so the commit objects land, create the
  intended ref with `gh api`, then open the PR from that branch. Do not rename
  the work around the failure silently — say which name failed.
- **The PR is behind `main`.** `git fetch origin && git rebase origin/main`,
  then retry the merge. Three attempts maximum; after that leave the PR open
  with the state described plainly.

After each merge, `git fetch origin` in the main worktree so the next worktree
is cut from a `main` that includes it.

## 5. Align the documentation after the code settles

Dispatch the docs package only when the behavior packages have merged. Check
each changed statement against the shipped tree, not against the plan:

- Version claims match `package.json` and `CHANGELOG.md`.
- Relative links resolve from the **published** file set, not only from the
  working tree: `npm pack --dry-run` shows what a reader of the package will
  actually have.
- A behavior the docs describe exists in the merged code, with the test that
  pins it.
- One fact, one home. `DESIGN.md` states the requirement, `AGENTS.md` points at
  it, this skill points at both. Do not paste the same paragraph into two
  files.

## 6. Resync, clean up, and report

In the main worktree:

1. `git status --porcelain`. Non-empty **stops** the sync — never discard a
   change to make a pull clean.
2. `git checkout main && git pull --ff-only`.
3. Verify, do not assume: `git rev-parse HEAD` equals
   `git rev-parse origin/main`.
4. Remove each worktree (junction first), then `git worktree prune` and
   `git worktree list` — only the main tree should remain.
5. `git fetch --prune`, then confirm no remote branch or local branch from the
   rollout is left behind.

Close every round with a report a person can act on:

- which PR merged into which commit, in order;
- the test count before and after;
- what the docs now say, and which behavior changed;
- the tasks only the Lead can do — version bump, tag, release, and any machine
  credential rotation outside the repository.

Report only commands actually run. A check that was skipped is named, not
implied.

## Judgment branches

| Situation | Do this |
|---|---|
| A package needs a Lead-owned file | Ship the rest; hand the file over with the exact change, never edit it |
| Two packages want the same file | Merge them, or move the shared part earlier; never sequence two sessions on one file |
| A guard can only be green after a later step | Order it after that step, or omit it and say so |
| A package changes a fact the audit recorded | Update the audit artifact or state it in the close-out; do not rely on memory |
| A change contradicts `DESIGN.md` | Change `DESIGN.md` in the same package, or write the note explaining why not |
| A behavior is deleted | Delete its tests in the same package — tests describe behavior, not correctness |

## Authorities, not copies

- [DESIGN.md](../../../DESIGN.md) — the contract; read it before a split.
- [AGENTS.md](../../../AGENTS.md) — the ownership table and plugin rules.
- [`dsh-hub-pre-push-checks`](../dsh-hub-pre-push-checks/SKILL.md) — per-package
  evidence and what not to claim.
- [`dsh-hub-new-agent-note`](../dsh-hub-new-agent-note/SKILL.md) — when a
  durable decision needs a note, and
  [`dsh-hub-archive-agent-notes`](../dsh-hub-archive-agent-notes/SKILL.md) for
  supersession.
- [`dsh-hub-client-ui`](../dsh-hub-client-ui/SKILL.md) — client-side judgment
  when a package touches `client.js`.
