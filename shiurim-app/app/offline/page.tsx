import Link from 'next/link'

// Offline fallback served by the service worker when a page isn't cached.
// Styled inline so it renders correctly even if the CSS bundle isn't cached.
export const dynamic = 'force-static'

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '32px 24px',
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
        color: '#44403c',
      }}
    >
      <div style={{ fontSize: '40px' }}>📡</div>
      <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>You&apos;re offline</h1>
      <p style={{ fontSize: '14px', color: '#78716c', maxWidth: '320px', margin: 0 }}>
        This page isn&apos;t available offline, but any shiurim you&apos;ve downloaded are
        ready to play.
      </p>
      <Link
        href="/downloads"
        style={{
          marginTop: '8px',
          padding: '10px 20px',
          borderRadius: '10px',
          background: '#047857',
          color: '#ffffff',
          fontSize: '14px',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        My Downloads
      </Link>
    </div>
  )
}
