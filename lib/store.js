/**
 * The single JSON document the Hub persists to (DESIGN §4).
 *
 * Three properties are load-bearing, and each one is why the store looks the
 * way it does:
 *
 * - **One document.** `list` reads it whole, so the encoded size is what every
 *   panel open costs. That is what makes `maxImageBytes` a real ceiling rather
 *   than a courtesy, and it is why there is nothing to reconcile.
 * - **Atomic replace.** Every write goes to a sibling temp file and is then
 *   renamed over the target. A crash mid-write can leave a temp file behind,
 *   but it can never leave a half-written store where a whole one used to be.
 * - **Loud corruption.** A missing file is an empty store; an unreadable,
 *   unparseable or wrong-version one is a failure naming its path. Silently
 *   starting fresh would turn a one-byte recovery into permanent data loss the
 *   first time anything else went wrong.
 *
 * The filesystem calls are synchronous on purpose. Read-modify-write has to be
 * serialised or two panel writes in one tick lose one of the two changes, and
 * a mutex costs more indirection than the few milliseconds a rename costs here.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyPatch, HubValidationError, normalizeItem } from './model.js'

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

let tempCounter = 0

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
    return { maxImageBytes: this.maxImageBytes }
  }

  /**
   * Read and validate the document.
   *
   * @returns `{ version, items }` with every item in canonical form.
   * @throws {HubStoreError} naming `this.file` when the document exists but
   *   cannot be trusted.
   */
  load() {
    let raw
    try {
      raw = readFileSync(this.file, 'utf8')
    }
    catch (error) {
      if (error?.code === 'ENOENT') return { version: SCHEMA_VERSION, items: [] }
      throw new HubStoreError(
        `dsh-hub: the store at ${this.file} cannot be read (${reasonOf(error)}). Nothing has been overwritten; make it readable and restart the plugin.`,
        'unreadable',
      )
    }
    if (raw.trim() === '') {
      throw new HubStoreError(
        `dsh-hub: the store at ${this.file} is empty. Nothing has been overwritten; move the file aside to start over, or restore it from a backup.`,
        'corrupt',
      )
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    }
    catch (error) {
      throw new HubStoreError(
        `dsh-hub: the store at ${this.file} is not valid JSON (${reasonOf(error)}). Nothing has been overwritten; repair or move the file aside.`,
        'corrupt',
      )
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new HubStoreError(`dsh-hub: the store at ${this.file} must be a JSON object. Nothing has been overwritten.`, 'corrupt')
    }
    if (parsed.version !== SCHEMA_VERSION) {
      throw new HubStoreError(
        `dsh-hub: the store at ${this.file} declares version ${JSON.stringify(parsed.version ?? null)} but this build reads version ${SCHEMA_VERSION}. Nothing has been overwritten.`,
        'version',
      )
    }
    if (!Array.isArray(parsed.items)) {
      throw new HubStoreError(`dsh-hub: the store at ${this.file} has no items array. Nothing has been overwritten.`, 'corrupt')
    }
    let items
    try {
      // No `maxImageBytes` here on purpose: lowering the ceiling must not make
      // an existing, previously legal store unreadable. The ceiling governs
      // writes, which is the only moment the Host can still say no.
      items = parsed.items.map(item => normalizeItem(item))
    }
    catch (error) {
      const detail = error instanceof HubValidationError ? `${error.field} ${error.message.split(': ').slice(1).join(': ')}` : reasonOf(error)
      throw new HubStoreError(
        `dsh-hub: the store at ${this.file} does not match the data model (${detail}). Nothing has been overwritten.`,
        'corrupt',
      )
    }
    return { version: SCHEMA_VERSION, items }
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
  }

  /**
   * Every item, oldest first.
   *
   * Order is the stored order, which is creation order; the Client sorts.
   *
   * @returns Deep copies, so a caller cannot edit the store by mutating a result.
   */
  list() {
    return structuredClone(this.document.items)
  }

  /**
   * Validate and append one item.
   *
   * @param raw The candidate item.
   * @param now Injected clock.
   * @returns The stored item.
   */
  create(raw, now = new Date()) {
    const item = normalizeItem(raw, this.limits, now)
    this.document.items.push(item)
    this.persist()
    return structuredClone(item)
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
    const index = this.indexOf(id)
    const item = applyPatch(this.document.items[index], patch, this.limits, now)
    this.document.items[index] = item
    this.persist()
    return structuredClone(item)
  }

  /**
   * Delete one item.
   *
   * @param id The item's id.
   * @returns The item as it was, so the Client can offer an undo.
   * @throws {HubStoreError} `not-found` when no item carries `id`.
   */
  remove(id) {
    const index = this.indexOf(id)
    const [removed] = this.document.items.splice(index, 1)
    this.persist()
    return structuredClone(removed)
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
}
