import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  MOTIVOS_DE_DESCARTE as MOTIVOS_DO_PAINEL,
  ROTULO_DO_MOTIVO_DE_DESCARTE,
} from "../src/lib/veiculosDeInteresse";

/**
 * Os veículos de interesse do lead (dono, 05/10): vários carros por lead, cada
 * um escolhido ou descartado com motivo, e o relatório por veículo.
 *
 * O comportamento é provado no banco — o aceite da migração e
 * `tests/migracoes-executam.test.ts`, que a roda nos dois mundos da RLS de
 * `leads`. Este arquivo roda SEM Postgres e prova o texto: o que a migração
 * promete não tocar, a lista de motivos, e que o ensaio executa o mesmo DDL e
 * a mesma carga que a migração (um ensaio que diverge ensaia outra coisa).
 */
const VERSAO = "20261005120000";
const NOME = "veiculos_de_interesse";
const RAIZ = join(__dirname, "..");
const ARQUIVO = join(RAIZ, "supabase", "migrations", `${VERSAO}_${NOME}.sql`);
const ENSAIO = join(RAIZ, "supabase", "ensaios", `${NOME}_ensaio.sql`);

const semComentario = (texto: string) => texto.replace(/--[^\n]*/g, "");
const ler = (caminho: string) => (existsSync(caminho) ? readFileSync(caminho, "utf8") : "");
const junto = (texto: string) => texto.replace(/\s+/g, " ").trim();

const sql = semComentario(ler(ARQUIVO));
const ensaio = semComentario(ler(ENSAIO));

/**
 * Os motivos de descarte e os rótulos vêm do painel
 * (`src/lib/veiculosDeInteresse.ts`): o CHECK da tabela, o comentário da
 * coluna e o mapa que a tela mostra não podem divergir.
 */
const MOTIVOS_DE_DESCARTE: readonly string[] = MOTIVOS_DO_PAINEL;

const entreAspas = (trecho: string) => [...trecho.matchAll(/'([^']+)'/g)].map((m) => m[1]);

/** Os pedaços de DDL e a carga, como a migração os escreve. */
function pedacos(texto: string): string[] {
  const achados: string[] = [];
  const padroes = [
    /create or replace function [\s\S]*?\$fn\$;/g,
    /create table if not exists public\.leads_veiculos \([\s\S]*?\n\s*\);/g,
    /create (?:unique )?index if not exists [\s\S]*?;/g,
    /create trigger [\s\S]*?;/g,
    /create policy [\s\S]*?;/g,
    /^\s*(?:revoke|grant) [\s\S]*?;/gm,
    /alter table public\.leads_veiculos enable row level security;/g,
    /insert into public\.leads_veiculos\s+\(lead_id, veiculo_id, veiculo_rotulo, veiculo_preco, situacao, criado_em, resolvido_em\)[\s\S]*?where l\.veiculo_id is not null;/g,
  ];
  for (const p of padroes) for (const m of texto.matchAll(p)) achados.push(junto(m[0]));
  return achados;
}

