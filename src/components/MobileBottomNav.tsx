'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CheckSquare,
  FileText,
  BookOpen,
  Mail,
  Settings,
} from 'lucide-react';

const mobileNavItems = [
  { href: '/', label: 'Todo', icon: CheckSquare },
  { href: '/assignments', label: 'Tareas', icon: FileText },
  { href: '/materials', label: 'Materiales', icon: BookOpen },
  { href: '/email', label: 'Email', icon: Mail },
  { href: '/settings', label: 'Ajustes', icon: Settings },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-stone-950/85 backdrop-blur-xl border-t border-white/[0.08] z-40 md:hidden flex items-center justify-around px-2">
      {mobileNavItems.map(({ href, label, icon: Icon }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-lg text-xs font-medium transition-colors ${
              isActive
                ? 'text-accent-300 font-semibold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <div className={`p-1 rounded-md transition-colors ${isActive ? 'bg-accent-500/15 text-accent-300' : ''}`}>
              <Icon className="w-5 h-5 shrink-0" />
            </div>
            <span className="text-[10px] tracking-tight">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
