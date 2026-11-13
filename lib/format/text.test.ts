import { describe, expect, it } from 'vitest'
import { excerpt } from './text'

describe('excerpt', () => {
  it('returns short text whole', () => {
    expect(excerpt('Calm out to the kelp line.', 80)).toBe('Calm out to the kelp line.')
  })

  it('collapses whitespace and line breaks', () => {
    expect(excerpt('  Fog\n\nlifted   by ten  ', 80)).toBe('Fog lifted by ten')
  })

  it('cuts long text at a word boundary with an ellipsis', () => {
    const result = excerpt('Saw humpbacks off Point Pinos, then ran south to Carmel', 30)
    expect(result).toBe('Saw humpbacks off Point Pinos…')
    expect(result!.length).toBeLessThanOrEqual(31)
  })

  it('drops trailing punctuation before the ellipsis', () => {
    expect(excerpt('Windy, choppy, wet. Came home early after that', 20)).toBe('Windy, choppy, wet…')
  })

  it('cuts a single long word where it stands', () => {
    expect(excerpt('a'.repeat(50), 10)).toBe(`${'a'.repeat(10)}…`)
  })

  it('treats blank or missing notes as none', () => {
    expect(excerpt(null, 80)).toBeNull()
    expect(excerpt(undefined, 80)).toBeNull()
    expect(excerpt('   \n ', 80)).toBeNull()
  })
})
