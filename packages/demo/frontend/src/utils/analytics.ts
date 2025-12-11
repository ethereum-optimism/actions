import mixpanel from 'mixpanel-browser'
import { env } from '@/envVars'

let initialized = false

export const initAnalytics = () => {
  if (!env.VITE_MIXPANEL_TOKEN) {
    return
  }
  mixpanel.init(env.VITE_MIXPANEL_TOKEN, {
    track_pageview: true,
    persistence: 'localStorage',
  })
  initialized = true
}

export const trackEvent = (
  eventName: string,
  properties?: Record<string, unknown>,
) => {
  if (initialized) {
    mixpanel.track(eventName, properties)
  }
}

export const identifyUser = (
  userId: string,
  properties?: Record<string, unknown>,
) => {
  if (initialized) {
    mixpanel.identify(userId)
    if (properties) {
      mixpanel.people.set(properties)
    }
  }
}

export const resetUser = () => {
  if (initialized) {
    mixpanel.reset()
  }
}
