/**
 * Row config: defaults, validation, and the store paths they resolve to.
 *
 * `Config` is the only thing a user can tune without editing the plugin, so
 * these checks are about what a *wrong* value does: it must fail with a message
 * that names the field, never fall through to a silent default that hides the
 * typo.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { Config, CONFIG_DEFAULTS, CONFIG_KEYS, resolveOptions } from '../lib/config.js'
import { resolveDataDir } from '../lib/store.js'

/** Run the schema the way Cordis does, returning its result. */
function validate(raw) {
  return Config['~standard'].validate(raw)
}

/** Assert that `raw` is rejected, and return the issues it was rejected with. */
function issuesOf(raw) {
  const result = validate(raw)
  assert.ok(result.issues, `expected ${JSON.stringify(raw)} to be rejected`)
  return result.issues
}

test('the defaults are the ones the bundle patch declares', () => {
  assert.deepEqual(CONFIG_DEFAULTS, { dataDir: '', maxImageBytes: 2097152 })
  assert.deepEqual(CONFIG_KEYS, ['dataDir', 'maxImageBytes'])
})

test('an omitted config fills both defaults', () => {
  for (const raw of [undefined, null, {}]) {
    assert.deepEqual(validate(raw).value, { dataDir: '', maxImageBytes: 2097152 })
  }
})

test('a supplied value overrides the default', () => {
  assert.deepEqual(validate({ dataDir: 'sync/hub', maxImageBytes: 1048576 }).value, {
    dataDir: 'sync/hub',
    maxImageBytes: 1048576,
  })
})

test('a raised ceiling above the default is accepted', () => {
  assert.equal(validate({ maxImageBytes: 16 * 1024 * 1024 }).value.maxImageBytes, 16777216)
})

test('a non-positive or fractional ceiling is rejected naming the field', () => {
  for (const bad of [0, -1, 1.5, '2097152', null]) {
    const issues = issuesOf({ maxImageBytes: bad })
    assert.equal(issues.length, 1)
    assert.deepEqual(issues[0].path, ['maxImageBytes'])
  }
})

test('a non-string dataDir is rejected naming the field', () => {
  const issues = issuesOf({ dataDir: 42 })
  assert.equal(issues.length, 1)
  assert.deepEqual(issues[0].path, ['dataDir'])
})

test('an unknown key is rejected rather than ignored', () => {
  // `datadir` is the typo this catches; silently using the default store would
  // put the user's data somewhere they never chose.
  const issues = issuesOf({ datadir: 'sync/hub' })
  assert.equal(issues.length, 1)
  assert.deepEqual(issues[0].path, ['datadir'])
  assert.match(issues[0].message, /dataDir, maxImageBytes/)
})

test('every problem is reported at once, not one per restart', () => {
  const issues = issuesOf({ datadir: 'x', dataDir: 42, maxImageBytes: 0 })
  assert.deepEqual(issues.map(issue => issue.path[0]), ['datadir', 'dataDir', 'maxImageBytes'])
})

test('a non-object config is rejected without a path', () => {
  assert.equal(issuesOf('nope').length, 1)
  assert.equal(issuesOf([1, 2]).length, 1)
})

test('resolveOptions turns the defaults into the same path the store resolves', () => {
  const resolved = resolveOptions({})
  assert.equal(resolved.maxImageBytes, 2097152)
  assert.equal(resolved.dataDir, resolveDataDir(''))
})

test('resolveOptions reads a configured directory and ceiling', () => {
  const resolved = resolveOptions({ dataDir: 'sync/hub', maxImageBytes: 4096 })
  assert.equal(resolved.dataDir, path.resolve('sync/hub'))
  assert.equal(resolved.maxImageBytes, 4096)
})

test('resolveOptions survives a direct call that never went through the schema', () => {
  const resolved = resolveOptions({ maxImageBytes: -5 })
  assert.equal(resolved.maxImageBytes, 2097152)
})
