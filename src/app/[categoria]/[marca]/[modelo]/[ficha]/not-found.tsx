import PaginaDeEstoque from "../../../../../components/modernist/PaginaDeEstoque";
import EncomendaDaFichaPerdida from "../../../../../components/EncomendaDaFichaPerdida";
import { indiceDeMarcas, patioEmDestaque } from "../../../../../lib/fichaPerdida";
import {
  FAIXAS_DE_PRECO,
  hubsDeCarroceria,
  hubsDeMarca,
  recortesDoEstoque,
} from "../../../../../lib/hubsDeEstoque";

/**
 * A ficha que não existe — `notFound()` da rota do veículo.
 *
 * ---------------------------------------------------------------------------
 * O que havia aqui antes: nada
 * ---------------------------------------------------------------------------
 * Não havia `not-found.tsx` em branch nenhum do repositório, então a rota caía
 * no 404 de fábrica do Next. Verificado em produção em 2026-09-11:
 *
 *     curl -s https://motorsstore.com.br/carros/volkswagen/nivus/…-999999999
 *     → 404 · "404: This page could not be found"
 *
 * Em inglês, em system-ui, sem link nenhum — dentro do cabeçalho e do rodapé
 * da marca, que renderizam em volta. Esta página troca só o CORPO: status,
 * metadata e o resto do comportamento da rota ficam onde estavam.
 *
 * O metadata continua saindo de `generateMetadata`, na rota ("Veículo não
 * encontrado | Motors Store"). Uma ressalva medida, para quem vier atrás:
 * ele chega pelo streaming de metadata do Next, no payload RSC — o `<title>`
 * do primeiro HTML ainda é o padrão do layout ("Motors Store | Fora da
 * Curva"), e o título certo entra depois. Com 404 no status a diferença não
 * tem custo de busca; virar 200 nesta rota, algum dia, muda isso.
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
 * Esse formulário — e só ele — chega ao navegador DEPOIS, pelo cliente:
 * `usePathname` não sobrevive ao prerender. Tudo o que segura a R5 (título,
 * grade do pátio, recortes, "ver todo o estoque") sai daqui, do servidor. A
 * medição está no docblock de `EncomendaDaFichaPerdida`.
 *
 * ---------------------------------------------------------------------------
 * O que esta página passou a custar, medido
 * ---------------------------------------------------------------------------
 * `recortesDoEstoque` são DUAS leituras de `estoque_motors` com `select *`:
 * ~489 KB cada, ~977 KB por render. É o mesmo custo de qualquer hub — a
 * diferença é o espaço de endereços. Os 103 hubs são finitos; caminho falso é
 * ilimitado, e com ISR de 1 hora cada caminho inédito rende uma vez. Contra o
 * teto de 5 GB do Supabase free, da ordem de 5 mil caminhos distintos no mês
 * consomem a cota. Antes deste arquivo, a 404 custava zero.
 *
 * Fica registrado, e não resolvido: `getEstoque` não tem cache em lugar nenhum
 * do projeto, e criar um só para esta rota resolveria o sintoma no lugar
 * errado. Se o egress apertar, o conserto é a leitura, não a página.
 *
 * ---------------------------------------------------------------------------
 * Duas coisas que esta página NÃO resolve
 * ---------------------------------------------------------------------------
 * **Pane do Supabase virou 500, e antes era 404.** `getVeiculoById` engole a
 * falha e cai na contingência, que devolve `[]` em produção — daí o
 * `notFound()`. Aí esta página chama `recortesDoEstoque()`, que na mesma pane
 * ESTOURA `EstoqueIndisponivelError`, e não há `error.tsx` em `src/app`. É a
 * troca coerente com a decisão de 2026-09 ("leitura que falha PARA a página, em
 * vez de fingir pátio vazio"), mas é uma troca, e ninguém a tinha escrito.
 *
 * **O lead daqui não se distingue do lead de hub.** `canal` é `"Encomenda"`
 * nos dois, porque quem o escreve é `montarEncomenda`, compartilhado. O que
 * separa hoje é o `caminho`, que leva o endereço morto que a pessoa abriu —
 * `/carros/kia/picanto/kia-picanto-ex3-999999999`, e não o hub. A régua da
 * casa para superfície nova de lead é o `canal`; mudá-lo mexe nas outras
 * superfícies e é decisão do dono, não deste PR.
 */
