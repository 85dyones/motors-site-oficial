import EncomendaDaFichaPerdida from "../../../components/EncomendaDaFichaPerdida";
import NaoEncontradoNoEstoque from "../../../components/NaoEncontradoNoEstoque";

/**
 * O destaque que não existe — `notFound()` de `destaques/[tag]/page.tsx`.
 *
 * Medido em 2026-09-20: caía no 404 de fábrica do Next. Destaque é campanha:
 * a tag nasce para um feirão, vive algumas semanas e sai. O anúncio, o post e
 * o print no WhatsApp continuam circulando depois — este é o endereço que mais
 * sobrevive ao próprio conteúdo em todo o site.
 *
 * Por isso a saída é a vitrine, e não a home: quem clicou num destaque que
 * acabou estava atrás de carro, não de institucional.
 *
 * Status e metadata seguem em `page.tsx` — ver a nota no `not-found.tsx` da
 * raiz sobre por que o 404 continua 404.
 */
export default async function DestaqueNaoEncontrado() {
  // Chamada, e não `<NaoEncontradoNoEstoque />`: a nota está no componente.
  return NaoEncontradoNoEstoque({
    titulo: "Este destaque não está no ar",
    texto: "A seleção deste endereço saiu, ou nunca existiu.",
    textoDaAmostra: "O que está no pátio hoje:",
    trilha: [
      { rotulo: "Home", href: "/" },
      { rotulo: "Estoque", href: "/estoque" },
    ],
    encomenda: (marcas) => <EncomendaDaFichaPerdida marcas={marcas} nivel="marca" />,
  });
}
