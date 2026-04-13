"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useWebSocket } from "@/lib/websocket/client";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  useWebSocket();

  return (
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
  );
}
