import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import { PAGINAS_GEO, type PaginaGeo } from "../src/lib/paginasGeo";

/**
 * Quem MONTA o "COMO CHEGAR" — a camada acima do componente.
 *
 * O componente tem guarda própria: o `href`, o `onClick`, a aba nova, o `null`
 * sem endereço. Faltava o outro lado, que é onde ele entra no site.
 * `PaginaGeoView` é o único lugar do repositório que monta o botão — um
 * `grep -rn LinkComoChegar src/` devolve o arquivo dele e esta única chamada —
 * e a montagem não tinha ninguém olhando.
 *
 * Três mutações em `src/components/PaginaGeoView.tsx` passavam com
 * `tsc --noEmit` limpo e a suíte inteira verde:
 *
 *  - apagar a prop `acao={<LinkComoChegar …/>}`: no `PaginaDeEstoque` ela é
 *    `acao?: ReactNode`, então sumir com ela compila. O botão desaparece das
 *    páginas de bairro todas de uma vez;
 *  - `endereco=""`: o componente devolve `null` por decisão própria — melhor
 *    não existir do que existir levando a lugar nenhum. É por ser um
 *    comportamento CORRETO dele que o botão some sem erro, sem log e sem
 *    vermelho em lugar nenhum;
 *  - `origem` numa string fixa: as páginas passam a reportar o mesmo
 *    `directions_source`, e o relatório deixa de separar Curitiba de Bacacheri.
 *
 * O que morre nas duas primeiras não é a entrega da semana: é o
 * `click_directions`, que a `TRACKING_SPEC.md` põe como conversão SECUNDÁRIA no
 * Google Ads e que o docblock do componente chama de "a única fonte possível do
 * evento". Sem o botão montado o evento para de existir em produção, e some da
 * conta de anúncios sem nada acusar.
 *
 * `PaginaGeoView` é server component e não usa hook nenhum: dá para chamá-lo
 * direto e ler a árvore que devolve, sem jsdom. Do banco para fora é o que
 * precisa de mock — o CTA não depende da grade, e o teste exige que continue
 * assim.
 */

const ENDERECO = "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350";

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: ENDERECO,
  hours: "Seg a sex 8h30-18h30",
  instagram: "",
  facebook: "",
  cnpj: "",
};

const pushComoChegar = vi.fn();

// Só o `pushComoChegar` é trocado. `ContagemDeEstoque`, que esta mesma página
// monta, importa `pushContagemDeEstoque` do módulo pelo nome — um factory que
// devolvesse apenas um dos dois quebraria o import antes do primeiro teste.
vi.mock("../src/lib/dataLayer", async (original) => {
  const real = await original<typeof import("../src/lib/dataLayer")>();
  return { ...real, pushComoChegar: (origem: string) => pushComoChegar(origem) };
});

// `lib/settings` chama `unstable_cache` e abre cliente do Supabase já no
// import. Nada disso diz respeito ao botão; o que importa é que o endereço
// venha DAQUI, e não de um literal no meio do JSX.
vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));

// Do estoque sai só o acesso ao banco: `recortesDoEstoque`, `hubsDeMarca` e
// `hubsDeCarroceria` continuam os de verdade, rodando sobre grade vazia.
vi.mock("../src/lib/supabase", async (original) => {
  const real = await original<typeof import("../src/lib/supabase")>();
  return { ...real, getEstoque: async () => [] };
});

/** O elemento `<a>` que o botão devolve — ou `null`, quando ele se apaga. */
type Ancora = { props: Record<string, unknown> } | null;

/**
 * Todo elemento da árvore, inclusive os que viajam DENTRO de uma prop.
 *
 * O botão não é filho de ninguém: chega ao `PaginaDeEstoque` pela prop `acao`.
 * Uma varredura só por `children` não acharia o que este arquivo guarda.
 */
