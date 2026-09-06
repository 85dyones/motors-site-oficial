import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Invariantes de `supabase/migrations/` (Pacote 0.5, item 5).
 *
 * O projeto passou a existir sem migração versionada nenhuma — CLAUDE.md:62
 * exigia `supabase/migrations/`, e a pasta não existia. Estes testes protegem
 * as duas propriedades que, se quebradas, trazem o problema de volta:
 *
 *  1. o cutover do rename é idempotente e guardado — reexecutar não destrói;
 *  2. a remoção da view de compatibilidade NÃO está em `migrations/`, onde
 *     `supabase db push` a aplicaria junto com a migração que a cria.
 *
 * O item 2 é o que impede um cutover de virar incidente: a view existe para
 * cobrir a janela entre o deploy do código e a atualização do workflow n8n.
 */

const DIR_MIGRACOES = join(__dirname, "..", "supabase", "migrations");
const DIR_PENDENTE = join(__dirname, "..", "supabase", "pendente");

/**
 * Remove comentários de linha antes de inspecionar o SQL.
 *
 * Sem isto, um teste que procura "DROP POLICY" casa também com o comentário
 * que EXPLICA por que não fazemos DROP POLICY — e passa a reagir à prosa em
 * vez do código executável. Estes arquivos são muito comentados de propósito;
 * a asserção precisa olhar só o que o Postgres vai rodar.
 */
function sqlExecutavel(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n");
}

/** Os arquivos de migração, na ordem em que o Supabase os aplicaria. */
function migracoes(): string[] {
  return readdirSync(DIR_MIGRACOES).filter((f) => f.endsWith(".sql")).sort();
}

/**
 * Toda dupla `(versão, nome)` que este arquivo registra no livro-razão.
 *
 * Lê de cada `insert into supabase_migrations.schema_migrations` até o `;`,
 * porque as duas formas que existem no repositório são diferentes: o rodapé
 * normal quebra em três linhas e uma tupla só, e o bootstrap do livro-razão
 * despeja dezenove tuplas de uma vez.
 */
function registrosNoLivroRazao(sql: string): { versao: string; nome: string }[] {
  const achados: { versao: string; nome: string }[] = [];
  const re = /insert\s+into\s+supabase_migrations\.schema_migrations\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const fim = sql.indexOf(";", m.index);
    const bloco = sql.slice(m.index, fim === -1 ? sql.length : fim);
    for (const t of bloco.matchAll(/\(\s*'(\d{14})'\s*,\s*'([^']+)'\s*\)/g)) {
      achados.push({ versao: t[1], nome: t[2] });
    }
  }
  return achados;
}

