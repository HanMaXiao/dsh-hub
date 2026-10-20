# Agent Note: Host file store and a single-file client

Status: implemented

## Problem

Two questions shaped this plugin before any feature did, and both were
settled by constraints the platform imposes rather than by preference.

The first is where the user's items live. The panel is a personal notebook: TODO
tasks, notes, and prompts that accumulate over months and hold images. It does
not sync, it has no accounts, and there is exactly one author — the person
running the application. Whatever backs it must be reachable without an account,
survive a browser profile being cleared, and be recoverable by hand when
something goes wrong. The obvious cheap answer, `localStorage`, satisfies none
of the third and one of the second.

The second is the shape of the client. The panel is a single React application
with three tabs, two views, three modals, an edge-docking shell, a grid
layout, and a query layer for search, filter, sort, and grouping. The instinct
that produced every good module boundary until now — split it — is unavailable:
a plugin client bundle cannot be split across files, so the entire question is
not "where do the boundaries go" but "how do you stay navigable inside one
file".

## Decision

### Durable data lives in one JSON document on the Host

`<dataDir>/store.json`, resolved by the Host and owned by the Host. `dataDir`
is a `Config` field: empty resolves to `$DSH_HOME/plugin-data/dsh-hub` and falls
back to `~/.dsh/plugin-data/dsh-hub` when `DSH_HOME` is unset; a non-empty
value is `path.resolve`d, so relocating the store is configuration, never code.

Writes go through a temp file and a rename, so a crash mid-write cannot
truncate the document. Reads distinguish three states deliberately: a missing
file is an empty store, an unreadable or malformed file is a **loud failure
naming the path**, and only the first is allowed to look like nothing having
happened. The document carries a schema version field. Every write is
validated on the Host, which rejects an unknown `kind`, `priority` or `status`
with a message naming the offending field.

Images and files are stored inline as base64 data URLs inside that one
document. `maxImageBytes` is a `Config` field (default 2 MiB) measured on the
**decoded** bytes, and it is a real ceiling rather than a courtesy: `list`
reads the whole document, so encoded size is what every panel open pays.

The split of ownership follows from this. The Host owns durable bytes,
validation, and atomic writes. The Client owns search, filter, sort, group, and
the grouping math — including item size, which is computed in `client.js` from
the item's own bytes rather than denormalised into the store, and the display
name, which is derived from the stored `title` and falls back to the first line
of the content (see
[the title note](../feature/2026-10-15-stored-title-with-derived-name.md)). The
Host stores a field, never a display decision. Nothing is mirrored between the
two: when the Client needs a value the Host does not send, the Host sends it,
and the Host never re-implements a query.

### `client.js` is one file

The client manifest requires the entry name to equal the package name, and the
package specifier to be a whole package name. One package therefore has exactly
one client entry, and the bundle cannot be assembled from several sources.
`client.js` is organised under banner comments in the order
[DESIGN.md §7](../../../../DESIGN.md) states: locale dictionaries, the SVG icon
set, the theme-token stylesheet, the Remote bridge, the panel store, the query
layer, components, and `apply(ctx)` with its single seat registration.

This is a protocol limitation, not a stylistic one, so it is stated here rather
than rediscovered. The countermeasure is navigational: banner comments, a
query layer that owns all of §6's comparison math in one readable block, and
components named for what they render.

The bridge constrains the rest. `host.call` and `styles.insert` are `cordis_run`
builtins and are not available to a `dsh.client` bundle, so the Typert Remote
in `remote.js` and `typert.js` is the only data path. The Client mounts its own
contribution through `ctx.remote.$mount()` and reads the namespace from
`ctx.get('remote.hub')` at call time on every use — the carrier can arrive
after first render and can vanish on unload. When it is absent the panel shows
a persistent failure state and never falls back to `localStorage`. The
reasoning behind that mount, and the neighbours it beat, are in
[the bridge note](../bug-fix/2026-10-15-client-remote-bridge-mount.md).

### Agent Notes are single-language by default

