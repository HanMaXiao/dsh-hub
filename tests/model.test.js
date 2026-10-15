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
import { applyPatch, formatBytes, HubValidationError, normalizeItem, PRIORITIES } from '../lib/model.js'

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
    'attachments', 'category', 'createdAt', 'description', 'done', 'id', 'kind', 'note', 'priority', 'title', 'updatedAt',
  ])
  assert.equal(item.kind, 'todo')
  assert.equal(item.title, '')
  assert.equal(item.description, 'ship the panel')
  assert.equal(item.category, '')
  assert.equal(item.priority, 'normal')
  assert.equal(item.done, false)
  assert.equal(item.note, '')
  assert.deepEqual(item.attachments, [])
  assert.equal(item.createdAt, '2026-10-15T02:04:15.123Z')
  assert.equal(item.updatedAt, item.createdAt)
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

test('a blank description is rejected rather than stored as an empty TODO', () => {
  const message = rejects(() => normalizeItem({ kind: 'todo', description: '   ' }, {}, AT), 'description')
  assert.match(message, /description is required and cannot be blank/)
})

test('done must be a boolean', () => {
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
  const patched = applyPatch(stored, { done: true }, {}, later)
  assert.equal(patched.done, true)
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
})

test('a patch that removes the only required field is rejected', () => {
  rejects(() => applyPatch(stored, { description: '' }, {}, AT), 'description')
})

test('a non-object patch is rejected', () => {
  rejects(() => applyPatch(stored, 'done', {}, AT), 'patch')
})