describe("supabase/migrations", () => {
  it("a pasta de migrações existe e não está vazia", () => {
    expect(existsSync(DIR_MIGRACOES)).toBe(true);
    expect(readdirSync(DIR_MIGRACOES).filter((f) => f.endsWith(".sql")).length)
      .toBeGreaterThan(0);
  });

  it("os nomes seguem o padrão de timestamp do Supabase CLI", () => {
    const migracoes = readdirSync(DIR_MIGRACOES).filter((f) => f.endsWith(".sql"));
    for (const m of migracoes) {
      expect(m, `Migração fora do padrão <timestamp>_<nome>.sql: ${m}`)
        .toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it("duas migrações nunca reivindicam a mesma versão", () => {
    // 2026-09-06, e não era hipótese: `20260905120000` estava em DUAS branches
    // ao mesmo tempo — `motivo_por_escopo` e `sla_conta_depois_do_assistente`.
    // A primeira já estava no livro-razão de PRODUÇÃO quando a segunda foi
    // escrita, então não era um conflito à espera do merge: era uma versão que
    // já tinha dono.
    //
    // `version` é chave primária de `supabase_migrations.schema_migrations`, e
    // todo rodapé termina em `on conflict (version) do nothing`. Isso protege
    // quando a versão é sua, e amordaça quando é de outro. Os dois caminhos de
    // aplicação quebram, e os dois quebram calados:
    //
    //   aplicar-migracao.js .. o DDL RODA (o rodapé é a última instrução, não um
    //                          portão) e o `on conflict` engole o registro. O
    //                          schema muda e o livro-razão diz outra coisa.
    //   supabase db push ..... pula o ARQUIVO INTEIRO. O DDL nunca roda, e o
    //                          código mergeado assume o que não existe.
    //
    // Dentro de um branch a colisão não existe: ela só vira dois arquivos com o
    // mesmo prefixo no instante do merge. É exatamente aí que este teste pega,
    // e é por isso que ele funciona apesar de rodar num branch por vez.
    const porVersao = new Map<string, string[]>();
    for (const m of migracoes()) {
      const versao = m.slice(0, 14);
      porVersao.set(versao, [...(porVersao.get(versao) ?? []), m]);
    }

    expect(
      [...porVersao]
        .filter(([, arquivos]) => arquivos.length > 1)
        .map(([versao, arquivos]) => `${versao}: ${arquivos.join(" + ")}`),
      "duas migrações com a mesma versão — a segunda a ser aplicada some em silêncio",
    ).toEqual([]);
  });

  it("o rodapé de auto-registro nomeia a própria migração", () => {
    // A segunda metade do conserto de uma colisão, e o lugar onde ele falha: a
    // versão aparece DUAS vezes, no nome do arquivo e no rodapé. Renomear só o
    // arquivo deixa o registro apontando para a versão ocupada — o mesmo
    // defeito, com nome novo.
    //
    // Duas isenções, as duas medidas contra o repositório e não supostas:
    //
    //  · 29 migrações antigas não têm rodapé nenhum. A convenção nasceu depois
    //    delas, e cobrar do passado pintaria de vermelho quem não fez nada.
    //  · `20260815120000_fechar_superficie_exposta` registra DEZENOVE versões,
    //    nenhuma a sua: foi ela que criou o livro-razão e trouxe o histórico
    //    junto. Registro em lote é backfill, não auto-registro.
    //
    // As duas isenções são pela FORMA — quantas versões o arquivo registra —,
    // nunca pelo NOME. Lista de exceção por nome é a mesma doença que este
    // arquivo existe para travar.
    const divergentes: string[] = [];
    for (const m of migracoes()) {
      const registros = registrosNoLivroRazao(sqlExecutavel(join(DIR_MIGRACOES, m)));
      if (registros.length !== 1) continue;
      const [{ versao, nome }] = registros;
      if (versao !== m.slice(0, 14) || nome !== m.slice(15).replace(/\.sql$/, "")) {
        divergentes.push(`${m} registra ('${versao}', '${nome}')`);
      }
    }

    expect(
      divergentes,
      "o rodapé não bate com o arquivo — um rename que esqueceu a outra metade",
    ).toEqual([]);
  });

  it("o baseline do inventário vem antes do rename", () => {
    const migracoes = readdirSync(DIR_MIGRACOES)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const iBaseline = migracoes.findIndex((m) => m.includes("baseline_inventario"));
    const iRename = migracoes.findIndex((m) => m.includes("renomear_veiculos"));

    expect(iBaseline).toBeGreaterThanOrEqual(0);
    expect(iRename).toBeGreaterThanOrEqual(0);
    // Renomear antes de existir a tabela deixaria o histórico incoerente para
    // quem reconstruir o banco do zero.
    expect(iBaseline).toBeLessThan(iRename);
  });
});

describe("baseline do inventário", () => {
  const sql = sqlExecutavel(
    join(DIR_MIGRACOES, "20260803120000_baseline_inventario.sql")
  );

  it("não recria a tabela se ela já existe", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.veiculos/i);
  });

  it("não sobrescreve policies de RLS já existentes", () => {
    // AUDITORIA.md §3.4 alerta que produção pode ter sido endurecida à mão e
    // que isso não é verificável daqui. Um DROP POLICY + CREATE ... USING(true)
    // incondicional reabriria a brecha em silêncio, durante um `db push`,
    // sob o nome de "baseline". As policies só podem ser criadas se não houver
    // nenhuma.
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).toMatch(/FROM pg_policies/i);

    // A criação precisa estar depois da checagem de existência, não antes.
    const posGuarda = sql.search(/FROM pg_policies/i);
    const posPrimeiroCreate = sql.search(/CREATE POLICY/i);
    expect(posGuarda).toBeGreaterThanOrEqual(0);
    expect(posPrimeiroCreate).toBeGreaterThan(posGuarda);
  });
});

