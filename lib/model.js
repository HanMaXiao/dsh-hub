/**
 * The Host half of the data model (DESIGN §5).
 *
 * This module owns every durable byte decision: what an item is, which fields
 * it may carry, and what a caller is told when a payload is wrong. The Client
 * owns search, sort, group and size (DESIGN §6), so nothing here computes a
 * display name or a byte total — those are derived views, and duplicating them
 * here is how two halves start disagreeing.
 *
 * Normalisation is total: every function either returns the canonical shape
 * described in DESIGN §5 or throws {@link HubValidationError}. A partially
 * fixed-up item never reaches the disk, because a store that silently drops a
 * bad field is indistinguishable from one that lost it.
 *
 * The status definitions themselves live in `lib/status.js`, the layer below:
 * a TODO stores the id of one definition, and "finished or not" is answered by
 * that definition's terminal flag rather than by a second field that could
 * disagree with it (DESIGN §5.1). The dependency runs one way, so the item
 * model can be reworked without rewriting a stored status.
 */
import { isIsoTimestamp, newId, nowIso } from './ids.js'
import {
  DEFAULT_STATUSES,
  defaultStatusId,
  describe,
  HubValidationError,
  isPlainObject,
  isTerminal,
  statusById,
} from './status.js'

/** The three kinds the panel's three tabs own. */
export const KINDS = ['todo', 'note', 'prompt']

/** TODO priorities, ordered low to high; the Client's sort uses this order. */
export const PRIORITIES = ['low', 'normal', 'high', 'urgent']

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * The Host's validation error, re-exported from the layer below.
 *
 * The class lives in `lib/status.js` because both layers raise it and that
 * module may not import from here; every existing import path keeps working.
 */
export { HubValidationError }

/**
 * Render a byte count so a human can act on it.
 *
 * The exact count is always kept alongside the rounded one: at the 2 MiB
 * default, an overshoot of a few hundred kilobytes rounds to the same "2.0 MiB"
 * as the limit, and the two numbers must stay distinguishable in the message.
 *
 * @param bytes A byte count.
 * @returns e.g. `3.0 MiB (3145728 bytes)`.
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB (${bytes} bytes)`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB (${bytes} bytes)`
}

/**
 * The ids the store's status list carries.
 *
 * @param statuses The status definitions.
 * @returns The accepted ids, in the order the panel offers them.
 */
function statusIds(statuses) {
  return statuses.map(status => status.id)
}

/**
 * The terminal status a legacy `done: true` maps to.
 *
 * The definition named `done` is the one the old boolean meant, so it wins
 * when it is there; a user who retired it leaves the first terminal
 * definition to carry the meaning instead.
 *
 * @param statuses The status definitions.
 * @returns The id, or `''` when no definition is terminal.
 */
function terminalStatusId(statuses) {
  const named = statusById(statuses, 'done')
  if (named !== undefined && named.done) return named.id
  const first = statuses.find(status => status.done)
  return first === undefined ? '' : first.id
}

/**
 * The status a TODO carries.
 *
 * An item written before the enum existed carries a boolean instead, and the
 * two are mapped here rather than migrated: the old flag says only whether
 * the task was finished, so it can choose between a terminal status and the
 * default one and nothing finer. The mapping is the read path's, so a
 * document that predates the enum reads as the equivalent document that has
 * one.
 *
 * @param raw The received item.
 * @param statuses The status definitions the id is checked against.
 * @returns The status id to store.
 */
function todoStatusId(raw, statuses) {
  // The legacy flag is read even when a status is present: a payload carrying
  // a malformed one is a defect in a field the Host is about to interpret.
  const legacy = raw.done === undefined || raw.done === null
    ? null
    : booleanField(raw.done, 'done', false)
  if (raw.status !== undefined && raw.status !== null) {
    return enumField(raw.status, statusIds(statuses), 'status')
  }
  if (legacy === true) return terminalStatusId(statuses) || defaultStatusId(statuses)
  return defaultStatusId(statuses)
}

/**
 * Read a required, non-blank string field.
 *
 * @param value The received value.
 * @param field Dotted path used in the error.
 * @param fallback Supplied when the caller omitted the field entirely.
 * @returns The string, unchanged except for trimming.
 */
function requiredText(value, field, fallback) {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'string') {
    throw new HubValidationError(field, `must be a string, received ${describe(value)}`)
  }
  if (value.trim() === '') throw new HubValidationError(field, 'is required and cannot be blank')
  return value.trim()
}

/** Read an optional string field; anything non-string is a defect, not a default. */
function optionalText(value, field) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    throw new HubValidationError(field, `must be a string when present, received ${describe(value)}`)
  }
  return value
}

