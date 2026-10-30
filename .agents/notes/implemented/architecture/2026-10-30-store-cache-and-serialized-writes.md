# Agent Note: a cached read, a serialised write, and an attachment allowlist

Status: implemented

## Problem

Three defects lived in one layer, and each one was quiet.

**Every read paid for the whole document.** The store re-read and re-parsed
`store.json` — and re-normalised every item in it — each time it was asked for
anything. The panel lists on mount and after every mutation, and the document
it lists is the heavy one this package chose: attachments ride inside it as
base64 data URLs, so the parse scales with every image ever stored. A store
that only its own writes change was paying a full read per call.

**The read-modify-write was unguarded.** A write refreshed the document,
mutated it and renamed it over the file, with nothing holding the three
together. Two stores over one file — or two writes interleaved across turns —
could each refresh, each mutate, and each rename a stale copy over the other's
item. The loser's item was not corrupted; it was simply gone, and nothing
anywhere said so.

**Any media type a picker could produce was accepted.** `image/svg+xml` came
in like a PNG. An SVG is an XML document that can carry a `<script>`, an
`onload` handler and a reference to something else, and the store keeps every
attachment inline in the one document the panel renders from — so a picked
file becomes content the panel is asked to display. That is a different class
of "bad byte in the store" from an oversized image: the ceiling costs
performance, this one costs the user's machine.

## Decision

### Read once per change

The parsed document is cached in-process, keyed by the **stat of the file it
was read from** — `mtime` plus size, the cheapest pair that moves on every
write. A matching key is served from the cache; a mismatching one re-reads, so
a document changed anywhere else is never served stale. The three documented
read states are untouched: a missing file is an empty store, an unreadable or
malformed one is a loud failure naming the path.

A **write re-seeds its own cache entry** with the stat of the file that is now
there, rather than trusting the next stat to notice. The residual case — two
writes inside one stat tick that also produce the same length — would
otherwise be served the pre-write document, which is the stale read this
change exists to remove.

A file that **vanishes under a running store** keeps the document in hand:
`refresh` treats a missing file as "nothing changed" rather than as an empty
store, because reading the absence as empty would drop every item the moment
something deleted the file. The next write puts the file back.

### One write at a time, per file

Every write — the four item methods and the status trio — runs its refresh,
mutate and persist inside **one lane per file**. The lane is a **flag, not a
chain of promises**, and that is the load-bearing detail: a write here is
synchronous end to end, so the lane is raised and lowered inside the caller's
own turn and no caller is ever handed a promise to await. `HubRemote` depends
on that shape — it catches a *thrown* failure and translates it into
`hub/<reason>`, which a rejected promise would sail straight past.

A write that arrives while the lane is up is re-entrancy, and it is **refused
by name** (`nested-write`) rather than run inside the write in flight:
nothing in this store calls back into itself, so the only way there is a
caller nesting one write inside another's validation, and letting that through
would rename half a document over a whole one.

### Attachments are raster-only, and the gate is writes-only

`ATTACHMENT_MIME_TYPES` admits `image/png`, `image/jpeg`, `image/gif` and
`image/webp` — nothing else. It travels with the store's other limit through
`limits`, beside `maxImageBytes`, and it is read **only on the write path**,
exactly as the ceiling is: a document written before the list existed must not
be locked out of its own store by a rule that would have refused to write it.
A stored SVG still loads; a picked one is refused, naming the media type it
received.

The media type is read out of the **data URL header position only** — what
stands between `data:` and `;base64` — so a header carrying anything besides
the type and that marker is refused rather than interpreted. A declared `size`
is likewise only trusted after it agrees with the payload, because a Client
that miscounts would otherwise store a truncated image the user cannot
repair.

## Alternatives considered

**Serialise writes with a promise chain — a queue of pending writes per
file.** The standard shape for "one write at a time", and the one a reader
expects to find. It loses on this store's own contract: writes are
synchronous end to end, so a chain would hand every caller a promise to
await, and `HubRemote` translates a *thrown* failure into `hub/<reason>` — a
rejected promise sails straight past that catch and turns a refused write
into an `undefined` the Client cannot report. The flag also names re-entrancy
(`nested-write`) instead of quietly running a nested write inside the
in-flight one, which would rename half a document over a whole one.

**Key the cache on the file's content — a hash — rather than its stat.**
Self-invalidating, with no residual case to patch. It loses on the only job
the key has: deciding whether the file changed *requires reading the file*,
which is the exact cost the cache exists to avoid. mtime plus size is the
cheapest pair that moves on every write, and the one residual case is closed
by the write re-seeding its own entry instead.

