import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface User {
  id: string
  displayName: string
  email: string | null
  roles: string[]
  guest: boolean
}

export interface AuthResponse {
  accessToken: string
  expiresIn: number
  refreshToken: string
  user: User
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  /** epoch ms when the access token expires */
  expiresAt: number
  user: User | null
  setSession: (res: AuthResponse) => void
  clear: () => void
}

/**
 * Tokens + user, persisted in localStorage so a reload keeps you signed in.
 * The access token is short-lived (15 min); `api.ts` refreshes it transparently.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      expiresAt: 0,
      user: null,
      setSession: (res) =>
        set({
          accessToken: res.accessToken,
          refreshToken: res.refreshToken,
          expiresAt: Date.now() + res.expiresIn * 1000,
          user: res.user,
        }),
      clear: () => set({ accessToken: null, refreshToken: null, expiresAt: 0, user: null }),
    }),
    { name: 'world-explorer-auth', storage: createJSONStorage(() => localStorage) },
  ),
)

export const isAccount = (u: User | null) => !!u && !u.guest && u.roles.includes('USER')
export const isAdmin = (u: User | null) => !!u && u.roles.includes('ADMIN')
