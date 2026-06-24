import { Server as HttpServer } from 'node:http'

import { App } from '@eth-optimism/utils-app'
import { serve } from '@hono/node-server'
import { Option } from 'commander'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'

import { initializeActions } from '@/config/actions.js'
import { env } from '@/config/env.js'
import { errorResponse, mapSdkError } from '@/helpers/errors.js'
import { actionsMiddleware } from '@/middleware/actions.js'
import { rateLimit } from '@/middleware/rateLimit.js'
import { router } from '@/router.js'

/**
 * Max JSON request body accepted before the handler runs. Every route here
 * carries a tiny body (an amount, an address, a market id), so a small cap
 * rejects oversized payloads cheaply without affecting legitimate traffic.
 */
const MAX_JSON_BODY_BYTES = 16 * 1024

/** Per-client rate-limit window applied to the gas-sponsored mutation routes. */
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

/**
 * Fund-touching, gas-sponsored mutations. Each is throttled per client to cap
 * faucet drain and bundler-sponsorship burn (the read-only market/quote GETs
 * are left unthrottled so frontend polling isn't penalized).
 */
const RATE_LIMITED_ROUTES = [
  '/wallet/eth',
  '/wallet/usdc',
  '/swap/execute',
  '/lend/position/open',
  '/lend/position/close',
  '/borrow/position/open',
  '/borrow/position/close',
  '/borrow/position/deposit-collateral',
  '/borrow/position/withdraw-collateral',
  '/borrow/position/repay',
] as const

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
    const app = createApp()

    this.logger.info('starting actions service on port %s', this.options.port)

    this.server = serve({
      fetch: app.fetch,
      port: Number(this.options.port),
    })

    // Bound request lifetime so a hung upstream RPC can't pin a request
    // indefinitely. `@hono/node-server`'s `ServerType` is a union with
    // `Http2Server`, which lacks these timeout primitives; narrow first.
    if (this.server instanceof HttpServer) {
      this.server.requestTimeout = 60_000
      this.server.headersTimeout = 65_000
      this.server.keepAliveTimeout = 5_000
    }

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

/**
 * Build a fully-wired Hono app: CORS, actions middleware, router, and a
 * global error handler. Extracted so route tests can exercise the real
 * onError + middleware stack against the actual router.
 *
 * The error handler runs `mapSdkError` against every thrown SDK error so
 * lend, swap, and borrow all surface the same structured status codes.
 * Unmapped errors fall through to a generic 500.
 */
export function createApp(): Hono {
  const app = new Hono()

  // Enable CORS for frontend communication
  app.use(
    '*',
    cors({
      origin: (origin) => {
        // Allow localhost only for local development
        if (env.LOCAL_DEV && origin.startsWith('http://localhost:')) {
          return origin
        }

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

  // Return 413 before oversized JSON reaches handlers or SDK-error mapping.
  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_JSON_BODY_BYTES,
      onError: (c) => c.json({ error: 'Request body too large' }, 413),
    }),
  )

  // Throttle fund-touching routes before auth using only trusted socket state.
  for (const path of RATE_LIMITED_ROUTES) {
    app.use(
      path,
      rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }),
    )
  }

  // Apply Actions middleware (initialization already happened at startup)
  app.use('*', actionsMiddleware)
  app.route('/', router)

  app.onError((err, c) => {
    const mapped = mapSdkError(err)
    return mapped
      ? errorResponse(c, mapped.message, mapped.status, err)
      : errorResponse(c, 'Internal server error', 500, err)
  })

  return app
}

export * from '@/types/index.js'
export { ActionsApp }
