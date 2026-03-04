import { initializeActions } from '../../packages/demo/backend/src/config/actions.js'
import { createApp } from '../../packages/demo/backend/src/createApp.js'

// Initialize Actions SDK once on cold start
initializeActions()

const app = createApp()

export default async (request: Request) => {
  // Strip /api prefix — the Netlify rewrite sends /api/wallet here,
  // but the Hono routes expect /wallet
  const url = new URL(request.url)
  const strippedPath = url.pathname.replace(/^\/api/, '') || '/'
  const newUrl = new URL(strippedPath + url.search, url.origin)
  const newRequest = new Request(newUrl.toString(), request)

  return app.fetch(newRequest)
}
