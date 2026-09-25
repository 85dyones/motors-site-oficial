"use client";

import { useState } from "react";
import {
  REGRA_TRES_FAIXAS,
  SEM_REGUA,
  estadoPorExtenso,
  lerAvaliacaoDoLead,
  lerValorDaAvaliacao,
  type AvaliacaoDoLead,
} from "../../lib/avaliacaoDoLead";
import { ehRegraDaCurva, type ComponenteDoDesagio } from "../../lib/avaliacaoRecomendacao";

/**
 * O que o cliente preencheu na /avaliacao, dentro do card do lead.
 *
 * Até 24/09/2026 o card de um lead de avaliação mostrava só "Ford Ka 1.0 …
 * 2019": km, estado, FIPE e a faixa de compra sugerida iam só para o n8n, e o
 * consultor perguntava tudo de novo. Agora vêm do próprio lead
 * (`leads.avaliacao`, ver `lib/avaliacaoDoLead.ts`).
 *
 * Recolhido por padrão: o card é pequeno e o kanban tem muitos. O resumo
 * fechado já diz a FIPE e o km, que é o que decide se vale abrir.
 *
 * ---------------------------------------------------------------------------
 * Ofertado e pago — os dois números que a régua ainda não tem
 * ---------------------------------------------------------------------------
 * A faixa sugerida é palpite de uma régua que nunca foi conferida contra o
 * que a loja paga. O consultor registra aqui, depois da vistoria, o que
 * ofereceu e o que foi pago; é com eles que a régua se recalibra. Gravar um
 * valor NÃO reinicia o relógio de estagnação — o gatilho do banco não conta
 * isso como toque no lead —, e o card não finge que reiniciou.
 *
 * ---------------------------------------------------------------------------
 * A conta aparece, e não só o número (2026-09-24)
 * ---------------------------------------------------------------------------
 * Com a curva de `parametros_avaliacao`, a sugestão vem com os componentes —
 * base, km contra o esperado para a idade, avarias, estado excepcional — e o
 * card lista cada um. "O número precisa se explicar" (CLAUDE.md, frontend):
 * sem a conta, o consultor não sabe se discorda da régua ou do que o cliente
 * declarou. Retrato gravado pela régua de 3 faixas não tem componentes, e o
 * card mostra o que ele tem.
 */

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** 55000 → "55.000"; 55000.5 → "55.000,5". É o que `lerValorDaAvaliacao` lê de volta. */
const noCampo = (n: number | null) => (n === null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

const pp = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;

function valorDoComponente(c: ComponenteDoDesagio): string {
  return c.pp_min === c.pp_max ? pp(c.pp_min) : `${pp(c.pp_min)} a ${pp(c.pp_max)}`;
}

/** Por qual régua o número saiu, dito para quem lê o card. */
function nomeDaRegua(a: AvaliacaoDoLead): string {
  if (ehRegraDaCurva(a.regra)) {
    const desde = a.recomendacao?.parametros_desde;
    const data = desde && /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde.split("-").reverse().join("/") : null;
    return data ? `Curva de deságio vigente desde ${data}` : "Curva de deságio";
  }
  if (a.regra === REGRA_TRES_FAIXAS) return "Régua de 3 faixas (06/08)";
  if (a.regra === SEM_REGUA) return "Sem régua legível no envio";
  return `Régua ${a.regra}`;
}

function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type CampoDoValorDaAvaliacao = "avaliacao_valor_ofertado" | "avaliacao_valor_pago";

function CampoDeValor({
  campo,
  rotulo,
  valor,
  nome,
  onSalvar,
}: {
  campo: CampoDoValorDaAvaliacao;
  rotulo: string;
  valor: number | null;
  nome: string;
  onSalvar: (campo: CampoDoValorDaAvaliacao, valor: number | null) => void;
}) {
  const [invalido, setInvalido] = useState(false);
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-[.08em] text-mt-neutral-600">{rotulo}</span>
      <span className="flex items-baseline gap-1 border border-mt-regua-fina bg-mt-bg px-1.5 py-1 focus-within:border-mt-accent">
        <span className="text-[10px] text-mt-neutral-600">R$</span>
        <input
          // A chave refaz o campo quando o valor gravado muda (outro consultor,
          // recarga): `defaultValue` só vale na montagem.
          key={String(valor)}
          type="text"
          inputMode="decimal"
          defaultValue={noCampo(valor)}
          placeholder="—"
          aria-label={`${rotulo} pelo carro de ${nome}`}
          aria-invalid={invalido}
          // Grava ao sair do campo, como a anotação do card.
          onBlur={(e) => {
            const lido = lerValorDaAvaliacao(e.target.value);
            if (!lido.ok) {
              setInvalido(true);
              return;
            }
            setInvalido(false);
            if (lido.valor !== valor) onSalvar(campo, lido.valor);
          }}
          className="mt-foco w-full min-w-0 bg-transparent text-[11px] tabular-nums text-mt-ink outline-none"
        />
      </span>
      {invalido && <span className="text-[10px] text-mt-accent-800">Só o número: 55.000</span>}
    </label>
  );
}