/**
 * Read the item's title.
 *
 * Optional, and trimmed: a blank title is a meaningful state rather than a
 * missing field, and it is what a document written before this field existed
 * reads as. The Client renders an untitled item from the first line of its
 * content (DESIGN §6), so an absent title degrades to exactly what it showed
 * before — which is why this field is additive and needs no schema bump.
 *
 * @param value The received value.
 * @returns The trimmed title, `''` when absent.
 */
function titleText(value) {
  return optionalText(value, 'title').trim()
}

/**
 * Read the item's content: the body the title summarises.
 *
 * Optional, and trimmed. A short TODO is described by its title alone, so a
 * blank body is a meaningful state rather than a missing field — it is what an
 * item created from nothing but a title reads as (DESIGN §5). A non-string is
 * still a defect, because the field is part of the shape.
 *
 * @param value The received value.
 * @param field Dotted path used in the error, `description` or `text`.
 * @returns The trimmed content, `''` when absent.
 */
function contentText(value, field) {
  return optionalText(value, field).trim()
}

/**
 * Refuse an item that nothing names.
 *
 * Title and content are each optional, because the title summarises the
 * content and either may carry the whole item (DESIGN §5). An item with
 * *neither* is the remaining way to store no words at all: it would list as a
 * blank row, open as an empty dialog and read as a blank name in every sort,
 * so one of the two has to say something.
 *
 * @param title The normalised title.
 * @param content The normalised content.
 * @param contentField This kind's content field, named in the message.
 * @returns {void}
 */
function requireSomeContent(title, content, contentField) {
  if (title !== '' || content !== '') return
  throw new HubValidationError(
    'title',
    `and ${contentField} are both blank; an item needs at least one, because the title is what names it`,
  )
}

/** Read a boolean field with a default. */
function booleanField(value, field, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') {
    throw new HubValidationError(field, `must be a boolean, received ${describe(value)}`)
  }
  return value
}

/**
 * Read an optional ISO-8601 timestamp.
 *
 * Absent is not the same as wrong: a document written before this field existed
 * carries no value at all, and that is a state the shape defines rather than a
 * defect to reject. A value that *is* present and malformed is a defect — the
 * Client orders completed items by it, so a typo here would silently misfile
 * one.
 *
 * @param value The received value.
 * @param field Dotted path used in the error.
 * @param fallback Supplied when the caller omitted the field entirely.
 * @returns The timestamp, or `fallback`.
 */
function optionalTimestamp(value, field, fallback = '') {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || !isIsoTimestamp(value)) {
    throw new HubValidationError(field, `must be an ISO-8601 timestamp, received ${describe(value)}`)
  }
  return value
}

/**
 * Read an enum field and name both ends of the contract on failure.
 *
 * @param value The received value.
 * @param allowed The accepted values, in the order the message lists them.
 * @param field Dotted path used in the error.
 * @returns The value, once proven to be a member of `allowed`.
 */
function enumField(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new HubValidationError(field, `must be one of ${allowed.join('|')}, received ${describe(value)}`)
  }
  return value
}

/**
 * Decode a base64 data URL and measure it.
 *
 * The declared `size` is only trusted after it agrees with the payload: a
 * Client that miscounts would otherwise store a truncated image the user
 * cannot repair, because the panel would render it from `dataUrl` alone.
 *
 * @param dataUrl The received data URL.
 * @param field Dotted path used in the error.
 * @returns The media type and the decoded bytes.
 */
function decodeDataUrl(dataUrl, field) {
  if (typeof dataUrl !== 'string') {
    throw new HubValidationError(field, `must be a data URL string, received ${describe(dataUrl)}`)
  }
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || comma === -1) {
    throw new HubValidationError(field, 'must be a data URL of the form data:<mime>;base64,<payload>')
  }
  const parameters = dataUrl.slice('data:'.length, comma).split(';')
  const mime = parameters.shift()
  if (!parameters.includes('base64')) {
    throw new HubValidationError(field, 'must be base64-encoded, as in data:<mime>;base64,<payload>')
  }
  const payload = dataUrl.slice(comma + 1).replace(/\s/g, '')
  if (!BASE64.test(payload)) {
    throw new HubValidationError(field, 'carries a payload that is not valid base64')
  }
  return { mime, bytes: Buffer.from(payload, 'base64') }
}

/**
 * Validate one attachment or image entry.
 *
 * @param raw The received entry.
 * @param field Dotted path of this entry, e.g. `images[2]`.
 * @param limits `{ maxImageBytes }`; an absent limit disables the ceiling.
 * @returns The canonical `{ name, mime, size, dataUrl }`.
 */
