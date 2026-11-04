import type { Metadata } from 'next';
import '@albarakah/ui/styles.css';
import './staff.css';
import { StaffShell } from '@/components/StaffShell';

export const metadata: Metadata = {
  title: 'BarakaBari Staff',
  description: 'Admin, rider, and doctor portals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StaffShell>{children}</StaffShell>
      </body>
    </html>
  );
}
