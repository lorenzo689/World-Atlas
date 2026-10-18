import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface User {
  id: string
  displayName: string
  email: string | null
  roles: string[]
  guest: boolean
  emailVerified: boolean
}

export interface AuthResponse {
  accessToken: string
  expiresIn: number
  user: User
}

interface AuthState {
  /** Short-lived JWT – memory only, never written to storage. */
  accessToken: string | null
  /** epoch ms when the access token expires */
  expiresAt: number
  user: User | null
  /** true once the startup refresh (cookie → access token) has finished */
  restored: boolean
  setSession: (res: AuthResponse) => void
  setRestored: () => void
  clear: () => void
}

/**
 * Session state.
 *
 * - The **refresh token** lives in an HttpOnly cookie set by the backend – JavaScript cannot read it,
 *   so an XSS bug cannot steal a long-lived session.
 * - The **access token** (15 min) is kept in memory only. After a reload it is gone and
 *   `restoreSession()` in api.ts gets a new one with the cookie.
 * - Only the (non-secret) user profile is persisted, so the UI can show the name immediately.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      expiresAt: 0,
      user: null,
      restored: false,
      setSession: (res) =>
        set({ accessToken: res.accessToken, expiresAt: Date.now() + res.expiresIn * 1000, user: res.user, restored: true }),
      setRestored: () => set({ restored: true }),
      clear: () => set({ accessToken: null, expiresAt: 0, user: null }),
    }),
    {
      name: 'world-explorer-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user }),
    },
  ),
)

export const isAccount = (u: User | null) => !!u && !u.guest && u.roles.includes('USER')
export const isAdmin = (u: User | null) => !!u && u.roles.includes('ADMIN')
