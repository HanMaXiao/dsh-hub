/**
 * The status enum a TODO carries (DESIGN §5.1).
 *
 * Completion used to be one bit an item owned. It is now a member of a list the
 * user curates: a status names a state, says which colour paints it, and says
 * whether an item in it counts as finished. The definitions are durable bytes
 * beside the items, so the Host owns them exactly as it owns an item — there
 * is no second copy of the list anywhere, and nothing here is left for the
 * Client to derive.
 *
 * This module is the lower of the two layers. It owns the shape of a status,
 * the Host's validation error and the vocabulary both layers raise it with;
 * `lib/model.js` builds items on top of it and re-exports the error, so every
 * existing import path keeps working. The dependency runs one way — items
 * import statuses, never the reverse — because a status can be read without
 * the item model, and the item model can be reworked without rewriting a
 * stored status.
 *
 * Three decisions are worth stating:
 *
 * - **A status is identified by its id, not by its label.** The label is the
 *   user's text and may change at any moment; the id is what an item stores.
 *   A rename therefore never has to rewrite the items, and an item can never
 *   come to point at a name that has since been reused for something else.
 * - **The terminal flag is the only place completion is decided.** The item's
 *   old `done` boolean is gone, so "finished" and "carries a completion stamp"
 *   cannot drift apart: one flag, read by one rule.
 * - **A status names itself one way or the other.** A label may be empty, but
 *   only when a locale key stands in for it, and a status carrying both would
 *   have two answers to the question "what is this called".
 */

/**
 * The tones a status may be painted with.
 *
 * The names are the Host's; the colour tokens they map to belong to the
 * Client's stylesheet (DESIGN §8.3). A tone is fixed vocabulary rather than a
 * setting, so the list is closed.
 */
export const TONES = Object.freeze(['neutral', 'info', 'brand', 'success', 'warn', 'danger', 'muted'])

/** The status a new TODO starts in when nothing says otherwise. */
export const DEFAULT_STATUS_ID = 'pending'

/**
 * The definitions a document without a list of its own starts from.
 *
 * They carry a locale key rather than a label, so an untouched definition
 * follows the application's language (DESIGN §5.1). The list is frozen because
 * it is the default every store starts from: a caller that edits it would
 * change the built-ins for every other caller in the process.
 */
export const DEFAULT_STATUSES = Object.freeze([
  { id: 'pending', label: '', labelKey: 'status.pending', tone: 'neutral', done: false },
  { id: 'doing', label: '', labelKey: 'status.doing', tone: 'info', done: false },
  { id: 'done', label: '', labelKey: 'status.done', tone: 'success', done: true },
  { id: 'failed', label: '', labelKey: 'status.failed', tone: 'danger', done: false },
  { id: 'onhold', label: '', labelKey: 'status.onhold', tone: 'warn', done: false },
  { id: 'cancelled', label: '', labelKey: 'status.cancelled', tone: 'muted', done: true },
].map(status => Object.freeze(status)))

/**
 * A rejected write.
 *
 * `field` is kept separately from the message because the Remote turns it into
 * an error code, and a caller fixing a form needs the path, not a sentence.
 */
export class HubValidationError extends Error {
  /**
   * @param field Dotted path of the offending field, e.g. `attachments[0].size`.
   * @param reason What was expected and what arrived, without the field name.
   */
  constructor(field, reason) {
    super(`dsh-hub: ${field} ${reason}`)
    this.name = 'HubValidationError'
    this.field = field
  }
}

/**
 * Describe a received value for an error message.
 *
 * Strings are quoted because the offending value is almost always a typo in an
 * enum, and `"urgent!!"` says far more than `string`.
 *
 * @param value The rejected value.
 * @returns A short inline description.
 */
export function describe(value) {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  if (value === undefined) return 'nothing'
  return typeof value
}

/**
 * Tell a plain object from everything else.
 *
 * An array and a null are the two payloads that pass a `typeof` check and are
 * not objects the model can read fields off.
 *
 * @param value The candidate.
 * @returns Whether it is a plain object.
 */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read the status id: a non-empty string, trimmed. */
function readId(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HubValidationError(field, `must be a non-empty string, received ${describe(value)}`)
  }
  return value.trim()
}

/**
 * Read the status label.
 *
 * Empty is allowed here: a definition the user never renamed carries a locale
 * key instead, and the rule that decides whether the status names anything at
 * all is the pair's, not the label's.
 */
function readLabel(value, field) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    throw new HubValidationError(field, `must be a string when present, received ${describe(value)}`)
  }
  return value.trim()
}