export default async function FichaNaoEncontrada() {
  const { historico, disponiveis } = await recortesDoEstoque();

  const hubs = [
    ...hubsDeMarca(historico, disponiveis, "carros"),
    ...hubsDeMarca(historico, disponiveis, "motos"),
  ];

  /* O índice atravessa a fronteira do client component, então sai daqui já
     recortado: `slug` e `nome`. `HubDeMarca` carrega `Veiculo[]` em dois
     níveis, e prop de client component é payload público — foi assim que
     `preco_compra` saiu no HTML do `/estoque`. */
  const marcas = indiceDeMarcas(hubs);

  /* Seis, e amostrados ao longo do preço.

     O TETO existe porque despejar o pátio inteiro transforma a 404 num segundo
     `/estoque`, e boa parte de quem cai aqui veio de anúncio clicando num carro
     específico. A AMOSTRA existe porque `disponiveis` vem de `getEstoque`, que
     ordena por `preco desc`: sem reordenar, a página abria com os seis carros
     mais caros do pátio. As duas medições estão em `patioEmDestaque`, inclusive
     a que derrubou a correção óbvia (ordenar por chegada).

     A spec do pacote (`conteudo-seo/pacote/produto/02-not-found-ficha.md`) pede
     "de 4 a 6 veículos similares", com cascata de carroceria e faixa. Ficou o
     teto; a régua de semelhança, não — ela parte do veículo da página, e esta
     página existe justamente quando não há veículo. */
  const patio = patioEmDestaque(disponiveis, 6);

  const carrocerias = hubsDeCarroceria(historico, disponiveis).filter(
    (c) => c.veiculos.length > 0,
  );
  const marcasComEstoque = hubs.filter((h) => h.veiculos.length > 0);

  return (
    <PaginaDeEstoque
      trilha={[
        { rotulo: "Home", href: "/" },
        { rotulo: "Estoque", href: "/estoque" },
      ]}
      titulo="Não encontramos este veículo"
      veiculos={[]}
      /* A frase descreve a grade que vem abaixo, e por isso mudou junto com
         ela: falava em "o que entrou por último" desde a versão que ordenava
         por chegada — ordem que `patioEmDestaque` recusa, com o dado, no
         próprio arquivo que monta essa grade. Página que afirma duas coisas
         sobre a mesma tela é a T3, e foi assim que a primeira correção desta
         copy reabriu o defeito que ela fechava. */
      textoSemEstoque="Este endereço não abre nenhuma ficha do nosso estoque — costuma ser link antigo ou endereço incompleto. Abaixo, uma amostra do pátio de hoje e as trilhas para o resto dele."
      encomenda={<EncomendaDaFichaPerdida marcas={marcas} />}
      alternativos={patio}
      rotuloAlternativos="Do pátio de hoje, em todas as faixas"
      blocos={[
        {
          titulo: "Por faixa de preço",
          links: FAIXAS_DE_PRECO.map((f) => ({
            rotulo: f.nome,
            href: `/estoque/${f.slug}`,
          })),
        },
        {
          titulo: "Por carroceria",
          links: carrocerias.map((c) => ({
            rotulo: c.nome,
            href: `/estoque/${c.slug}`,
            total: c.veiculos.length,
          })),
        },
        {
          titulo: "Marcas em estoque",
          links: marcasComEstoque.map((m) => ({
            rotulo: m.nome,
            href: `/${m.segmento}/${m.slug}`,
            total: m.veiculos.length,
          })),
        },
      ]}
    />
  );
}
