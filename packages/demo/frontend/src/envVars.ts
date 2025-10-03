import { z } from 'zod'

const envVarSchema = z.object({
  VITE_ACTIONS_API_URL: z
    .string()
    .url()
    .default(
      import.meta.env.MODE === 'production'
        ? 'https://dev-actions-service.optimism.io'
        : 'http://localhost:3000',
    )
    .describe('Base URL for the actions service API'),
  VITE_PRIVY_APP_ID: z
    .string()
    .default('dummy-privy-app-id')
    .describe('Privy App ID for wallet connection'),
  VITE_SESSION_SIGNER_ID: z
    .string()
    .optional()
    .describe('Session signer ID for server-side signing'),
})

export const env = envVarSchema.parse(import.meta.env)

// Log environment configuration on boot
console.log('🚀 Actions Frontend Environment:')
console.log('  MODE:', import.meta.env.MODE)
console.log('  VITE_ACTIONS_API_URL:', env.VITE_ACTIONS_API_URL)
