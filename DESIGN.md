# dsh-hub — Design Contract

Authoritative for every implementer. Read this file first; it outranks any
restatement of the requirement. Its two owners are fixed here so no fact lives
in two places:

| Concern | Sole owner |
|---|---|
| Durable bytes, validation, atomic writes | Host (`lib/`, `host.js`) |
| Search / filter / sort / group / grouping math | Client (`client.js` only) |

Nothing is mirrored between them. If the Client needs a value the Host does not
send, the Host sends it — the Host never re-implements a query.

## 1. Package

`@hanmaxiao/dsh-hub`, MIT, ESM, no build step, no TypeScript. `package.json`,
`cordis.patch.yml` and `icon.svg` are already written and are **owned by the
Lead** — read them, do not edit them.

Installed by one of four specs, all of which `plugin_manager` and the Plugins
page accept: a registry name, a git address, a tarball, or an absolute path.
**Renaming the package is a breaking install change** — the name is the client
manifest key, the Typert invocation id and the profile dependency, so a rename
means every installed profile reinstalls.

## 2. Seats

- `shell.overlay` (list, root scope, `replaceRisk: none`) — the docked panel.
  Register with a **fresh** id: `hub.panel`. Reusing a shipped id replaces that
  cell. The layer is click-through; the entry opts back into `pointer-events`.
  **This is the panel's only seat.**
- **Do not register `sidebar.panellist`.** Every row of that slot is a
  `layout.selectPanel(id)` route — `SidebarRoot` calls it unconditionally on
  click, and `LayoutController.selectPanel` throws for any id with no `main`
  keyed entry (`ui-layout/src/client/service.ts`). A panel that lives in
  `shell.overlay` has no main panel, so a row registered there is a
  crash-on-click button; absorbing the throw with a null-rendering `main` entry
  only trades the crash for a visible one-frame flash. §9's collapsed handle is
  the intended affordance and is always on screen, so the sidebar icon is
  omitted rather than worked around.
- **Two different `inject` fields — do not confuse them.** `package.json`'s
  `dsh.client.inject` lists *package names* and only orders module arrival; it
  belongs to the Lead's manifest and must not be touched. The client factory's
  returned `inject: ['slots', 'locale']` lists *Cordis services* and is what
  parks a fiber forever when the composition cannot satisfy it — so `remote`
  must never appear there. Read it with `ctx.get('remote')` and degrade when it
  is absent.

## 3. Host ↔ Client bridge

`host.call` and `styles.insert` are `cordis_run`-runner builtins, **not**
available to a `dsh.client` bundle. The only bridge is a **Typert Remote**:

