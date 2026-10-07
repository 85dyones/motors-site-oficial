"use client";

import { useState } from "react";
import type { ParametrosDaCurva } from "../../../lib/avaliacaoRecomendacao";
import type { LeituraDasRecentes } from "../../../lib/consultaDePlaca-servidor";
import type { LeituraDosModelos } from "../../../lib/mercadoPorModelo-servidor";
import ConsultaDePlaca from "./ConsultaDePlaca";
import ConsultaPorModelo from "./ConsultaPorModelo";

/**
 * O invólucro de `/admin/consulta-placa`: o cabeçalho e as duas abas.
 *
 * A ordem é a do trabalho (pedido do dono em 06/10/2026): primeiro o MODELO,
 * que não custa nada e responde "vale olhar este carro?"; depois a PLACA, que
 * é paga e responde "posso comprar ESTE carro?". A aba que abre é a gratuita:
 * ninguém gasta uma consulta por ter entrado na tela.
 *
 * As duas ficam montadas (a escondida leva `hidden`): trocar de aba não apaga
 * o que o avaliador já consultou na outra.
 */

type Aba = "modelo" | "placa";

const ABAS: Array<{ chave: Aba; rotulo: string; descricao: string }> = [
  {
    chave: "modelo",
    rotulo: "POR MODELO · SEM CUSTO",
    descricao:
      "A primeira análise: para onde vai a tabela FIPE deste modelo, quanto ele perde por mês de pátio e a faixa de compra pela curva da loja. Não gasta consulta.",
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
  const [aba, setAba] = useState<Aba>("modelo");
  const atual = ABAS.find((a) => a.chave === aba)!;

  return (
    <div className="mt-consulta mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <span className="mt-rotulo">ESTOQUE</span>
        <h1 className="mt-titulo m-0 text-3xl md:text-4xl">Consulta de placa</h1>
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

      <div hidden={aba !== "modelo"} data-aba="modelo">
        <ConsultaPorModelo curva={curva} recentes={modelos} />
      </div>
      <div hidden={aba !== "placa"} data-aba="placa">
        <ConsultaDePlaca recentes={recentes} curva={curva} temToken={temToken} homologacao={homologacao} />
      </div>
    </div>
  );
}