function todosOsElementos(
  no: unknown,
  achados: ReactElement<Record<string, unknown>>[] = [],
): ReactElement<Record<string, unknown>>[] {
  if (typeof no !== "object" || no === null) return achados;
  if (Array.isArray(no)) {
    for (const item of no) todosOsElementos(item, achados);
    return achados;
  }
  if (!isValidElement<Record<string, unknown>>(no)) return achados;
  achados.push(no);
  for (const valor of Object.values(no.props)) todosOsElementos(valor, achados);
  return achados;
}

/** Os `LinkComoChegar` que a página de fato monta. */
async function botoesMontados(pagina: PaginaGeo) {
  const { default: PaginaGeoView } = await import("../src/components/PaginaGeoView");
  const { default: LinkComoChegar } = await import("../src/components/LinkComoChegar");
  const arvore = await PaginaGeoView({ pagina });
  return todosOsElementos(arvore).filter((el) => el.type === LinkComoChegar);
}

/** O botão montado — falha alto quando não há nenhum, que é a mutação nº 1. */
async function botaoMontado(pagina: PaginaGeo) {
  const [botao] = await botoesMontados(pagina);
  if (!botao) throw new Error(`nenhum LinkComoChegar montado em /${pagina.slug}`);
  return botao;
}

/**
 * O que o botão renderiza COM AS PROPS QUE A PÁGINA DEU.
 *
 * É o ponto do arquivo: a mutação mora na chamada, não no componente, e só
 * chamando com as props reais dá para ver o `null` que o `endereco=""` produz.
 * `renderToStaticMarkup` não dispara evento, então o `onClick` é lido do
 * elemento devolvido.
 */
async function ancoraDaPagina(pagina: PaginaGeo): Promise<Ancora> {
  const { default: LinkComoChegar } = await import("../src/components/LinkComoChegar");
  const botao = await botaoMontado(pagina);
  const props = botao.props as unknown as { endereco: string; origem: string };
  return LinkComoChegar(props) as Ancora;
}

describe("o `COMO CHEGAR` continua montado nas páginas de bairro", () => {
  beforeEach(() => {
    pushComoChegar.mockClear();
  });

  for (const pagina of PAGINAS_GEO) {
    describe(`/${pagina.slug}`, () => {
      it("monta um `LinkComoChegar`, e exatamente um", async () => {
        // A mutação: apagar a prop `acao`. Compila, porque ela é opcional.
        expect(await botoesMontados(pagina)).toHaveLength(1);
      });

      it("o endereço vem das settings, não de um literal", async () => {
        const botao = await botaoMontado(pagina);

        expect(botao.props.endereco).toBe(EMPRESA.address);
      });

      it("o botão montado sai no HTML com o rótulo e a rota", async () => {
        // A mutação: `endereco=""`. O componente devolve `null` — e este é o
        // ponto do teste onde isso vira ausência VISÍVEL.
        const html = renderToStaticMarkup(await botaoMontado(pagina));

        expect(html).toMatch(/^<a /);
        expect(html).toContain("COMO CHEGAR");
        expect(html).toContain(encodeURIComponent(ENDERECO));
      });

      it("o clique dispara `click_directions` com a origem do bairro", async () => {
        // A mutação: `origem` fixa. Aqui ela derruba a página que não for a
        // escolhida; o teste seguinte derruba escolha ela qual escolher.
        const ancora = await ancoraDaPagina(pagina);
        expect(ancora).not.toBeNull();

        (ancora?.props.onClick as () => void)();

        expect(pushComoChegar).toHaveBeenCalledTimes(1);
        expect(pushComoChegar).toHaveBeenCalledWith(`geo:${pagina.slug}`);
      });
    });
  }

  it("cada página se identifica com uma origem própria", async () => {
    // Sem isto, trocar as `origem` todas pela MESMA string fixa deixaria um
    // dos testes acima verde. É o relatório por bairro que está sendo guardado.
    const origens = await Promise.all(
      PAGINAS_GEO.map(async (p) => (await botaoMontado(p)).props.origem),
    );

    expect(origens).toHaveLength(PAGINAS_GEO.length);
    expect(new Set(origens).size).toBe(PAGINAS_GEO.length);
  });
});
