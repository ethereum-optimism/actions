import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

// Mock PrivyProvider
vi.mock('./providers/PrivyProvider', () => ({
  PrivyProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

// TODO Add basic system tests
describe('App', () => {
  it('renders home component at root', () => {
    render(<App />)

    // Home page should have the Github and Demo buttons
    expect(screen.getByText('Github')).toBeInTheDocument()
    expect(screen.getAllByText('Demo').length).toBeGreaterThan(0)
    const appContainer = document.querySelector(
      '.w-full.h-screen.bg-terminal-bg',
    )
    expect(appContainer).toBeInTheDocument()
  })
})
