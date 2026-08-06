"use client";

import { useMemo, useState } from "react";
import { calculateFinancing, SimulationResult } from "../lib/finance-calculator";

export interface SimulacaoData {
  valor_veiculo: number;
  valor_entrada: number;
  percentual_entrada: number;
  tipo_entrada: "dinheiro" | "veiculo_troca" | "sem_entrada";
  parcelas: number;
  valor_parcela: number;
  ocupacao: string;
}

interface CalculadoraProps {
  vehiclePrice: number;
  vehicleYear: number;
  vehicleName: string;
  onSimulateClick: (message: string, simulacaoData?: SimulacaoData) => void;
}

type OcupacaoType = "publico" | "aposentado" | "clt" | "autonomo" | "outros";
type TipoEntradaType = "dinheiro" | "veiculo_troca" | "sem_entrada";

export default function CalculadoraFinanciamento({
  vehiclePrice,
  vehicleYear,
  vehicleName,
  onSimulateClick,
}: CalculadoraProps) {
  const [downPaymentPercent, setDownPaymentPercent] = useState<number>(30);
  const [installments, setInstallments] = useState<number>(48);
  const [occupation, setOccupation] = useState<OcupacaoType>("clt");
  const [tipoEntrada, setTipoEntrada] = useState<TipoEntradaType>("dinheiro");
  // O resultado é derivado dos controles, não estado próprio: nada além dos
  // cinco valores abaixo o determina. Era um `useState` reescrito por um
  // efeito a cada mudança, o que custava um render extra por toque no slider
  // e deixava a primeira pintura sem parcela nenhuma. Mesmo raciocínio que
  // `PDPClientWrapper` já aplica ao veículo exibido.
  const result: SimulationResult = useMemo(
    () =>
      calculateFinancing({
        vehiclePrice,
        vehicleYear,
        downPaymentValue: vehiclePrice * (downPaymentPercent / 100),
        installments,
        occupation,
      }),
    [vehiclePrice, vehicleYear, downPaymentPercent, installments, occupation],
  );

  const handleSimulateAction = () => {
    const downPaymentValue = vehiclePrice * (downPaymentPercent / 100);
    const entradaFormatada = downPaymentValue.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
    const parcelaFormatada = result.parcela_mensal.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
    const entradaTexto = tipoEntrada === "sem_entrada" ? "sem entrada" : (tipoEntrada === "dinheiro" ? "em dinheiro" : "como veículo na troca");
    
    const msg = `Olá! Tenho interesse no ${vehicleName} e gostaria de ver se aprova um financiamento.
Fiz uma simulação no site ${tipoEntrada === "sem_entrada" ? "sem entrada (100% financiado)" : `com R$ ${entradaFormatada} de entrada (${entradaTexto})`} e saldo em ${installments}x de R$ ${parcelaFormatada}. Podem me ajudar?`;

    const simulacaoData: SimulacaoData = {
      valor_veiculo: vehiclePrice,
      valor_entrada: downPaymentValue,
      percentual_entrada: downPaymentPercent,
      tipo_entrada: tipoEntrada,
      parcelas: installments,
      valor_parcela: result.parcela_mensal,
      ocupacao: occupation
    };

    onSimulateClick(msg, simulacaoData);
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const entradaValue = vehiclePrice * (downPaymentPercent / 100);

  // Faixa "Monte sua parcela" da tela 03 do design doc: coluna de título à
  // esquerda, controles em régua à direita. A lógica de taxas não mudou —
  // só a pele saiu do visual antigo de cartões arredondados.
  return (
    <div className="flex flex-col gap-8 border-t-2 border-mt-regua bg-mt-surface px-5 py-8 md:px-10 md:py-12 lg:flex-row lg:gap-14">
      {/* Título + aviso legal */}
      <div className="lg:w-[320px] lg:flex-none">
        <h3 className="mt-rotulo mt-rotulo-accent m-0">SIMULADOR</h3>
        <h2 className="mt-titulo m-0 mt-3 text-[28px] text-mt-ink lg:text-[32px]">
          Monte sua parcela
        </h2>
        <p className="m-0 mt-3 text-[13px] leading-relaxed text-mt-neutral-800">
          Esta simulação usa taxas que podem variar dependendo de análises das
          instituições bancárias referente ao crédito disponível e
          &ldquo;score&rdquo; de cada pessoa. Valores incluem TAC e IOF.
        </p>
      </div>

      <div className="min-w-0 flex-1">
        {/* Perfil e forma de entrada — alimentam a taxa calculada */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="calc-occupation" className="mt-rotulo mb-2 block">
              SEU PERFIL PROFISSIONAL
            </label>
            <select
              id="calc-occupation"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value as OcupacaoType)}
              className="mt-campo-caixa mt-foco cursor-pointer font-semibold"
            >
              <option value="clt">Trabalhador CLT</option>
              <option value="publico">Funcionário Público</option>
              <option value="aposentado">Aposentado / Pensionista</option>
              <option value="autonomo">Profissional Autônomo / PJ</option>
              <option value="outros">Outros</option>
            </select>
          </div>
          <div>
            <label htmlFor="calc-tipo-entrada" className="mt-rotulo mb-2 block">
              FORMA DE ENTRADA
            </label>
            <select
              id="calc-tipo-entrada"
              value={tipoEntrada}
              onChange={(e) => {
                const val = e.target.value as TipoEntradaType;
                setTipoEntrada(val);
                if (val === "sem_entrada") setDownPaymentPercent(0);
              }}
              className="mt-campo-caixa mt-foco cursor-pointer font-semibold"
            >
              <option value="dinheiro">Dinheiro (PIX/Transferência)</option>
              <option value="veiculo_troca">Veículo na Troca</option>
              <option value="sem_entrada">Sem entrada (100% Financiado)</option>
            </select>
          </div>
        </div>

        {/* Entrada · Prazo · Parcela, em três colunas sobre a régua */}
        <div className="mt-7 flex flex-col border-t-2 border-mt-regua md:flex-row">
          <div
            className={`flex-1 border-b border-mt-regua-fina py-4 transition-opacity duration-300 md:border-b-0 md:border-r md:border-mt-regua-media md:py-5 md:pr-6 ${
              tipoEntrada === "sem_entrada" ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <label htmlFor="calc-range-entrada" className="mt-rotulo mb-2.5 block">
              ENTRADA ({downPaymentPercent}%)
            </label>
            <div className="text-[24px] font-extrabold tracking-[-.03em] text-mt-ink">
              {formatCurrency(entradaValue)}
            </div>
            <input
              id="calc-range-entrada"
              type="range"
              min="0"
              max="90"
              step="10"
              value={downPaymentPercent}
              onChange={(e) => setDownPaymentPercent(Number(e.target.value))}
              disabled={tipoEntrada === "sem_entrada"}
              aria-label="Porcentagem de entrada"
              className="mt-foco mt-3.5 h-0.5 w-full cursor-pointer appearance-none bg-mt-regua-media accent-mt-accent"
            />
          </div>

          <div className="flex-1 border-b border-mt-regua-fina py-4 md:border-b-0 md:border-r md:border-mt-regua-media md:px-6 md:py-5">
            <span className="mt-rotulo mb-2.5 block">PRAZO</span>
            <div className="flex w-max border border-mt-regua">
              {[24, 36, 48, 60].map((prazo, i) => (
                <button
                  key={prazo}
                  onClick={() => setInstallments(prazo)}
                  className={`mt-foco cursor-pointer px-3 py-1.5 text-xs font-semibold transition-colors ${
                    i > 0 ? "border-l border-mt-regua" : ""
                  } ${
                    installments === prazo
                      ? "bg-mt-accent text-mt-inverso"
                      : "bg-transparent text-mt-ink hover:bg-mt-neutral-300"
                  }`}
                >
                  {prazo}×
                </button>
              ))}
            </div>
          </div>

          <div className="flex-[1.1] py-4 md:py-5 md:pl-6">
            <span className="mt-rotulo mb-2.5 block">PARCELA ESTIMADA</span>
            <div className="text-[32px] font-extrabold leading-none tracking-[-.04em] text-mt-accent lg:text-[38px]">
              R$ {result.parcela_mensal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-mt-neutral-600">
              {installments}× · CET a partir de {result.taxa_aplicada_mes_pct.toFixed(2)}% a.m. ({result.perfil_calculado})
              <br />
              Sujeito a aprovação de crédito · TAC e IOF inclusos
            </div>
          </div>
        </div>

        <button
          onClick={handleSimulateAction}
          className="mt-btn mt-btn-primario mt-foco mt-6 px-6 py-4 text-xs tracking-[.1em]"
        >
          QUERO MAIS INFO SOBRE FINANCIAMENTO
        </button>
      </div>
    </div>
  );
}
