import { describe, expect, it } from 'vitest'

import { formatReviewAmount } from './tokenDisplay'

describe('formatReviewAmount', () => {
  it('keeps two decimals at full size and dims a bounded tail', () => {
    expect(formatReviewAmount('100.000044233754392392')).toEqual({
      main: '100.00',
      secondary: '004423',
    })
  })

  it('pads whole values to two decimals with no tail', () => {
    expect(formatReviewAmount('50')).toEqual({ main: '50.00', secondary: '' })
    expect(formatReviewAmount('10.5')).toEqual({ main: '10.50', secondary: '' })
  })

  it('shows small amounts in the dimmed tail', () => {
    expect(formatReviewAmount('0.0001')).toEqual({
      main: '0.00',
      secondary: '01',
    })
  })

  it('trims trailing zeros from the tail', () => {
    expect(formatReviewAmount('1.230000')).toEqual({
      main: '1.23',
      secondary: '',
    })
  })
})