export default function BlocoDaAvaliacao({
  nome,
  avaliacao,
  valorOfertado,
  valorPago,
  onSalvar,
}: {
  nome: string;
  avaliacao: unknown;
  valorOfertado: unknown;
  valorPago: unknown;
  onSalvar: (campo: CampoDoValorDaAvaliacao, valor: number | null) => void;
}) {
  const a = lerAvaliacaoDoLead(avaliacao);
  if (!a) return null;

  const km = a.quilometragem !== null ? `${a.quilometragem.toLocaleString("pt-BR")} km` : null;
  const estado = estadoPorExtenso(a);
  const componentes = a.recomendacao?.componentes ?? [];
  // Na curva, todo sinal é aviso para a vistoria. Na régua de 3 faixas, os
  // sinais repetiam estado e km; só os avisos de km alto eram novidade.
  const alertas = (a.recomendacao?.sinais ?? []).filter((s) =>
    ehRegraDaCurva(a.regra) || componentes.length > 0 ? true : /acima de/i.test(s),
  );

  const linhas: [string, string | null][] = [
    ["Veículo", [`${a.marca} ${a.modelo}`.trim(), a.ano ? String(a.ano) : null].filter(Boolean).join(" · ")],
    ["Estado", estado || null],
    ["Km", km],
    // "no site", e não só "FIPE": a consulta roda no navegador do cliente, e
    // quem chama a rota à mão escolhe o número — a rota só corta o absurdo
    // (`fipeDoCorpo`). É referência a conferir, não dado conferido.
    [
      "FIPE no site",
      a.fipe
        ? [reais(a.fipe.valor), a.fipe.mes_referencia, a.fipe.codigo].filter(Boolean).join(" · ")
        : a.veiculo_digitado
          ? "não consultada — o cliente digitou o carro"
          : "sem valor — a FIPE não respondeu no envio",
    ],
    ["Sugestão", a.recomendacao?.resumo ?? "sem sugestão — não havia régua legível no envio"],
  ];

  return (
    <details className="mt-2 border-t border-mt-regua-fina pt-2">
      <summary className="mt-foco cursor-pointer text-[10px] font-semibold uppercase tracking-[.08em] text-mt-neutral-700 hover:text-mt-accent">
        Avaliação do site
        <span className="font-normal normal-case tracking-normal tabular-nums">
          {" · "}
          {a.fipe ? `FIPE ${reais(a.fipe.valor)}` : "sem FIPE"}
          {km ? ` · ${km}` : ""}
        </span>
      </summary>

      <dl className="m-0 mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] leading-snug">
        {linhas.map(([rotulo, valor]) =>
          valor ? (
            <div key={rotulo} className="contents">
              <dt className="text-mt-neutral-600">{rotulo}</dt>
              <dd className="m-0 text-mt-ink">{valor}</dd>
            </div>
          ) : null,
        )}
      </dl>

      {componentes.length > 0 && (
        <ul className="m-0 mt-1.5 list-none p-0 text-[10px] leading-snug text-mt-neutral-800" aria-label="Conta do deságio">
          {componentes.map((c) => (
            <li key={c.nome} className="flex gap-1.5 border-b border-mt-regua-fina py-0.5 last:border-b-0">
              <span className="w-14 shrink-0 font-semibold tabular-nums text-mt-ink">{valorDoComponente(c)}</span>
              <span>
                <span className="font-semibold">{c.nome}</span>
                {c.motivo ? ` — ${c.motivo}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {alertas.map((alerta) => (
        <p key={alerta} className="m-0 mt-1.5 border-l-2 border-mt-accent pl-2 text-[10px] leading-snug text-mt-neutral-800">
          {alerta}
        </p>
      ))}

      {a.observacoes && (
        <p className="m-0 mt-1.5 border-l-2 border-mt-regua pl-2 text-[11px] leading-snug text-mt-neutral-800">
          “{a.observacoes}”
        </p>
      )}

      <p className="m-0 mt-1.5 text-[10px] leading-snug text-mt-neutral-600">
        {nomeDaRegua(a)}, sobre o que o cliente declarou. Confira a FIPE; o
        número é da vistoria.
      </p>

      <div className="mt-2 flex gap-2">
        <CampoDeValor
          campo="avaliacao_valor_ofertado"
          rotulo="Ofertado"
          valor={numeroOuNulo(valorOfertado)}
          nome={nome}
          onSalvar={onSalvar}
        />
        <CampoDeValor
          campo="avaliacao_valor_pago"
          rotulo="Pago"
          valor={numeroOuNulo(valorPago)}
          nome={nome}
          onSalvar={onSalvar}
        />
      </div>
      <p className="m-0 mt-1 text-[10px] leading-snug text-mt-neutral-600">
        Depois da vistoria. O pago é o que calibra a régua.
      </p>
    </details>
  );
}