describe("migração de rename — cutover", () => {
  const sql = sqlExecutavel(
    join(DIR_MIGRACOES, "20260803120100_renomear_veiculos_para_estoque_motors.sql")
  );

  it("o rename é guardado — não roda se já foi aplicado", () => {
    // Sem a guarda, uma segunda execução aborta com erro e pode travar o
    // `db push` inteiro no meio de um deploy.
    expect(sql).toMatch(/IF EXISTS\s*\(/i);
    expect(sql).toMatch(/NOT EXISTS\s*\(/i);
    expect(sql).toMatch(/ALTER TABLE public\.veiculos RENAME TO estoque_motors/i);
  });

  it("cria a view de compatibilidade para o nome antigo", () => {
    expect(sql).toMatch(/CREATE VIEW public\.veiculos/i);
    expect(sql).toMatch(/SELECT \* FROM public\.estoque_motors/i);
  });

  it("a view de compatibilidade respeita a RLS de quem consulta", () => {
    // Sem `security_invoker`, uma view roda com os privilégios do dono e vira
    // caminho para contornar a RLS da tabela — o oposto do que CLAUDE.md exige.
    expect(sql).toMatch(/security_invoker\s*=\s*true/i);
  });

  it("não remove a view de compatibilidade que acabou de criar", () => {
    // A ordem importa: existe um único DROP VIEW, e ele é o que limpa um
    // resquício ANTES do CREATE. Um DROP depois do CREATE anularia o cutover.
    const posCreate = sql.search(/CREATE VIEW public\.veiculos/i);
    const dropsDepois = sql
      .slice(posCreate)
      .match(/DROP VIEW IF EXISTS public\.veiculos/gi);
    expect(dropsDepois).toBeNull();
  });
});

describe("passo 4 do cutover — remoção da view", () => {
  /**
   * ⚠️ A premissa deste bloco MUDOU em 2026-08-04.
   *
   * Até então o passo 4 vivia em `supabase/pendente/`, e o teste exigia que
   * ele NÃO estivesse em `migrations/`: lá dentro, o `supabase db push` do
   * passo 2 aplicaria a remoção na mesma execução que cria a view, fechando a
   * janela de compatibilidade no instante em que ela é aberta — e derrubando o
   * sync de estoque do n8n junto.
   *
   * O dono aplicou o passo 4 à mão em produção em 2026-08-04 (verificado: a
   * view responde 404/PGRST205). Com a janela já fechada, o arquivo foi movido
   * para `migrations/` conforme o runbook, para que o histórico registre a
   * remoção e um banco reconstruído do zero chegue ao mesmo estado final.
   *
   * O que passa a ser protegido é a ORDEM: remover a view antes de criá-la
   * deixaria o histórico incoerente para quem reconstruir.
   */
  const migracoes = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const remocao = migracoes.find((m) => /remover_view_compat/i.test(m));

  it("está versionado em supabase/migrations/", () => {
    expect(
      remocao,
      "A remoção da view foi aplicada em produção e precisa estar versionada."
    ).toBeDefined();
  });

  it("vem depois da migração que cria a view", () => {
    const iRename = migracoes.findIndex((m) => m.includes("renomear_veiculos"));
    expect(iRename).toBeGreaterThanOrEqual(0);
    expect(migracoes.indexOf(remocao!)).toBeGreaterThan(iRename);
  });

  it("é idempotente — reexecutar não aborta o push", () => {
    const sql = sqlExecutavel(join(DIR_MIGRACOES, remocao!));
    expect(sql).toMatch(/DROP VIEW IF EXISTS public\.veiculos/i);
  });

  it("não sobrou nada pendente sem aplicar", () => {
    // `pendente/` é uma antessala, não um depósito: um arquivo esquecido lá é
    // um passo manual que ninguém deu. Se voltar a existir, é de propósito e
    // este teste deve ser revisto junto.
    if (!existsSync(DIR_PENDENTE)) return;
    const pendentes = readdirSync(DIR_PENDENTE).filter((f) => f.endsWith(".sql"));
    expect(pendentes, `Pendentes não aplicados: ${pendentes.join(", ")}`).toEqual([]);
  });
});

describe("RLS de escrita do estoque", () => {
  const sql = sqlExecutavel(
    join(DIR_MIGRACOES, "20260808120000_rls_escrita_autenticada_estoque.sql")
  );

  it("restringe UPDATE e INSERT ao papel authenticated", () => {
    // O buraco do §3.4 era exatamente a ausência do `TO`: sem ele a policy
    // vale para `public`, e a anon key vai no bundle do browser.
    expect(sql).toMatch(/FOR UPDATE TO authenticated/i);
    expect(sql).toMatch(/FOR INSERT TO authenticated/i);
  });

  it("nenhuma policy de escrita fica sem `TO`", () => {
    // Varre cada CREATE POLICY e cobra o papel em todas que não são SELECT.
    const criacoes = sql.match(/CREATE POLICY[\s\S]*?;/gi) ?? [];
    const escritaSemPapel = criacoes.filter(
      (c) => /FOR (UPDATE|INSERT|DELETE|ALL)/i.test(c) && !/TO\s+authenticated/i.test(c),
    );
    expect(
      escritaSemPapel,
      "Policy de escrita sem `TO authenticated` — vale para public:\n" +
        escritaSemPapel.join("\n"),
    ).toEqual([]);
  });

  it("preserva a leitura pública — é a vitrine do site", () => {
    // Fechar o SELECT deixaria o catálogo vazio para o visitante anônimo.
    expect(sql).toMatch(/FOR SELECT USING \(true\)/i);
  });

  it("aborta se sobrar escrita aberta ao público", () => {
    // A migração se autoconfere: sem isso, "rodei" não é o mesmo que "fechou".
    expect(sql).toMatch(/FROM pg_policies/i);
    expect(sql).toMatch(/RAISE EXCEPTION/i);
    expect(sql).toMatch(/'anon' = ANY\(roles\)/i);
  });

  it("não apaga policy de leitura junto com as de escrita", () => {
    const drops = sql.match(/DROP POLICY IF EXISTS "([^"]+)"/gi) ?? [];
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) {
      expect(d.toLowerCase(), `DROP suspeito de leitura: ${d}`).not.toContain("read");
      expect(d.toLowerCase()).not.toContain("leitura");
      expect(d.toLowerCase()).not.toContain("select");
    }
  });
});