- `remote.js` exports `HubRemote extends TypertRemoteService`, `SERVICE_KEY =
  'hub'`. `@Remote` markers are installed by hand through the protocol's public
  API — copy the `installRemoteMarker` / `installRemoteMarkers` technique from
  any hand-written Remote in the wild (this one was written against
  `dsh-prompt-optimize`'s `remote.js`) verbatim in shape, on a hand-built
  `{ private, static, name, addInitializer }` context.
- `HubRemote` declares `static inject = ['hub-store']`, and that is load bearing
  rather than decorative: `ctx.provide()` registers inside `ctx.fiber.effect()`,
  and `ctx.get()` reports a service whose fiber is not yet ACTIVE as absent, so
  a `HubRemote` started in the same `apply` as the provide reads nothing and
  throws in its constructor — while the row stays ACTIVE and the only symptom is
  `gateway/service-unavailable` at the first call. Registration order is not a
  substitute for the declaration.
- `host.js` writes its receipt after the Remote fiber settles and reads the
  logger with `ctx.get('logger')`: Cordis throws on a service property read a
  plugin did not declare in `inject`, and a throw inside `ctx.effect` is
  swallowed.
- `typert.js` is the matching manifest: `package` must equal the package name,
  and `invocations` must describe **exactly** the methods `remote.js` marks.
  The pass-through `codec` shape from `dsh-prompt-optimize/typert.js` is the
  proven zero-zod form; reuse it.
- **The gateway dispatches arguments positionally**, in the manifest's
  `parameters` order (`gateway/.../access.ts`), and `cancellation.parameter`
  must be declared **last** — it is appended after the declared parameters
  rather than being one of them. A manifest whose order disagrees with the
  service signature shifts every argument silently instead of failing. Keep
  the two files adjacent in review for that reason.
- **The Client mounts its own contribution.** `dsh-typert-loader` discovers a
  package's `./typert` export on the **Host** only, and the client-side mounts
  shipped in the base are the generated first-party ones inside
  `@deepseek-ai/dsh-api-remotes`. Nothing mounts a third-party package's
  namespace for it, so `client.js` calls `ctx.remote.$mount()` itself with a
  contribution mirroring `typert.js`. This is the technique
  `@deepseek-ai/dsh-experimental-client-ui-voice-input` uses for its `speech`
  namespace, and it must be awaited before the seat is registered so the first
  `list()` never races the namespace into existence.
- **The namespace is its own service, not a property of `remote`.** `$mount()`
  installs each namespace as a traced Cordis service under
  `remote.<namespace>`, so the panel reads `ctx.get('remote.hub')`. The
  `remote` carrier itself only ever carries `$mount`, `$stream`, `$host` and
  `$on`; `ctx.get('remote')?.hub` is always undefined. A refused mount is
  remembered and shown, never thrown out of `apply`, so the panel stays visible
  and reports the real reason.
- **A published name may not shadow the namespace service.**
  `RemoteNamespaceService.assertMethodAvailable` refuses a method that is one of
  `ctx`, `empty`, `invokeRemote`, `methods`, `name`, `namespace`, or that
  already exists on that class's prototype — which includes its own
  `remove(kind, method, token)` helper. So the delete is published as
  **`delete`** with `implementation: 'remove'`: the gateway dispatches through
  `descriptor.implementation ?? descriptor.method`, so the Host keeps `remove`.
- **A mounted call answers with an envelope.** Every method returns
  `RemoteResult<T>` — `{ ok: true, value }` or `{ ok: false, error }` — and does
  not throw a business failure, so `hubCall` unwraps it and throws what the Host
  rejected with. Only an assembly fault rejects.

## 4. Persistence

- `dataDir` Config field (already in `cordis.patch.yml` as `''`). Empty string
  resolves to `$DSH_HOME/plugin-data/dsh-hub`, falling back to
  `~/.dsh/plugin-data/dsh-hub` when `DSH_HOME` is unset. A non-empty value is
  `path.resolve`d.
- One JSON document, `<dataDir>/store.json`. Write via temp file + rename so a
  crash mid-write cannot truncate the store.
- Schema version field. Read a missing file as an empty store; read an
  unreadable or malformed one as a **loud failure** naming the path — never
  silently reset the user's data.
- Images and files are stored inline as base64 data URLs inside the document.
  This is a deliberate v1 simplification (one file, trivially backed up).
- **`maxImageBytes` is a Config field** (already in `cordis.patch.yml`, default
  `2097152` = 2 MiB), measured on the **decoded** bytes before encoding. It is a
  real ceiling, not a courtesy: `list` reads the whole document, so the encoded
  size is what every panel open pays. base64 inflates by about a third, so 2
  MiB decoded costs roughly 2.7 MiB in the store. The Host must reject an
  oversized image with a message naming both the limit and the actual size.

## 5. Data model

```
TODO   { id, kind:'todo', title, description, category, priority, done,
         completedAt, attachments:[{name,mime,size,dataUrl}], note,
         createdAt, updatedAt }
NOTE   { id, kind:'note',  title, text, images:[{name,mime,size,dataUrl}],
         createdAt, updatedAt }
PROMPT { id, kind:'prompt',title, text, images:[{name,mime,size,dataUrl}],
         createdAt, updatedAt }
```

`priority` is one of `low | normal | high | urgent`. `done` is a boolean.

**`completedAt` is an ISO timestamp owned by the Host, and it is derived from
`done` rather than accepted from a patch.** Finishing a TODO stamps it, reopening
clears it, and a patch that touches neither leaves it alone — so editing a
finished task does not restamp it and jump it to the top of the finished list.
An unfinished TODO carries `''` however it arrived, because a stamp on an open
task would order it by a moment that has not happened. Like `title` it is
additive — a document written before it existed reads as finished-at-unknown —
so it needs **no schema bump**, and it belongs in the §5 key list the Client
checks, which is what makes an older Host say so instead of dropping the field.
A TODO created already `done` completes as it was created.

**`title` is optional and stored, not derived.** It is trimmed, and an absent or
blank one is stored as `''` — a document written before the field existed reads
as an untitled item rather than as corruption, so adding it is additive and
needs **no schema bump**. `title` is content: a patch may set it, and omitting
it leaves the stored title alone. The display name is a *derived* view and stays
in the Client (see §6): it is the title when there is one, otherwise the first
line of the content. So an untitled item still reads well, and the panel never
forces a title on anyone.

**Content is optional, and the title is what carries it.** `description` and
`text` are trimmed like the title and an absent or blank one is stored as `''`:
the title *summarises* the content, so a short task is a title on its own and
forcing a body onto it would be inventing a second way of saying the same
thing. Both fields are content, so a patch may set or clear either. **One of the
two has to be non-blank** — an item with neither names nothing, lists as a blank
row and opens as an empty dialog — so that is the third rejection that fires on
a well-formed-looking payload, after an unknown `kind` and an unknown
`priority`. It is enforced on the read path too, which costs nothing: every
stored item passed the same rule that admitted it.

`create` **carries `kind` explicitly** — the Client always knows which tab the
draft came from, so there is nothing for the Host to infer, and a Host-side
guess would have to be a heuristic over field shapes. The Host fills `id`,
`createdAt` and `updatedAt`. `update` carries no `kind`: it is refused there.

The Host validates every write and rejects unknown `kind` or `priority` values
with an actionable message naming the offending field. Fields outside this
model are dropped rather than rejected; those two, plus an item whose title and
content are both blank, are the three rejections that fire on a
well-formed-looking payload, because none of the three has a defensible
default.

## 6. Sort — from 图一

Obsidian's sort menu: **one field + one direction + optional grouping**, each
radio-selected. It is *not* a comparator chain.

**Fields.** TODO: `名称` `修改日期` `类型`(→category) `大小` `创建日期`
`标记`(→priority). Note/Prompt: `名称` `修改日期` `大小` `创建日期`.

`名称` is the **derived** display name: the item's `title` when it has one,
otherwise the first line of its content. Sorting by it therefore sorts by the
title the user typed, and still orders an untitled item by what it says.

Obsidian's `作者` is **dropped** — no equivalent in this model. Do not render an
empty entry for it. Obsidian's `标题` is **no longer dropped**: it used to be the
same thing as `名称`, because `名称` was itself the first line of the body. Now
that a title is stored and editable (§5), the two are different facts — the field
the user edits, and the name derived for display — so the menu keeps `名称` and
the form carries `标题`.

**Direction.** `递增` / `递减`, ascending = name A→Z, date old→new, size
small→large, priority low→high. Descending inverts.

**Grouping.** `分组依据`: TODO → `无 / 类别 / 优先级`; Note & Prompt →
`无 / 含图片 / 纯文字`.

Obsidian's `完成状态` is **dropped from the TODO menu**: completion is no longer
something a menu arranges, it is the frame the list is built in — see *Regions*
below. Offering it would put a group header inside a region that is already one
completion state, which says the same thing twice.

**Tiebreak.** Every comparator ends with `createdAt` then `id` ascending, so
equal keys never reorder between renders.

**Size** is computed from the item's own bytes — title, content, note and
attachment bytes — and is computed in `client.js`; the Host does not store a
denormalised size. The title counts because it is stored bytes like any other.

### 6.1 Regions

A TODO is **open or finished**, and the two are never one list. The unfinished
half answers "what is left"; the finished half is a log of what was done. One
list sorted by whatever was picked buries an unfinished task among finished ones
and shows neither half whole.

- The split runs **before** search, filter, sort and grouping, so all four still
  apply *inside* each region rather than across the seam. Choosing `类别` groups
  each half by category.
- **The unfinished region follows the sort menu.** The finished region orders by
  `completedAt` descending — a log whose newest entry is not at the top is not a
  log — whatever the menu says. The menu is not contradicted quietly: it is the
  finished region that overrides, and `completedAt` is deliberately not one of
  the offered fields.
- A region with nothing in it is **not rendered at all**, so a filter that hides
  one side leaves no empty header behind, and the finished region appears at the
  moment there is something to put in it.
- Both regions start **folded**, showing their label and count. The counts are
  the point of the split, and a list that opens itself is the mixing it
  replaces. The choice is a presentation one, so it is persisted like `view`.
- A region **opens itself when something lands in it** — a finished task, or a
  new one. A task that moves while its region is shut has moved invisibly: the
  count would move and nothing else would, which reads as a miscount rather than
  as a task finishing.
- A folded region is `visibility: hidden` as well as collapsed, so its items are
  not left focusable and still announced.
- Note and Prompt have no `done`, so they render as **one unlabelled region**
  with no header and nothing to fold.

## 7. Client module — ONE file

`manifest.ts` states "Entry name == package name" and `exactPackageSpecifier`
accepts only a whole package name, so a `dsh.client` bundle **cannot** be split
across files. `client.js` is one file organised under banner comments:

1. locale dictionaries (zh + en)
2. SVG icon set — **no emoji anywhere**
3. theme-token stylesheet, rendered as a React `<style>` element
4. Remote bridge (the `$mount` contribution and `ctx.get('remote.hub')`)
5. panel store (`useReducer` + subscription)
6. query layer — search / filter / sort / group, owner of §6
7. components
8. `apply(ctx)` — the Remote mount and the one seat registration

React comes from the module table: `const React = require('react')`. Do **not**
`require` any Harness Client package — writing your own controls is required,
not optional.

## 8. Visual requirements

- **Empty state**: one prominent add button. Nothing else.
- **Loading**: two *distinct* skeletons — a card-grid skeleton and a row-list
  skeleton — each with an animated pulse. A shared skeleton is a defect.
- **Tab bar**: floating capsule, bottom-centred, three options.
- **Modals**: create, delete-confirm, and a detail modal whose top-right holds
  a copy button and a close button.
- **Completion lives on the item.** A TODO carries a checkbox at the trailing
  end of its card title row and of its list row, and the create and edit forms
  carry no completion control — a save must leave completion exactly as the
  checkbox left it. Reaching it through the detail dialog and the form's Confirm
  is four activations to flip one boolean.
- **Views**: grid and list, switchable, persisted, each with its own loading
  state.
- **Regions**: a TODO list is two collapsible regions, unfinished above finished
  (§6.1), each folded to its label and count until it has something to show.
- **Grid**: `repeat(auto-fill, minmax(min(100%, var(--hub-card-min)), 1fr))`
  plus a `ResizeObserver`, so the n×m layout follows the window.
- **Theme**: `ctx.get('theme')?.setTheme('light' | 'dark' | 'system')`
  only. Read it through `ctx.get()`, not `ctx.theme.` — the Cordis service proxy
  throws on a property read of a service the plugin did not declare, and
  `theme` is deliberately absent from `inject` for the same reason `remote` is.
  All colour is `--dsw-alias-*`; no literal colours outside the icon artwork.
  The app owns the three-state preference — the plugin never keeps a second one.
- **Every control is painted here.** A closed choice is a radio row, never a
  native `<select>`: its popup is rendered outside the page by the OS, in the
  OS's own colours, so in the dark theme it opens as a white list over a dark
  form. `color-scheme` does not reach it — `dsh-client-ui-layout` already
  projects the resolved scheme onto the document element and the popup stays
  light — and no `--dsw-alias-*` token reaches a surface this file does not
  paint. The `<input type="file">` is the one exception, and only its
  `::file-selector-button` is redrawn: the picker itself must stay the real one.
- **No emoji, no redundant prose.** Every affordance is an inline SVG with an
  `aria-label`.

### 8.1 Depth

Depth is carried by the **layer ladder**, not by stacked filled boxes.

- The panel surface is `--dsw-alias-bg-layer-2`; anything floating above it —
  the tab capsule, a menu, a dialog — is `--dsw-alias-bg-layer-3`. Never
  `bg-overlay` for the surface: that token is a *popup* plane, and in dark it
  is a mid grey, so a panel built on it comes out lighter than the cards
  punched into it.
- **Cards and rows carry no fill.** The plane is the background; a hairline is
  the edge; the fill arrives with the pointer. A uniform filled card on every
  row is the SaaS-card default this design exists to avoid.
- In the light theme every layer token is the same white, so the panel's own
  edge is carried by `--dsw-alias-border-l3` plus its shadow, and by nothing
  else. Drop it to a hairline and the panel dissolves into the page.
- One accent, two uses: the active tab pill and the leading bar on the hovered
  or focused item. Everything else is ink and hairlines.

### 8.2 Motion

Motion answers the hand. Every transition below is a reply to something the
pointer or the keyboard just did; there is no ambient animation in the panel.

| what | how |
|---|---|
| panel expand / collapse | surface rises and settles, 300ms `cubic-bezier(.22,.61,.36,1)` |
| region fold / unfold | `grid-template-rows` 0fr→1fr, **90ms** — under 100ms on purpose: a fold is the user confirming a click, not the panel performing a gesture, and slower reads as lag on the press |
| item hover / focus | fill, border and a 2px accent bar scaling in from the leading edge, 110ms |
| tab change | one indicator element translates between the three tabs, 190ms |
| menu open | scale `.97` → 1 from the trigger corner, 110ms |
| dialog open | scrim fades; the dialog rises 8px and scales `.975` → 1, 190ms |
| notice | rises from above the tab capsule, 190ms |
| press | `scale(.97)` on buttons, 110ms |
| list arrival | keyed items rise 5px, staggered 16ms per step, **capped at step 8** |

The stagger rides the keys rather than a timer: React mounts a new node only
when the content really changed, so a sort that merely reorders what is already
on screen stays still. `prefers-reduced-motion: reduce` removes every animation
and transition in the panel; no state depends on one to be legible.

## 9. Docking

Three edge anchors — **left / right / bottom**. Collapsed shows a slim handle
strip at the middle of its edge, and nothing else. Pointer entering *the handle*
— or a click — expands it; entering the rail around the handle does not, or a
7px strip down the whole window edge would open the panel under a pointer that
never went near it. Pointer leaving the rail plus a short idle delay collapses
it again. The chosen edge is persisted.

**There is no top anchor.** The application owns the top of its window: a
full-width, drag-enabled titlebar, and under it the conversation's own title row.
A rail there either lands inside the drag region, where the pointer never reaches
it, or — once cleared of that — covers the conversation's title. Both failures
are silent, so the edge is withdrawn rather than special-cased. A stored
`top` preference falls back to `right`, which is the next anchor in preference
order.

## 10. Language

All user-visible text routes through `ctx.locale.register` / `bind`. Both `zh`
and `en` dictionaries are required and must have identical key sets.
