"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import { formatarKm, formatarPreco } from "./primitivos";

/**
 * Vitrine do tablet de balcão — tela 08 B do design doc.
 *
 * 1024×768, toque, alvos de 56px. Quatro veículos por página numa grade 2×2,
 * com filtros por faixa em cima.
 *
 * O filtro aqui ordena e pagina, nunca esconde: "VER MAIS" percorre o estoque
 * inteiro e a faixa ativa começa em "TODOS". É a regra 6 do CLAUDE.md, e ela
 * vale igual no aparelho da loja — o cliente que rola até o fim tem que
 * chegar aos mesmos veículos que estão no site.
 */

const POR_PAGINA = 4;

type Faixa = {
  chave: string;
  rotulo: string;
  filtro: (v: Veiculo) => boolean;
};

const FAIXAS: Faixa[] = [
  { chave: "todos", rotulo: "TODOS", filtro: () => true },
  {
    chave: "ate200",
    rotulo: "ATÉ R$ 200 MIL",
    filtro: (v) => precoDe(v) <= 200000,
  },
  {
    chave: "200a400",
    rotulo: "R$ 200–400 MIL",
    filtro: (v) => precoDe(v) > 200000 && precoDe(v) <= 400000,
  },
  {
    chave: "acima400",
    rotulo: "ACIMA DE R$ 400 MIL",
    filtro: (v) => precoDe(v) > 400000,
  },
];

function precoDe(v: Veiculo): number {
  return v.preco_promocional > 0 && v.preco_promocional < v.preco_original
    ? v.preco_promocional
    : v.preco_original;
}

