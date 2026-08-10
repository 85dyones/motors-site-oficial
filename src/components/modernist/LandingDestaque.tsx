import Link from "next/link";
import type { QuickTag, Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import type { DestaqueResolvido } from "../../lib/destaquesRapidos";
import { nomeEmFrase } from "../../lib/tagUtils";
import { CardVeiculo } from "./primitivos";

/**
 * Landing de destaque — tela 07 do design doc.
 *
 * "Cada categoria vira uma landing indexável: URL própria, título, texto
 * editorial e grade atualizada pela regra." O H1, a introdução e o texto de
 * rodapé vêm do cadastro da categoria quando existem; a grade se mantém
 * sozinha pela regra do quick tag.
 */

/** A regra em texto legível — é o que o doc mostra no box "REGRA DESTA PÁGINA". */
function descreverRegra(tag: QuickTag): string | null {
  const campos: Record<string, string> = {
    preco: "Preço",
    quilometragem: "Quilometragem",
    combustivel: "Combustível",
    perfil_uso: "Perfil de uso",
    tipo: "Carroceria",
    marca: "Marca",
  };
  const operadores: Record<string, string> = {
    less: "até",
    greater: "acima de",
    equals: "igual a",
    contains: "contém",
  };

  if (tag.field === "manual" || tag.operator === "none") {
    return "Seleção manual feita no painel";
  }

  const campo = campos[tag.field];
  const operador = operadores[tag.operator];
  if (!campo || !operador) return null;

  let valor = tag.value;
  if (tag.field === "preco") {
    valor = Number(tag.value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
  } else if (tag.field === "quilometragem") {
    valor = `${Number(tag.value).toLocaleString("pt-BR")} km`;
  }

  return `${campo} ${operador} ${valor}`;
}

export default function LandingDestaque({
  destaque,
  relacionados,
  introducao,
  textoEditorial,
}: {
  destaque: DestaqueResolvido;
  relacionados: DestaqueResolvido[];
  introducao?: string;
  textoEditorial?: string;
}) {
  const { tag, total, veiculos, slug } = destaque;
  const regra = descreverRegra(tag);
  // A <h1> é a única peça da landing em caixa de frase, de propósito — a
  // mesma caixa do <title>. A regra vive em `tagUtils` porque o SEO da rota
  // usa a irmã dela, e as duas precisam mudar juntas.
  const titulo = nomeEmFrase(tag.name);

  return (
    <div className="font-modernist">
      <div className="px-[18px] pt-8 lg:px-10 lg:pt-11">
        <nav
          aria-label="Trilha"
          className="text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600"
        >
          <Link href="/" className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
            HOME
          </Link>{" "}
          /{" "}
          <Link
            href="/estoque"
            className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink"
          >
            ESTOQUE
          </Link>{" "}
          / <span className="uppercase text-mt-ink">{tag.name}</span>
        </nav>

        <div className="flex flex-col gap-8 border-b-2 border-mt-regua pb-6 pt-4 lg:flex-row lg:items-end lg:gap-11">
          <div className="flex-1">
            <h1 className="mt-titulo m-0 text-[38px] lg:text-[64px] lg:leading-[.95]">
              {titulo} <span className="text-mt-accent">{total}</span>
            </h1>
            {introducao && (
              <p className="m-0 mt-4 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]">
                {introducao}
              </p>
            )}
          </div>

          {regra && (
            <div className="shrink-0 border-t-2 border-mt-regua pt-3.5 lg:w-[300px]">
              <div className="mb-2 text-[10px] font-semibold tracking-[.14em] text-mt-neutral-600">
                REGRA DESTA PÁGINA
              </div>
              <div className="text-[15px] font-extrabold">{regra}</div>
              <div className="mt-1.5 text-xs text-mt-neutral-600">
                motorsstore.com.br
                <strong className="text-mt-ink">/destaques/{slug}</strong>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 bg-mt-accent" aria-hidden="true" />
                <span className="text-[10px] font-semibold tracking-[.1em] text-mt-neutral-600">
                  ATUALIZADA AUTOMATICAMENTE PELA REGRA
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-x-7 gap-y-10 py-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-11">
          {veiculos.map((v: Veiculo, i: number) => (
            <CardVeiculo
              key={v.id}
              veiculo={v}
              href={getVeiculoPdpUrl(v)}
              etiqueta={v.status_tag || undefined}
              kmEmDestaque={tag.field === "quilometragem"}
              prioridade={i < 3}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t-2 border-mt-regua py-5">
          <Link href="/estoque" className="mt-btn mt-btn-tinta mt-foco">
            VER TODO O ESTOQUE
          </Link>
          <span className="text-xs text-mt-neutral-600">
            {total} {total === 1 ? "veículo nesta categoria" : "veículos nesta categoria"}
          </span>
        </div>
      </div>

      {relacionados.length > 0 && (
        <div className="flex flex-col border-t-2 border-mt-regua px-[18px] py-5 lg:flex-row lg:items-center lg:px-10">
          <span className="shrink-0 pb-3 pr-5 text-[10px] font-semibold tracking-[.16em] text-mt-neutral-600 lg:border-r lg:border-mt-regua-fina lg:pb-0">
            OUTROS DESTAQUES
          </span>
          <div className="flex flex-wrap gap-1.5 lg:gap-0">
            {relacionados.map((d) => (
              <Link
                key={d.slug}
                href={d.href}
                className="mt-foco flex items-baseline gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline lg:border-0 lg:border-r lg:border-mt-regua-fina lg:px-5 lg:py-2 lg:text-xs lg:tracking-[.08em]"
              >
                {d.tag.name}
                <span className="text-[10px] font-semibold text-mt-accent">{d.total}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {textoEditorial && (
        <div className="flex flex-col gap-8 border-t-2 border-mt-regua bg-mt-surface px-[18px] py-11 lg:flex-row lg:gap-14 lg:px-10">
          <div className="shrink-0 lg:w-[300px]">
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[.16em] text-mt-accent">
              POR QUE {tag.name}
            </div>
            <h2 className="mt-titulo m-0 text-[26px] leading-tight">
              O que considerar nesta seleção
            </h2>
          </div>
          <p className="m-0 flex-1 text-[14px] leading-relaxed text-mt-neutral-800">
            {textoEditorial}
          </p>
        </div>
      )}
    </div>
  );
}
