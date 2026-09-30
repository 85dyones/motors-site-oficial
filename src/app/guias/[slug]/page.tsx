import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarGuiaPublicado, listarGuiasPublicados } from "../../../lib/guiasDoBanco";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import { blocoJsonLd } from "../../../lib/schemaListagem";
import { CAMINHO_DO_AUTOR_DOS_GUIAS, grafoDoGuia } from "../../../lib/schemaGuia";
import { criarLinkador } from "../../../lib/linksNoTexto";
import { NOME_DA_SECAO } from "../../../lib/guias";
import {
  AUTOR_DOS_GUIAS,
  apresentacaoDoAutor,
  dataPorExtenso,
  iniciaisDoAutor,
  mesmoDiaEmCuritiba,
} from "../../../lib/assinaturaDoGuia";
import { ancorasDasSecoes, blocosDaSecao } from "../../../lib/blocosDoGuia";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Uma hora, e não um dia — porque um dia não teria efeito.
 *
 * A primeira versão declarava `86400` com um comentário dizendo que conteúdo
 * editorial não gira com o estoque e que isso mantinha a página "fora do
 * caminho de qualquer leitura de banco". As duas metades eram falsas, e a
 * revisão mediu na tabela do build: a rota saía com **Revalidate 1h**.
 *
 * O motivo é que `getCachedSettings` é `unstable_cache` com `revalidate: 3600`
 * (`lib/settings.ts`), e o revalidate efetivo é o MENOR da cadeia. E a página
 * chama `getCachedSettings()` duas vezes — no metadata e no render —, então a
 * exposição a uma falha de leitura é a mesma de `/garantia`.
 *
 * Declarar o número real é melhor que declarar um teto decorativo: quem ler
 * daqui a seis meses precisa saber o que a rota faz, não o que se desejou.
 */
export const revalidate = 3600;
/**
 * `true`, e mudou com o editor do painel.
 *
 * Era `false` quando os guias viviam num array de código: a lista era conhecida
 * no build, e slug fora dela é 404 na hora. Agora o dono publica pelo painel, e
 * `false` faria o guia novo responder 404 até o próximo deploy — que é
 * exatamente o que o editor existe para evitar.
 *
 * Slug inexistente continua 404: `buscarGuiaPublicado` devolve `null` e a rota
 * chama `notFound()`. E rascunho também, porque a RLS não o entrega.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  // Falha aqui não pode derrubar o build inteiro: sem params, as rotas nascem
  // sob demanda em vez de prerenderizadas — o site continua servindo.
  try {
    return (await listarGuiasPublicados()).map((g) => ({ slug: g.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const guia = await buscarGuiaPublicado(slug);
  if (!guia) return { title: "Guia não encontrado | Motors Store" };

  const { companySettings } = await getCachedSettings();

  return {
    title: guia.tituloSeo,
    description: guia.descricao,
    alternates: { canonical: `/guias/${guia.slug}` },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "guias",
      tituloPadrao: guia.titulo,
      descricaoPadrao: guia.descricao,
      caminho: `/guias/${guia.slug}`,
    }),
  };
}

/**
 * Um guia dos Guias Motors.
 *
 * A rota é fina de propósito: o conteúdo vem da tabela `guias` por
 * `lib/guiasDoBanco.ts`, o grafo sai de `lib/schemaGuia.ts`, e o que sobra aqui
 * é layout. É o que permite ao teste renderizar a página inteira mockando dois
 * módulos.
 *
 * (Isto dizia "todo o conteúdo mora em `lib/guias.ts`", e era verdade até o
 * conteúdo virar dado em 06/09. Aquele arquivo hoje guarda só os tipos.)
 *
 * O texto passa pelo linkador da F1: "perícia cautelar" e "Avaliação Express"
 * viram link para as páginas que respondem por elas. Sem `caminhoAtual` —
 * nenhum guia é destino de termo —, e a string nunca é alterada, porque as
 * respostas do FAQ vão inteiras para o `FAQPage` do JSON-LD.
 *
 * ⚠️ Use `criarLinkador()`, e não `segmentarComLinks` direto. A primeira
 * versão desta rota chamou a segunda por parágrafo, e o comentário dizia "uma
 * vez por página" — falso: seis âncoras para `/garantia` no corpo do guia, sete
 * com o rodapé. O limite de `segmentarComLinks` é por STRING; num texto longo,
 * que é o que um guia é, a régua por página é a única que vale.
 */