/**
 * Read the status locale key.
 *
 * Empty is the Host's way of saying "there is none", the same convention the
 * item model uses for an optional text field: a definition the user renamed
 * gives the key up, and the key is still there to be read.
 */
function readLabelKey(value, field) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    throw new HubValidationError(field, `must be a string when present, received ${describe(value)}`)
  }
  return value.trim()
}

/** Read the tone: one of the closed set, `neutral` when it is not given. */
function readTone(value, field) {
  if (value === undefined || value === null) return 'neutral'
  if (!TONES.includes(value)) {
    throw new HubValidationError(field, `must be one of ${TONES.join('|')}, received ${describe(value)}`)
  }
  return value
}

/** Read the terminal flag: a boolean, `false` when it is not given. */
function readDone(value, field) {
  if (value === undefined || value === null) return false
  if (typeof value !== 'boolean') {
    throw new HubValidationError(field, `must be a boolean, received ${describe(value)}`)
  }
  return value
}

/**
 * Normalise one status into the DESIGN §5.1 shape.
 *
 * The shape is five fields and every one of them has a default, so a caller
 * that only wants a name gets a usable definition back. `labelKey` is `''`
 * when there is no locale key, the same convention the item model uses for an
 * optional text field: a definition the user renamed gives the key up, and
 * the key is still there to be read.
 *
 * The two refusals are about the text: a status that names nothing cannot be
 * shown, and a status that names itself twice has no single answer to "what
 * is this called".
 *
 * @param raw The received status.
 * @param field Dotted path used in the error, e.g. `statuses[0]`.
 * @returns The canonical `{ id, label, labelKey, tone, done }`.
 */
export function normalizeStatus(raw, field = 'status') {
  if (!isPlainObject(raw)) {
    throw new HubValidationError(field, `must be an object, received ${describe(raw)}`)
  }
  const id = readId(raw.id, `${field}.id`)
  const label = readLabel(raw.label, `${field}.label`)
  const labelKey = readLabelKey(raw.labelKey, `${field}.labelKey`)
  if (label === '' && labelKey === '') {
    throw new HubValidationError(`${field}.label`, 'is empty and there is no labelKey to fall back on, so the status names nothing')
  }
  if (label !== '' && labelKey !== '') {
    throw new HubValidationError(`${field}.labelKey`, 'and label both carry text; a status names itself one way or the other')
  }
  return {
    id,
    label,
    labelKey,
    tone: readTone(raw.tone, `${field}.tone`),
    done: readDone(raw.done, `${field}.done`),
  }
}

/**
 * Normalise a whole list of statuses.
 *
 * The ids have to be unique: an item stores one, so two definitions sharing
 * one would make "the status of this item" depend on which of them the reader
 * happened to meet first.
 *
 * @param list The received list.
 * @param field Dotted path used in the error.
 * @returns The canonical statuses, in the order they were received.
 */
export function normalizeStatuses(list, field = 'statuses') {
  if (!Array.isArray(list)) {
    throw new HubValidationError(field, `must be an array, received ${describe(list)}`)
  }
  const seen = new Set()
  return list.map((entry, index) => {
    const status = normalizeStatus(entry, `${field}[${index}]`)
    if (seen.has(status.id)) {
      throw new HubValidationError(`${field}[${index}].id`, `repeats the id ${describe(status.id)}, which already names another status`)
    }
    seen.add(status.id)
    return status
  })
}

/**
 * Find one status by its id.
 *
 * @param statuses The status list.
 * @param id The id to look for.
 * @returns The status, or `undefined` when no definition carries that id.
 */
export function statusById(statuses, id) {
  if (!Array.isArray(statuses)) return undefined
  return statuses.find(status => status.id === id)
}

/**
 * Whether an item in this status counts as finished (DESIGN §6.1).
 *
 * An id no definition carries is not terminal: a TODO cannot be sitting in a
 * status that does not exist, and a store that answered otherwise would call
 * an unknown state finished.
 *
 * @param statuses The status list.
 * @param id The status id.
 * @returns Whether the status is terminal.
 */
export function isTerminal(statuses, id) {
  const status = statusById(statuses, id)
  return status !== undefined && status.done === true
}

/**
 * The status a new TODO starts in.
 *
 * The definition named `pending` is the one the panel offers first; when the
 * user has retired it, the list's own first definition takes over, because a
 * TODO with no status has nowhere to sit (DESIGN §5.1).
 *
 * @param statuses The status list.
 * @returns The id to use, or `''` when there is no status at all.
 */
export function defaultStatusId(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return ''
  const preferred = statusById(statuses, DEFAULT_STATUS_ID)
  if (preferred !== undefined) return preferred.id
  return statuses[0].id
}
