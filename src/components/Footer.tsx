"use client";

import Link from "next/link";
import { useTheme } from "../app/ThemeContext";

/**
 * Rodapé Modernist (redesign 2026).
 *
 * Bloco escuro, três colunas ruled e a barra legal embaixo. O bloco de
 * marcas e modelos não está no design doc, mas é link interno de SEO que já
 * estava em produção — fica, reescrito na linguagem do sistema.
 */

const DEFAULT_BRANDS = ["BMW", "BYD", "Land Rover", "Porsche", "Toyota"];
const DEFAULT_MODELS = ["911 Carrera S", "Defender 110", "Dolphin", "Hilux", "X5"];

export default function Footer() {
  const { companySettings } = useTheme();

  const colunas = [
    {
      titulo: "INSTITUCIONAL",
      itens: [
        { rotulo: "Quem somos", href: "/sobre" },
        { rotulo: "Garagem Profiler", href: "/carro-perfeito" },
        { rotulo: "Avaliação Express", href: "/avaliacao" },
        { rotulo: "Privacidade & LGPD", href: "/privacidade" },
      ],
    },
    {
      titulo: "ATENDIMENTO",
      itens: [
        { rotulo: companySettings.phone, href: `tel:${(companySettings.phone || "").replace(/\D/g, "")}` },
        {
          rotulo: `WhatsApp ${companySettings.whatsapp}`,
          href: `https://wa.me/${(companySettings.whatsappRaw || companySettings.whatsapp || "").replace(/\D/g, "")}`,
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
              Compra, venda e troca de veículos premium selecionados. Procedência,
              garantia e transparência.
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

        {/* Links internos de SEO — fora do design doc, mantidos de produção */}
        <div className="flex flex-col gap-5 border-b border-mt-inverso-regua-fina py-7">
          <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-extrabold tracking-[.16em] text-mt-inverso">
              MARCAS DISPONÍVEIS
            </h4>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              {DEFAULT_BRANDS.map((marca) => (
                <Link
                  key={marca}
                  href={`/estoque?marca=${encodeURIComponent(marca)}`}
                  className="mt-foco font-medium uppercase tracking-wider no-underline hover:text-mt-accent-400"
                >
                  {marca}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-extrabold tracking-[.16em] text-mt-inverso">
              MODELOS EM DESTAQUE
            </h4>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              {DEFAULT_MODELS.map((modelo) => (
                <Link
                  key={modelo}
                  href={`/estoque?modelo=${encodeURIComponent(modelo)}`}
                  className="mt-foco font-medium uppercase tracking-wider no-underline hover:text-mt-accent-400"
                >
                  {modelo}
                </Link>
              ))}
            </div>
          </div>
        </div>

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
