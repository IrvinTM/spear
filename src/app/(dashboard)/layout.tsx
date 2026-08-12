import { Sidebar } from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-950">
      <Sidebar />
      <main className="ml-60 max-md:ml-0 min-h-screen p-8 max-md:p-4">
        {children}
      </main>
    </div>
  );
}
