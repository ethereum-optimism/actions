export const ROUTES = {
  HOME: '/',
  DEMO: '/demo',
  EARN: '/earn',
} as const

export type RouteType = (typeof ROUTES)[keyof typeof ROUTES]
