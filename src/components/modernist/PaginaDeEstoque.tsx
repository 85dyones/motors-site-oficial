import Link from "next/link";
import type { Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import { resumirSelecao } from "../../lib/destaquesRapidos";
import { CardVeiculo, formatarKm, formatarPreco } from "./primitivos";

/**
 * A página de listagem que hubs e páginas de bairro compartilham.
 *
 * Server component, e isso é o ponto — não um detalhe de implementação.
 * `Catalogo` (o /estoque com filtros) é client component e usa
 * `useSearchParams()`, então o servidor entrega só o fallback do `<Suspense>`:
 * medido em produção em 2026-08-25, o HTML de /estoque tinha **zero** link de
 * veículo e nenhum `<h1>`. Toda a grade só existia depois do JavaScript rodar.
 *
 * Para uma página que converte isso é indiferente; para uma que precisa
 * RANQUEAR, é o defeito inteiro: sem link no HTML, a autoridade da página não
 * chega às fichas, e o Google depende de uma segunda passada de renderização
 * para descobrir o que a loja vende. As páginas perenes nascem sem filtro e sem
 * estado justamente para poderem ser servidas prontas.
 */

export interface LinkDeNavegacao {
  rotulo: string;
  href: string;
  /** Contagem ao lado do rótulo. `0` é exibido: hub vazio existe e é perene. */
  total?: number;
}

export interface BlocoDeLinks {
  titulo: string;
  links: LinkDeNavegacao[];
}

export interface PerguntaFrequente {
  pergunta: string;
  resposta: string;
}

export interface PaginaDeEstoqueProps {
  /** Do primeiro nível até o penúltimo; o último é o título da página. */
  trilha: { rotulo: string; href?: string }[];
  titulo: string;
  /** Parágrafos de texto próprio. É o que separa hub de página fina (§2.3.3). */
  introducao?: string[];
  veiculos: Veiculo[];
  /** Mensagem quando a grade está vazia — o hub continua no ar. */
  textoSemEstoque?: string;
  blocos?: BlocoDeLinks[];
  faq?: PerguntaFrequente[];
}

export default function PaginaDeEstoque({
  trilha,
  titulo,
  introducao = [],
  veiculos,
  textoSemEstoque,
  blocos = [],
  faq = [],
}: PaginaDeEstoqueProps) {
  const resumo = resumirSelecao(veiculos);
  const temResumo = veiculos.length > 0;
  const marcasVisiveis = resumo.marcas.slice(0, 3);
  const marcasOcultas = resumo.marcas.length - marcasVisiveis.length;

  return (
    <div className="font-modernist">
      <div className="px-[18px] pt-8 lg:px-10 lg:pt-11">
        <nav
          aria-label="Trilha"
          className="text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600"
        >
          {trilha.map((passo) => (
            <span key={`${passo.rotulo}-${passo.href ?? ""}`}>
              {passo.href ? (
                <Link
                  href={passo.href}
                  className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink"
                >
                  {passo.rotulo.toUpperCase()}
                </Link>
              ) : (
                <span className="uppercase text-mt-ink">{passo.rotulo}</span>
              )}
              {" / "}
            </span>
          ))}
          <span className="uppercase text-mt-ink">{titulo}</span>
        </nav>

        <div className="flex flex-col gap-8 border-b-2 border-mt-regua pb-6 pt-4 lg:flex-row lg:items-end lg:gap-11">
          <div className="flex-1">
            <h1 className="mt-titulo m-0 text-[34px] lg:text-[56px] lg:leading-[.95]">
              {titulo} <span className="text-mt-accent">{veiculos.length}</span>
            </h1>
            {introducao.map((paragrafo) => (
              <p
                key={paragrafo.slice(0, 40)}
                className="m-0 mt-4 max-w-[620px] text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]"
              >
                {paragrafo}
              </p>
            ))}
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
                <span className="text-[10px] font-semibold tracking-[.1em] text-mt-neutral-600">
                  TODOS PASSAM PELA PERÍCIA CAUTELAR
                </span>
              </div>
            </div>
          )}
        </div>

        {veiculos.length > 0 ? (
          <div className="grid grid-cols-1 gap-x-7 gap-y-10 py-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-11">
            {veiculos.map((v, i) => (
              <CardVeiculo
                key={v.id}
                veiculo={v}
                href={getVeiculoPdpUrl(v)}
                etiqueta={v.status_tag || undefined}
                prioridade={i < 3}
              />
            ))}
          </div>
        ) : (
          /* Grade vazia não é erro: o hub é perene e volta a encher quando o
             estoque girar. O que não pode é virar beco sem saída — daí o
             caminho de volta e os blocos de links logo abaixo. */
          <div className="border-b border-mt-regua-fina py-10">
            <p className="m-0 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">
              {textoSemEstoque ??
                "Sem unidades disponíveis neste momento. O estoque gira toda semana — fale com um consultor e avisamos quando entrar."}
            </p>
            <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco mt-6">
              VER TODO O ESTOQUE
            </Link>
          </div>
        )}

        {blocos.map((bloco) => (
          <section key={bloco.titulo} className="border-t-2 border-mt-regua py-6">
            <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">{bloco.titulo}</h2>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {bloco.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="mt-foco flex items-baseline gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink no-underline hover:border-mt-accent"
                >
                  {link.rotulo}
                  {typeof link.total === "number" && (
                    <span className="text-[10px] font-semibold text-mt-accent">{link.total}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}

        {faq.length > 0 && (
          <section className="border-t-2 border-mt-regua py-6">
            <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Perguntas frequentes</h2>
            <dl className="m-0 mt-4 max-w-[720px]">
              {faq.map((item) => (
                <div key={item.pergunta} className="border-b border-mt-regua-fina py-4">
                  <dt className="text-[14px] font-extrabold text-mt-ink">{item.pergunta}</dt>
                  <dd className="m-0 mt-1.5 text-[13px] leading-relaxed text-mt-neutral-800">
                    {item.resposta}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
