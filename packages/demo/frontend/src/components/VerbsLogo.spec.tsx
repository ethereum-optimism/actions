import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import VerbsLogo from './VerbsLogo'

describe('VerbsLogo', () => {
  it('renders logo SVG', () => {
    const { container } = render(<VerbsLogo />)
    
    // Check that an SVG element is rendered
    const svgElement = container.querySelector('svg')
    expect(svgElement).toBeInTheDocument()
    
    // Check for viewBox attribute (common in SVGs)
    expect(svgElement).toHaveAttribute('viewBox')
  })

  it('has proper dimensions and styling', () => {
    const { container } = render(<VerbsLogo />)
    
    const svgElement = container.querySelector('svg')
    expect(svgElement).toHaveAttribute('width', '24')
    expect(svgElement).toHaveAttribute('height', '24')
    expect(svgElement).toHaveClass('text-terminal-success')
  })
})