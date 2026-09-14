import PaginaDeEstoque from "../../../../../components/modernist/PaginaDeEstoque";
import EncomendaDaFichaPerdida from "../../../../../components/EncomendaDaFichaPerdida";
import {
  FAIXAS_DE_PRECO,
  recorteDoNaoEncontrado,
  type RecorteDoNaoEncontrado,
} from "../../../../../lib/hubsDeEstoque";
import { EstoqueIndisponivelError } from "../../../../../lib/supabase";

/**
 * A ficha que não existe — `notFound()` da rota do veículo.
 *
 * ---------------------------------------------------------------------------
 * O que havia aqui antes: nada
 * ---------------------------------------------------------------------------
 * Não havia `not-found.tsx` em branch nenhum do repositório, então a rota caía
 * no 404 de fábrica do Next. Em produção, em 2026-09-11, a resposta era 404 e
 * a tela, "404: This page could not be found" — em inglês, em system-ui, sem
 * link nenhum, dentro do cabeçalho e do rodapé da marca. Esta página troca só
 * o CORPO: status, metadata e o resto do comportamento da rota ficam onde
 * estavam.
 *
 * ---------------------------------------------------------------------------
 * O HTML servido é uma casca vazia — e não é defeito desta página
 * ---------------------------------------------------------------------------
 * Medido em 2026-09-14 com curl, na produção, no preview do #70 e no desta
 * página: `notFound()` numa rota casada responde 404 com
 * `<html id="__next_error__">`, `noindex` no head e o `<body>` vazio. No Next
 * 16.2.6 o erro escapa do SSR, e o catch de
 * `next/dist/server/app-render/app-render.js` manda essa casca com o payload
 * RSC da renderização normal inline. O navegador desenha a página inteira a
 * partir dele: cabeçalho, rodapé, título, grade e links. Nenhum `notFound()`
 * põe o corpo no HTML. Com 404 e `noindex` a página fica fora do índice de
 * qualquer jeito; o custo que sobra é a tela em branco até o JavaScript rodar.
 *
 * Por isso a conferência no preview não procura texto no HTML inteiro:
 * `includes` acha tudo dentro de `self.__next_f` e fica verde — inclusive o
 * "This page could not be found" do layout raiz, que viaja no payload como
 * prop e não aparece na tela. A decisão do dono, em 14/09, foi conferir o
 * payload e deixar a casca escrita.
 *
 * O metadata continua saindo de `generateMetadata`, na rota ("Veículo não
 * encontrado | Motors Store"), e também só chega pelo payload: o `<title>` da
 * casca é o padrão do layout ("Motors Store | Fora da Curva"), e o título
 * certo entra quando o navegador desenha a página. Com 404 no status a
 * diferença não tem custo de busca; virar 200 nesta rota, algum dia, muda isso.
 *
 * ---------------------------------------------------------------------------
 * Quem cai aqui, hoje
 * ---------------------------------------------------------------------------
 * Menos gente do que o pacote de conteúdo supunha, e vale registrar para
 * ninguém "consertar" o que já está certo: **carro vendido não cai aqui.**
 * Durante a carência de 90 dias a ficha responde 200 com o selo e os
 * similares, e depois dela vira 301 para o hub do modelo (ver
 * `publicacao.arquivar` na rota). Conferido em produção contra três vendidos:
 * todos 200.
 *
 * Sobra o que de fato não resolve: id que nunca existiu, ficha apagada do
 * `estoque_motors`, URL antiga de portal, link torto compartilhado, o segmento
 * que não serve ficha (`ehSegmentoDePdp`) e o endereço legado de cinco
 * segmentos (`[legado]/page.tsx`, que cai neste mesmo boundary). Nenhum desses
 * tem carro — e é por isso que a página não tenta mostrar "similares ao que
 * você queria": não existe o "que você queria" para comparar.
 *
 * É também por isso que a copy não afirma venda. "Foi vendido" e "saiu da
 * vitrine" descrevem estados que respondem **200** — `publicacao.arquivar` é
 * falso para fora-do-feed e para bloqueado —, e "não está mais no estoque"
 * pressupõe que a loja teve o carro, o que para `/carros/foo/bar/x-1` é
 * invenção. A regra que `lib/fichaPerdida.ts` aplica ao nome da marca vale
 * igual para o `<h1>`. Ela mostra o pátio de hoje e
 * as trilhas para chegar nele.
 *
 * ---------------------------------------------------------------------------
 * Componente nenhum novo na tela
 * ---------------------------------------------------------------------------
 * `PaginaDeEstoque` com a grade VAZIA é exatamente o desenho do hub sem carro
 * — formulário de encomenda, alternativas com card e preço, e o catálogo
 * inteiro. Foi desenhado em 01/09 para o mesmo problema desta página ("quem
 * procurou uma coisa específica e não achou"), já tem teste, e reusá-lo custa
 * uma prop. O único código novo é `EncomendaDaFichaPerdida`, e ele existe por
 * uma limitação do framework: `not-found.tsx` não recebe `params`.
 *
 * Tudo o que segura a R5 (título, grade do pátio, recortes, "ver todo o
 * estoque") é server component e sai daqui, sem depender do caminho; o
 * formulário é o único bloco que precisa de `usePathname`. Nenhum dos dois
 * está no HTML servido — ver a casca, acima.
 *
 * ---------------------------------------------------------------------------
 * A leitura: o recorte guardado, e só aqui (2026-09-13)
 * ---------------------------------------------------------------------------
 * A primeira versão desta página chamava `recortesDoEstoque`: duas leituras de
 * `estoque_motors` com `select *`, ~489 KB cada, ~977 KB por render. É o custo
 * de qualquer hub — a diferença é o espaço de endereços. Os 103 hubs são
 * finitos; caminho falso é ilimitado, e com ISR de 1 hora cada caminho inédito
 * rende uma vez. Contra o teto de 5 GB do Supabase free, da ordem de 5 mil
 * caminhos distintos no mês consomem a cota.
 *
 * A decisão do dono em 13/09 foi cache SÓ no não encontrado: esta página lê
 * `recorteDoNaoEncontrado`, que guarda por uma hora o recorte pronto (amostra,
 * índice e links), e não o estoque. O resto do site continua lendo fresco. O
 * preço disso está escrito lá: a amostra pode ter até uma hora de atraso.
 *
 * ---------------------------------------------------------------------------
 * A pane: 404 com moldura, sem amostra (2026-09-13)
 * ---------------------------------------------------------------------------
 * `getVeiculoById` engole a falha do Supabase e cai na contingência, que
 * devolve `[]` em produção — daí o `notFound()`. Na mesma pane a leitura do
 * estoque ESTOURA `EstoqueIndisponivelError`, e na primeira versão desta
 * página isso virava 500 sem moldura, porque não há `error.tsx` em `src/app`
 * (e não vai haver: decisão de 13/09). Antes do #70 a mesma URL dava 404.
 *
 * Agora a página captura SÓ `EstoqueIndisponivelError` e responde com título,
 * a primeira frase do texto e o "ver todo o estoque". A segunda frase fica de
 * fora de propósito: ela anuncia "abaixo, uma amostra do pátio", e na pane não
 * há amostra — página que afirma o que não mostra é a T3. Qualquer outra
 * exceção sobe: defeito de programação não se passa por endereço torto.
 *
 * A exceção não entra no cache, então a requisição seguinte tenta de novo. Com
 * item velho no cache o Next serve o velho e engole a falha da revalidação — a
 * versão de pane só aparece com o cache frio.
 *
 * ---------------------------------------------------------------------------
 * O que esta página NÃO resolve
 * ---------------------------------------------------------------------------
 * **O lead daqui não se distingue do lead de hub.** `canal` é `"Encomenda"`
 * nos dois, porque quem o escreve é `montarEncomenda`, compartilhado. O que
 * separa hoje é o `caminho`, que leva o endereço morto que a pessoa abriu —
 * `/carros/kia/picanto/kia-picanto-ex3-999999999`, e não o hub. A régua da
 * casa para superfície nova de lead é o `canal`; mudá-lo mexe nas outras
 * superfícies e é decisão do dono, não deste PR.
 */

