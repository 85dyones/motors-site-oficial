"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "../app/ThemeContext";
import BotaoWhatsApp from "./modernist/BotaoWhatsApp";
import { linkWhatsApp } from "../lib/whatsapp";
import { MENU_DO_CABECALHO } from "../lib/menuDoCabecalho";
import { CAMINHO_DO_REPASSE } from "../lib/repasseNaNavegacao";
import { trackContactClick } from "../lib/telemetry";

/**
 * Cabeçalho Modernist (redesign 2026).
 *
 * Barra escura de 68px, sem arredondamento, com a régua vermelha marcando a
 * seção ativa. O acesso ao painel não aparece no design doc, mas está em
 * produção — fica à direita, reescrito na linguagem do sistema (quadrado,
 * contorno de 1px).
 *
 * A barra completa só liga em `lg:` (1024px): logo, CINCO links em
 * `whitespace-nowrap` até 1280px (`REPASSE` entra em `desktop:`, 1281px, e
 * `CONTATO` em `2xl:`, 1536px), painel e CTA
 * de WhatsApp ocupam ~870px com os espaçamentos — eram quatro links e ~950px
 * até 07/09, quando `GUIAS MOTORS` entrou e o `CONTATO` cedeu a faixa. Como o
 * globals.css corta `overflow-x` no <html>, o excedente era amputado sem
 * rolagem — em tablet retrato e celular deitado o WhatsApp e o painel caíam
 * fora da tela. Abaixo de `lg:` vale o cabeçalho compacto de hambúrguer.
 */

/**
 * O logo do cabeçalho é SEMPRE o negativo: o cabeçalho tem fundo grafite
 * (`bg-mt-inverso-fundo`) em qualquer tema do painel.
 *
 * VERTICAL, e não horizontal: a barra de 68px não tem folga para a largura
 * do horizontal (≈180px). A régua medida em `lib/menuDoCabecalho.ts` deixa
 * 13px livres em 1281px com o logo antigo (≈82px, com a barra ao lado); o
 * vertical a 40px de altura ocupa 80px, e a régua não muda. O horizontal
 * mandava o telefone para duas linhas já em 1366px (medido em 29/09).
 *
 * Até 29/09 o tema claro servia `motors-store-logo-1.png`, a versão vertical
 * para fundo CLARO: a palavra MOTORS em grafite #434343 sobre o grafite do
 * cabeçalho sumia, e o visitante via só o símbolo — e ao lado dele uma barra
 * ferrugem que não faz parte da marca. Os SVGs de `public/marca/` saíram do
 * arquivo original da marca (.cdr) em 29/09; o `LEIA-ME.txt` de lá lista as
 * versões e as cores.
 *
 * O logo enviado pelo painel (`companySettings.logoUrl`) NÃO entra aqui.
 * Medido em produção em 29/09: o painel guarda um arquivo só
 * (`branding/uploads/logo-…webp`, 800×392), e é a versão para fundo claro — a
 * mesma do PNG antigo. Um campo só não tem como servir a um cabeçalho que é
 * sempre escuro. Ele continua valendo onde o fundo é claro: a prévia de
 * compartilhamento (`app/og/route.tsx`) e a barra do painel.
 */
const LOGO_DO_CABECALHO = "/marca/motors-store-vertical-negativo.svg";

// A lista saiu daqui em 07/09 e virou dado em `lib/menuDoCabecalho.ts`. O
// docblock de lá tem a ordem, o porquê da extração e a medição de largura.
const NAV = MENU_DO_CABECALHO;

