import type { Metadata } from 'next'
import Providers from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'DealTrace',
  description: 'Email thread analysis for sales reps',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
