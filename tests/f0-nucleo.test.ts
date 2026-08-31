import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { lerCodigo } from "./fonte";

/**
 * F0 — o núcleo do handoff, em onze fatias (2026-08-29).
 *
 * As migrações já rodaram contra o banco real, e cada uma carrega a própria
 * autoconferência: é ela que prova o comportamento no dia da aplicação. Este
 * arquivo guarda outra coisa — que as decisões escritas ali não sejam desfeitas
 * numa edição futura, quando ninguém mais lembrar por que a linha estava lá.
 * Mesma abordagem de `tests/migracoes.test.ts` e `tests/ciclo-fundacao.test.ts`:
 * asserções sobre o TEXTO EXECUTÁVEL do SQL, porque não há instância de teste
 * do Supabase neste projeto (AUDITORIA §5.7).
 *
 * O que está travado aqui, em uma frase cada:
 *
 *  1. tabela nova do núcleo nasce com `org_id` e RLS — a lista de tabelas sai
 *     dos próprios arquivos, então tabela nova sem os dois quebra o teste;
 *  2. nenhuma policy do núcleo alcança `anon` nem `public`;
 *  3. append-only é trigger E ausência de policy de mutação — as duas trancas;
 *  4. o balanço do razão é conferido no COMMIT, não a cada perna;
 *  5. as constraints nomeadas da spec continuam existindo;
 *  6. os seeds transcrevem a spec 30, a spec 11 e a Emenda 02 — e comissão
 *     segue SEM seed, porque o número é decisão do dono;
 *  7. `seed_validado_em` não nasce preenchido (D13 é do dono, e sem ele não há
 *     contrato — manual v1.2 §1.4);
 *  8. toda fatia se registra no livro-razão com a version do próprio nome;
 *  9. a situação é projeção, e a tabela-verdade dela não encolhe;
 * 10. a trava do sync (f0k) continua reconhecendo o sync — e ninguém em `src/`
 *     escreve o carimbo que serve de assinatura.
 */

const DIR_MIGRACOES = join(__dirname, "..", "supabase", "migrations");

/**
 * As fatias aplicadas em 2026-08-29 (docs/PLANO_F0.md + o adendo do dono).
 *
 * A lista é explícita só para acusar sumiço/renomeação. As asserções varrem os
 * arquivos DESCOBERTOS, não esta lista — fatia nova entra sob teste sozinha.
 */
const FATIAS_ESPERADAS = [
  "20260829120000_f0a_org_e_enums.sql",
  "20260829120100_f0b_veiculos_e_entradas.sql",
  "20260829120200_f0c_eventos_e_auditoria.sql",
  "20260829120300_f0d_custos_e_precos.sql",
  "20260829120400_f0e_razao.sql",
  "20260829120500_f0f_parametros.sql",
  "20260829120600_f0g_negocios.sql",
  "20260829120700_f0h_documentos_anuncios_renave.sql",
  "20260829120800_f0i_situacao.sql",
  "20260829121000_f0j_unicidade_de_vigencia.sql",
  // Adendo do dono, mesma data: cadastro nativo no /admin + a trava do sync.
  "20260829130000_f0k_cadastro_nativo_e_trava_do_sync.sql",
];

const ARQUIVOS = readdirSync(DIR_MIGRACOES)
  .filter((f) => /^\d{14}_f0[a-z]_.*\.sql$/.test(f))
  .sort();

/**
 * O SQL sem as linhas de comentário.
 *
 * Mesma ideia (e mesma razão) do helper de `tests/migracoes.test.ts`: os
 * arquivos da F0 são muito comentados de propósito — a prosa EXPLICA por que
 * não existe policy de UPDATE, por que o seed de comissão não vem, por que o
 * lote fica para o momento B. Sem descontar comentário, um `not.toMatch` reage
 * à explicação em vez do código, e um `toMatch` passa lendo a nota.
 *
 * `split(/\r?\n/)`: o repositório guarda LF, o checkout no Windows entrega
 * CRLF, e comparação linha a linha com `\n` cru não casa nada aqui.
 */
function sqlExecutavel(arquivo: string): string {
  return readFileSync(join(DIR_MIGRACOES, arquivo), "utf8")
    .split(/\r?\n/)
    .filter((linha) => !linha.trimStart().startsWith("--"))
    .join("\n");
}

const SQL = new Map(ARQUIVOS.map((a) => [a, sqlExecutavel(a)] as const));
/** Os dez arquivos concatenados, para as perguntas que valem para a F0 inteira. */
const F0 = [...SQL.values()].join("\n");

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Recorte entre dois marcadores — falha alto se algum não existir. */
function fatia(sql: string, de: string, ate: string): string {
  const i = sql.indexOf(de);
  expect(i, `marcador ausente: ${de}`).toBeGreaterThanOrEqual(0);
  const f = sql.indexOf(ate, i);
  expect(f, `marcador ausente: ${ate}`).toBeGreaterThan(i);
  return sql.slice(i, f);
}

/** O corpo do `create table` — do `create` até o `);` na coluna zero. */
function corpoDaTabela(sql: string, tabela: string): string {
  const m = new RegExp(`create table if not exists public\\.${tabela}\\s*\\(`, "i").exec(sql);
  expect(m, `create table de ${tabela} não encontrado`).not.toBeNull();
  const fim = sql.indexOf("\n);", m!.index);
  expect(fim, `corpo de ${tabela} sem fechamento`).toBeGreaterThan(m!.index);
  return sql.slice(m!.index, fim);
}

/**
 * As tabelas do núcleo, colhidas dos próprios arquivos.
 *
 * Deliberadamente NÃO é uma lista fixa: a régua do handoff ("toda tabela nova
 * do núcleo: org_id + RLS + policy por papel") só continua valendo se tabela
 * nova cair automaticamente sob as asserções.
 */
const TABELAS: { nome: string; arquivo: string; corpo: string }[] = [];
for (const [arquivo, sql] of SQL) {
  for (const m of sql.matchAll(/create table if not exists public\.(\w+)/gi)) {
    TABELAS.push({ nome: m[1], arquivo, corpo: corpoDaTabela(sql, m[1]) });
  }
}

/**
 * `orgs` é a única sem `org_id` — ela É a org. E não tem policy nenhuma: RLS
 * ligada sem policy = ilegível por anon e por authenticated; quem precisa do id
 * chama `org_padrao()`, que é SECURITY DEFINER.
 */
const A_PROPRIA_ORG = "orgs";

/** As cinco append-only do núcleo (handoff, decisão 1 + D-T1.6). */
const APPEND_ONLY = [
  "veiculo_eventos",
  "auditoria",
  "lancamentos",
  "partidas",
  "anuncios",
];

// ---------------------------------------------------------------------------
// Policies: extração que enxerga as criadas por `format(...%I...)` também
// ---------------------------------------------------------------------------

