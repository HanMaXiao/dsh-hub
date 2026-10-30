/**
 * The durable store (DESIGN §4).
 *
 * The behaviours worth protecting here are the ones whose failure destroys a
 * user's data: a write must be all-or-nothing, and a damaged file must stop
 * the plugin loudly instead of being quietly replaced by an empty one.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { HubValidationError } from '../lib/model.js'
import { HubStore, HubStoreError, resolveDataDir, SCHEMA_VERSION, STORE_FILENAME } from '../lib/store.js'

const dirs = []

/** A throwaway data directory, removed when the file's tests finish. */
function tempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-hub-'))
  dirs.push(dir)
  return dir
}

test.after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** Open a store in a throwaway directory. */
function open(dir, maxImageBytes) {
  return new HubStore({ dataDir: dir, maxImageBytes })
}

/** Assert that opening `dir` fails, and return the message it failed with. */
function openFails(dir, maxImageBytes) {
  let caught
  assert.throws(() => open(dir, maxImageBytes), error => {
    caught = error
    return true
  })
  assert.ok(caught instanceof HubStoreError, `expected a HubStoreError, got ${caught}`)
  assert.ok(caught.message.includes(dir), `${caught.message} should name ${dir}`)
  return caught
}

/** The document a store wrote. */
function readDocument(dir) {
  return JSON.parse(readFileSync(path.join(dir, STORE_FILENAME), 'utf8'))
}

// --- dataDir resolution ----------------------------------------------------
//
// The fixtures are built with `path.join`, never with literal separators:
// `resolveDataDir` is written against `node:path`, so a hard-coded `\\`
// expectation passes on Windows and fails everywhere else. A CI run on Linux
// is the only thing that notices, and a Windows-only assertion is exactly the
// kind that gets added without anyone being able to see it fail.

const HOME = path.join(path.sep, 'home', 'runner')
const DSH_ROOT = path.join(path.sep, 'opt', 'dsh')

test('an empty dataDir follows DSH_HOME', () => {
  const env = { DSH_HOME: DSH_ROOT }
  assert.equal(resolveDataDir('', env, HOME), path.resolve(DSH_ROOT, 'plugin-data', 'dsh-hub'))
})

test('an empty DSH_HOME falls back to the home directory', () => {
  const expected = path.resolve(HOME, '.dsh', 'plugin-data', 'dsh-hub')
  assert.equal(resolveDataDir('', { DSH_HOME: '' }, HOME), expected)
  assert.equal(resolveDataDir('', {}, HOME), expected)
})

test('a non-empty dataDir is resolved, so a relative path means the same thing anywhere', () => {
  assert.equal(resolveDataDir('sync/hub', { DSH_HOME: 'ignored' }, HOME), path.resolve('sync/hub'))
})

test('a blank dataDir is treated as unset, not as a relative path', () => {
  // A patch written as `dataDir: ''` and one written with stray whitespace mean
  // the same thing; both must land in the profile directory.
  assert.equal(resolveDataDir('   ', {}, HOME), path.resolve(HOME, '.dsh', 'plugin-data', 'dsh-hub'))
  assert.equal(resolveDataDir('   ', { DSH_HOME: DSH_ROOT }, HOME), path.resolve(DSH_ROOT, 'plugin-data', 'dsh-hub'))
})

// --- the empty and the normal cases ---------------------------------------

test('a missing file is an empty store, and no file is invented', () => {
  const dir = tempDir()
  const store = open(dir)
  assert.deepEqual(store.list(), [])
  assert.equal(existsSync(path.join(dir, STORE_FILENAME)), false)
})

test('a store starts with the built-in statuses', () => {
  const dir = tempDir()
  const store = open(dir)
  assert.deepEqual(store.statuses().map(status => status.id), [
    'pending', 'doing', 'done', 'failed', 'onhold', 'cancelled',
  ])
  assert.equal(store.statuses()[2].done, true, 'the `done` definition is the terminal one')
})

