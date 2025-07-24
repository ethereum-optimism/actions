import { z } from 'zod'

const envVarSchema = z.object({
  VITE_VERBS_API_URL: z
    .string()
    .url()
    .default(
      import.meta.env.MODE === 'production'
        ? 'https://dev-verbs-service.optimism.io/'
        : 'http://localhost:3000',
    )
    .describe('Base URL for the verbs service API'),
})

export const env = envVarSchema.parse(import.meta.env)

// Log environment configuration on boot
console.log('🚀 Verbs Frontend Environment:')
console.log('  MODE:', import.meta.env.MODE)
console.log('  VITE_VERBS_API_URL:', env.VITE_VERBS_API_URL)
