"use client";

import { useEffect, useState } from "react";
import type { Veiculo } from "../types";
import { liberadoEmPreparacao } from "../lib/coerenciaDoCadastro";
import { chegadaAoPatio, dataDaPrevisao, formatarRelogio, relogioAte } from "../lib/emPreparacao";

/**
 * O relógio até o pátio, na ficha do carro "em preparação".
 *
 * Decisão do dono em 28/09/2026: o card conta em dias, a ficha em relógio —
 * a expectativa onde a pessoa já está interessada.
 *
 * O HTML servido traz só a DATA, e os números aparecem depois de montar: o
 * servidor e o navegador discordariam no segundo, e a hidratação reclamaria.
 * O "agora" é lido dentro do temporizador — nunca no corpo do componente
 * (`react-hooks/purity`).
 *
 * `role="timer"` não anuncia sozinho (o `aria-live` implícito é "off"): um
 * leitor de tela falando a cada segundo seria ruído. Quem usa leitor ouve a
 * data, que está em texto.
 */
export default function RelogioDaChegada({
  veiculo,
}: {
  veiculo: Pick<Veiculo, "em_preparacao" | "previsao_chegada_em">;
}) {
  const [agora, setAgora] = useState<number | null>(null);
  // A previsão só existe para o carro liberado; `null` no carro comum.
  const previsao = liberadoEmPreparacao(veiculo) ? (veiculo.previsao_chegada_em as string) : null;

  // O temporizador de 1 s só liga onde há relógio a correr. Até a revisão
  // final (28/09) ele ligava em TODA ficha — a do carro comum inclusive — e
  // seguia batendo depois da data, quando a frase já não muda mais. O "agora"
  // continua lido só dentro do temporizador (`react-hooks/purity`), e o
  // `setAgora` também (`react-hooks/set-state-in-effect`).
  useEffect(() => {
    if (previsao === null) return;
    const chegaEm = Date.parse(previsao);
    const bater = () => {
      const instante = Date.now();
      setAgora(instante);
      // Passada a data, a ficha diz "a qualquer momento" e não muda mais.
      if (instante >= chegaEm) clearInterval(intervalo);
    };
    const primeira = setTimeout(bater, 0);
    const intervalo = setInterval(bater, 1000);
    return () => {
      clearTimeout(primeira);
      clearInterval(intervalo);
    };
  }, [previsao]);

  if (previsao === null) return null;
  // Milissegundos, não `new Date(...)`: nenhum `Date` é construído no corpo do
  // componente (`react-hooks/purity`); as funções de `lib/emPreparacao` aceitam
  // o número.
  const chegada = agora === null ? null : chegadaAoPatio(veiculo, agora);
  const relogio =
    agora !== null && chegada?.fase === "a-caminho" ? relogioAte(chegada.data, agora) : null;

  return (
    <div className="border-l-[3px] border-mt-accent pl-4">
      <div className="text-[11px] font-semibold tracking-[.16em] text-mt-accent">
        EM PREPARAÇÃO
      </div>
      {chegada?.fase === "a-qualquer-momento" ? (
        <div className="mt-1.5 text-[20px] font-extrabold tracking-[-.02em]">
          CHEGA A QUALQUER MOMENTO
        </div>
      ) : relogio ? (
        // O rótulo vem COM o relógio: no HTML servido não há números, e
        // "CHEGA AO PÁTIO EM" sozinho ficaria pendurado sobre o nada.
        <>
          <div className="mt-1.5 text-[11px] font-semibold tracking-[.12em] text-mt-neutral-600">
            CHEGA AO PÁTIO EM
          </div>
          <div
            role="timer"
            className="mt-1 text-[28px] font-extrabold tabular-nums tracking-[-.02em]"
          >
            {formatarRelogio(relogio)}
          </div>
        </>
      ) : null}
      <div className="mt-1.5 text-[12px] text-mt-neutral-700">
        Previsão de chegada ao pátio: {dataDaPrevisao(previsao)}
      </div>
    </div>
  );
}
