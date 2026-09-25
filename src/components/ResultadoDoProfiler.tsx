"use client";

import Link from "next/link";
import { getVeiculoPdpUrl } from "../lib/supabase";
import { precoDoCarro } from "../lib/fichaDoMotor";
import { nomeCurto, type ChaveDeFiltro, type Recomendacao } from "../lib/motorDoMatch";
import { CardVeiculo, Rotulo, Seta } from "./modernist/primitivos";

/**
 * O resultado do Garagem Profiler: "Três do Pátio".
 *
 * Cada cartão diz o que o carro atende do pedido, o que não atende e o que
 * pesa contra — tudo saído de `lib/motorDoMatch.ts`, que só afirma o que o
 * cadastro sustenta. Não há nota: o "53% COMPATÍVEL" do resultado anterior não
 * dizia o que faltava, e quem lê "53%" entende "não me ouviram".
 *
 * Quando o pátio não fecha três, a tela diz isso e oferece saída: afrouxar um
 * filtro (o "e se", que nunca sobe o teto) ou pedir aviso quando chegar.
 */

const MARCA: Record<"atende" | "nao-consta" | "nao-atende", { simbolo: string; classe: string; leitura: string }> = {
  atende: { simbolo: "✓", classe: "text-mt-accent", leitura: "consta" },
  "nao-consta": { simbolo: "?", classe: "text-mt-inverso-suave", leitura: "não consta na ficha" },
  "nao-atende": { simbolo: "✗", classe: "text-mt-inverso-suave line-through decoration-1", leitura: "não atende" },
};

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const EXTENSO = ["Nenhum carro", "Um carro", "Dois carros", "Três carros"];

