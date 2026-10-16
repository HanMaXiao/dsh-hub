# AGENTS.md

`@hanmaxiao/dsh-hub` is a Cordis plugin: one floating panel that holds TODO,
Note and Prompt items. **[DESIGN.md](DESIGN.md) is the design contract and
outranks any restatement of it here.** Read it before changing anything. Two
owners are fixed there so no fact lives in two places:

| Concern | Sole owner |
|---|---|
| Durable bytes, validation, atomic writes | Host (`index.js`, `host.js`, `lib/`) |
| Search / filter / sort / group / grouping math | Client (`client.js` only) |

Nothing is mirrored between them. If the Client needs a value the Host does not
send, the Host sends it — the Host never re-implements a query.

## Repository layout

```
dsh-hub/
├── package.json      published ESM package: exports, files, dsh.bundle.patch, dsh.client — **Lead owns**
├── cordis.patch.yml  injects one `hub-core` row; config: dataDir, maxImageBytes — **Lead owns**
├── icon.svg          package icon — **Lead owns**
├── DESIGN.md         design contract (authoritative)
├── README.md         user-facing documentation
├── locale/
│   ├── zh.json       meta.title / meta.description for the Plugin Manager
│   └── en.json       same, identical key set
├── index.js          Host entry, exports apply(ctx, config)
├── host.js           mounts the disk store and the Remote; every resource through ctx.effect
├── remote.js         HubRemote — the Client's only data path
├── typert.js         Typert manifest mirroring remote.js exactly
├── client.js         all panel UI and interaction (one file, not splittable)
├── lib/              Host pure logic: id generation, item validation, atomic JSON storage
├── tests/            node --test coverage for lib/, the Host entry, the panel and the client bridge — repo-only, not in `files`
└── .agents/          Agent workflows and notes
```

`package.json`, `cordis.patch.yml` and `icon.svg` are owned by the Lead: read
them, do not edit them.

## Commands

```sh
node --test              # the only verification command; runs tests/
```

There is no build, no bundler, no typecheck and no lint stage. The package is
plain ESM that the Loader imports straight from disk, so a bug is caught by
`node --test` or by running the plugin — not by a compile step.

**Reload rules.** Node's ESM cache keys the module table by resolved URL, so a
Host-side change needs a **process restart**; reinstalling, changing a line id
or repointing `exports` does not reload it. A Client-side change needs only a
**page refresh**.

Run relevant checks before handing work over; see
[dsh-hub-pre-push-checks](.agents/skills/dsh-hub-pre-push-checks/SKILL.md).
Report only the commands actually run.

## Plugin rules

These are the constraints that actually bind this package. Each one has a
concrete reason; drop none of them for style.

- **Pure ESM, no build step.** Nothing in `files` is generated. Do not add a
  compile, bundle or transpile stage: the Loader reads these files as written,
  so a build would only guarantee that `files` disagrees with the tree.
- **`client.js` is one file and cannot be split.** The client manifest requires
  the entry name to equal the package name and the package specifier to be a
  whole package name, so a package has exactly one client entry. Organise the
  file with banner comments — locale, icons, theme stylesheet, remote bridge,
  store, query layer, components, `apply(ctx)` — instead of extracting modules.
- **Zero emoji, anywhere.** Every affordance is an inline SVG with an
  `aria-label`. No Unicode pictographs in copy, comments, commit messages or
  identifiers.
- **All colour is `--dsw-alias-*`.** No literal colour values outside the icon
  artwork. Font weight in feature CSS tops out at 500; verify every ink pair in
  both light and dark.
- **The application owns the three-state theme.** Call
  `ctx.theme.setTheme('light' | 'dark' | 'system')`; never keep a second theme
  preference. Two preferences eventually disagree.
- **Do not `require` a Harness Client package.** React comes from the module
  table (`const React = require('react')`); every control is written here.
- **One app, one seat: `shell.overlay` as `hub.panel`, and nothing else.** Use a
  **fresh** id — reusing a shipped id replaces that cell — and never append a
  second application tree to `document.body`.
- **There is no top edge, and that is load bearing.** The application owns the
  top of its window: a full-width, drag-enabled titlebar
  (`[data-windows-titlebar] .frame::before` — `inset: 0 0 auto`,
  `-webkit-app-region: drag`) and, below it, the conversation's own title row.
  A rail there either lands inside the drag region — where the pointer never
  reaches it, so hover-to-expand silently stops working on that edge alone — or,
  once cleared of it, covers the conversation's title. Neither raises an error.
  Withdrawing the edge beats special-casing it; a stored `top` preference falls
  back to `right` through the same `EDGES.includes` check the other preferences
  use. Read the other three edges' chrome off `--dsh-frame-chrome-top`, never a
  hardcoded offset.
- **Only the handle opens the panel.** `expand` lives on the handle, not on the
  rail. A left or right rail is the whole window height, so expanding on the
  rail's `pointerenter` opens the panel under a pointer that never touched the
  handle. `onPointerLeave` stays on the rail so moving from the handle into the
  panel does not start the idle countdown.
