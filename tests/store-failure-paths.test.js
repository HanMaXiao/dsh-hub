/**
 * The store's failure paths: read, write, and a document that cannot be trusted.
 *
 * `lib/store.js` states the rule this file pins: **a missing file is an empty
 * store; a file that is there and cannot be read is a failure naming the path.**
 * The difference matters because the second case is the user's data. Reading it
 * as empty and writing over it would destroy the only copy, so the store is
 * expected to refuse loudly and leave the bytes alone.
 *
 * The write side has the same shape: a refused write leaves the previous
 * document intact, and the failure names what could not be done. `store.test.js`
 * already covers the document-trust cases (syntax, version, model); what is
 * added here is the pair the filesystem supplies — **unreadable** and
 * **unwritable** — plus the validation-before-write contract of a status edit,
 * which is where a partial write would be most expensive.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { HubStore, HubStoreError, SCHEMA_VERSION, STORE_FILENAME } from '../lib/store.js'
import { DEFAULT_STATUSES } from '../lib/status.js'

/** Open a store in a throwaway directory, with no file written yet. */
function openStore() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'dsh-hub-store-'))
  return { store: new HubStore({ dataDir }), dataDir, file: path.join(dataDir, STORE_FILENAME) }
}

/** Run `call` and return what it threw. */
function thrownBy(call) {
  try {
    call()
  }
  catch (error) {
    return error
  }
  assert.fail('the call was expected to fail')
}

/** Assert a store failure, and that the message names the path to repair. */
function storeFailure(error, reason, mentioned) {
  assert.ok(error instanceof HubStoreError, `expected a HubStoreError, got ${error?.name}: ${error?.message}`)
  assert.equal(error.reason, reason)
  assert.ok(error.message.includes(mentioned), `the failure must name ${mentioned}: ${error.message}`)
  return error
}

/**
 * Make the store's next write fail the way the disk does: `persist` throws
 * before anything is renamed into place. The seam is the store's own public
 * method rather than a broken `dataDir`, because a real filesystem refusal
 * differs by platform and would be met by the read path first; what is being
 * tested here is the pair of memory and disk after a refused write, not the
 * platform's error code.
 *
 * @returns A function that restores the real write.
 */
function failNextWrite(store) {
  const persist = store.persist
  let armed = true
  store.persist = (...args) => {
    if (armed) {
      armed = false
      throw new HubStoreError(
        `dsh-hub: the store at ${store.file} could not be written (simulated); the previous contents are untouched`,
        'unwritable',
      )
    }
    return persist.apply(store, args)
  }
  return () => {
    store.persist = persist
  }
}

/** The item texts the document on disk holds. */
function storedTexts(file) {
  return JSON.parse(readFileSync(file, 'utf8')).items.map(item => item.text)
}

// --- reading ---------------------------------------------------------------