export default function ResultadoDoProfiler({
  recomendacao,
  falhou,
  escolhidos,
  afrouxados,
  onAlternar,
  onAfrouxar,
  onFalar,
  onAvisar,
  onRefazer,
}: {
  recomendacao: Recomendacao | null;
  /** A consulta ao estoque falhou: a tela oferece o consultor em vez de fingir resultado. */
  falhou: boolean;
  escolhidos: readonly string[];
  afrouxados: readonly ChaveDeFiltro[];
  onAlternar: (id: string) => void;
  onAfrouxar: (filtro: ChaveDeFiltro) => void;
  onFalar: () => void;
  onAvisar: () => void;
  onRefazer: () => void;
}) {
  if (falhou || !recomendacao) {
    return (
      <div className="mt-9 flex flex-1 flex-col lg:mt-11">
        <div className="max-w-[620px] border-2 border-mt-inverso-regua-fina p-6 lg:p-8">
          <p className="m-0 text-lg font-extrabold leading-tight lg:text-[22px]">
            Não conseguimos cruzar suas respostas com o estoque agora.
          </p>
          <p className="m-0 mt-3 text-[13px] leading-relaxed text-mt-inverso-suave">
            O seu perfil não se perde: fale com um consultor e ele faz a busca no pátio por você.
          </p>
        </div>
        <Acoes onFalar={onFalar} onRefazer={onRefazer} quantosEscolhidos={0} quantosCartoes={0} />
      </div>
    );
  }

  const { cartoes, outros, naFaixa, filtros, avisos, eSe, temTeto } = recomendacao;
  // As saídas dependem da FAIXA, e não de quantos cartões a tela mostra: o
  // complemento abaixo do piso pode fechar três cartões com zero carro na
  // faixa, e aí a pessoa ainda precisa do "e se" e do aviso.
  const semNaFaixa = naFaixa === 0;
  const faixaCurta = naFaixa < 3;

  return (
    <div className="mt-9 flex flex-1 flex-col lg:mt-11">
      <div className="border-b-2 border-mt-inverso-regua pb-4">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          TRÊS DO PÁTIO
        </Rotulo>
        <h2 className="mt-titulo m-0 mt-2.5 text-3xl text-mt-inverso lg:text-[46px]">
          {semNaFaixa ? "Não temos exatamente isso hoje." : `${EXTENSO[cartoes.length]} do pátio para você`}
        </h2>
        <p className="m-0 mt-3 text-[13px] leading-relaxed text-mt-inverso-suave">
          {semNaFaixa ? "Nenhum carro passa" : naFaixa === 1 ? "1 carro passa" : `${naFaixa} carros passam`} em
          tudo o que você pediu{filtros.length > 0 ? `: ${filtros.join(" · ")}` : ""}.
          {semNaFaixa && cartoes.length > 0
            ? " Abaixo, os que passam nos seus filtros e custam menos do que a sua faixa."
            : ""}
        </p>
        {afrouxados.length > 0 && (
          <p className="m-0 mt-1.5 text-[12px] text-mt-inverso-suave">
            Você afrouxou um filtro para ver mais opções.
          </p>
        )}
        {avisos.map((aviso) => (
          <p key={aviso} className="m-0 mt-3 border-l-2 border-mt-accent pl-3 text-[13px] leading-relaxed text-mt-inverso">
            {aviso}
          </p>
        ))}
      </div>

      {cartoes.length > 0 && (
        <ol className="m-0 mt-8 grid list-none gap-x-7 gap-y-10 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {cartoes.map((cartao) => {
            const v = cartao.veiculo;
            const escolhido = escolhidos.includes(v.id);
            return (
              <li key={v.id} className="flex flex-col">
                <span className="mb-2.5 text-[10.5px] font-extrabold tracking-[.14em] text-mt-accent">
                  {cartao.rotuloDoLugar}
                </span>
                <div className="text-mt-inverso [&_.border-mt-regua]:border-mt-inverso-regua [&_.border-mt-regua-fina]:border-mt-inverso-regua-fina">
                  <CardVeiculo veiculo={v} href={getVeiculoPdpUrl(v)} />
                </div>

                <p className="m-0 mt-4 text-[15px] font-extrabold leading-snug">{cartao.manchete}</p>

                {cartao.pedidos.length > 0 && (
                  <div className="mt-3">
                    <span className="text-[10.5px] font-extrabold tracking-[.12em] text-mt-inverso-suave">
                      ATENDE {cartao.atende} DE {cartao.pedidos.length} DO QUE VOCÊ PEDIU
                    </span>
                    <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
                      {cartao.pedidos.map((p) => (
                        <li key={p.rotulo} className="flex gap-2 text-[13px] leading-snug">
                          <span aria-hidden="true" className={`w-3 shrink-0 font-extrabold ${MARCA[p.estado].classe}`}>
                            {MARCA[p.estado].simbolo}
                          </span>
                          <span className={p.estado === "atende" ? "text-mt-inverso" : "text-mt-inverso-suave"}>
                            {p.rotulo}
                            <span className="sr-only"> — {MARCA[p.estado].leitura}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {cartao.pesaContra && (
                  <p className="m-0 mt-3 text-[13px] leading-snug text-mt-inverso-suave">
                    <span className="mr-1.5 text-[10.5px] font-extrabold tracking-[.12em] text-mt-inverso">
                      PESA CONTRA
                    </span>
                    {cartao.pesaContra}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => onAlternar(v.id)}
                  aria-pressed={escolhido}
                  className={`mt-foco mt-5 border-2 px-4 py-3 text-left text-[12px] font-extrabold tracking-[.08em] transition-colors lg:mt-auto ${
                    escolhido
                      ? "border-mt-accent bg-[color-mix(in_srgb,var(--mt-accent)_14%,transparent)] text-mt-inverso"
                      : "border-mt-inverso-regua text-mt-inverso hover:border-mt-inverso-suave"
                  }`}
                >
                  {escolhido ? "✓ VOU QUERER VER ESTE" : "QUERO VER ESTE"}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {eSe.length > 0 && (
        <div className="mt-10 max-w-[720px] border-2 border-mt-inverso-regua-fina p-5 lg:p-6">
          <p className="m-0 text-[15px] font-extrabold leading-snug">
            {semNaFaixa ? "Nenhum carro passa em tudo hoje. E se você afrouxar um filtro?" : "Quer ver mais opções? Afrouxe um filtro."}
          </p>
          {temTeto && (
            <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-mt-inverso-suave">
              O teto do seu orçamento continua valendo em todas.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {eSe.map((s) => (
              <button
                key={s.filtro}
                type="button"
                onClick={() => onAfrouxar(s.filtro)}
                className="mt-foco flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-2 border-mt-inverso-regua px-4 py-3 text-left transition-colors hover:border-mt-accent"
              >
                <span className="text-[13px] font-extrabold tracking-[.04em]">
                  {s.rotulo} · +{s.entram} {s.entram === 1 ? "carro" : "carros"} na sua faixa
                </span>
                {s.melhor && (
                  <span className="text-[12px] text-mt-inverso-suave">
                    {s.entram === 1 ? "o" : "entre eles, o"} {s.melhor.nome}, {reais(s.melhor.preco)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {outros.length > 0 && (
        <div className="mt-10">
          <Rotulo className="text-[11px] tracking-[.16em] text-mt-inverso-suave">
            {outros.length === 1 ? "OUTRO QUE TAMBÉM PASSA" : `OUTROS ${outros.length} QUE TAMBÉM PASSAM`}
          </Rotulo>
          <ul className="m-0 mt-3 list-none border-t border-mt-inverso-regua-fina p-0">
            {outros.map((v) => (
              <li key={v.id} className="border-b border-mt-inverso-regua-fina">
                <Link
                  href={getVeiculoPdpUrl(v)}
                  className="mt-foco flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-mt-inverso no-underline hover:text-mt-accent"
                >
                  <span className="text-[13px] font-extrabold">{nomeCurto(v)}</span>
                  <span className="text-[12px] text-mt-inverso-suave">
                    {[`${v.quilometragem.toLocaleString("pt-BR")} km`, v.cambio, reais(precoDoCarro(v))]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {faixaCurta && (
        <div className="mt-10 max-w-[720px]">
          <p className="m-0 text-[13px] leading-relaxed text-mt-inverso-suave">
            O pátio muda toda semana. Deixe o seu pedido com o consultor e ele avisa quando chegar um carro assim.
          </p>
          <button type="button" onClick={onAvisar} className="mt-btn mt-foco mt-4 border-2 border-mt-accent text-mt-inverso">
            ME AVISE QUANDO CHEGAR
          </button>
        </div>
      )}

      <Acoes onFalar={onFalar} onRefazer={onRefazer} quantosEscolhidos={escolhidos.length} quantosCartoes={cartoes.length} />
    </div>
  );
}

function Acoes({
  onFalar,
  onRefazer,
  quantosEscolhidos,
  quantosCartoes,
}: {
  onFalar: () => void;
  onRefazer: () => void;
  quantosEscolhidos: number;
  quantosCartoes: number;
}) {
  let rotulo: string;
  if (quantosEscolhidos > 1) rotulo = `QUERO VER OS ${quantosEscolhidos} ESCOLHIDOS`;
  else if (quantosEscolhidos === 1) rotulo = "QUERO VER O ESCOLHIDO";
  else if (quantosCartoes > 1) rotulo = "QUERO VER ESTES CARROS";
  else if (quantosCartoes === 1) rotulo = "QUERO VER ESTE CARRO";
  else rotulo = "FALAR COM UM CONSULTOR";

  return (
    <div className="sticky bottom-0 z-10 -mx-[18px] mt-10 flex flex-wrap gap-0.5 bg-mt-inverso-fundo px-[18px] pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:static lg:mx-0 lg:mt-12 lg:px-0 lg:pb-0 lg:pt-0">
      <button type="button" onClick={onFalar} className="mt-btn mt-btn-primario mt-foco">
        {rotulo}
        <Seta size={15} />
      </button>
      <button
        type="button"
        onClick={onRefazer}
        className="mt-btn mt-foco border-2 border-mt-inverso-regua text-mt-neutral-300"
      >
        REFAZER CURADORIA
      </button>
    </div>
  );
}
