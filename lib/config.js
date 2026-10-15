/**
 * Row config: what the `hub-core` entry may set, and what an omitted field means.
 *
 * This lives in `lib/` rather than in `host.js` so `node --test` can cover it:
 * `host.js` imports `remote.js`, which imports
 * `@deepseek-ai/dsh-typert-protocol` — a package that exists only inside the
 * Harness, not in this checkout. `host.js` re-exports `Config` unchanged, so
 * the Loader still reads it from where AGENTS.md says it lives.
 *
 * `Config` below is a **hand-written Standard Schema, not a Schemastery
 * schema, and that is deliberate.** This package cannot resolve
 * `@deepseek-ai/schemastery` from a `link:`-installed bundle — that was
 * measured for the sibling bundle on the protocol package only, never for
 * schemastery, and this profile cannot measure it either. The risk is
 * asymmetric: a static import that fails to resolve takes the whole plugin
 * down, while the only thing a native schema buys is a nicer projection.
 *
 * **The visible cost: the Plugin Manager does not project a JSON Schema for
 * this row** — `Config.listConfigs` reports `status: 'unsupported'` for it,
 * because that projection recognises native Schemastery graphs. Nothing else
 * changes: defaults, type checks and per-field issues all behave. Users change
 * these two values by editing `config` in `cordis.patch.yml`, and the README
 * documents them there. So `unsupported` is the expected reading for this
 * entry, **not a bug** — and "tidying" this into
 * `import Schema from '@deepseek-ai/schemastery'` is the one refactor here
 * that would kill the plugin, so measure the resolution first if you consider
 * it.
 */
import { resolveDataDir } from './store.js'

/**
 * Defaults for the two tunables, in one place.
 *
 * Both the schema below and `resolveOptions` read them from here, so the value
 * a row omits and the value an unvalidated direct call falls back to can never
 * disagree. These are the same numbers `cordis.patch.yml` declares; the patch
 * is what a user edits, and this is only what an omitted field means.
 */
export const CONFIG_DEFAULTS = { dataDir: '', maxImageBytes: 2097152 }

/** Config keys this plugin understands; anything else is a typo worth naming. */
export const CONFIG_KEYS = Object.keys(CONFIG_DEFAULTS)

/**
 * The row's Config schema.
 *
 * Cordis validates plugin config through `Config['~standard'].validate` (see
 * `@deepseek-ai/cordis` `resolveConfig`) — the Standard Schema interface, not
 * Schemastery specifically. This package depends on nothing but
 * `@deepseek-ai/dsh-typert-protocol`, and a `link:`-installed bundle cannot be
 * relied on to resolve `@deepseek-ai/schemastery`, so the interface is
 * implemented directly: fill the defaults, type-check the declared fields, and
 * report every problem by path instead of throwing on the first one.
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-hub',
    validate(raw) {
      const input = raw === undefined || raw === null ? {} : raw
      if (typeof input !== 'object' || Array.isArray(input)) {
        return { issues: [{ message: 'config must be an object' }] }
      }
      const issues = []
      for (const key of Object.keys(input)) {
        if (CONFIG_KEYS.includes(key)) continue
        issues.push({ path: [key], message: `is not a config key of @hanmaxiao/dsh-hub; expected ${CONFIG_KEYS.join(', ')}` })
      }
      const value = { ...CONFIG_DEFAULTS, ...input }
      if (typeof value.dataDir !== 'string') {
        issues.push({ path: ['dataDir'], message: `must be a string, received ${typeof value.dataDir}` })
      }
      if (!Number.isInteger(value.maxImageBytes) || value.maxImageBytes <= 0) {
        issues.push({
          path: ['maxImageBytes'],
          message: `must be a positive whole number of decoded bytes, received ${JSON.stringify(value.maxImageBytes ?? null)}`,
        })
      }
      if (issues.length > 0) return { issues }
      return { value }
    },
  },
}

/**
 * Read the two fields off a row config.
 *
 * The `Config` schema has already normalised and type-checked this by the time
 * `apply` runs; doing it again costs nothing and keeps `apply` honest when it is
 * called directly (a test, or a future entry that builds a row itself).
 *
 * @param config The row's config object.
 * @returns `{ dataDir, maxImageBytes }`, both resolved and ready to use.
 */
export function resolveOptions(config) {
  const raw = config ?? {}
  const dataDir = resolveDataDir(typeof raw.dataDir === 'string' ? raw.dataDir : CONFIG_DEFAULTS.dataDir)
  const maxImageBytes = Number.isInteger(raw.maxImageBytes) && raw.maxImageBytes > 0
    ? raw.maxImageBytes
    : CONFIG_DEFAULTS.maxImageBytes
  return { dataDir, maxImageBytes }
}
