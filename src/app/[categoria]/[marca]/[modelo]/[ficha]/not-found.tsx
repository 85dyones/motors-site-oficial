import PaginaDeEstoque from "../../../../../components/modernist/PaginaDeEstoque";
import SaidaDaFichaSumida from "../../../../../components/SaidaDaFichaSumida";
import { getEstoque } from "../../../../../lib/supabase";
import { getCachedSettings } from "../../../../../lib/settings";
import { linkWhatsApp } from "../../../../../lib/whatsapp";

/**
 * A ficha que não existe — e por que ela não podia continuar sendo o 404 do
 * Next em inglês.
 *
 * ---------------------------------------------------------------------------
 * O que estava no ar até 2026-09-10
 * ---------------------------------------------------------------------------
 * `notFound()` caía no 404 padrão do Next: *"404: This page could not be
 * found."*, em `system-ui`, em inglês, sem estilo — e, como ele renderiza
 * DENTRO do layout raiz, com o cabeçalho e o rodapé da Motors Store em volta.
 * A moldura da marca com um erro genérico em inglês no meio.
 *
 * O `noindex` e o metadata próprio ("Veículo não encontrado | Motors Store")
 * já existiam e continuam: o Next injeta `noindex` sozinho em toda resposta
 * 404, e o `generateMetadata` da rota já tratava este caso.
 *
 * ---------------------------------------------------------------------------
 * Quem cai aqui — e quem NÃO cai
 * ---------------------------------------------------------------------------
 * Carro **vendido não passa por aqui**. `vendido` é coluna de
 * `estoque_motors`, nada apaga a linha, e `getVeiculoById` não filtra por ela:
 * a ficha segue viva, responde 200 com o selo "VENDIDO" e os similares por
 * `CARENCIA_VENDIDO_DIAS`, e só depois vira 301 para o hub do modelo (ver
 * `lib/publicacao.ts`). Isso foi verificado no código em 2026-09-10, contra a
 * suposição de que a janela entre a venda e a recarga do feed levaria clique
 * pago para o 404 — não leva.
 *
 * Quem cai aqui é URL truncada por app de mensagem, link velho para um id que
 * nunca existiu e erro de digitação. Volume menor, e não pago — mas a regra
 * vale por si: **nenhuma página do site termina sem saída.**
 *
 * ---------------------------------------------------------------------------
 * Por que os carros oferecidos NÃO são "similares"
 * ---------------------------------------------------------------------------
 * Similar a quê? O veículo que o visitante queria não existe — é por isso que
 * ele está nesta página. O único anexo disponível seria o slug da URL, que é
 * justamente a entrada não confiável que o trouxe até aqui. Cascatear
 * carroceria e faixa a partir de uma marca digitada errada devolve um
 * carrossel da marca errada com cara de acerto.
 *
 * Então o que se oferece é o estoque de hoje, dito com essas palavras. A
 * cascata de verdade (`escolherSimilares`) continua onde ela tem âncora: na
 * ficha do carro vendido, que tem o veículo real em mãos.
 *
 * ---------------------------------------------------------------------------
 * Zero componente novo, com uma exceção que a plataforma obriga
 * ---------------------------------------------------------------------------
 * `PaginaDeEstoque` com a grade vazia já desenha os quatro pedaços pedidos:
 * "AVISE-ME QUANDO ENTRAR", os alternativos como card de verdade com preço e
 * link, "VER TODO O ESTOQUE" e a trilha. A única peça nova é
 * `SaidaDaFichaSumida`, e ela existe porque `not-found.tsx` não recebe
 * `params` — está justificado no cabeçalho dela.
 */

/** Quantos carros oferecer. Menos que isso não é vitrine; mais empurra a saída para baixo da dobra. */
const QUANTOS = 6;

/**
 * O estoque, ou uma lista vazia.
 *
 * `getEstoque` lança `EstoqueIndisponivelError` quando a leitura falha, e para
 * a vitrine isso está certo: pátio vazio ali é MENTIRA, e a decisão do projeto
 * é derrubar a página em vez de mentir (ver `lib/supabase.ts`).
 *
 * Aqui a régua se inverte. Esta página já é a resposta a um erro; deixá-la
 * estourar troca um 404 tratado por um 500 — o visitante que veio de um link
 * torto passaria a ver a tela de falha do site inteiro. E ficar sem
 * alternativas não mente: o "avise-me" e os caminhos de volta continuam de pé,
 * que é o que impede a página de ser um beco.
 *
 * O aviso não se perde: quem lança já chamou `registrarFalha("parada",
 * "estoque-indisponivel", …)` antes de lançar, e o WhatsApp recebe do mesmo
 * jeito. O que se engole aqui é a EXCEÇÃO, não o alerta.
 */
async function estoqueOuVazio() {
  try {
    return await getEstoque();
  } catch {
    return [];
  }
}

export default async function FichaNaoEncontrada() {
  const [disponiveis, { companySettings }] = await Promise.all([
    estoqueOuVazio(),
    getCachedSettings(),
  ]);

  const noEstoqueHoje = disponiveis.slice(0, QUANTOS);

  const avisarHref = linkWhatsApp(
    companySettings,
    "Olá! Cheguei num anúncio que saiu do ar no site e quero ser avisado quando entrar algo parecido.",
  );

  return (
    <PaginaDeEstoque
      trilha={[
        { rotulo: "Home", href: "/" },
        { rotulo: "Estoque", href: "/estoque" },
      ]}
      titulo="Este anúncio saiu do ar"
      introducao={[
        "O endereço que você abriu não corresponde a nenhum veículo do nosso estoque. " +
          "Pode ter sido um link cortado pelo aplicativo de mensagem, ou um anúncio antigo que já se encerrou.",
      ]}
      /* Grade VAZIA de propósito: é a condição que faz `PaginaDeEstoque`
         desenhar o bloco de saída — avisar, alternativas e catálogo. Com a
         grade cheia ele não desenha nada, e com razão: empurraria a saída para
         baixo do que a pessoa veio ver. */
      veiculos={[]}
      alternativos={noEstoqueHoje}
      rotuloAlternativos="No estoque hoje"
      avisarHref={avisarHref}
      conteudo={<SaidaDaFichaSumida />}
      posicaoDoConteudo="depois-da-grade"
      contagem={false}
    />
  );
}
