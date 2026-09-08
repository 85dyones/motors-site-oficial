import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings } from "../src/types";
import type { Guia } from "../src/lib/guias";
import { RESUMO_DA_SECAO, TITULO_SEO_DA_SECAO } from "../src/lib/guias";

/**
 * O cabeçalho editável de `/guias`, do banco até o HTML servido.
 *
 * O dono pediu em 07/09: *"preciso ser capaz de editar o texto geral no painel,
 * além de editar e escrever novos guias"*. Aqui o banco é OVERRIDE — campo
 * vazio volta ao texto do código —, e é essa regra que o arquivo guarda.
 *
 * Por que o teste RENDERIZA a página em vez de só chamar a lib: foi o que as
 * duas revisões de 07/09 cobraram. A primeira derrubou uma trava que afirmava
 * sobre o dado e nunca sobre o uso — uma linha no componente apagava a entrega
 * e a suíte inteira ficava verde. Uma lib que resolve certo e uma página que
 * ignora a lib passam num teste de lib.
 */

const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

const GUIA: Guia = {
  slug: "guia-de-teste",
  titulo: "Um guia de teste",
  tituloSeo: "Um guia de teste | Motors Store",
  descricao: "Descrição do guia de teste.",
  publicadoEm: "2026-09-05T09:00:00-03:00",
  atualizadoEm: "2026-09-06T09:00:00-03:00",
  sobre: [],
  corpo: [{ titulo: "Seção", paragrafos: ["Um parágrafo."] }],
  faq: [],
  saida: { rotulo: "Ver a garantia", href: "/garantia", apoio: "Motor e câmbio." },
};

/**
 * O que a tabela devolve nesta rodada. Cada teste ajusta antes de renderizar.
 *
 * `null` = linha ausente (o estado normal: a migração entrega a tabela VAZIA de
 * propósito, para não existir uma segunda cópia do texto do código).
 * `erro` = leitura falhou, que é diferente de "não tem linha".
 */
let linha: { titulo_seo: string | null; resumo: string | null } | null = null;
let erro: { code?: string; message: string } | null = null;

/**
 * O dublê RESPEITA a tabela, as colunas e o filtro.
 *
 * A revisão de 07/09 mostrou o custo de ignorá-los: trocar `.eq("secao","guias")`
 * por `"guia"` em `secaoDeGuias` deixava a suíte inteira verde, e em produção
 * `/guias` nunca acharia a linha — o painel diria "salvo, já está no ar" e a
 * página mostraria o texto do código para sempre. O mesmo com um alias no
 * `select`.
 *
 * Um dublê mais permissivo que o Postgres não é dublê: é um espelho de quem o
 * escreveu.
 */
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: (tabela: string) => ({
      select: (colunas: string) => ({
        eq: (coluna: string, valor: string) => ({
          maybeSingle: async () => {
            const certo =
              tabela === "cabecalho_dos_guias" &&
              coluna === "secao" &&
              valor === "guias" &&
              colunas.includes("titulo_seo") &&
              colunas.includes("resumo") &&
              !colunas.includes(" as ");
            // Filtro que não casa devolve VAZIO, não erro — é o que o PostgREST
            // faz, e é o que torna o defeito silencioso em produção.
            return certo ? { data: linha, error: erro } : { data: null, error: erro };
          },
        }),
      }),
    }),
  },
}));

