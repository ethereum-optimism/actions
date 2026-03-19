import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { actionsMiddleware } from '@/middleware/actions.js'
import { router } from '@/router.js'

export function createApp(): Hono {
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: (origin) => {
        // Allow localhost for development
        if (origin.startsWith('http://localhost:')) return origin

        // Allow production domains
        if (origin === 'https://actions-ui.netlify.app') return origin
        if (origin === 'https://actions.money') return origin
        if (origin === 'https://actions.optimism.io') return origin

        // Allow Netlify deploy previews (e.g., https://deploy-preview-123--actions-ui.netlify.app)
        if (
          origin.match(
            /^https:\/\/deploy-preview-\d+--actions-ui\.netlify\.app$/,
          )
        ) {
          return origin
        }

        return null
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'privy-id-token'],
    }),
  )

  app.use('*', actionsMiddleware)
  app.route('/', router)

  return app
}
