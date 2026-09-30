"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import { EstatisticasRegua, formatarKm, formatarPreco } from "./primitivos";
import NumeroQueConta from "./NumeroQueConta";
import { modeloEVersaoParaExibir } from "../../lib/estoqueTabela";

/**
 * Hero editorial da home.
 *
 * Fotos em crossfade e um título fixo. O texto não troca com o slide — só a
 * foto e a placa do veículo em destaque, para o hero não piscar conteúdo
 * (mesma regra que o painel documenta em "Áreas do site"). Do `lg` para cima
 * a foto é o fundo e o título fica sobre ela; abaixo, a foto vem numa faixa
 * própria, em cima do texto (29/09).
 */

const INTERVALO_MS = 5200;

export default function HeroHome({
  slides,
  totalEstoque,
  totalMarcas,
}: {
  slides: Veiculo[];
  totalEstoque: number;
  /** Marcas distintas no estoque disponível — ver `lib/estatisticasEstoque`. */
  totalMarcas: number;
}) {
  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || pausado) return;
    const t = setInterval(
      () => setAtual((i) => (i + 1) % slides.length),
      INTERVALO_MS,
    );
    return () => clearInterval(t);
  }, [slides.length, pausado]);

  // Respeita quem pediu menos movimento: sem autoplay, só os indicadores.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setPausado(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  const destaque = slides[atual];

  // Título curto + versão na linha de baixo (o feed embute uma na outra).
  const { modelo: modeloDestaque, versao: versaoDestaque } = modeloEVersaoParaExibir(
    destaque?.modelo ?? "",
    destaque?.versao ?? "",
  );

  const preco = destaque
    ? destaque.preco_promocional > 0 && destaque.preco_promocional < destaque.preco_original
      ? destaque.preco_promocional
      : destaque.preco_original
    : 0;

  return (
    /* A altura acompanha a largura, e isso é o ponto.
     *
     * O design doc desenha o hero com 620px num canvas de 1440 — proporção
     * 2,32:1. Copiar o valor em pixel funcionava em 1440 e quebrava acima
     * disso: em 1920 a mesma caixa vira 3,1:1, o `object-cover` come o topo
     * e a base da foto e o carro perde a roda. A própria tela 09 do doc já
     * mostra o hero em 724px num canvas de 1280, ou seja, ele nunca foi um
     * número fixo.
     *
     * 43vw reproduz o desenho em 1440 (619px), cresce até 860px e para —
     * acima disso a foto viraria pôster e o conteúdo abaixo sumiria.
     *
     * É `min-h`, não `h`: com altura travada o conteúdo transbordava para
     * fora da foto assim que a janela estreitava, porque 43vw encolhe junto
     * com a largura e o bloco editorial não. Como piso, a proporção manda
     * enquanto couber e o conteúdo manda quando não couber.
     *
     * ─── `--hero-cabe`: a caixa do destaque não pode cair fora da tela ───
     *
     * O `min-h` acima nunca governou no desktop. A tipografia `lg:` é fixa em
     * px (h1 de 112px, padding de 76px, régua, rodapé) e somava 758px — 170px
     * a mais que os 587px que os 43vw pedem em 1365 de largura. Numa janela de
     * 610px de área útil sobravam 542px abaixo do header de 68px, e a placa
     * "EM DESTAQUE", que fecha a coluna, começava 83px fora da tela.
     *
     * Só as partes fixas do hero (sem contar o h1) já somavam 559px: não havia
     * ajuste pontual que fizesse essa composição caber. Então o ritmo vertical
     * inteiro passou a ser `min(valor-do-design, fração de --hero-cabe)`.
     *
     * `--hero-cabe` é a altura útil abaixo do header (68px em `lg:`+, que é
     * onde o hero desktop vive), limitada a 840px. As frações são o valor de
     * design dividido por 840 — logo, sempre que houver 840px de tela o `min()`
     * escolhe o valor de design e o hero fica idêntico ao de hoje. Ele só
     * encolhe quando encolher é a única forma de a placa aparecer inteira.
     *
     * Por que 840 e não 758 (a altura real de hoje): pedaços do hero não
     * escalam — os rótulos de 10px, o texto da versão — e somam ~88px fixos.
     * Com 840 de referência a conta fecha com folga até ~450px de altura útil.
     * As duas primeiras vars alimentam a EstatisticasRegua, cujos tamanhos
     * moram no primitivo e por isso chegam lá por herança de CSS. */
    <section
      className="relative flex flex-col bg-mt-inverso-fundo lg:min-h-[min(43vw,var(--hero-cabe))]"
      style={
        {
          "--hero-cabe": "min(840px, calc(100svh - 68px))",
          "--regua-pt": "min(16px, calc(var(--hero-cabe) * 0.019))",
          "--regua-valor": "min(34px, calc(var(--hero-cabe) * 0.0405))",
        } as CSSProperties
      }
    >
      {/* A foto no celular: faixa própria, na proporção da foto (3:2), em
          cima do texto — e não fundo de tela inteira atrás dele.

          Até 29/09 a foto cobria o hero todo em qualquer largura. No celular
          o hero tem ~390 × 530 px (retrato) e a foto é paisagem: o
          `object-cover` mostrava um terço da largura e o carro saía cortado
          ao meio, ainda coberto pelo título e pelo degradê. Em 3:2 a foto
          entra inteira. Do `lg` para cima volta a ser o fundo, como antes. */}
      {slides.some((v) => v.web_full_images?.[0] ?? v.whatsapp_images?.[0]) && (
      <div className="relative aspect-[16/9] w-full overflow-hidden sm:aspect-[21/9] lg:absolute lg:inset-0 lg:aspect-auto">
      {slides.map((v, i) => {
        const foto = v.web_full_images?.[0] ?? v.whatsapp_images?.[0];
        if (!foto) return null;
        return (
          <div
            key={v.id}
            aria-hidden={i !== atual}
            className="absolute inset-0 transition-opacity duration-[900ms] ease-out"
            style={{ opacity: i === atual ? 1 : 0 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={foto}
              alt={i === atual ? `${v.marca} ${v.modelo} em destaque` : ""}
              loading={i === 0 ? "eager" : "lazy"}
              /* O recorte olha para baixo do centro, não para o centro.
               *
               * Foto de carro tem o veículo na metade inferior do quadro e
               * céu, parede ou teto na superior. Com `object-position` no
               * padrão (50% 50%) a faixa do hero come as rodas e mantém o
               * que não interessa; puxando para 62% o carro entra inteiro e
               * o que se perde é o topo do fundo. */
              className="h-full w-full object-cover object-[50%_62%]"
            />
          </div>
        );
      })}
        {/* No celular, só a borda de baixo da foto funde com o fundo do
            texto: o carro fica limpo, sem véu por cima. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-[linear-gradient(180deg,rgba(32,30,29,0),var(--mt-inverso-fundo))] lg:hidden"
        />
      </div>
      )}

      {/* O véu grafite da esquerda, só onde o texto fica SOBRE a foto (lg+).
          É ele que garante a leitura do título com carro branco ou preto. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(32,30,29,.92)_0%,rgba(32,30,29,.55)_46%,rgba(32,30,29,0)_78%)] lg:block"
      />

      {/* Conteúdo do hero.
       *
       * Em fluxo, não em posicionamento absoluto. O bloco editorial ficava
       * ancorado no topo e os indicadores no rodapé, cada um com sua própria
       * âncora: quando a altura do hero encolhia (ela é 43vw, então encolhe
       * junto com a largura), a régua de estatísticas descia por cima do
       * "01 02 03". Uma coluna flex com `mt-auto` no rodapé mantém a mesma
       * composição e torna a colisão impossível. */}
      <div className="relative z-10 flex flex-1 flex-col px-[18px] pb-6 pt-3 sm:pt-4 lg:px-10 lg:pb-[min(40px,calc(var(--hero-cabe)*0.0476))] lg:pt-[min(76px,calc(var(--hero-cabe)*0.0905))]">
      <div className="pointer-events-none max-w-[700px]">
        {/* O `<h1>` da home diz o que a loja vende e onde — 2026-09-08.
         *
         * Ele era só "FORA DA CURVA": frase de campanha, sem substantivo e sem
         * praça. O `<title>` já trazia as duas coisas desde 25/08, mas o `<h1>`
         * da página de maior autoridade do site não afirmava nada sobre
         * seminovos em Curitiba.
         *
         * A sobrelinha que ficava logo acima virou a primeira linha DESTE
         * título, com o texto trocado pela consulta-alvo. O desenho não muda de
         * lugar; a semântica muda. As classes são as mesmas que ela tinha, mais
         * `leading-[1.5]`: é o que reproduz a entrelinha herdada do `body`,
         * porque aqui dentro ela passaria a ser a 0.92 do `.mt-display`.
         *
         * O texto entra em caixa BAIXA e sobe por CSS: o desenho fica idêntico
         * e quem lê o texto extraído recebe uma frase, não um grito.
         *
         * Nada aqui pode ser `sr-only`/`hidden`: texto escondido dentro do
         * `<h1>` perde o peso do texto visível e ganha o risco do texto oculto.
         * `tests/h1-da-home-com-praca.test.ts` trava as duas pontas, e trava
         * também que o `<h1>` continue sendo UM só.
         *
         * "3 DE CADA 10 ENTRAM" saiu daqui (do `<h1>`) em 08/09. A frase
         * voltou à capa em 29/09 no parágrafo logo abaixo, no lugar de
         * "Curadoria, não vitrine." (decisão D4 do dono). */}
        <h1 className="mt-display m-0 text-[44px] text-mt-inverso sm:text-[52px] lg:text-[length:clamp(52px,calc(var(--hero-cabe)*0.1333),112px)] lg:leading-[.88]">
          <span className="mb-3 flex items-center gap-3 leading-[1.5] sm:mb-6 lg:mb-[min(26px,calc(var(--hero-cabe)*0.031))]">
            <span className="h-0.5 w-5 bg-mt-cobre-marca lg:w-7" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-mt-cobre-marca sm:tracking-[.2em]">
              Seminovos selecionados em Curitiba
            </span>
          </span>
          {/* Os dois `{" "}` deste `<h1>` são texto de verdade, e não
              enfeite (2026-09-21). Sem eles o JSX não deixa nó de texto entre
              as peças, e o `textContent` — o que boa parte dos rastreadores lê
              — saía "…em CuritibaFORADA CURVA": duas junções, uma entre os
              spans e outra no `<br>`. Nenhum dos dois pinta pixel: o espaço
              entre duas caixas de bloco não rende, e o do `<br>` cai no fim da
              linha quebrada. `sr-only` aqui seria pior — ver o teste. */}
          {" "}
          <span className="block">
            FORA{" "}
            <br />
            DA CURVA
          </span>
        </h1>

        <p className="m-0 mt-2.5 max-w-[460px] sm:mt-3.5 text-[13px] leading-relaxed text-mt-neutral-300 lg:mt-[min(28px,calc(var(--hero-cabe)*0.0333))] lg:text-[length:clamp(13px,calc(var(--hero-cabe)*0.0202),17px)]">
          {totalEstoque} veículos em estoque com procedência auditada, laudo
          cautelar e garantia. Três em cada dez avaliados entram.
        </p>

        {/* Régua de indicadores: os três números precisam sair do estoque
            real. O do meio era "12 ANOS" de casa — default fixo no
            componente, sem fonte nenhuma. Trocado em 2026-08-06 por marcas
            distintas, que se conta do mesmo estoque que já está em memória. */}
        <EstatisticasRegua
          inverso
          desenhar
          className="mt-[min(32px,calc(var(--hero-cabe)*0.0381))] hidden w-[460px] lg:flex"
          itens={[
            { valor: <NumeroQueConta valor={totalEstoque} />, rotulo: "EM ESTOQUE" },
            { valor: <NumeroQueConta valor={totalMarcas} />, rotulo: "MARCAS" },
            // "100% LAUDO CAUTELAR" era lido como "100% aprovado", e no feed
            // de 2026-08-06 só 35 dos 88 estavam aprovados — 53 seguiam em
            // análise. O compromisso real da loja, confirmado pelo dono, é de
            // processo: todo carro é enviado para a perícia. O rótulo agora
            // diz isso, e não o resultado.
            // O 100% fica parado: contando, ele passava por "37%", num
            // rótulo que já foi mal lido antes (ver acima).
            { valor: "100%", rotulo: "PASSAM PELA CAUTELAR", accent: true },
          ]}
        />
      </div>

      {/* Rodapé do hero: indicadores à esquerda, placa do destaque à direita.
          No mobile a linha não cabe (4 indicadores + placa de 280px > 360px),
          então o rodapé empilha: indicadores em cima, placa embaixo em
          largura total. */}
      <div className="mt-auto flex flex-col gap-2.5 pt-4 sm:gap-6 sm:pt-10 sm:flex-row sm:items-end sm:justify-between lg:pt-[min(40px,calc(var(--hero-cabe)*0.0476))]">
        {slides.length > 1 ? (
          <div className="flex items-center gap-4 lg:gap-[18px]">
            {slides.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setAtual(i)}
                aria-current={i === atual}
                /* 64px abaixo de `sm` porque a régua é de largura FIXA: com
                   quatro slides, 4x76 + 3x16 = 352px estoura os 343px úteis de
                   um celular de 375px. Com 64px dá 304px e sobra folga. De
                   `sm` para cima o espaço volta e o botão volta a 76px. */
                className="mt-foco flex w-[64px] flex-col gap-2 sm:w-[76px]"
              >
                <span className="h-0.5 w-full bg-[rgba(243,242,242,.3)]">
                  <span
                    className="block h-0.5 bg-mt-accent transition-[width] duration-[400ms] ease-linear"
                    style={{ width: i === atual ? "100%" : "0%" }}
                  />
                </span>
                {/* Número e o modelo do slide ("01 Kwid"): a paginação vira
                    navegação de verdade (revisão de 29/09, pino 5). Sem
                    `aria-label`: o nome acessível é o que está escrito, mais a
                    marca só para o leitor de tela — quem usa comando de voz
                    diz o que vê (WCAG 2.5.3). */}
                <span
                  className={`flex min-w-0 flex-col items-start gap-1 text-left ${
                    i === atual ? "text-mt-inverso" : "text-mt-inverso-suave"
                  }`}
                >
                  <span className="text-[11px] font-extrabold tracking-[.12em]">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  {/* O modelo só do `sm` para cima: a 64 px ele virava "911
                      Carre…", e no celular a segunda linha empurrava o preço da
                      placa para fora da primeira dobra. O leitor de tela ouve o
                      nome pelo `sr-only` em qualquer largura. */}
                  <span className="hidden w-full truncate text-[11px] font-semibold tracking-[.04em] sm:block">
                    {modeloEVersaoParaExibir(v.modelo, v.versao).modelo}
                  </span>
                  <span className="sr-only">{` — ver ${v.marca} ${v.modelo}`}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}

        {destaque && (
          /* A placa existe em toda largura — ela é o preço E o único link do
             hero para o PDP; escondê-la no mobile deixava o destaque sem os
             dois. Abaixo de `sm` ela vai em largura total na linha de baixo
             (ver rodapé); no tablet sobram 448px ao lado dos indicadores e os
             280px voltam a caber na mesma linha. */
          <Link
            href={getVeiculoPdpUrl(destaque)}
            className="mt-foco flex w-full flex-col items-start bg-[rgba(20,18,18,.86)] px-[18px] py-3 no-underline sm:px-[22px] sm:py-[18px] sm:w-auto sm:min-w-[280px] lg:py-[min(18px,calc(var(--hero-cabe)*0.0214))]"
          >
            <span className="text-[11px] font-semibold tracking-[.16em] text-mt-accent-400">
              EM DESTAQUE
            </span>
            <span className="mt-1.5 text-lg font-extrabold tracking-[-.02em] text-mt-inverso sm:mt-[7px] sm:text-xl lg:text-[length:clamp(15px,calc(var(--hero-cabe)*0.0238),20px)]">
              {destaque?.marca} {modeloDestaque}
            </span>
            {versaoDestaque && (
              <span className="mt-0.5 text-xs text-mt-inverso-suave">{versaoDestaque}</span>
            )}
            <span className="mt-2 flex w-full items-baseline gap-2.5 border-t border-[rgba(243,242,242,.25)] pt-2 sm:mt-3 sm:pt-3 lg:mt-[min(12px,calc(var(--hero-cabe)*0.0143))] lg:pt-[min(12px,calc(var(--hero-cabe)*0.0143))]">
              <span className="text-[20px] font-extrabold tracking-[-.03em] text-mt-inverso sm:text-[22px] lg:text-[length:clamp(16px,calc(var(--hero-cabe)*0.0262),22px)]">
                {formatarPreco(preco)}
              </span>
              <span className="ml-auto text-[11px] text-mt-inverso-suave">
                {formatarKm(destaque.quilometragem)}
              </span>
            </span>
          </Link>
        )}
      </div>
      </div>
    </section>
  );
}
