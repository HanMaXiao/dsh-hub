/**
 * The single JSON document the Hub persists to (DESIGN §4).
 *
 * Five properties are load-bearing, and each one is why the store looks the
 * way it does:
 *
 * - **One document.** `list` reads it whole, so the encoded size is what every
 *   panel open costs. That is what makes `maxImageBytes` a real ceiling rather
 *   than a courtesy, and it is why there is nothing to reconcile.
 * - **Read once per change.** The parsed document is cached in-process against
 *   the stat of the file it came from, so a panel that lists on every render
 *   pays one parse per write instead of one per render. A stat that no longer
 *   matches re-reads, so a document changed anywhere else is never served
 *   stale.
 * - **One write at a time.** A write is read-modify-write, and only the whole
 *   of the three is safe: a caller holding a document read before another
 *   caller's write landed would put its own change on top of a stale copy and
 *   lose the other one. So every write refreshes, mutates and renames inside
 *   one lane, and the lane is per file rather than per store.
 * - **Atomic replace.** Every write goes to a sibling temp file and is then
 *   renamed over the target. A crash mid-write can leave a temp file behind,
 *   but it can never leave a half-written store where a whole one used to be.
 * - **Loud corruption.** A missing file is an empty store; an unreadable,
 *   unparseable or wrong-version one is a failure naming its path. Silently
 *   starting fresh would turn a one-byte recovery into permanent data loss the
 *   first time anything else went wrong.
 *
 * The document carries the status definitions beside the items (DESIGN §5.1):
 * the items say which status they are in, and the definitions say what that
 * status is called and whether it counts as finished. The two are stored
 * together because they are one fact — a list of items pointing at definitions
 * the document does not carry would have to be repaired on every read.
 *
 * The filesystem calls are synchronous on purpose, and the write lane is built
 * to fit that rather than around it: a write is synchronous end to end, so the
 * lane empties inside the caller's own turn and no caller is ever handed a
 * promise to await. `HubRemote` depends on that — it catches a *thrown* failure
 * and translates it into `hub/<reason>`, which a rejected promise would sail
 * straight past.
 */
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { newId, nowIso } from './ids.js'
import { applyPatch, ATTACHMENT_MIME_TYPES, HubValidationError, normalizeItem } from './model.js'
import { DEFAULT_STATUSES, describe, isPlainObject, normalizeStatus, normalizeStatuses } from './status.js'

/** Schema version of `<dataDir>/store.json`. Bump it with a migration. */
export const SCHEMA_VERSION = 1

/** File name inside `dataDir`; the store is exactly this and nothing else. */
export const STORE_FILENAME = 'store.json'

/**
 * A store that cannot be opened, or an id that is not there.
 *
 * Carried as a distinct type so the Remote can pick an error code without
 * pattern-matching on message text.
 */
export class HubStoreError extends Error {
  /**
   * @param message Operator-facing text naming the file or the id.
   * @param reason Machine-readable suffix.
   */
  constructor(message, reason) {
    super(message)
    this.name = 'HubStoreError'
    this.reason = reason
  }
}

/**
 * Resolve the directory that holds `store.json` (DESIGN §4).
 *
 * An empty `dataDir` is not "use the cwd": the store has to land in the
 * profile's own plugin-data directory or a synced folder would follow the
 * process around. A non-empty value is resolved so a relative path in the patch
 * means the same thing it would on any shell.
 *
 * @param configured The Config value; anything non-string is treated as unset.
 * @param env Environment to read `DSH_HOME` from.
 * @param home Fallback home directory.
 * @returns An absolute directory path.
 */
export function resolveDataDir(configured = '', env = process.env, home = os.homedir()) {
  const raw = typeof configured === 'string' ? configured.trim() : ''
  if (raw !== '') return path.resolve(raw)
  const root = typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim() !== ''
    ? env.DSH_HOME.trim()
    : path.join(home, '.dsh')
  return path.resolve(root, 'plugin-data', 'dsh-hub')
}

