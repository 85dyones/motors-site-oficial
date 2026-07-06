"use client";

import { useState } from "react";
import LogoutButton from "./LogoutButton";

interface AdminLayoutClientWrapperProps {
  role: string;
  fullName: string;
  roleLabel: string;
  sidebarNav: React.ReactNode;
  children: React.ReactNode;
}

export default function AdminLayoutClientWrapper({
  role,
  fullName,
  roleLabel,
  sidebarNav,
  children,
}: AdminLayoutClientWrapperProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex relative overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-35 md:hidden backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - responsive position */}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen w-64 border-r border-brand-border/40 bg-brand-bg flex flex-col justify-between p-6 z-40 transition-transform duration-300 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col gap-8">
          {/* Logo / Header */}
          <div className="flex flex-col gap-1 select-none">
            <div className="flex items-center justify-between">
              <span className="text-xl font-black tracking-widest text-brand-text uppercase">
                MOTORS
              </span>
              {/* Mobile Close Button */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1 text-brand-text/50 hover:text-brand-text cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <span className="text-[9px] font-bold text-brand-gold uppercase tracking-[0.15em] block">
              Painel de Controle
            </span>
            <div className="h-[2px] w-8 bg-brand-primary rounded-full mt-1" />
          </div>

          {/* Navigation Links */}
          <div onClick={() => setSidebarOpen(false)}>
            {sidebarNav}
          </div>
        </div>

        {/* User Card info inside sidebar */}
        <div className="flex flex-col gap-4 border-t border-brand-border/40 pt-4 mt-auto">
          <div className="flex flex-col pl-1">
            <span className="text-xs font-bold text-brand-text truncate">
              {fullName}
            </span>
            <span className="text-[9px] font-semibold text-brand-gold uppercase tracking-wider mt-0.5">
              {roleLabel}
            </span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col min-h-screen overflow-y-auto relative z-10 w-full">
        {/* Main Content Header */}
        <header className="h-16 border-b border-brand-border/40 bg-brand-bg px-4 md:px-8 flex items-center justify-between md:justify-end shrink-0 select-none">
          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-xl border border-brand-border/60 hover:bg-brand-card/30 text-brand-text cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold text-brand-text/40 tracking-wider uppercase">
              Motors Showcase v2.0
            </span>
          </div>
        </header>

        {/* Content body wrapper centered */}
        <main className="flex-grow p-4 md:p-8 flex justify-center w-full">
          <div className="max-w-6xl w-full flex flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
