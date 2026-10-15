/**
 * Hub — the Client's only data path.
 *
 * The panel is a `dsh.client` bundle, and `host.call` / `styles.insert` belong
 * to the `cordis_run` dynamic-plugin runtime, so neither is available to it.
 * A Typert Remote is the one supported bridge: this service publishes four
 * methods, the gateway exposes them as `ctx.get('remote').hub.*` in the page,
 * and the panel reads that carrier lazily on every use.
 *
 * One deliberate departure from the shipped examples:
 *
 * - **No decorator syntax.** `@Remote` is TypeScript; this bundle is plain ESM
 *   with no build step. The protocol's `Remote` is an ordinary function whose
 *   factory form (`Remote({ mode })`) returns a decorator taking
 *   `(method, context)`, and a decorator context is just
 *   `{ private, static, name, addInitializer }`. Supplying that object by hand
 *   installs the very same prototype marker the compiler would — through the
 *   public API, not a copy of its internals.
 *
 * The schema itself is never mirrored here. The pass-through codecs in
 * `typert.js` are honest because `lib/model.js` validates every field before
 * anything reaches the disk, and because this service refuses a call it cannot
 * validate rather than forwarding a guess to the store.
 */
import { Remote, RemoteError, TypertRemoteService, remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { HubValidationError } from './lib/model.js'
import { implementationOf, REMOTE_METHODS } from './lib/remote-surface.js'
import { HubStoreError } from './lib/store.js'

/** Cordis service key: also the wire namespace, and the `remote.hub` service key. */
export const SERVICE_KEY = 'hub'

/** Cordis service key the store is provided under by `host.js`. */
export const STORE_KEY = 'hub-store'

/**
 * Install one Remote marker on an instance without decorator syntax.
 *
 * @param instance Live service instance.
 * @param method Public instance method name to mark.
 * @param options `{ mode?: 'stream', exportName?: string }`.
 */
function installRemoteMarker(instance, method, options = {}) {
  const pending = []
  const context = {
    private: false,
    static: false,
    name: method,
    addInitializer: initializer => pending.push(initializer),
  }
  const implementation = instance[method]
  if (typeof implementation !== 'function') {
    throw new Error(`dsh-hub: cannot mark "${method}" — it is not a method`)
  }
  if (options.mode === 'stream') Remote({ mode: 'stream' })(implementation, context)
  else if (options.exportName === undefined) Remote(implementation, context)
  else Remote(options.exportName)(implementation, context)
  // The initializer reads the prototype off its `this`, exactly as the
  // compiler-generated one does at class definition time.
  for (const initializer of pending) initializer.call(instance)
}

/**
 * Install every marker this service publishes.
 *
 * The marker names the method the **service** exposes, not the wire name: an
 * entry may publish a name its service does not use (`lib/remote-surface.js`
 * explains why the delete does), and the gateway dispatches through
 * `implementation`.
 *
 * Exported so the offline suite can check the marker through the protocol's own
 * reader on a bare class prototype — no Cordis context required.
 *
 * @param instance Service instance, or any object whose prototype should carry the markers.
 * @param methods `lib/remote-surface.js` entries, defaulting to this service's set.
 */
export function installRemoteMarkers(instance, methods = REMOTE_METHODS) {
  for (const entry of methods) {
    installRemoteMarker(instance, implementationOf(entry), entry.options ?? {})
  }
}

/**
 * Translate a store or model failure into the Remote's own error vocabulary.
 *
 * The panel needs the code to pick a message out of its dictionary and the
 * text to show, so both travel: `field` lets a form highlight one input, and
 * the reason lets the panel say "no such item" instead of "something broke".
 *
 * @param {unknown} error Whatever the call threw.
 * @returns {never} Always throws.
 */
function rethrow(error) {
  if (error instanceof HubValidationError) {
    throw new RemoteError('hub/invalid-item', error.message, { field: error.field, value: error.field })
  }
  if (error instanceof HubStoreError) {
    throw new RemoteError(`hub/${error.reason}`, error.message, { reason: error.reason })
  }
  throw error
}

/** The browser-facing surface: full CRUD over one JSON document. */
export class HubRemote extends TypertRemoteService {
  /**
   * The store this service reads.
   *
   * Declared, not assumed. `ctx.provide()` registers inside `ctx.fiber.effect()`
   * and `ctx.get()` treats a service whose fiber is not yet ACTIVE as absent,
   * so a `HubRemote` started in the same tick as the provide finds nothing and
   * throws — while the entry stays ACTIVE and the only symptom is
   * `gateway/service-unavailable` at the first call. Cordis parks a fiber with
   * an unmet `inject` and starts it once the dependency is live, which is the
   * only ordering that works here.
   */
  static inject = [STORE_KEY]

  /**
   * @param ctx Host context carrying the store `host.js` provided.
   */
  constructor(ctx) {
    super(ctx, SERVICE_KEY, { namespace: SERVICE_KEY })
    const store = ctx.get(STORE_KEY)
    if (store === undefined) {
      throw new Error(`dsh-hub: the "${STORE_KEY}" service is not available, so the Remote has nothing to read`)
    }
    this.store = store
    installRemoteMarkers(this)
  }

  /**
   * Every stored item.
   *
   * The whole document travels, images included: `list` is the Client's only
   * read, and the panel never re-reads per item. Queries over the result are
   * the Client's alone (DESIGN §6).
   *
   * @returns `{ version, items }`.
   */
  list() {
    try {
      return { version: this.store.document.version, items: this.store.list() }
    }
    catch (error) {
      rethrow(error)
    }
  }

  /**
   * Store one new item.
   *
   * @param draft A DESIGN §5 item, `kind` included. The calling tab knows which
   *   kind it is, so the Host never guesses it: there is no defensible default,
   *   and guessing would file a note as a TODO. The Host fills `id`,
   *   `createdAt` and `updatedAt`.
   * @returns The stored item.
   */
  create(draft) {
    try {
      return this.store.create(draft)
    }
    catch (error) {
      rethrow(error)
    }
  }

  /**
   * Change the fields named by `patch`.
   *
   * @param id The item's id.
   * @param patch The fields to change; `id`, `kind` and `createdAt` are refused.
   * @returns The rewritten item.
   */
  update(id, patch) {
    try {
      return this.store.update(id, patch)
    }
    catch (error) {
      rethrow(error)
    }
  }

  /**
   * Delete one item.
   *
   * Published as the wire method `delete`: `remove` is taken by the gateway's
   * own namespace service, which refuses a mounted method that would shadow one
   * of its members (`lib/remote-surface.js`).
   *
   * @param id The item's id.
   * @returns The deleted item, so the panel can offer an undo.
   */
  remove(id) {
    try {
      return this.store.remove(id)
    }
    catch (error) {
      rethrow(error)
    }
  }
}

export default HubRemote

/** The wire name a marked method is published under, falling back to its own name. */
const wireNameOf = method =>
  REMOTE_METHODS.find(entry => implementationOf(entry) === method)?.method ?? method

/**
 * Describe the live Remote binding for the operator's log.
 *
 * The marker is installed by hand (see the module doc), so the protocol's own
 * reader is the only authority on whether it landed: `remoteMethods()` returns
 * exactly what the gateway will export. A log that reported a mounted service
 * while the marker was missing would be worse than no log. Markers carry the
 * method the service exposes, so the list is translated to the wire names the
 * endpoints actually use.
 *
 * @param ctx Host context the service was mounted on.
 * @returns Receipt fields describing the service, its binding and its markers.
 */
export function describeRemote(ctx) {
  const instance = ctx.get?.(SERVICE_KEY)
  if (instance === undefined) {
    return { service: SERVICE_KEY, mounted: false }
  }
  const markers = remoteMethods(instance)
  return {
    service: SERVICE_KEY,
    mounted: true,
    namespace: instance.typertRemote?.namespace ?? null,
    boundTo: instance.typertRemote?.serviceKey ?? null,
    methods: markers.map(marker => `${wireNameOf(marker.method)}:${marker.mode === 'stream' ? 'stream' : 'direct'}`),
  }
}
