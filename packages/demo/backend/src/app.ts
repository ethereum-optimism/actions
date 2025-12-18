import { App } from '@eth-optimism/utils-app'
import { serve } from '@hono/node-server'
import { Option } from 'commander'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { initializeActions } from '@/config/actions.js'
import { env } from '@/config/env.js'
import { actionsMiddleware } from '@/middleware/actions.js'
import { router } from '@/router.js'

class ActionsApp extends App {
  private server: ReturnType<typeof serve> | null = null

  constructor() {
    super({
      name: 'actions-service',
      version: '0.0.1',
      description: 'Hono service for actions SDK',
    })
  }

  protected additionalOptions(): Option[] {
    return [
      new Option('--port <port>', 'port to run the service on')
        .default(env.PORT.toString())
        .env('PORT'),
    ]
  }

  protected async preMain(): Promise<void> {
    // Initialize Actions SDK once at startup
    initializeActions()
  }

  protected async main(): Promise<void> {
    const app = new Hono()

    // Enable CORS for frontend communication
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

    // Apply Actions middleware (initialization already happened at startup)
    app.use('*', actionsMiddleware)
    app.route('/', router)

    this.logger.info('starting actions service on port %s', this.options.port)

    this.server = serve({
      fetch: app.fetch,
      port: Number(this.options.port),
    })

    while (!this.isShuttingDown) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  protected async shutdown(): Promise<void> {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.logger.info('stopping actions service...')
        this.server!.close((error) => {
          if (error) {
            this.logger.error({ error }, 'error closing actions service')
            reject(error)
          } else {
            resolve()
          }
        })
      })
    }
  }
}

export * from '@/types/index.js'
export { ActionsApp }
