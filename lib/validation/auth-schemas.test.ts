import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MIN,
  fieldErrors,
  forgotPasswordSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from './schemas'

const good = 'correct horse battery'

describe('signInSchema', () => {
  it('lowercases and trims the email', () => {
    const r = signInSchema.parse({ email: '  Sam@Example.COM ', password: 'x' })
    expect(r.email).toBe('sam@example.com')
  })

  it('does not apply the new-password length rule', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true)
  })

  it('requires both fields', () => {
    const r = signInSchema.safeParse({ email: 'a@b.co', password: '' })
    expect(r.success).toBe(false)
    if (!r.success) expect(fieldErrors(r.error).password).toBe('Enter your password')
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false)
    expect(signInSchema.safeParse({}).success).toBe(false)
  })
})

describe('signUpSchema', () => {
  it('accepts a matching pair', () => {
    const r = signUpSchema.parse({
      email: 'Dad@Example.com',
      password: good,
      confirm_password: good,
    })
    expect(r.email).toBe('dad@example.com')
  })

  it('rejects a password below the minimum', () => {
    const short = 'x'.repeat(PASSWORD_MIN - 1)
    const r = signUpSchema.safeParse({ email: 'a@b.co', password: short, confirm_password: short })
    expect(r.success).toBe(false)
    if (!r.success) expect(fieldErrors(r.error).password).toMatch(/at least/)
  })

  it('accepts a password exactly at the minimum', () => {
    const exact = 'x'.repeat(PASSWORD_MIN)
    expect(
      signUpSchema.safeParse({ email: 'a@b.co', password: exact, confirm_password: exact }).success,
    ).toBe(true)
  })

  it('rejects a password past bcrypt’s 72 bytes, counting bytes not characters', () => {
    // 25 three-byte characters: 25 code units, 75 bytes.
    const wide = '€'.repeat(25)
    const r = signUpSchema.safeParse({ email: 'a@b.co', password: wide, confirm_password: wide })
    expect(r.success).toBe(false)
  })

  it('reports a mismatch against the confirmation field', () => {
    const r = signUpSchema.safeParse({
      email: 'a@b.co',
      password: good,
      confirm_password: good + '!',
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(Object.keys(fieldErrors(r.error))).toEqual(['confirm_password'])
  })
})

describe('updatePasswordSchema', () => {
  it('needs no email', () => {
    expect(updatePasswordSchema.safeParse({ password: good, confirm_password: good }).success).toBe(
      true,
    )
  })

  it('applies the same rules as signup', () => {
    expect(
      updatePasswordSchema.safeParse({ password: 'short', confirm_password: 'short' }).success,
    ).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  it('normalises the address', () => {
    expect(forgotPasswordSchema.parse({ email: ' Mum@Example.com' }).email).toBe('mum@example.com')
  })
})

describe('fieldErrors', () => {
  it('keeps only the first message per field', () => {
    const r = signUpSchema.safeParse({ email: 'bad', password: '', confirm_password: 'x' })
    expect(r.success).toBe(false)
    if (!r.success) {
      const errs = fieldErrors(r.error)
      expect(errs.email).toBe('Enter a valid email address')
      expect(typeof errs.password).toBe('string')
    }
  })
})
