import Groq from 'groq-sdk'
import { env } from '@/lib/schemas/env.schema'

// Returns an authenticated Groq client.
// Call this server-side only — never expose the API key to the client.
export function getGroqClient(): Groq {
  return new Groq({ apiKey: env.GROQ_API_KEY })
}
