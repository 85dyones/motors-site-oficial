import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * A agenda de pessoas é de toda a equipe; o lead, não (dono, 05/10).
 *
 * O comportamento é provado no banco — o aceite da migração, que roda nos dois
 * mundos da RLS de `leads`, e `tests/migracoes-executam.test.ts`, que a aplica
 * antes e depois da 20261003130000. Este arquivo roda SEM Postgres e prova o
 * texto: o que é diretório e o que é comercial, o que a migração promete não
 * tocar, que as cópias que ela carrega (os ramos da 20260828160000, a policy
 * da 20261003130000) continuam iguais às originais, e que o ensaio executa o
 * mesmo DDL que a migração (um ensaio que diverge ensaia outra coisa).
 */
const VERSAO = "20261005150000";
const NOME = "agenda_para_toda_a_equipe";
const RAIZ = join(__dirname, "..");
const MIGRACOES = join(RAIZ, "supabase", "migrations");
const ARQUIVO = join(MIGRACOES, `${VERSAO}_${NOME}.sql`);
const ENSAIO = join(RAIZ, "supabase", "ensaios", `${NOME}_ensaio.sql`);
const VIEW_ANTERIOR = join(MIGRACOES, "20260828160000_desfecho_sem_oportunidade.sql");
const ESCOPO = join(MIGRACOES, "20261003130000_leads_rls_por_escopo.sql");

const semComentario = (texto: string) => texto.replace(/--[^\n]*/g, "");
const ler = (caminho: string) => (existsSync(caminho) ? readFileSync(caminho, "utf8") : "");
const junto = (texto: string) => texto.replace(/\s+/g, " ").trim();

const sql = semComentario(ler(ARQUIVO));
const ensaio = semComentario(ler(ENSAIO));
const viewAnterior = semComentario(ler(VIEW_ANTERIOR));
const escopo = semComentario(ler(ESCOPO));

/** Tudo antes do aceite: é o que a migração DEIXA no banco. */
const oQueFica = sql.slice(0, sql.indexOf("do $aceite$"));

/** Os ramos da view, na ordem em que o arquivo os escreve. */
const ramos = (texto: string) => [...texto.matchAll(/\$ramo\$([\s\S]*?)\$ramo\$/g)].map((m) => junto(m[1]));

/** As colunas que um trecho lê de um apelido (`l.nome` → `nome`). */
const colunasDe = (trecho: string, apelido: string) =>
  [...new Set([...trecho.matchAll(new RegExp(`\\b${apelido}\\.(\\w+)`, "g"))].map((m) => m[1]))].sort();

const funcao = (texto: string, nome: string) =>
  texto.match(new RegExp(`create (?:or replace )?function public\\.${nome}\\(\\)([\\s\\S]*?\\$fn\\$;)`))?.[1] ?? "";

const DIRETORIO = ["ativo", "created_at", "email", "id", "nome", "telefone"];