export default function Header({
  logo,
  logoCompacto,
}: {
  /**
   * O logo animado da barra do desktop e o da barra compacta, prontos, vindos
   * do layout (`marca/usosDoLogo.tsx`). São DOIS nós, e não o mesmo nó usado
   * duas vezes: cada um tem os seus ids de degradê, e o primeiro fica dentro
   * de um `display: none` em metade das telas. Sem eles (teste, ou um layout
   * que não os passe) vale o SVG parado de `LOGO_DO_CABECALHO`.
   */
  logo?: ReactNode;
  logoCompacto?: ReactNode;
} = {}) {
  const { companySettings } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const pathname = usePathname();

  // Fixo: ver `LOGO_DO_CABECALHO`. Só a falha de carregamento é estado.
  const logoSrc = LOGO_DO_CABECALHO;
  const [logoFalhou, setLogoFalhou] = useState(false);
  const usarFallbackTextual = logoFalhou;

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Some quando a página tem barra fixa no pé (`data-barra-inferior`): desde
    // que o `sticky` voltou a grudar (30/09/2026, `overflow-x: clip`), a barra
    // do resultado do /carro-perfeito fica no pé, e o botão cairia em cima do CTA.
    const handleScroll = () =>
      setShowBackToTop(window.scrollY > 400 && !document.querySelector("[data-barra-inferior]"));
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
          {logo ? (
            logo
          ) : !usarFallbackTextual ? (
            <Image
              key={logoSrc}
              src={encodeURI(logoSrc)}
              alt={companySettings?.name || "Motors Store"}
              width={80}
              height={40}
              priority
              unoptimized
              onError={() => setLogoFalhou(true)}
              className="h-10 w-auto max-w-[170px] object-contain object-left"
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
            docblock de `lib/menuDoCabecalho.ts`. Decisão do dono em 07/09.

            `REPASSE` entra em 25/09 (spec 2026-09-24 §10) com
            `hidden desktop:block`, decisão do dono de 24/09: de 1024 a
            1280px ele não existe para o layout e não pesa na régua. De 1281
            para cima ele custa o rótulo (60,5px) mais o gap do nav — e com
            `desktop:gap-7` (28px) isso bastava para o telefone partir em
            duas linhas a 1281px, medido em produção. Decisão do dono,
            no mesmo dia (opção A): o nav passa para `desktop:gap-6` (24px),
            com folga de 13px em 1281px e 182px em 1536px. A tabela remedida
            está em `lib/menuDoCabecalho.ts`. */}
        <nav className="flex items-center gap-4 desktop:gap-6">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo(item.href) ? "page" : undefined}
              className={`mt-foco whitespace-nowrap border-b-2 pb-[3px] text-[11px] font-semibold tracking-[.14em] no-underline transition-colors ${
                item.href === "/contato"
                  ? "hidden 2xl:block"
                  : item.href === CAMINHO_DO_REPASSE
                    ? "hidden desktop:block"
                    : ""
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
        {/* Desde 2026-09-21 este é um CTA medido como os outros. Era o único
            `tel:` do site fora de `trackContactClick` — o do rodapé foi ligado
            em 2026-08-06 e este ficou para trás, justamente o telefone mais
            visível no desktop. O clique não gerava `click_to_call` no
            dataLayer nem `Contact` no Meta, e a `conv_ligacao` do Google Ads
            segue sem nunca ter recebido dado. Este link é metade do motivo; a
            outra metade é conferir se a tag de `click_to_call` do container
            está apontada para ela. Rótulo no padrão do vizinho,
            "Header - WhatsApp". */}
        <a
          href={`tel:${(companySettings?.phone || "").replace(/\D/g, "")}`}
          onClick={() => trackContactClick("phone", "Header - Telefone")}
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
          {logoCompacto ? (
            logoCompacto
          ) : !usarFallbackTextual ? (
            <Image
              key={logoSrc}
              src={encodeURI(logoSrc)}
              alt={companySettings?.name || "Motors Store"}
              width={72}
              height={36}
              priority
              unoptimized
              onError={() => setLogoFalhou(true)}
              className="h-9 w-auto max-w-[130px] object-contain object-left"
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
        <div className="absolute left-0 right-0 top-full flex max-h-[calc(100dvh-58px)] flex-col overflow-y-auto bg-mt-inverso-fundo px-[18px] pb-5 lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              aria-current={ativo(item.href) ? "page" : undefined}
              className={`flex items-baseline justify-between gap-3 border-b border-mt-inverso-regua-fina py-3.5 text-[11px] font-extrabold tracking-[.2em] no-underline ${
                ativo(item.href) ? "text-mt-accent" : "text-mt-inverso-suave"
              }`}
            >
              <span>{item.rotulo}</span>
              {/* O apoio da prancha "Portas de entrada" (hoje só o REPASSE),
                  à direita do rótulo, em peso normal. Só aqui: na barra do
                  desktop cada caractere custa folga (tabela de
                  `lib/menuDoCabecalho.ts`).

                  O `sr-only` entre os dois `<span>` visíveis é a pausa para o
                  leitor de tela: sem nó de texto entre eles, o nome acessível
                  do link virava a concatenação bruta "REPASSEabaixo da
                  FIPE...", sem pausa (revisão de 25/09). `aria-label` no
                  `Link` resolveria o mesmo problema, mas sobrescreveria o
                  texto visível para quem usa controle por voz — o separador
                  oculto não. */}
              {item.apoio && (
                <>
                  <span className="sr-only">, </span>
                  <span className="text-[11px] font-normal tracking-normal text-mt-accent-400">{item.apoio}</span>
                </>
              )}
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
