import EncomendaDaFichaPerdida from "../../../components/EncomendaDaFichaPerdida";
import NaoEncontradoNoEstoque from "../../../components/NaoEncontradoNoEstoque";

/**
 * A marca que não existe — `notFound()` do hub de marca.
 *
 * ---------------------------------------------------------------------------
 * O defeito
 * ---------------------------------------------------------------------------
 * `/carros/marcainexistente` caía no 404 de fábrica do Next: em inglês, sem
 * link, dentro da moldura do site — a R5 do guia normativo, o mesmo defeito
 * que o #70 fechou para a ficha. Status e metadata não mudam: o `notFound()` e
 * o "Marca não encontrada | Motors Store", com `index: false`, continuam em
 * `page.tsx`. O corpo, porém, não custa só no 404: o Next renderiza este
 * arquivo em TODA página da subárvore de `[marca]`, inclusive nas que
 * respondem 200 — ver "O custo nas páginas que existem", em
 * `components/NaoEncontradoNoEstoque.tsx`.
 *
 * ---------------------------------------------------------------------------
 * Quem cai aqui
 * ---------------------------------------------------------------------------
 * O `dados` nulo de `[marca]/page.tsx`: marca que nunca passou pelo estoque
 * (`/carros/marcainexistente`) e categoria inválida — só `carros` e `motos`
 * valem, então `/foo/volkswagen` cai aqui também. Marca conhecida e ZERADA não
 * cai: responde 200 com o hub vazio, que é perene.
 *
 * Por isso o texto fala do endereço, e não da marca. Em `/foo/volkswagen`,
 * dizer que a marca nunca passou pelo estoque seria falso.
 *
 * ---------------------------------------------------------------------------
 * Lê só o primeiro segmento (14/09)
 * ---------------------------------------------------------------------------
 * O plano de 13/09 previa não ler o caminho: formulário sempre com
 * `caminho: ""` e `segmento: "carros"`. A decisão do dono de 14/09 trocou isso
 * antes de a página existir — em `/motos/…` o formulário falaria em "carro", e
 * o lead não diria de que endereço morto veio, ao contrário da ficha e do
 * modelo.
 *
 * A correção é montar o mesmo bloco deles, `EncomendaDaFichaPerdida`, com
 * `nivel="marca"` (Task 9). Nesse nível a regra pura não olha além do primeiro
 * segmento: `segmento` sai dele, `caminho` é o endereço inteiro, e a marca
 * digitada nunca vira `marca` — ela é, por definição, o que este endereço não
 * tem. Por isso `hubComEstoque` é sempre nulo aqui, e o bloco nunca linka:
 * diferente do modelo, não existe "a marca com estoque" para apontar de volta,
 * porque a marca É o que está faltando.
 *
 * Como na ficha e no modelo, nada da R5 (título, texto, amostra, blocos,
 * "VER TODO O ESTOQUE") depende deste bloco. E, como nelas, nada desta página
 * sai no HTML de um `notFound()`: a resposta é a casca de erro do Next, e o
 * navegador desenha tudo pelo payload (ver o docblock de `not-found.tsx` da
 * ficha).
 */
export default async function MarcaNaoEncontrada() {
  // Chamada, e não `<NaoEncontradoNoEstoque />`: a nota está no componente.
  return NaoEncontradoNoEstoque({
    titulo: "Não encontramos esta marca",
    texto: "Este endereço não abre nenhuma página de marca.",
    trilha: [
      { rotulo: "Home", href: "/" },
      { rotulo: "Estoque", href: "/estoque" },
    ],
    encomenda: (marcas) => <EncomendaDaFichaPerdida marcas={marcas} nivel="marca" />,
  });
}
