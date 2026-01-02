// Next.js Layout Component Template
// Location: app/layout.tsx (root) or app/[segment]/layout.tsx (nested)

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

// Font optimization
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

// Root Metadata
export const metadata: Metadata = {
  title: {
    template: '%s | My App',
    default: 'My App',
  },
  description: 'My application description',
  metadataBase: new URL('https://example.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'My App',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@handle',
  },
  robots: {
    index: true,
    follow: true,
  },
}

// Viewport configuration
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
  width: 'device-width',
  initialScale: 1,
}

// Props type
interface RootLayoutProps {
  children: React.ReactNode
}

// Root Layout (required for app/layout.tsx)
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {/* Providers wrapper */}
        <Providers>
          {/* Skip link for accessibility */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 bg-white px-4 py-2 rounded"
          >
            Skip to main content
          </a>

          {/* Header */}
          <Header />

          {/* Main content */}
          <main id="main-content" className="flex-1">
            {children}
          </main>

          {/* Footer */}
          <Footer />
        </Providers>
      </body>
    </html>
  )
}

// Providers component for context providers
function Providers({ children }: { children: React.ReactNode }) {
  return (
    // Add providers here: ThemeProvider, QueryClientProvider, etc.
    <>{children}</>
  )
}

// Header component (placeholder)
function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="container flex h-16 items-center">
        <nav className="flex items-center space-x-6">
          {/* Navigation links */}
        </nav>
      </div>
    </header>
  )
}

// Footer component (placeholder)
function Footer() {
  return (
    <footer className="border-t py-6 md:py-0">
      <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} My App. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

// ===========================================
// Nested Layout Template (e.g., app/dashboard/layout.tsx)
// ===========================================

/*
interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-gray-50">
        <Sidebar />
      </aside>
      <div className="flex-1">
        <div className="container py-6">
          {children}
        </div>
      </div>
    </div>
  )
}

function Sidebar() {
  return (
    <nav className="p-4 space-y-2">
      <SidebarLink href="/dashboard" icon={HomeIcon}>Dashboard</SidebarLink>
      <SidebarLink href="/dashboard/settings" icon={SettingsIcon}>Settings</SidebarLink>
    </nav>
  )
}
*/

// ===========================================
// Layout with Parallel Routes (slots)
// ===========================================

/*
interface LayoutWithSlotsProps {
  children: React.ReactNode
  modal: React.ReactNode      // @modal folder
  analytics: React.ReactNode  // @analytics folder
}

export default function Layout({
  children,
  modal,
  analytics,
}: LayoutWithSlotsProps) {
  return (
    <>
      {children}
      {modal}
      {analytics}
    </>
  )
}
*/
