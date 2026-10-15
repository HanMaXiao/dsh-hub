/**
 * Id and timestamp generation.
 *
 * The behaviour under test is the contract the store and the Client's tiebreak
 * both depend on: ids are unique and orderable by creation, timestamps parse
 * identically on both sides.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { isIsoTimestamp, newId, nowIso } from '../lib/ids.js'

test('newId is unique across a large batch', () => {
  const ids = new Set()
  for (let index = 0; index < 10000; index += 1) ids.add(newId(index))
  assert.equal(ids.size, 10000)
})

test('newId sorts ascending by the injected clock', () => {
  const early = newId(1700000000000)
  const late = newId(1700000000001)
  assert.ok(early < late, `${early} should sort before ${late}`)
})

test('newId carries the clock in a base36 prefix before its random suffix', () => {
  // The suffix is opaque, so this asserts only what the contract promises: the
  // millisecond prefix orders ids, and it is the part that is shared.
  const [first, second] = newId(1700000000000).split('-')
  assert.equal(first, (1700000000000).toString(36))
  assert.equal(newId(1700000000001).split('-')[0], (1700000000001).toString(36))
  assert.match(newId(1700000000000), /^[0-9a-z]+-[0-9a-f]{12}$/)
})

test('nowIso emits a UTC timestamp Date.parse accepts', () => {
  const stamp = nowIso(new Date(Date.UTC(2026, 9, 15, 2, 4, 15, 123)))
  assert.equal(stamp, '2026-10-15T02:04:15.123Z')
  assert.equal(Date.parse(stamp), Date.UTC(2026, 9, 15, 2, 4, 15, 123))
})

test('isIsoTimestamp rejects what it must reject', () => {
  assert.equal(isIsoTimestamp('2026-10-15T02:04:15.123Z'), true)
  assert.equal(isIsoTimestamp('not a date'), false)
  assert.equal(isIsoTimestamp(''), false)
  assert.equal(isIsoTimestamp(1770000000000), false)
  assert.equal(isIsoTimestamp(undefined), false)
})
