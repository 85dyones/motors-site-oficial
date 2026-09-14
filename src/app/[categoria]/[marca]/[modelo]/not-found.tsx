import EncomendaDaFichaPerdida from "../../../../components/EncomendaDaFichaPerdida";
import NaoEncontradoNoEstoque from "../../../../components/NaoEncontradoNoEstoque";

/**
 * O modelo que não existe — `notFound()` do hub de modelo.
 *
 * ---------------------------------------------------------------------------
 * O defeito
 * ---------------------------------------------------------------------------
 * `/carros/volkswagen/modeloinexistente` caía no 404 de fábrica do Next: em
 * inglês, sem link, dentro da moldura do site — a R5, o mesmo defeito que o #70
 * fechou para a ficha. Status e metadata não mudam: o `notFound()` e o "Modelo
 * não encontrado | Motors Store", com `index: false`, continuam em `page.tsx`.
 * Esta página troca só o corpo.
 *
 * ---------------------------------------------------------------------------
 * Quem cai aqui
 * ---------------------------------------------------------------------------
 * O `dados` nulo de `[modelo]/page.tsx`: modelo que nunca passou pelo estoque
 * daquela marca — e, pelo mesmo `resolver`, marca desconhecida e categoria
 * inválida. Modelo conhecido e ZERADO não cai: responde 200 com o hub vazio. O
 * texto fala do endereço pela mesma razão da marca: nem todo caminho que chega
 * aqui tem uma marca de verdade.
 *
 * ---------------------------------------------------------------------------
 * O bloco do cliente lê o caminho — e só a marca
 * ---------------------------------------------------------------------------
 * `EncomendaDaFichaPerdida` com `nivel="modelo"`: se a marca tem carro hoje,
 * sai o link "Ver … no estoque" para o hub dela; se está zerada, só a marca vai
 * ao formulário. O modelo digitado nunca é usado — o hub dele acabou de dizer
 * 404. Como na ficha, nada da R5 depende desse bloco — e nada desta página sai
 * no HTML de um `notFound()`: a resposta é a casca de erro do Next, e o
 * navegador desenha tudo pelo payload (ver o docblock de `not-found.tsx` da
 * ficha).
 */
export default async function ModeloNaoEncontrado() {
  // Chamada, e não `<NaoEncontradoNoEstoque />`: a nota está no componente.
  return NaoEncontradoNoEstoque({
    titulo: "Não encontramos este modelo",
    texto: "Este endereço não abre nenhuma página de modelo.",
    trilha: [
      { rotulo: "Home", href: "/" },
      { rotulo: "Estoque", href: "/estoque" },
    ],
    encomenda: (marcas) => <EncomendaDaFichaPerdida marcas={marcas} nivel="modelo" />,
  });
}
