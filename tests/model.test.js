/**
 * Item validation and normalisation (DESIGN §5).
 *
 * Two properties matter more than the rest and are tested hardest: a bad
 * payload is rejected *naming the field*, and an item that comes back carries
 * exactly the fields §5 lists — no more, so the Client's view is derived from
 * a shape it can rely on.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPatch, ATTACHMENT_MIME_TYPES, formatBytes, HubValidationError, normalizeItem, PRIORITIES } from '../lib/model.js'
import { DEFAULT_STATUSES } from '../lib/status.js'

const AT = new Date('2026-10-15T02:04:15.123Z')

/** A data URL carrying exactly `bytes` bytes of known content. */
function dataUrlOf(bytes) {
  return `data:image/png;base64,${Buffer.alloc(bytes, 1).toString('base64')}`
}

/** Assert that `run` rejects with a `HubValidationError`, and return its message. */
function rejects(run, field) {
  let caught
  assert.throws(run, error => {
    caught = error
    return true
  })
  assert.ok(caught instanceof HubValidationError, `expected a HubValidationError, got ${caught}`)
  if (field !== undefined) assert.equal(caught.field, field)
  return caught.message
}

const todo = { kind: 'todo', description: 'ship the panel' }

test('a minimal TODO takes every §5 field and its documented defaults', () => {
  const item = normalizeItem(todo, {}, AT)
  assert.deepEqual(Object.keys(item).sort(), [
    'attachments', 'category', 'completedAt', 'createdAt', 'description', 'id',
    'kind', 'note', 'priority', 'status', 'title', 'updatedAt',
  ])
  assert.equal(item.kind, 'todo')
  assert.equal(item.title, '')
  assert.equal(item.description, 'ship the panel')
  assert.equal(item.category, '')
  assert.equal(item.priority, 'normal')
  assert.equal(item.status, 'pending')
  assert.equal(item.completedAt, '', 'an open TODO has not been finished, so it carries no stamp')
  assert.equal(item.note, '')
  assert.deepEqual(item.attachments, [])
  assert.equal(item.createdAt, '2026-10-15T02:04:15.123Z')
  assert.equal(item.updatedAt, item.createdAt)
})

test('a TODO stores a status and no completion boolean of its own', () => {
  // One completion fact, not two: the item says which status it is in, and
  // the status says whether that counts as finished (DESIGN §5.1).
  const item = normalizeItem({ ...todo, done: true }, {}, AT)
  assert.equal('done' in item, false, 'the boolean would be a second fact that could disagree with the status')
  assert.equal(item.status, 'done')
})

test('finishing a TODO stamps completedAt, and reopening clears it', () => {
  // The Host owns this stamp for the same reason it owns `createdAt`: the
  // Client orders the finished half of the list by it, and a Client-supplied
  // timestamp would be a second source for a durable fact.
  const open = normalizeItem(todo, {}, AT)
  const done = applyPatch(open, { status: 'done' }, {}, AT)
  assert.equal(done.status, 'done')
  assert.equal(done.completedAt, '2026-10-15T02:04:15.123Z')

  const again = applyPatch(done, { title: 'renamed' }, {}, AT)
  assert.equal(again.completedAt, done.completedAt,
    'editing a finished TODO must not restamp it or it jumps the finished list')

  const reopened = applyPatch(done, { status: 'pending' }, {}, AT)
  assert.equal(reopened.status, 'pending')
  assert.equal(reopened.completedAt, '', 'an open TODO carries no stamp, however it got there')
})

test('a patch cannot supply completedAt: the Host owns the stamp', () => {
  const done = applyPatch(normalizeItem(todo, {}, AT), { status: 'done' }, {}, AT)
  const patched = applyPatch(done, { completedAt: '2020-01-01T00:00:00.000Z' }, {}, AT)
  assert.equal(patched.completedAt, done.completedAt,
    'a Client-supplied timestamp is a second source for a fact the store owns')
})

test('the terminal flag of the status decides what finished means', () => {
  // `cancelled` is terminal and `failed` is not, so the definitions and not
  // their names are what separate the finished half of the list from the
  // unfinished one (DESIGN §6.1).
  assert.equal(normalizeItem({ ...todo, status: 'cancelled' }, {}, AT).completedAt, AT.toISOString())
  assert.equal(normalizeItem({ ...todo, status: 'failed' }, {}, AT).completedAt, '')
})

