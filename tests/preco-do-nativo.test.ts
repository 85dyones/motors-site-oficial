import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAMPOS_NOSSOS,
  CAMPOS_DE_FOTO,
  CAMPOS_DE_PRECO_DO_NATIVO,
  camposGravaveis,
  extrairCamposNossos,
} from "../src/lib/estoqueEscrita";
import { ACAO_DO_CAMPO_DE_VEICULO, podeGravarCampo } from "../src/lib/permissoes";

/**
 * Reprecificar o veículo que nasceu no painel.
 *
 * O achado que originou isto: o cadastro nativo entrou (migração
 * 20260829130000) e o carro criado por ele **não podia ter o preço alterado**
 * — o editor A15 mostra preço como texto, e `preco` está fora de
 * `CAMPOS_NOSSOS`. O motivo de estar fora é bom e continua valendo para o
 * veículo do RevendaMais: o sync reescreveria a edição no ciclo seguinte, em
 * silêncio. Mas a trava do sync removeu esse motivo — e só ele — para
 * `origem = 'painel'`.
 *
 * O que estes testes protegem, nesta ordem de importância:
 *
 *  1. o preço NÃO vira gravável para veículo do feed (seria edição que some);
 *  2. a origem é lida do BANCO, nunca do corpo da requisição — senão bastaria
 *     mandar `origem:"painel"` no JSON para reprecificar um carro do sync;
 *  3. quem pode reprecificar sai da MATRIZ, não de lista embutida.
 */

const raiz = join(__dirname, "..");
const rotaItem = readFileSync(
  join(raiz, "src", "app", "api", "estoque", "[id]", "route.ts"),
  "utf-8",
);
const editor = readFileSync(
  join(raiz, "src", "components", "admin", "EditorDeVeiculo.tsx"),
  "utf-8",
);

