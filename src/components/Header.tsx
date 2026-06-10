"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import ThemeSettings from "./ThemeSettings";
import { useTheme } from "../app/ThemeContext";
import VehicleCompare from "./VehicleCompare";

export default function Header() {
  const [activeTap, setActiveTap] = useState(false);
  const { compareIds, theme, companySettings } = useTheme();
  const [compareOpen, setCompareOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const pathname = usePathname();

  // Logo mapping corresponding to active theme presets - Next.js maps public folder to root
  const logoSrcMap: Record<string, string> = {
    "luxury-light": "/Motors Store - logo 1.png",
    "stealth-dark": "/Motors Store - logo 2.png",
    "sport-nardo": "/Motors Store - logo 3 b.png",
  };

  const activeLogo = logoSrcMap[theme] || "/Motors Store - logo 1.png";

  useEffect(() => {
    console.log(`[Antigravity Branding] Logo do Header alternada para a variação correspondente ao tema: ${theme}`);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOpenCompare = () => {
      setCompareOpen(true);
    };
    window.addEventListener("ag-open-compare", handleOpenCompare);

    const checkHash = () => {
      if (window.location.hash === "#comparar") {
        setCompareOpen(true);
      }
    };
    
    checkHash();
    window.addEventListener("hashchange", checkHash);

    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("ag-open-compare", handleOpenCompare);
      window.removeEventListener("hashchange", checkHash);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-brand-border bg-brand-glass backdrop-blur-md transition-all duration-300">
      <div className="mx-auto flex h-16 lg:h-[75px] max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8 transition-all duration-300">
        
        {/* Clickable Logo */}
        <Link href="/" className="flex items-center group transition-transform active:scale-95 duration-200 flex-shrink-0">
          <img
            src={activeLogo}
            alt="Motors Store Logo"
            width={180}
            height={55}
            className="h-11 lg:h-[52px] w-auto object-contain transition-all duration-300 group-hover:scale-[1.02] filter brightness-105 drop-shadow-[0_2px_6px_rgba(0,0,0,0.06)] dark:drop-shadow-[0_2px_12px_rgba(255,255,255,0.12)]"
          />
        </Link>

        {/* Navigation Shortcuts - Balanced and Premium */}
        <nav className="hidden sm:flex items-center gap-2 lg:gap-4.5 mx-4">
          <Link
            href="/"
            className="relative text-[10px] font-bold uppercase tracking-[0.16em] text-brand-text/50 hover:text-brand-primary transition-all duration-300 whitespace-nowrap py-1.5 px-0.5 group"
          >
            HOME
            <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-brand-primary transition-all duration-300 group-hover:w-full" />
          </Link>
          
          <span className="text-brand-border/40 text-[9px] font-thin select-none">/</span>          <Link
            href="/#match-garagem"
            className="relative text-[10px] font-bold uppercase tracking-[0.16em] transition-all duration-300 whitespace-nowrap py-1.5 px-0.5 group flex flex-col items-center text-center"
          >
            {/* 1 line on tablets/mobile */}
            <span className="lg:hidden text-brand-text/50 group-hover:text-brand-primary transition-all">
              ENCONTRE O CARRO PERFEITO
            </span>
            {/* 2 lines on desktop */}
            <span className="hidden lg:flex flex-col items-center">
              <span className="text-[8px] font-bold text-brand-text/40 group-hover:text-brand-primary/60 transition-all">ENCONTRE O</span>
              <span className="text-[10px] font-extrabold text-brand-text/50 group-hover:text-brand-primary pb-0.5 mt-0.5 tracking-[0.12em] transition-all">CARRO PERFEITO</span>
            </span>
            <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-brand-primary transition-all duration-300 group-hover:w-full" />
          </Link>
          
          <span className="text-brand-border/40 text-[9px] font-thin select-none">/</span>
          
          <Link
            href="/#avaliacao-express"
            className="relative text-[10px] font-bold uppercase tracking-[0.16em] transition-all duration-300 whitespace-nowrap py-1.5 px-0.5 group flex flex-col items-center text-center"
          >
            {/* 1 line on tablets/mobile */}
            <span className="lg:hidden text-brand-text/50 group-hover:text-brand-primary transition-all">
              SEU CARRO AVALIE AGORA
            </span>
            {/* 2 lines on desktop */}
            <span className="hidden lg:flex flex-col items-center">
              <span className="text-[8px] font-bold text-brand-text/40 group-hover:text-brand-primary/60 transition-all">SEU CARRO</span>
              <span className="text-[10px] font-extrabold text-brand-text/50 group-hover:text-brand-primary pb-0.5 mt-0.5 tracking-[0.12em] transition-all">AVALIE AGORA</span>
            </span>
            <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-brand-primary transition-all duration-300 group-hover:w-full" />
          </Link>
 
          <span className="text-brand-border/40 text-[9px] font-thin select-none">/</span>
 
          <Link
            href="/sobre"
            className="relative text-[10px] font-bold uppercase tracking-[0.16em] transition-all duration-300 whitespace-nowrap py-1.5 px-0.5 group flex flex-col items-center text-center"
          >
            {/* 1 line on tablets/mobile */}
            <span className="lg:hidden text-brand-text/50 group-hover:text-brand-primary transition-all">
              SOBRE A MOTORS
            </span>
            {/* 2 lines on desktop */}
            <span className="hidden lg:flex flex-col items-center">
              <span className="text-[8px] font-bold text-brand-text/40 group-hover:text-brand-primary/60 transition-all">SOBRE A</span>
              <span className="text-[10px] font-extrabold text-brand-text/50 group-hover:text-brand-primary pb-0.5 mt-0.5 tracking-[0.12em] transition-all">MOTORS</span>
            </span>
            <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-brand-primary transition-all duration-300 group-hover:w-full" />
          </Link>

          <span className="text-brand-border/40 text-[9px] font-thin select-none">/</span>

          <Link
            href="/contato"
            className="relative text-[10px] font-bold uppercase tracking-[0.16em] text-brand-text/50 hover:text-brand-primary transition-all duration-300 whitespace-nowrap py-1.5 px-0.5 group"
          >
            CONTATO
            <span className="absolute bottom-0 left-0 w-0 h-[1.5px] bg-brand-primary transition-all duration-300 group-hover:w-full" />
          </Link>
        </nav>

        {/* Right-side Actions: Compare + Theme + Contact (icon-only) */}
        <div className="flex items-center gap-1.5">
          {/* Compare Button */}
          {compareIds.length > 1 ? (
            <button
              onClick={() => setCompareOpen(true)}
              className="relative flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-[#C83F00] hover:bg-[#B23800] text-white font-bold text-[10px] uppercase tracking-wider transition-all duration-300 active:scale-95 shadow-md border border-[#C83F00]"
              title="Comparar veículos selecionados"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
              </svg>
              <span>COMPARAR ({compareIds.length})</span>
            </button>
          ) : (
            <button
              onClick={() => setCompareOpen(true)}
              className={`relative flex items-center justify-center h-9 w-9 rounded-full border transition-all duration-300 active:scale-90 ${
                compareIds.length > 0 
                  ? "border-brand-primary/50 bg-brand-primary/8 text-brand-primary" 
                  : "border-brand-border/50 text-brand-text/35 hover:text-brand-text/60 hover:border-brand-border"
              }`}
              title="Comparar veículos"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
              </svg>
              {compareIds.length > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[8px] font-bold text-white bg-brand-primary">
                  {compareIds.length}
                </span>
              )}
            </button>
          )}

          {/* Profile Icon — Shortcut to Settings Panel */}
          <Link
            href="/configuracoes"
            className="flex items-center justify-center h-9 w-9 rounded-full border border-brand-border/50 text-brand-text/35 hover:text-brand-text/60 hover:border-brand-border transition-all duration-300 active:scale-90"
            title="Área Administrativa"
            aria-label="Área Administrativa"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>

          {/* Contact — icon only, clean circle */}
          <button
            onClick={() => {
              setActiveTap(true);
              setTimeout(() => setActiveTap(false), 200);
              window.location.href = "tel:" + companySettings.phone.replace(/\D/g, "");
            }}
            className={`flex items-center justify-center h-9 w-9 rounded-full border transition-all duration-300 active:scale-90 ${
              activeTap 
                ? "border-brand-primary/60 bg-brand-primary/15 text-brand-primary" 
                : "border-brand-border/50 text-brand-text/35 hover:text-brand-text/60 hover:border-brand-border"
            }`}
            aria-label="Ligar agora"
            title="Ligar agora"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </button>

          {/* Mobile Menu Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex sm:hidden items-center justify-center h-9 w-9 rounded-full border border-brand-border/50 text-brand-text/35 hover:text-brand-text/60 hover:border-brand-border transition-all duration-300 active:scale-90"
            aria-label="Menu principal"
            title="Menu principal"
          >
            {mobileMenuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4.5 w-4.5 text-brand-primary animate-none">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="h-4.5 w-4.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>

      </div>

      {/* Mobile Menu Panel */}
      {mobileMenuOpen && (
        <div className="sm:hidden absolute top-full left-0 right-0 bg-brand-glass backdrop-blur-lg border-b border-brand-border py-5 px-6 shadow-2xl flex flex-col gap-4.5 transition-all duration-300">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className={`text-[11px] font-extrabold uppercase tracking-[0.2em] border-b border-brand-border/30 pb-3 transition-colors ${
              pathname === "/" ? "text-brand-primary" : "text-brand-text/70 hover:text-brand-primary"
            }`}
          >
            HOME
          </Link>
          
          <Link
            href="/#match-garagem"
            onClick={() => setMobileMenuOpen(false)}
            className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-brand-text/70 hover:text-brand-primary border-b border-brand-border/30 pb-3 transition-colors flex justify-between items-center"
          >
            <span>ENCONTRE O CARRO PERFEITO</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary font-bold">IA</span>
          </Link>
          
          <Link
            href="/#avaliacao-express"
            onClick={() => setMobileMenuOpen(false)}
            className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-brand-text/70 hover:text-brand-primary border-b border-brand-border/30 pb-3 transition-colors flex justify-between items-center"
          >
            <span>AVALIE SEU CARRO AGORA</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-primary/10 text-brand-primary font-bold">FIPE</span>
          </Link>
          
          <Link
            href="/sobre"
            onClick={() => setMobileMenuOpen(false)}
            className={`text-[11px] font-extrabold uppercase tracking-[0.2em] border-b border-brand-border/30 pb-3 transition-colors ${
              pathname === "/sobre" ? "text-brand-primary" : "text-brand-text/70 hover:text-brand-primary"
            }`}
          >
            SOBRE A MOTORS
          </Link>
          
          <Link
            href="/contato"
            onClick={() => setMobileMenuOpen(false)}
            className={`text-[11px] font-extrabold uppercase tracking-[0.2em] pb-1 transition-colors ${
              pathname === "/contato" ? "text-brand-primary" : "text-brand-text/70 hover:text-brand-primary"
            }`}
          >
            CONTATO
          </Link>
        </div>
      )}

      {/* Back to Top floating button (Mobile only) */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-[90px] right-4 z-[999] sm:hidden flex h-10 w-10 items-center justify-center rounded-full bg-brand-card/95 border border-brand-primary/30 text-brand-primary shadow-lg backdrop-blur-sm transition-all duration-300 hover:bg-brand-bg active:scale-90"
          aria-label="Voltar ao topo"
          title="Voltar ao topo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Comparison Drawer / Modal Overlay */}
      {compareOpen && (
        <VehicleCompare onClose={() => setCompareOpen(false)} />
      )}
    </header>
  );
}
