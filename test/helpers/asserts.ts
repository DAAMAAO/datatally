import assert from 'node:assert/strict'

/**
 * Recursive partial match (the subset semantics of vitest's toMatchObject):
 * arrays match positionally with the received array allowed to be longer;
 * objects match per-key.
 */
export function matchShape(actual: unknown, expected: unknown, path = ''): void {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} expected an array`)
    if (!Array.isArray(actual)) return
    assert.ok(actual.length >= expected.length, `${path} array shorter than expected`)
    expected.forEach((item, index) => matchShape(actual[index], item, `${path}[${index}]`))
    return
  }
  if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object', `${path} expected an object`)
    const record = actual as Record<string, unknown>
    for (const [key, value] of Object.entries(expected)) {
      matchShape(record[key], value, `${path}.${key}`)
    }
    return
  }
  assert.deepEqual(actual, expected, path)
}
