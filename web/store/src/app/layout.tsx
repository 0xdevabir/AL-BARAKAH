import { ActionSheetHost, Toaster } from '@albarakah/ui';
import type { Metadata, Viewport } from 'next';
import '@albarakah/ui/styles.css';
import './store.css';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = {
  title: 'BarakaBari',
  description: 'Medicine delivery and doctor consultations for Bangladesh.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f1e8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
        <Toaster />
        <ActionSheetHost />
      </body>
    </html>
  );
}
