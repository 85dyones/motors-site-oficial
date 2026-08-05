"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "../app/ThemeContext";
import { getEstoque, getVeiculoPdpUrl, truncateString, type Veiculo } from "../lib/supabase";

/**
 * Rodapé Modernist (redesign 2026).
 *
 * Bloco escuro, três colunas ruled e a barra legal embaixo. O bloco de
 * marcas e modelos não está no design doc, mas é link interno de SEO que já
 * estava em produção — fica, reescrito na linguagem do sistema e alimentado
 * pelo estoque real (ver `useVitrineDestaque` abaixo).
 */

const MAX_MARCAS = 8;
const MAX_MODELOS = 5;

/**
 * Marcas e modelos reais do estoque, não uma lista fixa.
 *
 * Até 2026-08-04 esta seção listava BMW/BYD/Land Rover/Porsche/Toyota e
 * 911 Carrera S/Defender 110/Dolphin/Hilux/X5 como constantes — nem sempre
 * correspondiam ao que estava à venda, e o link de modelo (`?modelo=`) exige
 * igualdade exata com o campo `modelo` do banco (hoje em `Catalogo.tsx`), que
 * é a string completa do RevendaMais — nunca ia bater com um nome de exibição
 * inventado. Os links de marca funcionavam por coincidência: o mecanismo é
 * real, só os valores eram fictícios.
 *
 * O redesign de 2026 reintroduziu a lista fixa por engano ao reescrever o
 * rodapé; esta versão é a da `main`, com o catálogo agora em `/estoque`.
 *
 * O feed não tem um campo de "nome de modelo" limpo — `modelo` já vem com
 * versão e motorização embutidas (ex.: "corolla cross xre 2.0 16v flex aut").
 * Por isso os modelos linkam para a página do veículo (rota estável, sempre
 * resolve), e a marca continua linkando para o filtro (`?marca=`), que já é
 * exato por natureza — é a mesma lista usada no seletor de marca do Hero.
 */
function useVitrineDestaque() {
  const [marcas, setMarcas] = useState<string[]>([]);
  const [modelos, setModelos] = useState<{ label: string; href: string }[]>([]);

  useEffect(() => {
    let ativo = true;
    getEstoque()
      .then((estoque: Veiculo[]) => {
        if (!ativo) return;
        const disponiveis = estoque.filter((v) => !v.vendido);

        const contagem = new Map<string, number>();
        for (const v of disponiveis) {
          contagem.set(v.marca, (contagem.get(v.marca) || 0) + 1);
        }
        const marcasOrdenadas = [...contagem.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([marca]) => marca)
          .slice(0, MAX_MARCAS);

        const destaques = [...disponiveis]
          .sort((a, b) => (b.preco || 0) - (a.preco || 0))
          .slice(0, MAX_MODELOS)
          .map((v) => ({
            label: truncateString(`${v.marca} ${v.modelo}`, 26),
            href: getVeiculoPdpUrl(v),
          }));

        setMarcas(marcasOrdenadas);
        setModelos(destaques);
      })
      .catch((err) => console.warn("[Footer] Falha ao carregar vitrine:", err));
    return () => {
      ativo = false;
    };
  }, []);

  return { marcas, modelos };
}

export default function Footer() {
  const { companySettings } = useTheme();
  const { marcas, modelos } = useVitrineDestaque();

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
                      key={marca}
                      href={`/estoque?marca=${encodeURIComponent(marca)}`}
                      className="mt-foco font-medium uppercase tracking-wider no-underline hover:text-mt-accent-400"
                    >
                      {marca}
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
                      {modelo.label}
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
