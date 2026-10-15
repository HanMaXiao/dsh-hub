/**
 * The TYPERT host manifest.
 *
 * `typert-loader` resolves a package's `exports["./typert"]`, imports it and
 * registers the manifest; the gateway then exposes every described invocation
 * to the page as `ctx.remote.<namespace>.<method>`. The manifest must be owned
 * by the package that exports it (`package` must equal the package name) and
 * pass `validateTypertManifest`, which requires:
 *
 * - `schemas`: an array (empty is fine — the field exists for the generated
 *   client stubs, which this hand-written package does not ship).
 * - `model`: `{ services, events, objects }`, each an array.
 * - `invocations`: one descriptor per Remote method, each carrying `id`,
 *   `service`, `namespace`, `method`, an `invocation` receiver, a `parameters`
 *   array and a `result` codec. A strict codec needs only
 *   `{ mode: 'strict', typeSymbol }` plus a `create()` factory.
 *
 * The parameter order below is not cosmetic: the gateway passes arguments in
 * the order this array lists (`descriptor.parameters.map(p => args[p.wire])`),
 * so a manifest whose order drifts from the method signature fails silently,
 * with each argument landing in the wrong parameter. Both files read the same
 * roster from `lib/remote-surface.js` so the two cannot drift.
 *
 * `implementation` is the one field that is allowed to disagree with `method`:
 * the gateway dispatches through `descriptor.implementation ?? descriptor.method`,
 * which is how a wire name the service cannot use still reaches a real method.
 * A published `method` may also not shadow the namespace service the gateway
 * mounts for it — see `lib/remote-surface.js` for why the delete is `delete`.
 */
import { implementationOf, REMOTE_METHODS } from './lib/remote-surface.js'

/** The package name, which the manifest must declare as its owner. */
const PACKAGE = '@hanmaxiao/dsh-hub'

/** Wire namespace promised by `remote.js` (`SERVICE_KEY`). */
const NAMESPACE = 'hub'

/**
 * One strict codec with a pass-through schema.
 *
 * The loader *requires* `create()` on every codec, and the gateway really does
 * call it (`gateway/lib/index.js`: `value = codec.create().parse(value)`), but
 * the generated manifests build that schema with `zod`, which a
 * `link:`-installed bundle cannot resolve (measured on the sibling bundle). A
 * plain object exposing `parse` satisfies both: the loader only checks
 * `typeof codec.create === 'function'`, and a pass-through `parse` is honest
 * for values this service validates itself in `lib/model.js` — which is the
 * only validator that gets a say over what reaches the disk. `encode` stays
 * absent, which the gateway treats as pass-through.
 *
 * @param typeSymbol Stable identity of the described value.
 * @returns A strict codec.
 */
const codec = typeSymbol => ({
  mode: 'strict',
  typeSymbol,
  create: () => ({ parse: value => value }),
})

/**
 * Describe one published method.
 *
 * @param entry A `lib/remote-surface.js` entry.
 * @returns One `TYPERT.invocations` descriptor.
 */
function describe(entry) {
  return {
    id: `${PACKAGE}#${NAMESPACE}/${entry.method}`,
    service: NAMESPACE,
    namespace: NAMESPACE,
    method: entry.method,
    // What the gateway dispatches with. It differs from `method` when the wire
    // name cannot be the service's own — see `lib/remote-surface.js`.
    implementation: implementationOf(entry),
    description: entry.result,
    invocation: { kind: 'direct' },
    parameters: entry.parameters.map(parameter => ({
      name: parameter.name,
      wire: parameter.name,
      source: 'json',
      description: parameter.description,
      codec: codec(`${PACKAGE}#${NAMESPACE}/${entry.method}/${parameter.name}`),
    })),
    result: codec(`${PACKAGE}#${NAMESPACE}/${entry.method}:result`),
  }
}

export const TYPERT = {
  package: PACKAGE,
  face: 'host',
  schemas: [],
  invocations: REMOTE_METHODS.map(describe),
  model: {
    services: [],
    events: [],
    objects: [],
  },
}

export default TYPERT
