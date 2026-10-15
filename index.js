/**
 * `@hanmaxiao/dsh-hub` — Host entry.
 *
 * `package.json` `exports["."]` points here, so this is the module the Loader
 * imports for the `hub-core` row: it mounts the store and the Typert Remote
 * (see `host.js`), and it re-exports the two faces a caller may want to reach
 * for directly — `remote.js`'s service, whose wire namespace is the `hub` the
 * panel reads, and `typert.js`'s manifest, which the loader resolves through
 * `exports["./typert"]`.
 *
 * The store's own logic is not re-exported here: it is reachable through the
 * service, and a second import path for it is a second way to get a stale one.
 */
export { apply, Config, contributions } from './host.js'
export { HubRemote, SERVICE_KEY, STORE_KEY, describeRemote, installRemoteMarkers } from './remote.js'
export { TYPERT } from './typert.js'
