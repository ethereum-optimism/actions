import mixpanel from 'mixpanel-browser'

import { env } from '@/envVars'

export const initAnalytics = () => {
  if (!env.VITE_MIXPANEL_TOKEN) {
    return
  }

  mixpanel.init(env.VITE_MIXPANEL_TOKEN, {
    track_pageview: true,
    persistence: 'localStorage',
  })
}

export const trackEvent = (
  eventName: string,
  properties?: Record<string, unknown>,
) => {
  if (!env.VITE_MIXPANEL_TOKEN) return
  mixpanel.track(eventName, properties)
}

export const identifyUser = (
  userId: string,
  properties?: Record<string, unknown>,
) => {
  if (!env.VITE_MIXPANEL_TOKEN) return
  mixpanel.identify(userId)
  if (properties) {
    mixpanel.people.set(properties)
  }
}

export const resetUser = () => {
  if (!env.VITE_MIXPANEL_TOKEN) return
  mixpanel.reset()
}
