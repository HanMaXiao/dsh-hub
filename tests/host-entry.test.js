/**
 * The Host entry, mounted on a real Cordis context.
 *
 * Every other test here reads source text instead of importing `host.js`,
 * because `remote.js` imports `@deepseek-ai/dsh-typert-protocol` — a package
 * that lives in this bundle's `node_modules` but not in the Harness. Both that
 * package and, through it, `@deepseek-ai/cordis` resolve here anyway (the
 * sibling bundle's offline suite does the same), which makes the one thing worth
 * importing for actually importable: whether the entry produces the services the
 * gateway looks up.
 *
 * That is the regression this file exists for. `host.js` provides the store and
 * starts the Remote in the same `apply`, and `ctx.provide()` registers inside
 * `ctx.fiber.effect()` while `ctx.get()` treats a service whose fiber is not yet
 * ACTIVE as absent. Without a declared dependency the Remote therefore threw in
 * its constructor, the entry stayed ACTIVE, and the only symptom the user ever
 * saw was `gateway/service-unavailable: active Service "hub" is unavailable` at
 * the first call — a page away from the cause.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
/** Cordis is only reachable through the protocol package's own dependencies. */
const protocolRequire = createRequire(require.resolve('@deepseek-ai/dsh-typert-protocol'))
const { Context } = await import(pathToFileURL(protocolRequire.resolve('@deepseek-ai/cordis')).href)
const { remoteMethods } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-typert-protocol')).href)

const host = await import('../host.js')
const { describeRemote, HubRemote, SERVICE_KEY, STORE_KEY } = await import('../remote.js')

/** Cordis settles a fiber's startup error when `await()` returns, and ACTIVE a turn later. */
const settle = async fiber => {
  const error = await fiber.await().then(() => undefined, reason => reason)
  await new Promise(resolve => setTimeout(resolve, 0))
  return error
}

/**
 * Mount the real entry into a throwaway store directory.
 * @returns `{ root, fiber, dataDir }`.
 */
/**
 * Mount the real entry into a throwaway store directory.
 * @returns `{ root, fiber, error, logged, dataDir }`.
 */
async function mountEntry() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'dsh-hub-host-'))
  const logged = []
  const root = new Context()
  // `ctx.logger` is a composition service, not a property of the plugin, so the
  // receipt is only observable by providing it the way the Harness does.
  root.provide('logger', {
    info: (message, detail) => { logged.push(String(message).replace('%s', String(detail))) },
    error: (message, detail) => { logged.push(`! ${String(message).replace('%s', String(detail))}`) },
  })
  const fiber = root.plugin({ ...host, name: 'hub-core' }, { dataDir, maxImageBytes: 2097152 })
  const error = await settle(fiber)
  return { root, fiber, error, logged, dataDir }
}

test('the entry starts and the store service is live', async t => {
  const { root, fiber, error, dataDir } = await mountEntry()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  assert.equal(error, undefined, `the entry failed to start: ${error?.message}`)
  assert.equal(fiber.state, 2, 'the entry fiber must reach ACTIVE')
  assert.notEqual(root.get(STORE_KEY), undefined, `${STORE_KEY} must be provided`)
})

test('the `hub` service exists — the one the gateway resolves per call', async t => {
  // `TypertGatewayService.prepareInvocation` throws `gateway/service-unavailable`
  // when `ctx.get(descriptor.service)` is not an object, so a manifest can be
  // registered and the page can call it while this service is simply absent.
  const { root, dataDir } = await mountEntry()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const service = root.get(SERVICE_KEY)
  assert.notEqual(service, undefined, `active Service ${JSON.stringify(SERVICE_KEY)} is unavailable`)
  assert.equal(typeof service.list, 'function')
  const listed = service.list()
  assert.deepEqual(Object.keys(listed).sort(), ['items', 'statuses', 'version'])
  assert.equal(listed.version, 1)
  assert.deepEqual(listed.items, [])
  // A store that has never been written carries the built-in statuses, in the
  // order the contract fixes them.
  assert.deepEqual(
    listed.statuses.map(status => status.id),
    ['pending', 'doing', 'done', 'failed', 'onhold', 'cancelled'],
  )
})

test('the Remote declares the store it reads instead of assuming it', () => {
  assert.deepEqual(HubRemote.inject, [STORE_KEY])
})

test('the receipt is written after the Remote settles, and names the wire methods', async t => {
  const { root, logged, dataDir } = await mountEntry()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  assert.equal(logged.length, 1, `expected one receipt line, got ${logged.join(' | ')}`)
  assert.ok(!logged[0].startsWith('! '), `the Remote failed to mount: ${logged[0]}`)
  assert.deepEqual(describeRemote(root), {
    service: SERVICE_KEY,
    mounted: true,
    namespace: SERVICE_KEY,
    boundTo: SERVICE_KEY,
    // Markers carry the service's own method names; the receipt shows endpoints.
    methods: [
      'list:direct', 'create:direct', 'update:direct', 'delete:direct',
      'createStatus:direct', 'updateStatus:direct', 'deleteStatus:direct',
    ],
  })
})

test('the protocol reads back a marker on every published method', async t => {
  const { root, dataDir } = await mountEntry()
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))

  const markers = remoteMethods(root.get(SERVICE_KEY))
  assert.deepEqual(markers.map(marker => marker.method), [
    'list', 'create', 'update', 'remove',
    'createStatus', 'updateStatus', 'removeStatus',
  ])
})

test('a Remote started without its store is refused rather than half-mounted', async () => {
  // The constructor's own guard, which is what `static inject` exists to avoid
  // reaching: with no store the service must not appear at all, and the fiber
  // must park rather than fail — Cordis starts it when the store arrives.
  const root = new Context()
  let parked
  const fiber = root.plugin({
    name: 'hub-remote-alone',
    apply(ctx) {
      parked = ctx.plugin(HubRemote)
      return () => {}
    },
  })
  const outerError = await settle(fiber)
  assert.equal(outerError, undefined, 'a parked dependency must not fail the row')
  assert.notEqual(parked.state, 2, 'HubRemote must not activate while `hub-store` is missing')
  assert.equal(root.get(SERVICE_KEY), undefined)
})
