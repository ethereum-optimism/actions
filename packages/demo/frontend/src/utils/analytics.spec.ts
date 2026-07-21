import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mixpanelMocks = vi.hoisted(() => ({
  identify: vi.fn(),
  init: vi.fn(),
  peopleSet: vi.fn(),
  reset: vi.fn(),
  track: vi.fn(),
}))

vi.mock('mixpanel-browser', () => ({
  default: {
    identify: mixpanelMocks.identify,
    init: mixpanelMocks.init,
    people: { set: mixpanelMocks.peopleSet },
    reset: mixpanelMocks.reset,
    track: mixpanelMocks.track,
  },
}))

vi.mock('@/envVars', () => ({
  env: { VITE_MIXPANEL_TOKEN: 'test-token' },
}))

import { identifyUser, initAnalytics, resetUser, trackEvent } from './analytics'

describe('analytics', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())

  it('does not send analytics from local development', () => {
    vi.stubEnv('PROD', false)

    initAnalytics()
    trackEvent('transaction_success')
    identifyUser('user-1', { provider: 'dynamic' })
    resetUser()

    expect(mixpanelMocks.init).not.toHaveBeenCalled()
    expect(mixpanelMocks.track).not.toHaveBeenCalled()
    expect(mixpanelMocks.identify).not.toHaveBeenCalled()
    expect(mixpanelMocks.peopleSet).not.toHaveBeenCalled()
    expect(mixpanelMocks.reset).not.toHaveBeenCalled()
  })

  it('sends analytics from production builds', () => {
    vi.stubEnv('PROD', true)

    initAnalytics()
    trackEvent('transaction_success')
    identifyUser('user-1', { provider: 'dynamic' })
    resetUser()

    expect(mixpanelMocks.init).toHaveBeenCalledWith('test-token', {
      track_pageview: true,
      persistence: 'localStorage',
    })
    expect(mixpanelMocks.track).toHaveBeenCalledWith(
      'transaction_success',
      undefined,
    )
    expect(mixpanelMocks.identify).toHaveBeenCalledWith('user-1')
    expect(mixpanelMocks.peopleSet).toHaveBeenCalledWith({
      provider: 'dynamic',
    })
    expect(mixpanelMocks.reset).toHaveBeenCalled()
  })
})
