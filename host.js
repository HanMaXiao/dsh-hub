/**
 * Hub — Host half.
 *
 * Mounts two things and nothing else: the JSON store, and the Typert Remote the
 * panel talks to. There is no tool, no skill and no Agent-facing surface here —
 * a person drives this plugin through its panel, and the Host's whole job is to
 * make the bytes behind that panel correct and durable.
 *
 * Every registration goes through `ctx.effect()` and hands back its disposer,
 * so unloading the `hub-core` row withdraws the Remote and forgets the store
 * instead of leaving either behind for the next profile to trip over.
 */
import { Config, CONFIG_DEFAULTS, CONFIG_KEYS, resolveOptions } from './lib/config.js'
import { HubStore } from './lib/store.js'
import { describeRemote, HubRemote, SERVICE_KEY, STORE_KEY } from './remote.js'

export { Config }

/**
 * Mount the Host half.
 *
 * The store is opened here, not on first use, so a damaged file fails the row
 * loudly at startup with its path in the message. The panel's own failure state
 * is then a truthful report of a plugin that never mounted, rather than a click
 * that silently starts a second, empty store somewhere else.
 *
 * Registration order is not what makes the Remote safe — `HubRemote` declares
 * `hub-store` in its `inject`, so Cordis starts it once the store is live. The
 * receipt is written after that fiber settles, because a receipt printed while
 * it is merely parked would report a service that is not there yet and send the
 * reader looking in the wrong place.
 *
 * @param ctx Cordis context of the `hub-core` loader row.
 * @param config `{ dataDir, maxImageBytes }` from that row.
 * @returns The opened store, for a caller that wants to inspect it.
 */
export function apply(ctx, config = {}) {
  const options = resolveOptions(config)
  const store = new HubStore({ dataDir: options.dataDir, maxImageBytes: options.maxImageBytes })

  // The store is a service so the Remote can depend on it without importing
  // this module back: `hub` is the wire namespace and must stay a leaf.
  ctx.effect(() => ctx.provide(STORE_KEY, store), 'dsh-hub: JSON store')
  ctx.effect(() => {
    const remote = ctx.plugin(HubRemote)
    // `ctx.get`, never `ctx.logger`: Cordis throws on a service property read
    // the plugin did not declare in `inject`, and this row declares none. That
    // throw used to happen inside this effect, where nothing reported it, so
    // the receipt line the operator is told to look for never appeared.
    const logger = ctx.get('logger')
    void remote.then(
      () => {
        // The markers are installed by hand, so only the protocol's own reader
        // knows whether they landed; log what the gateway will actually export.
        logger?.info?.('dsh-hub: %s', JSON.stringify(describeRemote(ctx)))
      },
      // A Remote that cannot mount leaves the row ACTIVE and the panel with no
      // data, so it is named here and not only at the first call.
      error => logger?.error?.(
        'dsh-hub: the Hub Remote did not mount: %s',
        error instanceof Error ? error.message : String(error),
      ),
    )
    return remote
  }, 'dsh-hub: Hub Remote')

  return store
}

/** Static description of what this half contributes, for diagnostics and tests. */
export const contributions = {
  service: SERVICE_KEY,
  storeService: STORE_KEY,
  configKeys: CONFIG_KEYS,
  configDefaults: { ...CONFIG_DEFAULTS },
}
