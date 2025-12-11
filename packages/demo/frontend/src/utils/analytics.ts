import mixpanel from 'mixpanel-browser'

const MIXPANEL_TOKEN = '28b4162f2bd7a18d8006b0622ddd03e6'

export const initAnalytics = () => {
  mixpanel.init(MIXPANEL_TOKEN, {
    track_pageview: true,
    persistence: 'localStorage',
  })
}

export const trackEvent = (
  eventName: string,
  properties?: Record<string, unknown>,
) => {
  mixpanel.track(eventName, properties)
}

export const identifyUser = (
  userId: string,
  properties?: Record<string, unknown>,
) => {
  mixpanel.identify(userId)
  if (properties) {
    mixpanel.people.set(properties)
  }
}

export const resetUser = () => {
  mixpanel.reset()
}