test('a created item lands in store.json under the schema version', () => {
  const dir = tempDir()
  const created = open(dir).create({ kind: 'note', text: 'first' })
  const document = readDocument(dir)
  assert.equal(document.version, SCHEMA_VERSION)
  assert.equal(document.items.length, 1)
  assert.deepEqual(document.items[0], created)
  assert.equal(document.statuses.length, 6, 'the definitions are persisted beside the items')
})

test('a reopened store sees what the previous one wrote', () => {
  const dir = tempDir()
  const first = open(dir).create({ kind: 'todo', description: 'one' })
  const second = open(dir, 4096)
  second.create({ kind: 'todo', description: 'two' })
  assert.deepEqual(second.list().map(item => item.id), [first.id, second.list()[1].id])
})

test('a write leaves no temp file behind', () => {
  const dir = tempDir()
  const store = open(dir)
  store.create({ kind: 'note', text: 'one' })
  store.update(store.list()[0].id, { text: 'two' })
  assert.deepEqual(readdirSync(dir), [STORE_FILENAME])
})

test('two writes in the same millisecond do not collide on a temp file', () => {
  const dir = tempDir()
  const store = open(dir)
  const at = new Date('2026-10-15T02:04:15.123Z')
  store.create({ kind: 'note', text: 'one' }, at)
  store.create({ kind: 'note', text: 'two' }, at)
  assert.equal(store.list().length, 2)
  assert.deepEqual(readdirSync(dir), [STORE_FILENAME])
})

test('list hands out copies, so a caller cannot edit the store by mutating a result', () => {
  const dir = tempDir()
  const store = open(dir)
  store.create({ kind: 'note', text: 'original' })
  const listed = store.list()
  listed[0].text = 'tampered'
  assert.equal(store.list()[0].text, 'original')
})

test('statuses hands out copies too', () => {
  const dir = tempDir()
  const store = open(dir)
  const listed = store.statuses()
  listed[0].label = 'tampered'
  assert.equal(store.statuses()[0].label, '')
})

test('create returns a copy too', () => {
  const dir = tempDir()
  const store = open(dir)
  const created = store.create({ kind: 'note', text: 'original' })
  created.text = 'tampered'
  assert.equal(store.list()[0].text, 'original')
})

test('update and remove return the item as it is stored', () => {
  const dir = tempDir()
  const store = open(dir)
  const created = store.create({ kind: 'todo', description: 'ship it', priority: 'low' })
  const updated = store.update(created.id, { status: 'done', priority: 'high' })
  assert.equal(updated.status, 'done')
  assert.equal(updated.priority, 'high')
  assert.equal(updated.createdAt, created.createdAt)
  // `updatedAt` is wall-clock time, so a create and an update inside the same
  // millisecond legitimately share a stamp. What must hold on every machine is
  // that the edit never moves `updatedAt` backwards — asserting the two differ
  // instead makes this test fail on a fast runner and pass on a slow one.
  assert.ok(
    Date.parse(updated.updatedAt) >= Date.parse(created.updatedAt),
    `updatedAt went backwards: ${created.updatedAt} -> ${updated.updatedAt}`,
  )
  const removed = store.remove(created.id)
  assert.equal(removed.id, created.id)
  assert.deepEqual(store.list(), [])
})

test('the image ceiling is read from the constructor, not assumed', () => {
  const dir = tempDir()
  const image = { name: 'shot.png', size: 4096, dataUrl: `data:image/png;base64,${Buffer.alloc(4096, 1).toString('base64')}` }
  const roomy = open(dir, 8192)
  roomy.create({ kind: 'todo', description: 'with image', attachments: [image] })
  // The same image under a lower ceiling must not retroactively brick the file.
  assert.equal(open(dir, 1024).list()[0].attachments[0].size, 4096)
  assert.throws(() => open(dir, 1024).create({ kind: 'todo', description: 'too big', attachments: [image] }), /attachments\[0\]\.dataUrl/)
})

