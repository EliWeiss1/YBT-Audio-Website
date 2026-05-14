import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import LayoutShell from '@/components/layout/LayoutShell'
import BottomPlayer from '@/components/player/BottomPlayer'
import { createClient } from '@/lib/supabase-server'
import { PlayerProvider } from '@/lib/player-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'YBT Shiurim',
  description: 'Browse, listen, and discuss thousands of shiurim',
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
        </PlayerProvider>
      </body>
    </html>
  )
}
