import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Protects /api/graph/* and /api/analyze/* — requires a valid NextAuth JWT.
// /taskpane is left unprotected so it can render the sign-in UI.
export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request })

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/graph/:path*',
    '/api/analyze/:path*',
  ],
}
