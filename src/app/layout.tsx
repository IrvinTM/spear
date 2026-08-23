import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spear — UES Dashboard',
  description:
    'Personal automation dashboard for UES campus. Syncs Moodle courses, assignments, and email into a single view.',
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
