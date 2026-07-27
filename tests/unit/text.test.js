import { describe, expect, it } from 'vitest'
import { boundedText } from '../../src/utils/text.js'

describe('text helpers', () => {
  it('truncates plain ASCII by Unicode code point count', () => {
    expect(boundedText('abcdef', 3)).toBe('abc')
  })

  it('preserves emoji exactly at the boundary', () => {
    expect(boundedText('ab😀', 3)).toBe('ab😀')
  })

  it('does not split emoji crossing the boundary', () => {
    expect(boundedText('ab😀', 2)).toBe('ab')
  })

  it('handles multiple supplementary-plane characters deterministically', () => {
    expect(boundedText('😀😃😄😁', 3)).toBe('😀😃😄')
  })

  it('sanitises lone surrogate input without crashing and remains JSON serialisable', () => {
    const result = boundedText(`a${String.fromCharCode(0xD800)}b`, 3)

    expect(result).toBe('a\uFFFDb')
    expect(() => JSON.stringify({ result })).not.toThrow()
  })
})