function normalizeAttachment(raw, field, limits) {
  if (!isPlainObject(raw)) {
    throw new HubValidationError(field, `must be an object, received ${describe(raw)}`)
  }
  const name = requiredText(raw.name, `${field}.name`)
  const { mime, bytes } = decodeDataUrl(raw.dataUrl, `${field}.dataUrl`)
  if (mime === '') throw new HubValidationError(`${field}.dataUrl`, 'must declare a media type before the base64 marker')
  if (raw.mime !== undefined && raw.mime !== null && raw.mime !== mime) {
    throw new HubValidationError(`${field}.mime`, `must match the data URL media type, received ${describe(raw.mime)} but the data URL says ${describe(mime)}`)
  }
  if (limits.maxImageBytes !== undefined && bytes.length > limits.maxImageBytes) {
    throw new HubValidationError(
      `${field}.dataUrl`,
      `is ${formatBytes(bytes.length)}; the limit is ${formatBytes(limits.maxImageBytes)} set by maxImageBytes`,
    )
  }
  if (raw.size !== undefined && raw.size !== null) {
    if (!Number.isInteger(raw.size) || raw.size < 0) {
      throw new HubValidationError(`${field}.size`, `must be a non-negative integer byte count, received ${describe(raw.size)}`)
    }
    if (raw.size !== bytes.length) {
      throw new HubValidationError(`${field}.size`, `must be the decoded byte length of dataUrl, which is ${bytes.length}, received ${raw.size}`)
    }
  }
  return { name, mime, size: bytes.length, dataUrl: raw.dataUrl }
}

/** Validate an attachment array, defaulting to empty. */
function attachmentList(value, field, limits) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    throw new HubValidationError(field, `must be an array, received ${describe(value)}`)
  }
  return value.map((entry, index) => normalizeAttachment(entry, `${field}[${index}]`, limits))
}

/**
 * Normalise one item of any kind into the DESIGN §5 shape.
 *
 * **Dropping unknown fields is a decision, not an oversight.** The Host is the
 * sole owner of the durable shape, so an extra key is the Client's business:
 * a panel that sends a field this build has never heard of is a forward-
 * compatible superset, and failing the whole call over it would turn a harmless
 * extra key into a panel that cannot save anything. The canonical object built
 * below is what reaches the disk either way, so the dropped key cannot leak
 * into the store.
 *
 * The three exceptions are deliberate and are the only rejections that fire on
 * a well-formed-looking payload: an unknown `kind`, an unknown `priority`, and
 * an item whose title and content are both blank. DESIGN §5 requires the first
 * two to fail with a message naming the field, because there is no defensible
 * default for either — guessing `kind` files a note as a TODO, and guessing
 * `priority` files "urgent" as "normal". The third is the one state neither
 * field being optional can produce a sensible item from. Every other rejection
 * below is a *type* error in a field the shape does define.
 *
 * A payload that fails one of those three never reaches the disk, on a create
 * or on a load: normalisation is one function on both paths, and every stored
 * item passed the same rule that admitted it, so requiring a name cannot lock a
 * store that was written here out of its own data.
 *
 * @param raw The received item.
 * @param limits `{ maxImageBytes }`; omit `maxImageBytes` to load a store whose
 *   ceiling has since been lowered — the ceiling governs writes, not reads,
 *   because enforcing it on load would let a lowered ceiling lock a user out
 *   of data that was legal when it was written.
 * @param now Injected clock, so a create and its timestamps agree.
 * @param statuses The status definitions a TODO's `status` is checked against.
 * @returns The canonical item.
 */
