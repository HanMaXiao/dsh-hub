/**
 * The TYPERT manifest, checked against the roster the Remote marks.
 *
 * `remote.js` is read as text rather than imported, so these checks describe the
 * source's shape without running it: a method the class does not define would
 * still leave a perfectly valid manifest behind — the loader validates the
 * manifest, never the service. What *can* be checked offline is the contract
 * that breaks silently: the manifest must describe exactly the methods
 * `remote.js` marks, in the order the gateway will pass them, and every field
 * `validateTypertManifest` requires must be present. The checks below mirror
 * that validator's requirements.
 *
 * This bundle's `@deepseek-ai/dsh-typert-protocol` is installed, not Harness-only
 * — an earlier version of this comment said otherwise and the belief cost the
 * offline coverage of the Host entry. `tests/host-entry.test.js` now mounts it
 * for real. Reading the source here stays the right tool for *these*
 * assertions, which are about text.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { REMOTE_METHOD_NAMES, REMOTE_METHODS, implementationOf } from '../lib/remote-surface.js'
import TYPERT from '../typert.js'

const PACKAGE = '@hanmaxiao/dsh-hub'
const NAMESPACE = 'hub'

/**
 * Names the gateway refuses to mount on a namespace service.
 *
 * `RemoteNamespaceService.assertMethodAvailable` rejects a method that is one
 * of the first set, or that already exists on the class prototype the gateway
 * installs — the second set is that prototype's own members, which include the
 * `remove(kind, method, token)` helper that a delete would otherwise shadow.
 * Pinned here because the gateway is not importable offline; re-derive it from
 * `dsh-api-gateway/src/client/index.ts` after a Harness upgrade.
 */
const RESERVED_METHODS = new Set([
  'ctx', 'empty', 'invokeRemote', 'methods', 'name', 'namespace',
  'constructor', 'assertMethodAvailable', 'has', 'installDirect', 'installScoped',
  'install', 'remove',
])

const REMOTE_SOURCE = readFileSync(fileURLToPath(new URL('../remote.js', import.meta.url)), 'utf8')

/**
 * The public methods `HubRemote` declares, read from source.
 *
 * `remote.js` cannot be imported here (its protocol package only exists inside
 * the Harness), and a method the class does not define would still leave a
 * perfectly valid manifest behind — the loader validates the manifest, never
 * the service. So the class body is read as text instead: two-space indentation
 * is what separates its methods from the module-level helpers above it.
 *
 * @returns `[{ name, parameters }]` in declaration order.
 */
function declaredMethods() {
  const body = REMOTE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const start = body.indexOf('export class HubRemote')
  assert.notEqual(start, -1, 'remote.js should declare HubRemote')
  const declarations = [...body.slice(start).matchAll(/^ {2}(?:async )?([A-Za-z][\w$]*)\(([^)]*)\) \{/gm)]
  // `constructor` is how the class gets its store and its markers, not a
  // published method: the marker installer only touches the roster.
  return declarations
    .filter(match => match[1] !== 'constructor')
    .map(match => ({
      name: match[1],
      parameters: match[2].split(',').map(parameter => parameter.trim()).filter(parameter => parameter !== ''),
    }))
}

test('HubRemote implements exactly the roster, in the roster order', () => {
  // The class is compared on the method it *exposes*; the wire name may differ
  // where the gateway reserves the service's own name.
  assert.deepEqual(declaredMethods().map(method => method.name), REMOTE_METHODS.map(implementationOf))
})

test('no published method shadows the namespace service the gateway mounts', () => {
  // The refusal is `client api: method "hub/<name>" conflicts with its
  // namespace service`, raised while mounting — before any call is possible.
  for (const method of REMOTE_METHOD_NAMES) {
    assert.ok(!RESERVED_METHODS.has(method), `hub/${method} is reserved by the namespace service`)
  }
})

test('an implementation is only declared where the wire name differs from it', () => {
  for (const entry of REMOTE_METHODS) {
    const invocation = TYPERT.invocations.find(candidate => candidate.method === entry.method)
    // `implementation` names the service method the gateway dispatches with
    // (`descriptor.implementation ?? descriptor.method`); a manifest that points
    // at a method the class does not declare fails at call time, not at load.
    assert.equal(invocation.implementation, implementationOf(entry))
    assert.ok(declaredMethods().some(method => method.name === invocation.implementation),
      `hub/${entry.method} dispatches to ${invocation.implementation}, which HubRemote does not declare`)
  }
})

test('each HubRemote method takes exactly the parameters the manifest passes it', () => {
  // The gateway dispatches positionally, so a parameter renamed on one side and
  // not the other hands the value to the wrong argument without any error.
  for (const declared of declaredMethods()) {
    const entry = REMOTE_METHODS.find(candidate => implementationOf(candidate) === declared.name)
    assert.ok(entry !== undefined, `HubRemote.${declared.name} is not in the roster`)
    assert.deepEqual(
      declared.parameters,
      entry.parameters.map(parameter => parameter.name),
      `${declared.name} should take (${entry.parameters.map(p => p.name).join(', ')})`,
    )
  }
})

test('the manifest is owned by this package and faces the Host', () => {
  assert.equal(TYPERT.package, PACKAGE)
  assert.equal(TYPERT.face, 'host')
  assert.ok(Array.isArray(TYPERT.schemas))
  assert.deepEqual(Object.keys(TYPERT.model).sort(), ['events', 'objects', 'services'])
  for (const key of ['services', 'events', 'objects']) assert.ok(Array.isArray(TYPERT.model[key]))
})

test('the manifest describes exactly the methods the Remote marks', () => {
  assert.deepEqual(TYPERT.invocations.map(entry => entry.method), REMOTE_METHOD_NAMES)
  assert.deepEqual(REMOTE_METHOD_NAMES, [
    'list', 'create', 'update', 'delete',
    'createStatus', 'updateStatus', 'deleteStatus',
  ])
})

