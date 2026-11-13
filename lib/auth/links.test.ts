import { describe, expect, it } from 'vitest'
import {
  asOtpType,
  destinationAfterLink,
  isRecoverySession,
  isNotApprovedError,
  linkFailurePath,
  linkPurpose,
  safeNext,
} from './links'

describe('safeNext', () => {
  it('keeps paths inside the app', () => {
    expect(safeNext('/')).toBe('/')
    expect(safeNext('/auth/update-password')).toBe('/auth/update-password')
    expect(safeNext('/trips?year=2026')).toBe('/trips?year=2026')
  })

  it('refuses anything that would leave the site', () => {
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext('/\\evil.example')).toBe('/')
    expect(safeNext('evil')).toBe('/')
    expect(safeNext('')).toBe('/')
  })

  it('falls back when there is nothing usable', () => {
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext(null)).toBe('/')
    expect(safeNext(42)).toBe('/')
    expect(safeNext('nope', '/login')).toBe('/login')
  })
})

describe('asOtpType', () => {
  it('accepts the types an email link can carry', () => {
    for (const t of ['email', 'signup', 'recovery', 'magiclink', 'invite', 'email_change']) {
      expect(asOtpType(t)).toBe(t)
    }
  })

  it('rejects everything else', () => {
    expect(asOtpType('sms')).toBeNull()
    expect(asOtpType('RECOVERY')).toBeNull()
    expect(asOtpType('')).toBeNull()
    expect(asOtpType(undefined)).toBeNull()
    expect(asOtpType(['recovery'])).toBeNull()
  })
})

describe('linkPurpose and linkFailurePath', () => {
  it('treats both spellings of a signup confirmation alike', () => {
    expect(linkPurpose('email')).toBe('signup')
    expect(linkPurpose('signup')).toBe('signup')
    expect(linkPurpose('recovery')).toBe('recovery')
    expect(linkPurpose('magiclink')).toBe('other')
    expect(linkPurpose(null)).toBe('other')
  })

  it('sends a dead reset link back to the reset form', () => {
    expect(linkFailurePath('recovery', 'expired')).toBe('/forgot-password?error=link_expired')
    expect(linkFailurePath('signup', 'expired')).toBe('/login?error=link_expired')
    expect(linkFailurePath('other', 'missing')).toBe('/login?error=missing_token')
  })
})

describe('isRecoverySession and destinationAfterLink', () => {
  it('reads the amr claim in either shape', () => {
    expect(isRecoverySession([{ method: 'recovery', timestamp: 1 }])).toBe(true)
    expect(isRecoverySession(['recovery'])).toBe(true)
    expect(isRecoverySession([{ method: 'otp', timestamp: 1 }])).toBe(false)
    expect(isRecoverySession([{ method: 'password', timestamp: 1 }, null])).toBe(false)
    expect(isRecoverySession(undefined)).toBe(false)
    expect(isRecoverySession('recovery')).toBe(false)
  })

  it('always ends a reset on the set-password form', () => {
    expect(destinationAfterLink('/', true)).toBe('/auth/update-password')
    expect(destinationAfterLink('/trips', true)).toBe('/auth/update-password')
  })

  it('otherwise follows next, safely', () => {
    expect(destinationAfterLink('/trips', false)).toBe('/trips')
    expect(destinationAfterLink('//evil.example', false)).toBe('/')
  })
})

describe('isNotApprovedError', () => {
  it('recognises the hook rejection', () => {
    expect(
      isNotApprovedError({
        status: 403,
        message: 'This email address is not approved for this logbook.',
      }),
    ).toBe(true)
  })

  it('does not mistake other failures for it', () => {
    expect(isNotApprovedError(null)).toBe(false)
    expect(isNotApprovedError({ status: 429, message: 'email rate limit exceeded' })).toBe(false)
    expect(isNotApprovedError({ status: 403 })).toBe(false)
  })
})
