import EncomendaDaFichaPerdida from "../components/EncomendaDaFichaPerdida";
import NaoEncontradoNoEstoque from "../components/NaoEncontradoNoEstoque";

/**
 * O endereço que não existe em lugar nenhum do site.
 *
 * ---------------------------------------------------------------------------
 * O buraco que este arquivo fecha
 * ---------------------------------------------------------------------------
 * Em 2026-09-20, medido em produção: `/carros/marcainexistente` já caía na
 * saída da casa — título em português, amostra do pátio, blocos de faixa e
 * carroceria, "VER TODO O ESTOQUE" e o formulário de encomenda. Mas
 * `/pagina-inventada`, `/guias/slug-que-nao-existe` e qualquer outro endereço
 * fora da subárvore de `[categoria]` caíam no 404 DE FÁBRICA do Next: a frase
 * "This page could not be found", em inglês, sem um único link.
 *
 * O motivo era simples e invisível: `not-found.tsx` só vale para a subárvore
 * onde está, e existiam três — marca, modelo e ficha — mas nenhum na RAIZ.
 * Tudo o que não fosse carro caía no padrão.
 *
 * Ordem do dono em 2026-09-20: *"sem 404 nunca, siga essa linha, sempre temos
 * que ter algo"*. A linha é a que marca, modelo e ficha já seguiam; o que
 * faltava era ela valer para o site inteiro.
 *
 * ---------------------------------------------------------------------------
 * O status continua 404 — e é de propósito
 * ---------------------------------------------------------------------------
 * "Ter algo" é sobre o que a pessoa VÊ, não sobre o código HTTP. Responder 200
 * num endereço que não existe é o que os buscadores chamam de *soft 404*: o
 * Google passa a indexar endereço inventado, e o sinal das páginas boas dilui.
 * O mesmo raciocínio que já está em `[marca]/not-found.tsx` — "status e
 * metadata não mudam" — vale aqui.
 *
 * Quem tem endereço conhecido não chega neste arquivo: vira 301 no
 * `next.config.ts` (o catálogo velho do RevendaMais, `/carros`, `/motos`,
 * `/destaques`). Este é o fundo do poço, para o que ninguém previu — e nem
 * mesmo o fundo do poço é um beco.
 *
 * ---------------------------------------------------------------------------
 * Por que `nivel="marca"`
 * ---------------------------------------------------------------------------
 * É o único nível que não tenta ler marca nem modelo do caminho. Num endereço
 * arbitrário não há o que ler, e `contextoDaFichaPerdida` cai no `segmento`
 * padrão "carros" quando o primeiro segmento não é `carros` nem `motos` — o
 * formulário fica genérico e honesto, e ainda leva o endereço morto junto, que
 * é o que transforma um 404 em lead e diz de onde ele veio.
 */
export default async function NaoEncontrado() {
  // Chamada, e não `<NaoEncontradoNoEstoque />`: a nota está no componente.
  return NaoEncontradoNoEstoque({
    titulo: "Não encontramos esta página",
    texto: "Este endereço não abre nenhuma página do site.",
    textoDaAmostra: "Veja o que está no pátio hoje:",
    trilha: [
      { rotulo: "Home", href: "/" },
      { rotulo: "Estoque", href: "/estoque" },
    ],
    encomenda: (marcas) => <EncomendaDaFichaPerdida marcas={marcas} nivel="marca" />,
  });
}