test('an open TODO carries no stamp however it arrived', () => {
  assert.equal(normalizeItem({ ...todo, status: 'doing', completedAt: '2026-10-15T02:04:15.123Z' }, {}, AT).completedAt, '')
})

test('a completedAt that is present but malformed is rejected', () => {
  // Absent is a state the shape defines — a document written before the field
  // existed has none — but a value that is there and wrong would silently
  // misfile one task in the finished list.
  const rejects = () => normalizeItem({ ...todo, status: 'done', completedAt: 'yesterday' }, {}, AT)
  assert.throws(rejects, /completedAt/)
  assert.equal(
    normalizeItem({ ...todo, status: 'done', completedAt: '2026-10-15T02:04:15.123Z' }, {}, AT).completedAt,
    '2026-10-15T02:04:15.123Z',
  )
})

test('an item written before the enum existed reads as the status its boolean meant', () => {
  const finished = normalizeItem({ ...todo, done: true }, {}, AT)
  assert.equal(finished.status, 'done', 'the boolean meant the terminal status named done')
  assert.equal(finished.completedAt, AT.toISOString(), 'an item that was already finished completes as it was created')

  const open = normalizeItem({ ...todo, done: false }, {}, AT)
  assert.equal(open.status, 'pending', 'a boolean that was not set means the default status')
  assert.equal(open.completedAt, '')
})

test('a legacy boolean maps onto the first terminal status when there is no done', () => {
  // A user who retired the definition named `done` leaves the first terminal
  // definition to carry the meaning instead.
  const statuses = DEFAULT_STATUSES.filter(status => status.id !== 'done')
  const item = normalizeItem({ ...todo, done: true }, {}, AT, statuses)
  assert.equal(item.status, 'cancelled')
})

test('a patch from a Client older than this build still writes a completion', () => {
  const open = normalizeItem(todo, {}, AT)
  const done = applyPatch(open, { done: true }, {}, AT)
  assert.equal(done.status, 'done')
  assert.equal(done.completedAt, AT.toISOString())

  const reopened = applyPatch(done, { done: false }, {}, AT)
  assert.equal(reopened.status, 'pending')
  assert.equal(reopened.completedAt, '')
})

test('a patch naming a status is taken over the legacy boolean', () => {
  const patched = applyPatch(normalizeItem(todo, {}, AT), { status: 'doing', done: true }, {}, AT)
  assert.equal(patched.status, 'doing')
  assert.equal(patched.completedAt, '', 'doing is not a terminal status, so nothing was finished')
})

test('a patch that says nothing about the status leaves the stored one alone', () => {
  const item = applyPatch(normalizeItem(todo, {}, AT), { status: 'doing' }, {}, AT)
  assert.equal(applyPatch(item, { title: 'renamed' }, {}, AT).status, 'doing')
})

test('an unknown status id is rejected naming the field and the accepted ids', () => {
  const message = rejects(() => normalizeItem({ ...todo, status: 'nope' }, {}, AT), 'status')
  assert.equal(message, 'dsh-hub: status must be one of pending|doing|done|failed|onhold|cancelled, received "nope"')
})

test('a TODO is checked against the status list the store carries', () => {
  const statuses = [...DEFAULT_STATUSES, { id: 'blocked', label: 'Blocked', labelKey: '', tone: 'warn', done: false }]
  assert.equal(normalizeItem({ ...todo, status: 'blocked' }, {}, AT, statuses).status, 'blocked')
  rejects(() => normalizeItem({ ...todo, status: 'blocked' }, {}, AT), 'status')
})

test('a NOTE carries text and images and no category or priority', () => {
  const item = normalizeItem({ kind: 'note', text: 'a thought' }, {}, AT)
  assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'id', 'images', 'kind', 'text', 'title', 'updatedAt'])
  assert.equal(item.text, 'a thought')
  assert.deepEqual(item.images, [])
})

test('a PROMPT has the same shape as a NOTE', () => {
  const item = normalizeItem({ kind: 'prompt', text: 'draw a cat' }, {}, AT)
  assert.deepEqual(Object.keys(item).sort(), ['createdAt', 'id', 'images', 'kind', 'text', 'title', 'updatedAt'])
})