/** Todo `create policy ... ;` da F0, inclusive os que moram dentro de `format`. */
function policiesDe(sql: string): string[] {
  return sql.match(/create policy[\s\S]*?;/gi) ?? [];
}

/**
 * Tabela → comandos de policy concedidos.
 *
 * Metade das policies da F0 nasce em laço (`foreach t in array array[...]`),
 * com `%I` no lugar do nome. Um regex ingênuo por `on public.<tabela>` não
 * enxergaria nenhuma delas — e o teste passaria dizendo que `partidas` não tem
 * policy de UPDATE porque não achou policy nenhuma. Aqui o laço é lido: os
 * comandos do corpo valem para cada tabela do array.
 */
function comandosPorTabela(sql: string): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  const anotar = (tabela: string, cmd: string) => {
    if (!mapa.has(tabela)) mapa.set(tabela, new Set());
    mapa.get(tabela)!.add(cmd.toLowerCase());
  };

  for (const m of sql.matchAll(
    /create policy\s+(?:"[^"]+"|\w+)\s+on\s+public\.(\w+)\s+for\s+(select|insert|update|delete|all)/gi,
  )) {
    anotar(m[1], m[2]);
  }

  for (const laco of sql.matchAll(
    /foreach\s+\w+\s+in\s+array\s+array\[([^\]]*)\]\s+loop([\s\S]*?)end loop;/gi,
  )) {
    const tabelas = [...laco[1].matchAll(/'(\w+)'/g)].map((t) => t[1]);
    const cmds = [
      ...laco[2].matchAll(
        /create policy\s+(?:"[^"]+"|\w+)\s+on\s+public\.%I\s+for\s+(select|insert|update|delete|all)/gi,
      ),
    ].map((c) => c[1]);
    for (const t of tabelas) for (const c of cmds) anotar(t, c);
  }

  return mapa;
}

const COMANDOS = comandosPorTabela(F0);

// ---------------------------------------------------------------------------