vi.mock("../src/lib/settings", () => ({
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));

vi.mock("../src/lib/guiasDoBanco", () => ({
  listarGuiasPublicados: async () => [GUIA],
  buscarGuiaPublicado: async () => GUIA,
  GuiasIndisponiveisError: class extends Error {},
}));

beforeEach(() => {
  linha = null;
  erro = null;
});

async function indice(): Promise<string> {
  const { default: GuiasPage } = await import("../src/app/guias/page");
  return renderToStaticMarkup(await GuiasPage());
}

async function tituloDaAba(): Promise<string> {
  const { generateMetadata } = await import("../src/app/guias/page");
  return String((await generateMetadata()).title);
}

/** O parágrafo sob o `<h1>`, sem as tags. */
function paragrafoServido(html: string): string {
  const p = html.match(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/);
  expect(p, "o índice precisa ter um parágrafo logo depois do <h1>").not.toBeNull();
  return p![1].replace(/<[^>]+>/g, "").trim();
}

describe("sem linha no banco, o site usa o texto do código", () => {
  it("o parágrafo servido é a constante", async () => {
    expect(paragrafoServido(await indice())).toBe(RESUMO_DA_SECAO);
  });

  it("o título da aba é a constante mais a assinatura da loja", async () => {
    expect(await tituloDaAba()).toBe(`${TITULO_SEO_DA_SECAO} | Motors Store`);
  });
});

describe("com texto gravado, o site usa o do banco", () => {
  it("o parágrafo servido é o do painel", async () => {
    linha = { titulo_seo: null, resumo: "O que o dono escreveu no painel." };

    expect(paragrafoServido(await indice())).toBe("O que o dono escreveu no painel.");
  });

  it("o título da aba é o do painel, e o sufixo continua sendo da página", async () => {
    linha = { titulo_seo: "Guias de compra e venda", resumo: null };

    // O sufixo não é editável de propósito: o painel edita o assunto, não a
    // assinatura. Assim ninguém precisa lembrar de repetir o nome da loja, e
    // ninguém consegue removê-lo sem querer.
    expect(await tituloDaAba()).toBe("Guias de compra e venda | Motors Store");
  });

  it("um campo editado não arrasta o outro", async () => {
    // A queda é campo a campo. Se fosse a linha inteira, editar só o parágrafo
    // faria o `<title>` cair no padrão sem ninguém pedir.
    linha = { titulo_seo: null, resumo: "Só o parágrafo mudou." };

    expect(paragrafoServido(await indice())).toBe("Só o parágrafo mudou.");
    expect(await tituloDaAba()).toBe(`${TITULO_SEO_DA_SECAO} | Motors Store`);
  });
});

describe("limpar o campo volta ao automático", () => {
  // A tela grava "" quando o operador limpa, e limpar TEM de significar "volte
  // ao automático" — é o contrato de `textos_de_hub`. O gatilho da migração
  // normaliza '' e '   ' para NULO na gravação; a leitura repete a regra porque
  // linha gravada por outro caminho não pode servir título em branco na aba.
  it.each([
    ["string vazia", ""],
    ["só espaços", "   "],
  ])("%s conta como ausente", async (_caso, valor) => {
    linha = { titulo_seo: valor, resumo: valor };

    expect(paragrafoServido(await indice())).toBe(RESUMO_DA_SECAO);
    expect(await tituloDaAba()).toBe(`${TITULO_SEO_DA_SECAO} | Motors Store`);
  });
});

describe("a leitura separa 'não há override' de 'não consegui ler'", () => {
  /**
   * A raiz do defeito que levou duas rodadas para fechar.
   *
   * A mesma função serve a página pública e o painel, e os dois querem coisas
   * opostas: a página precisa CAIR NO PADRÃO em qualquer tropeço, e o painel
   * precisa SABER que tropeçou — porque lá o campo em branco não é “não há
   * texto”, é “não sei o que tem”, e as duas coisas levam a decisões diferentes
   * de quem está na frente da tela.
   *
   * Enquanto os dois desfechos colapsavam num valor só, o painel não tinha como
   * distinguir. E a mutação que os colapsa de novo passava verde na suíte
   * inteira, porque o teste da carga mocka esta função — ela era a única ponta
   * sem trava própria.
   */
  it("erro de verdade devolve `lido: false`, com o motivo", async () => {
    erro = { code: "57014", message: "canceling statement due to statement timeout" };
    const { lerCabecalhoGravado } = await import("../src/lib/secaoDeGuias");

    const r = await lerCabecalhoGravado();
    expect(r.lido).toBe(false);
    expect(!r.lido && r.motivo).toContain("timeout");
  });

  it("tabela ausente devolve `lido: true` — é o ambiente antes da migração", async () => {
    // Aqui "não há override" é a VERDADE, não uma falha: a tabela nasce vazia e
    // o site roda no texto do código. Travar o painel neste caso seria impedir
    // a primeira escrita justamente no dia em que ela é possível.
    erro = { code: "PGRST205", message: "Could not find the table" };
    const { lerCabecalhoGravado } = await import("../src/lib/secaoDeGuias");

    const r = await lerCabecalhoGravado();
    expect(r.lido).toBe(true);
    expect(r.lido && r.cabecalho).toEqual({ tituloSeo: null, resumo: null });
  });

  it("leitura boa devolve `lido: true` com o que está gravado", async () => {
    linha = { titulo_seo: "Gravado", resumo: "  " };
    const { lerCabecalhoGravado } = await import("../src/lib/secaoDeGuias");

    const r = await lerCabecalhoGravado();
    // Espaços em branco continuam colapsando em nulo: é o mesmo estado
    // "automático" que o gatilho do banco impõe na gravação.
    expect(r.lido && r.cabecalho).toEqual({ tituloSeo: "Gravado", resumo: null });
  });
});

describe("falha de leitura não derruba a página", () => {
  it("cai no texto do código, e o índice continua servindo os guias", async () => {
    // Aqui o banco é OVERRIDE, e é o oposto de `guiasDoBanco`: lá falha de
    // leitura ESTOURA, porque devolver "não há guias" viraria 404 em conteúdo
    // indexado. Aqui derrubar `/guias` por um parágrafo opcional seria trocar
    // um texto por uma página fora do ar.
    erro = { code: "57014", message: "statement timeout" };

    const html = await indice();
    expect(paragrafoServido(html)).toBe(RESUMO_DA_SECAO);
    expect(html).toContain(`/guias/${GUIA.slug}`);
  });
});