export default function VitrineBalcao({
  veiculos,
  nomeLoja,
  whatsappHref,
}: {
  veiculos: Veiculo[];
  nomeLoja: string;
  whatsappHref: string;
}) {
  const [faixa, setFaixa] = useState("todos");
  const [pagina, setPagina] = useState(0);

  const filtrados = useMemo(() => {
    const f = FAIXAS.find((x) => x.chave === faixa) ?? FAIXAS[0];
    return veiculos.filter(f.filtro);
  }, [veiculos, faixa]);

  const inicio = (pagina * POR_PAGINA) % Math.max(filtrados.length, 1);
  const pagina4 = filtrados.slice(inicio, inicio + POR_PAGINA);
  const mostrando = pagina4.length;

  const trocarFaixa = (chave: string) => {
    setFaixa(chave);
    setPagina(0);
  };

  // O botão CHAMAR CONSULTOR abaixava a música do showroom antes de abrir o
  // WhatsApp. O projeto de música foi abortado em 2026-08-11 e removido do
  // repositório; o botão continua fazendo o que importa, que é abrir a
  // conversa.

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-mt-bg font-modernist text-mt-ink">
      {/* ─── Barra superior ─── */}
      <div className="flex h-[76px] flex-none items-center gap-5 bg-mt-inverso-fundo px-7 text-mt-inverso">
        <div className="mr-auto flex items-center gap-2.5">
          <span className="h-[30px] w-2 bg-mt-accent" aria-hidden="true" />
          <span className="text-xl font-extrabold tracking-[.02em]">{nomeLoja}</span>
        </div>
        <span className="text-xs font-semibold tracking-[.16em] text-mt-inverso-suave">
          MODO SHOWROOM
        </span>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-btn mt-btn-primario mt-foco h-14 px-[22px] text-sm"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="h-[17px] w-[17px]"
            aria-hidden="true"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          CHAMAR CONSULTOR
        </a>
      </div>

      {/* ─── Faixas ─── */}
      <div className="flex flex-none items-stretch border-b-2 border-mt-regua">
        <span className="flex flex-none items-center border-r border-mt-regua-media px-5 text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600">
          FILTRAR
        </span>
        {FAIXAS.map((f) => {
          const total = veiculos.filter(f.filtro).length;
          const ativa = f.chave === faixa;
          return (
            <button
              key={f.chave}
              type="button"
              onClick={() => trocarFaixa(f.chave)}
              className={`mt-foco flex h-16 flex-1 cursor-pointer flex-col justify-center gap-[5px] border-r border-mt-regua-media px-[18px] text-left transition-colors ${
                ativa
                  ? "bg-mt-inverso-fundo text-mt-inverso"
                  : "bg-transparent text-mt-ink"
              }`}
            >
              <span className="text-[13px] font-extrabold tracking-[.08em]">
                {f.rotulo}
              </span>
              <span className="text-[11px] opacity-70">{total} veículos</span>
            </button>
          );
        })}
      </div>

      {/* ─── Grade 2×2 ─── */}
      {pagina4.length === 0 ? (
        /* Faixa sem veículo não pode deixar o tablet do balcão em branco na
           frente do cliente. A saída é um caminho de volta, não uma tela
           vazia — e o botão devolve para TODOS, que é onde está o estoque. */
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-10 text-center">
          <div className="mt-rotulo mt-rotulo-accent">NENHUM VEÍCULO NESTA FAIXA</div>
          <p className="m-0 max-w-[480px] text-[17px] leading-relaxed text-mt-neutral-800">
            No momento não há veículos nesta faixa de preço. O estoque completo
            continua a um toque.
          </p>
          <button
            type="button"
            onClick={() => trocarFaixa("todos")}
            className="mt-btn mt-btn-contorno mt-foco h-14 px-6 text-[13px]"
          >
            VER TODO O ESTOQUE
          </button>
        </div>
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2">
        {pagina4.map((v) => {
          const foto = v.web_full_images?.[0] ?? v.whatsapp_images?.[0];
          return (
            <Link
              key={v.id}
              href={getVeiculoPdpUrl(v)}
              className="mt-foco flex min-h-0 border-b border-r border-mt-regua-media no-underline"
            >
              <div className="relative w-[196px] flex-none bg-mt-neutral-300">
                {foto && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={foto}
                    alt={`${v.marca} ${v.modelo}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                {v.status_tag && (
                  <span className="mt-etiqueta pointer-events-none absolute left-0 top-0 text-[9px]">
                    {v.status_tag.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col px-5 py-[18px]">
                <div className="text-[10px] font-semibold tracking-[.16em] text-mt-accent">
                  {v.marca}
                </div>
                <div className="mt-1.5 truncate text-[22px] font-extrabold leading-tight tracking-[-.02em]">
                  {v.modelo}
                </div>
                <div className="mt-1 truncate text-xs text-mt-neutral-700">
                  {v.ano} · {formatarKm(v.quilometragem)}
                </div>
                <div className="mt-auto flex items-end justify-between border-t-2 border-mt-regua pt-2.5">
                  <div className="text-[26px] font-extrabold tracking-[-.03em]">
                    {formatarPreco(precoDe(v))}
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    className="h-[22px] w-[22px] text-mt-accent"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      )}

      {/* ─── Rodapé ─── */}
      <div className="flex h-[72px] flex-none items-center gap-6 bg-mt-inverso-fundo px-7 text-mt-inverso">
        <span className="text-xs font-semibold tracking-[.14em] text-mt-inverso-suave">
          MOSTRANDO {mostrando} DE {filtrados.length}
        </span>
        <div className="ml-auto flex gap-0">
          <button
            type="button"
            onClick={() => setPagina((p) => p + 1)}
            disabled={filtrados.length <= POR_PAGINA}
            className="mt-foco flex h-14 cursor-pointer items-center border-2 border-mt-inverso-regua px-6 text-[13px] font-extrabold tracking-[.1em] disabled:cursor-not-allowed disabled:opacity-45"
          >
            VER MAIS
          </button>
          <Link
            href="/avaliacao"
            className="mt-btn mt-btn-primario mt-foco h-14 px-6 text-[13px]"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <path d="M14 14h7v7h-7z" />
            </svg>
            AVALIAR MEU CARRO
          </Link>
        </div>
      </div>
    </div>
  );
}
