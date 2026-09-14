import EncomendaDaFichaPerdida from "../../../../../components/EncomendaDaFichaPerdida";
import NaoEncontradoNoEstoque from "../../../../../components/NaoEncontradoNoEstoque";

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
 * O corpo mora em `NaoEncontradoNoEstoque` (2026-09-13)
 * ---------------------------------------------------------------------------
 * A leitura com cache, a pane, a amostra e os blocos são os mesmos da marca e
 * do modelo que não existem, e saíram daqui para
 * `components/NaoEncontradoNoEstoque.tsx` sem mudar o que esta página
 * renderiza — a prova é `tests/ficha-sem-veiculo.test.ts`, que não mudou. Aqui
 * fica o que só a ficha sabe: a copy e o bloco de encomenda, que lê o caminho
 * de quatro segmentos.
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
export default async function FichaNaoEncontrada() {
  return NaoEncontradoNoEstoque({
    titulo: "Não encontramos este veículo",
    /* A frase se divide em duas porque só a primeira vale sempre. A segunda
       descreve a grade que vem abaixo, e já mudou junto com ela: falava em "o
       que entrou por último" desde a versão que ordenava por chegada — ordem
       que `patioEmDestaque` recusa, com o dado, no próprio arquivo que monta
       essa grade. Página que afirma duas coisas sobre a mesma tela é a T3. Na
       pane não há grade, e a segunda frase fica de fora. */
    texto:
      "Este endereço não abre nenhuma ficha do nosso estoque — costuma ser link antigo ou endereço incompleto.",
    textoDaAmostra: "Abaixo, uma amostra do pátio de hoje e as trilhas para o resto dele.",
    trilha: [
      { rotulo: "Home", href: "/" },
      { rotulo: "Estoque", href: "/estoque" },
    ],
    encomenda: (marcas) => <EncomendaDaFichaPerdida marcas={marcas} />,
  });
}
