import type { ReactNode } from "react";
import Link from "next/link";
import type { Veiculo } from "../../types";
import { resumirSelecao } from "../../lib/destaquesRapidos";
import { criarLinkador } from "../../lib/linksNoTexto";
import { blocosDaSecao, blocosDoParagrafo, type BlocoDoGuia } from "../../lib/blocosDoGuia";
import GradeDeVeiculos from "./GradeDeVeiculos";
import BotaoWhatsApp from "./BotaoWhatsApp";
import GuiasRelacionados from "./GuiasRelacionados";
import type { GuiaRelacionado } from "../../lib/guiasNoSite";
import { formatarKm, formatarPreco } from "./primitivos";

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
  /**
   * O que oferecer quando a grade está vazia — a SAÍDA do hub sem carro.
   *
   * Achado do relatório dos hubs (31/08): *"hoje um hub sem carro é um beco.
   * Quem busca um modelo específico e não acha é o lead mais qualificado que
   * chega no site — e hoje ele volta para o Google"*.
   *
   * Quem chama escolhe o recorte: o hub de modelo manda os outros da mesma
   * marca, o de carroceria manda a mesma carroceria em outra faixa. Lista
   * vazia não desenha nada — hub perene de uma loja recém-aberta não deve
   * inventar vizinho.
   */
  alternativos?: Veiculo[];
  /** O cabeçalho dessa grade — ex.: "Do mesmo tipo, em outra faixa". */
  rotuloAlternativos?: string;
  /**
   * Link de WhatsApp já com a mensagem escrita — o "avise quando entrar um".
   *
   * `linkWhatsApp` devolve "" quando não há número configurado, e string vazia
   * aqui esconde o botão: `wa.me/` sem número abre o WhatsApp numa tela de
   * erro, que é pior do que não oferecer.
   */
  avisarHref?: string;
  /**
   * O formulário de encomenda do hub sem estoque — "Encomende seu carro".
   *
   * Entra como nó pronto, e não como um par de strings, porque é client
   * component com Turnstile e `fetch`: montá-lo aqui dentro obrigaria esta
   * página inteira a virar cliente.
   *
   * A GUARDA fica aqui, junto do desenho: é renderizado só no ramo de grade
   * vazia, a mesma condição que já governa o bloco de saída. Deixar a decisão
   * na rota faria cada hub escolher por conta própria, e o primeiro refactor
   * do hub de modelo esqueceria dela sem nada quebrar na tela — um formulário
   * a mais numa página com estoque não parece defeito, parece escolha.
   *
   * Ele SUBSTITUI o `avisarHref` nos hubs de marca e modelo, e convive com ele
   * nos recortes de `/estoque`, que continuam com o botão de WhatsApp.
   */
  encomenda?: ReactNode;
  blocos?: BlocoDeLinks[];
  /**
   * Os guias que respondem à próxima pergunta de quem está nesta página
   * (`lib/guiasNoSite.ts`). Entram depois dos blocos de navegação e antes do
   * FAQ: são leitura, e o FAQ é o fecho de toda página desta família.
   */
  guias?: { titulo: string; lista: readonly GuiaRelacionado[] };
  faq?: PerguntaFrequente[];
  /** CTA opcional no cabeçalho — hoje o "como chegar" das páginas de bairro. */
  acao?: ReactNode;
  /**
   * Mostra "N à venda" no topo da coluna da direita, acima do resumo.
   *
   * Vale para vitrine — "4 à venda" num hub de Jeep. Não vale para página que
   * não é listagem: "0 à venda" na Garantia não quer dizer nada.
   *
   * O zero não é impresso nem quando isto é `true`: o hub perene sem estoque
   * explica a situação em `textoSemEstoque`, e um "0" no cabeçalho só parece
   * defeito. (Até 2026-09-21 o número ia DENTRO do `<h1>` — ver a nota no
   * cabeçalho do componente.)
   */
  contagem?: boolean;
  /**
   * Bloco livre da página — hoje o simulador de `/financiamento` e a régua de
   * procedência de `/garantia`.
   */
  conteudo?: ReactNode;
  /**
   * Onde o `conteudo` entra.
   *
   * O padrão é DEPOIS da grade, porque na maioria dessas páginas o estoque é
   * ilustração do argumento e o bloco é o fecho.
   *
   * `/financiamento` inverte, e por um motivo medido: o texto de abertura diz
   * "o simulador **abaixo** responde a primeira pergunta", e o simulador
   * estava a 1702px do topo, com 9 cards entre a frase e ele. Quem lê "abaixo"
   * procura o próximo bloco, não o que vem depois de rolar a grade inteira —
   * e ali o simulador não é o fecho, é o assunto da página.
   */
  posicaoDoConteudo?: "antes-da-grade" | "depois-da-grade";
  /**
   * O caminho desta página — só para o FAQ não linkar para ela mesma.
   *
   * As respostas citam "Avaliação Express", "laudo cautelar" e "financiamento"
   * por extenso, e `segmentarComLinks` transforma a primeira ocorrência de cada
   * um em link. No FAQ de `/financiamento`, que fala de financiamento em quase
   * toda resposta, isso viraria auto-link: ruído para quem lê e sinal nulo para
   * o rastreador.
   *
   * Opcional de propósito. Sem ele o FAQ ainda linka corretamente — só perde
   * essa proteção. Nenhuma página fica errada por esquecer a prop; a de
   * `/garantia` e a de `/financiamento` ficam redundantes.
   */
  caminho?: string;
  /**
   * Seções com `<h2>` depois do cabeçalho — `/garantia` e `/financiamento`.
   *
   * Entraram em 2026-09-13, quando a `/garantia` foi alinhada à proposta do
   * pacote de conteúdo, que organiza a página em H2. A introdução continua
   * sendo o que vem sob o `<h1>`; as seções são o corpo.
   *
   * Linkam pelo MESMO `linkar` da introdução e do FAQ — cada destino vira link
   * uma vez por página, no primeiro lugar em que o leitor encontra o termo.
   */
  secoes?: SecaoDeTexto[];
  /**
   * As seções vêm DEPOIS do `conteudo`, e não antes.
   *
   * Tarefa 4.7 da revisão de UI de 30/09: em `/financiamento` o simulador é o
   * assunto da página, e quatro parágrafos entre o título e ele eram um muro
   * de texto antes da ferramenta. A abertura fica com o primeiro parágrafo
   * ("o simulador abaixo…"), e o resto do texto desce para depois do
   * simulador, em seção com `<h2>`. O texto é o mesmo, palavra por palavra.
   */
  secoesDepoisDoConteudo?: boolean;
  /**
   * Um bloco logo abaixo do `<h1>`, antes da introdução — hoje o resumo da
   * `/garantia` (tarefa 4.8): prazo, o que cobre e o que não cobre, à vista
   * sem rolar.
   */
  resumo?: ReactNode;
}

