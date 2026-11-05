/**
 * The Remote's failure vocabulary, mounted on a real Cordis context.
 *
 * `remote.js` is the only translation layer between the store's own failures and
 * what the page sees. Every call it publishes catches one of two types and
 * re-throws a `RemoteError`; the gateway encodes that onto the wire as
 * `{ ok: false, error }` and the panel discriminates on `error.code`. Three
 * things therefore have to hold, and none of them is visible from a source read:
 *
 * - **The code names the failure.** `hub/invalid-item` sends a form to one
 *   field, `hub/not-found` is repairable by a reload, `hub/corrupt` is not;
 *   collapsing them into one code would make each of those look the same.
 * - **A business failure is thrown, never rejected.** The store is synchronous
 *   end to end and the Remote catches a *thrown* error; a promise would sail
 *   straight past the catch and arrive at the page unlabelled.
 * - **Anything else travels untouched.** A failure the Remote does not
 *   recognise must not be dressed up as a `hub/*` code, or the panel would
 *   report a bug in this package for a fault somewhere else.
 *
 * The gateway is not importable in this bundle, so `{ ok: false, error }` is
 * pinned as the invariants the encoder relies on: a structural `RemoteError`
 * marker rather than `instanceof`, a string code, and `details` that survives
 * JSON unchanged.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
/** Cordis is only reachable through the protocol package's own dependencies. */
const protocolRequire = createRequire(require.resolve('@deepseek-ai/dsh-typert-protocol'))
const { Context } = await import(pathToFileURL(protocolRequire.resolve('@deepseek-ai/cordis')).href)
const protocol = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')).href)

const host = await import('../host.js')
const { describeRemote, HubRemote, SERVICE_KEY, STORE_KEY } = await import('../remote.js')
const { HubStoreError, SCHEMA_VERSION, STORE_FILENAME } = await import('../lib/store.js')

/**
 * The reasons the store raises, and the code each one is published as.
 *
 * Pinned here because the panel's copy is keyed on the code: a reason that
 * starts arriving under a different code stops being translated silently.
 */
const STORE_REASONS = [
  'not-found', 'corrupt', 'version', 'unreadable', 'unwritable', 'nested-write', 'last-status', 'in-use',
]

/**
 * Mount the real Host entry into a throwaway store directory.
 *
 * @returns `{ root, dataDir, file, service }`; `service` is the live Remote.
 */
async function mount() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'dsh-hub-remote-'))
  const root = new Context()
  // The entry logs one receipt line; nothing reads it here, but a missing
  // logger is a composition service Cordis would otherwise refuse.
  root.provide('logger', { info() {}, error() {} })
  const fiber = root.plugin({ ...host, name: 'hub-core' }, { dataDir, maxImageBytes: 2097152 })
  // Cordis settles a fiber's startup error when `await()` returns, and ACTIVE a
  // turn later; the service is read after that turn.
  await fiber.await().then(() => undefined, error => error)
  await new Promise(resolve => setTimeout(resolve, 0))
  const service = root.get(SERVICE_KEY)
  assert.notEqual(service, undefined, 'the panel has no Remote to call')
  return { root, dataDir, file: path.join(dataDir, STORE_FILENAME), service }
}

/** Run `call` and return what it threw. */
function failureOf(call) {
  try {
    call()
  }
  catch (error) {
    return error
  }
  assert.fail('the call was expected to fail')
}

/** Assert the failure is a RemoteError and return its code and details. */
function remoteFailure(error) {
  const failure = protocol.remoteErrorOf(error)
  assert.notEqual(failure, undefined, `expected a RemoteError, got ${error?.name}: ${error?.message}`)
  assert.equal(failure.name, 'RemoteError')
  assert.equal(typeof failure.code, 'string')
  assert.ok(failure.code.length > 0, 'an empty code cannot be discriminated')
  assert.ok(failure.message.length > 0, 'the panel shows this text on its failure state')
  return failure
}

// --- model failures --------------------------------------------------------

