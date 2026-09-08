'use client';

import { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import { Sidebar } from './Sidebar';
import { DashboardShell } from './DashboardShell';
import { MobileBottomNav } from './MobileBottomNav';

export function DashboardLayoutWrapper({ children }: { children: ReactNode }) {
  const { collapsed, toggle } = useSidebar();
  
  return (
    <div className="relative z-10 flex min-h-screen">
      <Sidebar />

      {/* Top Mobile Bar (md:hidden) */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-stone-950/85 backdrop-blur-md border-b border-white/[0.08] z-30 flex items-center justify-between px-4 md:hidden">
        <div className="flex items-center gap-3">
          <button 
            onClick={toggle}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-stone-900 border border-white/[0.08] text-stone-300 hover:text-white transition-colors"
            title="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-pale-700 border border-pale-600/40 flex items-center justify-center text-xs font-bold text-pale-300">
              C
            </div>
            <span className="text-sm font-semibold tracking-tight text-stone-100">Spear</span>
          </div>
        </div>
      </header>

      {/* Menu toggle button for desktop collapsed state */}
      {collapsed && (
        <button 
          onClick={toggle}
          className="fixed top-6 left-6 z-40 w-10 h-10 hidden md:flex items-center justify-center rounded-xl bg-stone-900/80 backdrop-blur border border-white/[0.06] text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-all shadow-sm"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <main className={`${collapsed ? 'ml-0 md:pl-24' : 'md:ml-60'} flex-1 p-8 max-md:px-4 max-md:pt-16 max-md:pb-32 transition-all duration-300`}>
        <DashboardShell>{children}</DashboardShell>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
