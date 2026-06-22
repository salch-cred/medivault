import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Serif } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

// Body: Inter — a clean neo-grotesk in the Swiss tradition (the contemporary
// grotesk aesthetic popularized by uncut.wtf's catalogue).
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

// Display accent: Instrument Serif — a contemporary editorial serif used for
// hero headlines, giving the editorial serif-over-grotesk contrast seen across
// purelanding.page designs. Italic is available for emphasis.
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
})

export const metadata: Metadata = {
  title: 'MediVault — your private, AI-powered health vault',
  description:
    'Upload medical records, get plain-language AI explanations, and store everything encrypted on 0G — owned by you, readable by no one else.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
}

// viewport-fit=cover lets content extend under the notch so we can pad with
// safe-area insets; themeColor tints the iOS status bar / Android address bar.
export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
