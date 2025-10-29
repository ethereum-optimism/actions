export const ROUTES = {
  HOME: '/',
  DEMO: '/demo',
  DOCS: '/docs',
  EARN: '/earn',
} as const

export type RouteType = (typeof ROUTES)[keyof typeof ROUTES]