test('a file that exists and cannot be read is a failure, not an empty store', t => {
  const { dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  // A directory is exactly the ambiguous case: the path exists, and the bytes
  // cannot be read. Reporting an empty store here would be a silent reset.
  mkdirSync(file, { recursive: true })
  const failure = storeFailure(thrownBy(() => new HubStore({ dataDir })), 'unreadable', file)
  assert.match(failure.message, /Nothing has been overwritten/)
  assert.ok(statSync(file).isDirectory(), 'a refused open leaves the path alone')
})

test('a store that becomes unreadable while it is open stops the next read', t => {
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  assert.deepEqual(store.list(), [], 'a missing file is the empty store')
  mkdirSync(file, { recursive: true })
  const failure = storeFailure(thrownBy(() => store.list()), 'unreadable', file)
  assert.match(failure.message, /cannot be read/)
})

// --- writing ---------------------------------------------------------------

test('a data directory that cannot be created is unwritable, and previous bytes stay', t => {
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  // Replace the directory with a regular file: `mkdir` can no longer succeed.
  // This is platform-agnostic only at `persist` — going through a write call
  // would meet the refresh first, whose own failure differs by OS.
  rmSync(dataDir, { recursive: true, force: true })
  writeFileSync(dataDir, 'the bytes already there', 'utf8')
  const failure = storeFailure(thrownBy(() => store.persist()), 'unwritable', dataDir)
  assert.match(failure.message, /cannot be created/)
  assert.equal(readFileSync(dataDir, 'utf8'), 'the bytes already there')
})

// --- a refused write is not carried into the store --------------------------
//
// A write that fails must leave the document the store holds exactly as the
// disk has it. The failure the user received and the bytes that eventually land
// have to agree: a later successful write must not rescue the change the store
// already refused, or the user is told one thing and gets another.

test('an item the disk refused is not in the store that failed', t => {
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const release = failNextWrite(store)
  storeFailure(thrownBy(() => store.create({ kind: 'note', text: 'refused' })), 'unwritable', file)
  release()

  assert.equal(existsSync(file), false, 'the refused write left no document behind')
  assert.deepEqual(store.list(), [], 'the store holds the disk state, not the refused change')
})

test('a later successful write does not carry the item the disk refused', t => {
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const release = failNextWrite(store)
  storeFailure(thrownBy(() => store.create({ kind: 'note', text: 'refused' })), 'unwritable', file)
  release()
  store.create({ kind: 'note', text: 'lands' })

  assert.deepEqual(storedTexts(file), ['lands'], 'only the write that was reported as successful is on disk')
})

test('a refused status is not carried into the next successful write', t => {
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const release = failNextWrite(store)
  storeFailure(thrownBy(() => store.createStatus({ label: 'Blocked' })), 'unwritable', file)
  release()
  assert.equal(store.statuses().length, DEFAULT_STATUSES.length, 'the definition list matches the disk')
  store.create({ kind: 'note', text: 'lands' })

  const statuses = JSON.parse(readFileSync(file, 'utf8')).statuses
  assert.equal(statuses.length, DEFAULT_STATUSES.length, 'the refused definition never reaches the disk')
  assert.ok(!statuses.some(status => status.label === 'Blocked'))
})

test('a refused edit is not carried into the next successful write', t => {
  // With the file gone, a refresh has nothing to correct the in-memory copy
  // against — the case where the change used to survive the failure and land
  // on the next write.
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const item = store.create({ kind: 'note', text: 'original' })
  rmSync(file)
  const release = failNextWrite(store)
  storeFailure(thrownBy(() => store.update(item.id, { text: 'refused' })), 'unwritable', file)
  release()
  store.create({ kind: 'note', text: 'later' })

  assert.deepEqual(storedTexts(file), ['original', 'later'], 'the refused edit was not written along with the later item')
})

test('a refused removal is not carried into the next successful write', t => {
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const first = store.create({ kind: 'note', text: 'first' })
  store.create({ kind: 'note', text: 'second' })
  rmSync(file)
  const release = failNextWrite(store)
  storeFailure(thrownBy(() => store.remove(first.id)), 'unwritable', file)
  release()
  store.create({ kind: 'note', text: 'later' })

  assert.deepEqual(storedTexts(file), ['first', 'second', 'later'], 'the item the store refused to delete is still on disk')
})

// --- a document that cannot be trusted -------------------------------------

test('a document whose status ids repeat is corrupt, and the message names the entry', t => {
  const { dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  // Two definitions sharing one id make "the status of this item" depend on
  // which definition a reader meets first; the item stores an id, not a name.
  writeFileSync(file, JSON.stringify({
    version: SCHEMA_VERSION,
    items: [],
    statuses: [
      { id: 'same', label: 'One', labelKey: '', tone: 'neutral', done: false },
      { id: 'same', label: 'Two', labelKey: '', tone: 'info', done: false },
    ],
  }), 'utf8')
  const failure = storeFailure(thrownBy(() => new HubStore({ dataDir })), 'corrupt', file)
  assert.match(failure.message, /statuses\[1\]\.id/, 'the message points at the definition to fix')
})

test('a document that spells its status list as null gets the built-ins', t => {
  const { dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  // The key is additive: absent and null both mean "written before the enum",
  // and the built-ins stand in until the next write. Only a list that is there
  // and malformed is a failure.
  writeFileSync(file, JSON.stringify({ version: SCHEMA_VERSION, items: [], statuses: null }), 'utf8')
  const store = new HubStore({ dataDir })
  assert.deepEqual(store.statuses(), structuredClone(DEFAULT_STATUSES))
})

// --- a status edit is validated before anything is written -----------------

test('a non-object patch is refused before the document is touched', t => {
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  store.create({ kind: 'note', text: 'one' })
  const before = readFileSync(file, 'utf8')
  const failure = thrownBy(() => store.updateStatus('pending', 'not a patch'))
  assert.equal(failure.name, 'HubValidationError')
  assert.equal(failure.field, 'patch')
  assert.equal(readFileSync(file, 'utf8'), before, 'a refused patch leaves the bytes identical')
})

test('a fractional order is refused, and the list does not move', t => {
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  store.create({ kind: 'note', text: 'one' })
  const before = readFileSync(file, 'utf8')
  const failure = thrownBy(() => store.updateStatus('pending', { order: 1.5 }))
  assert.equal(failure.name, 'HubValidationError')
  assert.equal(failure.field, 'order')
  assert.equal(readFileSync(file, 'utf8'), before, 'the order cannot be half-applied')
  assert.deepEqual(store.statuses().map(status => status.id), ['pending', 'doing', 'done', 'failed', 'onhold', 'cancelled'])
})

test('a rename to blank is refused, because the status would name nothing', t => {
  const { store, dataDir, file } = openStore()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  store.create({ kind: 'note', text: 'one' })
  const before = readFileSync(file, 'utf8')
  // A written label gives the locale key up, so a blank label would leave the
  // definition with neither name — a region header with no text.
  const failure = thrownBy(() => store.updateStatus('pending', { label: '   ' }))
  assert.equal(failure.name, 'HubValidationError')
  assert.equal(failure.field, 'status.label')
  assert.equal(readFileSync(file, 'utf8'), before)
})
