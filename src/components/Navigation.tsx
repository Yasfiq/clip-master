'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Settings, BarChart, Download } from 'lucide-react';

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
    { id: 'dashboard', label: 'Dashboard', icon: BarChart },
    { id: 'clips', label: 'Clips', icon: Download },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleTabClick = (tabId: string) => {
    const target = TAB_ROUTES[tabId] ?? '/';
    router.push(target);
    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <div className="h-8 w-8 rounded-md bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">CM</span>
                </div>
                <span className="ml-2 text-xl font-bold text-gray-900">Clip Master</span>
              </div>
            </div>
          </div>

          {/* Desktop navigation */}
          <div className="hidden sm:flex sm:items-center sm:space-x-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    derivedActive === item.id
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Mobile menu button */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="sm:hidden bg-white border-t border-gray-200">
          <div className="pt-2 pb-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`w-full text-left flex items-center px-4 py-3 text-base font-medium ${
                    derivedActive === item.id
                      ? 'text-blue-700 bg-blue-50 border-r-4 border-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation;
