/** What every auth form's server action hands back to its page. */
export type AuthFormState =
  | { status: 'idle' }
  | { status: 'sent'; message: string }
  | {
      status: 'error'
      message?: string
      fields?: Record<string, string>
      /** Echoed back so a rejected submission does not wipe the address. */
      email?: string
    }

export const IDLE: AuthFormState = { status: 'idle' }
