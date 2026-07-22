import { Buffer } from 'buffer'
import { describe, expect, it } from 'vitest'

import { installBuffer } from './polyfills'

describe('browser polyfills', () => {
  it('defines Buffer when the browser does not provide it', () => {
    const browserGlobal: { Buffer?: typeof Buffer } = {}

    installBuffer(browserGlobal)

    expect(browserGlobal.Buffer).toBe(Buffer)
  })
})