/** Reason string for a `fs` error, without the noisy absolute-path duplication. */
function reasonOf(error) {
  const reason = error instanceof Error ? error.message : String(error)
  return error?.code === undefined ? reason : `${error.code}: ${reason}`
}

/**
 * The one-line detail of a model failure, without the module prefix.
 *
 * The field is kept in front of it: a document that does not match the model
 * is worthless to whoever has to repair it, and the field is where the
 * repair starts.
 *
 * @param error Whatever the model layer threw.
 * @returns The detail to put in the store's message.
 */
function detailOf(error) {
  if (error instanceof HubValidationError) {
    return `${error.field} ${error.message.split(': ').slice(1).join(': ')}`
  }
  return reasonOf(error)
}

let tempCounter = 0

/**
 * The parsed documents this process holds, keyed by the file they came from.
 *
 * Each entry carries the stat key it was read at, so an entry is used only
 * while the file still looks exactly like it did. `mtime` plus size is the
 * cheapest pair that moves on every write; the residual case — two writes
 * inside one stat tick that also produce the same length — is closed by a
 * write re-seeding its own entry instead of trusting the next stat to notice.
 */
const documents = new Map()

/** The cache key one stat produces. */
function cacheKey(stats) {
  return `${stats.mtimeMs}:${stats.size}`
}

/** The document a store with no file at all starts from. */
function emptyDocument() {
  return { version: SCHEMA_VERSION, items: [], statuses: structuredClone(DEFAULT_STATUSES) }
}

/**
 * Read and validate the document at `file`.
 *
 * @param file Absolute path of the document.
 * @returns `{ version, items, statuses }` with every item in canonical form.
 * @throws {HubStoreError} naming `file` when the document exists but cannot be
 *   trusted.
 */
function readDocument(file) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  }
  catch (error) {
    throw new HubStoreError(
      `dsh-hub: the store at ${file} cannot be read (${reasonOf(error)}). Nothing has been overwritten; make it readable and restart the plugin.`,
      'unreadable',
    )
  }
  if (raw.trim() === '') {
    throw new HubStoreError(
      `dsh-hub: the store at ${file} is empty. Nothing has been overwritten; move the file aside to start over, or restore it from a backup.`,
      'corrupt',
    )
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  }
  catch (error) {
    throw new HubStoreError(
      `dsh-hub: the store at ${file} is not valid JSON (${reasonOf(error)}). Nothing has been overwritten; repair or move the file aside.`,
      'corrupt',
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HubStoreError(`dsh-hub: the store at ${file} must be a JSON object. Nothing has been overwritten.`, 'corrupt')
  }
  if (parsed.version !== SCHEMA_VERSION) {
    throw new HubStoreError(
      `dsh-hub: the store at ${file} declares version ${JSON.stringify(parsed.version ?? null)} but this build reads version ${SCHEMA_VERSION}. Nothing has been overwritten.`,
      'version',
    )
  }
  if (!Array.isArray(parsed.items)) {
    throw new HubStoreError(`dsh-hub: the store at ${file} has no items array. Nothing has been overwritten.`, 'corrupt')
  }
  // The definitions come first: an item's status is only meaningful against
  // the list it is read with, so the list has to be settled before the items
  // that point into it.
  const statuses = readStatuses(file, parsed)
  let items
  try {
    // No limits here on purpose: a ceiling or a media type that was legal when
    // the document was written must not make it unreadable now. Both govern
    // writes, which is the only moment the Host can still say no.
    items = parsed.items.map(item => normalizeItem(item, {}, new Date(), statuses))
  }
  catch (error) {
    throw new HubStoreError(
      `dsh-hub: the store at ${file} does not match the data model (${detailOf(error)}). Nothing has been overwritten.`,
      'corrupt',
    )
  }
  return { version: SCHEMA_VERSION, items, statuses }
}

