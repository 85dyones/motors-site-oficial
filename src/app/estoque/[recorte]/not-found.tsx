import EncomendaDaFichaPerdida from "../../../components/EncomendaDaFichaPerdida";
import NaoEncontradoNoEstoque from "../../../components/NaoEncontradoNoEstoque";

/**
 * O recorte da vitrine que não existe — `notFound()` de
 * `estoque/[recorte]/page.tsx`.
 *
 * Medido em 2026-09-20: `/estoque/categoria-inexistente` respondia com o 404
 * de fábrica do Next. É o endereço mais fácil de errar do site inteiro: os
 * recortes entram e saem conforme a faixa de preço e a carroceria mudam, e
 * link de campanha envelhece com eles.
 *
 * Aqui o corpo da casa cai especialmente bem: os blocos que
 * `NaoEncontradoNoEstoque` monta são exatamente a lista de recortes VÁLIDOS
 * de hoje — faixa de preço, carroceria e marcas com estoque. Quem errou o
 * recorte vê, na mesma tela, quais existem.
 *
 * Status e metadata seguem em `page.tsx` — ver a nota no `not-found.tsx` da
 * raiz sobre por que o 404 continua 404.
 */
export default async function RecorteNaoEncontrado() {
  // Chamada, e não `<NaoEncontradoNoEstoque />`: a nota está no componente.
  return NaoEncontradoNoEstoque({
    titulo: "Não encontramos este recorte",
    texto: "Este endereço não abre nenhum recorte da vitrine.",
    textoDaAmostra: "Os recortes que existem hoje estão logo abaixo:",
    trilha: [
      { rotulo: "Home", href: "/" },
      { rotulo: "Estoque", href: "/estoque" },
    ],
    encomenda: (marcas) => <EncomendaDaFichaPerdida marcas={marcas} nivel="marca" />,
  });
}
