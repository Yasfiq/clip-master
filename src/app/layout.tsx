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
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