export function normalizeItem(raw, limits = {}, now = new Date(), statuses = DEFAULT_STATUSES) {
  if (!isPlainObject(raw)) {
    throw new HubValidationError('item', `must be an object, received ${describe(raw)}`)
  }
  const kind = enumField(raw.kind, KINDS, 'kind')
  const id = raw.id === undefined || raw.id === null ? newId(now.getTime()) : requiredText(raw.id, 'id')
  const createdAt = raw.createdAt === undefined || raw.createdAt === null ? nowIso(now) : raw.createdAt
  if (!isIsoTimestamp(createdAt)) {
    throw new HubValidationError('createdAt', `must be an ISO-8601 timestamp, received ${describe(raw.createdAt)}`)
  }
  const updatedAt = raw.updatedAt === undefined || raw.updatedAt === null ? createdAt : raw.updatedAt
  if (!isIsoTimestamp(updatedAt)) {
    throw new HubValidationError('updatedAt', `must be an ISO-8601 timestamp, received ${describe(raw.updatedAt)}`)
  }

  const common = { id, kind, title: titleText(raw.title), createdAt, updatedAt }
  if (kind === 'todo') {
    const description = contentText(raw.description, 'description')
    requireSomeContent(common.title, description, 'description')
    const status = todoStatusId(raw, statuses)
    return {
      id: common.id,
      kind: common.kind,
      title: common.title,
      description,
      category: optionalText(raw.category, 'category'),
      priority: enumField(raw.priority ?? 'normal', PRIORITIES, 'priority'),
      status,
      // When it was finished, and only meaningful once it is: the Client orders
      // the finished half of the list by this, so an open item carrying one would
      // sort on a moment that has not happened. An item created already in a
      // terminal status has no stamp of its own, so it completes as it was
      // created.
      completedAt: isTerminal(statuses, status)
        ? optionalTimestamp(raw.completedAt, 'completedAt', common.createdAt)
        : '',
      attachments: attachmentList(raw.attachments, 'attachments', limits),
      note: optionalText(raw.note, 'note'),
      createdAt: common.createdAt,
      updatedAt: common.updatedAt,
    }
  }
  const text = contentText(raw.text, 'text')
  requireSomeContent(common.title, text, 'text')
  return {
    ...common,
    text,
    images: attachmentList(raw.images, 'images', limits),
  }
}

/**
 * Merge a patch into a stored item and re-normalise the result.
 *
 * `id`, `kind` and `createdAt` are provenance, not content: they are refused
 * rather than silently restored, because a Client that sends a new `kind` has a
 * bug that would otherwise show up much later as a mismatched tab. `title` is
 * content, so a patch may set it and omitting it leaves the stored title alone.
 *
 * @param existing The stored item.
 * @param patch The fields to change.
 * @param limits `{ maxImageBytes }` for the rewritten item.
 * @param now Injected clock.
 * @param statuses The status definitions the patch's `status` is checked against.
 * @returns The rewritten item.
 */
export function applyPatch(existing, patch, limits = {}, now = new Date(), statuses = DEFAULT_STATUSES) {
  if (!isPlainObject(patch)) {
    throw new HubValidationError('patch', `must be an object, received ${describe(patch)}`)
  }
  if (patch.id !== undefined && patch.id !== existing.id) {
    throw new HubValidationError('id', `is fixed at ${describe(existing.id)} and cannot be changed; received ${describe(patch.id)}`)
  }
  if (patch.kind !== undefined && patch.kind !== existing.kind) {
    throw new HubValidationError('kind', `is fixed at ${describe(existing.kind)}; create a new item of the other kind instead`)
  }
  if (patch.createdAt !== undefined && patch.createdAt !== existing.createdAt) {
    throw new HubValidationError('createdAt', `is fixed at ${describe(existing.createdAt)}`)
  }
  // `completedAt` is derived from the status rather than accepted from the
  // patch: the Host already stamps every other timestamp in this document, and
  // a Client-supplied one would be a second source for a durable fact.
  // Entering a terminal status stamps it, leaving one clears it, and a patch
  // that touches neither leaves it.
  const status = patchedStatusId(existing, patch, statuses)
  const completing = isTerminal(statuses, status) && !isTerminal(statuses, existing.status)
  const reopening = !isTerminal(statuses, status) && isTerminal(statuses, existing.status)
  return normalizeItem({
    ...existing,
    ...patch,
    id: existing.id,
    kind: existing.kind,
    createdAt: existing.createdAt,
    status,
    updatedAt: nowIso(now),
    completedAt: completing ? nowIso(now) : reopening ? '' : existing.completedAt,
  }, limits, now, statuses)
}

/**
 * The status a patched TODO ends up in.
 *
 * A patch may name a status outright. A patch from a Client older than this
 * build carries the old boolean instead, and it is mapped the way a stored
 * item's boolean is — so a stale panel still writes a completion rather than
 * silently dropping it. A patch that says neither leaves the stored status
 * alone.
 *
 * @param existing The stored item.
 * @param patch The fields to change.
 * @param statuses The status definitions the id is checked against.
 * @returns The status id the item ends up in.
 */
function patchedStatusId(existing, patch, statuses) {
  // The legacy flag is read even when a status is present: a payload carrying
  // a malformed one is a defect in a field the Host is about to interpret.
  const legacy = patch.done === undefined || patch.done === null
    ? null
    : booleanField(patch.done, 'done', false)
  if (patch.status !== undefined && patch.status !== null) {
    return enumField(patch.status, statusIds(statuses), 'status')
  }
  if (legacy === true) return terminalStatusId(statuses) || defaultStatusId(statuses)
  if (legacy === false) return defaultStatusId(statuses)
  return existing.status
}