/** O texto sem comentários — a prosa deste repo é densa e casaria com tudo. */
function codigo(fonte: string): string {
  return fonte
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("o preço só é gravável no veículo do painel", () => {
  it("veículo do sync não expõe preço à escrita", () => {
    const doSync = camposGravaveis("sync");
    expect(doSync).not.toContain("preco");
    expect(doSync).not.toContain("preco_original");
    // E o mesmo para origem ausente/desconhecida — o padrão é o mais restrito.
    expect(camposGravaveis(null)).not.toContain("preco");
    expect(camposGravaveis(undefined)).not.toContain("preco");
    expect(camposGravaveis("qualquer_coisa")).not.toContain("preco");
  });

  it("veículo do painel expõe as DUAS colunas de preço", () => {
    const doPainel = camposGravaveis("painel");
    // As duas juntas ou nenhuma: o mapper público lê `preco_original` e a
    // ordenação da vitrine lê `preco`. Uma só faria o carro sair a R$ 0 em
    // metade das superfícies.
    expect(doPainel).toContain("preco");
    expect(doPainel).toContain("preco_original");
    expect(CAMPOS_DE_PRECO_DO_NATIVO).toEqual(["preco", "preco_original"]);
  });

  it("a lista do painel é a de sempre MAIS o que só o nativo grava — nada some", () => {
    const doPainel = camposGravaveis("painel");
    for (const campo of CAMPOS_NOSSOS) {
      expect(doPainel, `o campo "${campo}" sumiu da lista do painel`).toContain(campo);
    }
    // Dois grupos entram por origem, e pelo MESMO motivo: as colunas são do
    // feed, e no veículo do RevendaMais o sync as reescreveria em silêncio.
    // `CAMPOS_DE_FOTO` juntou-se ao preço em 2026-08-30, com o storage próprio
    // (F0-p) — a soma é declarada, e não um número, para que um grupo novo
    // obrigue quem o cria a passar por aqui em vez de afrouxar a conta.
    expect(doPainel.length).toBe(
      CAMPOS_NOSSOS.length + CAMPOS_DE_PRECO_DO_NATIVO.length + CAMPOS_DE_FOTO.length,
    );
    // Sem repetição entre os grupos: campo em duas listas passaria por dois
    // gates diferentes conforme a rota.
    expect(new Set(doPainel).size).toBe(doPainel.length);
  });

  it("extrairCamposNossos descarta preço quando a origem não é painel", () => {
    const corpo = { preco: 1, preco_original: 1, descricao: "ok" };
    expect(extrairCamposNossos(corpo, "sync")).toEqual({ descricao: "ok" });
    expect(extrairCamposNossos(corpo)).toEqual({ descricao: "ok" });
    expect(extrairCamposNossos(corpo, "painel")).toEqual({
      preco: 1,
      preco_original: 1,
      descricao: "ok",
    });
  });
});

describe("a origem vem do banco, não do corpo", () => {
  it("a rota consulta `origem` em estoque_motors antes de extrair os campos", () => {
    const fonte = codigo(rotaItem);
    // Consulta a coluna...
    expect(fonte).toMatch(/\.select\(\s*["']origem["']\s*\)/);
    // ...e é o resultado dela que alimenta o extrator.
    expect(fonte).toMatch(/extrairCamposNossos\(\s*body\s*,\s*linha\?\.origem\s*\)/);
  });

  it("a rota NUNCA lê origem do corpo da requisição", () => {
    const fonte = codigo(rotaItem);
    // `body.origem`, `body["origem"]` ou desestruturação a partir do corpo
    // seriam o furo: mandar origem:"painel" no JSON reprecificaria carro do feed.
    expect(fonte).not.toMatch(/body\s*\.\s*origem/);
    expect(fonte).not.toMatch(/body\s*\[\s*["']origem["']\s*\]/);
    expect(fonte).not.toMatch(/origem\s*[,}][\s\S]{0,40}=\s*body/);
  });

  it("a consulta da origem vem ANTES da extração — ordem importa", () => {
    const fonte = codigo(rotaItem);
    const posSelect = fonte.indexOf('.select("origem")');
    const posExtrai = fonte.indexOf("extrairCamposNossos(body");
    expect(posSelect).toBeGreaterThan(-1);
    expect(posExtrai).toBeGreaterThan(posSelect);
  });
});

describe("quem reprecifica sai da matriz A17", () => {
  it("preço está mapeado na linha mais restritiva das duas de preço", () => {
    expect(ACAO_DO_CAMPO_DE_VEICULO.preco).toBe("Alterar preço acima de 5%");
    expect(ACAO_DO_CAMPO_DE_VEICULO.preco_original).toBe("Alterar preço acima de 5%");
  });

  it("Admin, Gestor e Financeiro reprecificam; Marketing não", () => {
    for (const perfil of ["admin", "gestor", "financeiro"] as const) {
      expect(podeGravarCampo(perfil, "preco"), `${perfil} deveria reprecificar`).toBe(true);
    }
    expect(podeGravarCampo("marketing", "preco")).toBe(false);
  });

  it("Comercial fica de fora enquanto não existir o fluxo de revisão", () => {
    // A matriz o põe em `revisao` para "acima de 5%", e `campoNegadoAoPerfil`
    // só aceita "faz". Quando a tela A16 existir, esta expectativa muda junto
    // — e é bom que quebre, para alguém decidir na hora.
    expect(podeGravarCampo("comercial", "preco")).toBe(false);
  });
});

describe("o editor mostra campo só no veículo do painel", () => {
  it("o input de preço é condicionado à origem E à permissão", () => {
    const fonte = codigo(editor);
    expect(fonte).toMatch(/v\.origem\s*===\s*["']painel["']\s*&&\s*podeGravar\(\s*["']preco["']\s*\)/);
  });

  it("editar o preço grava as duas colunas", () => {
    const fonte = codigo(editor);
    expect(fonte).toMatch(/set\(\s*["']preco_original["']\s*,\s*valor\s*\)/);
    expect(fonte).toMatch(/set\(\s*["']preco["']\s*,\s*valor\s*\)/);
  });

  it("o veículo do feed continua com preço em texto, não em campo", () => {
    // A contraprova: se alguém tirar a condição, o carro do RevendaMais ganha
    // um campo que o sync desfaz no ciclo seguinte — e ninguém percebe.
    const fonte = codigo(editor);
    const posCondicao = fonte.indexOf('v.origem === "painel"');
    const posTextoDoFeed = fonte.indexOf("Preço anunciado · do feed");
    expect(posCondicao).toBeGreaterThan(-1);
    expect(posTextoDoFeed).toBeGreaterThan(posCondicao);
  });
});