export default async function GuiaPage({ params }: PageProps) {
  const { slug } = await params;
  // Estoura se a LEITURA falhar, e devolve `null` só quando o guia não existe
  // mesmo — a distinção está em `lib/guiasDoBanco.ts`, e ela evita servir 404
  // de uma página viva.
  const guia = await buscarGuiaPublicado(slug);
  if (!guia) notFound();

  const { companySettings } = await getCachedSettings();
  const grafo = grafoDoGuia({ guia, empresa: companySettings });

  // A assinatura visível mostra o MESMO autor do `Article` — a pessoa de
  // `AUTOR_DOS_GUIAS` —, com a loja pelo nome que o nó `#dealer` publica.
  // Ver `lib/assinaturaDoGuia.ts`.
  const apresentacao = apresentacaoDoAutor(companySettings?.name);
  const publicadoEm = dataPorExtenso(guia.publicadoEm);
  const atualizadoEm = mesmoDiaEmCuritiba(guia.publicadoEm, guia.atualizadoEm)
    ? ""
    : dataPorExtenso(guia.atualizadoEm);

  // Um linkador para a PAGINA inteira, nao um por paragrafo.
  //
  // A primeira versao chamava `segmentarComLinks` direto em cada bloco, e o
  // docblock acima dizia "uma vez por pagina". Era falso: a revisao mediu SEIS
  // ancoras para `/garantia` no corpo, sete com o rodape. E o defeito exato que
  // `criarLinkador` existe para fechar -- o limite de `segmentarComLinks` e por
  // STRING, e a regua certa e por pagina.
  // O caminho da própria página vai junto: desde 17/09/2026 as peças da Onda 1
  // são destino em `TERMOS_COM_DESTINO`, e cada peça cita o próprio título no
  // corpo. Sem isto, o guia linkaria para ele mesmo — âncora que não leva a
  // lugar nenhum e sinal interno falso para o rastreador.
  const linkar = criarLinkador(`/guias/${slug}`);
  const ancoras = ancorasDasSecoes(guia.corpo.map((secao) => secao.titulo));

  const comLinks = (texto: string, chave: string) =>
    linkar(texto).map((parte, i) =>
      parte.href ? (
        <Link
          key={`${chave}-${i}`}
          href={parte.href}
          className="mt-foco text-mt-ink underline decoration-mt-accent underline-offset-2 hover:text-mt-accent"
        >
          {parte.texto}
        </Link>
      ) : (
        <span key={`${chave}-${i}`}>{parte.texto}</span>
      ),
    );

  return (
    <div className="flex flex-col bg-mt-bg font-modernist text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blocoJsonLd(grafo) }} />

      <div className="px-[18px] pt-8 lg:px-10 lg:pt-11">
        <nav
          aria-label="Trilha"
          className="mt-trilha text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600"
        >
          <Link href="/" className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
            HOME
          </Link>
          {" / "}
          {/*
            `uppercase` no CSS, e não a string em caixa alta no JSX — que era
            como este degrau estava escrito. A diferença não é estética: o DOM
            é o que o leitor de tela e o rastreador leem, e ter `GUIAS MOTORS`
            aqui e `Guias Motors` no índice fazia a MESMA seção chegar em duas
            grafias para quem lê o texto, mesmo com os pixels iguais.
          */}
          <Link
            href="/guias"
            className="mt-foco uppercase text-mt-neutral-600 no-underline hover:text-mt-ink"
          >
            {NOME_DA_SECAO}
          </Link>
          {" / "}
          <span className="uppercase text-mt-ink">{guia.titulo}</span>
        </nav>

        <h1 className="mt-titulo m-0 mt-3 max-w-[900px] text-[32px] lg:text-[52px] lg:leading-[1.05]">
          {guia.titulo}
        </h1>
        <p className="m-0 mt-4 max-w-[680px] text-[15px] leading-relaxed text-mt-neutral-800 lg:text-[16px]">
          {guia.descricao}
        </p>
        {/* Bloco de autor (tarefa 4.11 da revisão de UI, 30/09). Até ali era
            uma linha só, em caixa alta espaçada, com autor, loja e duas datas:
            lia como rodapé jurídico. Agora a pessoa aparece como pessoa —
            monograma em cobre, nome em caixa normal com link para quem ela é
            (`/sobre#autor`, o mesmo `url` do nó `Person`) — e UMA data à
            vista: a da atualização, quando houve; a da publicação, quando
            não. As duas continuam no `Article` do JSON-LD. */}
        {/* O autor aparece mesmo se a data vier inválida do banco; só a data
            some. */}
        <div className="mt-6 flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center bg-mt-cobre text-[13px] font-extrabold tracking-[.04em] text-mt-bg"
            >
              {iniciaisDoAutor()}
            </span>
            <p className="m-0 leading-snug">
              <span className="block text-[15px] font-bold text-mt-ink">
                Por{" "}
                <Link
                  href={CAMINHO_DO_AUTOR_DOS_GUIAS}
                  className="mt-foco text-mt-ink underline decoration-mt-regua underline-offset-2 hover:decoration-mt-accent"
                >
                  {AUTOR_DOS_GUIAS.nome}
                </Link>
              </span>
              <span className="block text-[13px] text-mt-neutral-700">{apresentacao}</span>
            </p>
          </div>
          {/* No celular a data desce e alinha com o texto do autor (40 px
              do monograma + 12 de vão), e não com a borda do monograma. */}
          {(atualizadoEm || publicadoEm) && (
            <p className="m-0 pl-[52px] text-[13px] text-mt-neutral-700 sm:pl-0">
              {atualizadoEm ? (
                <>
                  Atualizado em <time dateTime={guia.atualizadoEm}>{atualizadoEm}</time>
                </>
              ) : (
                <>
                  Publicado em <time dateTime={guia.publicadoEm}>{publicadoEm}</time>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/*
        Leitura escaneável (30/09/2026). O texto é o mesmo que o rastreador
        lia; muda a forma de chegar nele:
          · "Neste guia": as seções, com âncora. No computador fica fixo ao
            lado, na coluna que era vazia; no celular, recolhido antes do texto.
          · O primeiro parágrafo, que responde à pergunta do título, em corpo
            maior.
          · Lista e subtítulo quando o texto marca (`lib/blocosDoGuia.ts`).
          · Corpo de 16/17px, e não 14/15px.
      */}
      <div className="border-t-2 border-mt-regua px-[18px] py-8 lg:grid lg:grid-cols-[minmax(0,680px)_minmax(200px,260px)] lg:gap-x-16 lg:px-10">
        <details className="mb-8 border border-mt-regua-fina lg:hidden">
          <summary className="cursor-pointer px-4 py-3 text-[11px] font-extrabold uppercase tracking-[.16em] text-mt-ink">
            Neste guia · {guia.corpo.length} partes
          </summary>
          <nav aria-label="Neste guia">
            <ol role="list" className="m-0 list-none border-t border-mt-regua-fina px-4 py-2">
              {guia.corpo.map((secao, i) => (
                <li key={ancoras[i]} className="py-1.5">
                  <a
                    href={`#${ancoras[i]}`}
                    className="mt-foco text-[14px] leading-snug text-mt-neutral-800 no-underline hover:text-mt-accent"
                  >
                    {secao.titulo}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </details>

        <article className="min-w-0 lg:col-start-1 lg:row-start-1">
          {guia.corpo.map((secao, s) => (
            <section key={ancoras[s]} className="pb-10 last:pb-0">
              <h2 id={ancoras[s]} className="mt-titulo m-0 text-[22px] lg:text-[28px]">
                {secao.titulo}
              </h2>
              {blocosDaSecao(secao.paragrafos).map((bloco, b) => {
                const chave = `${ancoras[s]}-${b}`;
                if (bloco.tipo === "separador") {
                  return <hr key={chave} className="m-0 mt-7 w-16 border-0 border-t-2 border-mt-regua" />;
                }
                if (bloco.tipo === "subtitulo") {
                  return (
                    <h3 key={chave} className="m-0 mt-7 text-[17px] font-extrabold leading-snug text-mt-ink lg:text-[19px]">
                      {bloco.texto}
                    </h3>
                  );
                }
                if (bloco.tipo === "lista") {
                  return (
                    // `role="list"`: com `list-none`, o VoiceOver do Safari
                    // deixa de anunciar a lista como lista.
                    <ul key={chave} role="list" className="m-0 mt-4 list-none p-0">
                      {bloco.itens.map((item, i) => (
                        <li
                          key={`${chave}-${i}`}
                          className="relative mt-2.5 pl-5 text-[16px] leading-[1.7] text-mt-neutral-800 before:absolute before:left-0 before:top-[.72em] before:h-[6px] before:w-[6px] before:bg-mt-accent before:content-[''] lg:text-[17px]"
                        >
                          {comLinks(item, `${chave}-${i}`)}
                        </li>
                      ))}
                    </ul>
                  );
                }
                const abertura = s === 0 && b === 0;
                return (
                  <p
                    key={chave}
                    className={
                      abertura
                        ? "m-0 mt-4 text-[18px] leading-[1.6] text-mt-ink lg:text-[20px]"
                        : "m-0 mt-4 text-[16px] leading-[1.7] text-mt-neutral-800 lg:text-[17px]"
                    }
                  >
                    {comLinks(bloco.texto, chave)}
                  </p>
                );
              })}
            </section>
          ))}
        </article>

        <div className="hidden lg:col-start-2 lg:row-start-1 lg:block">
          <nav aria-label="Neste guia" className="sticky top-24 border-l-2 border-mt-regua pl-5">
            <p className="m-0 text-[11px] font-extrabold uppercase tracking-[.16em] text-mt-ink">Neste guia</p>
            <ol role="list" className="m-0 mt-3 list-none p-0">
              {guia.corpo.map((secao, i) => (
                <li key={ancoras[i]} className="py-1.5">
                  <a
                    href={`#${ancoras[i]}`}
                    className="mt-foco text-[13px] leading-snug text-mt-neutral-700 no-underline hover:text-mt-accent"
                  >
                    {secao.titulo}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>

      <section className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
        <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Perguntas frequentes</h2>
        {/* As MESMAS strings que o `FAQPage` publica. O link entra no render,
            nunca na string — texto marcado tem que bater com o visível. */}
        <dl className="m-0 mt-4 max-w-[720px]">
          {guia.faq.map((item) => (
            <div key={item.pergunta} className="border-b border-mt-regua-fina py-4">
              <dt className="text-[14px] font-extrabold text-mt-ink">{item.pergunta}</dt>
              <dd className="m-0 mt-1.5 text-[13px] leading-relaxed text-mt-neutral-800">
                {comLinks(item.resposta, item.pergunta)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* A saída comercial. Guia sem destino é conteúdo que não devolve nada. */}
      <section className="border-t-2 border-mt-regua px-[18px] py-8 lg:px-10">
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={guia.saida.href}
            className="mt-foco flex max-w-[420px] flex-col gap-2 border border-mt-regua p-4 no-underline hover:border-mt-accent"
          >
            <span className="text-[12px] font-extrabold uppercase tracking-[.06em] text-mt-ink">
              {guia.saida.rotulo}
            </span>
            <span className="text-[12px] leading-relaxed text-mt-neutral-800">
              {guia.saida.apoio}
            </span>
          </Link>
          <Link
            href="/estoque"
            className="mt-foco flex max-w-[420px] flex-col gap-2 border border-mt-regua p-4 no-underline hover:border-mt-accent"
          >
            <span className="text-[12px] font-extrabold uppercase tracking-[.06em] text-mt-ink">
              Ver o estoque
            </span>
            <span className="text-[12px] leading-relaxed text-mt-neutral-800">
              O que entrou depois da perícia. O laudo é só pedir ao vendedor, a qualquer tempo.
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
