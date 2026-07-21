import mixpanel from 'mixpanel-browser'

import { env } from '@/envVars'

function getMixpanelToken(): string | null {
  if (!import.meta.env.PROD) return null
  return env.VITE_MIXPANEL_TOKEN ?? null
}

export const initAnalytics = () => {
  const token = getMixpanelToken()
  if (!token) return

  mixpanel.init(token, {
    track_pageview: true,
    persistence: 'localStorage',
  })
}

export const trackEvent = (
  eventName: string,
  properties?: Record<string, unknown>,
) => {
  if (!getMixpanelToken()) return
  mixpanel.track(eventName, properties)
}

export const identifyUser = (
  userId: string,
  properties?: Record<string, unknown>,
) => {
  if (!getMixpanelToken()) return
  mixpanel.identify(userId)
  if (properties) {
    mixpanel.people.set(properties)
  }
}

export const resetUser = () => {
  if (!getMixpanelToken()) return
  mixpanel.reset()
}
