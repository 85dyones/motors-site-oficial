"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
     * enquanto couber e o conteúdo manda quando não couber. */
    <section className="relative flex flex-col bg-mt-inverso-fundo min-h-[520px] lg:min-h-[min(43vw,860px)]">
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
      <div className="relative z-10 flex flex-1 flex-col px-[18px] pb-6 pt-16 lg:px-10 lg:pb-10 lg:pt-[76px]">
      <div className="pointer-events-none max-w-[700px]">
        <div className="mb-6 flex items-center gap-3 lg:mb-[26px]">
          <span className="h-0.5 w-5 bg-mt-accent lg:w-7" aria-hidden="true" />
          <span className="text-[9px] font-semibold tracking-[.2em] text-mt-accent-300 lg:text-[11px]">
            CURITIBA · PREMIUM E SELECIONADOS
          </span>
        </div>

        <h1 className="mt-display m-0 text-[52px] text-mt-inverso lg:text-[112px] lg:leading-[.88]">
          FORA
          <br />
          DA CURVA
        </h1>

        <p className="m-0 mt-3.5 max-w-[460px] text-[13px] leading-relaxed text-mt-neutral-300 lg:mt-7 lg:text-[17px]">
          {totalEstoque} veículos em estoque com procedência auditada, laudo
          cautelar e garantia. Curadoria, não vitrine.
        </p>

        {/* Régua de indicadores: os três números precisam sair do estoque
            real. O do meio era "12 ANOS" de casa — default fixo no
            componente, sem fonte nenhuma. Trocado em 2026-08-06 por marcas
            distintas, que se conta do mesmo estoque que já está em memória. */}
        <EstatisticasRegua
          inverso
          className="mt-8 hidden w-[460px] lg:flex"
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

      {/* Rodapé do hero: indicadores à esquerda, placa do destaque à direita */}
      <div className="mt-auto flex items-end justify-between gap-6 pt-10">
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
          <Link
            href={getVeiculoPdpUrl(destaque)}
            className="mt-foco hidden min-w-[280px] flex-col items-start bg-[rgba(20,18,18,.86)] px-[22px] py-[18px] no-underline lg:flex"
          >
            <span className="text-[10px] font-semibold tracking-[.16em] text-mt-accent-400">
              EM DESTAQUE
            </span>
            <span className="mt-[7px] text-xl font-extrabold tracking-[-.02em] text-mt-inverso">
              {destaque.modelo}
            </span>
            <span className="mt-0.5 text-xs text-mt-inverso-suave">{destaque.versao}</span>
            <span className="mt-3 flex w-full items-baseline gap-2.5 border-t border-[rgba(243,242,242,.25)] pt-3">
              <span className="text-[22px] font-extrabold tracking-[-.03em] text-mt-inverso">
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