test('an oversized image is refused with the configured limit and the actual size in the message', () => {
  // DESIGN §4: the ceiling is measured on the decoded bytes and the refusal has
  // to name both numbers, or the user cannot tell what to shrink.
  const dir = tempDir()
  const limit = 4096
  const image = { name: 'big.png', size: limit + 1, dataUrl: `data:image/png;base64,${Buffer.alloc(limit + 1, 1).toString('base64')}` }
  const store = open(dir, limit)
  assert.throws(() => store.create({ kind: 'todo', description: 'too big', attachments: [image] }), error => {
    assert.ok(error instanceof HubValidationError, `expected a HubValidationError, got ${error}`)
    assert.match(error.message, /4097/, 'the actual size is named')
    assert.match(error.message, /4096/, 'the configured limit is named')
    assert.match(error.message, /maxImageBytes/)
    return true
  })
  assert.equal(existsSync(path.join(dir, STORE_FILENAME)), false, 'a refused write leaves no file behind')
})

test('a media type outside the allowlist is refused, and a stored one still loads', () => {
  // An SVG is XML that can carry a script, and the store keeps every attachment
  // inline in the one document the panel renders from.
  const dir = tempDir()
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from('<svg></svg>').toString('base64')}`
  const store = open(dir)
  assert.throws(() => store.create({ kind: 'note', text: 'with a logo', images: [{ name: 'logo.svg', dataUrl }] }), error => {
    assert.ok(error instanceof HubValidationError, `expected a HubValidationError, got ${error}`)
    assert.match(error.message, /image\/svg\+xml/)
    return true
  })
  // The gate governs writes, not reads: a document that already carries one
  // must not be locked out of its own store by the rule that would have
  // refused to write it.
  writeFileSync(path.join(dir, STORE_FILENAME), JSON.stringify({
    version: SCHEMA_VERSION,
    items: [{ kind: 'note', id: 'n1', text: 'a stored logo', images: [{ name: 'logo.svg', mime: 'image/svg+xml', dataUrl }] }],
  }), 'utf8')
  assert.equal(open(dir).list()[0].images[0].mime, 'image/svg+xml')
})

// --- the in-process document cache and the write lane ----------------------
//
// The cache is keyed by the stat of the file a document was read at, so the
// only way to tell a hit from a miss is to change the file without changing
// that key: the same length, different bytes, the same mtime.

test('a repeated read is answered from the cache, not from the file', () => {
  const dir = tempDir()
  const file = path.join(dir, STORE_FILENAME)
  writeFileSync(file, JSON.stringify({
    version: SCHEMA_VERSION,
    items: [{ kind: 'note', id: 'n1', text: 'cached' }],
  }), 'utf8')
  const pinned = new Date('2026-10-15T02:04:15.123Z')
  utimesSync(file, pinned, pinned)
  assert.equal(statSync(file).mtimeMs, pinned.getTime(), 'the mtime really is pinned, so the test can rely on it')

  const store = open(dir)
  const key = statSync(file)
  assert.equal(store.list()[0].text, 'cached')

  const body = readFileSync(file, 'utf8')
  writeFileSync(file, body.replace('"cached"', '"tamper"'), 'utf8')
  utimesSync(file, pinned, pinned)
  assert.equal(statSync(file).size, key.size, 'the stat key is unchanged')
  assert.equal(statSync(file).mtimeMs, key.mtimeMs, 'the stat key is unchanged')

  assert.equal(store.list()[0].text, 'cached', 'the cached document is served, so nothing was re-read')
  assert.equal(readDocument(dir).items[0].text, 'tamper', 'the file really did change')
})

test('a document changed by another writer is picked up on the next read', () => {
  const dir = tempDir()
  const store = open(dir)
  store.create({ kind: 'note', text: 'first' })
  // A second store over the same file stands in for any other writer. The
  // first store must notice the file moved under it rather than answering from
  // the copy it loaded, which is what a stale cache would do.
  const other = open(dir)
  other.create({ kind: 'note', text: 'second' })
  assert.deepEqual(store.list().map(item => item.text), ['first', 'second'])
})

test('a file deleted under a running store keeps the document it holds', () => {
  // Reading the absence as an empty store would drop every item the moment
  // something deleted the file; the next write puts the file back instead.
  const dir = tempDir()
  const store = open(dir)
  store.create({ kind: 'note', text: 'keep me' })
  rmSync(path.join(dir, STORE_FILENAME))
  assert.deepEqual(store.list().map(item => item.text), ['keep me'])
  store.create({ kind: 'note', text: 'and me' })
  assert.deepEqual(readDocument(dir).items.map(item => item.text), ['keep me', 'and me'])
})

test('writes from concurrent callers are serialised and none is lost', async () => {
  const dir = tempDir()
  const first = open(dir)
  const second = open(dir)
  // Both stores hold their own copy of an empty document, and the two writes
  // are issued from interleaved turns. The second one refreshes before it
  // mutates, or it renames its stale copy over the first one's item.
  await Promise.all([
    Promise.resolve().then(() => first.create({ kind: 'note', text: 'from the first store' })),
    Promise.resolve().then(() => second.create({ kind: 'note', text: 'from the second store' })),
  ])
  assert.deepEqual(readDocument(dir).items.map(item => item.text), [
    'from the first store',
    'from the second store',
  ])
  assert.deepEqual(readdirSync(dir), [STORE_FILENAME], 'no temp file survives a serialised write')
})

test('concurrent writes from one store all land, in the order they were asked for', async () => {
  const dir = tempDir()
  const store = open(dir)
  const at = new Date('2026-10-15T02:04:15.123Z')
  const texts = Array.from({ length: 8 }, (_, index) => `note ${index}`)
  await Promise.all(texts.map(text => Promise.resolve().then(() => store.create({ kind: 'note', text }, at))))
  assert.deepEqual(store.list().map(item => item.text), texts)
  assert.deepEqual(readDocument(dir).items.map(item => item.text), texts)
  assert.deepEqual(readdirSync(dir), [STORE_FILENAME])
})

test('a write started inside another write is refused instead of interleaving', () => {
  // Nothing in the store calls back into itself, so the nested write is forced
  // here by making one write's persist start another. Letting it through would
  // rename half a document over a whole one.
  const dir = tempDir()
  const store = open(dir)
  const persist = store.persist
  store.persist = () => store.create({ kind: 'note', text: 'nested' })
  try {
    assert.throws(() => store.create({ kind: 'note', text: 'outer' }), error => {
      assert.ok(error instanceof HubStoreError, `expected a HubStoreError, got ${error}`)
      assert.equal(error.reason, 'nested-write')
      assert.match(error.message, /inside another write/)
      return true
    })
  }
  finally {
    store.persist = persist
  }
  assert.equal(existsSync(path.join(dir, STORE_FILENAME)), false, 'the refused write left nothing behind')
})

// --- the status definitions ------------------------------------------------

test('a status is created with the Host\'s id, a default tone and no terminal flag', () => {
  const dir = tempDir()
  const store = open(dir)
  const created = store.createStatus({ label: 'Blocked' })
  assert.equal(created.label, 'Blocked')
  assert.equal(created.tone, 'neutral')
  assert.equal(created.done, false)
  assert.equal(typeof created.id, 'string')
  assert.ok(created.id.length > 0)
  assert.equal(store.statuses().length, 7)
  assert.equal(readDocument(dir).statuses.length, 7, 'the definition is persisted')
})

test('a status must name itself', () => {
  const dir = tempDir()
  const store = open(dir)
  assert.throws(() => store.createStatus({ label: '  ' }), /label/)
  assert.throws(() => store.createStatus({}), /label/)
  assert.equal(store.statuses().length, 6, 'a refused status is not appended')
})

test('a renamed status gives up its locale key and keeps its own text', () => {
  const dir = tempDir()
  const store = open(dir)
  const renamed = store.updateStatus('pending', { label: 'To do' })
  assert.equal(renamed.label, 'To do')
  assert.equal(renamed.labelKey, '', 'a definition the user renamed follows their language, not the application\'s')
  assert.equal(renamed.tone, 'neutral', 'the fields the patch did not mention are left alone')
})

test('a status can be re-toned and re-ordered', () => {
  const dir = tempDir()
  const store = open(dir)
  assert.equal(store.updateStatus('failed', { tone: 'warn' }).tone, 'warn')
  store.updateStatus('doing', { order: 0 })
  assert.deepEqual(store.statuses().map(status => status.id), [
    'doing', 'pending', 'done', 'failed', 'onhold', 'cancelled',
  ])
  assert.deepEqual(readDocument(dir).statuses.map(status => status.id), store.statuses().map(status => status.id),
    'the new order is persisted')
})

test('a status can be deleted when nothing carries it', () => {
  const dir = tempDir()
  const store = open(dir)
  const removed = store.removeStatus('failed')
  assert.equal(removed.id, 'failed')
  assert.deepEqual(store.statuses().map(status => status.id), [
    'pending', 'doing', 'done', 'onhold', 'cancelled',
  ])
  assert.equal(readDocument(dir).statuses.length, 5)
})

test('the last status cannot be deleted', () => {
  const dir = tempDir()
  const store = open(dir)
  for (const id of ['pending', 'doing', 'done', 'failed', 'onhold']) store.removeStatus(id)
  assert.throws(() => store.removeStatus('cancelled'), error => {
    assert.ok(error instanceof HubStoreError)
    assert.equal(error.reason, 'last-status')
    return true
  })
  assert.equal(store.statuses().length, 1)
})

test('a status that items still carry cannot be deleted, and the message says how many', () => {
  const dir = tempDir()
  const store = open(dir)
  store.create({ kind: 'todo', description: 'one' })
  store.create({ kind: 'todo', description: 'two' })
  assert.throws(() => store.removeStatus('pending'), error => {
    assert.ok(error instanceof HubStoreError)
    assert.equal(error.reason, 'in-use')
    assert.match(error.message, /2 items/)
    return true
  })
  assert.equal(store.statuses().length, 6, 'a refused removal leaves the list alone')
})

test('flipping the terminal flag re-stamps the items that carry the status', () => {
  const dir = tempDir()
  const store = open(dir)
  const at = new Date('2026-10-15T02:04:15.123Z')
  const item = store.create({ kind: 'todo', description: 'one' }, at)
  assert.equal(item.completedAt, '', 'the status is not terminal to begin with')

  store.updateStatus('pending', { done: true }, at)
  assert.equal(store.list()[0].completedAt, at.toISOString(), 'an item that has just become finished gets a stamp')

  store.updateStatus('pending', { done: false }, at)
  assert.equal(store.list()[0].completedAt, '', 'an item that is no longer finished loses the stamp')
})

test('the items and the definition are written in the same document', () => {
  const dir = tempDir()
  const store = open(dir)
  const at = new Date('2026-10-15T02:04:15.123Z')
  store.create({ kind: 'todo', description: 'one' }, at)
  store.updateStatus('pending', { done: true }, at)
  const document = readDocument(dir)
  assert.equal(document.items[0].completedAt, at.toISOString())
  assert.equal(document.statuses.find(status => status.id === 'pending').done, true)
})

test('a status id that is not there names the id', () => {
  const dir = tempDir()
  const store = open(dir)
  for (const call of [() => store.updateStatus('missing', { tone: 'warn' }), () => store.removeStatus('missing')]) {
    assert.throws(call, error => {
      assert.equal(error.reason, 'not-found')
      assert.match(error.message, /"missing"/)
      return true
    })
  }
})

// --- corruption must be loud ----------------------------------------------

test('malformed JSON stops the mount and names the path', () => {
  const dir = tempDir()
  const file = path.join(dir, STORE_FILENAME)
  const damaged = '{ "version": 1, "items": ['
  writeFileSync(file, damaged, 'utf8')
  const error = openFails(dir)
  assert.equal(error.reason, 'corrupt')
  assert.match(error.message, /is not valid JSON/)
  assert.equal(readFileSync(file, 'utf8'), damaged, 'a rejected store must not be rewritten')
})

test('an empty file stops the mount rather than reading as an empty store', () => {
  const dir = tempDir()
  writeFileSync(path.join(dir, STORE_FILENAME), '\n', 'utf8')
  assert.equal(openFails(dir).reason, 'corrupt')
})

test('a store written by another version stops the mount and names both versions', () => {
  const dir = tempDir()
  writeFileSync(path.join(dir, STORE_FILENAME), JSON.stringify({ version: 99, items: [] }), 'utf8')
  const error = openFails(dir)
  assert.equal(error.reason, 'version')
  assert.match(error.message, /declares version 99/)
  assert.match(error.message, new RegExp(`reads version ${SCHEMA_VERSION}`))
})

test('a document with no version stops the mount instead of being assumed current', () => {
  const dir = tempDir()
  writeFileSync(path.join(dir, STORE_FILENAME), JSON.stringify({ items: [] }), 'utf8')
  assert.equal(openFails(dir).reason, 'version')
})

test('an item that no longer matches the model stops the mount and names the field', () => {
  const dir = tempDir()
  writeFileSync(path.join(dir, STORE_FILENAME), JSON.stringify({
    version: SCHEMA_VERSION,
    items: [{ kind: 'todo', description: 'x', priority: 'whenever' }],
  }), 'utf8')
  const error = openFails(dir)
  assert.equal(error.reason, 'corrupt')
  assert.match(error.message, /priority/)
})

test('a document whose items are not an array stops the mount', () => {
  const dir = tempDir()
  writeFileSync(path.join(dir, STORE_FILENAME), JSON.stringify({ version: SCHEMA_VERSION, items: {} }), 'utf8')
  assert.equal(openFails(dir).reason, 'corrupt')
})

test('a document written before the status list existed reads as one carrying the built-ins', () => {
  // The list is additive, so no schema bump is owed: the definitions stand in
  // until the next write persists them.
  const dir = tempDir()
  writeFileSync(path.join(dir, STORE_FILENAME), JSON.stringify({
    version: SCHEMA_VERSION,
    items: [{ kind: 'todo', description: 'x', done: true }],
  }), 'utf8')
  const store = open(dir)
  assert.deepEqual(store.statuses().map(status => status.id), [
    'pending', 'doing', 'done', 'failed', 'onhold', 'cancelled',
  ])
  assert.equal(store.list()[0].status, 'done', 'the item written before the enum reads as the status its boolean meant')
  store.create({ kind: 'note', text: 'later' })
  assert.equal(readDocument(dir).statuses.length, 6, 'the next write persists the definitions')
})

test('a document whose statuses are not an array stops the mount and names the path', () => {
  const dir = tempDir()
  writeFileSync(path.join(dir, STORE_FILENAME), JSON.stringify({
    version: SCHEMA_VERSION,
    items: [],
    statuses: {},
  }), 'utf8')
  const error = openFails(dir)
  assert.equal(error.reason, 'corrupt')
  assert.match(error.message, /statuses/)
})

test('a status that does not match the model stops the mount and names the field', () => {
  const dir = tempDir()
  writeFileSync(path.join(dir, STORE_FILENAME), JSON.stringify({
    version: SCHEMA_VERSION,
    items: [],
    statuses: [{ id: 'x', label: 'X', labelKey: '', tone: 'rainbow', done: false }],
  }), 'utf8')
  const error = openFails(dir)
  assert.equal(error.reason, 'corrupt')
  assert.match(error.message, /tone/)
})

test('a rejected store is never replaced by an empty one', () => {
  const dir = tempDir()
  const file = path.join(dir, STORE_FILENAME)
  writeFileSync(file, 'not json at all', 'utf8')
  assert.throws(() => open(dir), HubStoreError)
  assert.equal(readFileSync(file, 'utf8'), 'not json at all')
})

// --- ids -------------------------------------------------------------------

test('updating or removing an id that is not there names the id', () => {
  const dir = tempDir()
  const store = open(dir)
  for (const call of [() => store.update('missing', { status: 'done' }), () => store.remove('missing')]) {
    assert.throws(call, error => {
      assert.equal(error.reason, 'not-found')
      assert.match(error.message, /"missing"/)
      return true
    })
  }
})