/**
 * The status definitions a document carries.
 *
 * A document written before the enum existed has no list at all, and the
 * built-ins stand in until the next write persists them: the key is additive,
 * so no schema bump is owed. A list that is there and malformed is a different
 * thing — the document claims to carry definitions and cannot, so the mount
 * fails naming the path rather than guessing which definitions the items meant.
 *
 * @param file Absolute path of the document, named in the failure.
 * @param parsed The parsed document.
 * @returns The canonical definitions.
 * @throws {HubStoreError} naming `file` when the list cannot be trusted.
 */
function readStatuses(file, parsed) {
  if (parsed.statuses === undefined || parsed.statuses === null) {
    return structuredClone(DEFAULT_STATUSES)
  }
  try {
    return normalizeStatuses(parsed.statuses)
  }
  catch (error) {
    throw new HubStoreError(
      `dsh-hub: the store at ${file} does not match the data model (${detailOf(error)}). Nothing has been overwritten.`,
      'corrupt',
    )
  }
}

/**
 * The document cached for `file`, read and validated on a miss.
 *
 * @param file Absolute path of the document.
 * @returns The canonical document, or `undefined` when the file is not there.
 * @throws {HubStoreError} naming `file` when it exists but cannot be trusted.
 */
function cachedDocument(file) {
  let stats
  try {
    stats = statSync(file)
  }
  catch (error) {
    // A missing file is an empty store, which is the documented reading. Any
    // other stat failure is a store that cannot be read at all, and that is
    // the loud failure rather than a reason to fall back to an empty one.
    if (error?.code === 'ENOENT') return undefined
    throw new HubStoreError(
      `dsh-hub: the store at ${file} cannot be read (${reasonOf(error)}). Nothing has been overwritten; make it readable and restart the plugin.`,
      'unreadable',
    )
  }
  const key = cacheKey(stats)
  const cached = documents.get(file)
  if (cached !== undefined && cached.key === key) return cached.document
  const document = readDocument(file)
  documents.set(file, { key, document })
  return document
}

/** The files a write is currently in flight for. */
const writing = new Set()

/**
 * Run `write` in `file`'s lane, with no other write to that file in flight.
 *
 * The lane is a flag rather than a chain of promises because a write here is
 * synchronous end to end (see the module doc): it is raised and lowered inside
 * one turn, so nothing else can start while it is up and no caller is handed a
 * promise to await. A write that arrives while it is up is re-entrancy, and it
 * is refused by name rather than run inside the write in flight — nothing in
 * this store calls back into itself, so the only way here is a caller nesting
 * one write inside another's validation, and letting that through would rename
 * half a document over a whole one.
 *
 * @param file Absolute path of the document being written.
 * @param write The read-modify-write to perform: refresh, mutate, persist.
 * @returns Whatever `write` returned.
 * @throws {HubStoreError} `nested-write` when a write to the file is in flight.
 */
function inLane(file, write) {
  if (writing.has(file)) {
    throw new HubStoreError(
      `dsh-hub: a write to ${file} was started from inside another write to the same file; writes are serialised, so finish the one in flight first`,
      'nested-write',
    )
  }
  writing.add(file)
  try {
    return write()
  }
  finally {
    writing.delete(file)
  }
}

/**
 * Read-modify-write access to the Hub's durable state.
 */
export class HubStore {
  /**
   * @param options `{ dataDir, maxImageBytes }`. `maxImageBytes` caps the
   *   decoded size of one stored image; it is read from Config, never assumed.
   *   An absent or non-positive value disables the ceiling.
   */
  constructor({ dataDir, maxImageBytes } = {}) {
    this.dataDir = path.resolve(dataDir ?? resolveDataDir(''))
    this.file = path.join(this.dataDir, STORE_FILENAME)
    this.maxImageBytes = Number.isInteger(maxImageBytes) && maxImageBytes > 0 ? maxImageBytes : undefined
    // Loaded eagerly and thrown from the constructor: a store that cannot be
    // opened must fail the mount, not the first click half an hour later.
    this.document = this.load()
  }

