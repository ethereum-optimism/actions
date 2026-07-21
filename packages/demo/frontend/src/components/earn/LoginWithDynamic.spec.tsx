import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@dynamic-labs/sdk-react-core', () => ({
  DynamicEmbeddedWidget: () => <div data-testid="dynamic-widget" />,
  useDynamicContext: () => ({ sdkHasLoaded: true }),
}))

import { LoginWithDynamic } from './LoginWithDynamic'

describe('LoginWithDynamic', () => {
  it('shrink-wraps the modal around the embedded widget', () => {
    render(<LoginWithDynamic />)

    expect(screen.getByTestId('dynamic-widget').parentElement).toHaveStyle({
      maxWidth: '90%',
      width: 'fit-content',
    })
  })
})
