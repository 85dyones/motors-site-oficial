"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Veiculo } from "../../types";

/**
 * Busca em régua — a barra que fica sob o hero.
 *
 * O sistema não usa caixa de input: cada campo é uma célula da grade, com
 * rótulo em versalete em cima e a régua de 1px separando das vizinhas.
 * Submeter leva ao catálogo com os filtros na query string; nada é escondido
 * aqui, só ordenado lá.
 */

const FAIXAS: { rotulo: string; max?: number }[] = [
  { rotulo: "Qualquer valor" },
  { rotulo: "Até R$ 150 mil", max: 150000 },
  { rotulo: "Até R$ 300 mil", max: 300000 },
  { rotulo: "Até R$ 500 mil", max: 500000 },
  { rotulo: "Até R$ 800 mil", max: 800000 },
];

export default function BuscaRegua({
  estoque,
  compacto = false,
}: {
  estoque: Veiculo[];
  /** Versão de 3 campos usada no mobile */
  compacto?: boolean;
}) {
  const router = useRouter();
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ano, setAno] = useState("");
  const [cambio, setCambio] = useState("");
  const [faixa, setFaixa] = useState("");

  const marcas = useMemo(
    () => [...new Set(estoque.map((v) => v.marca).filter(Boolean))].sort(),
    [estoque],
  );
  const modelos = useMemo(
    () =>
      [
        ...new Set(
          estoque
            .filter((v) => !marca || v.marca === marca)
            .map((v) => v.modelo)
            .filter(Boolean),
        ),
      ].sort(),
    [estoque, marca],
  );
  const anos = useMemo(
    () =>
      [...new Set(estoque.map((v) => v.ano).filter(Boolean))].sort((a, b) => b - a),
    [estoque],
  );
  const cambios = useMemo(
    () => [...new Set(estoque.map((v) => v.cambio).filter(Boolean))].sort(),
    [estoque],
  );

  const buscar = () => {
    const params = new URLSearchParams();
    if (marca) params.set("marca", marca);
    if (modelo) params.set("modelo", modelo);
    if (ano) params.set("ano", ano);
    if (cambio) params.set("cambio", cambio);
    if (faixa) params.set("precoMax", faixa);
    router.push(`/estoque${params.toString() ? `?${params}` : ""}`);
  };

  /**
   * `soDesktop` esconde o campo abaixo de 1280px em vez de removê-lo da
   * árvore. A tela 09 do design doc pede três campos na faixa do tablet e
   * cinco no desktop; alternar isso por JavaScript exigiria medir a janela no
   * cliente, o que dá divergência de hidratação e um piscar de campos na
   * primeira pintura. Escondido por CSS, o valor do campo continua no estado
   * e volta intacto quando a janela cresce.
   */
  const campos = compacto
    ? [
        { label: "MARCA", value: marca, set: setMarca, opcoes: marcas },
        { label: "MODELO", value: modelo, set: setModelo, opcoes: modelos },
        {
          label: "FAIXA DE PREÇO",
          value: faixa,
          set: setFaixa,
          opcoes: FAIXAS.filter((f) => f.max).map((f) => String(f.max)),
          rotulos: FAIXAS.filter((f) => f.max).map((f) => f.rotulo),
        },
      ]
    : [
        { label: "MARCA", value: marca, set: setMarca, opcoes: marcas },
        { label: "MODELO", value: modelo, set: setModelo, opcoes: modelos },
        {
          label: "ANO",
          value: ano,
          set: setAno,
          opcoes: anos.map(String),
          soDesktop: true,
        },
        {
          label: "CÂMBIO",
          value: cambio,
          set: setCambio,
          opcoes: cambios,
          soDesktop: true,
        },
        {
          label: "FAIXA DE PREÇO",
          value: faixa,
          set: setFaixa,
          opcoes: FAIXAS.filter((f) => f.max).map((f) => String(f.max)),
          rotulos: FAIXAS.filter((f) => f.max).map((f) => f.rotulo),
        },
      ];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        buscar();
      }}
      className="flex flex-col border-b-2 border-mt-regua bg-mt-bg md:flex-row md:items-stretch"
      role="search"
      aria-label="Buscar no estoque"
    >
      {campos.map((campo) => (
        <div
          key={campo.label}
          className={`flex-1 border-b border-mt-regua-fina px-[18px] py-4 last:border-b-0 md:border-b-0 md:border-r md:border-mt-regua-media md:px-4 lg:px-5 ${
            "soDesktop" in campo && campo.soDesktop ? "hidden desktop:block" : ""
          }`}
        >
          <label
            htmlFor={`busca-${campo.label}`}
            className="mb-2 block text-[10px] font-semibold tracking-[.14em] text-mt-neutral-600"
          >
            {campo.label}
          </label>
          <div className="relative flex items-center justify-between gap-2">
            <select
              id={`busca-${campo.label}`}
              value={campo.value}
              onChange={(e) => campo.set(e.target.value)}
              className="mt-campo mt-foco w-full appearance-none pr-6"
            >
              <option value="">Todos</option>
              {campo.opcoes.map((opcao, i) => (
                <option key={opcao} value={opcao}>
                  {"rotulos" in campo && campo.rotulos ? campo.rotulos[i] : opcao}
                </option>
              ))}
            </select>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-mt-accent"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      ))}

      <button
        type="submit"
        className="mt-btn mt-btn-primario mt-foco justify-center px-6 py-4 text-sm md:py-0 lg:px-8"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          className="h-[17px] w-[17px]"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4.3-4.3" />
        </svg>
        BUSCAR
      </button>
    </form>
  );
}