test('every invocation carries the fields validateTypertManifest requires', () => {
  for (const invocation of TYPERT.invocations) {
    for (const key of ['id', 'service', 'namespace', 'method']) {
      assert.equal(typeof invocation[key], 'string', `${invocation.method}.${key}`)
      assert.ok(invocation[key].length > 0, `${invocation.method}.${key} must not be empty`)
    }
    assert.equal(invocation.service, NAMESPACE)
    assert.equal(invocation.namespace, NAMESPACE)
    // `implementation` is what the gateway calls; naming anything else publishes
    // a method that does not exist.
    assert.ok(typeof invocation.implementation === 'string' && invocation.implementation.length > 0)
    assert.equal(invocation.invocation.kind, 'direct')
    assert.ok(Array.isArray(invocation.parameters))
  }
})

test('invocation ids are unique and namespaced to this package', () => {
  const ids = TYPERT.invocations.map(entry => entry.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.ok(id.startsWith(`${PACKAGE}#${NAMESPACE}/`), id)
})

test('parameters are in the same order as the method signature they describe', () => {
  // The gateway dispatches positionally from this array, so a drift here hands
  // each argument to the wrong parameter without any error at load time.
  for (const entry of TYPERT.invocations) {
    const invocation = TYPERT.invocations.find(candidate => candidate.method === entry.method)
    assert.deepEqual(invocation.parameters.map(parameter => parameter.name), entry.parameters.map(parameter => parameter.name))
  }
  const update = TYPERT.invocations.find(entry => entry.method === 'update')
  assert.deepEqual(update.parameters.map(parameter => parameter.name), ['id', 'patch'])
  assert.deepEqual(TYPERT.invocations.find(entry => entry.method === 'list').parameters, [])
  const remove = TYPERT.invocations.find(entry => entry.method === 'delete')
  assert.deepEqual(remove.parameters.map(parameter => parameter.name), ['id'])
})

test('the delete is published as `delete` and reaches `remove`', () => {
  // `remove` belongs to the gateway's own namespace service, so it can never be
  // the published name; `implementation` is what carries the call to the Host.
  assert.ok(REMOTE_METHOD_NAMES.includes('delete'))
  assert.ok(!REMOTE_METHOD_NAMES.includes('remove'))
  assert.equal(TYPERT.invocations.find(entry => entry.method === 'delete').implementation, 'remove')
})

test('the status trio is published as createStatus, updateStatus and deleteStatus', () => {
  // The wire vocabulary says "delete" and the service's own says "remove",
  // exactly as the item pair does; `deleteStatus` shadows nothing on the
  // namespace service, and `removeStatus` is what keeps the two halves parallel.
  assert.ok(REMOTE_METHOD_NAMES.includes('createStatus'))
  assert.ok(REMOTE_METHOD_NAMES.includes('updateStatus'))
  assert.ok(REMOTE_METHOD_NAMES.includes('deleteStatus'))
  assert.ok(!REMOTE_METHOD_NAMES.includes('removeStatus'))
  assert.equal(TYPERT.invocations.find(entry => entry.method === 'deleteStatus').implementation, 'removeStatus')
})

test('the status trio carries its parameters in the wire order', () => {
  // The gateway dispatches positionally, so a drift here hands each argument to
  // the wrong parameter without any error at load time. The Host side of the
  // same order is checked against the roster above.
  const create = TYPERT.invocations.find(entry => entry.method === 'createStatus')
  assert.deepEqual(create.parameters.map(parameter => parameter.name), ['draft'])
  const update = TYPERT.invocations.find(entry => entry.method === 'updateStatus')
  assert.deepEqual(update.parameters.map(parameter => parameter.name), ['id', 'patch'])
  const remove = TYPERT.invocations.find(entry => entry.method === 'deleteStatus')
  assert.deepEqual(remove.parameters.map(parameter => parameter.name), ['id'])
})

test('wires are unique inside an invocation and carry a json source', () => {
  for (const invocation of TYPERT.invocations) {
    const wires = invocation.parameters.map(parameter => parameter.wire)
    assert.equal(new Set(wires).size, wires.length, `${invocation.method} repeats a wire`)
    for (const parameter of invocation.parameters) {
      assert.equal(parameter.source, 'json')
      assert.equal(parameter.wire, parameter.name)
      assert.equal(parameter.lookup, undefined)
    }
  }
})

test('no invocation declares cancellation, because none of the calls can be aborted', () => {
  // A store write is a rename; there is nothing to interrupt, and declaring a
  // signal the method does not take would silently shift every argument.
  for (const invocation of TYPERT.invocations) assert.equal(invocation.cancellation, undefined)
})

test('every codec satisfies the loader: strict, named, and creatable', () => {
  const codecs = TYPERT.invocations.flatMap(invocation => [...invocation.parameters.map(p => p.codec), invocation.result])
  for (const codec of codecs) {
    assert.equal(codec.mode, 'strict')
    assert.equal(typeof codec.typeSymbol, 'string')
    assert.ok(codec.typeSymbol.length > 0)
    assert.equal(typeof codec.create, 'function')
    const schema = codec.create()
    assert.equal(typeof schema.parse, 'function')
    assert.equal(schema.parse('unchanged'), 'unchanged')
  }
})

test('the roster describes every published method, so a new method must be added there', () => {
  for (const entry of REMOTE_METHODS) {
    assert.equal(typeof entry.method, 'string')
    assert.ok(entry.method.length > 0)
    assert.ok(Array.isArray(entry.parameters))
    assert.equal(typeof entry.result, 'string')
  }
})
