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
import { ancorasDasSecoes, blocosDaSecao, minutosDeLeitura } from "../../../lib/blocosDoGuia";
import { proximosNoTema, temaDoGuia } from "../../../lib/guiasNoSite";
import SumarioDoGuia from "../../../components/guias/SumarioDoGuia";

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
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  const tema = temaDoGuia(guia.slug);
  const minutos = minutosDeLeitura(guia);
  // Sem a barra final e sem parâmetros: "/estoque/" e "/estoque?x" são o mesmo destino.
  const saidaEhOEstoque = guia.saida.href.split(/[?#]/)[0].replace(/\/+$/, "") === "/estoque";

  // "Continue lendo": os próximos do mesmo tema, e só os que estão no ar. A
  // lista vem do banco para trazer a descrição; se essa leitura falhar, o guia
  // abre sem o bloco, em vez de cair por causa de um enfeite.
  const seguintes = proximosNoTema(guia.slug);
  let continuar: { slug: string; titulo: string; descricao: string }[] = [];
  if (seguintes.length) {
    try {
      const publicados = await listarGuiasPublicados();
      continuar = seguintes.flatMap((s) => publicados.filter((g) => g.slug === s && g.slug !== guia.slug));
    } catch {
      continuar = [];
    }
  }
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
      {/* Quanto do guia já foi lido. É só CSS (`animation-timeline: scroll()`):
          onde o navegador não tem isso, a barra não aparece. */}
      <div aria-hidden="true" className="mt-progresso-de-leitura" />

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

        {tema && (
          <p className="m-0 mt-5 flex flex-wrap items-center gap-2.5 text-[11px] font-extrabold uppercase tracking-[.14em]">
            <span className="bg-mt-ink px-2.5 py-1.5 text-mt-bg">Tema {doisDigitos(tema.numero)}</span>
            <span className="text-mt-cobre">{tema.titulo}</span>
          </p>
        )}
        <h1 className="mt-display m-0 mt-4 max-w-[980px] text-[34px] leading-[1] lg:text-[64px]">
          {guia.titulo}
        </h1>
        <p className="m-0 mt-5 max-w-[760px] text-[17px] leading-[1.5] text-mt-neutral-800 lg:text-[21px]">
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
        <div className="mt-7 flex flex-col gap-3 border-t border-mt-regua-fina pb-6 pt-5 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex flex-wrap gap-x-6 gap-y-1 pl-[52px] text-[13px] text-mt-neutral-700 sm:pl-0">
            {(atualizadoEm || publicadoEm) && (
              <p className="m-0">
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
            <p className="m-0">
              <strong className="text-mt-ink">{minutos} min</strong> de leitura
            </p>
          </div>
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
      <div className="border-t-2 border-mt-regua px-[18px] py-8 lg:grid lg:grid-cols-[minmax(0,720px)_minmax(240px,320px)] lg:gap-x-20 lg:px-10 lg:py-14">
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
            <section key={ancoras[s]} className="pb-12 last:pb-0 lg:pb-16">
              {/* O número fica FORA do `<h2>`: o título que o leitor de tela e
                  o rastreador leem continua sendo só o título. */}
              <div className="flex items-baseline gap-3 border-t-2 border-mt-ink pt-4 lg:gap-4">
                <span aria-hidden="true" className="text-[13px] font-extrabold text-mt-cobre lg:text-[14px]">
                  {doisDigitos(s + 1)}
                </span>
                <h2
                  id={ancoras[s]}
                  className="mt-titulo m-0 scroll-mt-24 text-[26px] leading-[1.1] lg:text-[34px]"
                >
                  {secao.titulo}
                </h2>
              </div>
              {blocosDaSecao(secao.paragrafos).map((bloco, b) => {
                const chave = `${ancoras[s]}-${b}`;
                if (bloco.tipo === "separador") {
                  return <hr key={chave} className="m-0 mt-7 w-16 border-0 border-t-2 border-mt-regua" />;
                }
                if (bloco.tipo === "subtitulo") {
                  return (
                    <h3 key={chave} className="m-0 mt-8 text-[19px] font-extrabold leading-snug text-mt-ink lg:text-[23px]">
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
                          className="relative mt-3 pl-6 text-[17px] leading-[1.65] text-mt-neutral-800 before:absolute before:left-0 before:top-[.66em] before:h-[7px] before:w-[7px] before:bg-mt-accent before:content-[''] lg:text-[19px]"
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
                        ? "m-0 mt-5 text-[20px] leading-[1.5] text-mt-ink lg:text-[24px]"
                        : "m-0 mt-5 text-[17px] leading-[1.65] text-mt-neutral-800 lg:text-[19px]"
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
          {/* Só o sumário. A saída comercial fica uma vez, no fim da página:
              repetida aqui, o mesmo destino ganharia duas âncoras estruturais
              (`tests/guias-publicam-o-grafo`). */}
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
            <SumarioDoGuia secoes={guia.corpo.map((secao, i) => ({ ancora: ancoras[i], titulo: secao.titulo }))} />
          </div>
        </div>
      </div>

      <section className="border-t-2 border-mt-regua px-[18px] py-10 lg:px-10 lg:py-14">
        <div className="max-w-[720px]">
          <h2 className="mt-titulo m-0 text-[26px] leading-[1.1] lg:text-[34px]">Perguntas frequentes</h2>
          {/* As MESMAS strings que o `FAQPage` publica. O link entra no render,
              nunca na string — texto marcado tem que bater com o visível. */}
          <dl className="m-0 mt-6 border-t-2 border-mt-ink">
            {guia.faq.map((item) => (
              <div key={item.pergunta} className="border-b border-mt-regua-fina py-5">
                <dt className="text-[17px] font-extrabold leading-snug text-mt-ink lg:text-[20px]">{item.pergunta}</dt>
                <dd className="m-0 mt-2 text-[15px] leading-[1.65] text-mt-neutral-800 lg:text-[17px]">
                  {comLinks(item.resposta, item.pergunta)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {continuar.length > 0 && tema && (
        <section className="border-t-2 border-mt-regua px-[18px] py-10 lg:px-10 lg:py-14">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="mt-titulo m-0 text-[26px] leading-[1.1] lg:text-[34px]">Continue neste tema</h2>
            <Link
              href="/guias"
              className="mt-foco inline-flex min-h-11 items-center text-[12px] font-extrabold uppercase tracking-[.1em] text-mt-ink no-underline hover:text-mt-accent-hover"
            >
              Todos os guias <span aria-hidden="true">&nbsp;→</span>
            </Link>
          </div>
          <p className="m-0 mt-2 text-[14px] text-mt-neutral-800">{tema.titulo}</p>
          <ul role="list" className="m-0 mt-6 grid list-none gap-0 border-t-2 border-mt-ink p-0 md:grid-cols-3">
            {continuar.map((outro) => (
              <li key={outro.slug} className="border-b border-mt-regua-fina md:border-b-0 md:border-l md:pl-6 md:pr-6 md:first:border-l-0 md:first:pl-0">
                <Link
                  href={`/guias/${outro.slug}`}
                  className="mt-foco group flex h-full flex-col gap-2 py-6 no-underline"
                >
                  <span className="text-[19px] font-extrabold leading-tight text-mt-ink group-hover:text-mt-accent-hover lg:text-[22px]">
                    {outro.titulo}
                  </span>
                  <span className="text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]">{outro.descricao}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* A saída comercial. Guia sem destino é conteúdo que não devolve nada.
          Mesma faixa clara do índice (aprovada pelo dono em 02/10): o rodapé do
          site já é escuro, e uma faixa escura colada nele virava um bloco só. */}
      <section className="border-t-2 border-mt-regua bg-mt-surface px-[18px] py-10 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-10 lg:py-14">
        <div className="max-w-[560px]">
          <h2 className="mt-titulo m-0 text-[28px] lg:text-[40px]">Depois de ler</h2>
          <p className="m-0 mt-3 text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]">{guia.saida.apoio}</p>
        </div>
        {/* Quando a saída do guia JÁ é o estoque, o segundo botão levaria ao
            mesmo lugar (visto pelo dono em 02/10): fica um só. */}
        <div className="mt-5 flex flex-wrap gap-2 lg:mt-0 lg:justify-end">
          <Link href={guia.saida.href} className="mt-foco mt-btn mt-btn-primario uppercase">
            {guia.saida.rotulo}
          </Link>
          {!saidaEhOEstoque && (
            <Link href="/estoque" className="mt-foco mt-btn mt-btn-contorno uppercase">
              Ver o estoque
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