test('a title is kept, trimmed, and blank means absent', () => {
  assert.equal(normalizeItem({ ...todo, title: '  Ship it  ' }, {}, AT).title, 'Ship it')
  assert.equal(normalizeItem({ ...todo, title: '   ' }, {}, AT).title, '')
  assert.equal(normalizeItem({ ...todo, title: '' }, {}, AT).title, '')
  assert.equal(normalizeItem({ ...todo, title: null }, {}, AT).title, '')
  assert.equal(normalizeItem({ kind: 'note', text: 'a thought', title: 'A note' }, {}, AT).title, 'A note')
})

test('a non-string title is rejected naming the field, like every other field', () => {
  rejects(() => normalizeItem({ ...todo, title: 42 }, {}, AT), 'title')
  rejects(() => normalizeItem({ ...todo, title: ['x'] }, {}, AT), 'title')
})

test('a patch may set the title and omitting it leaves the stored one alone', () => {
  const item = normalizeItem({ ...todo, title: 'Ship it' }, {}, AT)
  const renamed = applyPatch(item, { title: 'Ship it Friday' }, {}, AT)
  assert.equal(renamed.title, 'Ship it Friday')
  assert.equal(applyPatch(item, { note: 'later' }, {}, AT).title, 'Ship it')
  assert.equal(applyPatch(item, { title: '' }, {}, AT).title, '', 'clearing a title is a change, not an omission')
})

test('an item stored before titles existed still loads', () => {
  // The reason `title` is additive: no schema bump, and a document written by an
  // earlier build reads as an untitled item rather than as corruption.
  const legacy = { kind: 'note', id: 'n1', text: 'a thought', createdAt: AT.toISOString(), updatedAt: AT.toISOString() }
  const item = normalizeItem(legacy, {}, AT)
  assert.equal(item.title, '')
  assert.equal(item.text, 'a thought')
})

test('fields outside §5 are dropped rather than stored', () => {
  const item = normalizeItem({ kind: 'note', text: 'a thought', secret: 'do not keep' }, {}, AT)
  assert.equal('secret' in item, false)
})

test('an unknown kind is rejected naming the field and the received value', () => {
  const message = rejects(() => normalizeItem({ kind: 'reminder', text: 'x' }, {}, AT), 'kind')
  assert.equal(message, 'dsh-hub: kind must be one of todo|note|prompt, received "reminder"')
})

test('an unknown priority is rejected naming the field and the received value', () => {
  const message = rejects(() => normalizeItem({ ...todo, priority: 'urgent!!' }, {}, AT), 'priority')
  assert.equal(message, 'dsh-hub: priority must be one of low|normal|high|urgent, received "urgent!!"')
})

test('every documented priority is accepted', () => {
  for (const priority of PRIORITIES) {
    assert.equal(normalizeItem({ ...todo, priority }, {}, AT).priority, priority)
  }
})

test('a TODO whose title names it needs no content at all', () => {
  // The title summarises the content, so a short task is a title on its own.
  // What is refused is the pair being blank, not either one.
  const item = normalizeItem({ kind: 'todo', title: 'ship the panel' }, {}, AT)
  assert.equal(item.title, 'ship the panel')
  assert.equal(item.description, '')
})

test('a NOTE and a PROMPT are the same: either field alone is an item', () => {
  assert.equal(normalizeItem({ kind: 'note', title: 'a thought' }, {}, AT).text, '')
  assert.equal(normalizeItem({ kind: 'prompt', title: 'draw a cat' }, {}, AT).text, '')
})

test('an item with neither a title nor content is rejected naming both', () => {
  const todo = rejects(() => normalizeItem({ kind: 'todo', description: '   ' }, {}, AT), 'title')
  assert.match(todo, /title and description are both blank/)
  const note = rejects(() => normalizeItem({ kind: 'note', text: '  ' }, {}, AT), 'title')
  assert.match(note, /title and text are both blank/)
})

test('content is still trimmed when it is there', () => {
  assert.equal(normalizeItem({ kind: 'note', text: '  a thought  ' }, {}, AT).text, 'a thought')
})

test('content must be a string when it is present', () => {
  rejects(() => normalizeItem({ kind: 'note', text: 42 }, {}, AT), 'text')
})

