"use client";

import Link from "next/link";
import { getVeiculoPdpUrl } from "../lib/supabase";
import { precoDoCarro } from "../lib/fichaDoMotor";
import {
  nomeCurto,
  parcelaDoPedido,
  type ChaveDeFiltro,
  type Coringa,
  type ParcelaDoCartao,
  type ParcelaPedida,
  type Recomendacao,
} from "../lib/motorDoMatch";
import { avisoDeCredito, textoDaParcela, textoSemEstimativa } from "../lib/textoDaParcela";
import { PARAMETROS_DE_FABRICA } from "../lib/finance-calculator";
import type { Veiculo } from "../types";
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
 *
 * Desde a fase 2, depois dos três vem a carta "Já pensou neste?": um carro que
 * a pessoa não pediu e que vence o primeiro em pelo menos dois fatos. É a
 * porta de descoberta dentro do resultado, e por isso o custo vem escrito
 * (O QUE MUDA) — surpresa sem o custo vira empurrão.
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
  coringaRecusado = false,
  onRecusarCoringa,
  troca = false,
  prazo = "",
  opcoesDePrazo = [],
  onPrazo,
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
  /** A pessoa disse "NÃO É PRA MIM" à carta: ela some até refazer. */
  coringaRecusado?: boolean;
  onRecusarCoringa?: (id: string) => void;
  /** POR MÊS com "tenho carro para dar na troca": a tela oferece a avaliação. */
  troca?: boolean;
  /** O prazo, perguntado aqui desde a fase 2 — opcional, não muda os carros. */
  prazo?: string;
  opcoesDePrazo?: readonly { id: string; titulo: string }[];
  onPrazo?: (id: string) => void;
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
        {/* O pedido de ajuda também vai ao consultor: o prazo serve a ele aqui. */}
        {onPrazo && <EscolhaDoPrazo prazo={prazo} opcoes={opcoesDePrazo} onPrazo={onPrazo} />}
        <Acoes onFalar={onFalar} onRefazer={onRefazer} quantosEscolhidos={0} quantosCartoes={0} />
      </div>
    );
  }

  const { cartoes, outros, naFaixa, filtros, avisos, eSe, temTeto } = recomendacao;
  // `?? null`: resposta de antes do POR MÊS não traz o campo.
  // A vigência vem da rota junto com o pedido. `?? de fábrica` só cobre uma
  // resposta de antes deste campo existir (aba aberta num deploy, rollback):
  // sem ele, o cabeçalho e a lista "outros" quebravam a tela inteira.
  const parcelaPedida: ParcelaPedida | null = recomendacao.parcelaPedida
    ? { ...recomendacao.parcelaPedida, parametros: recomendacao.parcelaPedida.parametros ?? PARAMETROS_DE_FABRICA }
    : null;
  // `?? null`: uma aba aberta antes do deploy recebe a resposta nova, mas o
  // contrário também acontece por um instante — resposta sem o campo.
  const coringa = coringaRecusado ? null : (recomendacao.coringa ?? null);
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
            ? parcelaPedida
              ? " Abaixo, os que passam nos seus filtros e têm parcela menor do que a sua faixa."
              : " Abaixo, os que passam nos seus filtros e custam menos do que a sua faixa."
            : ""}
        </p>
        {afrouxados.length > 0 && (
          <p className="m-0 mt-1.5 text-[12px] text-mt-inverso-suave">
            Você afrouxou um filtro para ver mais opções.
          </p>
        )}
        {parcelaPedida && (
          <p className="m-0 mt-3 text-[12px] leading-relaxed text-mt-inverso-suave">
            {/* A fonte e os bancos são os da vigência que fez a conta — a mesma
                que veio da rota junto com o pedido. */}
            Parcelas estimadas pela {parcelaPedida.parametros.fonteDasTaxas}, com IOF e a entrada que você
            informou. {avisoDeCredito(parcelaPedida.parametros.bancosParceiros)}
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
                {cartao.parcela && <LinhaDaParcela parcela={cartao.parcela} />}

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

      {coringa && (
        <CartaJaPensouNeste
          coringa={coringa}
          escolhido={escolhidos.includes(coringa.veiculo.id)}
          onAlternar={() => onAlternar(coringa.veiculo.id)}
          onRecusar={() => onRecusarCoringa?.(coringa.veiculo.id)}
        />
      )}

      {eSe.length > 0 && (
        <div className="mt-10 max-w-[720px] border-2 border-mt-inverso-regua-fina p-5 lg:p-6">
          <p className="m-0 text-[15px] font-extrabold leading-snug">
            {semNaFaixa ? "Nenhum carro passa em tudo hoje. E se você afrouxar um filtro?" : "Quer ver mais opções? Afrouxe um filtro."}
          </p>
          {(temTeto || parcelaPedida) && (
            <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-mt-inverso-suave">
              {parcelaPedida
                ? "A parcela que você disse continua valendo em todas."
                : "O teto do seu orçamento continua valendo em todas."}
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
                    {[
                      `${v.quilometragem.toLocaleString("pt-BR")} km`,
                      v.cambio,
                      reais(precoDoCarro(v)),
                      // A parcela nunca vai sozinha: CET e total a prazo junto.
                      parcelaPedida ? compactoDaParcela(v, parcelaPedida) : null,
                    ]
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

      {troca && (
        <div className="mt-10 max-w-[720px] border-l-2 border-mt-accent pl-4">
          <p className="m-0 text-[15px] font-extrabold leading-snug">Quanto o seu carro cobre?</p>
          <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-mt-inverso-suave">
            A entrada acima é a sua estimativa. Avalie o carro com a gente e o consultor ajusta as parcelas com o
            valor de verdade.
          </p>
          <Link
            href="/avaliacao"
            target="_blank"
            rel="noopener"
            className="mt-btn mt-foco mt-3 inline-flex border-2 border-mt-accent text-mt-inverso no-underline"
          >
            AVALIAR MEU CARRO
            <Seta size={15} />
          </Link>
        </div>
      )}

      {onPrazo && <EscolhaDoPrazo prazo={prazo} opcoes={opcoesDePrazo} onPrazo={onPrazo} />}

      <Acoes onFalar={onFalar} onRefazer={onRefazer} quantosEscolhidos={escolhidos.length} quantosCartoes={cartoes.length} />
    </div>
  );
}

/** O prazo, opcional. Não muda os carros — e a tela diz isso. */
function EscolhaDoPrazo({
  prazo,
  opcoes,
  onPrazo,
}: {
  prazo: string;
  opcoes: readonly { id: string; titulo: string }[];
  onPrazo: (id: string) => void;
}) {
  if (opcoes.length === 0) return null;
  return (
    <div className="mt-10 max-w-[720px]">
      <span className="text-[10.5px] font-extrabold tracking-[.12em] text-mt-inverso-suave">
        QUANDO VOCÊ PRETENDE FECHAR? · OPCIONAL
      </span>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPrazo(o.id)}
            aria-pressed={prazo === o.id}
            className={`mt-foco border-2 px-3.5 py-2 text-[12px] font-extrabold tracking-[.02em] transition-colors ${
              prazo === o.id
                ? "border-mt-accent bg-[color-mix(in_srgb,var(--mt-accent)_14%,transparent)] text-mt-inverso"
                : "border-mt-inverso-regua text-mt-inverso-suave hover:text-mt-inverso"
            }`}
          >
            {o.titulo}
          </button>
        ))}
      </div>
      <p className="m-0 mt-2 text-[12px] leading-relaxed text-mt-inverso-suave">
        Ajuda o consultor a se organizar. Não muda os carros.
      </p>
    </div>
  );
}

/**
 * "Já pensou neste?" — a carta de descoberta.
 *
 * Sempre com as duas colunas: o que ganha contra o 1º cartão e O QUE MUDA.
 * Quando o cadastro não mostra nada contra, a tela diz isso em vez de omitir
 * o bloco — a ausência de custo também é informação, e esconder o bloco
 * pareceria esconder o custo.
 */
function CartaJaPensouNeste({
  coringa,
  escolhido,
  onAlternar,
  onRecusar,
}: {
  coringa: Coringa;
  escolhido: boolean;
  onAlternar: () => void;
  onRecusar: () => void;
}) {
  const v = coringa.veiculo;
  return (
    <section
      aria-label="Já pensou neste?"
      className="mt-12 border-2 border-mt-inverso-regua p-5 lg:grid lg:grid-cols-[minmax(0,300px)_1fr] lg:gap-8 lg:p-7"
    >
      <div>
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          JÁ PENSOU NESTE?
        </Rotulo>
        {/* "Cabe no que você pediu" só quando cabe na faixa: quase sempre a
            carta custa menos que o piso, e a frase antiga afirmava o contrário. */}
        <p className="m-0 mt-2 text-[13px] leading-relaxed text-mt-inverso-suave">
          Você não pediu, mas ele passa nos seus filtros
          {coringa.abaixoDaFaixa
            ? coringa.parcela
              ? ", tem parcela menor que a sua faixa"
              : ", custa menos que a sua faixa"
            : ""}{" "}
          e ganha do {coringa.comparadoCom} em{" "}
          {coringa.vantagens.length === 2 ? "dois pontos" : `${coringa.vantagens.length} pontos`}.
        </p>
        <div className="mt-4 text-mt-inverso [&_.border-mt-regua]:border-mt-inverso-regua [&_.border-mt-regua-fina]:border-mt-inverso-regua-fina">
          <CardVeiculo veiculo={v} href={getVeiculoPdpUrl(v)} />
        </div>
        {coringa.parcela && <LinhaDaParcela parcela={coringa.parcela} />}
      </div>

      <div className="mt-6 flex flex-col lg:mt-0">
        <span className="text-[10.5px] font-extrabold tracking-[.12em] text-mt-inverso-suave">
          CONTRA O {coringa.comparadoCom.toUpperCase()}
        </span>
        <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
          {coringa.vantagens.map((vantagem) => (
            <li key={vantagem} className="flex gap-2 text-[13px] leading-snug">
              <span aria-hidden="true" className="w-3 shrink-0 font-extrabold text-mt-accent">
                +
              </span>
              <span className="text-mt-inverso">{vantagem}</span>
            </li>
          ))}
        </ul>

        <span className="mt-5 text-[10.5px] font-extrabold tracking-[.12em] text-mt-inverso">O QUE MUDA</span>
        {coringa.oQueMuda.length > 0 ? (
          <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
            {coringa.oQueMuda.map((muda) => (
              <li key={muda} className="flex gap-2 text-[13px] leading-snug">
                <span aria-hidden="true" className="w-3 shrink-0 font-extrabold text-mt-inverso-suave">
                  −
                </span>
                <span className="text-mt-inverso-suave">{muda}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-1.5 text-[13px] leading-snug text-mt-inverso-suave">
            No que o cadastro diz, nada contra. Confira a ficha com o consultor.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2 lg:mt-auto lg:pt-6">
          <button
            type="button"
            onClick={onAlternar}
            aria-pressed={escolhido}
            className={`mt-foco border-2 px-4 py-3 text-left text-[12px] font-extrabold tracking-[.08em] transition-colors ${
              escolhido
                ? "border-mt-accent bg-[color-mix(in_srgb,var(--mt-accent)_14%,transparent)] text-mt-inverso"
                : "border-mt-inverso-regua text-mt-inverso hover:border-mt-inverso-suave"
            }`}
          >
            {escolhido ? "✓ VOU QUERER VER ESTE" : "FAZ SENTIDO, QUERO VER"}
          </button>
          <button
            type="button"
            onClick={onRecusar}
            className="mt-foco border-2 border-transparent px-4 py-3 text-[12px] font-extrabold tracking-[.08em] text-mt-inverso-suave transition-colors hover:text-mt-inverso"
          >
            NÃO É PRA MIM
          </button>
        </div>
      </div>
    </section>
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

/**
 * A parcela de um carro da lista "outros", numa linha. Carro que os bancos
 * parceiros não financiam não passa no POR MÊS — o `null` aqui é defesa, e
 * diz o porquê em vez de sumir com a parcela.
 */
function compactoDaParcela(v: Veiculo, pedido: ParcelaPedida): string {
  const p = parcelaDoPedido(v, pedido);
  return p ? textoDaParcela(p).compacto : textoSemEstimativa(pedido.parametros.anoMaisAntigo);
}

/**
 * A parcela estimada de um carro com o resto da oferta: CET, total das
 * parcelas, total a prazo e preço à vista — o texto sai de
 * `lib/textoDaParcela`, o mesmo da ficha e da lista "outros".
 */
function LinhaDaParcela({ parcela }: { parcela: ParcelaDoCartao }) {
  const t = textoDaParcela(parcela);
  return (
    <div className="mt-3">
      <p className="m-0 text-[17px] font-extrabold tracking-[-.02em] text-mt-inverso">{t.parcela}</p>
      <p className="m-0 mt-1 text-[11px] leading-relaxed text-mt-inverso-suave">{t.detalhe}</p>
      {t.cautela && <p className="m-0 mt-1 text-[11px] leading-relaxed text-mt-inverso-suave">{t.cautela}</p>}
    </div>
  );
}
