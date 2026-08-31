import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clip Master',
  description: 'Local long-form to short-clip pipeline',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
