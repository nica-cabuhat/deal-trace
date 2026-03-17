import { z } from 'zod'

const EnvSchema = z.object({
  AZURE_AD_CLIENT_ID: z.string().min(1),
  AZURE_AD_CLIENT_SECRET: z.string().min(1),
  AZURE_AD_TENANT_ID: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  GROQ_MODEL: z.string().min(1),
  GRAPH_SCOPE: z.string().min(1),
})

const result = EnvSchema.safeParse(process.env)

if (!result.success) {
  const missing = Object.keys(result.error.flatten().fieldErrors).join(', ')
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing or invalid environment variables: ${missing}`)
  }
  console.warn(`[env] Missing environment variables: ${missing}`)
}

// In dev with missing vars, values will be undefined — auth will fail with proper
// 401/redirect errors rather than crashing the server with an HTML error page.
export const env = (result.data ?? {}) as z.infer<typeof EnvSchema>
