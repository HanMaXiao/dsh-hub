# Agent Note: the Host entry declares the store it reads

Status: implemented

## Problem

With the bridge fixed on both sides, the first `hub/list` reached the gateway and
came back `active Service "hub" is unavailable`. The manifest was registered,
the namespace mounted, the call was well formed — the service it named was
simply not there.

It had never been there. `host.js` provides the store and starts the Remote in
the same `apply`:

```js
ctx.effect(() => ctx.provide(STORE_KEY, store), 'dsh-hub: JSON store')
ctx.effect(() => { const dispose = ctx.plugin(HubRemote); … }, 'dsh-hub: Hub Remote')
```

and that order does not work, because Cordis does not make a service readable
the instant it is provided:

- `Context.provide` is implemented as `this.ctx.fiber.effect(() => { …register… })`;
- `Context._getImpl` returns nothing when `impl.fiber.state !== 2` — a provided
  service whose fiber has not reached ACTIVE counts as absent.

While the entry fiber is still starting, `HubRemote`'s constructor read
`ctx.get('hub-store')`, got `undefined`, and threw. The throw landed in the
Remote's own fiber, so the row stayed **ACTIVE**, `describeRemote` reported
`mounted: false`, and nothing anywhere said why. The gateway only noticed at
the first call, in the browser, one layer above the cause.

Two things made this survive as long as it did.

The offline suite never imported the Host half. `tests/typert.test.js` says so
outright — `remote.js` imports `@deepseek-ai/dsh-typert-protocol`, "a package
that exists only inside the Harness". For **this** bundle that is false: the
package is installed in `dsh-hub/node_modules`, and `@deepseek-ai/cordis`
resolves through it, exactly as the sibling bundle's offline suite already
does. The excuse was believed and cost the one test that would have caught it.

The receipt that named the problem never printed. `host.js` called
`ctx.logger?.info?.(...)`. Cordis throws on a service *property* read the
plugin did not declare in `inject`, `hub-core` declares none, and a throw inside
`ctx.effect` is swallowed. So the line the README tells operators to look for
had never existed — the diagnostic pointed at a message that could not appear.

## Decision

`HubRemote` declares what it reads: `static inject = [STORE_KEY]`. Cordis parks
a fiber whose `inject` is unmet and starts it once the dependency is live, which
is the only ordering here that works and does not depend on a call sequence
staying as written.

`host.js` keeps its two effects, because the effect *is* the ownership boundary:
unloading the row withdraws the Remote and forgets the store. It gains two
things. The receipt is written from `remote.then(...)` rather than synchronously,
so it describes a mounted service instead of a parked one. And the logger is
read with `ctx.get('logger')` instead of `ctx.logger`, so the line appears at
all — and a Remote that fails to mount logs its reason instead of leaving the
operator with a working-looking plugin and no data.

`tests/host-entry.test.js` mounts the **real** entry on a real `Context` and
asserts what the gateway asserts: that `ctx.get('hub')` is an object and that
`list()` answers.

## Alternatives considered

**Start the Remote on a later tick, or await the provide before plugining.** It keeps the class free of a dependency declaration and is the shape that reads as obvious. It replaces a real ordering rule with a timing one: the delay that makes it pass today is not a contract, so the next refactor that moves a line reopens it — and nothing fails when it does, because a plugin fiber's throw is invisible from outside.

**Pass the store into the Remote instead of providing it as a service** — construct the store in `apply` and hand it to a subclass or a factory. It removes the ordering question outright, which is its real appeal. It loses the thing `hub-store` exists for: `remote.js` stays a leaf that never imports `host.js`, and `describeRemote`/`contributions` still describe two services a caller can inspect. Trading a declarative dependency for a hand-wired constructor also moves the failure to whoever forgets to pass it — a silent `undefined` store instead of a parked fiber that starts on its own.

**Let the entry fail when the Remote cannot mount.** A failed row is louder than an ACTIVE row with a missing service. It loses for this plugin: the client bundle is served from the same entry, and a failed entry risks taking the panel's registration with it — turning a diagnosable "no data" into an invisible plugin.

**Assert `hub` exists without importing `host.js`,** by reading the source as text the way the other tests do. It would have caught the missing `static inject`. It cannot catch the actual failure mode, which is what Cordis does at runtime; a regex over `static inject` only proves the word is present.

## Consequences

- `remote.js` and `host.js` changed, so this needs a **Host restart**, not a
  page refresh — the same requirement as the bridge work, and for the same
  reason.
- The Host half is now importable offline, which means `tests/typert.test.js`
  and the older claim about the protocol package being Harness-only are both
  wrong about this bundle. The remaining text-reading tests stay: `client.js` is
  a browser bundle and genuinely cannot be imported.
- `tests/host-entry.test.js` costs a real `Context` and a temp store directory
  per test. It is the only place in this package that exercises Cordis, and it
  is the only thing that would have caught this.
- The receipt is now trustworthy enough to quote in a README. It was not before:
  the documented check was pointing at a line that could never be printed.
- A parked `HubRemote` is the intended state when `hub-store` is missing, so
  "the row is ACTIVE" no longer implies "the Remote is mounted". Anything
  asserting the latter must check the service or the receipt.

## Testing

`node --test` runs 91 tests. Five of them mount the real entry on a real
`Context`: the entry starts and the store is live, the `hub` service exists and
`list()` answers, `HubRemote.inject` names the store, the receipt is written once
after the Remote settles and reports wire method names, and the protocol reads
back a marker per published method. A sixth asserts the complement — a
`HubRemote` started without its store stays inactive and publishes nothing,
which is what `static inject` is for.

## Related

- [DESIGN.md](../../../../DESIGN.md) §3 — the bridge contract; this note owns
  the Host entry's half of it.
- [Agent Note: the Client mounts its own Remote
  contribution](2026-10-15-client-remote-bridge-mount.md) — the client half of
  the same bridge, fixed in the same session. Read together: that one made the
  call reach the gateway, this one makes the service the gateway names exist.
