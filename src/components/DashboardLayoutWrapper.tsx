'use client';

import { ReactNode } from 'react';
import { useSidebar } from './SidebarContext';
import { Sidebar } from './Sidebar';
import { DashboardShell } from './DashboardShell';

export function DashboardLayoutWrapper({ children }: { children: ReactNode }) {
  const { collapsed, toggle } = useSidebar();
  
  return (
    <div className="relative z-10 flex min-h-screen">
      <Sidebar />
      {/* Menu toggle button for collapsed state */}
      {collapsed && (
        <button 
          onClick={toggle}
          className="fixed top-6 left-6 z-50 w-10 h-10 flex items-center justify-center rounded-xl bg-stone-900/80 backdrop-blur border border-white/[0.06] text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-all shadow-sm max-md:hidden"
        >
          ☰
        </button>
      )}
      <main className={`${collapsed ? 'ml-0 pl-24' : 'ml-60'} max-md:ml-0 flex-1 p-8 max-md:p-4 transition-all duration-300`}>
        <DashboardShell>{children}</DashboardShell>
      </main>
    </div>
  );
}