- **Left and right run their handle and surface along a row.** Top and bottom do,
  and the surface's `calc(100% - var(--hub-handle-open))` only means anything when
  the handle is its neighbour. A column stacks the two instead: the panel ends
  one handle-width short of the screen edge, and the handle's `align-self: center`
  — written for the cross axis — floats it into the middle of the panel.
- **Do not register `sidebar.panellist`.** Every row of that slot is a
  `layout.selectPanel(id)` route: `SidebarRoot` calls it unconditionally on
  click, and `LayoutController.selectPanel` throws for any id with no `main`
  keyed entry (`ui-layout/src/client/service.ts:73`). A panel living in
  `shell.overlay` has no main panel, so a row registered there is a
  crash-on-click button, and absorbing the throw with a null-rendering `main`
  entry only trades the crash for a one-frame flash. The collapsed handle from
  [DESIGN.md §9](DESIGN.md) is always on screen and is the intended affordance.
- **Two different `inject` fields.** `package.json`'s `dsh.client.inject` lists
  *package names* and belongs to the Lead. The client factory's returned
  `inject: ['slots', 'locale']` lists *Cordis services* and parks a fiber
  forever when the composition cannot satisfy it, so `remote` must never appear
  there. Read it with `ctx.get('remote')`.
- **The Client mounts its own Remote contribution.** `dsh-typert-loader`
  discovers a package's `./typert` export on the **Host** only, and the only
  client-side mounts in the base are the generated first-party ones inside
  `@deepseek-ai/dsh-api-remotes`. A hand-written bundle must call
  `ctx.remote.$mount()` itself with a contribution mirroring `typert.js`, the
  way `@deepseek-ai/dsh-experimental-client-ui-voice-input` does for `speech`.
  The roster is spelled out in `client.js` because the browser module table
  cannot reach `lib/` or `./typert`; `tests/client-bridge.test.js` is what keeps
  the two copies equal.
- **The namespace is a service, not a property.** The gateway installs each
  namespace as its own Cordis service under `remote.<namespace>`, so the panel
  reads `ctx.get('remote.hub')`. `ctx.get('remote')?.hub` is always `undefined` —
  that carrier only carries `$mount`, `$stream`, `$host` and `$on`. A mounted
  call returns `RemoteResult<T>` (`{ok:true,value}` / `{ok:false,error}`) and
  never throws a business failure.
- **A published method may not shadow the namespace service.** The gateway's
  `RemoteNamespaceService` owns `remove`, `install`, `has`, `empty`, `name`,
  `methods`, `namespace`, `invokeRemote` and `ctx`, and refuses to mount a
  method carrying any of those names — with
  `client api: method "hub/<name>" conflicts with its namespace service`.
  Where the wire name must differ from the service's own, declare
  `implementation` on the roster entry: the gateway dispatches through
  `descriptor.implementation ?? descriptor.method`. `remove` is reserved, so the
  delete publishes as `delete`.
- **The bridge is the Typert Remote and nothing else.** `host.call` and
  `styles.insert` are `cordis_run` builtins, unavailable to a `dsh.client`
  bundle. `remote.js` and `typert.js` describe exactly the same methods; a
  method marked on one and missing from the other fails manifest validation.
- **Re-read the carrier on every use, and refuse to hide a failed mount.**
  `ctx.get('remote.hub')` may arrive after first render and may vanish on
  unload. When it is absent the panel shows a persistent failure state; it never
  falls back to `localStorage` and never throws. A silent fallback would leave
  the user's data healthy-looking in a second place. A refused `$mount` is shown
  the same way and is **not** thrown out of `apply`: a rejected entry leaves the
  seat unregistered, and an invisible panel reports less than the message does.
- **No hardcoded tunables.** Deployment-varying choices are `Config` fields
  changeable from the bundle patch: `dataDir` and `maxImageBytes`. A `DEFAULT_*`
  constant is not configurability. Protocol constants and security invariants
  stay fixed.
- **Misconfiguration fails loud.** A missing file is an empty store; an
  unreadable or malformed one is a **failure naming the path**. Never silently
  reset the user's data — a silent reset is worse than a crash.
- **The Remote declares the store it reads.** `HubRemote` carries
  `static inject = ['hub-store']` and that declaration is load bearing:
  `ctx.provide()` registers inside `ctx.fiber.effect()`, and `ctx.get()` treats a
  service whose fiber is not yet ACTIVE as absent — so a `HubRemote` started in
  the same `apply` reads nothing, throws in its constructor, and leaves the row
  ACTIVE with no `hub` service at all. The only symptom is
  `gateway/service-unavailable` at the first call. Registration order is not a
  substitute for the dependency.
- **`ctx.get`, never `ctx.logger`.** Cordis throws on a service property read a
  plugin did not declare in `inject`, and this row declares none; a throw inside
  `ctx.effect` is swallowed, which cost the receipt line the README tells
  operators to look for.
