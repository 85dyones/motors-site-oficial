import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * O insert de lead não pode voltar a falhar em silêncio.
 *
 * A tabela `leads` de produção não é a da migração 20260807210000: aquela usa
 * `create table if not exists`, e em produção a tabela já existia — uma tabela
 * de marketing com 44 colunas. O `create` virou no-op e só os `alter add
 * column` rodaram. Sobrou `event_id text not null` sem default, que ninguém
 * preenchia, e o banco recusava todo insert:
 *
 *   null value in column "event_id" violates not-null constraint
 *
 * Como a gravação é não-bloqueante de propósito, a recusa virava um
 * `console.warn` na Vercel. O kanban mostrava "Nenhum lead ainda" — e estava
 * certo. Nenhum lead do site jamais foi gravado.
 */

const raiz = join(__dirname, "..");
const rota = readFileSync(join(raiz, "src", "app", "api", "leads", "route.ts"), "utf-8");

const migracoes = readdirSync(join(raiz, "supabase", "migrations"));
const destrava = migracoes.find((m) => m.includes("leads_insert_destravado"));
const sql = destrava
  ? readFileSync(join(raiz, "supabase", "migrations", destrava), "utf-8")
  : "";

describe("a migração", () => {
  it("existe", () => {
    expect(destrava, "migração que destrava o insert não encontrada").toBeTruthy();
  });

  it("remove a trava confirmada pelo banco", () => {
    expect(sql).toMatch(/alter column event_id drop not null/i);
  });

  it("não roda DDL além do necessário", () => {
    // Verificado contra produção: inserindo só com `event_id`, o insert passa
    // e id/situacao/atualizado_em vêm por default. Mexer neles seria DDL sem
    // motivo numa tabela viva.
    const alteracoes = sql.match(/alter\s+column/gi) ?? [];
    expect(alteracoes).toHaveLength(1);
  });

  it("não apaga coluna nem dado", () => {
    // A tabela guarda histórico de marketing que ninguém pediu para remover.
    expect(sql).not.toMatch(/drop column/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/truncate/i);
    expect(sql).not.toMatch(/delete\s+from/i);
  });

  it("registra que o schema é híbrido", () => {
    // O comentário anterior descrevia a tabela da migração, não a real.
    expect(sql).toMatch(/comment on table public\.leads/i);
    expect(sql).toMatch(/h[íi]brido/i);
  });
});

describe("a rota de lead", () => {
  it("preenche event_id", () => {
    expect(rota).toContain("event_id: body.eventId || null");
  });

  it("continua sem bloquear o visitante quando a gravação falha", () => {
    // A regra que escondeu o bug é a mesma que precisa continuar valendo: o
    // cliente está a caminho do WhatsApp, e falha nossa não pode segurá-lo.
    // O conserto é o insert funcionar, não passar a travar.
    const bloco = rota.slice(rota.indexOf("5.2 Persistência"), rota.indexOf("5.5 Meta CAPI"));
    expect(bloco).toContain("catch");
    expect(bloco).toContain("não bloqueante");
  });

  it("grava com a chave de serviço, não com a anônima", () => {
    // Não há policy de INSERT para anônimo, de propósito.
    const bloco = rota.slice(rota.indexOf("5.2 Persistência"), rota.indexOf("5.5 Meta CAPI"));
    expect(bloco).toContain("createAdminSupabaseClient()");
  });
});