This repository's Agent Note pattern was extracted from DeepSeek Harness, where
every note requires a `.zh.md` counterpart and a checker enforces the pairing.
Here the counterpart is recommended, not mandatory: write one when the note
records a decision a Chinese-reading maintainer may have to defend, and skip it
for narrow factual records. The reasoning is in
[Alternatives considered](#alternatives-considered).

## Alternatives considered

**Store items in browser `localStorage`.** The cheap answer, and the one a
panel with no server-side state is assumed to use. It loses on recovery and on
honesty: the store is cleared by a browser profile reset, a "clear site data"
sweep, or a private window that simply goes away, and there is no copy anywhere
else. Worse, a client-side store invites a silent split-brain — the plugin would
have to keep working when the carrier vanishes, and the natural fallback is to
read whatever the browser still has, which is exactly the state that has
silently diverged from the real one. The panel shows a persistent failure
state instead, so a missing Remote is visible immediately rather than becoming
a puzzle after the user has typed data into a place that was about to be
erased.

**Store items through a Cordis storage service rather than an owner-local
file.** The harness provides non-session storage, and using it would have meant
one fewer place to own. It loses because it couples the data's home to the
composition that happens to be running: the store is meant to be copyable,
diffable, and movable by editing one `Config` field. A service-managed store
makes the location depend on profile configuration, and makes "back up your
notebook" a support conversation instead of a file copy. One document that
owns its own directory is worth more here than the abstraction is.

**Split `client.js` across several files.** The obvious refactor for a single
file of this size, and the one every instinct asks for. It is not available:
the client manifest's entry name must equal the package name and the specifier
must be a whole package name, so the bundle resolves exactly one file. This is
the reason the file is organised under banner comments instead — the module
boundaries still exist, as regions rather than files.

**Add a build step that bundles several client sources into `client.js`.** The
one way to have both a modular source tree and a single-file bundle. It loses
on the package's terms: `files` lists exactly what is in the tree, the Loader
imports the package from disk with no artifact pipeline, and a build would make
the published files diverge from the source on every commit that forgot to
rebuild. For a private single-package plugin that cost is paid constantly and
buys nothing that banner comments do not already provide.

**Store attachments as sidecar files beside `store.json`.** It would remove the
base64 inflation — roughly a third of every image's bytes — and stop each edit
from rewriting the entire document. It loses for v1 because the coupling between
an item and its images is what matters most: inline, a backup is one file and
an item can never be separated from the pictures it references, which is
exactly the failure a user cannot detect and cannot easily repair. The cost is
paid up front and legibly (`maxImageBytes` names the limit and the actual size
on rejection) rather than discovered later as missing files.

**Require a `.zh.md` counterpart for every Agent Note, as the source pattern
does.** Mandatory pairing plus a checker is how the source repository keeps a
large bilingual corpus from drifting. It loses here for a reason of scale and of
audience: this is one private plugin whose Agent Note corpus is a handful of
files, the notes are read by whoever is editing this plugin, and the content is
mostly paths, field names, and byte limits — facts that a translation would
duplicate without making them more usable. Forcing a twin would double the
write cost of every note to serve a reader who would not have read the English
one. The pairing stays *recommended*, so a note that does carry real rationale
can carry a Chinese twin; what is dropped is the obligation, not the
possibility.

## Consequences

- The whole notebook is one file. Back up, move, and inspect it with ordinary
  tools, and an item is never separated from its attachments.
- Encoded size is paid on every panel open, because `list` reads the entire
  document. `maxImageBytes` bounds that read, and it is measured on decoded
  bytes, so the document costs roughly a third more than the limit states.
- Every mutation rewrites the whole document. At the sizes v1 permits this is
  not the bottleneck; a store large enough for it to become one needs a
  different persistence design, not a bigger `maxImageBytes`.
- A malformed `store.json` is a visible, path-naming failure rather than a
  silent reset. Recovering means moving the file aside by hand; the data is not
  rebuilt automatically, on purpose.
- `client.js` will be a large file for the life of the plugin. Its navigability
  depends on discipline — banner comments, the query layer owning all comparison
  math in one block, and a short [dsh-hub-client-ui](../../../skills/dsh-hub-client-ui/SKILL.md)
  covering the judgment calls — not on a module system that will never arrive.
- The Client cannot own durability. Anything that must survive a refresh, a
  crash, or a cleared profile goes through the Remote to the Host, which means
  the panel cannot function at all when no composition carries the Remote. That
  is visible by design.
- Item size is computed in the Client on every sort, so a store with large
  attachments pays for it on each sort change; the Host stores no denormalised
  size to drift out of sync.

## Testing

`node --test` covers `lib/`: id generation, item validation including the
unknown-`kind` and unknown-`priority` rejections, and the atomic store's
missing, malformed, and round-trip behavior. The `client.js` half no longer has
no harness: `tests/client-panel.test.js` loads the bundle through a stub module
table and a minimal React and drives the panel through its flows, which is what
catches an undeclared identifier that `node --check` and a text-reading test both
pass over. The query layer's sort and grouping math is still exercised by driving
the panel rather than by importing it.

## Related

- [DESIGN.md](../../../../DESIGN.md) §3 — the bridge, §4 persistence, §6 sorting,
  §7 the single client file. This note owns the reasoning behind those sections,
  not their content.
- [Agent Note: a stored title, with the display name derived from
  it](../feature/2026-10-15-stored-title-with-derived-name.md) — owns the one
  field the Client derives its name from, added after this note was written.
- [Agent Note: the Client mounts its own Remote
  contribution](../bug-fix/2026-10-15-client-remote-bridge-mount.md) — owns the
  bridge's client half; the paragraph above is kept here because the bridge's
  existence was decided with the rest of this note.
- [dsh-hub-new-agent-note](../../../skills/dsh-hub-new-agent-note/SKILL.md) —
  the single-language rule stated above is applied there.
