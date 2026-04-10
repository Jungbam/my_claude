import { describe, test, expect } from 'bun:test'
import { safeDecodeSlug } from '../src/lib/slug-utils'

describe('safeDecodeSlug', () => {
  test('plain ASCII slug returns as-is', () => {
    expect(safeDecodeSlug('feature_build-fix')).toBe('feature_build-fix')
    expect(safeDecodeSlug('hotfix_v1.2.3')).toBe('hotfix_v1.2.3')
  })

  test('Korean slug returns as-is', () => {
    expect(safeDecodeSlug('hotfix_빌드에러수정')).toBe('hotfix_빌드에러수정')
  })

  test('single-encoded slug is decoded once', () => {
    const encoded = encodeURIComponent('hotfix_빌드')
    expect(safeDecodeSlug(encoded)).toBe('hotfix_빌드')
  })

  test('double-encoded slug is decoded twice', () => {
    const singleEncoded = encodeURIComponent('hotfix_빌드')
    const doubleEncoded = encodeURIComponent(singleEncoded)
    expect(safeDecodeSlug(doubleEncoded)).toBe('hotfix_빌드')
  })

  test('malformed percent-encoding returns original string', () => {
    // '%2' is incomplete — decodeURIComponent would throw
    expect(safeDecodeSlug('%2')).toBe('%2')
  })

  test('empty string returns empty string', () => {
    expect(safeDecodeSlug('')).toBe('')
  })
})
