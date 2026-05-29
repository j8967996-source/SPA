'use client';

import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Sidebar collapse state — shared between Sidebar (the chevron inside its
 * header) and TopBar (the hamburger button that's only rendered when
 * collapsed). State persists to localStorage so the user's choice survives
 * navigation and page reloads.
 *
 * Default = expanded. The desktop POS is the primary form factor; collapse
 * is opt-in for when the operator needs more horizontal room (long order
 * tables, dense schedule grids, etc.).
 */

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
  setCollapsed: () => {},
});

const STORAGE_KEY = 'hhg-spa:sidebar:collapsed';

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // Start expanded on first render to match SSR output (localStorage isn't
  // available server-side). The effect below picks up the stored choice on
  // mount; a brief flash on first load is acceptable vs. shipping the wrong
  // initial markup.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '1') setCollapsed(true);
    } catch {
      // localStorage can throw in privacy mode / iframes — silent fallback to expanded.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // Same defensive ignore — UI behaviour stays correct without persistence.
    }
  }, [collapsed]);

  return (
    <SidebarContext.Provider
      value={{ collapsed, toggle: () => setCollapsed((v) => !v), setCollapsed }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext);
}
