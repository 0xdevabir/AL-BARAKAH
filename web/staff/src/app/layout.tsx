import { ActionSheetHost, Toaster } from '@albarakah/ui';
import type { Metadata, Viewport } from 'next';
import 'leaflet/dist/leaflet.css';
import '@albarakah/ui/styles.css';
import './staff.css';

export const metadata: Metadata = {
  title: 'BarakaBari Staff',
  description: 'Admin, rider, and doctor portals.',
  robots: { index: false, follow: false },
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
        {children}
        <Toaster />
        <ActionSheetHost />
      </body>
    </html>
  );
}
