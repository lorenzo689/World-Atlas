import { describe, expect, it } from 'vitest'
import { safeWikipediaUrl } from '../wikipedia'

describe('Wikipedia link validation', () => {
  it('rejects executable and off-domain URLs from external response data', () => {
    expect(safeWikipediaUrl('javascript:alert(1)', 'France')).toBe('https://en.wikipedia.org/wiki/France')
    expect(safeWikipediaUrl('https://en.wikipedia.org.evil.test/wiki/France', 'France')).toBe('https://en.wikipedia.org/wiki/France')
    expect(safeWikipediaUrl('https://en.wikipedia.org/wiki/France', 'France')).toBe('https://en.wikipedia.org/wiki/France')
  })
})
