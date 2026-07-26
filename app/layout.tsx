import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Alice May Logbook',
  description:
    'Trip log, conditions, and maintenance for Alice May — Monterey Harbor.',
  appleWebApp: {
    capable: true,
    title: 'Alice May',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7ef' },
    { media: '(prefers-color-scheme: dark)', color: '#06131f' },
  ],
  // The helm is a small screen held at arm's length; let it zoom.
  initialScale: 1,
  width: 'device-width',
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = (await cookies()).get('theme')?.value
  const isDark = theme === 'dark'

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${plexMono.variable} h-full ${isDark ? 'dark' : ''}`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
