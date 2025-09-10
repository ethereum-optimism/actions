import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

// Mock ClerkProvider
vi.mock('./providers/ClerkProvider', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock PrivyProvider
vi.mock('./providers/PrivyProvider', () => ({
  PrivyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// TODO Add basic system tests
describe('App', () => {
  it('renders home component at root', () => {
    render(<App />)

    expect(screen.getByText('GitHub')).toBeInTheDocument()
    // Home page should have the Docs and Demo buttons
    expect(screen.getByText('Docs')).toBeInTheDocument()
    expect(screen.getByText('Demo')).toBeInTheDocument()
    const appContainer = document.querySelector('.w-full.h-screen.bg-terminal-bg')
    expect(appContainer).toBeInTheDocument()
  })
})