describe("as fatias da F0", () => {
  it("estão todas versionadas, e nenhuma foi renomeada", () => {
    for (const f of FATIAS_ESPERADAS) {
      expect(ARQUIVOS, `fatia sumiu de supabase/migrations: ${f}`).toContain(f);
    }
    expect(ARQUIVOS.length).toBeGreaterThanOrEqual(FATIAS_ESPERADAS.length);
  });

  it("cada uma termina com o rodapé de auto-registro no livro-razão (D6)", () => {
    // `supabase/README.md`: o livro-razão é o que impede a próxima migração de
    // reaplicar as anteriores. Rodapé faltando = fatia invisível para o CLI.
    for (const arquivo of ARQUIVOS) {
      const sql = SQL.get(arquivo)!;
      const version = arquivo.slice(0, 14);
      const nome = arquivo.slice(15, -4);
      expect(
        sql,
        `rodapé ausente ou com version/name divergentes do nome do arquivo: ${arquivo}`,
      ).toMatch(
        new RegExp(
          `insert into supabase_migrations\\.schema_migrations \\(version, name\\)\\s+` +
            `values \\('${version}', '${escapar(nome)}'\\)\\s+on conflict \\(version\\) do nothing;`,
        ),
      );
      // Um só registro por arquivo: dois seria version copiada de outra fatia.
      expect(
        (sql.match(/supabase_migrations\.schema_migrations/g) ?? []).length,
        `mais de um auto-registro em ${arquivo}`,
      ).toBe(1);
      // E ele é a última coisa que o arquivo faz.
      expect(sql.trimEnd().endsWith("on conflict (version) do nothing;"), arquivo).toBe(true);
    }
  });

  it("nenhuma version se repete entre as fatias", () => {
    const versions = ARQUIVOS.map((a) => a.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("nada de DROP/RENAME de objeto em uso — a janela é aditiva", () => {
    // Regra do handoff enquanto o RevendaMais roda em paralelo. `drop policy if
    // exists` e `drop trigger if exists` antes de recriar são o padrão do repo
    // e não contam; o que não pode é derrubar tabela, coluna ou tipo.
    expect(F0).not.toMatch(/drop table/i);
    expect(F0).not.toMatch(/drop column/i);
    expect(F0).not.toMatch(/drop type/i);
    expect(F0).not.toMatch(/rename to/i);
    expect(F0).not.toMatch(/alter type public\.\w+ rename/i);
  });
});

describe("toda tabela do núcleo nasce com org e RLS", () => {
  it("a lista de tabelas sai dos arquivos, e traz as vinte conhecidas", () => {
    const nomes = TABELAS.map((t) => t.nome);
    // Sem esta guarda, um regex que parasse de casar deixaria todas as
    // asserções abaixo passando sobre uma lista vazia.
    expect(nomes.length).toBeGreaterThanOrEqual(20);
    expect(new Set(nomes).size, `tabela criada duas vezes: ${nomes}`).toBe(nomes.length);
    for (const t of [
      "orgs",
      "veiculos",
      "veiculo_entradas",
      "veiculo_eventos",
      "auditoria",
      "veiculo_custos",
      "veiculo_precos",
      "plano_contas",
      "lancamentos",
      "partidas",
      "regras_contabilizacao",
      "regras_comissao",
      "parametros_avaliacao",
      "ciclo_parametros",
      "negocios",
      "negocio_pagamentos",
      "confirmacoes_disponibilidade",
      "documentos",
      "anuncios",
      "renave_operacoes",
    ]) {
      expect(nomes, `tabela do núcleo sumiu: ${t}`).toContain(t);
    }
  });

  it("todas têm `org_id uuid not null default public.org_padrao()`", () => {
    // "Costura de SaaS, um tenant": a coluna e a disciplina nascem agora, para
    // que a segunda org não exija reescrever o núcleo inteiro.
    for (const { nome, corpo, arquivo } of TABELAS) {
      if (nome === A_PROPRIA_ORG) continue;
      expect(corpo, `${nome} (${arquivo}) sem org_id com default org_padrao()`).toMatch(
        /\borg_id\s+uuid\s+not null\s+default\s+public\.org_padrao\(\)/,
      );
    }
  });

  it("todas ligam RLS — sem exceção, sem 'depois eu ajusto'", () => {
    for (const { nome, arquivo } of TABELAS) {
      expect(SQL.get(arquivo)!, `RLS não habilitada em ${nome}`).toMatch(
        new RegExp(`alter table public\\.${nome}\\s+enable row level security`, "i"),
      );
    }
  });

  it("a única sem org_id é `orgs` — e ela não tem policy nenhuma", () => {
    const semOrgId = TABELAS.filter(
      (t) => !/\borg_id\s+uuid\s+not null\s+default\s+public\.org_padrao\(\)/.test(t.corpo),
    ).map((t) => t.nome);
    expect(semOrgId).toEqual([A_PROPRIA_ORG]);
    // RLS ligada + zero policy = ilegível para anon e para authenticated. Quem
    // precisa do id chama org_padrao(), que é SECURITY DEFINER.
    expect(COMANDOS.get(A_PROPRIA_ORG)).toBeUndefined();
  });

  it("cada tabela (menos `orgs`) tem leitura de staff", () => {
    for (const { nome } of TABELAS) {
      if (nome === A_PROPRIA_ORG) continue;
      expect(
        COMANDOS.get(nome)?.has("select"),
        `${nome} sem policy de SELECT: a tela abre vazia e ninguém vê erro (RLS devolve [], não 403)`,
      ).toBe(true);
    }
  });
});

/**
 * As policies do bucket de fotos (F0-p) NÃO são policies do núcleo.
 *
 * A varredura descobre arquivo por nome (`f0[a-z]_`), e em 2026-08-30 entrou
 * um que não cria tabela nenhuma: `f0p` cria o bucket `veiculos` no
 * `storage.objects`. Ele quebra três guardas de propósito, e cada quebra é uma
 * decisão escrita na própria migração:
 *
 *   • `to anon` — a LEITURA é pública porque estas fotos SÃO o anúncio. Elas
 *     aparecem na vitrine, no feed dos portais e no card do WhatsApp; bucket
 *     privado exigiria URL assinada em cada card, que expira, e link de anúncio
 *     que morre é pior que foto sem tratamento.
 *   • `org_id = org_padrao()` — `storage.objects` é tabela do Supabase, não
 *     nossa: não tem (nem pode ganhar) a coluna.
 *
 * Separá-las aqui não afrouxa nada: o bloco logo abaixo cobra do bucket
 * exatamente o que faz sentido cobrar dele — escrita só de staff, e o público
 * limitado a SELECT.
 */
const ehDoStorage = (policy: string) => /\bon\s+storage\.objects\b/i.test(policy);

describe("o bucket de fotos abre a leitura e só ela", () => {
  const doBucket = policiesDe(F0).filter(ehDoStorage);

  it("há policies de storage para inspecionar", () => {
    expect(doBucket.length).toBeGreaterThanOrEqual(4);
  });

  it("toda escrita exige `is_staff` — nenhuma alcança anon", () => {
    const escrita = doBucket.filter((p) => /\bfor\s+(insert|update|delete)\b/i.test(p));
    expect(escrita.length).toBeGreaterThanOrEqual(3);
    for (const p of escrita) {
      expect(p, `policy de escrita sem is_staff:\n${p}`).toMatch(
        /public\.is_staff\(auth\.uid\(\)\)/,
      );
      expect(p, `policy de escrita alcançando anon:\n${p}`).not.toMatch(/\bto\s+anon\b/i);
    }
  });

  it("a única que alcança anon é de SELECT", () => {
    const publicas = doBucket.filter((p) => /\bto\s+[^;]*\banon\b/i.test(p));
    expect(publicas.length).toBe(1);
    expect(publicas[0]).toMatch(/\bfor\s+select\b/i);
  });

  it("o diário de bordo não virou público de carona", () => {
    // A migração cobra isso do banco na autoconferência; aqui é a leitura do
    // texto, para o teste acusar antes de alguém aplicar.
    expect(F0).toContain("o diário de bordo virou público");
  });
});

describe("nenhuma porta pública no núcleo", () => {
  const policies = policiesDe(F0).filter((p) => !ehDoStorage(p));

  it("há policies para inspecionar", () => {
    // A trava contra o teste que "passa" porque não leu nada. O número é de
    // ENUNCIADOS, não de policies aplicadas: as criadas em laço aparecem uma
    // vez no texto e valem para cada tabela do array.
    expect(policies.length).toBeGreaterThanOrEqual(25);
  });

  it("nenhuma é `to anon` nem `to public`", () => {
    // O fantasma de AUDITORIA §3.4: policy sem `TO` vale para `public`, e a
    // anon key vai no bundle do browser. O núcleo inteiro é dado de operação.
    const abertas = policies.filter((p) => /\bto\s+(anon|public)\b/i.test(p));
    expect(abertas, `policy pública no núcleo:\n${abertas.join("\n")}`).toEqual([]);
  });

  it("todas dizem `to authenticated` explicitamente", () => {
    const semPapel = policies.filter((p) => !/\bto\s+authenticated\b/i.test(p));
    expect(semPapel, `policy sem \`TO\`:\n${semPapel.join("\n")}`).toEqual([]);
  });

  it("todas são presas a `is_staff` e à org", () => {
    // Cliente e investidor autenticam no mesmo pool `auth.users` (CLAUDE.md,
    // regra 2-b). Sem a régua de staff, "estar logado" abriria o núcleo.
    const frouxas = policies.filter(
      (p) =>
        !/public\.is_staff\(auth\.uid\(\)\)/.test(p) ||
        !/org_id = public\.org_padrao\(\)/.test(p),
    );
    expect(frouxas, `policy sem is_staff/org:\n${frouxas.join("\n")}`).toEqual([]);
  });
});

describe("append-only é trigger E ausência de policy", () => {
  it("as cinco têm trigger `before update or delete`", () => {
    // D-T1.6: as duas trancas. A RLS sozinha não vale para `service_role` nem
    // para uma função SECURITY DEFINER distraída; o trigger vale para todos.
    for (const t of APPEND_ONLY) {
      expect(F0, `${t} sem trigger de append-only`).toMatch(
        new RegExp(
          `create trigger\\s+\\w+\\s+before update or delete on public\\.${t}\\s+` +
            `for each row execute function public\\.nucleo_bloquear_mutacao\\(\\)`,
          "i",
        ),
      );
    }
  });

  it("nenhuma delas ganha policy de UPDATE ou DELETE", () => {
    for (const t of APPEND_ONLY) {
      const cmds = COMANDOS.get(t);
      expect(cmds, `${t} sem policy nenhuma — o extrator não leu o laço?`).toBeDefined();
      expect(cmds!.has("select"), `${t} sem leitura`).toBe(true);
      for (const proibido of ["update", "delete", "all"]) {
        expect(
          cmds!.has(proibido),
          `${t} ganhou policy \`for ${proibido}\` — corrigir append-only é evento novo, nunca edição`,
        ).toBe(false);
      }
    }
  });

  it("a função de bloqueio recusa em vez de ignorar", () => {
    const fn = fatia(F0, "create or replace function public.nucleo_bloquear_mutacao()", "$$;");
    expect(fn).toMatch(/raise exception/i);
    expect(fn).toMatch(/append-only/i);
    // Nada de `return null` silencioso: um trigger BEFORE que devolve NULL
    // cancelaria a linha sem avisar, e o operador acharia que salvou.
    expect(fn).not.toMatch(/return null/i);
  });

  it("TRUNCATE some das mãos da API (a fresta que trigger row-level não cobre)", () => {
    const revoke = fatia(SQL.get("20260829121000_f0j_unicidade_de_vigencia.sql")!, "revoke truncate", ";");
    for (const t of APPEND_ONLY) {
      expect(revoke, `${t} fora do revoke de TRUNCATE`).toContain(`public.${t}`);
    }
    expect(revoke).toMatch(/from anon, authenticated/);
  });
});

describe("o balanço do razão fecha no COMMIT, não a cada perna", () => {
  const razao = SQL.get("20260829120400_f0e_razao.sql")!;

  it("as duas constraint triggers são `deferrable initially deferred`", () => {
    // Sem o deferimento, a primeira perna do lançamento morre sozinha: débito
    // entra, ainda não há crédito, soma ≠ 0 — e nenhum lançamento fecharia.
    for (const [gatilho, tabela] of [
      ["partidas_balanco_zero", "partidas"],
      ["lancamentos_tem_partidas", "lancamentos"],
    ]) {
      expect(razao, `${gatilho} deixou de ser deferido`).toMatch(
        new RegExp(
          `create constraint trigger\\s+${gatilho}\\s+after insert on public\\.${tabela}\\s+` +
            `deferrable initially deferred`,
          "i",
        ),
      );
    }
    expect(razao).not.toMatch(/initially immediate/i);
  });

  it("a conferência exige duas pernas e soma zero", () => {
    const fn = fatia(razao, "create or replace function public.nucleo_conferir_balanco()", "$$;");
    expect(fn).toMatch(/pernas < 2/);
    expect(fn).toMatch(/soma <> 0/);
    expect(fn).toMatch(/raise exception/i);
  });

  it("a convenção de sinal está escrita no schema, não na cabeça de alguém", () => {
    // valor > 0 débito, valor < 0 crédito (spec 30). Zero não é partida.
    expect(razao).toMatch(/valor\s+numeric\(14,2\) not null check \(valor <> 0\)/);
  });
});

describe("as constraints que SÃO a regra (specs 00/10)", () => {
  const entradas = SQL.get("20260829120100_f0b_veiculos_e_entradas.sql")!;

  it("as cinco constraints nomeadas continuam de pé", () => {
    for (const c of [
      "troca_exige_venda",
      "consignacao_sem_custo",
      "parceria_exige_preco",
      "terceiro_sem_posse",
      "lote_momento_b",
    ]) {
      expect(entradas, `constraint ${c} sumiu`).toMatch(
        new RegExp(`constraint ${c}\\s+check`, "i"),
      );
    }
  });

  it("cada uma diz o que a spec diz", () => {
    // A tela pode errar; o banco não deixa passar. Se alguém afrouxar a
    // expressão, a regra vira decoração — e o formulário passa a ser a lei.
    expect(entradas).toMatch(/troca_exige_venda\s+check \(modalidade <> 'troca' or venda_origem_id is not null\)/);
    expect(entradas).toMatch(/consignacao_sem_custo\s+check \(modalidade <> 'consignacao' or valor_entrada = 0\)/);
    expect(entradas).toMatch(
      /parceria_exige_preco\s+check \(modalidade <> 'parceria' or parceria_preco_entrada is not null\)/,
    );
    // Posse de terceiro e modalidade andam juntas nos DOIS sentidos (`=`):
    // consignação/parceria são de terceiro, e nada mais é.
    expect(entradas).toMatch(
      /terceiro_sem_posse\s+check \(\(posse = 'terceiro'\) = \(modalidade in \('consignacao','parceria'\)\)\)/,
    );
    expect(entradas).toMatch(/lote_momento_b\s+check \(modalidade <> 'lote'\)/);
  });

  it("uma aquisição ativa por veículo — unique parcial", () => {
    expect(entradas).toMatch(
      /create unique index if not exists veiculo_entradas_uma_ativa\s+on public\.veiculo_entradas \(veiculo_id\) where ativa/,
    );
  });

  it("a troca aponta para a venda de origem por FK de verdade", () => {
    // A fatia b anunciou a coluna; a g fecha o elo, depois que `negocios` existe.
    expect(SQL.get("20260829120600_f0g_negocios.sql")!).toMatch(
      /add constraint veiculo_entradas_venda_origem_fk\s+foreign key \(venda_origem_id\) references public\.negocios\(id\)/,
    );
  });

  it("fechar negócio na mão continua proibido até a função atômica da F1", () => {
    const negocios = SQL.get("20260829120600_f0g_negocios.sql")!;
    expect(negocios).toMatch(/create trigger negocios_sem_fechamento_manual/);
    expect(negocios).toMatch(/new\.estado = 'fechado'/);
    expect(negocios).toMatch(/constraint pre_venda_exige_validade/);
  });
});

describe("os seeds transcrevem a spec — e só", () => {
  const razao = SQL.get("20260829120400_f0e_razao.sql")!;
  const parametros = SQL.get("20260829120500_f0f_parametros.sql")!;

  /**
   * As 15 contas da spec 30, uma a uma: código, natureza e um pedaço do nome.
   * O nome é conferido por fragmento porque a redação da migração pontua
   * diferente da spec ("Caixa e bancos" × "Caixa/bancos"); o que não pode mudar
   * é QUAL conta é QUAL — trocar a natureza de uma delas inverteria o DRE
   * inteiro sem nenhum erro de execução.
   */
  const PLANO_SPEC30: [string, string, RegExp][] = [
    ["1.1.1", "ativo", /caixa/i],
    ["1.1.2", "ativo", /a receber/i],
    ["1.1.3", "ativo", /estoque de ve/i],
    ["2.1.1", "passivo", /fornecedores/i],
    ["2.1.2", "passivo", /pessoal/i],
    ["2.1.3", "passivo", /sinais/i],
    ["2.1.4", "passivo", /terceiros a pagar/i],
    ["3.1.1", "receita", /receita de venda/i],
    ["3.1.2", "receita", /receita de repasse/i],
    ["3.2.1", "receita", /acess/i],
    ["4.1.1", "custo", /cmv/i],
    ["4.2.1", "despesa", /m[ií]dia/i],
    ["4.3.1", "despesa", /comiss/i],
    ["4.4.1", "despesa", /operacionais/i],
    ["5.1.1", "imposto", /impostos sobre venda/i],
  ];

  const contas = [
    ...fatia(razao, "insert into public.plano_contas", "on conflict (codigo) do nothing;").matchAll(
      /\('([\d.]+)',\s*'([^']*)',\s*'(\w+)'\)/g,
    ),
  ].map((m) => ({ codigo: m[1], nome: m[2], natureza: m[3] }));

  it("o plano de contas tem exatamente as 15 linhas da spec 30", () => {
    expect(contas.length).toBe(15);
    for (const [i, [codigo, natureza, nome]] of PLANO_SPEC30.entries()) {
      expect(contas[i]?.codigo, `conta ${i + 1} fora de ordem/ausente`).toBe(codigo);
      expect(contas[i]?.natureza, `natureza errada em ${codigo}`).toBe(natureza);
      expect(contas[i]?.nome, `nome de ${codigo}: ${contas[i]?.nome}`).toMatch(nome);
    }
    // E a migração se autoconfere contra o mesmo número.
    expect(razao).toMatch(/if n <> 15 then/);
  });

  it("nenhuma natureza foge do vocabulário do CHECK", () => {
    const check = /natureza\s+text not null check \(natureza in \(([^)]*)\)\)/.exec(razao);
    expect(check, "CHECK de natureza sumiu").not.toBeNull();
    const vocabulario = [...check![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(vocabulario.sort()).toEqual([
      "ativo",
      "custo",
      "despesa",
      "imposto",
      "passivo",
      "receita",
    ]);
    for (const c of contas) expect(vocabulario, `natureza inválida em ${c.codigo}`).toContain(c.natureza);
  });

  it("as regras de contabilização só apontam para contas que existem", () => {
    const bloco = fatia(razao, "insert into public.regras_contabilizacao", "on conflict do nothing;");
    const codigos = [...bloco.matchAll(/'(\d\.\d\.\d)'/g)].map((m) => m[1]);
    expect(codigos.length).toBeGreaterThanOrEqual(20); // 10 regras × 2 pernas
    const validos = new Set(contas.map((c) => c.codigo));
    for (const c of codigos) expect(validos, `regra aponta para conta inexistente: ${c}`).toContain(c);
  });

  it("`regras_comissao` existe e NÃO tem seed — o valor é decisão do dono", () => {
    // Pendência declarada no levantamento do handoff. Semear um número aqui
    // seria inventar comissão, e a F1 passaria a pagar sobre ele.
    expect(F0).toMatch(/create table if not exists public\.regras_comissao/);
    expect(F0, "alguém semeou comissão — o número não é nosso").not.toMatch(
      /insert\s+into\s+public\.regras_comissao/i,
    );
  });

  it("a curva de deságio é a da spec 11: base 20, estado −5, piso 15, teto 40", () => {
    const seed = fatia(parametros, "insert into public.parametros_avaliacao", "where not exists");
    // A ordem das colunas importa tanto quanto os números: trocar piso e teto
    // não daria erro nenhum e inverteria a régua de compra.
    expect(seed).toMatch(
      /\(base_pp, estado_excepcional_pp, piso_pct, teto_pct, degraus_km,/,
    );
    expect(seed).toMatch(/select\s+20, -5, 15, 40,/);
    expect(parametros).toMatch(/constraint piso_abaixo_do_teto check \(piso_pct < teto_pct\)/);
    // E a autoconferência cobra os mesmos três números contra o banco.
    expect(parametros).toMatch(/pa\.base_pp <> 20 or pa\.piso_pct <> 15 or pa\.teto_pct <> 40/);
  });

  it("os degraus de km e as faixas de avaria são os da spec 11", () => {
    const seed = fatia(parametros, "insert into public.parametros_avaliacao", "where not exists");
    const json = /'(\[[\s\S]*?\])'::jsonb/.exec(seed);
    expect(json, "degraus_km não encontrados").not.toBeNull();
    const degraus = JSON.parse(json![1]) as { desvio_km_ate: number | null; pp: number }[];
    expect(degraus).toEqual([
      { desvio_km_ate: 5000, pp: 0 },
      { desvio_km_ate: 15000, pp: 2 },
      { desvio_km_ate: 30000, pp: 4 },
      { desvio_km_ate: 50000, pp: 7 },
      { desvio_km_ate: null, pp: 10 },
    ]);
    // avaria leve +2 a +4 | avaria séria +8 a +12 | pendência +3 a +5.
    expect(seed).toMatch(/numrange\(2, 4, '\[\]'\), numrange\(8, 12, '\[\]'\), numrange\(3, 5, '\[\]'\)/);
  });

  it("as faixas de recompra são as da Emenda 02: 85/80 e 80/75", () => {
    const seed = fatia(parametros, "insert into public.ciclo_parametros", "where not exists");
    const json = /'(\{"em_dia[\s\S]*?\})'::jsonb/.exec(seed);
    expect(json, "percentuais da recompra não encontrados").not.toBeNull();
    const pct = JSON.parse(json![1]) as Record<string, { troca: number; dinheiro: number } | null>;
    expect(pct.em_dia).toEqual({ troca: 85, dinheiro: 80 });
    expect(pct.recuperada).toEqual({ troca: 80, dinheiro: 75 });
    // "Fora" é extinção, não percentual pior: o carro volta à avaliação normal.
    expect(pct.fora).toBeNull();
    // Crédito em troca > dinheiro POR DESENHO (manual v1.2 §5.5): a recompra
    // existe para trazer o cliente de volta, não para comprar carro.
    expect(pct.em_dia!.troca).toBeGreaterThan(pct.em_dia!.dinheiro);
    expect(pct.recuperada!.troca).toBeGreaterThan(pct.recuperada!.dinheiro);
  });

  it("a régua de revisões é a da Emenda 01, que já opera na Garagem", () => {
    const seed = fatia(parametros, "insert into public.ciclo_parametros", "where not exists");
    // 10.000 km ou 12 meses; tolerância de 30 dias ou 1.000 km; 1 recuperação
    // por ciclo em até 60 dias; franquia de 15.000 km/ano.
    expect(seed).toMatch(/select\s+10000, 12, 30, 1000, 30, 60, 1, 15000,/);
    expect(parametros).toMatch(
      /cp\.intervalo_km <> 10000 or cp\.intervalo_meses <> 12/,
    );
  });

  it("seed de regra não referencia evento nem modalidade fora dos enums", () => {
    const enums = (nome: string) => {
      const bloco = fatia(
        SQL.get("20260829120000_f0a_org_e_enums.sql")!,
        `create type public.${nome} as enum`,
        ");",
      );
      return [...bloco.matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]);
    };
    const eventos = enums("evento_tipo");
    const modalidades = enums("modalidade_tipo");
    expect(eventos.length).toBe(29);
    expect(modalidades.length).toBe(6);

    const bloco = fatia(razao, "insert into public.regras_contabilizacao", "on conflict do nothing;");
    for (const m of bloco.matchAll(/\('([A-Z_]+)', '(\w+)', (?:'(\w+)'|null)/g)) {
      expect(eventos, `evento fora do enum no seed: ${m[1]}`).toContain(m[1]);
      if (m[3]) expect(modalidades, `modalidade fora do enum no seed: ${m[3]}`).toContain(m[3]);
    }
  });
});

describe("nenhum contrato antes da validação D13", () => {
  it("`seed_validado_em` não é preenchido por migração nenhuma da F0", () => {
    // Manual v1.2 §1.4: assinar recompra exige parecer jurídico +
    // provisionamento + seeds validados contra o praticado por perfil. A coluna
    // nula é o que segura o gatilho — preenchê-la aqui seria dar por validado o
    // que só o dono valida.
    const usos = F0.split(/\r?\n/).filter((l) => l.includes("seed_validado_em"));
    // Duas linhas de PROSA citam a coluna e não gravam nada: o `comment on
    // table` e a `descricao` do próprio seed. As duas são literais de texto
    // sozinhos na linha — ficam de fora da contagem, o que sobra é código.
    const codigo = usos.filter((l) => !/^\s*'.*'\s*;?\s*$/.test(l));
    // Eram 2 até 2026-08-29. A f0m acrescentou o TRIGGER que impede a API de
    // carimbar a coluna — o ataque adversarial provou que um `comercial`
    // encerrava a vigência, inseria recompra a 150% da FIPE e dava o carimbo
    // que só o dono pode dar. As linhas novas PROTEGEM a coluna; nenhuma a
    // preenche, e é isso que as asserções abaixo continuam exigindo.
    expect(codigo.length, `usos inesperados de seed_validado_em:\n${codigo.join("\n")}`).toBe(4);
    // 1º uso: a definição da coluna — nullable, sem default, sem not null.
    expect(codigo[0]).toMatch(/seed_validado_em\s+date,/);
    expect(codigo[0]).not.toMatch(/not null|default/i);
    // 2º uso: a autoconferência que recusa um seed que nasça validado.
    expect(codigo[1]).toMatch(/seed_validado_em is not null/);
    expect(F0).toMatch(/ACEITE FALHOU: seed não pode nascer validado/);
    // 3º e 4º: o guarda da f0m — condição do trigger e a mensagem do erro.
    expect(codigo[2]).toMatch(/new\.seed_validado_em is not null/);
    expect(codigo[3]).toMatch(/seed_validado_em é decisão do dono/);
    expect(F0).toMatch(/ciclo_parametros_seed_do_dono/);

    // E nenhum INSERT/UPDATE toca a coluna.
    expect(F0).not.toMatch(/set\s+seed_validado_em/i);
    for (const m of F0.matchAll(/insert into public\.ciclo_parametros\s*\(([^)]*)\)/g)) {
      expect(m[1], "coluna validada num insert de migração").not.toContain("seed_validado_em");
    }
  });

  it("a mecânica da recompra vive em `ciclo_parametros`, com vigência", () => {
    // Regra 5 do CLAUDE.md: percentual nunca hardcoded. A tabela tem vigência e
    // o guarda D-T1.7 impede reescrever a linha vigente.
    const p = SQL.get("20260829120500_f0f_parametros.sql")!;
    expect(p).toMatch(/vigencia_desde\s+date not null default current_date/);
    expect(p).toMatch(/vigencia_ate\s+date,/);
    expect(p).toMatch(
      /create trigger ciclo_parametros_vigencia\s+before update on public\.ciclo_parametros/,
    );
  });

  it("parâmetro vigente não sofre UPDATE de valor (D-T1.7)", () => {
    const guarda = fatia(
      SQL.get("20260829120400_f0e_razao.sql")!,
      "create or replace function public.nucleo_so_encerra_vigencia()",
      "$$;",
    );
    // Registro antigo tem que guardar os parâmetros do dia em que nasceu.
    expect(guarda).toMatch(/old\.vigencia_ate is not null/);
    expect(guarda).toMatch(/to_jsonb\(new\) - 'vigencia_ate' <> to_jsonb\(old\) - 'vigencia_ate'/);
    expect(guarda).toMatch(/raise exception/i);
  });
});

describe("a situação é projeção — a tabela-verdade", () => {
  const situacao = SQL.get("20260829120800_f0i_situacao.sql")!;

  /** Cada caso da tabela-verdade: eventos → situação esperada. */
  const casos = [
    ...fatia(situacao, "select * from (values", ") as t(tipos, esperado, rotulo)").matchAll(
      /\(\s*(array\[[^\]]*\]|'\{\}')::public\.evento_tipo\[\],\s*'(\w+)',\s*'([^']*)'\s*\)/g,
    ),
  ].map((m) => ({
    tipos: m[1] === "'{}'" ? [] : [...m[1].matchAll(/'([A-Z_]+)'/g)].map((t) => t[1]),
    esperado: m[2],
    rotulo: m[3],
  }));

  it("tem pelo menos 15 casos, e o aceite conta os mesmos", () => {
    expect(casos.length).toBeGreaterThanOrEqual(15);
    // O `raise notice` anuncia um número; se ele e a tabela divergirem, alguém
    // acrescentou caso sem olhar o rodapé — e o próximo leitor confia no aviso.
    const anunciado = /F0-i OK: (\d+) casos/.exec(situacao);
    expect(anunciado, "o aviso final deixou de anunciar quantos casos rodaram").not.toBeNull();
    expect(Number(anunciado![1])).toBe(casos.length);
  });

  it("as seis situações da spec 00 aparecem", () => {
    const situacoes = new Set(casos.map((c) => c.esperado));
    expect([...situacoes].sort()).toEqual([
      "devolvido",
      "estoque",
      "fora",
      "preparacao",
      "reservado",
      "vendido",
    ]);
  });

  it("os desfechos que doem estão cobertos", () => {
    const mapa = new Map(casos.map((c) => [c.tipos.join(">"), c.esperado]));
    const esperar = (seq: string, alvo: string) =>
      expect(mapa.get(seq), `caso ausente ou divergente: [${seq}]`).toBe(alvo);

    esperar("", "estoque"); // unidade sem evento é estoque, não "indefinida"
    esperar("ENTRADA>PREPARACAO_INICIO", "preparacao");
    esperar("ENTRADA>PRE_VENDA_LANCADA>SINAL", "reservado"); // sinal não fecha venda
    esperar("ENTRADA>PRE_VENDA_LANCADA>PRE_VENDA_CANCELADA", "estoque");
    esperar("ENTRADA>REPASSE_SAIDA", "vendido"); // repasse é saída
    esperar("ENTRADA>VENDA>ESTORNO_VENDA", "estoque"); // estorno devolve à vitrine
    esperar("ENTRADA>DEVOLUCAO_TERCEIRO", "devolvido");
    esperar("ENTRADA>BLOQUEIO", "fora");
    esperar("ENTRADA>BLOQUEIO>DESBLOQUEIO", "estoque");
    esperar("ENTRADA>ESTORNO_ENTRADA", "fora");
    esperar("ENTRADA>CUSTO_LANCADO>PUBLICACAO", "estoque"); // custo/anúncio não movem
    esperar("ENTRADA>VENDA>CICLO_ABERTO>REVISAO_REGISTRADA", "vendido");
  });

  it("todo evento que a função trata tem caso na tabela", () => {
    // O comentário da função pede: "mudou a função, mude a tabela junto".
    const corpo = fatia(situacao, "foreach t in array tipos loop", "end case;");
    const tratados = new Set([...corpo.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]));
    expect(tratados.size).toBeGreaterThanOrEqual(13);
    const usados = new Set(casos.flatMap((c) => c.tipos));
    for (const t of tratados) {
      expect(usados, `evento ${t} muda a situação e não tem caso na tabela-verdade`).toContain(t);
    }
  });

  it("nenhum evento da tabela-verdade está fora do enum", () => {
    const bloco = fatia(
      SQL.get("20260829120000_f0a_org_e_enums.sql")!,
      "create type public.evento_tipo as enum",
      ");",
    );
    const enumEventos = [...bloco.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    for (const t of new Set(casos.flatMap((c) => c.tipos))) {
      expect(enumEventos, `evento inexistente no enum: ${t}`).toContain(t);
    }
  });

  it("`situacao` não é coluna de tabela nenhuma", () => {
    // Decisão 1 do handoff: situação é projeção. Uma coluna editável seria uma
    // segunda verdade, e a primeira divergência seria silenciosa.
    for (const { nome, corpo } of TABELAS) {
      expect(corpo, `${nome} ganhou coluna situacao`).not.toMatch(/^\s*situacao\s+\w/m);
    }
    expect(situacao).toMatch(/create or replace view public\.veiculo_situacao/);
    // security_invoker: a RLS de quem pergunta vale na view.
    expect(situacao).toMatch(/with \(security_invoker = true\)/);
  });
});

describe("uma linha vigente por régua", () => {
  const f0j = SQL.get("20260829121000_f0j_unicidade_de_vigencia.sql")!;

  it("os quatro índices únicos parciais existem", () => {
    // O guarda D-T1.7 tranca UPDATE, mas nada impedia DUAS linhas vigentes da
    // mesma regra — e regra dobrada vira contabilização dobrada na F1.
    for (const idx of [
      "regras_contabilizacao_uma_vigente",
      "regras_comissao_uma_vigente",
      "parametros_avaliacao_um_vigente",
      "ciclo_parametros_um_vigente",
    ]) {
      expect(f0j, `índice ${idx} sumiu`).toMatch(
        new RegExp(`create unique index if not exists ${idx}[\\s\\S]*?where vigencia_ate is null`),
      );
    }
  });

  it("a regra de contabilização usa `nulls not distinct`", () => {
    // Sem isso, "modalidade nula" duplicaria à vontade: no Postgres, NULL é
    // distinto de NULL para índice único por padrão.
    expect(f0j).toMatch(
      /on public\.regras_contabilizacao \(evento, papel, modalidade, saida\)\s+nulls not distinct/,
    );
  });
});

// ---------------------------------------------------------------------------
// A trava do sync (F0-k) — um contrato de três pontas
// ---------------------------------------------------------------------------

/**
 * O adendo do dono de 2026-08-29: veículo cadastrado no /admin não é alterado
 * pelo sync do RevendaMais.
 *
 * A trava é um trigger porque o n8n autentica com `SUPABASE_SERVICE_ROLE_KEY` —
 * ou seja, passa por cima da RLS. Só o Postgres o segura.
 *
 * E ela reconhece o sync por uma ASSINATURA: a escrita que mexe em
 * `last_seen_at`. Isso amarra três coisas que vivem em lugares diferentes e
 * ninguém revisa juntas:
 *
 *   1. o workflow do n8n precisa continuar mandando `last_seen_at` no upsert —
 *      tirar o campo não quebra nada visível, e a trava simplesmente para de
 *      reconhecer o sync, que volta a sobrescrever veículo do painel EM
 *      SILÊNCIO;
 *   2. nenhuma rota de `src/` pode ESCREVER `last_seen_at` — se uma escrever, o
 *      painel passa a se assinar como sync e a trava desmonta pelo outro lado;
 *   3. a migração precisa manter os dois triggers e a faixa de id.
 *
 * Ler `last_seen_at` em `src/` é livre e comum (é a janela do último sync na
 * vitrine). O que não pode é gravar.
 */
describe("a trava do sync não pode se desmontar por descuido", () => {
  const RAIZ = join(__dirname, "..");
  const WORKFLOW = "Antigravity - Sincronizador de Estoque (estoque_motors).json";
  const f0k = SQL.get("20260829130000_f0k_cadastro_nativo_e_trava_do_sync.sql")!;

  type Cabecalho = { name: string; value: string };
  type NoDoWorkflow = {
    name: string;
    type: string;
    parameters: {
      url?: string;
      method?: string;
      body?: string;
      headerParameters?: { parameters: Cabecalho[] };
    };
  };

  /** O JSON do workflow, lido como texto e parseado (imune a CRLF). */
  const workflow = JSON.parse(readFileSync(join(RAIZ, WORKFLOW), "utf8")) as {
    nodes: NoDoWorkflow[];
  };
  const upsert = workflow.nodes.find((n) => /^Upsert Ve.culo/u.test(n.name));
  const cabecalhos = (): Cabecalho[] => upsert!.parameters.headerParameters?.parameters ?? [];

  it("o nó de upsert do sync existe e continua apontando para estoque_motors", () => {
    expect(upsert, `nó de upsert não encontrado em ${WORKFLOW}`).toBeDefined();
    expect(upsert!.parameters.url).toContain("/rest/v1/estoque_motors");
    expect(upsert!.parameters.method).toBe("POST");
    // `resolution=merge-duplicates` é o que faz do POST um upsert.
    expect(cabecalhos().find((h) => h.name === "Prefer")?.value).toContain("merge-duplicates");
  });

  it("o body do upsert ainda carimba `last_seen_at` — é a assinatura do sync", () => {
    // ESTE é o alarme: quem editar o workflow e tirar o campo faz a trava
    // deixar de reconhecer o sync, e o veículo do painel volta a ser
    // sobrescrito sem erro nenhum aparecer em lugar nenhum.
    const body = String(upsert!.parameters.body);
    expect(body, "o upsert do sync deixou de mandar last_seen_at").toContain("last_seen_at");
    expect(body).toMatch(/last_seen_at:\s*new Date\(\)\.toISOString\(\)/);
    // O id vem do feed (faixa 6,1M–8,4M), nunca da sequence nativa.
    expect(body).toMatch(/\bid:\s*\$json\.id\b/);
  });

  it("o sync autentica com a chave de serviço — por isso a trava é trigger, não RLS", () => {
    const auth = cabecalhos().find((h) => h.name === "Authorization")?.value ?? "";
    expect(auth).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(cabecalhos().find((h) => h.name === "apikey")?.value).toContain(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
  });

  // -------------------------------------------------------------------------
  // Lado do código: `src/` lê o carimbo, nunca escreve
  // -------------------------------------------------------------------------

  /** Todos os .ts/.tsx de `src/`, com caminho relativo em barras normais. */
  const fontes = ((): string[] => {
    const achados: string[] = [];
    const andar = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const caminho = join(dir, e.name);
        if (e.isDirectory()) andar(caminho);
        else if (/\.tsx?$/.test(e.name)) achados.push(caminho);
      }
    };
    andar(join(RAIZ, "src"));
    // `relative` devolve separador do SO; normalizar evita a armadilha de
    // comparar caminho do `join` com string escrita à mão no Windows.
    return achados.map((a) => relative(RAIZ, a).split(sep).join("/"));
  })();

  /** Só os que mencionam o carimbo FORA de comentário — quem não cita, não grava. */
  const citam = fontes.filter((f) => lerCodigo(f).includes("last_seen_at"));

  /** Os argumentos de uma chamada, do `(` até o `)` que o fecha. */
  function argumentosDe(codigo: string, aberturaIdx: number): string {
    let nivel = 0;
    for (let i = aberturaIdx; i < codigo.length; i++) {
      if (codigo[i] === "(") nivel++;
      else if (codigo[i] === ")") {
        nivel--;
        if (nivel === 0) return codigo.slice(aberturaIdx, i + 1);
      }
    }
    return codigo.slice(aberturaIdx);
  }

  it("o varredor está lendo os arquivos que já leem o carimbo", () => {
    // A trava contra o teste vazio: se a varredura parar de achar arquivo, os
    // dois testes seguintes passariam sem olhar nada.
    expect(fontes.length).toBeGreaterThan(50);
    expect(citam.length).toBeGreaterThanOrEqual(4);
    for (const conhecido of ["src/lib/supabase.ts", "src/components/admin/EditorDeVeiculo.tsx"]) {
      expect(citam, `leitor conhecido sumiu da varredura: ${conhecido}`).toContain(conhecido);
    }
  });

  it("nenhum insert/update/upsert de `src/` leva `last_seen_at` junto", () => {
    const infratores: string[] = [];
    for (const arquivo of citam) {
      const codigo = lerCodigo(arquivo);
      for (const m of codigo.matchAll(/\.(insert|update|upsert)\s*\(/g)) {
        const args = argumentosDe(codigo, m.index! + m[0].length - 1);
        if (args.includes("last_seen_at")) infratores.push(`${arquivo}: .${m[1]}(...)`);
      }
    }
    expect(
      infratores,
      "escrita de last_seen_at no app — o painel passaria a se assinar como sync e a trava da f0k desmonta:\n" +
        infratores.join("\n"),
    ).toEqual([]);
  });

  it("as menções a `last_seen_at` em `src/` são leitura ou tipo, nunca atribuição", () => {
    const suspeitas: string[] = [];
    for (const arquivo of citam) {
      const codigo = lerCodigo(arquivo);
      // `last_seen_at = ...` (e não `==`/`===`): atribuição direta.
      if (/last_seen_at\s*=[^=]/.test(codigo)) suspeitas.push(`${arquivo}: atribuição direta`);
      // `last_seen_at: <valor>` que não seja anotação de tipo.
      for (const m of codigo.matchAll(/last_seen_at\??\s*:\s*([^,;\n}]+)/g)) {
        const valor = m[1].trim();
        if (!/^(string|number|boolean|Date|any|unknown|null|undefined)\b/.test(valor)) {
          suspeitas.push(`${arquivo}: last_seen_at: ${valor}`);
        }
      }
    }
    expect(suspeitas, `gravação de last_seen_at em src/:\n${suspeitas.join("\n")}`).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Lado do banco: os dois triggers e a faixa
  // -------------------------------------------------------------------------

  it("a origem é inferida no INSERT, não confiada a quem chama", () => {
    // Se a rota do admin esquecer de mandar `origem`, o veículo nasceria 'sync'
    // e viraria alvo do RevendaMais — exatamente o que o dono mandou impedir.
    expect(f0k).toMatch(
      /create trigger estoque_motors_marcar_origem\s+before insert on public\.estoque_motors/,
    );
    const fn = fatia(f0k, "create or replace function public.estoque_motors_marcar_origem()", "$$;");
    expect(fn).toMatch(/if new\.id >= 900000001 then/);
    expect(fn).toMatch(/new\.origem := 'painel'/);
    // Nativo nasce sem carimbo: ele nunca veio em sync nenhum.
    expect(fn).toMatch(/new\.last_seen_at := null/);
    expect(fn).toMatch(/new\.origem := coalesce\(new\.origem, 'sync'\)/);
  });

  it("a trava é BEFORE UPDATE, reconhece o sync pelo carimbo e ignora em silêncio", () => {
    expect(f0k).toMatch(
      /create trigger estoque_motors_trava_do_sync\s+before update on public\.estoque_motors/,
    );
    const fn = fatia(f0k, "create or replace function public.estoque_motors_trava_do_sync()", "$$;");
    expect(fn).toMatch(
      /old\.origem = 'painel' and new\.last_seen_at is distinct from old\.last_seen_at/,
    );
    // RETURN OLD, não RAISE: o sync processa o feed em lote, e uma exceção
    // mataria os veículos legítimos do lote por causa de um alheio.
    expect(fn).toMatch(/return old;/);
    expect(fn).not.toMatch(/raise exception/i);
    // A origem não se troca por UPDATE: quem nasceu no painel morre no painel.
    expect(fn).toMatch(/new\.origem is distinct from old\.origem/);
    expect(fn).toMatch(/new\.origem := old\.origem/);
  });

  it("a faixa nativa é 900000001, e é a mesma em todo lugar", () => {
    // Mexer neste número em um só lugar faz feed e nativo colidirem — e a
    // colisão aparece como veículo do painel sendo sobrescrito, que é o bug que
    // a fatia inteira existe para impedir.
    expect(f0k).toMatch(
      /create sequence if not exists public\.estoque_motors_nativo_seq\s+as integer start with 900000001 minvalue 900000001 no cycle/,
    );
    expect(f0k).toMatch(/alter column id set default nextval\('public\.estoque_motors_nativo_seq'\)/);
    const faixas = new Set([...f0k.matchAll(/\b9\d{8}\b/g)].map((m) => m[0]));
    expect(faixas, `faixa nativa divergente entre os pontos: ${[...faixas]}`).toEqual(
      new Set(["900000001"]),
    );
  });

  it("a coluna `origem` é aditiva e com vocabulário fechado", () => {
    // Exceção deliberada e aditiva a "estoque_motors intocada até a F2":
    // coluna nova com default, nada renomeado, nada removido.
    expect(f0k).toMatch(
      /alter table public\.estoque_motors\s+add column if not exists origem text not null default 'sync'/,
    );
    expect(f0k).toMatch(/check \(origem in \('sync','painel'\)\)/);
    // As linhas que já existiam são do sync, e o default diz isso sem backfill
    // nenhum — a autoconferência cobra exatamente esse ponto.
    expect(f0k).toMatch(/FALHOU: linha pré-existente saiu de origem=sync/);
  });

  it("a autoconferência simula o sync atacando um nativo", () => {
    expect(f0k).toMatch(/set preco = 99999, marca = 'SobrescritoPeloSync', last_seen_at = now\(\)/);
    expect(f0k).toMatch(/A TRAVA FALHOU: sync alterou nativo/);
    // E os dois lados do contrato: o painel edita, e o sync segue dono do dele.
    expect(f0k).toMatch(/FALHOU: o painel não conseguiu editar o próprio veículo/);
    expect(f0k).toMatch(/FALHOU: o sync deixou de atualizar veículo que é dele/);
  });
});