- **User-visible text is locale-owned.** Route every string through
  `ctx.locale.register` / `bind`. Both dictionaries are required and must have
  identical key sets.
- **`title` is stored, `name` is derived.** The Host owns the optional,
  trimmed `title` (DESIGN §5); the Client derives the display and sort `name`
  from it, falling back to the first line of the content when it is empty
  (DESIGN §6). Never store a name, and never make the Host compute one: the
  fallback belongs to the same half that renders it. `title` is additive — a
  document written before it existed reads as untitled, so `SCHEMA_VERSION` does
  not move when it is added.
- **A dropped field is a Host that is behind, and it must be named.** The Host
  discards a field it does not recognise, by design (`lib/model.js`), so version
  skew loses data with no error at all. The Client owns the §5 key list it writes
  into items and checks it against what comes back on `list`: normalisation on
  the Host is total, so a **missing key** — as opposed to an empty one — means
  the running Host predates the field. Say so, name the field, and say to
  restart. Never let a save disappear into silence.
- **The sort menu is one field, one direction, optional grouping.** Read
  [DESIGN.md §6](DESIGN.md) before changing it. Obsidian's `作者` is
  **deliberately absent** — no model field backs it; do not render an empty
  entry for it. Obsidian's `标题` is **not** in the menu either, and now for the
  opposite reason: `标题` is the editable field and `名称` is derived from it, so
  a menu entry for each would be two names for one column. `完成状态` is gone for
  a third reason: completion is the frame the TODO list is built in
  ([DESIGN.md §6.1](DESIGN.md)), so a menu that arranges it would put a group
  header inside a region that already is one completion state. Every comparator
  ends with `createdAt` then `id` ascending, so equal keys never reorder between
  renders.
- **`completedAt` is the Host's, and is derived from `done`.** The finished
  region is ordered by it, which makes it a durable fact and puts it on the Host
  side of the ownership table beside `createdAt`. It is stamped when a TODO is
  finished and cleared when one is reopened, and is **never** accepted from a
  patch: a Client-supplied timestamp is a second source for a fact the store
  owns, and restamping a finished task on every edit would make it jump the
  finished list. Editing a finished TODO must leave it where it is.
- **An empty `catch` names the error and why** and keeps its `try` to one
  statement.
- **Comments stay local.** Do not restate code, expand unrelated comments or
  explain distant behavior. State the contract, the failure, the timing and the
  safe-use fact; link the rationale.
- **Files end with exactly one trailing newline.**

## Testing

`node --test` covers `lib/` (id generation, item validation, the atomic store)
and three files that need machinery to say anything:

- **`tests/host-entry.test.js`** mounts the **real** Host entry on a real Cordis
  `Context` and asserts the services the gateway resolves actually exist.
- **`tests/client-panel.test.js`** loads `client.js` through a stub module table
  and a minimal React, renders the panel, and drives create → open → edit →
  menus → dialogs. It exists because of one defect class nothing else here can
  see: the bundle is a function body, so an **undeclared identifier is valid
  syntax** — `node --check` passes, there is no lint stage, and a test that
  reads the file as text sees nothing wrong. The symptom is not a visible error
  either: React unmounts the entry, so the panel and its handle vanish and only
  a reload brings them back. It also asserts the two dictionaries carry
  identical key sets.
- **`tests/client-bridge.test.js`** holds the Client's duplicated Remote roster
  to `lib/remote-surface.js` plus the bridge's invariants; it reads `client.js`
  as text because those assertions are about the source's shape.

`@deepseek-ai/dsh-typert-protocol` and, through it, `@deepseek-ai/cordis`
resolve from this bundle's `node_modules`, so the Host half *is* importable here;
earlier notes saying otherwise were wrong about this bundle. Tests describe
behavior, not correctness — change obsolete behavior with its tests. Tests that
only verify a deleted behavior are not evidence that the deletion is complete.

## Agent Notes

Durable decision rationale lives in [`.agents/notes/`](.agents/notes/README.md)
as **Agent Notes**: the *why* and *what we gave up* that code and
[DESIGN.md](DESIGN.md) cannot carry. Write one for lasting rationale only;
mechanical and local edits are exempt, as are local UI presentation changes.
Never write one by editing an existing note into a different decision —
supersede it with a new note and cross-link both.

Process rules that survive here:

- [dsh-hub-new-agent-note](.agents/skills/dsh-hub-new-agent-note/SKILL.md) —
  when and how to write one.
- [dsh-hub-archive-agent-notes](.agents/skills/dsh-hub-archive-agent-notes/SKILL.md) —
  supersession and archival calibration.
- [dsh-hub-client-ui](.agents/skills/dsh-hub-client-ui/SKILL.md) — visual and
  seat rules for `client.js`.

## Editing these instructions

Edit `AGENTS.md` at the repository root; there is no symlinked copy. Keep each
rule self-contained while linking the authority instead of restating it: one
fact, one home. `DESIGN.md` outranks this file, and this file outranks the
Agent Notes.
