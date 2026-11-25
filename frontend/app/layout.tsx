import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Toast from '@/components/Toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'PrepPilot',
  description: 'AI interview coach that learns your weak spots.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <Toast />
      </body>
    </html>
  );
}
