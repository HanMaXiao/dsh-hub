# Agent Note: the Client mounts its own Remote contribution

Status: implemented

## Problem

The panel shipped showing a permanent failure state — `Hub 桥不可用`, with the
detail `ctx.get("remote")?.hub is not mounted` — while the Host half, the
manifest, the store and all 74 offline tests were correct. Nothing in the
package was wrong; the Client was reading the bridge through a shape the
platform never produces.

Two assumptions were wrong, and each one failed silently.

**The namespace was assumed to hang off the `remote` service.** The gateway's
client face does not do that. `ctx.remote.$mount()` installs each namespace as
its own traced Cordis service under `remote.<namespace>`
(`dsh-api-gateway/src/client/index.ts`, `remoteServiceKey`), and its module doc
says so outright: *no JavaScript Proxy participates in method lookup*. The
`remote` carrier carries `$mount`, `$stream`, `$host` and `$on` and nothing
else, so `ctx.get('remote')?.hub` is permanently `undefined`. The check the
plugin performs — "is a carrier there?" — was therefore true, and the read
beside it always failed.

**Discovery was assumed to be symmetric.** `dsh-typert-loader` discovers a
package's `./typert` export and registers it — on the **Host**. Its own
documented limitation is that no equivalent client-side discovery exists yet,
so a client runtime needs "an independent composition owner". In the shipped
base that owner is `@deepseek-ai/dsh-api-remotes`, a *generated* assembly whose
contribution list is a compile-time constant naming first-party packages. A
hand-written third-party bundle has to mount its own contribution, and the one
first-party bundle that does — `@deepseek-ai/dsh-experimental-client-ui-voice-input`,
for its `speech` namespace — calls `ctx.remote.$mount()` itself.

The second assumption is the one that made this expensive. Fixing only the
read would have moved the failure one line: `remote.hub` is a service that
nobody creates, because no contribution was ever mounted.

There is a third, smaller one the fix had to absorb: a mounted method does not
throw a business failure. It answers with a `RemoteResult<T>` envelope
(`{ok:true,value}` / `{ok:false,error}`), and carrier loss, cancellation and
every Host `RemoteError` all arrive in the `error` branch. Reading `.value`
without branching on `ok` turns a rejected write into a silent `undefined`.

A fourth assumption only opened the panel to expose. `$mount()` refuses to
install a method whose name already exists on the namespace service it just
created: `RemoteNamespaceService.assertMethodAvailable` rejects `ctx`, `empty`,
`invokeRemote`, `methods`, `name`, `namespace`, and anything already on
`RemoteNamespaceService.prototype` — which includes its own
`remove(kind, method, token)` helper. So `remove` cannot be a published method
at all, and the contribution was refused with
`client api: method "hub/remove" conflicts with its namespace service`. The
failure was loud only because the mount failure is reported rather than
swallowed; nothing about the roster had been wrong before that.

## Decision

`client.js` owns its half of the bridge, end to end.

It builds a **contribution** — `{ package: '@local/dsh-hub', descriptors }`
whose descriptors mirror `typert.js`'s invocations — and `apply(ctx)` awaits
`ctx.remote.$mount(CONTRIBUTION)` **before** registering the `shell.overlay`
seat, so the panel's first `list()` never races the namespace into existence.
Every call then reads `ctx.get('remote.hub')` fresh, and `hubCall` unwraps the
`RemoteResult`, throwing what the Host rejected with.

A refused mount is **remembered, not thrown**. `apply` swallows it and registers
the seat anyway, so the panel appears and names the reason. This keeps the
original rule — a missing bridge is a persistent, *visible* failure state —
true for the case where the bridge exists but refused us, which the old code
had no way to express. `inject` stays `['slots', 'locale']`: the entry always
mounts, and a parked fiber would have turned a reportable failure into an
invisible plugin.

The mount is not memoized on failure. Every later call retries, because that is
what the panel's retry button promises, and a refused contribution is cheap to
refuse again. An in-flight mount is joined rather than raced, because a second
`$mount` of the same package is rejected as a duplicate registration.

The delete publishes as **`delete`**, carried to the Host through
`implementation: 'remove'`. `lib/remote-surface.js` grows an optional
`implementation` field and an `implementationOf()` helper, so the wire name and
the service method stop being the same thing by accident: markers name what the
service exposes, the manifest publishes both, and `HubRemote.remove(id)` is
untouched.

The roster is **duplicated** — spelled out in `client.js` as well as generated
in `typert.js`. The browser module table serves one entry per package and cannot
reach `lib/` or `./typert`, so there is no import to share. This violates the
package's standing "nothing is mirrored" rule, deliberately and in exactly one
place: the wire contract, never a query and never business logic.
`tests/client-bridge.test.js` is the compensation — it reads `client.js` as
text and holds the mounted roster to `lib/remote-surface.js`, plus the
invariants that would otherwise only surface in a page.

## Alternatives considered

**Keep `inject: ['slots', 'locale']` and mount lazily on first use, racing the panel's first `list()`.** The smallest diff, and it drops the `await` from `apply`. It loses on the race: `HubPanelEntry`'s mount effect fires on first render, which can beat the mount promise, and the panel would show "bridge unavailable" for a healthy plugin until the user pressed retry. The failure would also be intermittent, which is the worst property a failure state can have. Awaiting the mount before the seat exists costs one microtask and makes the state deterministic.

