/**
 * The durable store (DESIGN §4).
 *
 * The behaviours worth protecting here are the ones whose failure destroys a
 * user's data: a write must be all-or-nothing, and a damaged file must stop
 * the plugin loudly instead of being quietly replaced by an empty one.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
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

test('a created item lands in store.json under the schema version', () => {
  const dir = tempDir()
  const created = open(dir).create({ kind: 'note', text: 'first' })
  const document = JSON.parse(readFileSync(path.join(dir, STORE_FILENAME), 'utf8'))
  assert.equal(document.version, SCHEMA_VERSION)
  assert.equal(document.items.length, 1)
  assert.deepEqual(document.items[0], created)
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
  const updated = store.update(created.id, { done: true, priority: 'high' })
  assert.equal(updated.done, true)
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
  for (const call of [() => store.update('missing', { done: true }), () => store.remove('missing')]) {
    assert.throws(call, error => {
      assert.equal(error.reason, 'not-found')
      assert.match(error.message, /"missing"/)
      return true
    })
  }
})
