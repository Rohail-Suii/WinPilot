"use client";

import { createContext, useContext, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useWebSocket } from "@/lib/websocket/client";

export const GuestContext = createContext<boolean>(false);
export function useGuest() {
  return useContext(GuestContext);
}

interface DashboardShellProps {
  children: React.ReactNode;
  isGuest?: boolean;
  needsMigration?: boolean;
}

export function DashboardShell({ children, isGuest = false, needsMigration = false }: DashboardShellProps) {
  useWebSocket();

  useEffect(() => {
    if (needsMigration) {
      fetch("/api/auth/migrate-guest", { method: "POST" }).catch(() => {});
    }
  }, [needsMigration]);

  return (
    <GuestContext.Provider value={isGuest}>
      <div className="flex h-screen overflow-hidden bg-[#0A0A0A]">
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden sidebar-transition">
          <Topbar />
          <main id="main-content" className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </GuestContext.Provider>
  );
}
