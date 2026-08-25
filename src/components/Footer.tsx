"use client";

import Link from "next/link";
import { useTheme } from "../app/ThemeContext";
import type { NavegacaoDoRodape } from "../lib/navegacaoDoRodape";
import { trackContactClick } from "../lib/telemetry";
import { linkWhatsApp, telefoneVisivel } from "../lib/whatsapp";

/**
 * Rodapé Modernist (redesign 2026).
 *
 * Bloco escuro, três colunas ruled e a barra legal embaixo. O bloco de
 * marcas e modelos não está no design doc, mas é link interno de SEO que já
 * estava em produção — fica, reescrito na linguagem do sistema.
 *
 * A lista vem PRONTA do servidor, por prop. Até 2026-08-25 ela era buscada aqui
 * mesmo, num `useEffect` — e por isso não existia no HTML servido: o link
 * interno mais repetido do site não era rastreável. A regra e a história estão
 * em `lib/navegacaoDoRodape.ts`.
 */

export default function Footer({ navegacao }: { navegacao?: NavegacaoDoRodape }) {
  const { companySettings } = useTheme();
  const marcas = navegacao?.marcas ?? [];
  const modelos = navegacao?.modelos ?? [];

  const colunas: {
    titulo: string;
    itens: { rotulo: string; href: string | null; contato?: "whatsapp" | "phone" }[];
  }[] = [
    {
      titulo: "INSTITUCIONAL",
      itens: [
        { rotulo: "Quem somos", href: "/sobre" },
        { rotulo: "Garagem Profiler", href: "/carro-perfeito" },
        { rotulo: "Avaliação Express", href: "/avaliacao" },
        { rotulo: "Financiamento", href: "/financiamento" },
        { rotulo: "Garantia", href: "/garantia" },
        { rotulo: "Privacidade & LGPD", href: "/privacidade" },
      ],
    },
    {
      titulo: "ATENDIMENTO",
      itens: [
        {
          rotulo: companySettings.phone,
          href: `tel:${(companySettings.phone || "").replace(/\D/g, "")}`,
          contato: "phone",
        },
        {
          // Rótulo e link saem do MESMO campo (`lib/whatsapp.ts`). Vinham de
          // dois: o texto de `companySettings.whatsapp`, o href de
          // `whatsappRaw`. Em 2026-08-25 o HTML servido da home mostrava
          // "(41) 99842-6127" com um wa.me para 5541997372165 — número na tela
          // diferente do número que o botão abre.
          rotulo: `WhatsApp ${telefoneVisivel(companySettings)}`,
          href: linkWhatsApp(companySettings),
          contato: "whatsapp",
        },
        { rotulo: companySettings.hours, href: null },
      ],
    },
    {
      titulo: "LOCALIZAÇÃO",
      itens: [
        { rotulo: companySettings.address, href: null },
        { rotulo: companySettings.instagramUsername || companySettings.instagram, href: companySettings.instagram || null },
      ],
    },
  ];

  return (
    <footer className="w-full bg-mt-inverso-fundo px-6 pb-8 pt-14 text-mt-inverso-suave lg:px-10">
      <div className="mx-auto max-w-[1600px]">
        <div className="flex flex-col gap-10 border-b border-mt-inverso-regua-fina pb-10 md:flex-row md:gap-14">
          <div className="flex-[1.2]">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="h-6 w-2 shrink-0 bg-mt-accent" aria-hidden="true" />
              <span className="text-[17px] font-extrabold text-mt-inverso">
                {companySettings.name}
              </span>
            </div>
            <p className="m-0 max-w-[300px] text-[13px] leading-relaxed">
              Compra, venda e troca de seminovos selecionados. De cada dez
              avaliados, três entram.
            </p>
          </div>

          {colunas.map((coluna) => (
            <div key={coluna.titulo} className="flex-1">
              <div className="mb-3.5 text-[10px] font-extrabold tracking-[.16em] text-mt-inverso">
                {coluna.titulo}
              </div>
              <div className="flex flex-col gap-2 text-[13px] leading-snug">
                {coluna.itens
                  .filter((item) => item.rotulo)
                  .map((item) =>
                    item.href ? (
                      <Link
                        key={item.rotulo}
                        href={item.href}
                        // Telefone e WhatsApp do rodapé aparecem em todas as
                        // páginas e são rota de contato como qualquer outra —
                        // até 2026-08-06 eram os únicos CTAs de contato do
                        // site que não disparavam `Contact`.
                        onClick={
                          item.contato
                            ? () =>
                                trackContactClick(
                                  item.contato!,
                                  `Rodapé - ${item.contato === "whatsapp" ? "WhatsApp" : "Telefone"}`,
                                )
                            : undefined
                        }
                        className="mt-foco whitespace-pre-line text-mt-inverso-suave no-underline hover:text-mt-inverso"
                      >
                        {item.rotulo}
                      </Link>
                    ) : (
                      <span key={item.rotulo} className="whitespace-pre-line">
                        {item.rotulo}
                      </span>
                    ),
                  )}
              </div>
            </div>
          ))}
        </div>

        {/* Links internos de SEO — fora do design doc, mantidos de produção.
            Só aparece depois que o estoque responde: cabeçalho sem lista é
            ruído para o leitor e link morto para o rastreador. */}
        {(marcas.length > 0 || modelos.length > 0) && (
          <div className="flex flex-col gap-5 border-b border-mt-inverso-regua-fina py-7">
            {marcas.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-[10px] font-extrabold tracking-[.16em] text-mt-inverso">
                  MARCAS DISPONÍVEIS
                </h4>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                  {marcas.map((marca) => (
                    <Link
                      key={marca.href}
                      href={marca.href}
                      className="mt-foco font-medium uppercase tracking-wider no-underline hover:text-mt-accent-400"
                    >
                      {marca.rotulo}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {modelos.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-[10px] font-extrabold tracking-[.16em] text-mt-inverso">
                  MODELOS EM DESTAQUE
                </h4>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                  {modelos.map((modelo) => (
                    <Link
                      key={modelo.href}
                      href={modelo.href}
                      className="mt-foco font-medium uppercase tracking-wider no-underline hover:text-mt-accent-400"
                    >
                      {modelo.rotulo}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-4 text-[11px] tracking-[.06em] md:flex-row md:justify-between">
          <span>
            © {new Date().getFullYear()} {companySettings.name.toUpperCase()}
            {companySettings.cnpj ? ` · CNPJ ${companySettings.cnpj}` : ""}
          </span>
          <span className="md:text-right">
            PREÇOS E CONDIÇÕES SUJEITOS A ALTERAÇÃO · CRÉDITO SUJEITO A APROVAÇÃO
          </span>
        </div>
      </div>
    </footer>
  );
}
