import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import Terminal from './Terminal'

// Mock Privy hooks
vi.mock('@privy-io/react-auth', () => ({
  useWallets: vi.fn(() => ({ wallets: [] })),
  usePrivy: vi.fn(() => ({
    authenticated: false,
    ready: true,
  })),
  useUser: vi.fn(() => ({
    user: null,
  })),
  useSessionSigners: vi.fn(() => ({
    addSessionSigners: vi.fn(),
  })),
  useLogin: vi.fn(() => ({
    login: vi.fn(),
  })),
  useLogout: vi.fn(() => ({
    logout: vi.fn(),
  })),
}))

// Mock the actionsApi
vi.mock('../api/actionsApi', () => ({
  actionsApi: {
    createWallet: vi.fn(() =>
      Promise.resolve({
        privyAddress: '0x1234567890123456789012345678901234567890',
        smartWalletAddress: '0x1234567890123456789012345678901234567890',
        userId: 'test-user',
      }),
    ),
    getAllWallets: vi.fn(() =>
      Promise.resolve({
        wallets: [
          { address: '0x1234567890123456789012345678901234567890' },
          { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
        ],
        count: 2,
      }),
    ),
  },
}))

describe('Terminal', () => {
  it('renders terminal with welcome message', async () => {
    render(<Terminal />)

    // Check for GitHub link in NavBar
    expect(screen.getByText('GitHub')).toBeInTheDocument()

    // Check for subtitle
    expect(
      screen.getByText('DeFi Library for the OP Stack'),
    ).toBeInTheDocument()

    // Check for help content
    expect(screen.getByText(/Console commands:/)).toBeInTheDocument()
  })

  it('handles help command', async () => {
    const user = userEvent.setup()
    render(<Terminal />)

    const input = screen.getByRole('textbox')

    await user.type(input, 'help')
    await user.keyboard('{Enter}')

    // Check that help command was executed (should appear twice - once from initial load, once from command)
    const helpCommands = screen.getAllByText((_content, element) => {
      return element?.textContent === 'actions: $ help'
    })
    expect(helpCommands.length).toBeGreaterThan(0)

    // Check that help content is displayed (should appear twice - once from initial load, once from command)
    const helpTexts = screen.getAllByText(/Console commands:/)
    expect(helpTexts).toHaveLength(2)
  })

  it('handles clear command', async () => {
    const user = userEvent.setup()
    render(<Terminal />)

    const input = screen.getByRole('textbox')

    // First verify welcome content is there
    expect(
      screen.getByText('DeFi Library for the OP Stack'),
    ).toBeInTheDocument()

    await user.type(input, 'clear')
    await user.keyboard('{Enter}')

    // After clear, welcome content should be gone
    expect(
      screen.queryByText('DeFi Library for the OP Stack'),
    ).not.toBeInTheDocument()
  })

  it('handles status command', async () => {
    const user = userEvent.setup()
    render(<Terminal />)

    const input = screen.getByRole('textbox')

    await user.type(input, 'status')
    await user.keyboard('{Enter}')

    // Check that status command was executed - use getAllByText since command appears multiple times
    const statusElements = screen.getAllByText((_content, element) => {
      return element?.textContent === 'actions: $ status'
    })
    expect(statusElements.length).toBeGreaterThan(0)

    // Check for status information
    expect(screen.getByText(/System Status: ONLINE/)).toBeInTheDocument()
    expect(screen.getByText(/SDK Version: v0.0.2/)).toBeInTheDocument()
  })

  it('handles unknown command', async () => {
    const user = userEvent.setup()
    render(<Terminal />)

    const input = screen.getByRole('textbox')

    await user.type(input, 'unknown-command')
    await user.keyboard('{Enter}')

    // Check that command was executed
    expect(screen.getByText('actions: $ unknown-command')).toBeInTheDocument()

    // Check for error message
    expect(
      screen.getByText(/Command not found: unknown-command/),
    ).toBeInTheDocument()
  })

  it('handles wallet select command', async () => {
    const user = userEvent.setup()
    render(<Terminal />)

    const input = screen.getByRole('textbox')

    await user.type(input, 'wallet select')
    await user.keyboard('{Enter}')

    // Check that command was executed - use getAllByText since command appears multiple times
    const selectElements = screen.getAllByText((_content, element) => {
      return element?.textContent === 'actions: $ wallet select'
    })
    expect(selectElements.length).toBeGreaterThan(0)

    // Wait for API call to complete
    await waitFor(() => {
      expect(screen.getByText(/Select a wallet:/)).toBeInTheDocument()
    })

    // Check that wallet addresses are displayed in shortened format
    expect(screen.getByText(/0x1234...7890/)).toBeInTheDocument()
  })

  it('handles wallet create command flow', async () => {
    const user = userEvent.setup()
    render(<Terminal />)

    const input = screen.getByRole('textbox')

    // Start wallet creation
    await user.type(input, 'wallet create')
    await user.keyboard('{Enter}')

    // Check that command was executed and prompt appeared - use getAllByText since command appears multiple times
    const createElements = screen.getAllByText((_content, element) => {
      return element?.textContent === 'actions: $ wallet create'
    })
    expect(createElements.length).toBeGreaterThan(0)
    expect(screen.getByText('Enter unique userId:')).toBeInTheDocument()

    // Enter user ID
    await user.type(input, 'test-user-123')
    await user.keyboard('{Enter}')

    // Wait for wallet creation to complete
    await waitFor(() => {
      expect(
        screen.getByText(/Wallet created successfully!/),
      ).toBeInTheDocument()
    })

    // Check that wallet details are displayed
    expect(
      screen.getByText(/Address: 0x1234567890123456789012345678901234567890/),
    ).toBeInTheDocument()
    expect(screen.getByText(/User ID: test-user/)).toBeInTheDocument()
  })

  it('handles command history with arrow keys', async () => {
    const user = userEvent.setup()
    render(<Terminal />)

    const input = screen.getByRole('textbox')

    // Execute a few commands
    await user.type(input, 'help')
    await user.keyboard('{Enter}')

    await user.type(input, 'status')
    await user.keyboard('{Enter}')

    // Use arrow up to navigate history
    await user.keyboard('{ArrowUp}')
    expect(input).toHaveValue('status')

    await user.keyboard('{ArrowUp}')
    expect(input).toHaveValue('help')

    // Use arrow down to navigate forward
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveValue('status')
  })

  it('handles coming soon commands', async () => {
    const user = userEvent.setup()
    render(<Terminal />)

    const input = screen.getByRole('textbox')
    const comingSoonCommands = ['borrow', 'repay', 'swap', 'earn']

    for (const command of comingSoonCommands) {
      await user.clear(input)
      await user.type(input, command)
      await user.keyboard('{Enter}')

      // Check that command was executed - use getAllByText since command appears multiple times
      const commandElements = screen.getAllByText((_content, element) => {
        return element?.textContent === `actions: $ ${command}`
      })
      expect(commandElements.length).toBeGreaterThan(0)

      // Check for "Soon.™" message (there will be multiple instances)
      expect(screen.getAllByText('Soon.™').length).toBeGreaterThan(0)
    }
  })
})
