"use client";

import { useState } from "react";
import type { ParametrosDaCurva } from "../../../lib/avaliacaoRecomendacao";
import type { LeituraDasRecentes } from "../../../lib/consultaDePlaca-servidor";
import type { LeituraDosModelos } from "../../../lib/mercadoPorModelo-servidor";
import ConsultaDePlaca from "./ConsultaDePlaca";
import ConsultaPorModelo, { type SelecaoDeModelo } from "./ConsultaPorModelo";

/**
 * O invólucro de `/admin/consulta-veiculos`: o cabeçalho e as três abas.
 *
 * A ordem é a do trabalho (dono, 06 e 08/10/2026), do que não custa ao que
 * custa mais: a FIPE de hoje, grátis ("quanto vale?"); o MODELO, pago por mês
 * de tabela ("para onde ele vai?"); a PLACA, paga por consulta ("posso
 * comprar ESTE carro?"). A aba que abre é a gratuita: ninguém gasta uma
 * consulta por ter entrado na tela.
 *
 * As três ficam montadas (a escondida leva `hidden`): trocar de aba não apaga
 * o que o avaliador já consultou na outra.
 */

type Aba = "fipe" | "modelo" | "placa";

const ABAS: Array<{ chave: Aba; rotulo: string; descricao: string }> = [
  {
    chave: "fipe",
    rotulo: "FIPE · GRÁTIS",
    descricao:
      "A consulta do dia a dia: o valor FIPE de hoje do modelo e dos anos vizinhos, e a faixa de compra pela curva da loja. Não gasta nada.",
  },
  {
    chave: "modelo",
    rotulo: "POR MODELO · PAGA",
    descricao:
      "A análise completa: 24 meses de tabela, para onde ela vai, quanto o carro perde por mês de pátio e o alerta de desvalorização. Os meses que a FIPE gratuita não libera vêm da APIBrasil; o que já foi consultado reabre sem custo.",
  },
  {
    chave: "placa",
    rotulo: "POR PLACA · PAGA",
    descricao:
      "O retrato do carro oferecido à loja: impeditivos, histórico, FIPE e faixa de compra. Cada placa nova é uma consulta paga; a que já foi consultada reabre sem custo.",
  },
];

export default function AbasDaConsulta({
  recentes,
  modelos,
  curva,
  temToken,
  homologacao,
}: {
  recentes: LeituraDasRecentes;
  modelos: LeituraDosModelos;
  curva: ParametrosDaCurva | null;
  temToken: boolean;
  homologacao: boolean;
}) {
  const [aba, setAba] = useState<Aba>("fipe");
  const [paraACompleta, setParaACompleta] = useState<SelecaoDeModelo | null>(null);
  const atual = ABAS.find((a) => a.chave === aba)!;

  return (
    <div className="mt-consulta mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className="mt-rotulo">ESTOQUE</span>
        <h1 className="mt-titulo m-0 text-3xl md:text-4xl">Consulta de veículos</h1>
        <div role="radiogroup" aria-label="Tipo de consulta" className="mt-seg flex-wrap self-start">
          {ABAS.map((a) => (
            <label key={a.chave} className="mt-seg-opt">
              <input type="radio" name="aba-da-consulta" value={a.chave} checked={aba === a.chave} onChange={() => setAba(a.chave)} />
              {a.rotulo}
            </label>
          ))}
        </div>
        <p className="m-0 max-w-3xl text-sm leading-relaxed text-mt-neutral-800" data-descricao-da-aba={aba}>
          {atual.descricao}
        </p>
      </header>

      <div hidden={aba !== "fipe"} data-aba="fipe">
        <ConsultaPorModelo
          modo="pontual"
          curva={curva}
          recentes={modelos}
          aoPedirCompleta={(s) => {
            // Objeto novo a cada clique: a aba paga abre este modelo (e pergunta o custo antes).
            setParaACompleta({ ...s });
            setAba("modelo");
          }}
        />
      </div>
      <div hidden={aba !== "modelo"} data-aba="modelo">
        <ConsultaPorModelo modo="completa" curva={curva} recentes={modelos} pedidoDeFora={paraACompleta} />
      </div>
      <div hidden={aba !== "placa"} data-aba="placa">
        <ConsultaDePlaca recentes={recentes} curva={curva} temToken={temToken} homologacao={homologacao} />
      </div>
    </div>
  );
}