**Throw out of `apply` when the mount is refused, and let the runtime's error surface report it.** The conventional shape, and the one the reference implementation effectively uses — a mount that fails hard should fail the entry. It loses against this plugin's one deliberate product rule: the panel must remain visible and say what is wrong. A rejected entry leaves the seat unregistered, so the user sees no handle at all, which is strictly less information than a red panel naming the refusal. The refusal is also frequently not fatal — a composition that gains `dsh-api-remotes` a moment later is exactly the case retry is for.

**Declare `inject: ['remote', ...]` and park a fiber on `remote.hub`, as the voice-input bundle does.** It types the namespace and guarantees the carrier. It loses on the same rule as above: `inject` names Cordis services, and a service the composition cannot satisfy parks the fiber *forever* — no error, no panel, no retry. Reading the carrier with `ctx.get` and reporting its absence keeps the failure in the panel where it can be read.

**Import the roster from `lib/remote-surface.js` into `client.js` via `dsh.client.external`.** It would remove the duplication outright. It is not available: `external` resolves a request to a dynamic bundle row or an exact static-table key, and this package's only row is `./client` itself — a row may not require itself. `lib/remote-surface.js` is also a Node ESM module, while the browser module system materializes CommonJS factories.

**Rename the delete everywhere to a name the namespace service does not own** — `removeItem`, say, on the roster, the class, the manifest and the client. It reaches the same place without the `implementation` indirection, and it is the change a reader would expect to see. It loses because `HubRemote.remove(id)` calls `store.remove(id)` and the whole Host side reads as "remove" in prose, tests and the receipt; renaming it for a *client-side* constraint puts a client limitation into the Host's vocabulary. `implementation` exists for exactly this — the gateway's own SRC-mode discovery emits `implementation` whenever the wire name and the marked method differ — so the divergence is stated once, in the roster, where both sides read it.

## Consequences

- The Client now holds a second copy of the wire contract. It is one list of
  method names and parameter names, and `tests/client-bridge.test.js` fails when
  it drifts from `lib/remote-surface.js`. A new Remote method means editing
  `lib/remote-surface.js` **and** `client.js`, or the suite goes red.
- A published method name is now constrained by the gateway's internals, and the
  constraint lives in code DSH ships rather than in this package. The reserved
  set is pinned in `tests/typert.test.js` with a note to re-derive it after a
  Harness upgrade; without that pin the next `remove`-shaped method would fail
  in the page and nowhere else.
- The wire name and the Host method can now differ, so a method marked on the
  class and a method published in the manifest are two different facts. The
  roster's `implementationOf()` is the one place that joins them, and
  `describeRemote` translates the receipt back so the operator's log still shows
  endpoint names.
- `client.js` grew by roughly a hundred lines, all of it in the bridge section,
  and `apply` is now `async`. Renaming the published method also moved
  `typert.js`, `remote.js` and `lib/remote-surface.js`, so **this change needs a
  Host restart**, not just a page refresh.
- The panel distinguishes three situations it previously collapsed into one:
  no carrier at all, a contribution the gateway refused (with the refusal
  message), and a carrier that vanished after a successful mount. Each shows
  its own reason. The second of those is what made the `remove` collision
  legible in seconds instead of hours.
- The same two assumptions were in the sibling bundle
  `dsh-prompt-optimize/client.js`, which read
  `ctx.get('remote')?.promptOptimize` and mounted nothing. It degrades silently
  there — the fallback path — which is why it never surfaced as a visible
  failure. It was fixed in the same change; its single method,
  `optimizeDraft`, is not a reserved name.
- The diagnostic that started all of this — a panel that shows a failure state
  naming a service key — is kept, and the key it now names is the real one.

## Testing

`node --test` runs 85 tests. `tests/client-bridge.test.js` adds eight over the
bridge: roster parity with `lib/remote-surface.js`, self-mounting, the
`remote.<namespace>` service key, the delete published as `delete` over
`remove`, the descriptor fields `validateInvocation` requires, the envelope
unwrap, and the rule that a refused mount must not reject the entry.
`tests/typert.test.js` gains the reserved-name check and the
`implementation`-must-name-a-declared-method check.

They read `client.js` as text rather than importing it, because the file is a
browser bundle that calls `window.__ModuleLoader__` and keeps `CONTRIBUTION`
inside the factory closure. `tests/typert.test.js` reads `remote.js` the same
way — which, [the sibling note](2026-10-15-host-entry-declares-its-store.md)
shows, this bundle did not actually need: the protocol package and, through it,
Cordis both resolve offline.

## Related

- [DESIGN.md](../../../../DESIGN.md) §3 — the bridge contract this note
  implements; the note owns the reasoning, not the wording.
- [Agent Note: the Host entry declares the store it
  reads](2026-10-15-host-entry-declares-its-store.md) — the Host half of the
  same bridge, fixed right after this one: this note made the call reach the
  gateway, that one makes the service the gateway names exist.
- [Agent Note: Host file store and a single-file client](../architecture/2026-10-15-host-file-store-and-single-file-client.md)
  — owns the storage and single-file decisions this one refines. Its paragraph
  on the bridge described the read that turned out to be impossible; that
  sentence is corrected there and points here.
