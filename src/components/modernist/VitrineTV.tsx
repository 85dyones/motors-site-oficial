"use client";

import { useEffect, useState } from "react";
import type { Veiculo } from "../../types";
import { formatarKm, formatarPreco } from "./primitivos";
import { paginaDaFaixa } from "../../lib/faixaVitrine";
import FaixaMusica from "./FaixaMusica";
import PlayerDaTV from "./PlayerDaTV";
import { useMusica } from "./useMusica";

/**
 * Vitrine da TV do showroom — tela 08 A do design doc.
 *
 * 16:9, sem interação, um veículo por vez trocando sozinho. Tudo é
 * dimensionado em `vw` e não em pixel: a tela desenhada é 1920×1080, mas a TV
 * da loja pode ser outra resolução, e um layout em pixel fixo ficaria com
 * tipografia minúscula numa 4K. Em `vw` a composição é a mesma em qualquer
 * painel 16:9.
 */

const INTERVALO_MS = 8000;

/**
 * Células da faixa "A SEGUIR".
 *
 * Quatro é a composição do design doc: numa TV de 1920px cada célula fica com
 * ~430px, respiro de 34px e o modelo em 22px. É o rodapé, não o rodízio, que
 * tem esse limite — antes a faixa dava uma célula por carro exposto, então
 * expor sete apertava cada célula a ~245px e truncava o nome do modelo. Agora
 * a faixa pagina: mostra quatro e vira a página quando o rodízio passa da
 * quarta. O rodízio em si nunca teve teto.
 */
export const POR_PAGINA = 4;

