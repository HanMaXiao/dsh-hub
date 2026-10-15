---
name: dsh-hub-pre-push-checks
description: Use before handing a dsh-hub change over, before pushing, or when claiming checks pass; selects the smallest evidence that covers the outgoing change — node --test for lib/, manual panel verification for client.js, and note review for .agents — without reflexively running things the diff does not touch.
---

# dsh-hub Pre-Handover Checks

One command verifies this package:

```sh
node --test
```

It runs `tests/` over `lib/`: id generation, item validation, and the atomic
store. There is no build, typecheck, lint stage, or CI matrix — the Loader
imports these files straight from disk, so a bug is caught by that test run or
by running the plugin. Report only the commands actually run.

## Match evidence to the surface

- **`lib/`, `host.js`, `index.js`, `remote.js`, `typert.js`:** run
  `node --test`. When a `remote.js` method changed, confirm `typert.js`
  describes exactly the same methods — a method marked on one and missing from
  the other fails manifest validation at load, not at test time.
- **`client.js`:** run `node --test` anyway if it imports anything testable, then
  verify in the running plugin. Client code has no unit harness here; the panel
  is the evidence. Reload is a page refresh, not a process restart.
- **`cordis.patch.yml`, `package.json`, `icon.svg`:** Lead-owned. Do not edit
  them; if a change requires one, say so and hand it over rather than working
  around it.
- **`locale/*.json`:** confirm `zh.json` and `en.json` have identical key sets
  and that no user-visible string in `client.js` bypasses the dictionaries.
- **`.agents/`, `README.md`, `DESIGN.md`:** no command. Re-read the changed
  prose against the rule it documents — see
  [`dsh-hub-new-agent-note`](../dsh-hub-new-agent-note/SKILL.md) for a note and
  [`dsh-hub-archive-agent-notes`](../dsh-hub-archive-agent-notes/SKILL.md) for
  a lifecycle change.

## Verify the plugin when behavior changed

A change to the panel, the store, the bridge, or the sort needs the running
plugin, not just the test run. Check the specific paths the diff reaches:

1. Install or reinstall the bundle, then **restart the Host process** if
   Host-side code changed — reinstalling does not reload a module Node has
   already resolved.
2. Refresh the page so the client module table is re-read.
3. Exercise the changed path: create, edit, delete, each view, each sort field
   and direction, each grouping option, docking to each edge, collapse and
   expand.
4. Exercise the failure paths the diff touches — a missing Remote carrier, an
   oversized image, a malformed `store.json` — and confirm each reports itself
   rather than degrading silently.

## What not to do

- Do not re-run a passing check because a commit or a push follows.
- Do not claim a panel behavior is verified when it was only reasoned about. Say
  which paths you actually exercised.
- Do not report a check you did not run. If a required verification was skipped,
  say so and say why.

## When a check fails

Stop and fix it, or explain the blocker. Do not hand over a change whose known
failure is unexplained — a failing test in a package this small is almost
always the actual bug.

If a failure looks environment-specific rather than real, prove it: record the
exact command and failing assertion, confirm the behavior independently, and
report the difference. Never adjust a test to match a defect it was written to
catch.