  /** Limits handed to the model layer for every write. */
  get limits() {
    return { maxImageBytes: this.maxImageBytes, allowMimeTypes: ATTACHMENT_MIME_TYPES }
  }

  /**
   * Read and validate the document, through the in-process cache.
   *
   * @returns `{ version, items, statuses }` with every item in canonical form.
   * @throws {HubStoreError} naming `this.file` when the document exists but
   *   cannot be trusted.
   */
  load() {
    const cached = cachedDocument(this.file)
    // A clone, never the cached object itself: the store mutates its document
    // on every write, and a mutation that never reached the disk must not reach
    // the cache either.
    return cached === undefined ? emptyDocument() : structuredClone(cached)
  }

  /**
   * Re-read the document when the file changed underneath this store.
   *
   * A missing file is not a change to re-read. The document in hand is the last
   * one that was there and the next write puts it back, where reading the
   * absence as an empty store would drop every item the moment something
   * deleted the file. The three documented states still decide what a store
   * that *opens* on a missing file gets.
   *
   * @throws {HubStoreError} naming `this.file` when the file can no longer be
   *   trusted.
   */
  refresh() {
    const cached = cachedDocument(this.file)
    if (cached !== undefined) this.document = structuredClone(cached)
  }

  /**
   * Replace the document atomically.
   *
   * @throws {HubStoreError} naming `this.file` when the write cannot land. The
   *   previous document is still intact in that case.
   */
  persist() {
    const body = `${JSON.stringify(this.document, null, 2)}\n`
    try {
      mkdirSync(this.dataDir, { recursive: true })
    }
    catch (error) {
      throw new HubStoreError(`dsh-hub: the store directory ${this.dataDir} cannot be created (${reasonOf(error)})`, 'unwritable')
    }
    // Same directory, so the rename stays inside one filesystem and is atomic.
    // The counter keeps two writes in one millisecond from sharing a temp file.
    const temp = `${this.file}.${process.pid}.${++tempCounter}.tmp`
    try {
      writeFileSync(temp, body, { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, this.file)
    }
    catch (error) {
      try {
        unlinkSync(temp)
      }
      catch {
        // The rename may already have consumed it; a leftover temp file is
        // inert and the next write reuses the name anyway.
      }
      throw new HubStoreError(
        `dsh-hub: the store at ${this.file} could not be written (${reasonOf(error)}); the previous contents are untouched`,
        'unwritable',
      )
    }
    // Seeded with what was just written and keyed by the stat of the file that
    // is now there, so the next read is a hit rather than a re-parse of a
    // document this process already holds.
    try {
      documents.set(this.file, { key: cacheKey(statSync(this.file)), document: structuredClone(this.document) })
    }
    catch {
      // A stat that fails right after a successful rename leaves the cache
      // cold; the next read re-reads, which costs a little and loses nothing.
    }
  }

  /**
   * Every item, oldest first.
   *
   * Order is the stored order, which is creation order; the Client sorts.
   *
   * @returns Deep copies, so a caller cannot edit the store by mutating a result.
   */
  list() {
    this.refresh()
    return structuredClone(this.document.items)
  }

  /**
   * Every status definition, in the order the panel offers them.
   *
   * @returns Deep copies, so a caller cannot edit the store by mutating a result.
   */
  statuses() {
    this.refresh()
    return structuredClone(this.document.statuses)
  }

  /**
   * Validate and append one item.
   *
   * @param raw The candidate item.
   * @param now Injected clock.
   * @returns The stored item.
   */
  create(raw, now = new Date()) {
    return inLane(this.file, () => {
      this.refresh()
      const item = normalizeItem(raw, this.limits, now, this.document.statuses)
      this.document.items.push(item)
      this.persist()
      return structuredClone(item)
    })
  }

  /**
   * Merge a patch into a stored item.
   *
   * @param id The item's id.
   * @param patch The fields to change.
   * @param now Injected clock.
   * @returns The rewritten item.
   * @throws {HubStoreError} `not-found` when no item carries `id`.
   */
  update(id, patch, now = new Date()) {
    return inLane(this.file, () => {
      this.refresh()
      const index = this.indexOf(id)
      const item = applyPatch(this.document.items[index], patch, this.limits, now, this.document.statuses)
      this.document.items[index] = item
      this.persist()
      return structuredClone(item)
    })
  }

  /**
   * Delete one item.
   *
   * @param id The item's id.
   * @returns The item as it was, so the Client can offer an undo.
   * @throws {HubStoreError} `not-found` when no item carries `id`.
   */
  remove(id) {
    return inLane(this.file, () => {
      this.refresh()
      const index = this.indexOf(id)
      const [removed] = this.document.items.splice(index, 1)
      this.persist()
      return structuredClone(removed)
    })
  }

  /**
   * @param id The item's id.
   * @returns Its position in the document.
   * @throws {HubStoreError} `not-found`, naming the id that was asked for.
   */
  indexOf(id) {
    if (typeof id !== 'string' || id === '') {
      throw new HubStoreError(`dsh-hub: an item id must be a non-empty string, received ${JSON.stringify(id ?? null)}`, 'not-found')
    }
    const index = this.document.items.findIndex(item => item.id === id)
    if (index === -1) {
      throw new HubStoreError(`dsh-hub: no item with id ${JSON.stringify(id)}`, 'not-found')
    }
    return index
  }

  /**
   * Validate and append one status definition.
   *
   * The id is minted here rather than taken from the draft: the definitions
   * are the Host's bytes, and an id the Client chose could collide with one
   * the Host minted later.
   *
   * A new definition carries the user's own text, so it has no locale key to
   * fall back on and its label has to say something.
   *
   * @param raw The candidate definition.
   * @param now Injected clock.
   * @returns The stored definition.
   * @throws {HubValidationError} when the draft names nothing.
   */
  createStatus(raw, now = new Date()) {
    return inLane(this.file, () => {
      this.refresh()
      if (!isPlainObject(raw)) {
        throw new HubValidationError('status', `must be an object, received ${describe(raw)}`)
      }
      if (raw.label === undefined || raw.label === null || (typeof raw.label === 'string' && raw.label.trim() === '')) {
        throw new HubValidationError('label', 'is required and cannot be blank; a new status carries its own text')
      }
      const status = normalizeStatus({
        id: newId(now.getTime()),
        label: raw.label,
        tone: raw.tone,
        done: raw.done,
      }, 'status')
      this.document.statuses.push(status)
      this.persist()
      return structuredClone(status)
    })
  }

  /**
   * Change one status definition.
   *
   * A written label takes the text over from the locale key, so a definition
   * the user renames follows their language and one they leave alone follows
   * the application's.
   *
   * Flipping the terminal flag re-stamps the items carrying the definition:
   * a definition retired as "finished" would otherwise leave its items in the
   * finished log forever, ordered by a moment that no longer means anything.
   * The items' own `updatedAt` is left alone — the user edited the definition,
   * not the tasks.
   *
   * @param id The definition's id.
   * @param patch The fields to change: `label`, `tone`, `done` and `order`.
   * @param now Injected clock.
   * @returns The rewritten definition.
   * @throws {HubStoreError} `not-found` when no definition carries `id`.
   */
  updateStatus(id, patch, now = new Date()) {
    return inLane(this.file, () => {
      this.refresh()
      const index = this.statusIndexOf(id)
      if (!isPlainObject(patch)) {
        throw new HubValidationError('patch', `must be an object, received ${describe(patch)}`)
      }
      // The target is checked before anything is written, so a bad patch leaves
      // the document exactly as it was.
      if (patch.order !== undefined && patch.order !== null && !Number.isInteger(patch.order)) {
        throw new HubValidationError('order', `must be an integer index, received ${describe(patch.order)}`)
      }
      const current = this.document.statuses[index]
      const next = { ...current }
      if (patch.label !== undefined && patch.label !== null) {
        next.label = patch.label
        next.labelKey = ''
      }
      if (patch.tone !== undefined && patch.tone !== null) next.tone = patch.tone
      if (patch.done !== undefined && patch.done !== null) next.done = patch.done
      const status = normalizeStatus(next, 'status')
      this.document.statuses[index] = status
      if (status.done !== current.done) {
        this.restamp(status, now)
      }
      if (patch.order !== undefined && patch.order !== null) this.moveStatus(index, patch.order)
      this.persist()
      return structuredClone(status)
    })
  }

  /**
   * Delete one status definition.
   *
   * The last one cannot go: a TODO with no status has nowhere to sit. One
   * that items still carry cannot go either — moving those items silently
   * would be a data change the user did not ask for — so the message says
   * how many are in the way.
   *
   * @param id The definition's id.
   * @returns The definition as it was, so the Client can offer an undo.
   * @throws {HubStoreError} `not-found`, `last-status` or `in-use`.
   */
  removeStatus(id) {
    return inLane(this.file, () => {
      this.refresh()
      const index = this.statusIndexOf(id)
      if (this.document.statuses.length === 1) {
        throw new HubStoreError(
          `dsh-hub: the status ${JSON.stringify(id)} is the last one; the list cannot be emptied, because every TODO needs a status to be in`,
          'last-status',
        )
      }
      const inUse = this.document.items.filter(item => item.kind === 'todo' && item.status === id).length
      if (inUse > 0) {
        throw new HubStoreError(
          `dsh-hub: the status ${JSON.stringify(id)} is still carried by ${inUse} item${inUse === 1 ? '' : 's'}; move them to another status before deleting it`,
          'in-use',
        )
      }
      const [removed] = this.document.statuses.splice(index, 1)
      this.persist()
      return structuredClone(removed)
    })
  }

  /**
   * @param id The definition's id.
   * @returns Its position in the document.
   * @throws {HubStoreError} `not-found`, naming the id that was asked for.
   */
  statusIndexOf(id) {
    if (typeof id !== 'string' || id === '') {
      throw new HubStoreError(`dsh-hub: a status id must be a non-empty string, received ${JSON.stringify(id ?? null)}`, 'not-found')
    }
    const index = this.document.statuses.findIndex(status => status.id === id)
    if (index === -1) {
      throw new HubStoreError(`dsh-hub: no status with id ${JSON.stringify(id)}`, 'not-found')
    }
    return index
  }

  /**
   * Re-stamp the items carrying a definition whose terminal flag changed.
   *
   * An item that has just become finished and carries no stamp gets one; an
   * item that is no longer finished loses the stamp it had.
   *
   * @param status The definition, after the change.
   * @param now Injected clock.
   */
  restamp(status, now) {
    for (const item of this.document.items) {
      if (item.kind !== 'todo' || item.status !== status.id) continue
      item.completedAt = status.done ? (item.completedAt || nowIso(now)) : ''
    }
  }

  /**
   * Move a definition to another position in the list.
   *
   * The order is the order the panel offers the definitions in, and the Host
   * owns the array, so a target that fell outside the list is clamped rather
   * than refused: the list may have moved under the caller between the two
   * round trips, and a stale index is not a reason to fail the reorder.
   *
   * @param index The definition's current position.
   * @param order The target index, an integer.
   */
  moveStatus(index, order) {
    const statuses = this.document.statuses
    const target = Math.min(Math.max(order, 0), statuses.length - 1)
    const [moved] = statuses.splice(index, 1)
    statuses.splice(target, 0, moved)
  }
}
