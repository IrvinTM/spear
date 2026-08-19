import { Sidebar } from '@/components/Sidebar';
import { DashboardShell } from '@/components/DashboardShell';
import { getSettings } from '@/lib/settings';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const settings = getSettings();
  const bgStyle = settings.background
    ? { backgroundImage: `url(${settings.background})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
    : undefined;

  return (
    <div className="min-h-screen bg-stone-950" style={bgStyle}>
      {/* Dimmer overlay if there's a background so text remains readable */}
      {settings.background && <div className="fixed inset-0 bg-stone-950/60 z-0 pointer-events-none" />}
      
      <div className="relative z-10 flex min-h-screen">
        <Sidebar />
        <main className="ml-60 max-md:ml-0 flex-1 p-8 max-md:p-4">
          <DashboardShell>{children}</DashboardShell>
        </main>
      </div>
    </div>
  );
}
