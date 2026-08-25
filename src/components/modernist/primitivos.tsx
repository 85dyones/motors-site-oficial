/**
 * Primitivos do sistema Modernist (redesign 2026).
 *
 * São as peças que se repetem em várias telas do design doc. O que aparece
 * uma vez só fica na própria tela — aqui entra só o que se repete.
 *
 * Regras do sistema que estes componentes carregam:
 * · zero arredondamento
 * · régua de 2px separa seção, de 1px separa item
 * · foto sangra na célula, sem moldura
 * · vermelho só onde há decisão
 */

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Veiculo } from "../../types";
import { modeloEVersaoParaExibir } from "../../lib/estoqueTabela";

/* ────────────────────────────────────────────────────────────────────────
   Rótulo em versalete — o marcador tipográfico do sistema
   ──────────────────────────────────────────────────────────────────────── */

export function Rotulo({
  children,
  accent = false,
  className = "",
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`mt-rotulo ${accent ? "mt-rotulo-accent" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Cabeçalho de seção — numeração, título e ação à direita
   ──────────────────────────────────────────────────────────────────────── */

export function CabecalhoSecao({
  numero,
  titulo,
  acao,
  className = "",
}: {
  /** Ex.: "01 — ESTOQUE SELECIONADO" */
  numero?: string;
  titulo: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-4 ${className}`}
    >
      <div>
        {numero && <div className="mt-secao-numero mb-2.5">{numero}</div>}
        <h2 className="mt-titulo m-0 text-3xl md:text-[46px]">{titulo}</h2>
      </div>
      {acao}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Etiqueta sobre foto
   ──────────────────────────────────────────────────────────────────────── */

export function Etiqueta({
  children,
  accent = false,
  className = "",
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <span className={`mt-etiqueta ${accent ? "mt-etiqueta-accent" : ""} ${className}`}>
      {children}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Seta — usada nos botões e links de avanço
   ──────────────────────────────────────────────────────────────────────── */

export function Seta({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

export function IconeWhatsApp({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Link em régua vermelha — "VER OS 75 VEÍCULOS →"
   ──────────────────────────────────────────────────────────────────────── */

export function LinkRegua({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`mt-link-regua mt-foco ${className}`}>
      {children}
      <span className="text-mt-accent">
        <Seta size={15} />
      </span>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Estatísticas em régua — o trio "75 · 12 · 100%" do hero
   ──────────────────────────────────────────────────────────────────────── */

export function EstatisticasRegua({
  itens,
  inverso = false,
  className = "",
}: {
  itens: { valor: string; rotulo: string; accent?: boolean }[];
  /** Sobre fundo escuro */
  inverso?: boolean;
  className?: string;
}) {
  /* `--regua-pt` e `--regua-valor` são pontos de ajuste opcionais: quem monta
     a régua num espaço apertado (o hero da home, que precisa caber na altura
     da janela) define as vars num ancestral e elas chegam aqui por herança.
     Sem ninguém definindo, o fallback é o valor do design. */
  return (
    <div
      className={`flex border-t-2 pt-[var(--regua-pt,16px)] ${
        inverso ? "border-mt-inverso-regua" : "border-mt-regua"
      } ${className}`}
    >
      {itens.map((item) => (
        <div key={item.rotulo} className="flex-1">
          <div
            className={`text-[length:var(--regua-valor,34px)] font-extrabold leading-none ${
              item.accent
                ? "text-mt-accent"
                : inverso
                  ? "text-mt-inverso"
                  : "text-mt-ink"
            }`}
          >
            {item.valor}
          </div>
          <div
            className={`mt-1 text-[10px] font-semibold tracking-[.14em] ${
              inverso ? "text-mt-inverso-suave" : "text-mt-neutral-600"
            }`}
          >
            {item.rotulo}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Card de veículo

   O card do sistema não tem moldura nem sombra: a foto sangra na célula e
   uma régua de 2px separa a foto dos dados. É o mesmo card na home, no
   catálogo e nas landings de destaque — só muda a densidade.
   ──────────────────────────────────────────────────────────────────────── */

export type DensidadeCard = "destaque" | "catalogo";

export function CardVeiculo({
  veiculo,
  href,
  densidade = "catalogo",
  etiqueta,
  parcela,
  contagemFotos,
  kmEmDestaque = false,
  prioridade = false,
}: {
  veiculo: Veiculo;
  href: string;
  densidade?: DensidadeCard;
  /** Selo sobre a foto — "BLINDADO", "ÚNICO DONO"… */
  etiqueta?: string;
  /** Ex.: "48× R$ 15.980" */
  parcela?: string;
  /** Ex.: "42 fotos" */
  contagemFotos?: string;
  /** Pinta a quilometragem de vermelho — usado na landing de baixa km */
  kmEmDestaque?: boolean;
  prioridade?: boolean;
}) {
  const grande = densidade === "destaque";
  const foto = veiculo.web_full_images?.[0] ?? veiculo.whatsapp_images?.[0];

  // O feed embute a versão na cauda do modelo — sem o corte, o título do
  // card estoura e a linha de versão vira eco (ver lib/estoqueTabela).
  const { modelo: modeloExibido, versao: versaoExibida } = modeloEVersaoParaExibir(
    veiculo.modelo,
    veiculo.versao,
  );

  const temDesconto =
    veiculo.preco_promocional > 0 &&
    veiculo.preco_promocional < veiculo.preco_original;
  const precoAtivo = temDesconto ? veiculo.preco_promocional : veiculo.preco_original;

  return (
    <Link href={href} className="group mt-foco flex flex-col no-underline">
      <div className="relative aspect-[4/3] bg-mt-neutral-300">
        {foto ? (
          /* Foto sem moldura e em cores — exceção deliberada ao P&B do
             sistema, porque cor é argumento de venda em carro.

             `next/image` desde 2026-08-25. Era um `<img>` cru com
             `eslint-disable`: sem WebP/AVIF, sem `srcset` e sem `sizes`, com o
             arquivo vindo do S3 do RevendaMais em tamanho cheio. Cada card
             baixava a foto de desktop mesmo no celular, e o §2.2.5 do plano de
             aquisição é direto sobre isso — "em site de estoque, o vilão do LCP
             é sempre a galeria de fotos". A ficha já usava `next/image`; só o
             card tinha ficado de fora, e ele aparece na home, no catálogo, nas
             landings, nos hubs e nas páginas de bairro.

             O `sizes` é o que faz a otimização valer: sem ele o Next serve o
             maior candidato do srcset em qualquer viewport, e o ganho vira
             zero. As três medidas são as grades reais em que este card vive —
             uma coluna no celular, duas no tablet, três no desktop. */
          <Image
            src={foto}
            alt={`${veiculo.marca} ${veiculo.modelo} ${veiculo.versao}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={prioridade}
            fetchPriority={prioridade ? "high" : "auto"}
            loading={prioridade ? "eager" : "lazy"}
            className="object-cover"
          />
        ) : null}
        {etiqueta && (
          <Etiqueta className="pointer-events-none absolute left-0 top-0 text-[9px]">
            {etiqueta}
          </Etiqueta>
        )}
        {contagemFotos && (
          <span className="pointer-events-none absolute bottom-0 right-0 bg-[rgba(20,18,18,.82)] px-2 py-1 text-[10px] font-semibold text-mt-inverso">
            {contagemFotos}
          </span>
        )}
      </div>

      <div className="mt-3 border-t-2 border-mt-regua pt-2.5">
        <div
          className={`font-semibold tracking-[.16em] text-mt-accent ${
            grande ? "text-[10px]" : "text-[9px]"
          }`}
        >
          {veiculo.marca}
        </div>
        <div
          className={`mt-0.5 font-extrabold leading-tight tracking-[-.02em] ${
            grande ? "text-[22px]" : "text-[19px]"
          }`}
        >
          {modeloExibido}
        </div>
        {versaoExibida && (
          <div
            className={`text-mt-neutral-700 ${grande ? "text-[13px]" : "text-xs"}`}
          >
            {versaoExibida}
          </div>
        )}

        <div
          className={`mt-2 flex gap-2 border-t border-mt-regua-fina pt-2 tracking-[.05em] text-mt-neutral-600 ${
            grande ? "text-[11px]" : "text-[10px]"
          }`}
        >
          <span>{veiculo.ano}</span>
          <span aria-hidden="true">·</span>
          <span className={kmEmDestaque ? "font-semibold text-mt-accent-800" : ""}>
            {formatarKm(veiculo.quilometragem)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{veiculo.cambio}</span>
        </div>

        <div className="mt-2 flex items-end justify-between gap-3">
          <div
            className={`font-extrabold tracking-[-.03em] ${
              grande ? "text-[28px]" : "text-[23px]"
            }`}
          >
            {formatarPreco(precoAtivo)}
          </div>
          {parcela && (
            <div
              className={`text-mt-neutral-600 ${grande ? "text-[11px]" : "text-[10px]"}`}
            >
              {parcela}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Formatadores

   Espelham `formatPrice`/`formatKm` de HeroSection, mas sem arrastar o
   componente inteiro para dentro dos primitivos.
   ──────────────────────────────────────────────────────────────────────── */

export function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatarKm(valor: number): string {
  if (valor === 0) return "0 km";
  return `${valor.toLocaleString("pt-BR")} km`;
}