const TITULO = "Não encontramos este veículo";

/* A frase se divide em duas porque só a primeira vale sempre. A segunda
   descreve a grade que vem abaixo, e já mudou junto com ela: falava em "o que
   entrou por último" desde a versão que ordenava por chegada — ordem que
   `patioEmDestaque` recusa, com o dado, no próprio arquivo que monta essa
   grade. Página que afirma duas coisas sobre a mesma tela é a T3, e foi assim
   que a primeira correção desta copy reabriu o defeito que ela fechava. Na
   pane não há grade, e a segunda frase fica de fora. */
const TEXTO =
  "Este endereço não abre nenhuma ficha do nosso estoque — costuma ser link antigo ou endereço incompleto.";
const TEXTO_DA_AMOSTRA = "Abaixo, uma amostra do pátio de hoje e as trilhas para o resto dele.";

const TRILHA = [
  { rotulo: "Home", href: "/" },
  { rotulo: "Estoque", href: "/estoque" },
];

/** O recorte guardado, ou `null` na pane do estoque — e só nela. */
async function lerRecorte(): Promise<RecorteDoNaoEncontrado | null> {
  try {
    return await recorteDoNaoEncontrado();
  } catch (erro) {
    if (erro instanceof EstoqueIndisponivelError) return null;
    throw erro;
  }
}

export default async function FichaNaoEncontrada() {
  const recorte = await lerRecorte();

  if (!recorte) {
    return (
      <PaginaDeEstoque trilha={TRILHA} titulo={TITULO} veiculos={[]} textoSemEstoque={TEXTO} />
    );
  }

  return (
    <PaginaDeEstoque
      trilha={TRILHA}
      titulo={TITULO}
      veiculos={[]}
      textoSemEstoque={`${TEXTO} ${TEXTO_DA_AMOSTRA}`}
      /* O índice atravessa a fronteira do client component, e por isso chega
         já recortado pelo `recorteDoNaoEncontrado`: slug, nome e contagem.
         Prop de client component é payload público — foi assim que
         `preco_compra` saiu no HTML do `/estoque`. */
      encomenda={<EncomendaDaFichaPerdida marcas={recorte.marcas} />}
      alternativos={recorte.patio}
      rotuloAlternativos="Do pátio de hoje, em todas as faixas"
      blocos={[
        {
          titulo: "Por faixa de preço",
          links: FAIXAS_DE_PRECO.map((f) => ({ rotulo: f.nome, href: `/estoque/${f.slug}` })),
        },
        { titulo: "Por carroceria", links: recorte.carrocerias },
        { titulo: "Marcas em estoque", links: recorte.marcasComEstoque },
      ]}
    />
  );
}