test('the legacy done must be a boolean when it is there at all', () => {
  // It is read as an alias for a status, so a value that is not a boolean is a
  // defect in a field the Host is about to interpret — not a field to drop.
  const message = rejects(() => normalizeItem({ ...todo, done: 'yes' }, {}, AT), 'done')
  assert.equal(message, 'dsh-hub: done must be a boolean, received "yes"')
})

test('createdAt must survive a read-modify-write round trip unchanged', () => {
  const stored = normalizeItem(todo, {}, AT)
  assert.equal(normalizeItem(stored, {}, AT).createdAt, stored.createdAt)
})

test('an unparseable createdAt is rejected instead of being replaced', () => {
  rejects(() => normalizeItem({ ...todo, createdAt: 'yesterday' }, {}, AT), 'createdAt')
})

test('attachments keep §5 order and are measured on decoded bytes', () => {
  const item = normalizeItem({
    ...todo,
    attachments: [{ name: 'shot.png', mime: 'image/png', size: 4, dataUrl: dataUrlOf(4) }],
  }, {}, AT)
  assert.deepEqual(Object.keys(item.attachments[0]), ['name', 'mime', 'size', 'dataUrl'])
  assert.equal(item.attachments[0].size, 4)
})

test('a declared size that disagrees with the payload is rejected', () => {
  const message = rejects(() => normalizeItem({
    ...todo,
    attachments: [{ name: 'shot.png', size: 7, dataUrl: dataUrlOf(4) }],
  }, {}, AT), 'attachments[0].size')
  assert.equal(message, 'dsh-hub: attachments[0].size must be the decoded byte length of dataUrl, which is 4, received 7')
})

test('a mime that disagrees with the data URL is rejected', () => {
  const message = rejects(() => normalizeItem({
    ...todo,
    attachments: [{ name: 'shot.png', mime: 'image/jpeg', dataUrl: dataUrlOf(4) }],
  }, {}, AT), 'attachments[0].mime')
  assert.match(message, /attachments\[0\]\.mime must match the data URL media type/)
})

test('a non-base64 data URL is rejected', () => {
  const message = rejects(() => normalizeItem({
    ...todo,
    attachments: [{ name: 'shot.png', dataUrl: 'data:image/png,not-base64' }],
  }, {}, AT), 'attachments[0].dataUrl')
  assert.match(message, /must be base64-encoded/)
})

test('a bare string is not a data URL', () => {
  rejects(() => normalizeItem({ ...todo, attachments: [{ name: 'shot.png', dataUrl: 'shot.png' }] }, {}, AT), 'attachments[0].dataUrl')
})

test('the four raster media types are accepted and named in the refusal', () => {
  // The allowlist is what keeps a picked file from becoming active content:
  // the four accepted types cannot carry anything executable.
  for (const mime of ATTACHMENT_MIME_TYPES) {
    const item = normalizeItem({
      ...todo,
      attachments: [{ name: 'shot', dataUrl: `data:${mime};base64,AAAA` }],
    }, { allowMimeTypes: ATTACHMENT_MIME_TYPES }, AT)
    assert.equal(item.attachments[0].mime, mime)
  }
})

test('an SVG is refused, because it can carry a script', () => {
  const message = rejects(() => normalizeItem({
    ...todo,
    attachments: [{ name: 'logo.svg', dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }],
  }, { allowMimeTypes: ATTACHMENT_MIME_TYPES }, AT), 'attachments[0].mime')
  assert.equal(message, 'dsh-hub: attachments[0].mime must be one of image/png|image/jpeg|image/gif|image/webp, received "image/svg+xml"')
})

test('a media type that is not an image at all is refused', () => {
  const message = rejects(() => normalizeItem({
    ...todo,
    attachments: [{ name: 'notes.pdf', dataUrl: 'data:application/pdf;base64,AAAA' }],
  }, { allowMimeTypes: ATTACHMENT_MIME_TYPES }, AT), 'attachments[0].mime')
  assert.match(message, /application\/pdf/)
})

test('an attachment stored before the allowlist existed still loads', () => {
  // The gate governs writes, not reads: enforcing it on load would lock a user
  // out of a document that was legal when it was written, which is the same
  // reason a lowered ceiling does not apply to a load.
  const item = normalizeItem({
    ...todo,
    attachments: [{ name: 'logo.svg', dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }],
  }, {}, AT)
  assert.equal(item.attachments[0].mime, 'image/svg+xml')
})

