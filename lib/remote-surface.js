/**
 * The Remote's method roster, shared by `remote.js` and `typert.js`.
 *
 * The loader validates the manifest but cannot validate it against the service:
 * a method marked on the class and missing from `TYPERT.invocations` (or the
 * other way round) only shows up at call time, as a missing export in the page.
 * Both files therefore read this one list, and `tests/` asserts the manifest
 * still describes exactly it.
 *
 * It imports nothing on purpose. `remote.js` needs
 * `@deepseek-ai/dsh-typert-protocol`, which a `link:`-installed bundle cannot
 * always resolve; keeping the roster dependency-free means the contract between
 * marker and manifest stays testable offline, where that package is absent.
 */

/**
 * One published method.
 *
 * `method` is the **wire** name — the endpoint segment `<namespace>/<method>`
 * and the property the Client calls. `implementation` is the method the service
 * actually exposes, and it exists because the two cannot always coincide: the
 * gateway dispatches with `descriptor.implementation ?? descriptor.method`, so
 * an entry may publish a name its service does not use. Omit it when they match.
 *
 * A published name may not collide with the namespace service the gateway
 * installs for it. `RemoteNamespaceService.assertMethodAvailable` refuses any
 * method that is one of `ctx`, `empty`, `invokeRemote`, `methods`, `name`,
 * `namespace`, or that already exists on `RemoteNamespaceService.prototype` —
 * which includes its own `remove(kind, method, token)` helper. That is why the
 * delete publishes as `delete` over an implementation named `remove`.
 *
 * `parameters` is the wire order, and the gateway passes arguments in exactly
 * this order (see the gateway's `callService`), so it is also the JavaScript
 * parameter order of the method it names.
 *
 * @typedef {{ method: string, implementation?: string, parameters: { name: string, description: string }[], result: string }} RemoteMethod
 */

/** The method the service exposes for an entry, falling back to the wire name. */
export const implementationOf = entry => entry.implementation ?? entry.method

/** @type {readonly RemoteMethod[]} */
export const REMOTE_METHODS = [
  {
    method: 'list',
    parameters: [],
    result: '{ version, items: Item[], statuses: Status[] } — the whole store; the Client owns every query over it',
  },
  {
    method: 'create',
    parameters: [
      {
        name: 'draft',
        description: 'One item in its DESIGN §5 shape, including its `kind` — the calling tab knows which kind it is, so the Host never guesses it; the Host fills `id`, `createdAt` and `updatedAt`',
      },
    ],
    result: 'the stored item, verbatim',
  },
  {
    method: 'update',
    parameters: [
      { name: 'id', description: 'Id of the item to change' },
      { name: 'patch', description: 'The fields to change; id, kind and createdAt are refused' },
    ],
    result: 'the rewritten item, verbatim',
  },
  {
    method: 'delete',
    implementation: 'remove',
    parameters: [
      { name: 'id', description: 'Id of the item to delete' },
    ],
    result: 'the deleted item, so the Client can offer an undo',
  },
  {
    method: 'createStatus',
    parameters: [
      {
        name: 'draft',
        description: 'One status definition — `label` is required, `tone` defaults to `neutral` and `done` to false; the Host mints the `id`',
      },
    ],
    result: 'the stored status, verbatim',
  },
  {
    method: 'updateStatus',
    parameters: [
      { name: 'id', description: 'Id of the status to change' },
      {
        name: 'patch',
        description: 'The fields to change — `label`, `tone`, `done` or `order`; a written `label` drops the status\'s own locale key',
      },
    ],
    result: 'the rewritten status, verbatim',
  },
  /*
   * The delete half of the status trio publishes as `deleteStatus` over an
   * implementation named `removeStatus`. The gateway dispatches through
   * `descriptor.implementation ?? descriptor.method`, and its
   * `RemoteNamespaceService` refuses a mounted method that shadows one of its
   * own members (`remove`, `install`, `has`, `empty`, `name`, `methods`,
   * `namespace`, `invokeRemote`, `ctx`). `deleteStatus` shadows none of them —
   * `removeStatus` is what keeps the service's own vocabulary in step with the
   * `remove`/`delete` pair above, so the wire says "delete" and the service says
   * "remove".
   */
  {
    method: 'deleteStatus',
    implementation: 'removeStatus',
    parameters: [
      { name: 'id', description: 'Id of the status to delete' },
    ],
    result: 'the deleted status, so the Client can offer an undo',
  },
]

/** Every published method name, for a lookup that does not need the metadata. */
export const REMOTE_METHOD_NAMES = REMOTE_METHODS.map(entry => entry.method)
