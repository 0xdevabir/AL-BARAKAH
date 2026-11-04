import type { Metadata } from 'next';
import '@albarakah/ui/styles.css';
import './store.css';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = {
  title: 'BarakaBari',
  description: 'Medicine delivery and doctor consultations for Bangladesh.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