describe("RLS de leitura de site_settings", () => {
  const sql = sqlExecutavel(
    join(DIR_MIGRACOES, "20260812120000_rls_leitura_de_site_settings.sql")
  );

  /** Os ids liberados ao papel `anon` pela policy do recorte público. */
  const listaLiberada = (): string[] => {
    const inicio = sql.search(
      /CREATE POLICY "Leitura anonima do recorte publico"/i
    );
    expect(inicio, "policy do recorte público não encontrada").toBeGreaterThan(-1);
    const trecho = sql.slice(inicio, sql.indexOf(";", inicio));
    const dentroDoIn = trecho.slice(trecho.search(/USING\s*\(\s*id\s+IN\s*\(/i));
    // Tira comentário de fim de linha antes de colher os literais, senão uma
    // frase com apóstrofo entraria na lista como se fosse um id.
    return [...dentroDoIn.replace(/--[^\n]*/g, "").matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1]
    );
  };

  it("a leitura anônima é restrita por id — nunca `USING (true)`", () => {
    // O buraco era exatamente este: `FOR SELECT USING (true)` sem `TO`, que
    // vale para `public` e portanto para a anon key do bundle.
    expect(sql).toMatch(/FOR SELECT TO anon/i);
    const criacoes = sql.match(/CREATE POLICY[\s\S]*?;/gi) ?? [];
    const anonAberta = criacoes.filter(
      (c) => /TO anon/i.test(c) && /USING\s*\(\s*true\s*\)/i.test(c)
    );
    expect(
      anonAberta,
      "Policy de leitura anônima sem predicado:\n" + anonAberta.join("\n")
    ).toEqual([]);
  });

  it("as três linhas sensíveis ficam fora do alcance do anônimo", () => {
    // `webhooks` carrega `apiSecretToken`; `stock_overrides` carrega
    // `preco_compra`; `bank_balances` carrega os saldos da loja.
    for (const id of ["webhooks", "stock_overrides", "bank_balances"]) {
      expect(listaLiberada(), `linha sensível liberada ao anônimo: ${id}`)
        .not.toContain(id);
    }
  });

  it("libera o recorte que as páginas sem sessão precisam", () => {
    expect(listaLiberada().sort()).toEqual([
      "about",
      "areas_home",
      "carousel_vehicles",
      "company",
      "instagram_curadoria",
      "popups",
      "procedencia",
      "quick_tags",
    ]);
  });

  it("preserva a leitura completa para quem tem sessão", () => {
    // Não é conveniência: o painel salva com `upsert`, e sem SELECT para
    // `authenticated` o `ON CONFLICT DO UPDATE` não enxerga a linha que vai
    // atualizar — a gravação quebraria até nas linhas públicas.
    expect(sql).toMatch(/FOR SELECT TO authenticated USING \(true\)/i);
  });

  it("não mexe nas policies de escrita", () => {
    // Escrita já era `authenticated` + perfil admin. Um DROP daqui derrubaria
    // o salvamento do painel sem nada no lugar.
    const drops = sql.match(/DROP POLICY[^;]*/gi) ?? [];
    for (const d of drops) {
      expect(d.toLowerCase(), `DROP suspeito de escrita: ${d}`).not.toMatch(
        /insert|update|delete|escrita|write/
      );
    }
  });

  it("aborta se o anônimo ainda enxergar linha sensível", () => {
    // A autoconferência vira `anon` de verdade e tenta ler, em vez de
    // inspecionar `pg_policies` e torcer. Pega inclusive uma policy `ALL` para
    // `public`, que o DROP por `cmd = 'SELECT'` deixa passar de propósito.
    expect(sql).toMatch(/SET LOCAL ROLE anon/i);
    expect(sql).toMatch(/RAISE EXCEPTION/i);
    expect(sql).toMatch(/RESET ROLE/i);
  });
});

describe("RLS de escrita de site_settings", () => {
  const sql = sqlExecutavel(
    join(DIR_MIGRACOES, "20260812150000_rls_escrita_de_site_settings.sql")
  );

  it("restringe UPDATE e INSERT ao papel authenticated", () => {
    // Mesmo defeito do §3.4 que `20260808120000` fechou em `estoque_motors`:
    // policy sem `TO` vale para `public`, e a anon key vai no bundle.
    expect(sql).toMatch(/FOR UPDATE TO authenticated/i);
    expect(sql).toMatch(/FOR INSERT TO authenticated/i);
  });

  it("nenhuma policy de escrita fica sem `TO`", () => {
    const criacoes = sql.match(/CREATE POLICY[\s\S]*?;/gi) ?? [];
    const semPapel = criacoes.filter(
      (c) => /FOR (UPDATE|INSERT|DELETE|ALL)/i.test(c) && !/TO\s+authenticated/i.test(c)
    );
    expect(
      semPapel,
      "Policy de escrita sem `TO authenticated` — vale para public:\n" + semPapel.join("\n")
    ).toEqual([]);
  });

  it("não apaga as policies de leitura criadas em 20260812120000", () => {
    // O DROP é dinâmico e filtra por `cmd`. Se algum dia passar a varrer
    // SELECT também, derrubaria o recorte público e a leitura do painel.
    expect(sql).toMatch(/cmd IN \('INSERT', 'UPDATE', 'DELETE', 'ALL'\)/i);
    expect(sql).not.toMatch(/cmd\s*=\s*'SELECT'/i);
  });

  it("não cria policy de DELETE", () => {
    // Ausência de policy é negação, e é o que se quer: o painel nunca apaga
    // linha de configuração.
    const criacoes = sql.match(/CREATE POLICY[\s\S]*?;/gi) ?? [];
    expect(criacoes.filter((c) => /FOR DELETE/i.test(c))).toEqual([]);
  });

  it("aborta se o anônimo ainda conseguir escrever", () => {
    expect(sql).toMatch(/SET LOCAL ROLE anon/i);
    expect(sql).toMatch(/GET DIAGNOSTICS/i);
    expect(sql).toMatch(/RAISE EXCEPTION/i);
    expect(sql).toMatch(/RESET ROLE/i);
  });

  it("a autoconferência não altera dado", () => {
    // `SET updated_at = updated_at` regrava o mesmo valor: prova a permissão
    // sem mexer no conteúdo, caso a policy deixe passar.
    expect(sql).toMatch(/SET updated_at = updated_at/i);
  });
});
