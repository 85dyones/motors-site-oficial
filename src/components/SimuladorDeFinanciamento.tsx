"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Veiculo } from "../types";
import { useTheme } from "../app/ThemeContext";
import { linkWhatsApp } from "../lib/whatsapp";
import { sufixoRef, trackContactClick } from "../lib/telemetry";
import { precoVigente } from "../lib/regrasEstoque";
import { modeloEVersaoParaExibir } from "../lib/estoqueTabela";
import { financiavel, type ParametrosDoFinanciamento } from "../lib/finance-calculator";

const CalculadoraFinanciamento = dynamic(() => import("./CalculadoraFinanciamento"), {
  ssr: false,
});

/** O ano que a calculadora usa: o primeiro de "2019/2020", como na ficha. */
const anoDoCarro = (v: Veiculo) => parseInt(String(v.ano).split("/")[0] || "2020", 10);

/**
 * O simulador da página `/financiamento`, fora da ficha de um veículo.
 *
 * A calculadora é a mesma da ficha (`CalculadoraFinanciamento` +
 * `lib/finance-calculator.ts`), com as mesmas taxas e o mesmo aviso legal. O
 * que muda é a entrada: na ficha o veículo está dado; aqui quem chega pela
 * busca de "financiamento de carro usado curitiba" ainda não escolheu carro.
 * Daí o seletor.
 *
 * O envio vai direto para o WhatsApp com a simulação inteira na mensagem, em
 * vez de abrir o modal de lead. É de propósito: duplicar a captura — webhook,
 * Turnstile, CAPI, deduplicação de `event_id` — significaria manter dois
 * caminhos de lead que precisam envelhecer juntos. O consultor recebe a
 * simulação completa e o evento sai por `trackContactClick`, como todo CTA de
 * WhatsApp do site.
 *
 * `financing_simulation` já é disparado dentro da calculadora.
 */
export default function SimuladorDeFinanciamento({
  veiculos,
  parametros,
}: {
  veiculos: Veiculo[];
  /** A vigência de `parametros_financiamento`, lida no servidor pela página. */
  parametros: ParametrosDoFinanciamento;
}) {
  const { companySettings } = useTheme();

  // Ordenados por preço para o seletor ficar legível; o padrão é a mediana do
  // estoque, que é onde a conversa de parcela costuma começar de verdade. Só
  // entra o que os bancos parceiros financiam (dono, 28/09/2026): num
  // simulador de parcela, carro sem estimativa seria uma opção que não simula.
  const opcoes = useMemo(
    () =>
      veiculos
        .filter((v) => financiavel(anoDoCarro(v), parametros))
        .sort((a, b) => precoVigente(a) - precoVigente(b)),
    [veiculos, parametros],
  );
  const [idSelecionado, setIdSelecionado] = useState(
    () => opcoes[Math.floor(opcoes.length / 2)]?.id ?? "",
  );

  const veiculo = opcoes.find((v) => v.id === idSelecionado) ?? opcoes[0];
  if (!veiculo) return null;

  const nome = `${veiculo.marca} ${modeloEVersaoParaExibir(veiculo.modelo, veiculo.versao).modelo}`.trim();

  const enviarAoConsultor = (mensagem: string) => {
    const url = linkWhatsApp(companySettings, `${mensagem}${sufixoRef()}`);
    if (!url) return;
    trackContactClick("whatsapp", "Financiamento - Simulação", {
      vehicle_id: veiculo.id,
      vehicle_name: nome,
      vehicle_price: precoVigente(veiculo),
    });
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="border-t-2 border-mt-regua">
      <div className="px-5 pt-8 md:px-10">
        <label
          htmlFor="simulador-veiculo"
          className="text-[11px] font-semibold uppercase tracking-[.14em] text-mt-neutral-600"
        >
          Simular com qual veículo
        </label>
        <select
          id="simulador-veiculo"
          value={veiculo.id}
          onChange={(e) => setIdSelecionado(e.target.value)}
          className="mt-2 w-full max-w-[520px] border border-mt-regua-fina bg-mt-bg p-3.5 text-sm text-mt-ink outline-none focus:border-mt-accent"
        >
          {opcoes.map((v) => (
            <option key={v.id} value={v.id}>
              {`${v.marca} ${modeloEVersaoParaExibir(v.modelo, v.versao).modelo} ${v.ano} — ${precoVigente(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`}
            </option>
          ))}
        </select>
        <p className="m-0 mt-2 max-w-[520px] text-[12px] leading-relaxed text-mt-neutral-600">
          Trocar o veículo recalcula a parcela na hora. A lista mostra os carros disponíveis
          agora que os bancos parceiros financiam: de {parametros.anoMaisAntigo} em diante.
        </p>
      </div>

      <CalculadoraFinanciamento
        vehicleId={veiculo.id}
        vehiclePrice={precoVigente(veiculo)}
        vehicleYear={anoDoCarro(veiculo)}
        vehicleName={nome}
        parametros={parametros}
        onSimulateClick={enviarAoConsultor}
      />
    </section>
  );
}
