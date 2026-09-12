'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, SlidersHorizontal, LayoutDashboard, Film } from 'lucide-react';

interface NavigationProps {
  activeTab?: 'dashboard' | 'jobs' | 'clips' | 'settings';
}

const TAB_ROUTES: Record<string, string> = {
  dashboard: '/',
  jobs: '/',
  clips: '/clips',
  settings: '/settings',
};

const Navigation: React.FC<NavigationProps> = ({ activeTab: activeTabProp }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Derive active tab from pathname so the highlight stays in sync across
  // direct navigations and reloads. Falls back to the explicit prop when
  // the route is unmapped (e.g. /jobs/[id]).
  const derivedActive: string =
    activeTabProp ??
    Object.entries(TAB_ROUTES).find(([, p]) =>
      p === '/' ? pathname === '/' : pathname?.startsWith(p),
    )?.[0] ??
    'dashboard';

  const navItems = [
    { id: 'dashboard', label: 'Dasbor', icon: LayoutDashboard },
    { id: 'clips', label: 'Klip Video', icon: Film },
    { id: 'settings', label: 'Pengaturan', icon: SlidersHorizontal },
  ];

  const handleTabClick = (tabId: string) => {
    const target = TAB_ROUTES[tabId] ?? '/';
    router.push(target);
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-inner">
              <span className="text-zinc-100 font-bold text-xs tracking-wider">CM</span>
            </div>
            <div className="flex flex-col">
              <span className="text-base font-semibold text-zinc-100 tracking-tight leading-none">
                Clip Master
              </span>
              <span className="text-[10px] text-zinc-400 tracking-wider uppercase mt-0.5">
                Studio Kreator
              </span>
            </div>
          </div>

          {/* Desktop navigation */}
          <div className="hidden sm:flex sm:items-center sm:space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = derivedActive === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`inline-flex items-center min-h-[44px] px-3.5 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 ${
                    isActive
                      ? 'text-zinc-100 bg-zinc-800 border border-zinc-700 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Mobile menu button */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Tutup navigasi' : 'Buka navigasi'}
              className="inline-flex items-center justify-center p-2.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {isMobileMenuOpen && (
        <div className="sm:hidden bg-zinc-900 border-t border-zinc-800 px-4 pt-2 pb-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = derivedActive === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`w-full text-left flex items-center min-h-[44px] px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'text-zinc-100 bg-zinc-800 border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                }`}
              >
                <Icon className="mr-3 h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
};

export default Navigation;
