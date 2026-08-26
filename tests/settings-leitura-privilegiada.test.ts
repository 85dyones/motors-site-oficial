import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Quem lê `site_settings`, e com que chave.
 *
 * Desde `20260812120000_rls_leitura_de_site_settings.sql` a tabela deixou de
 * responder inteira à chave `anon` — a que vai no bundle do navegador. As
 * linhas `webhooks` (com `apiSecretToken`), `stock_overrides` (com
 * `preco_compra`) e `bank_balances` só saem para quem tem sessão ou para a
 * chave de serviço.
 *
 * Isso move o risco de lugar em vez de eliminá-lo. Antes, um `select` com a
 * anon key num caminho sem sessão funcionava; agora devolve null — e nenhum
 * desses caminhos trata null como erro. `/api/leads` mandaria o lead ao n8n sem
 * `Authorization` (disparo não-bloqueante, falha invisível) e
 * `/api/financeiro/margens/consulta` deixaria de validar o token, abrindo a
 * ficha de margem para qualquer um. Os testes abaixo travam as duas pontas: o
 * que a policy libera e quem tem direito de ler o resto.
 */

const raiz = join(__dirname, "..");
const fonteSettings = readFileSync(join(raiz, "src", "lib", "settings.ts"), "utf-8");
const migracao = readFileSync(
  join(raiz, "supabase", "migrations", "20260812120000_rls_leitura_de_site_settings.sql"),
  "utf-8"
);

/**
 * Chave devolvida por `getCachedSettings` → id da linha em `site_settings`.
 *
 * Lido do próprio `getCachedSettings` em vez de transcrito aqui: a tradução
 * `carouselVehicleIds` ↔ `carousel_vehicles` não é adivinhável, e uma cópia
 * envelheceria calada.
 */
function chavesPorLinha(): Record<string, string> {
  const idPorVar = new Map<string, string>();
  for (const m of fonteSettings.matchAll(
    /const (\w+)Row = data\.find\(\(row\) => row\.id === "([a-z_]+)"\)/g
  )) {
    idPorVar.set(m[1], m[2]);
  }
  expect(idPorVar.size, "nenhuma linha reconhecida em getCachedSettings").toBeGreaterThan(0);

  const mapa: Record<string, string> = {};
  for (const m of fonteSettings.matchAll(/if \((\w+)Row\) (\w+) = \1Row\.data;/g)) {
    const id = idPorVar.get(m[1]);
    expect(id, `variável ${m[1]}Row atribuída sem linha correspondente`).toBeDefined();
    mapa[m[2]] = id!;
  }
  expect(Object.keys(mapa).length).toBe(idPorVar.size);
  return mapa;
}

/** Os ids que `recortePublicoDeSettings` entrega a visitante sem sessão. */
function linhasDoRecortePublico(): string[] {
  const mapa = chavesPorLinha();
  const inicio = fonteSettings.indexOf("export function recortePublicoDeSettings");
  expect(inicio, "recortePublicoDeSettings não encontrada").toBeGreaterThan(-1);

  const corpo = fonteSettings.slice(inicio);
  const chaves = new Set(
    [...corpo.matchAll(/completo\.(\w+)/g)].map((m) => m[1])
  );
  return [...chaves].map((c) => {
    expect(mapa[c], `chave "${c}" do recorte público sem linha conhecida`).toBeDefined();
    return mapa[c];
  });
}