export default function VitrineTV({
  veiculos,
  totalEstoque,
  nomeLoja,
  telefone,
}: {
  veiculos: Veiculo[];
  totalEstoque: number;
  nomeLoja: string;
  telefone: string;
}) {
  const [atual, setAtual] = useState(0);
  const [decorrido, setDecorrido] = useState(0);

  // A TV só lê o player — quem comanda é o painel do balcão (08 C). Sem
  // credencial do Spotify configurada, `FaixaMusica` não renderiza nada e a
  // barra superior fica exatamente como era.
  const { estado: musica } = useMusica();

  useEffect(() => {
    if (veiculos.length < 2) return;
    const passo = 100;
    const t = setInterval(() => {
      setDecorrido((d) => {
        const proximo = d + passo;
        if (proximo >= INTERVALO_MS) {
          setAtual((i) => (i + 1) % veiculos.length);
          return 0;
        }
        return proximo;
      });
    }, passo);
    return () => clearInterval(t);
  }, [veiculos.length]);

  const carro = veiculos[atual];
  if (!carro) return null;

  // A página da faixa acompanha o rodízio: passou da quarta, vira.
  const {
    inicio: inicioDaPagina,
    visiveis: daPagina,
    vazias: vaziasNaPagina,
  } = paginaDaFaixa(veiculos, atual, POR_PAGINA);

  const preco =
    carro.preco_promocional > 0 && carro.preco_promocional < carro.preco_original
      ? carro.preco_promocional
      : carro.preco_original;

  const specs = [
    { rotulo: "ANO", valor: String(carro.ano) },
    { rotulo: "KM", valor: formatarKm(carro.quilometragem).replace(" km", "") },
    { rotulo: "CÂMBIO", valor: carro.cambio },
    { rotulo: "COMBUSTÍVEL", valor: carro.combustivel },
    // Coluna sem dado real sai da régua em vez de aparecer vazia — mesma
    // regra dos dois blocos de especificação da ficha do veículo: a matriz
    // (que oculta a linha) e a régua de especificações rápidas da barra
    // lateral (que filtra a célula). A régua só passou a seguir a regra em
    // 2026-08-06; até lá exibia rótulo sobre valor em branco. Guarda em
    // tests/especificacoes-pdp.test.ts.
  ].filter((s) => s.valor && s.valor.trim() !== "");

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#141212] font-modernist text-mt-inverso">
      {/* Registra esta aba como o dispositivo "TV Showroom" no Spotify
          Connect (A18). Não desenha nada; sem credencial ou sem sessão no
          navegador da TV, sai de cena sozinho. */}
      <PlayerDaTV ativo={musica.configurado} />
      {/* ─── Barra superior ─── */}
      <div className="flex h-[8.9vh] flex-none items-center gap-[1.7vw] border-b-2 border-mt-inverso-regua px-[2.9vw]">
        <div className="mr-auto flex items-center gap-[0.7vw]">
          <span className="h-[3.5vh] w-[0.52vw] bg-mt-accent" aria-hidden="true" />
          <span className="text-[1.46vw] font-extrabold tracking-[.02em]">
            {nomeLoja}
          </span>
        </div>
        <span className="text-[0.83vw] font-semibold tracking-[.18em] text-mt-inverso-suave">
          {totalEstoque} VEÍCULOS EM ESTOQUE · 100% PASSAM PELA PERÍCIA CAUTELAR
        </span>
        {musica.configurado && musica.faixa && (
          <span className="h-[3.5vh] w-px bg-[#444141]" aria-hidden="true" />
        )}
        <FaixaMusica estado={musica} />
        <span className="h-[3.5vh] w-px bg-[#444141]" aria-hidden="true" />
        <span className="text-[1.04vw] font-extrabold">{telefone}</span>
      </div>

      {/* ─── Miolo: foto à esquerda, ficha à direita ─── */}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex-[1.42] border-r-2 border-mt-inverso-regua bg-mt-inverso-fundo">
          {veiculos.map((v, i) => {
            const foto = v.web_full_images?.[0] ?? v.whatsapp_images?.[0];
            if (!foto) return null;
            return (
              <div
                key={v.id}
                aria-hidden={i !== atual}
                className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
                style={{ opacity: i === atual ? 1 : 0 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={foto}
                  alt={i === atual ? `${v.marca} ${v.modelo}` : ""}
                  className="h-full w-full object-cover object-[50%_58%]"
                />
              </div>
            );
          })}
          {carro.status_tag && (
            <div className="pointer-events-none absolute left-0 top-0 bg-mt-accent px-[1.15vw] py-[1.3vh] text-[0.83vw] font-extrabold tracking-[.16em] text-mt-inverso">
              {carro.status_tag.toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col px-[2.9vw] pt-[4.8vh]">
          <div className="text-[0.83vw] font-semibold tracking-[.2em] text-mt-accent-400">
            {carro.marca}
          </div>
          <div className="mt-[1.3vh] text-[3.96vw] font-extrabold leading-[.96] tracking-[-.035em] [text-wrap:pretty]">
            {carro.modelo}
          </div>
          <div className="mt-[1.3vh] text-[1.25vw] text-mt-neutral-400">
            {carro.versao}
          </div>

          <div className="mt-[3.7vh] flex border-t-2 border-mt-inverso-regua pt-[2vh]">
            {specs.map((s) => (
              <div
                key={s.rotulo}
                className="flex-1 border-r border-mt-inverso-regua-fina pr-[0.73vw] last:border-r-0"
              >
                <div className="text-[0.68vw] font-semibold tracking-[.14em] text-mt-inverso-suave">
                  {s.rotulo}
                </div>
                <div className="mt-[0.7vh] truncate text-[1.35vw] font-extrabold tracking-[-.02em]">
                  {s.valor}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pb-[4.1vh]">
            <div className="flex items-end gap-[1.5vw] border-t-2 border-mt-accent pt-[2vh]">
              <div className="min-w-0">
                <div className="text-[0.78vw] font-semibold tracking-[.16em] text-mt-inverso-suave">
                  À VISTA
                </div>
                <div className="mt-[0.7vh] text-[4.58vw] font-extrabold leading-[.92] tracking-[-.045em]">
                  {formatarPreco(preco)}
                </div>
              </div>
              {/* O design doc põe um QR aqui ("APONTE A CÂMERA"). O projeto
                  não tem biblioteca de QR nem domínio próprio configurado —
                  o site responde por `motors-site-oficial.vercel.app` —, e
                  imprimir um endereço inventado numa TV de showroom manda o
                  cliente para lugar nenhum. Até essas duas decisões, a célula
                  mostra o código do veículo, que é dado real e é por ele que
                  o consultor acha o carro. */}
              <div className="ml-auto flex flex-none items-center border-l border-[rgba(243,242,242,.25)] pl-[1.25vw]">
                <div className="w-[9.4vw]">
                  <div className="text-[0.78vw] font-extrabold leading-snug tracking-[.14em]">
                    CÓDIGO DO VEÍCULO
                  </div>
                  <div className="mt-[0.9vh] text-[1.77vw] font-extrabold leading-none tracking-[-.03em] text-mt-accent-400">
                    {carro.id}
                  </div>
                  <div className="mt-[0.9vh] text-[0.78vw] leading-snug text-mt-inverso-suave">
                    {carro.web_full_images?.length ?? 0} fotos, ficha completa e
                    laudo com o consultor.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Rodapé: a seguir ─── */}
      <div className="flex h-[15.7vh] flex-none items-stretch border-t-2 border-mt-inverso-regua">
        <div className="flex flex-none flex-col justify-center border-r border-mt-inverso-regua-fina pl-[2.9vw] pr-[1.7vw]">
          <span className="text-[0.73vw] font-semibold tracking-[.18em] text-mt-accent">
            A SEGUIR
          </span>
          <span className="mt-[1vh] text-[0.73vw] text-mt-neutral-600">
            {atual + 1} de {veiculos.length}
          </span>
        </div>
        {daPagina.map((v, i) => {
          const p =
            v.preco_promocional > 0 && v.preco_promocional < v.preco_original
              ? v.preco_promocional
              : v.preco_original;
          const ativo = inicioDaPagina + i === atual;
          return (
            <div
              key={v.id}
              className={`flex flex-1 flex-col justify-center gap-[1.2vh] border-r border-mt-inverso-regua-fina px-[1.77vw] ${
                ativo ? "bg-[#201e1d]" : ""
              }`}
            >
              <div className="h-[3px] bg-[rgba(243,242,242,.22)]">
                <div
                  className="h-[3px] bg-mt-accent transition-[width] duration-100 ease-linear"
                  style={{
                    width: ativo ? `${(decorrido / INTERVALO_MS) * 100}%` : "0%",
                  }}
                />
              </div>
              <div
                className={`truncate text-[1.15vw] font-extrabold tracking-[-.02em] ${
                  ativo ? "text-mt-inverso" : "text-mt-neutral-500"
                }`}
              >
                {v.modelo}
              </div>
              <div className="flex items-baseline gap-[0.62vw]">
                <span
                  className={`text-[0.94vw] font-extrabold ${
                    ativo ? "text-mt-accent" : "text-mt-neutral-600"
                  }`}
                >
                  {formatarPreco(p)}
                </span>
                <span className="text-[0.73vw] text-mt-neutral-600">
                  {formatarKm(v.quilometragem)}
                </span>
              </div>
            </div>
          );
        })}
        {Array.from({ length: vaziasNaPagina }, (_, i) => (
          <div
            key={`vazia-${i}`}
            aria-hidden="true"
            className="flex-1 border-r border-mt-inverso-regua-fina"
          />
        ))}
      </div>
    </div>
  );
}
