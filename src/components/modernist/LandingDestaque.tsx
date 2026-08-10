import Link from "next/link";
import type { Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import { resumirSelecao, type DestaqueResolvido } from "../../lib/destaquesRapidos";
import { nomeEmFrase } from "../../lib/tagUtils";
import { CardVeiculo, formatarKm, formatarPreco } from "./primitivos";

/**
 * Landing de destaque — tela 07 do design doc.
 *
 * "Cada categoria vira uma landing indexável: URL própria, título, texto
 * editorial e grade atualizada pela regra." O H1, a introdução e o texto de
 * rodapé vêm do cadastro da categoria quando existem; a grade se mantém
 * sozinha pela regra do quick tag.
 */

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
  // `slug` saiu junto com o box da regra, que era quem exibia o endereço.
  const { tag, total, veiculos } = destaque;

  /**
   * O box da direita mostrava a regra do quick tag — "Seleção manual feita no
   * painel", o endereço da própria página e "atualizada automaticamente pela
   * regra". É operação da loja, e estas landings vão receber tráfego pago de
   * Google e Meta. No lugar entra o resumo da seleção: números do estoque
   * real desta página, que é texto indexável com marca e ano de verdade.
   */
  const resumo = resumirSelecao(veiculos);

  /**
   * Teto de 6 marcas. Sem ele, "Parcela 1K" listava 16 e o box ficava com
   * 192px contra 61px do bloco do H1 — além de virar lista de palavra-chave,
   * que é o contrário de reforçar SEO.
   */
  const MAX_MARCAS = 6;
  const marcasVisiveis = resumo.marcas.slice(0, MAX_MARCAS);
  const marcasOcultas = resumo.marcas.length - marcasVisiveis.length;

  const temResumo =
    resumo.precoMinimo !== null ||
    resumo.kmMinimo !== null ||
    resumo.anoMaisNovo !== null ||
    resumo.marcas.length > 0;
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

          {temResumo && (
            <div className="shrink-0 border-t-2 border-mt-regua pt-3.5 lg:w-[300px]">
              <div className="mb-2 text-[10px] font-semibold tracking-[.14em] text-mt-neutral-600">
                NESTA SELEÇÃO
              </div>
              {resumo.precoMinimo !== null && (
                <div className="text-[15px] font-extrabold">
                  A partir de {formatarPreco(resumo.precoMinimo)}
                </div>
              )}
              <dl className="m-0 mt-1.5 text-xs leading-relaxed text-mt-neutral-600">
                {resumo.anoMaisNovo !== null && (
                  <div>
                    <dt className="inline">Ano: </dt>
                    <dd className="m-0 inline text-mt-ink">
                      {resumo.anoMaisAntigo === resumo.anoMaisNovo
                        ? resumo.anoMaisNovo
                        : `${resumo.anoMaisAntigo} a ${resumo.anoMaisNovo}`}
                    </dd>
                  </div>
                )}
                {resumo.kmMinimo !== null && (
                  <div>
                    <dt className="inline">Quilometragem: </dt>
                    <dd className="m-0 inline text-mt-ink">
                      a partir de {formatarKm(resumo.kmMinimo)}
                    </dd>
                  </div>
                )}
                {marcasVisiveis.length > 0 && (
                  <div>
                    <dt className="inline">
                      {resumo.marcas.length === 1 ? "Marca: " : "Marcas: "}
                    </dt>
                    <dd className="m-0 inline text-mt-ink">
                      {marcasVisiveis.join(", ")}
                      {marcasOcultas > 0 && ` e mais ${marcasOcultas}`}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 bg-mt-accent" aria-hidden="true" />
                {/* "Passam pela" e não "têm laudo": todo carro vai para a
                    perícia, mas parte do estoque está sempre com o laudo em
                    análise. É a mesma redação da régua da home — processo,
                    não resultado. Não prometer o que a loja nem sempre pode
                    cumprir vale ainda mais numa página de tráfego pago. */}
                <span className="text-[10px] font-semibold tracking-[.1em] text-mt-neutral-600">
                  TODOS PASSAM PELA PERÍCIA CAUTELAR
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