**Let the stat alone notice a write, with no re-seed.** Simpler, and the
cache stays a pure read-through. It loses on the same residual case: the key
is unchanged, so the next read is served the pre-write document — the store
would answer from a copy that no longer exists on disk, which is the stale
read the whole change is about. Seeding the entry from what was just written
costs one stat and makes the next read a hit.

**Enforce the media allowlist on reads too, so a store carrying an SVG fails
loudly.** Symmetric with the write gate, and the safer-looking choice. It
loses on the same terms as enforcing `maxImageBytes` on reads: it would lock
the user out of a document that was legal when it was written, turning a
hardening into data loss. Both gates govern writes — the only moment the
Host can still say no.

**Sanitize or sandbox an SVG instead of refusing it.** It keeps vector
attachments working, which is what a user with a logo actually wants. It
loses because the store is not a renderer: an attachment is stored as bytes
and displayed by whatever opens the document, so "safe" would have to hold
for every consumer, present and future. Refusing one media type is a failure
the user can act on — export a PNG — where a stored script is not a state
anyone recovers from.

**Move the allowlist into the Client's file picker and call it done.** The
picker already filters, so the gate would cost no Host code at all. It loses
because a filter is a convenience, not a boundary: the Host is the only half
that owns the bytes, and any other writer — an older panel, a hand-edited
file, a future feature — walks straight through a picker. The picker's filter
and the Host's gate are both there, and the Host's is the one that decides.

## Consequences

- A panel that lists on every render pays **one parse per write** instead of
  one per render. The document still crosses the bridge whole on every
  `list` — that cost is unchanged and is what `maxImageBytes` bounds — so
  this removes the Host-side re-read and re-parse, not the transfer.
- Two writes to one file can no longer lose each other's item **within one
  process**. The lane is per process and was always a single-writer document;
  two DSH processes pointed at one `dataDir` were never a supported shape and
  still are not — the atomic rename keeps such a document from ever being
  half-written, but the last writer still wins per write.
- A nested write is a named refusal (`nested-write`) with a sentence naming
  the file, rather than a silent interleave.
- A store whose file is deleted underneath it keeps serving its document and
  restores the file on the next write, instead of emptying itself.
- An SVG picked before this change still opens; one picked after is refused
  with the allowlist in the message. The read path admits anything a stored
  document carries, so an old store cannot become unreadable.
- The cache is one `Map` keyed by absolute path, and every entry carries the
  stat key it was read at; an entry is used only while the file still looks
  exactly like it did. The store hands out clones, so a mutation that never
  reached the disk cannot reach the cache either.

## Testing

`node --test` runs 228 tests. The ones about this change:

- `tests/store.test.js`: a repeated read is answered from the cache — the
  file is tampered with under a pinned mtime and the cached document is still
  served, while a fresh read sees the tamper; a document changed by another
  store is picked up on the next read; a file deleted under a running store
  keeps its items and the next write restores it; concurrent writes from two
  stores, and from one store, all land in the order asked for, with no temp
  file left behind; a write started inside another write is refused with
  reason `nested-write` and leaves nothing behind; a media type outside the
  allowlist is refused naming it, and a stored SVG still loads.
- The oversize message naming both the limit and the actual size is pinned in
  the same file; it predates this change and is re-asserted here because the
  allowlist now travels beside it through the same `limits`.

## Related

- [DESIGN.md](../../../../DESIGN.md) §4 persistence — this note owns the
  reasoning behind the cache, the lane and the allowlist; the section states
  the contract.
- [Agent Note: Host file store and a single-file
  client](../architecture/2026-10-15-host-file-store-and-single-file-client.md)
  — owns the decisions this note refines rather than reverses: the one
  document, the atomic replace, the inline attachments and the
  `maxImageBytes` ceiling are all unchanged. Its account of read cost is
  refined here — the document still crosses the bridge whole on every
  `list`, but the Host no longer re-reads and re-parses it per call — and
  that note was not edited by this change; this note is the authority on the
  cache and the lane.
- [Agent Note: the Client mounts its own Remote
  contribution](../bug-fix/2026-10-15-client-remote-bridge-mount.md) — owns
  the bridge whose envelope the lane's synchronous-throw contract protects:
  a thrown store failure is what reaches `hubCall` as `hub/<reason>`, and a
  rejected promise would pass its catch by.
