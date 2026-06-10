import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import LayoutShell from '@/components/layout/LayoutShell'
import BottomPlayer from '@/components/player/BottomPlayer'
import ServiceWorkerRegister from '@/components/pwa/ServiceWorkerRegister'
import InstallBanner from '@/components/pwa/InstallBanner'
import { createClient } from '@/lib/supabase-server'
import { PlayerProvider } from '@/lib/player-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'YBT Shiurim',
  description: 'Browse, listen, and discuss thousands of shiurim',
  applicationName: 'YBT Shiurim',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'YBT Shiurim',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  // viewportFit: 'cover' lets the app paint behind the iPhone notch/home
  // indicator in standalone mode; safe-area insets handle the padding.
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html lang="en">
      <body className={inter.className}>
        <PlayerProvider userId={user?.id}>
          <LayoutShell user={user ?? null}>
            {children}
          </LayoutShell>
          <BottomPlayer />
          <InstallBanner />
          <ServiceWorkerRegister />
        </PlayerProvider>
      </body>
    </html>
  )
}
