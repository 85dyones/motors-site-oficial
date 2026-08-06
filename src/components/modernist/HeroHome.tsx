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
  anosDeCasa = 12,
}: {
  slides: Veiculo[];
  totalEstoque: number;
  anosDeCasa?: number;
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
    <section className="relative bg-mt-inverso-fundo min-h-[520px] lg:h-[620px]">
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
              className="h-full w-full object-cover"
            />
          </div>
        );
      })}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(20,18,18,.25),rgba(20,18,18,.92))] lg:bg-[linear-gradient(90deg,rgba(20,18,18,.92)_0%,rgba(20,18,18,.55)_46%,rgba(20,18,18,0)_78%)]"
      />

      {/* Bloco editorial */}
      <div className="pointer-events-none relative z-10 max-w-[700px] px-[18px] pb-32 pt-16 lg:absolute lg:left-10 lg:top-[76px] lg:px-0 lg:pb-0 lg:pt-0">
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

        <EstatisticasRegua
          inverso
          className="mt-8 hidden w-[460px] lg:flex"
          itens={[
            { valor: String(totalEstoque), rotulo: "EM ESTOQUE" },
            { valor: String(anosDeCasa), rotulo: "ANOS" },
            { valor: "100%", rotulo: "LAUDO CAUTELAR", accent: true },
          ]}
        />
      </div>

      {/* Placa do veículo em destaque */}
      {destaque && (
        <Link
          href={getVeiculoPdpUrl(destaque)}
          className="mt-foco absolute bottom-10 right-10 z-10 hidden min-w-[280px] flex-col items-start bg-[rgba(20,18,18,.86)] px-[22px] py-[18px] no-underline lg:flex"
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

      {/* Indicadores */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-[18px] z-10 flex items-center gap-4 lg:bottom-10 lg:left-10 lg:gap-[18px]">
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
      )}
    </section>
  );
}
