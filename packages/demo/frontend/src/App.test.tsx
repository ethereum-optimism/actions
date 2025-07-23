import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

// TODO Add basic system tests
describe('App', () => {
  it('renders terminal component', () => {
    render(<App />)

    expect(screen.getByText('verbs-terminal')).toBeInTheDocument()
    expect(
      screen.getByText('Verbs library for the OP Stack'),
    ).toBeInTheDocument()
    const appContainer = screen
      .getByRole('textbox')
      .closest('.w-full.h-screen.bg-terminal-bg')
    expect(appContainer).toBeInTheDocument()
  })
})