/** Os ids que a policy libera ao papel `anon`. */
function linhasLiberadasAoAnonimo(): string[] {
  const inicio = migracao.search(/CREATE POLICY "Leitura anonima do recorte publico"/i);
  const trecho = migracao.slice(inicio, migracao.indexOf(";", inicio));
  const dentroDoIn = trecho.slice(trecho.search(/USING\s*\(\s*id\s+IN\s*\(/i));
  return [...dentroDoIn.replace(/--[^\n]*/g, "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("policy do anônimo × recorte público", () => {
  it("libera exatamente o recorte público, menos stock_overrides", () => {
    // A exceção é estrutural, não esquecimento: a RLS decide por LINHA, e
    // `stock_overrides` é uma linha mista — ajuste de vitrine (`vendido`,
    // `status_tag`) no mesmo `jsonb` que `preco_compra`. Quem separa é
    // `filtrarOverridesPublicos`, no servidor, depois de ler o blob inteiro
    // com a chave de serviço.
    const esperado = linhasDoRecortePublico()
      .filter((id) => id !== "stock_overrides")
      .sort();

    expect(esperado.length).toBeGreaterThan(0);
    expect(linhasLiberadasAoAnonimo().sort()).toEqual(esperado);
  });

  it("o recorte público não passou a incluir linha sensível", () => {
    // Contraprova pelo outro lado: se alguém acrescentar `webhooks` ao recorte,
    // o teste acima passaria a exigir que a RLS o liberasse. Este falha antes.
    for (const id of ["webhooks", "bank_balances"]) {
      expect(linhasDoRecortePublico(), `${id} entrou no recorte público`)
        .not.toContain(id);
    }
  });
});

/**
 * O recorte não vale só para o GET /api/settings: qualquer página que passe
 * `stockOverrides` como prop de client component publica o objeto inteiro no
 * payload RSC do HTML. Foi assim que o `preco_compra` de um veículo apareceu
 * no código-fonte público de /estoque (2026-08-16) — a página lia
 * `getCachedSettings()` (chave de serviço) e entregava o blob cru ao
 * `Catalogo`, por fora do recorte que o GET já aplicava.
 */
describe("overrides que chegam ao navegador", () => {
  const fonteEstoque = readFileSync(
    join(raiz, "src", "app", "estoque", "page.tsx"),
    "utf-8"
  );

  it("/estoque passa o blob pelo recorte público antes do client component", () => {
    expect(fonteEstoque).toContain("recortePublicoDeSettings(settings).stockOverrides");
    expect(
      fonteEstoque,
      "o blob cru de getCachedSettings voltou a ir direto para a prop"
    ).not.toContain("normalizarStockOverrides(settings.stockOverrides)");
  });

  it("a whitelist de campos públicos não ganhou campo de custo", () => {
    const inicio = fonteSettings.indexOf("const CAMPOS_PUBLICOS_DE_OVERRIDE");
    expect(inicio, "whitelist não encontrada").toBeGreaterThan(-1);
    const lista = fonteSettings.slice(
      inicio,
      fonteSettings.indexOf("] as const", inicio)
    );
    expect(lista).not.toContain("preco_compra");
    expect(lista).not.toMatch(/"preco"/);
  });

  it("o filtro cobre o blob sem invólucro, não só o { overrides }", () => {
    // `normalizarStockOverrides` aceita as duas formas do row; se o filtro só
    // tratasse o invólucro, a forma nua atravessaria crua com `preco_compra`.
    const inicio = fonteSettings.indexOf("function filtrarOverridesPublicos");
    expect(inicio, "filtrarOverridesPublicos não encontrada").toBeGreaterThan(-1);
    const corpo = fonteSettings.slice(inicio, fonteSettings.indexOf("\n}", inicio));
    expect(corpo).toContain("blob.overrides ?? ");
  });
});

describe("getCachedSettings", () => {
  it("prefere a chave de serviço para ler a tabela", () => {
    // Roda sempre no servidor, dentro de `unstable_cache`, sem sessão. Com a
    // anon key ela perderia justamente as linhas que o painel consome.
    expect(fonteSettings).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(fonteSettings).toMatch(
      /const chaveDeLeitura = supabaseServiceKey \|\| supabaseAnonKey/
    );
    expect(fonteSettings).toContain("createClient(supabaseUrl, chaveDeLeitura");
  });

  it("avisa alto quando cai na anon key", () => {
    // Sem a chave de serviço o site fica de pé — a vitrine está no recorte
    // público — mas `webhooks` volta vazio e o lead sai sem `Authorization`.
    // A única pista seria o consultor parar de receber lead, dias depois.
    const inicio = fonteSettings.indexOf("if (!supabaseServiceKey)");
    expect(inicio, "fallback para anon sem aviso").toBeGreaterThan(-1);
    expect(fonteSettings.slice(inicio, inicio + 600)).toContain("console.warn");
  });
});

describe("caminhos sem sessão", () => {
  /**
   * Rotas que atendem quem não tem cookie de sessão: visitante do site
   * (`leads`, `avaliacao`) e o n8n com Bearer token (`margens/consulta`).
   * Nelas, `createServerSupabaseClient()` resolve para o papel `anon`.
   */
  const rotas = [
    ["leads", join("src", "app", "api", "leads", "route.ts")],
    ["avaliacao", join("src", "app", "api", "avaliacao", "route.ts")],
    ["margens/consulta", join("src", "app", "api", "financeiro", "margens", "consulta", "route.ts")],
  ] as const;

  for (const [nome, caminho] of rotas) {
    it(`${nome} não consulta site_settings com o cliente da requisição`, () => {
      const fonte = readFileSync(join(raiz, caminho), "utf-8");
      expect(
        fonte,
        `${nome} voltou a ler site_settings como anônimo — o select devolve ` +
          "null sob a RLS e o fallback é silencioso"
      ).not.toContain('.from("site_settings")');
      expect(fonte).toContain("getCachedSettings()");
    });
  }

  it("margens/consulta continua exigindo o token antes de responder", () => {
    // O modo de falha que esta migração podia criar: token não lido → fallback
    // de env vazio → `if` não roda → rota aberta. A ordem importa tanto quanto
    // a leitura, então o teste cobra que a validação venha antes da consulta.
    const fonte = readFileSync(join(raiz, rotas[2][1]), "utf-8");
    const posToken = fonte.indexOf("const secretToken =");
    const posValidacao = fonte.indexOf('return NextResponse.json({ error: "Não autorizado" }');
    const posConsulta = fonte.indexOf('.from("estoque_motors")');

    expect(posToken).toBeGreaterThan(-1);
    expect(posValidacao).toBeGreaterThan(posToken);
    expect(posConsulta).toBeGreaterThan(posValidacao);
  });
});

/**
 * `/api/financeiro/margens/consulta` — a rota que o n8n chama para montar a
 * ficha de margem no WhatsApp.
 *
 * Ela mudou de regime em 2026-08-12. Antes, quem protegia o dado financeiro
 * não era a checagem de token — era a RLS: `contas` e `compras_produtos`
 * exigem `has_finance_access(auth.uid())`, e o n8n chega sem sessão, então as
 * consultas voltavam vazias. Isso "protegia" ao custo de mentir: a ficha saía
 * com zero despesas de preparação e margem otimista, discordando do painel.
 *
 * Agora a rota lê com a chave de serviço — os números ficam certos, e em troca
 * a RLS deixou de ser rede de segurança. O token passou a ser a única porta, e
 * por isso virou obrigatório.
 */
describe("ficha de margem do n8n", () => {
  const fonte = readFileSync(
    join(raiz, "src", "app", "api", "financeiro", "margens", "consulta", "route.ts"),
    "utf-8"
  );

  it("sem token configurado, recusa — não responde aberta", () => {
    // A regressão que este teste existe para impedir: voltar ao
    // `if (secretToken) { valide }`, que com token vazio dos dois lados
    // entregava o balanço da loja a qualquer um que soubesse a URL.
    expect(fonte).toMatch(/if \(!secretToken\)/);
    expect(fonte).toContain("status: 503");
    expect(
      fonte,
      "validação condicional de volta — token vazio deixaria a rota aberta"
    ).not.toMatch(/if \(secretToken && secretToken\.trim\(\) !== ""\)/);
  });

  it("só cria o cliente de serviço depois de conferir o token", () => {
    // Ordem é a defesa inteira: um `createAdminSupabaseClient()` acima da
    // checagem daria acesso privilegiado antes de saber quem está chamando.
    const posValidacao = fonte.indexOf('{ error: "Não autorizado" }');
    const posAdmin = fonte.indexOf("createAdminSupabaseClient()");

    expect(posValidacao).toBeGreaterThan(-1);
    expect(posAdmin).toBeGreaterThan(posValidacao);
  });

  it("não usa o cliente da requisição para ler o financeiro", () => {
    // Com o cliente anônimo, `contas` e `compras_produtos` voltam vazias.
    expect(fonte).not.toContain("createServerSupabaseClient");
  });

  it("erro de leitura não vira despesa zero", () => {
    // O `const { data: contas } = await ...` sem `error` foi o que deixou a
    // ficha sair com "Gastos de Preparação: R$ 0,00" como se fosse apurado.
    expect(fonte).toContain("error: erroContas");
    expect(fonte).toContain("error: erroCompras");
    const posGuarda = fonte.indexOf("if (erroContas || erroCompras)");
    const posCalculo = fonte.indexOf("const despesasPreparacao");
    expect(posGuarda).toBeGreaterThan(-1);
    expect(posCalculo).toBeGreaterThan(posGuarda);
  });
});

/**
 * As credenciais S3 do Storage moram DENTRO de `company` — a granularidade de
 * linha da RLS e dos dois testes acima não as enxerga. Foi por essa fresta que
 * um `GET /api/settings` anônimo devolveu `s3AccessKeyId` e
 * `s3SecretAccessKey` em texto puro até 2026-08-26 (docs/DIAGNOSTICO_IMAGENS.md,
 * achado nº 2): o recorte entregava `completo.companySettings` inteiro.
 */
describe("credenciais S3 dentro de company", () => {
  it("o recorte público as remove antes de servir o anônimo", async () => {
    const { recortePublicoDeSettings } = await import("../src/lib/settings");

    const recorte = recortePublicoDeSettings({
      companySettings: {
        name: "Motors Store",
        logoUrl: "https://exemplo.supabase.co/storage/v1/object/public/branding/logo.webp",
        s3AccessKeyId: "f08aeb-nao-pode-vazar",
        s3SecretAccessKey: "56370b-nao-pode-vazar",
      },
      aboutSettings: null,
      popups: null,
      quickTags: [],
      carouselVehicleIds: [],
      stockOverrides: {},
      procedencia: null,
      instagramCuradoria: null,
      areasHome: null,
      webhooks: null,
      bankBalances: null,
    } as never);

    const company = recorte.companySettings as Record<string, unknown>;
    expect(company.s3AccessKeyId).toBeUndefined();
    expect(company.s3SecretAccessKey).toBeUndefined();
    // E só as credenciais saem — o resto do objeto segue intacto.
    expect(company.name).toBe("Motors Store");
    expect(company.logoUrl).toContain("/branding/logo.webp");
    // Nenhuma serialização do recorte carrega os valores.
    expect(JSON.stringify(recorte)).not.toContain("nao-pode-vazar");
  });

  it("company nulo continua nulo — o recorte não inventa objeto", async () => {
    const { recortePublicoDeSettings } = await import("../src/lib/settings");
    const recorte = recortePublicoDeSettings({
      companySettings: null,
      aboutSettings: null,
      popups: null,
      quickTags: [],
      carouselVehicleIds: [],
      stockOverrides: {},
      procedencia: null,
      instagramCuradoria: null,
      areasHome: null,
      webhooks: null,
      bankBalances: null,
    } as never);
    expect(recorte.companySettings).toBeNull();
  });
});
