import { z } from 'zod'

const envVarSchema = z.object({
  VITE_ACTIONS_API_URL: z
    .string()
    .url()
    .default(
      import.meta.env.MODE === 'production'
        ? 'https://dev-verbs-service.optimism.io'
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
  VITE_DYNAMIC_ENVIRONMENT_ID: z
    .string()
    .optional()
    .describe('Dynamic environment ID for wallet connection'),
  VITE_BASE_SEPOLIA_RPC_URL: z
    .string()
    .optional()
    .describe('Base Sepolia RPC URL for wallet connection'),
  VITE_BASE_SEPOLIA_BUNDER_URL: z
    .string()
    .optional()
    .describe('Base Sepolia Bundler URL for wallet connection'),
})

export const env = envVarSchema.parse(import.meta.env)

// Log environment configuration on boot
console.log('🚀 Actions Frontend Environment:')
console.log('  MODE:', import.meta.env.MODE)
console.log('  VITE_ACTIONS_API_URL:', env.VITE_ACTIONS_API_URL)
