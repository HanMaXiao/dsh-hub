/**
 * The Client half's Remote bridge, checked against the Host's roster.
 *
 * `client.js` cannot be imported here: it is a browser bundle that calls
 * `window.__ModuleLoader__`, and the descriptors it mounts are private to the
 * factory closure — the factory exports `inject` and `apply` and nothing else.
 * What *can* be checked offline is the contract that broke silently and cost a
 * release: the client must mount a contribution of its own, must read the
 * namespace from `remote.hub` rather than off the `remote` carrier, and must
 * describe exactly the methods `remote.js` marks, in the order the gateway
 * passes them.
 *
 * So the source is read as text, the same way `typert.test.js` reads
 * `remote.js`. The assertions below mirror `validateInvocation` in
 * `dsh-typert-registry` and `requireStrictInputs` in `dsh-api-gateway`: the two
 * functions that actually refuse a malformed contribution.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { REMOTE_METHODS } from '../lib/remote-surface.js'

const PACKAGE = '@hanmaxiao/dsh-hub'
const NAMESPACE = 'hub'

/** Cordis service key of the gateway's client carrier, as `client.js` names it. */
const REMOTE_KEY = 'remote'

const CLIENT_SOURCE = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')

/**
 * The roster `client.js` hands to `ctx.remote.$mount()`, read from source.
 *
 * Each entry is one `clientInvocation(method, [parameters])` call, so the
 * method and its wire-ordered parameter names are both literal in the text.
 *
 * @returns `[{ method, parameters }]` in source order.
 */
function mountedDescriptors() {
  const calls = [...CLIENT_SOURCE.matchAll(/clientInvocation\('([A-Za-z]\w*)',\s*\[([^\]]*)\]\)/g)]
  assert.notEqual(calls.length, 0, 'client.js should build a contribution')
  return calls.map(call => ({
    method: call[1],
    parameters: call[2]
      .split(',')
      .map(name => name.trim().replace(/^'|'$/g, ''))
      .filter(name => name !== ''),
  }))
}

test('the client mounts exactly the methods the Remote marks, in order', () => {
  assert.deepEqual(
    mountedDescriptors().map(entry => entry.method),
    REMOTE_METHODS.map(entry => entry.method),
  )
})

test('each mounted method takes the parameters the gateway passes it', () => {
  // `prepareInvocation` refuses a wrong argument count at call time, so a drift
  // between the mounted roster and the Host signature is a runtime failure with
  // a message nobody reads.
  for (const mounted of mountedDescriptors()) {
    const entry = REMOTE_METHODS.find(candidate => candidate.method === mounted.method)
    assert.deepEqual(mounted.parameters, entry.parameters.map(parameter => parameter.name))
  }
})

test('the contribution is mounted by the entry itself, not read off the carrier', () => {
  // The base ships client-side mounts only for its own generated contributions
  // (`@deepseek-ai/dsh-api-remotes`), and the typert loader discovers `./typert`
  // on the Host only. Without this call the namespace service never exists.
  assert.match(CLIENT_SOURCE, /\$mount\(CONTRIBUTION\)/, 'client.js must mount its own contribution')
  assert.match(CLIENT_SOURCE, /const CONTRIBUTION = \{\s*package: PACKAGE/, 'the contribution must name this package')
})

test('the namespace is its own `remote.<namespace>` service, never a property of `remote`', () => {
  // `remoteServiceKey` in `dsh-api-gateway` registers each namespace as its own
  // Cordis service. Reading `ctx.get('remote')?.hub` is the bug this guards:
  // that carrier only ever carries `$mount`, `$stream`, `$host` and `$on`.
  assert.match(CLIENT_SOURCE, new RegExp(`const HUB_KEY = '${REMOTE_KEY}\\.${NAMESPACE}'`))
  assert.match(CLIENT_SOURCE, new RegExp(`readNamespace = \\(\\) => ctx\\.get\\(HUB_KEY\\)`))
  assert.doesNotMatch(CLIENT_SOURCE, /\?\.\s*hub\b/, 'the namespace is not a property of the remote carrier')
})

test('the delete is mounted as `delete` over the Host\'s `remove`', () => {
  // The gateway's namespace service owns `remove` and refuses a mounted method
  // that shadows it, so the wire name can never be the service's own.
  assert.match(CLIENT_SOURCE, /clientInvocation\('delete', \['id'\]\), implementation: 'remove'/)
  assert.doesNotMatch(CLIENT_SOURCE, /clientInvocation\('remove'/, '`remove` cannot be a published name')
  assert.match(CLIENT_SOURCE, /hubCall\('delete', id\)/)
})

test('every mounted descriptor carries the fields validateInvocation requires', () => {
  // Rebuilt from the roster with the same rules `clientInvocation` applies, so
  // a future edit that drops a required field fails here rather than in the page.
  for (const entry of REMOTE_METHODS) {
    const descriptor = {
      id: `${PACKAGE}#${NAMESPACE}/${entry.method}`,
      service: NAMESPACE,
      namespace: NAMESPACE,
      method: entry.method,
      invocation: { kind: 'direct' },
      parameters: entry.parameters.map(parameter => ({
        name: parameter.name,
        wire: parameter.name,
        source: 'json',
      })),
    }
    assert.equal(descriptor.service, NAMESPACE)
    assert.equal(descriptor.namespace, NAMESPACE)
    assert.equal(descriptor.invocation.kind, 'direct')
    const wires = descriptor.parameters.map(parameter => parameter.wire)
    assert.equal(new Set(wires).size, wires.length, `${entry.method} repeats a wire`)
    for (const wire of [...wires, descriptor.namespace, descriptor.method]) {
      assert.match(wire, /^[A-Za-z0-9_$.-]+$/, `${entry.method} has a wire name the registry refuses`)
    }
  }
  assert.match(CLIENT_SOURCE, /mode: 'strict'/, 'the pass-through codec must stay strict')
  assert.match(CLIENT_SOURCE, /create: \(\) => \(\{ parse: value => value \}\)/, 'the codec needs a create() factory')
})

test('a mounted call answers with a RemoteResult envelope, and hubCall unwraps it', () => {
  // The gateway never throws a business failure: carrier loss, cancellation and
  // every Host `RemoteError` arrive as `{ ok: false, error }`. Reading `.value`
  // without testing `ok` would show the user's data as `undefined`.
  assert.match(CLIENT_SOURCE, /result\.ok !== true/, 'hubCall must branch on the envelope')
  assert.match(CLIENT_SOURCE, /return result\.value/, 'hubCall must return the decoded payload')
  assert.match(CLIENT_SOURCE, /throw bridgeFailure/, 'a failed mount must reach the panel as its reason')
})

test('the panel still shows a failure state instead of failing to mount', () => {
  // A thrown `apply` leaves the seat unregistered and the panel invisible, which
  // reports less than the reason a refused mount carries.
  assert.match(CLIENT_SOURCE, /catch \(error\) \{\s*\/\/ Swallowed on purpose/, 'a refused mount must not reject the entry')
  assert.match(CLIENT_SOURCE, /inject: \['slots', 'locale'\]/)
})
