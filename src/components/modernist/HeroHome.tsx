"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import { EstatisticasRegua, formatarKm, formatarPreco } from "./primitivos";

/**
 * Hero editorial da home.
 *
 * Três fotos em crossfade atrás de um título fixo. O texto não troca com o
 * slide — só a foto e a placa do veículo em destaque, para o hero não piscar
 * conteúdo (mesma regra que o painel documenta em "Áreas do site").
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
     * `--hero-cabe` é a altura útil abaixo do header (68px em `sm:`+, que é
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
      className="relative flex flex-col bg-mt-inverso-fundo min-h-[520px] lg:min-h-[min(43vw,var(--hero-cabe))]"
      style={
        {
          "--hero-cabe": "min(840px, calc(100svh - 68px))",
          "--regua-pt": "min(16px, calc(var(--hero-cabe) * 0.019))",
          "--regua-valor": "min(34px, calc(var(--hero-cabe) * 0.0405))",
        } as CSSProperties
      }
    >
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

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(20,18,18,.25),rgba(20,18,18,.92))] lg:bg-[linear-gradient(90deg,rgba(20,18,18,.92)_0%,rgba(20,18,18,.55)_46%,rgba(20,18,18,0)_78%)]"
      />

      {/* Conteúdo do hero.
       *
       * Em fluxo, não em posicionamento absoluto. O bloco editorial ficava
       * ancorado no topo e os indicadores no rodapé, cada um com sua própria
       * âncora: quando a altura do hero encolhia (ela é 43vw, então encolhe
       * junto com a largura), a régua de estatísticas descia por cima do
       * "01 02 03". Uma coluna flex com `mt-auto` no rodapé mantém a mesma
       * composição e torna a colisão impossível. */}
      <div className="relative z-10 flex flex-1 flex-col px-[18px] pb-6 pt-16 lg:px-10 lg:pb-[min(40px,calc(var(--hero-cabe)*0.0476))] lg:pt-[min(76px,calc(var(--hero-cabe)*0.0905))]">
      <div className="pointer-events-none max-w-[700px]">
        <div className="mb-6 flex items-center gap-3 lg:mb-[min(26px,calc(var(--hero-cabe)*0.031))]">
          <span className="h-0.5 w-5 bg-mt-accent lg:w-7" aria-hidden="true" />
          <span className="text-[9px] font-semibold tracking-[.2em] text-mt-accent-300 lg:text-[11px]">
            CURITIBA · PREMIUM E SELECIONADOS
          </span>
        </div>

        <h1 className="mt-display m-0 text-[52px] text-mt-inverso lg:text-[length:clamp(52px,calc(var(--hero-cabe)*0.1333),112px)] lg:leading-[.88]">
          FORA
          <br />
          DA CURVA
        </h1>

        <p className="m-0 mt-3.5 max-w-[460px] text-[13px] leading-relaxed text-mt-neutral-300 lg:mt-[min(28px,calc(var(--hero-cabe)*0.0333))] lg:text-[length:clamp(13px,calc(var(--hero-cabe)*0.0202),17px)]">
          {totalEstoque} veículos em estoque com procedência auditada, laudo
          cautelar e garantia. Curadoria, não vitrine.
        </p>

        {/* Régua de indicadores: os três números precisam sair do estoque
            real. O do meio era "12 ANOS" de casa — default fixo no
            componente, sem fonte nenhuma. Trocado em 2026-08-06 por marcas
            distintas, que se conta do mesmo estoque que já está em memória. */}
        <EstatisticasRegua
          inverso
          className="mt-[min(32px,calc(var(--hero-cabe)*0.0381))] hidden w-[460px] lg:flex"
          itens={[
            { valor: String(totalEstoque), rotulo: "EM ESTOQUE" },
            { valor: String(totalMarcas), rotulo: "MARCAS" },
            // "100% LAUDO CAUTELAR" era lido como "100% aprovado", e no feed
            // de 2026-08-06 só 35 dos 88 estavam aprovados — 53 seguiam em
            // análise. O compromisso real da loja, confirmado pelo dono, é de
            // processo: todo carro é enviado para a perícia. O rótulo agora
            // diz isso, e não o resultado.
            { valor: "100%", rotulo: "PASSAM PELA CAUTELAR", accent: true },
          ]}
        />
      </div>

      {/* Rodapé do hero: indicadores à esquerda, placa do destaque à direita.
          No mobile a linha não cabe (3 indicadores + placa de 280px > 360px),
          então o rodapé empilha: indicadores em cima, placa embaixo em
          largura total. */}
      <div className="mt-auto flex flex-col gap-6 pt-10 sm:flex-row sm:items-end sm:justify-between lg:pt-[min(40px,calc(var(--hero-cabe)*0.0476))]">
        {slides.length > 1 ? (
          <div className="flex items-center gap-4 lg:gap-[18px]">
            {slides.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setAtual(i)}
                aria-label={`Ver ${v.marca} ${v.modelo}`}
                aria-current={i === atual}
                className="mt-foco flex w-[76px] flex-col gap-2"
              >
                <span className="h-0.5 w-full bg-[rgba(243,242,242,.3)]">
                  <span
                    className="block h-0.5 bg-mt-accent transition-[width] duration-[400ms] ease-linear"
                    style={{ width: i === atual ? "100%" : "0%" }}
                  />
                </span>
                <span
                  className={`text-[11px] font-extrabold tracking-[.12em] ${
                    i === atual ? "text-mt-inverso" : "text-mt-inverso-suave"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
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
            className="mt-foco flex w-full flex-col items-start bg-[rgba(20,18,18,.86)] px-[22px] py-[18px] no-underline sm:w-auto sm:min-w-[280px] lg:py-[min(18px,calc(var(--hero-cabe)*0.0214))]"
          >
            <span className="text-[10px] font-semibold tracking-[.16em] text-mt-accent-400">
              EM DESTAQUE
            </span>
            <span className="mt-[7px] text-xl font-extrabold tracking-[-.02em] text-mt-inverso lg:text-[length:clamp(15px,calc(var(--hero-cabe)*0.0238),20px)]">
              {destaque.modelo}
            </span>
            <span className="mt-0.5 text-xs text-mt-inverso-suave">{destaque.versao}</span>
            <span className="mt-3 flex w-full items-baseline gap-2.5 border-t border-[rgba(243,242,242,.25)] pt-3 lg:mt-[min(12px,calc(var(--hero-cabe)*0.0143))] lg:pt-[min(12px,calc(var(--hero-cabe)*0.0143))]">
              <span className="text-[22px] font-extrabold tracking-[-.03em] text-mt-inverso lg:text-[length:clamp(16px,calc(var(--hero-cabe)*0.0262),22px)]">
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
