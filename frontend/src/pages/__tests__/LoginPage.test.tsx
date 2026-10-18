import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LoginPage from '@/pages/LoginPage'
import { authApi } from '@/lib/api'
import { useLang } from '@/i18n'

vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof import('@/lib/api')>()
  return {
    ...actual,
    backendAvailable: () => Promise.resolve(true),
    authApi: {
      login: vi.fn(() => Promise.resolve()),
      register: vi.fn(() => Promise.resolve()),
      guest: vi.fn(() => Promise.resolve()),
      forgotPassword: vi.fn(() => Promise.resolve()),
    },
  }
})

function renderLogin(url = '/login?next=/atlas') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/atlas" element={<p>atlas page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    useLang.setState({ lang: 'en' })
    vi.clearAllMocks()
  })

  it('signs in and continues to the page from ?next', async () => {
    renderLogin()
    await userEvent.type(screen.getByLabelText('E-mail'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith('ada@example.com', 'correct horse'))
    expect(await screen.findByText('atlas page')).toBeInTheDocument()
  })

  it('registers with a display name', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('tab', { name: 'Create account' }))
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.de')
    await userEvent.type(screen.getByLabelText('Password'), 'longenough1')
    await userEvent.type(screen.getByLabelText('Display name'), 'Ada')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(authApi.register).toHaveBeenCalledWith('a@b.de', 'longenough1', 'Ada'))
  })

  it('offers the password reset and confirms without revealing whether the account exists', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    await userEvent.type(screen.getByLabelText('E-mail'), 'ghost@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/If an account exists/)
    expect(authApi.forgotPassword).toHaveBeenCalledWith('ghost@example.com')
  })

  it('renders German texts when the language is German', () => {
    useLang.setState({ lang: 'de' })
    renderLogin()
    expect(screen.getByLabelText('E-Mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Passwort')).toBeInTheDocument()
  })
})