test('a rejected draft is hub/invalid-item, naming the field a form can highlight', async t => {
  const { dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const failure = remoteFailure(failureOf(() => service.create({})))
  assert.equal(failure.code, 'hub/invalid-item')
  assert.equal(failure.details.field, 'kind', 'the Host refuses to guess the kind')
  assert.match(failure.message, /kind/)
})

test('an update cannot touch the id, and the refusal names it', async t => {
  const { dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const created = service.create({ kind: 'note', text: 'one' })
  const failure = remoteFailure(failureOf(() => service.update(created.id, { id: 'another' })))
  assert.equal(failure.code, 'hub/invalid-item')
  assert.equal(failure.details.field, 'id')
})

test('an id that is not there is hub/not-found and names the id', async t => {
  const { dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  for (const call of [() => service.update('missing', { text: 'x' }), () => service.remove('missing')]) {
    const failure = remoteFailure(failureOf(call))
    assert.equal(failure.code, 'hub/not-found')
    assert.equal(failure.details.reason, 'not-found', 'the code is built from the store reason')
    assert.match(failure.message, /"missing"/)
  }
})

test('a status still carried by a TODO is hub/in-use, and nothing is moved for the user', async t => {
  const { dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  service.create({ kind: 'todo', description: 'one' })
  const failure = remoteFailure(failureOf(() => service.removeStatus('pending')))
  assert.equal(failure.code, 'hub/in-use')
  assert.equal(failure.details.reason, 'in-use')
  assert.match(failure.message, /1 item/)
  assert.equal(service.list().items[0].status, 'pending', 'a refused removal leaves the item alone')
})

test('a status id that is not there is hub/not-found', async t => {
  const { dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const failure = remoteFailure(failureOf(() => service.removeStatus('missing')))
  assert.equal(failure.code, 'hub/not-found')
  assert.match(failure.message, /"missing"/)
})

// --- store failures --------------------------------------------------------

test('a document damaged under a running panel is hub/corrupt, not an empty list', async t => {
  const { dataDir, file, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const damaged = '{ "version": 1, "items": ['
  writeFileSync(file, damaged, 'utf8')
  const failure = remoteFailure(failureOf(() => service.list()))
  assert.equal(failure.code, 'hub/corrupt')
  assert.equal(failure.details.reason, 'corrupt')
  assert.match(failure.message, /is not valid JSON/)
  assert.equal(readFileSync(file, 'utf8'), damaged, 'a refused read never rewrites the file')
})

test('a document from a newer schema is hub/version', async t => {
  const { dataDir, file, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  writeFileSync(file, JSON.stringify({ version: SCHEMA_VERSION + 1, items: [] }), 'utf8')
  const failure = remoteFailure(failureOf(() => service.list()))
  assert.equal(failure.code, 'hub/version')
  assert.match(failure.message, /declares version/)
})

test('a store that cannot be read is hub/unreadable', async t => {
  const { dataDir, file, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  // A directory is a file that exists and cannot be read: the loud failure, not
  // the empty store a missing file is.
  mkdirSync(file, { recursive: true })
  const failure = remoteFailure(failureOf(() => service.list()))
  assert.equal(failure.code, 'hub/unreadable')
  assert.match(failure.message, /cannot be read/)
  assert.ok(failure.message.includes(file), 'the failure names the path to repair')
})

test('a store that cannot be written is hub/unwritable, and the panel is told', async t => {
  const { root, dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  // A write failure is platform-dependent at the filesystem boundary (a read
  // and a rename both fail differently on Windows and POSIX), so the store's
  // public persist is driven to raise one here. What is under test is the
  // translation: a HubStoreError becomes `hub/<reason>` and keeps its reason.
  const store = root.get(STORE_KEY)
  const persist = store.persist
  store.persist = () => {
    throw new HubStoreError(`dsh-hub: the store at ${store.file} could not be written; the previous contents are untouched`, 'unwritable')
  }
  try {
    const failure = remoteFailure(failureOf(() => service.create({ kind: 'note', text: 'one' })))
    assert.equal(failure.code, 'hub/unwritable')
    assert.equal(failure.details.reason, 'unwritable')
    assert.match(failure.message, /previous contents are untouched/)
  }
  finally {
    store.persist = persist
  }
})

// --- the shape the gateway encodes -----------------------------------------

test('a business failure is thrown synchronously, never rejected', async t => {
  const { dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  // The store is synchronous end to end, and the Remote's catch only sees a
  // thrown error: a rejected promise would reach the page unlabelled.
  assert.equal(service.list() instanceof Promise, false)
  assert.equal(failureOf(() => service.create({})).isDSHRemoteError, true)
})

test('the wire envelope survives JSON with its code, message and details intact', async t => {
  const { dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const failure = remoteFailure(failureOf(() => service.create({})))
  const envelope = JSON.parse(JSON.stringify({ ok: false, error: { code: failure.code, message: failure.message, details: failure.details } }))
  assert.equal(envelope.ok, false)
  assert.equal(envelope.error.code, 'hub/invalid-item')
  assert.deepEqual(envelope.error.details, failure.details)
})

test('a store failure publishes hub/<reason>, so the code carries the cause', async t => {
  const { dataDir, file, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  /** Drive one published call and pin the reason it puts on the wire. */
  const expectReason = (reason, call) => {
    const failure = remoteFailure(failureOf(call))
    assert.equal(failure.details.reason, reason, `${reason} should travel in details`)
    assert.equal(failure.code, `hub/${reason}`)
    assert.ok(STORE_REASONS.includes(reason), `${reason} is not a reason the store raises`)
  }

  // Each probe runs against the document the previous one left, exactly as a
  // panel would meet them: the translation is what is under test, not the order.
  expectReason('not-found', () => service.remove('missing'))
  service.create({ kind: 'todo', description: 'one' })
  expectReason('in-use', () => service.removeStatus('pending'))
  writeFileSync(file, JSON.stringify({ version: SCHEMA_VERSION + 1, items: [] }), 'utf8')
  expectReason('version', () => service.list())
  writeFileSync(file, '{ "version": 1, "items": [', 'utf8')
  expectReason('corrupt', () => service.list())
})

test('a failure the Remote does not recognise travels untouched', async t => {
  const { root, dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const store = root.get(STORE_KEY)
  const boom = new Error('boom')
  const listed = store.list
  store.list = () => { throw boom }
  try {
    // Dressing this up as `hub/corrupt` would blame the file for a bug in the
    // caller, and losing it would leave the panel with no text at all.
    assert.equal(failureOf(() => service.list()), boom)
  }
  finally {
    store.list = listed
  }
  // A non-Error throw is not a failure vocabulary member either.
  store.list = () => { throw 'not an error' }
  try {
    assert.equal(failureOf(() => service.list()), 'not an error')
  }
  finally {
    store.list = listed
  }
})

// --- the namespace ---------------------------------------------------------

test('a missing namespace is reported as unmounted, which is the service-unavailable cause', () => {
  // `TypertGatewayService.prepareInvocation` throws
  // `gateway/service-unavailable` when `ctx.get('hub')` is not an object. That
  // absent service is exactly what a bare context holds, and the receipt must
  // say so rather than claim a mount.
  const root = new Context()
  assert.equal(root.get(SERVICE_KEY), undefined)
  assert.deepEqual(describeRemote(root), { service: SERVICE_KEY, mounted: false })
})

test('only the roster is published, and the wire names reach the service methods', async t => {
  const { dataDir, service } = await mount()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  // A name with no roster entry has no endpoint; publishing one would fail at
  // mount time, and the two that differ exist because `remove` and
  // `removeStatus` are the service's own names for the wire's `delete`s.
  assert.equal(typeof service.list, 'function')
  assert.equal(typeof service.delete, 'undefined', 'the wire name is not the service method')
  assert.equal(typeof service.remove, 'function')
  assert.equal(typeof service.deleteStatus, 'undefined')
  assert.equal(typeof service.removeStatus, 'function')
})

test('the Remote declares the store it reads, so the namespace cannot mount half-built', () => {
  assert.deepEqual(HubRemote.inject, [STORE_KEY])
})
