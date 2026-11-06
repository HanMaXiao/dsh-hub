/**
 * Release guards: the version the package ships and the metadata the Plugin
 * Manager reads for it.
 *
 * Two facts have two homes, and neither pair is checked by a runtime test:
 *
 * - **The version.** `package.json` is what npm publishes and what a bundle is
 *   installed as; the changelog's newest heading is what a reader is told was
 *   released. Tagging is a manual step, so a bump that touched only one file
 *   would ship one version beside a changelog describing another.
 * - **The Plugin Manager card.** `locale/*.json` carries the two `meta`
 *   strings; the panel's own name and its three tabs live in `client.js`. A
 *   rename on either side leaves both files valid and the card naming a
 *   product, or a tab set, the panel no longer has.
 *
 * These assertions are about the files as shipped, so they read them rather
 * than import them: `client.js` is a bundle for the browser module table and
 * has no exports to exercise here.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = relative => readFileSync(path.join(root, '..', relative), 'utf8')

const pkg = JSON.parse(read('package.json'))
const changelog = read('CHANGELOG.md')
const panelSource = read('client.js')

/** A released version heading: `## [x.y.z] - yyyy-mm-dd`. */
const RELEASE = /^## \[([0-9]+(?:\.[0-9]+){2})\] - (\d{4}-\d{2}-\d{2})$/gm

/**
 * Every released version the changelog announces, in file order.
 *
 * @returns Version strings, newest first in a correct file.
 */
function releases() {
  const found = [...changelog.matchAll(RELEASE)].map(match => match[1])
  assert.ok(found.length > 0, 'the changelog announces no release')
  return found
}

/**
 * Compare two `x.y.z` versions.
 *
 * @returns A positive number when `left` is newer, negative when it is older.
 */
function compareVersions(left, right) {
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

/**
 * The text of one dictionary block in the panel bundle.
 *
 * The two dictionaries are object literals in the same file, so the block is
 * found by matching braces from its opening one — the reading the style guard
 * already uses for the icon artwork.
 *
 * @param name The identifier the block is declared with, `ZH` or `EN`.
 * @returns The block's source text.
 */
function dictionaryBlock(name) {
  const opening = panelSource.indexOf(`const ${name} = {`)
  assert.notEqual(opening, -1, `the ${name} dictionary moved; update the guard with it`)
  const start = panelSource.indexOf('{', opening)
  let depth = 0
  for (let index = start; index < panelSource.length; index += 1) {
    if (panelSource[index] === '{') depth += 1
    else if (panelSource[index] === '}') {
      depth -= 1
      if (depth === 0) return panelSource.slice(start, index + 1)
    }
  }
  assert.fail(`the ${name} dictionary does not close`)
}

/**
 * One string from a dictionary block.
 *
 * @param block The block's source text.
 * @param key The exact dictionary key.
 * @returns The value, unescaped no further than a quoted literal needs.
 */
function copyOf(block, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = new RegExp(`'${escaped}': '([^']*)'`).exec(block)
  assert.notEqual(found, null, `the panel dictionary has no ${key}`)
  return found[1]
}

// --- version ---------------------------------------------------------------

test('package.json ships the version the newest changelog heading announces', () => {
  // The two must move together: a package published under one version beside a
  // changelog that documents another is the release nobody can install.
  assert.match(pkg.version, /^[0-9]+\.[0-9]+\.[0-9]+$/, `package.json version "${pkg.version}" is not x.y.z`)
  assert.equal(releases()[0], pkg.version,
    `package.json says ${pkg.version}; the newest changelog heading says ${releases()[0]}`)
})

test('the changelog lists its releases newest first', () => {
  const found = releases()
  // Only the top heading is compared with `package.json`, so the file has to be
  // ordered: an older section above a newer one would make that comparison
  // name the wrong release.
  for (let index = 1; index < found.length; index += 1) {
    assert.ok(compareVersions(found[index - 1], found[index]) > 0,
      `${found[index - 1]} is above ${found[index]}, but is not the newer release`)
  }
})

// --- plugin manager metadata -----------------------------------------------

test('the locale files carry Plugin Manager metadata and nothing else', () => {
  // The panel's own copy lives in the bundle's dictionaries; a panel key here
  // would be a second home for the same string, and the two would drift the
  // moment one of them is edited.
  for (const name of ['zh', 'en']) {
    const locale = JSON.parse(read(`locale/${name}.json`))
    assert.deepEqual(Object.keys(locale), ['meta'], `${name}.json carries something besides meta`)
    assert.deepEqual(Object.keys(locale.meta).sort(), ['description', 'title'],
      `${name}.json's meta is not the two keys the Plugin Manager reads`)
  }
})

test('the Plugin Manager card names the panel and its three tabs', () => {
  // `meta.title` is the card's name for the same product the panel calls itself
  // from the bundle; `meta.description` advertises the three tabs. Both are
  // copied by hand, so each is held to the strings the panel actually uses.
  for (const [name, block] of [['zh', dictionaryBlock('ZH')], ['en', dictionaryBlock('EN')]]) {
    const locale = JSON.parse(read(`locale/${name}.json`))
    const panelTitle = copyOf(block, 'panel.title')
    assert.ok(locale.meta.title.startsWith(panelTitle),
      `${name}.json's title "${locale.meta.title}" does not name the panel "${panelTitle}"`)
    for (const key of ['tab.todo', 'tab.note', 'tab.prompt']) {
      const tab = copyOf(block, key)
      assert.ok(locale.meta.description.includes(tab),
        `${name}.json's description does not mention the ${tab} tab`)
    }
  }
})
