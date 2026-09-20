import EncomendaDaFichaPerdida from "../../../components/EncomendaDaFichaPerdida";
import NaoEncontradoNoEstoque from "../../../components/NaoEncontradoNoEstoque";

/**
 * A guia que não existe — `notFound()` de `guias/[slug]/page.tsx`.
 *
 * Medido em 2026-09-20: `/guias/slug-que-nao-existe` respondia com o 404 de
 * fábrica do Next, em inglês e sem link. As 26 peças publicadas são das
 * páginas mais linkadas de fora (campanha, WhatsApp, buscador), e slug antigo
 * ou digitado errado é o caso comum — não o raro.
 *
 * A trilha aponta para `/guias` porque é de lá que a pessoa quase sempre vem,
 * e é lá que está a peça que ela queria. O resto do corpo é o mesmo da casa:
 * amostra do pátio, blocos e o formulário, que é o que impede o endereço morto
 * de terminar em nada.
 *
 * Status e metadata seguem em `page.tsx` — ver a nota no `not-found.tsx` da
 * raiz sobre por que o 404 continua 404.
 */
export default async function GuiaNaoEncontrada() {
  // Chamada, e não `<NaoEncontradoNoEstoque />`: a nota está no componente.
  return NaoEncontradoNoEstoque({
    titulo: "Não encontramos esta guia",
    texto: "Este endereço não abre nenhuma guia.",
    textoDaAmostra: "Veja todas em /guias — ou o que está no pátio hoje:",
    trilha: [
      { rotulo: "Home", href: "/" },
      { rotulo: "Guias", href: "/guias" },
    ],
    encomenda: (marcas) => <EncomendaDaFichaPerdida marcas={marcas} nivel="marca" />,
  });
}
