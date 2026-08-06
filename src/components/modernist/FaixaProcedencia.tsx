/**
 * Faixa de procedência — tela 03 do design doc.
 *
 * Bloco escuro logo abaixo da galeria e da coluna de decisão. É o argumento de
 * confiança da PDP, e o texto é institucional (vale para todo veículo do
 * estoque), não vem do registro do carro.
 *
 * O texto era fixo aqui até 2026-08-06; hoje vem das settings, editável em
 * `/admin/configuracoes?tab=procedencia`, e chega por prop resolvida no
 * servidor — a faixa é conteúdo indexável, então continua no HTML da primeira
 * resposta em vez de esperar o fetch do cliente. Sem prop, cai no padrão de
 * `lib/procedencia.ts`.
 */

import { PROCEDENCIA_PADRAO } from "../../lib/procedencia";
import type { ItemProcedencia } from "../../types";

interface FaixaProcedenciaProps {
  itens?: ItemProcedencia[];
}

export default function FaixaProcedencia({ itens = PROCEDENCIA_PADRAO }: FaixaProcedenciaProps) {
  const visiveis = itens.filter((item) => item.ativo);
  if (visiveis.length === 0) return null;

  return (
    <section
      aria-label="Procedência"
      className="flex flex-col bg-mt-inverso-fundo text-mt-inverso print:hidden lg:flex-row"
    >
      {visiveis.map((item, i) => (
        <div
          key={item.id}
          className="flex-1 border-b border-mt-inverso-regua-fina px-[18px] py-6 last:border-b-0 lg:border-b-0 lg:border-r lg:px-7 lg:py-[26px] lg:last:border-r-0"
        >
          {/* Numeração derivada da posição, não guardada com o item: bloco
              desligado no painel não pode deixar buraco na sequência. */}
          <div className="mb-2.5 text-[11px] font-extrabold tracking-[.1em] text-mt-accent">
            {String(i + 1).padStart(2, "0")}
          </div>
          <div className="text-[15px] font-extrabold tracking-[-.01em]">{item.titulo}</div>
          <div className="mt-1.5 text-xs leading-snug text-mt-inverso-suave">{item.descricao}</div>
        </div>
      ))}
    </section>
  );
}
