import type { Metadata, Viewport } from 'next';
import './globals.css';
import ToastContainer from '@/components/ToastContainer';

export const metadata: Metadata = {
  title: 'Clip Master',
  description: 'Local long-form to short-clip pipeline',
  manifest: '/manifest.json',
  appleWebApp: {
    title: 'Clip Master',
    statusBarStyle: 'default',
    capable: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen antialiased selection:bg-zinc-800 selection:text-zinc-100">
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
