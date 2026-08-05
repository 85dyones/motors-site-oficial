"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import ThemeSettings from "./ThemeSettings";
import { useTheme } from "../app/ThemeContext";
import { IconeWhatsApp } from "./modernist/primitivos";

/**
 * Cabeçalho Modernist (redesign 2026).
 *
 * Barra escura de 68px, sem arredondamento, com a régua vermelha marcando a
 * seção ativa. As ações de comparar / painel / tema não aparecem no design
 * doc, mas estão em produção — ficam no cluster da direita, reescritas na
 * linguagem do sistema (quadradas, contorno de 1px).
 */

const NAV = [
  { href: "/estoque", rotulo: "ESTOQUE" },
  { href: "/carro-perfeito", rotulo: "CARRO PERFEITO" },
  { href: "/avaliacao", rotulo: "AVALIE SEU CARRO" },
  { href: "/sobre", rotulo: "A MOTORS" },
  { href: "/contato", rotulo: "CONTATO" },
];

export default function Header() {
  const { compareIds, theme, companySettings } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const logoSrcMap: Record<string, string> = {
    "motors-modernist": "/motors-store-logo-1.png",
    "luxury-light": "/motors-store-logo-1.png",
    "stealth-dark": "/motors-store-logo-2.png",
    "sport-nardo": "/motors-store-logo-3.png",
  };

  const activeLogo = companySettings?.logoUrl || logoSrcMap[theme] || "/motors-store-logo-1.png";
  const [logoSrc, setLogoSrc] = useState<string>(activeLogo);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const newLogo = companySettings?.logoUrl || logoSrcMap[theme] || "/motors-store-logo-1.png";
    setLogoSrc(newLogo);
    setImgError(false);
  }, [theme, companySettings?.logoUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOpenCompare = () => router.push("/comparar");
    window.addEventListener("ag-open-compare", handleOpenCompare);

    const checkHash = () => {
      if (window.location.hash === "#comparar") router.push("/comparar");
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);

    const handleScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("ag-open-compare", handleOpenCompare);
      window.removeEventListener("hashchange", checkHash);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const ativo = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const whatsappHref = `https://wa.me/${(companySettings?.whatsappRaw || companySettings?.whatsapp || "").replace(/\D/g, "")}`;

  return (
    <header className="sticky top-0 z-50 w-full bg-mt-inverso-fundo text-mt-inverso">
      {/* ─── Desktop ─── */}
      <div className="mx-auto hidden h-[68px] max-w-[1600px] items-center gap-9 px-6 lg:px-10 sm:flex">
        <Link href="/" className="mt-foco mr-auto flex shrink-0 items-center gap-2.5">
          <span className="h-[26px] w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
          {!imgError ? (
            <Image
              src={encodeURI(logoSrc)}
              alt={companySettings?.name || "Motors Store"}
              width={160}
              height={40}
              priority
              unoptimized
              onError={() => {
                if (logoSrc !== "/motors-store-logo-1.png") setLogoSrc("/motors-store-logo-1.png");
                else setImgError(true);
              }}
              className="h-8 w-auto max-w-[170px] object-contain object-left"
            />
          ) : (
            <span className="text-[18px] font-extrabold tracking-[.02em]">
              MOTORS<span className="font-normal text-mt-inverso-suave"> STORE</span>
            </span>
          )}
        </Link>

        <nav className="flex items-center gap-7">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo(item.href) ? "page" : undefined}
              className={`mt-foco border-b-2 pb-[3px] text-[11px] font-semibold tracking-[.14em] no-underline transition-colors ${
                ativo(item.href)
                  ? "border-mt-accent text-mt-inverso"
                  : "border-transparent text-mt-inverso-suave hover:text-mt-inverso"
              }`}
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>

        <span className="h-[26px] w-px bg-[#444141]" aria-hidden="true" />

        <a
          href={`tel:${(companySettings?.phone || "").replace(/\D/g, "")}`}
          className="mt-foco hidden text-[13px] text-mt-neutral-300 no-underline hover:text-mt-inverso lg:block"
        >
          {companySettings?.phone}
        </a>

        {/* Ações que o design doc não mostra, mas produção usa */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => router.push("/comparar")}
            title="Comparar veículos"
            aria-label={`Comparar veículos${compareIds.length ? ` (${compareIds.length})` : ""}`}
            className="mt-foco relative flex h-9 w-9 items-center justify-center border border-[#444141] text-mt-inverso-suave transition-colors hover:border-mt-inverso hover:text-mt-inverso"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4" />
            </svg>
            {compareIds.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-mt-accent px-1 text-[9px] font-bold text-mt-inverso">
                {compareIds.length}
              </span>
            )}
          </button>

          <Link
            href="/configuracoes"
            title="Área administrativa"
            aria-label="Área administrativa"
            className="mt-foco flex h-9 w-9 items-center justify-center border border-[#444141] text-mt-inverso-suave transition-colors hover:border-mt-inverso hover:text-mt-inverso"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>

          <ThemeSettings />
        </div>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-btn mt-btn-primario mt-foco shrink-0 px-4 py-2.5 text-xs tracking-[.08em]"
        >
          <IconeWhatsApp size={15} />
          WHATSAPP
        </a>
      </div>

      {/* ─── Mobile ─── */}
      <div className="flex h-[58px] items-center gap-3 px-[18px] sm:hidden">
        <Link href="/" className="mt-foco mr-auto flex items-center gap-2.5">
          <span className="h-[22px] w-1.5 shrink-0 bg-mt-accent" aria-hidden="true" />
          {!imgError ? (
            <Image
              src={encodeURI(logoSrc)}
              alt={companySettings?.name || "Motors Store"}
              width={120}
              height={30}
              priority
              unoptimized
              onError={() => setImgError(true)}
              className="h-7 w-auto max-w-[130px] object-contain object-left"
            />
          ) : (
            <span className="text-[15px] font-extrabold">MOTORS</span>
          )}
        </Link>

        <Link href="/estoque" aria-label="Buscar no estoque" className="mt-foco p-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[22px] w-[22px]">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4.3-4.3" />
          </svg>
        </Link>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu principal"
          aria-expanded={mobileMenuOpen}
          className="mt-foco p-1"
        >
          {mobileMenuOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6">
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="absolute left-0 right-0 top-full flex flex-col bg-mt-inverso-fundo px-[18px] pb-5 sm:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              aria-current={ativo(item.href) ? "page" : undefined}
              className={`border-b border-mt-inverso-regua-fina py-3.5 text-[11px] font-extrabold tracking-[.2em] no-underline ${
                ativo(item.href) ? "text-mt-accent" : "text-mt-inverso-suave"
              }`}
            >
              {item.rotulo}
            </Link>
          ))}
          <div className="flex items-center gap-3 pt-4">
            <Link
              href="/comparar"
              onClick={() => setMobileMenuOpen(false)}
              className="text-[11px] font-extrabold tracking-[.16em] text-mt-inverso-suave no-underline"
            >
              COMPARAR{compareIds.length > 0 ? ` (${compareIds.length})` : ""}
            </Link>
            <span className="text-mt-inverso-regua" aria-hidden="true">
              ·
            </span>
            <Link
              href="/configuracoes"
              onClick={() => setMobileMenuOpen(false)}
              className="text-[11px] font-extrabold tracking-[.16em] text-mt-inverso-suave no-underline"
            >
              PAINEL
            </Link>
          </div>
        </div>
      )}

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Voltar ao topo"
          className="mt-foco fixed bottom-[90px] right-4 z-[999] flex h-10 w-10 items-center justify-center border-2 border-mt-ink bg-mt-bg text-mt-ink sm:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="h-4 w-4">
            <path d="m4.5 15.75 7.5-7.5 7.5 7.5" />
          </svg>
        </button>
      )}
    </header>
  );
}
