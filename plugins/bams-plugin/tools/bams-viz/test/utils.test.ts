import { describe, test, expect } from 'bun:test'
import { formatDuration, formatRelativeTime, sanitizeId } from '../src/lib/utils'

describe('formatDuration', () => {
  test('milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  test('seconds', () => {
    expect(formatDuration(1000)).toBe('1s')
    expect(formatDuration(30000)).toBe('30s')
    expect(formatDuration(59000)).toBe('59s')
  })

  test('minutes', () => {
    expect(formatDuration(60000)).toBe('1m')
    expect(formatDuration(90000)).toBe('1m 30s')
    expect(formatDuration(120000)).toBe('2m')
    expect(formatDuration(125000)).toBe('2m 5s')
  })

  test('negative input', () => {
    // Should handle gracefully
    expect(formatDuration(-100)).toBe('-100ms')
  })
})

describe('sanitizeId', () => {
  test('passes alphanumeric', () => {
    expect(sanitizeId('abc123')).toBe('abc123')
  })

  test('replaces special chars with underscore', () => {
    expect(sanitizeId('foo-bar')).toBe('foo_bar')
    expect(sanitizeId('hello world')).toBe('hello_world')
    expect(sanitizeId('a.b.c')).toBe('a_b_c')
  })

  test('handles empty string', () => {
    expect(sanitizeId('')).toBe('')
  })

  test('handles path traversal attempt', () => {
    expect(sanitizeId('../../../etc')).toBe('_________etc')
  })
})

describe('formatRelativeTime', () => {
  test('just now', () => {
    const now = new Date().toISOString()
    expect(formatRelativeTime(now)).toBe('just now')
  })

  test('seconds ago', () => {
    const ts = new Date(Date.now() - 30000).toISOString()
    expect(formatRelativeTime(ts)).toBe('30s ago')
  })

  test('minutes ago', () => {
    const ts = new Date(Date.now() - 300000).toISOString()
    expect(formatRelativeTime(ts)).toBe('5m ago')
  })

  test('hours ago', () => {
    const ts = new Date(Date.now() - 7200000).toISOString()
    expect(formatRelativeTime(ts)).toBe('2h ago')
  })
})