test('the media type is what stands between data: and ;base64, and nothing else may', () => {
  // A header carrying a parameter is a data URL the store would have to
  // interpret, so the whole of that span is read as the media type and the
  // allowlist refuses it rather than guessing where the type ends.
  const message = rejects(() => normalizeItem({
    ...todo,
    attachments: [{ name: 'shot.png', dataUrl: 'data:image/png;charset=utf-8;base64,AAAA' }],
  }, { allowMimeTypes: ATTACHMENT_MIME_TYPES }, AT), 'attachments[0].mime')
  assert.match(message, /must be one of/)
})

// DESIGN §4: the ceiling is measured on the decoded bytes, before encoding.
const LIMIT = 2097152

test('an image exactly at maxImageBytes is accepted', () => {
  const item = normalizeItem({
    ...todo,
    attachments: [{ name: 'big.png', size: LIMIT, dataUrl: dataUrlOf(LIMIT) }],
  }, { maxImageBytes: LIMIT }, AT)
  assert.equal(item.attachments[0].size, LIMIT)
})

test('an image one byte over maxImageBytes is rejected naming both numbers', () => {
  const size = LIMIT + 1
  const message = rejects(() => normalizeItem({
    ...todo,
    attachments: [{ name: 'big.png', size, dataUrl: dataUrlOf(size) }],
  }, { maxImageBytes: LIMIT }, AT), 'attachments[0].dataUrl')
  assert.match(message, /2097153/)
  assert.match(message, /2097152/)
  assert.match(message, /maxImageBytes/)
  // Spelled as a substring, not a pattern: `formatBytes` emits parentheses,
  // which a RegExp would read as a capture group.
  assert.ok(
    message.includes(`is ${formatBytes(size)}; the limit is ${formatBytes(LIMIT)}`),
    `expected both byte counts in: ${message}`,
  )
})

test('no ceiling is enforced when maxImageBytes is absent', () => {
  // This is how the store loads an existing document after the ceiling is
  // lowered: the previous write was legal when it happened.
  const item = normalizeItem({ ...todo, attachments: [{ name: 'big.png', size: LIMIT + 1, dataUrl: dataUrlOf(LIMIT + 1) }] }, {}, AT)
  assert.equal(item.attachments[0].size, LIMIT + 1)
})

test('formatBytes keeps the exact count visible next to the rounded one', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2.0 KiB (2048 bytes)')
  assert.equal(formatBytes(LIMIT), '2.0 MiB (2097152 bytes)')
})

// --- applyPatch ------------------------------------------------------------

const stored = normalizeItem(todo, {}, AT)

test('a patch changes content and restamps updatedAt only', () => {
  const later = new Date('2026-10-16T00:00:00.000Z')
  const patched = applyPatch(stored, { status: 'done' }, {}, later)
  assert.equal(patched.status, 'done')
  assert.equal(patched.updatedAt, '2026-10-16T00:00:00.000Z')
  assert.equal(patched.createdAt, stored.createdAt)
  assert.equal(patched.id, stored.id)
})

test('a patch may not change identity or provenance', () => {
  rejects(() => applyPatch(stored, { id: 'other' }, {}, AT), 'id')
  rejects(() => applyPatch(stored, { kind: 'note' }, {}, AT), 'kind')
  rejects(() => applyPatch(stored, { createdAt: '2020-01-01T00:00:00.000Z' }, {}, AT), 'createdAt')
})

test('a patch is validated as strictly as a create', () => {
  rejects(() => applyPatch(stored, { priority: 'later' }, {}, AT), 'priority')
  rejects(() => applyPatch(stored, { status: 'later' }, {}, AT), 'status')
})

test('a patch may clear the content of an item its title names', () => {
  const titled = normalizeItem({ ...todo, title: 'ship the panel' }, {}, AT)
  assert.equal(applyPatch(titled, { description: '' }, {}, AT).description, '')
})

test('a patch that would leave the item with nothing in it is rejected', () => {
  // `stored` has no title, so clearing its only content is the one patch that
  // leaves nothing to name the item by.
  const message = rejects(() => applyPatch(stored, { description: '' }, {}, AT), 'title')
  assert.match(message, /both blank/)
})

test('a non-object patch is rejected', () => {
  rejects(() => applyPatch(stored, 'done', {}, AT), 'patch')
})
