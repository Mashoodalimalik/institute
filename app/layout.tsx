import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import ServiceWorker from '@/components/ServiceWorker';

export const metadata: Metadata = {
  title: 'The Prism Coaching Center — Management System',
  description:
    'Comprehensive institute management platform for The Prism Coaching Center — student fee management, attendance tracking, financial ledger, and automated notifications.',
  keywords: 'institute management, fee tracking, attendance, student portal, The Prism Coaching Center',
  authors: [{ name: 'The Prism Coaching Center' }],
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Prism Coaching',
  },
  openGraph: {
    title: 'The Prism Coaching Center — Management System',
    description: 'Student fee management, attendance tracking & financial ledger.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#6366f1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased">
        <ServiceWorker />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