/** Uma seção de texto corrido: vira `<h2>` e parágrafos. */
export interface SecaoDeTexto {
  titulo: string;
  paragrafos: string[];
}

const CLASSE_DO_PARAGRAFO =
  "m-0 mt-4 max-w-[620px] text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]";

/**
 * O título com as palavras de hífen inteiras: "T-Cross", "HR-V",
 * "Mercedes-Benz", "Harley-Davidson".
 *
 * O navegador quebra linha DEPOIS de hífen. Num celular de 360 px o `<h1>` do
 * hub saía "Volkswagen T-" numa linha e "Cross seminovo em" na outra — medido
 * na simulação de 21/09, com o CSS e a fonte de produção. Cada palavra com
 * hífen vai num `<span>` sem quebra; o texto do `<h1>` (o que o buscador e o
 * leitor de tela leem) continua idêntico, letra por letra, espaço por espaço.
 */
export function semQuebraNoHifen(texto: string): ReactNode[] {
  return texto
    .split(/(\s+)/)
    .map((pedaco, i) =>
      pedaco.includes("-") ? (
        <span key={i} className="whitespace-nowrap">
          {pedaco}
        </span>
      ) : (
        pedaco
      ),
    );
}

export default function PaginaDeEstoque({
  trilha,
  titulo,
  introducao = [],
  veiculos,
  textoSemEstoque,
  alternativos = [],
  rotuloAlternativos = "Enquanto isso, do mesmo perfil",
  avisarHref = "",
  encomenda,
  blocos = [],
  guias,
  faq = [],
  acao,
  contagem = true,
  conteudo,
  posicaoDoConteudo = "depois-da-grade",
  caminho,
  secoes = [],
  secoesDepoisDoConteudo = false,
  resumo,
}: PaginaDeEstoqueProps) {
  // Um linkador para a página inteira: o mesmo `Set` atravessa introdução e
  // FAQ, então cada destino vira link UMA vez por página, e não uma por
  // parágrafo. Ver `criarLinkador`.
  const linkar = criarLinkador(caminho);

  // O parágrafo com links num lugar só. Introdução e seções desenham pela mesma
  // função — e pelo mesmo `linkar`, que é o que mantém um link por destino.
  const comLinks = (paragrafo: string) =>
    linkar(paragrafo).map((parte, j) =>
      parte.href ? (
        <Link
          key={j}
          href={parte.href}
          className="mt-foco text-mt-ink underline decoration-mt-accent underline-offset-2 hover:text-mt-accent"
        >
          {parte.texto}
        </Link>
      ) : (
        <span key={j}>{parte.texto}</span>
      ),
    );

  // O texto do hub em duas partes (30/09/2026). O dono: os blocos de texto
  // são "escaneáveis pelos LLMs e buscadores, mas maçantes para os leitores".
  // Nos hubs, quatro parágrafos ficavam entre o `<h1>` e o primeiro carro.
  //
  // A regra sai do próprio texto, sem prop nova: o que vem ANTES do primeiro
  // parágrafo "### Título" fica na abertura; dele em diante, desce para
  // depois da grade, como uma seção de leitura (o "###" vira `<h2>`). Texto
  // sem "###" (/garantia, /financiamento, bairros) sai como sempre saiu. As
  // marcas são as dos guias (`lib/blocosDoGuia.ts`): "- " vira lista, "---"
  // fecha o subtítulo.
  const inicioDaLeitura = introducao.findIndex((p) => /^###\s/.test(p.trim()));
  const abertura = inicioDaLeitura === -1 ? introducao : introducao.slice(0, inicioDaLeitura);
  const leitura = inicioDaLeitura === -1 ? [] : introducao.slice(inicioDaLeitura);

  // Um bloco de texto na régua da página: parágrafo, lista ou subtítulo. Só a
  // leitura tem subtítulo (a abertura termina no primeiro "###"), e ele é o
  // `<h2>` da seção.
  const desenharBloco = (bloco: BlocoDoGuia, chave: string) => {
    if (bloco.tipo === "separador") {
      return <hr key={chave} className="m-0 mt-7 w-16 border-0 border-t-2 border-mt-regua" />;
    }
    if (bloco.tipo === "subtitulo") {
      return (
        <h2 key={chave} className="mt-titulo m-0 mt-8 text-[20px] first:mt-0 lg:text-[26px]">
          {bloco.texto}
        </h2>
      );
    }
    if (bloco.tipo === "lista") {
      return (
        // `role="list"`: com `list-none`, o VoiceOver do Safari deixa de
        // anunciar a lista como lista.
        <ul key={chave} role="list" className="m-0 mt-4 max-w-[620px] list-none p-0">
          {bloco.itens.map((item, i) => (
            <li
              key={`${chave}-${i}`}
              className="relative mt-2 pl-5 text-[14px] leading-relaxed text-mt-neutral-800 before:absolute before:left-0 before:top-[.62em] before:h-[6px] before:w-[6px] before:bg-mt-accent before:content-[''] lg:text-[15px]"
            >
              {comLinks(item)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={chave} className={CLASSE_DO_PARAGRAFO}>
        {comLinks(bloco.texto)}
      </p>
    );
  };

  // Os guias que o TEXTO desta página já linka não voltam como card: seria
  // o segundo link para o mesmo destino, e a régua do site é um por página.
  // Aconteceu em `/garantia` na primeira versão (revisão de 29/09): a
  // introdução diz "de cada dez avaliados, três entram", que o linkador leva
  // a "O que reprova…", e a lista de guias da página trazia a mesma peça.
  // A medição usa um linkador descartável com as MESMAS entradas do render,
  // porque o do render só termina o FAQ depois de este bloco ser montado.
  const destinosDoTexto = new Set<string>();
  const medir = criarLinkador(caminho);
  for (const texto of [...introducao, ...secoes.flatMap((s) => s.paragrafos), ...faq.map((f) => f.resposta)]) {
    for (const parte of medir(texto)) if (parte.href) destinosDoTexto.add(parte.href);
  }
  const guiasDoBloco = guias?.lista.filter((g) => !destinosDoTexto.has(g.href)) ?? [];

  const blocoLivre = conteudo ? (
    <div className="-mx-[18px] lg:-mx-10">{conteudo}</div>
  ) : null;
  // Função, e não elemento pronto: o `linkar` é um só e marca cada destino
  // no primeiro texto que ele LÊ. Montar as seções aqui em cima faria o
  // linkador passar por elas antes da introdução, e o link desceria para a
  // seção (revisão do qa-guardian, 30/09). Chamada no ponto do JSX, a ordem
  // de leitura volta a ser a da página: abertura, seções, leitura, FAQ.
  const desenharSecoes = () =>
    secoes.length > 0 ? (
      <div className="border-b-2 border-mt-regua py-8">
        {secoes.map((secao) => (
          <section key={secao.titulo} className="max-w-[680px] pb-8 last:pb-0">
            <h2 className="mt-titulo m-0 text-[20px] lg:text-[26px]">{secao.titulo}</h2>
            {/* Mesmas marcas da leitura do hub (30/09/2026): "- " vira lista.
                Parágrafo sem marca sai como sempre saiu. */}
            {blocosDaSecao(secao.paragrafos).map((bloco, b) => desenharBloco(bloco, `${secao.titulo}-${b}`))}
          </section>
        ))}
      </div>
    ) : null;
  const resumoDaSelecao = resumirSelecao(veiculos);
  const temResumo = veiculos.length > 0;
  const mostraContagem = contagem && temResumo;
  const marcasVisiveis = resumoDaSelecao.marcas.slice(0, 3);
  const marcasOcultas = resumoDaSelecao.marcas.length - marcasVisiveis.length;

  return (
    <div className="font-modernist">
      <div className="px-[18px] pt-8 lg:px-10 lg:pt-11">
        <nav
          aria-label="Trilha"
          className="mt-trilha text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600"
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

        {/* As colunas se alinham pelo TOPO quando há contagem: o "N à venda"
            fica na altura do `<h1>`, lado a lado. Alinhadas por baixo, como
            antes, o título de uma linha descia e abria um vão sob a trilha
            (opção A da simulação de 21/09). Sem contagem — `/garantia`,
            `/financiamento` —, nada muda. */}
        <div
          className={`flex flex-col gap-8 border-b-2 border-mt-regua pb-6 pt-4 lg:flex-row lg:gap-11 ${
            mostraContagem ? "lg:items-start" : "lg:items-end"
          }`}
        >
          <div className="flex-1">
            {/* O `<h1>` é só o assunto — o número saiu daqui em 2026-09-21.
              *
              * Até então a contagem ia inline no fim do título ("Volkswagen
              * Saveiro seminova em Curitiba 2"). A simulação de 21/09, com o
              * componente, o CSS e a fonte de produção, mediu o que se temia:
              * em celular de 390 px o número caía SOZINHO numa linha em 18 dos
              * 46 hubs com carro. E o `<h1>` é o que o Google guarda do dia do
              * rastreamento: um número ali envelhece a cada venda.
              *
              * O número foi para o topo da coluna da direita, no mesmo tamanho
              * — decisão do dono, entre as opções simuladas. */}
            <h1 className="mt-titulo m-0 text-[34px] lg:text-[56px] lg:leading-[.95]">
              {semQuebraNoHifen(titulo)}
            </h1>
            {resumo && <div className="mt-6">{resumo}</div>}
            {/* A introdução linka pela mesma régua do FAQ, e aqui sem a
                restrição do JSON-LD: nada deste texto vai para o `FAQPage`.

                É onde estão as menções que mais importam. "A Avaliação Express
                devolve uma proposta pelo WhatsApp" abre o terceiro parágrafo de
                `/financiamento` — o ponto exato em que quem está simulando
                parcela descobre que o carro dele vale entrada, e até 05/09/2026
                a frase não levava a lugar nenhum. */}
            {abertura.flatMap((paragrafo, i) =>
              blocosDoParagrafo(paragrafo).map((bloco, b) => desenharBloco(bloco, `abertura-${i}-${b}`)),
            )}
            {acao && <div className="mt-6">{acao}</div>}
          </div>

          {temResumo && (
            <div className="shrink-0 lg:w-[300px]">
              {mostraContagem && (
                // Parágrafo, não título: é dado da vitrine, e o `<h1>` continua
                // sendo um só. No celular a coluna desce para baixo do texto e o
                // número fica logo acima da linha do preço.
                <p className="mt-titulo m-0 mb-4 text-[34px] lg:text-[56px] lg:leading-[.95]">
                  <span className="text-mt-cobre">{veiculos.length}</span> à venda
                </p>
              )}
              <div className="border-t-2 border-mt-regua pt-3.5">
                <div className="mb-2 text-[11px] font-semibold tracking-[.14em] text-mt-neutral-600">
                  NESTA SELEÇÃO
                </div>
                {resumoDaSelecao.precoMinimo !== null && (
                  <div className="text-[15px] font-extrabold">
                    A partir de {formatarPreco(resumoDaSelecao.precoMinimo)}
                  </div>
                )}
                <dl className="m-0 mt-1.5 text-xs leading-relaxed text-mt-neutral-600">
                  {resumoDaSelecao.anoMaisNovo !== null && (
                    <div>
                      <dt className="inline">Ano: </dt>
                      <dd className="m-0 inline text-mt-ink">
                        {resumoDaSelecao.anoMaisAntigo === resumoDaSelecao.anoMaisNovo
                          ? resumoDaSelecao.anoMaisNovo
                          : `${resumoDaSelecao.anoMaisAntigo} a ${resumoDaSelecao.anoMaisNovo}`}
                      </dd>
                    </div>
                  )}
                  {resumoDaSelecao.kmMinimo !== null && (
                    <div>
                      <dt className="inline">Quilometragem: </dt>
                      <dd className="m-0 inline text-mt-ink">
                        a partir de {formatarKm(resumoDaSelecao.kmMinimo)}
                      </dd>
                    </div>
                  )}
                  {marcasVisiveis.length > 0 && (
                    <div>
                      <dt className="inline">
                        {resumoDaSelecao.marcas.length === 1 ? "Marca: " : "Marcas: "}
                      </dt>
                      <dd className="m-0 inline text-mt-ink">
                        {marcasVisiveis.join(", ")}
                        {marcasOcultas > 0 && ` e mais ${marcasOcultas}`}
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="mt-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-mt-cobre" aria-hidden="true" />
                  <span className="text-[11px] font-semibold tracking-[.1em] text-mt-neutral-600">
                    TODOS PASSAM PELA PERÍCIA CAUTELAR
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Seções com `<h2>` — `/garantia` e `/financiamento`. Depois do
            cabeçalho e antes de qualquer bloco, ou logo depois do `conteudo`
            quando `secoesDepoisDoConteudo`; lista vazia não desenha nada, e
            as outras páginas saem idênticas. */}
        {!secoesDepoisDoConteudo && desenharSecoes()}

        {posicaoDoConteudo === "antes-da-grade" && blocoLivre}

        {secoesDepoisDoConteudo && desenharSecoes()}

        {veiculos.length > 0 ? (
          <div className="py-8">
            <GradeDeVeiculos veiculos={veiculos} />
          </div>
        ) : (
          /* Grade vazia não é erro: o hub é perene e volta a encher quando o
             estoque girar. O que não pode é virar beco sem saída.

             Três saídas, na ordem em que resolvem o problema de quem chegou
             aqui procurando uma coisa específica:

               1. AVISE-ME, que capta o lead no canal que a loja já atende. É
                  a primeira porque quem busca um modelo e não acha é o lead
                  mais qualificado do site — e sem isto ele volta para o
                  Google, que é exatamente o que o relatório encontrou.
               2. ALTERNATIVAS de verdade, com card e preço, não um link
                  genérico: "mesma carroceria em outra faixa" responde a
                  intenção; "ver todo o estoque" devolve o trabalho de filtrar
                  para quem já tinha filtrado.
               3. O catálogo inteiro, que continua sendo a saída de sempre. */
          <div className="border-b border-mt-regua-fina py-10">
            <p className="m-0 max-w-[560px] text-[14px] leading-relaxed text-mt-neutral-800">
              {textoSemEstoque ??
                "Sem unidades disponíveis neste momento. O estoque gira toda semana — fale com um consultor e avisamos quando entrar."}
            </p>
            {/* O formulário vem ANTES dos botões, e é a saída nº 1 do bloco.
                O `wa.me` que ocupava esse lugar captava no canal que a loja
                atende — e fora do sistema: sem linha em `leads`, sem CAPI, sem
                Kanban. Quem chega num hub sem estoque é o lead mais
                qualificado do site; ele merece o primeiro campo, não um link. */}
            {encomenda && <div className="mt-6">{encomenda}</div>}

            <div className="mt-6 flex flex-wrap gap-0.5">
              {avisarHref && (
                <BotaoWhatsApp
                  href={avisarHref}
                  origem="Hub sem estoque - Avise-me"
                  rotulo="AVISE-ME QUANDO ENTRAR"
                  className="mt-btn mt-btn-primario mt-foco"
                />
              )}
              {/* Regra 6: a vitrine ordena, nunca esconde. Esta saída não some
                  nem quando o formulário está ali em cima. */}
              <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco">
                VER TODO O ESTOQUE
              </Link>
            </div>

            {alternativos.length > 0 && (
              <div className="mt-10">
                <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">{rotuloAlternativos}</h2>
                <div className="mt-5">
                  <GradeDeVeiculos veiculos={alternativos} prioritarios={0} />
                </div>
              </div>
            )}
          </div>
        )}

        {posicaoDoConteudo === "depois-da-grade" && blocoLivre}

        {/* A leitura do hub: o texto que ficava entre o título e os carros.
            O "###" do texto abre a seção e vira o `<h2>` dela. */}
        {leitura.length > 0 && (
          <section className="border-t-2 border-mt-regua py-8">
            <div className="max-w-[680px]">
              {blocosDaSecao(leitura).map((bloco, b) => desenharBloco(bloco, `leitura-${b}`))}
            </div>
          </section>
        )}

        {/* Bloco sem link nenhum não entra: cabeçalho seguido de nada é ruído
            para quem lê e landmark vazio para quem navega por leitor de tela.
            Acontece de verdade — "Por carroceria" numa loja que ainda não
            classificou o estoque, "Modelos" numa marca recém-chegada. Mesma
            regra que a home já aplica às faixas de reputação e Instagram. */}
        {blocos
          .filter((bloco) => bloco.links.length > 0)
          .map((bloco) => (
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
                    <span className="text-[11px] font-semibold text-mt-cobre">{link.total}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
          ))}

        {guias && <GuiasRelacionados titulo={guias.titulo} guias={guiasDoBloco} />}

        {faq.length > 0 && (
          <section className="border-t-2 border-mt-regua py-6">
            <h2 className="mt-titulo m-0 text-[20px] lg:text-[24px]">Perguntas frequentes</h2>
            <dl className="m-0 mt-4 max-w-[720px]">
              {faq.map((item) => (
                <div key={item.pergunta} className="border-b border-mt-regua-fina py-4">
                  <dt className="text-[14px] font-extrabold text-mt-ink">{item.pergunta}</dt>
                  {/* A resposta é a MESMA string que vai para o `FAQPage` do
                      JSON-LD, e o Google exige que o texto marcado seja idêntico
                      ao visível. Por isso o link entra aqui, no render, e nunca
                      dentro da string: `segmentarComLinks` só quebra o texto em
                      pedaços — juntá-los devolve a resposta byte a byte. */}
                  <dd className="m-0 mt-1.5 text-[13px] leading-relaxed text-mt-neutral-800">
                    {linkar(item.resposta).map((parte, i) =>
                      parte.href ? (
                        <Link
                          key={`${item.pergunta}-${i}`}
                          href={parte.href}
                          className="mt-foco text-mt-ink underline decoration-mt-accent underline-offset-2 hover:text-mt-accent"
                        >
                          {parte.texto}
                        </Link>
                      ) : (
                        <span key={`${item.pergunta}-${i}`}>{parte.texto}</span>
                      ),
                    )}
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
