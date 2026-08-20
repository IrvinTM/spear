'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from './SidebarContext';

const navItems = [
  { href: '/', label: 'Todos', icon: '📋' },
  { href: '/materials', label: 'Materials', icon: '📚' },
  { href: '/email', label: 'Email', icon: '✉️' },
  { href: '/logs', label: 'Logs', icon: '📜' },
];

const activeClass =
  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-pale-700/60 text-pale-300 border border-pale-600/30';
const inactiveClass =
  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-400 hover:bg-pale-800/50 hover:text-stone-200 transition-all';

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();

  return (
    <aside className={`w-60 h-screen fixed top-0 left-0 cyber-glass !rounded-none !border-l-0 !border-t-0 !border-b-0 flex flex-col p-6 z-50 max-md:hidden transition-transform duration-300 ${collapsed ? '-translate-x-full' : 'translate-x-0'}`}>
      <div className="flex items-center gap-3 px-3 mb-8">
        <div className="w-7 h-7 rounded-md bg-pale-700 border border-pale-600/40 flex items-center justify-center text-sm font-bold text-pale-300">
          C
        </div>
        <span className="text-base font-semibold tracking-tight flex-1">Spear</span>
        <button onClick={toggle} className="w-8 h-8 flex items-center justify-center rounded text-stone-500 hover:text-stone-200 hover:bg-white/[0.06] transition-colors cursor-pointer">
          ❮
        </button>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map(({ href, label, icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={isActive ? activeClass : inactiveClass}
            >
              <span className="w-5 text-center">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] pt-4">
        <Link
          href="/settings"
          className={
            pathname.startsWith('/settings') ? activeClass : inactiveClass
          }
        >
          <span className="w-5 text-center">⚙️</span>
          Settings
        </Link>
      </div>
    </aside>
  );
}