describe("migração: os veículos de interesse do lead", () => {
  it("os dois arquivos existem", () => {
    expect(existsSync(ARQUIVO)).toBe(true);
    expect(existsSync(ENSAIO)).toBe(true);
  });

  it("os motivos de descarte são os treze do dono, na ordem", () => {
    const trecho = sql.match(/constraint leads_veiculos_motivo_valido\s+check \(motivo_descarte is null\s+or motivo_descarte in \(([^)]*)\)\)/);
    expect(trecho, "não achei leads_veiculos_motivo_valido").not.toBeNull();
    expect(entreAspas(trecho![1])).toEqual([...MOTIVOS_DE_DESCARTE]);
    expect(MOTIVOS_DE_DESCARTE).toHaveLength(13);
  });

  it("cada motivo tem o rótulo documentado no comentário da coluna", () => {
    const comentario = sql.match(/comment on column public\.leads_veiculos\.motivo_descarte is([\s\S]*?);/);
    expect(comentario).not.toBeNull();
    for (const m of MOTIVOS_DE_DESCARTE) expect(comentario![1]).toContain(`${m} (`);
    // E o rótulo é o do painel, palavra por palavra. O comentário é uma
    // sequência de literais: juntos, antes de comparar.
    const texto = entreAspas(comentario![1]).join("");
    for (const m of MOTIVOS_DO_PAINEL) {
      expect(texto, `rótulo de ${m}`).toContain(`${m} (${ROTULO_DO_MOTIVO_DE_DESCARTE[m]}`);
    }
  });

  it("descartar exige motivo, 'outro' exige nota e só um carro é o escolhido", () => {
    expect(junto(sql)).toContain("check ((situacao = 'descartado') = (motivo_descarte is not null))");
    expect(junto(sql)).toContain("check (motivo_descarte is distinct from 'outro' or nullif(btrim(nota), '') is not null)");
    expect(junto(sql)).toMatch(
      /create unique index if not exists leads_veiculos_um_escolhido_por_lead on public\.leads_veiculos \(lead_id\) where situacao = 'escolhido';/,
    );
    expect(junto(sql)).toContain("constraint leads_veiculos_lead_veiculo_unico unique (lead_id, veiculo_id)");
  });

  it("estoque_motors fica intocada: sem FK, sem ALTER, sem gatilho, sem escrita", () => {
    expect(sql).not.toMatch(/references\s+public\.estoque_motors/i);
    expect(sql).not.toMatch(/alter\s+table\s+(only\s+)?public\.estoque_motors/i);
    expect(sql).not.toMatch(/\bon\s+public\.estoque_motors\b/i);
    expect(sql).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\.estoque_motors/i);
    // A chave é a de `leads.veiculo_id`: bigint, valor, sem FK.
    expect(junto(sql)).toContain("veiculo_id bigint not null,");
  });

  it("leads não ganha coluna, policy nem gatilho — o veículo principal segue com o painel", () => {
    expect(sql).not.toMatch(/alter\s+table\s+(only\s+)?public\.leads\b(?!_)/i);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?trigger[\s\S]{0,200}?\bon\s+public\.leads\b(?!_)/i);
    expect(sql).not.toMatch(/(create|drop)\s+policy[^;]*\bon\s+public\.leads\b(?!_)/i);
    // Fora do aceite (que mexe na sonda), nenhum UPDATE em `leads`.
    const semAceite = sql.slice(0, sql.indexOf("do $aceite$"));
    expect(semAceite).not.toMatch(/update\s+public\.leads\b(?!_)/i);
    expect(semAceite).not.toMatch(/\bdrop\s+(table|column)\b/i);
  });

  it("a RLS pergunta pelo lead na pele de quem chama, e apagar é do admin", () => {
    const policies = [...sql.matchAll(/create policy (\w+) on public\.leads_veiculos\s+for (\w+) to authenticated([\s\S]*?);/g)];
    expect(policies.map((p) => `${p[1]}:${p[2]}`)).toEqual([
      "leads_veiculos_leitura_pelo_lead:select",
      "leads_veiculos_inclusao_pelo_lead:insert",
      "leads_veiculos_atualizacao_pelo_lead:update",
      "leads_veiculos_exclusao_admin:delete",
    ]);
    for (const p of policies) {
      expect(junto(p[3])).toContain("exists (select 1 from public.leads l where l.id = leads_veiculos.lead_id)");
      expect(junto(p[3])).toContain("org_id = public.org_padrao()");
    }
    expect(policies[3][3]).toContain("public.is_admin(auth.uid())");
    expect(sql).toMatch(/revoke all on public\.leads_veiculos from public, anon, authenticated;/);
    expect(sql).not.toMatch(/to\s+anon\b/i);
  });

  it("os relatórios rodam como dono, com guarda de equipe, e não leem coluna de pessoa", () => {
    for (const f of ["resumo_de_interesse_do_veiculo", "interesse_por_veiculo"]) {
      const corpo = sql.match(new RegExp(`create or replace function public\\.${f}\\([\\s\\S]*?\\$fn\\$;`));
      expect(corpo, `não achei ${f}`).not.toBeNull();
      const texto = junto(corpo![0]);
      expect(texto).toMatch(/language plpgsql stable security definer set search_path = ''/);
      expect(texto).toContain("if not public.is_staff(auth.uid()) then");
      expect(texto).toContain("using errcode = 'insufficient_privilege'");
      expect(texto).not.toMatch(/\b(nome|telefone|email|responsavel|adicionado_por|resolvido_por|observacoes)\b/);
      // O lead só entra para dizer se já foi encerrado.
      expect(texto.match(/\bl\.\w+/g)?.filter((c) => c !== "l.id" && c !== "l.desfecho") ?? []).toEqual([]);
    }
  });

  it("a carga inicial só roda com a tabela vazia, e não inventa descarte", () => {
    const carga = sql.match(/do \$carga\$[\s\S]*?end \$carga\$;/);
    expect(carga).not.toBeNull();
    expect(junto(carga![0])).toContain("if exists (select 1 from public.leads_veiculos) then");
    expect(junto(carga![0])).toContain("case when l.desfecho = 'ganho' then 'escolhido' else 'em_avaliacao' end");
    expect(carga![0]).not.toContain("'descartado'");
    expect(carga![0]).not.toContain("motivo_descarte");
  });

  it("o aceite cobra cada recusa PELO NOME da regra e tem controle positivo", () => {
    expect(sql).toContain("ACEITE FALHOU");
    expect(sql).toContain("Aceite verificado");
    for (const regra of [
      "leads_veiculos_situacao_valida",
      "leads_veiculos_motivo_valido",
      "leads_veiculos_motivo_so_no_descarte",
      "leads_veiculos_outro_pede_nota",
      "leads_veiculos_resolucao_carimbada",
      "leads_veiculos_lead_veiculo_unico",
      "leads_veiculos_um_escolhido_por_lead",
      "leads_veiculos_rotulo_preenchido",
      "leads_veiculos_preco_valido",
      "leads_veiculos_par_imutavel",
      "leads_veiculos_veiculo_no_estoque",
    ]) {
      expect(sql, `o aceite não cobra ${regra}`).toContain(`'recusado:${regra}'`);
    }
    expect(sql).toContain("'A descarta com motivo'");
    expect(sql).toContain("'admin apaga'");
  });

  it("se registra no livro-razão", () => {
    expect(sql).toMatch(new RegExp(`values\\s*\\('${VERSAO}',\\s*'${NOME}'\\)`));
  });
});

