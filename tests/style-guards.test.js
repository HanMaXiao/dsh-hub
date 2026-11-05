/**
 * The panel's style and copy guardrails, read as text.
 *
 * Three rules in `AGENTS.md` are only checkable from the source's shape, and
 * each has a failure mode that no render test catches:
 *
 * - **Zero emoji, anywhere.** An emoji is a Unicode pictograph with no
 *   `aria-label`, it renders differently on every platform, and in this
 *   application it is the one affordance a screen reader cannot name.
 * - **All colour is `--dsw-alias-*`.** A literal in the panel's own stylesheet
 *   does not follow the three-state theme, so it is legible in one mode and
 *   invisible in the other — a defect that only shows up for the users in the
 *   other mode. Icon artwork is the documented exception.
 * - **The two dictionaries carry the same keys.** `locale.register` refuses a
 *   half-translated dictionary, and a key present in one file and absent from
 *   the other is exactly that half.
 *
 * These assertions are about the source as written, so they read the file
 * rather than import it: `client.js` is a bundle for the browser module table
 * and has no imports to exercise here.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const panelSource = readFileSync(path.join(root, '..', 'client.js'), 'utf8')
const zh = JSON.parse(readFileSync(path.join(root, '..', 'locale', 'zh.json'), 'utf8'))
const en = JSON.parse(readFileSync(path.join(root, '..', 'locale', 'en.json'), 'utf8'))

/** Every pictographic code point, which is what an emoji is. */
const PICTOGRAPH = /\p{Extended_Pictographic}/gu

/**
 * The panel source with the icon artwork removed.
 *
 * `AGENTS.md` allows literal colour inside icon artwork and nowhere else, so
 * the guard has to see the artwork as a separate region rather than skip a
 * range it guesses at. The block is found by matching braces from its opening
 * one, which is enough for a hand-written object literal.
 *
 * @returns The source that must be token-only.
 */
function outsideIconArtwork() {
  const opening = panelSource.indexOf('const ICONS = {')
  assert.notEqual(opening, -1, 'the icon block moved; update the guard with it')
  const start = panelSource.indexOf('{', opening)
  let depth = 0
  for (let index = start; index < panelSource.length; index += 1) {
    if (panelSource[index] === '{') depth += 1
    else if (panelSource[index] === '}') {
      depth -= 1
      if (depth === 0) return panelSource.slice(0, start) + panelSource.slice(index + 1)
    }
  }
  assert.fail('the icon block does not close')
}

/** Dotted paths of every leaf key in a nested dictionary. */
function keysOf(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => {
    const full = prefix === '' ? key : `${prefix}.${key}`
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? keysOf(value, full)
      : [full]
  })
}

// --- emoji -----------------------------------------------------------------

test('the panel source carries no emoji', () => {
  // A pictograph here is always a missing SVG: the file has an ICONS block for
  // exactly this, and every affordance it draws carries an aria-label.
  const found = [...panelSource.matchAll(PICTOGRAPH)].map(match => match[0])
  assert.deepEqual(found, [], `replace each pictograph with an ICONS entry: ${found.join(' ')}`)
})

test('neither dictionary ships an emoji to the user', () => {
  for (const [name, dictionary] of [['zh.json', zh], ['en.json', en]]) {
    const values = keysOf(dictionary).map(key => key.split('.').reduce((node, part) => node[part], dictionary))
    const found = values.flatMap(value => [...String(value).matchAll(PICTOGRAPH)].map(match => match[0]))
    assert.deepEqual(found, [], `${name} carries a pictograph: ${found.join(' ')}`)
  }
})

// --- colour ----------------------------------------------------------------

test('no colour literal survives outside the icon artwork', () => {
  const guarded = outsideIconArtwork()
  // Hex and the two functional forms are the ways a literal colour arrives.
  // A named colour is not matched here; `--dsw-alias-*` presence below is what
  // keeps the palette sourced from the application.
  const literals = [
    ...guarded.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
    ...guarded.matchAll(/\brgba?\(/g),
    ...guarded.matchAll(/\bhsla?\(/g),
  ].map(match => match[0])
  assert.deepEqual(literals, [], `a literal colour does not follow the theme: ${literals.join(' ')}`)
})

test('the stylesheet reads its palette from the application tokens', () => {
  // Without this the previous assertion is satisfied by a stylesheet that simply
  // has no colours; the panel must actually consume the alias tokens.
  assert.match(panelSource, /var\(--dsw-alias-/)
  assert.match(panelSource, /--hub-/)
})

// --- dictionaries ----------------------------------------------------------

test('the two dictionaries carry the same keys', () => {
  const zhKeys = keysOf(zh).sort()
  const enKeys = keysOf(en).sort()
  assert.ok(zhKeys.length > 0, 'the dictionaries are empty')
  assert.deepEqual(enKeys, zhKeys, 'a key present in one dictionary and absent from the other is half a translation')
})

test('every dictionary value is usable copy, not a placeholder', () => {
  for (const [name, dictionary] of [['zh.json', zh], ['en.json', en]]) {
    for (const key of keysOf(dictionary)) {
      const value = key.split('.').reduce((node, part) => node[part], dictionary)
      assert.equal(typeof value, 'string', `${name}: ${key} is not a string`)
      assert.ok(value.trim().length > 0, `${name}: ${key} is blank`)
    }
  }
})

test('the plugin manager gets a title and a description in both languages', () => {
  // The two keys the Plugin Manager reads; the panel's own copy is registered
  // inside the bundle and is covered by the render tests.
  for (const [name, dictionary] of [['zh.json', zh], ['en.json', en]]) {
    assert.equal(typeof dictionary.meta?.title, 'string', `${name} has no meta.title`)
    assert.equal(typeof dictionary.meta?.description, 'string', `${name} has no meta.description`)
  }
  assert.notEqual(zh.meta.title, en.meta.title, 'the two languages must not ship the same title')
})