describe("migração: a agenda para toda a equipe", () => {
  it("os dois arquivos existem, e a versão vem depois das duas pendentes", () => {
    expect(existsSync(ARQUIVO)).toBe(true);
    expect(existsSync(ENSAIO)).toBe(true);
    expect(VERSAO > "20261005120000").toBe(true);
  });

  it("o diretório roda como dono, só para a equipe ativa, e devolve seis colunas", () => {
    const corpo = junto(funcao(oQueFica, "pessoas_dos_leads"));
    expect(corpo, "não achei pessoas_dos_leads()").not.toBe("");
    expect(corpo).toContain(
      "returns table ( id uuid, nome text, telefone text, email text, ativo boolean, created_at timestamptz )",
    );
    expect(corpo).toMatch(/language sql stable security definer set search_path = ''/);
    expect(corpo).toContain("where (select public.is_staff((select auth.uid())));");
  });

  it("o diretório não lê coluna comercial: nem etapa, nem responsável, nem anotação", () => {
    const corpo = funcao(oQueFica, "pessoas_dos_leads");
    // `desfecho` entra só para dizer ativo/inativo, o filtro padrão da tela.
    expect(colunasDe(corpo, "l")).toEqual(["created_at", "desfecho", "email", "id", "nome", "telefone"]);
    expect(junto(corpo)).toContain("(l.desfecho is null or l.desfecho = 'ganho'),");
    expect(corpo).not.toMatch(
      /\b(situacao|responsavel|interesse|observacoes|proximo_passo|desfecho_motivo|desfecho_valor|avaliacao|perfil|veiculo_id|canal)\b/,
    );
  });

  it("anon e PUBLIC não executam o diretório; authenticated e service_role, sim", () => {
    expect(junto(oQueFica)).toContain("revoke all on function public.pessoas_dos_leads() from public, anon;");
    expect(junto(oQueFica)).toContain(
      "grant execute on function public.pessoas_dos_leads() to authenticated, service_role;",
    );
    expect(oQueFica).not.toMatch(/\bto\s+anon\b/i);
    expect(junto(oQueFica)).toContain("revoke all on public.agenda_de_pessoas from anon;");
  });

  it("no ramo novo, a parte comercial sai SÓ de `leads` na pele de quem pergunta", () => {
    const todos = ramos(oQueFica);
    const novo = todos[todos.length - 1];
    expect(novo).toContain(
      "from public.leads l full join public.pessoas_dos_leads() d on d.id = l.id left join public.funil_etapas e on e.chave = l.situacao",
    );
    // Do diretório, só as seis colunas dele.
    expect(colunasDe(novo, "d")).toEqual(DIRETORIO);
    // As duas colunas comerciais não têm `d.` nem `coalesce` com o diretório.
    expect(novo).toContain("'lead'::text, coalesce(e.rotulo, l.situacao), null::text,");
    expect(novo).toContain(
      "nullif(concat_ws(' — ', nullif(trim(l.interesse), ''), nullif(trim(l.observacoes), '')), ''),",
    );
    for (const c of ["situacao", "interesse", "observacoes"]) {
      expect(novo, `${c} não pode vir do diretório`).not.toMatch(new RegExp(`\\bd\\.${c}\\b`));
    }
  });

  it("a view continua security_invoker, e a migração para se a do banco não for a conhecida", () => {
    const criacoes = [...oQueFica.matchAll(/create or replace view public\.agenda_de_pessoas '\s*\|\| '([^']*)'/g)];
    expect(criacoes).toHaveLength(1);
    expect(criacoes[0][1]).toContain("with (security_invoker = true) as");
    expect(oQueFica).toContain("pg_get_viewdef('public.agenda_de_pessoas'::regclass)");
    expect(junto(oQueFica)).toMatch(/if v_estado is null then raise exception 'DIVERGÊNCIA:/);
    // A comparação vem ANTES de qualquer DDL.
    expect(oQueFica.indexOf("if v_estado is null then")).toBeLessThan(oQueFica.indexOf("create or replace function"));
  });

  it("os quatro ramos que não são de leads, e o de leads que ela espera achar, são os da 20260828160000", () => {
    const anteriores = ramos(viewAnterior);
    const daqui = ramos(oQueFica);
    expect(anteriores).toHaveLength(5);
    expect(daqui).toHaveLength(6); // os quatro comuns, o de leads antigo e o novo
    expect(daqui.slice(0, 5)).toEqual(anteriores);
  });

  it("não cria, troca nem apaga policy, coluna ou gatilho de `leads` — fora da sonda do aceite", () => {
    expect(oQueFica).not.toMatch(/(create|drop|alter)\s+policy/i);
    expect(oQueFica).not.toMatch(/alter\s+table/i);
    expect(oQueFica).not.toMatch(/create\s+(or\s+replace\s+)?trigger/i);
    expect(oQueFica).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\./i);
    expect(sql).not.toMatch(/estoque_motors/);
    // No aceite, a troca de mundo fica entre o início da sonda e o sentinela,
    // e o retrato das policies é conferido depois.
    const aceite = sql.slice(sql.indexOf("do $aceite$"));
    const sonda = aceite.slice(0, aceite.indexOf("when sqlstate 'AGE01' then null;"));
    expect(aceite.match(/(create|drop)\s+policy/gi)?.length).toBe(4);
    expect(sonda.match(/(create|drop)\s+policy/gi)?.length).toBe(4);
    expect(sonda).toContain("raise exception 'DESFAZER_ACEITE_DA_AGENDA_PARA_TODA_A_EQUIPE' using errcode = 'AGE01';");
    expect(junto(aceite)).toContain("if v_txt is distinct from v_politicas then");
  });

  it("não entra na fila de `leads`: lock_timeout antes de tudo que a trava, e a recusa diz o que fazer", () => {
    const TRAVA = "set local lock_timeout = '3s';";
    const RECUSA = "Tente de novo em instantes; nada foi aplicado.";
    // No bloco da view: a primeira instrução, antes de ler ou recriar qualquer coisa.
    expect(junto(oQueFica)).toMatch(/v_estado text; begin set local lock_timeout = '3s'; if to_regclass/);
    // No aceite: dentro da sonda (o sentinela o desfaz) e antes da troca de policy.
    const aceite = sql.slice(sql.indexOf("do $aceite$"));
    expect(aceite.indexOf(TRAVA)).toBeGreaterThan(aceite.indexOf("\n  begin\n"));
    expect(aceite.indexOf(TRAVA)).toBeLessThan(aceite.search(/(create|drop)\s+policy/i));
    expect(sql.match(/when lock_not_available then/g)?.length).toBe(2);
    expect(sql.split(RECUSA).length - 1).toBe(2);
    // No ensaio: a primeira instrução do bloco único.
    expect(junto(ensaio)).toMatch(/v_resumo jsonb; begin set local lock_timeout = '3s';/);
    expect(junto(ensaio)).toContain("when lock_not_available then");
    expect(ensaio).toContain(RECUSA);
  });

  it("o mundo do escopo que o aceite simula é o da 20261003130000, letra por letra", () => {
    const policy = (texto: string) =>
      junto(texto.match(/create policy leads_leitura_por_escopo on public\.leads[\s\S]*?\n\s*\);/)?.[0] ?? "");
    expect(policy(escopo)).not.toBe("");
    expect(policy(sql)).toBe(policy(escopo));
    for (const f of ["escopo_de_leads", "meu_nome_de_responsavel"]) {
      expect(junto(funcao(escopo, f)), `não achei ${f} na 20261003130000`).not.toBe("");
      expect(junto(funcao(sql, f))).toBe(junto(funcao(escopo, f)));
    }
    // E o de `is_staff` é o da 20260828120000.
    expect(junto(sql)).toContain(
      "create policy leads_leitura_staff on public.leads for select to authenticated using (public.is_staff(auth.uid()));",
    );
  });

  it("o aceite cobra os dois mundos, quem vê o quê e quem não vê nada", () => {
    expect(sql).toContain("ACEITE FALHOU");
    expect(sql).toContain("Aceite verificado");
    expect(sql).toContain("for v_volta in 1..2 loop");
    expect(sql).toContain("if v_rodados <> 80 then");
    for (const caso of [
      "financeiro vê as quatro pessoas",
      "marketing vê as quatro pessoas",
      "filtrar pela nota não a revela",
      "financeiro em leads: o que a RLS manda",
      "…a parte comercial só dos leads dele",
      "…mas não a etapa nem a nota dele",
      "…com o comercial de todas",
      "cliente não vê pessoa de lead",
      "investidor não vê pessoa de lead",
      "perfil desativado não vê pessoa de lead",
      "anônimo não lê a agenda",
      "rpc: cliente recebe nada",
      "rpc: anônimo é barrado",
    ]) {
      expect(sql, `o aceite não tem o caso: ${caso}`).toContain(`'${caso}'`);
    }
  });

  it("se registra no livro-razão", () => {
    expect(sql).toMatch(new RegExp(`values\\s*\\('${VERSAO}',\\s*'${NOME}'\\)`));
  });
});

describe("ensaio: a agenda para toda a equipe", () => {
  /** Os pedaços de DDL, como a migração os escreve. */
  function pedacos(texto: string): string[] {
    const achados: string[] = [];
    const padroes = [
      /create (?:or replace )?function [\s\S]*?\$fn\$;/g,
      /\$ramo\$[\s\S]*?\$ramo\$/g,
      /execute 'create or replace view [\s\S]*?;/g,
      /execute 'create temp view [\s\S]*?;/g,
      /(?:create|drop) policy [\s\S]*?;/g,
      /^\s*(?:revoke|grant) [\s\S]*?;/gm,
    ];
    for (const p of padroes) for (const m of texto.matchAll(p)) achados.push(junto(m[0]));
    return achados;
  }

  it("é um bloco só, e termina no erro que desfaz tudo", () => {
    expect(ensaio.match(/^do \$\$/gm)?.length).toBe(1);
    expect(junto(ensaio)).toMatch(/raise exception 'ENSAIO_DESFEITO %', v_resumo::text; exception when lock_not_available then raise exception 'TRAVA OCUPADA: [^$]*nada foi aplicado\.'; end \$\$;$/);
    expect(ensaio).not.toContain("schema_migrations");
    expect(ensaio).not.toMatch(/\bcommit\b/i);
  });

  it("executa o MESMO DDL da migração, e a mesma troca de mundo do aceite", () => {
    const daMigracao = pedacos(sql);
    // 3 funções, 6 ramos, a view, 2 views temporárias, 4 policies e os grants.
    expect(daMigracao.length).toBeGreaterThanOrEqual(20);
    const doEnsaio = junto(ensaio);
    for (const pedaco of daMigracao) {
      expect(doEnsaio, `o ensaio não tem: ${pedaco.slice(0, 90)}…`).toContain(pedaco);
    }
  });

  it("e não tem DDL que a migração não tenha", () => {
    const daMigracao = new Set(pedacos(sql));
    for (const pedaco of pedacos(ensaio)) {
      expect(daMigracao.has(pedaco), `só o ensaio tem: ${pedaco.slice(0, 90)}…`).toBe(true);
    }
  });

  it("mede antes, depois e no outro mundo, por perfil real, sem devolver nome nem telefone", () => {
    expect(ensaio).toContain("for v_fase in 1..3 loop");
    for (const tipo of ["admin", "gestor", "sdr", "comercial", "financeiro", "marketing", "cliente", "investidor"]) {
      expect(ensaio).toContain(`'${tipo}'`);
    }
    for (const chave of ["pessoas_de_lead", "com_comercial", "outras_origens", "leads_que_ve", "tudo_confere"]) {
      expect(ensaio).toContain(`'${chave}'`);
    }
    const resumo = ensaio.slice(ensaio.indexOf("v_linha := jsonb_strip_nulls"));
    expect(resumo).not.toMatch(/full_name|\bnome\b|telefone|email/);
  });
});

describe("a ordem de aplicação está escrita na cadeia de teste", () => {
  const cadeia = ler(join(RAIZ, "tests", "migracoes-executam.test.ts"));
  const bloco = cadeia.slice(cadeia.indexOf("const CADEIA"), cadeia.indexOf("];", cadeia.indexOf("const CADEIA")));

  it("a agenda entra ANTES da RLS por escopo — a ordem recomendada em produção", () => {
    const daAgenda = bloco.indexOf(`"${VERSAO}_${NOME}.sql"`);
    const doEscopo = bloco.indexOf('"20261003130000_leads_rls_por_escopo.sql"');
    expect(daAgenda).toBeGreaterThan(-1);
    expect(doEscopo).toBeGreaterThan(-1);
    expect(daAgenda).toBeLessThan(doEscopo);
  });
});