describe("ensaio: os veículos de interesse do lead", () => {
  it("é um bloco só, e termina no erro que desfaz tudo", () => {
    expect(ensaio.match(/^do \$\$/gm)?.length).toBe(1);
    expect(junto(ensaio)).toMatch(/raise exception 'ENSAIO_DESFEITO %', v_saida::text; end \$\$;$/);
    // Nada depois do bloco, e nenhum registro no livro-razão.
    expect(ensaio).not.toContain("schema_migrations");
    expect(ensaio).not.toMatch(/\bcommit\b/i);
  });

  it("executa o MESMO DDL e a MESMA carga da migração", () => {
    const daMigracao = pedacos(sql.slice(0, sql.indexOf("do $aceite$")));
    // 4 funções, a tabela, 2 índices, o gatilho, 4 policies, a RLS, a carga, e os grants.
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

  it("não escreve em estoque_motors nem altera leads", () => {
    expect(ensaio).not.toMatch(/(insert\s+into|update|delete\s+from|alter\s+table)\s+public\.estoque_motors/i);
    expect(ensaio).not.toMatch(/(update|delete\s+from|alter\s+table)\s+public\.leads\b(?!_)/i);
  });

  it("o resumo traz as contagens pedidas e nenhum nome", () => {
    for (const chave of [
      "leads_com_veiculo",
      "linhas_por_situacao",
      "veiculos_que_nao_existem_mais",
      "tudo_confere",
    ]) {
      expect(ensaio).toContain(`'${chave}'`);
    }
    expect(junto(ensaio.slice(ensaio.indexOf("v_saida := jsonb_build_object")))).not.toMatch(/v_nome|full_name|telefone/);
  });
});
