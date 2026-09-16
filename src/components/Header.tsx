"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "../app/ThemeContext";
import BotaoWhatsApp from "./modernist/BotaoWhatsApp";
import { linkWhatsApp } from "../lib/whatsapp";
import { MENU_DO_CABECALHO } from "../lib/menuDoCabecalho";

/**
 * Cabeçalho Modernist (redesign 2026).
 *
 * Barra escura de 68px, sem arredondamento, com a régua vermelha marcando a
 * seção ativa. O acesso ao painel não aparece no design doc, mas está em
 * produção — fica à direita, reescrito na linguagem do sistema (quadrado,
 * contorno de 1px).
 *
 * A barra completa só liga em `lg:` (1024px): logo, CINCO links em
 * `whitespace-nowrap` (`CONTATO` é o sexto e só entra em `2xl:`), painel e CTA
 * de WhatsApp ocupam ~870px com os espaçamentos — eram quatro links e ~950px
 * até 07/09, quando `GUIAS MOTORS` entrou e o `CONTATO` cedeu a faixa. Como o
 * globals.css corta `overflow-x` no <html>, o excedente era amputado sem
 * rolagem — em tablet retrato e celular deitado o WhatsApp e o painel caíam
 * fora da tela. Abaixo de `lg:` vale o cabeçalho compacto de hambúrguer.
 */

const LOGO_PADRAO = "/motors-store-logo-1.png";

const LOGO_POR_TEMA: Record<string, string> = {
  "motors-modernist": "/motors-store-logo-1.png",
  "luxury-light": "/motors-store-logo-1.png",
  "stealth-dark": "/motors-store-logo-2.png",
  "sport-nardo": "/motors-store-logo-3.png",
};

// A lista saiu daqui em 07/09 e virou dado em `lib/menuDoCabecalho.ts`. O
// docblock de lá tem a ordem, o porquê da extração e a medição de largura.
const NAV = MENU_DO_CABECALHO;

export default function Header() {
  const { theme, companySettings } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const pathname = usePathname();

  // A logo é derivada do tema e das configurações — não precisa de estado
  // nem de efeito. Só a falha de carregamento é estado, e ela é resetada
  // pela `key` do <Image> quando a fonte muda.
  const logoSrc =
    companySettings?.logoUrl || LOGO_POR_TEMA[theme] || LOGO_PADRAO;
  const [logoFalhou, setLogoFalhou] = useState(false);
  const usarFallbackTextual = logoFalhou;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const ativo = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const whatsappHref = linkWhatsApp(companySettings);

  return (
    <header className="sticky top-0 z-50 w-full bg-mt-inverso-fundo text-mt-inverso">
      {/* ─── Desktop ─── */}
      <div className="mx-auto hidden h-[68px] max-w-[1600px] items-center gap-5 px-10 lg:flex desktop:gap-9">
        <Link href="/" className="mt-foco mr-auto flex shrink-0 items-center gap-2.5">
          <span className="h-[26px] w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
          {!usarFallbackTextual ? (
            <Image
              key={logoSrc}
              src={encodeURI(logoSrc)}
              alt={companySettings?.name || "Motors Store"}
              width={160}
              height={40}
              priority
              unoptimized
              onError={() => setLogoFalhou(true)}
              className="h-8 w-auto max-w-[170px] object-contain object-left"
            />
          ) : (
            <span className="text-[18px] font-extrabold tracking-[.02em]">
              MOTORS<span className="font-normal text-mt-inverso-suave"> STORE</span>
            </span>
          )}
        </Link>

        {/* A barra tem 68px e uma linha só de rótulo. Sem `whitespace-nowrap`
            os rótulos de mais de uma palavra quebram em duas linhas na faixa
            1024–1280px — o tablet de balcão da loja. Eram três até 07/09
            (`CARRO PERFEITO`, `AVALIE SEU CARRO`, `A MOTORS`); com
            `GUIAS MOTORS` são quatro.

            `CONTATO` sobe de `desktop:` (1281px) para `2xl:` (1536px) em 07/09,
            quando `GUIAS MOTORS` entrou no menu. A razão é a mesma que já o
            fazia sair abaixo de 1280: é o único item cujo destino já está no
            rodapé e no botão de WhatsApp ao lado, como na tela 09 do design
            doc — e agora ele disputava espaço com um item que não tem esse
            substituto no cabeçalho.

            Não é preferência: com os dois, a folga da barra caía para ≈1px em
            1290px e ficava NEGATIVA abaixo disso, onde o Chrome liga o
            `desktop:` pelo `innerWidth` e faz layout com 15px a menos — o
            telefone partia em duas linhas. A conta e a medição estão no
            docblock de `lib/menuDoCabecalho.ts`. Decisão do dono em 07/09. */}
        <nav className="flex items-center gap-4 desktop:gap-7">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo(item.href) ? "page" : undefined}
              className={`mt-foco whitespace-nowrap border-b-2 pb-[3px] text-[11px] font-semibold tracking-[.14em] no-underline transition-colors ${
                item.href === "/contato" ? "hidden 2xl:block" : ""
              } ${
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

        {/* Só a partir de `xl:` (1280px): entre 1024 e 1279px o telefone
            empurrava a barra além do viewport e o CTA de WhatsApp saía da
            tela. A faixa fecha em 1279 porque `xl:` liga EM 1280 — a linha de
            1280px da tabela de `menuDoCabecalho.ts` só bate com o telefone
            já visível. */}
        <a
          href={`tel:${(companySettings?.phone || "").replace(/\D/g, "")}`}
          className="mt-foco hidden text-[13px] text-mt-neutral-300 no-underline hover:text-mt-inverso xl:block"
        >
          {companySettings?.phone}
        </a>

        {/* Acesso ao painel. O comparador e o seletor de paleta saíram daqui
            em 2026-08-06: o comparador apontava para `/comparar`, rota que
            não existe, e a troca de paleta passou a viver só na área
            administrativa. */}
        <div className="flex items-center gap-1.5">
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
        </div>

        <BotaoWhatsApp
          href={whatsappHref}
          origem="Header - WhatsApp"
          rotulo="WHATSAPP"
          tamanhoIcone={15}
          className="mt-btn mt-btn-primario mt-foco shrink-0 px-4 py-2.5 text-xs tracking-[.08em]"
        />
      </div>

      {/* ─── Mobile e tablet (até lg) ─── */}
      <div className="flex h-[58px] items-center gap-3 px-[18px] lg:hidden">
        <Link href="/" className="mt-foco mr-auto flex items-center gap-2.5">
          <span className="h-[22px] w-1.5 shrink-0 bg-mt-accent" aria-hidden="true" />
          {!usarFallbackTextual ? (
            <Image
              key={logoSrc}
              src={encodeURI(logoSrc)}
              alt={companySettings?.name || "Motors Store"}
              width={120}
              height={30}
              priority
              unoptimized
              onError={() => setLogoFalhou(true)}
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
        <div className="absolute left-0 right-0 top-full flex flex-col bg-mt-inverso-fundo px-[18px] pb-5 lg:hidden">
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
