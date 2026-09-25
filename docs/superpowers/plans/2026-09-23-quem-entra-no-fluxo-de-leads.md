# Quem entra no fluxo de leads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Só quem está ativo e tem `comercial` em `papeis` recebe lead (rodízio, lista do card, PATCH); nasce o papel de painel `sdr`, que não recebe lead.

**Architecture:** Uma régua pura em TS (`recebeLead`) usada pela rota e pelo card; a mesma régua no SQL do rodízio (`'comercial' = any(p.papeis)`), provada por aceite dentro da migração. Vocabulário `sdr` entra nas quatro listas enumeradas de uma vez.

**Tech Stack:** Next.js (App Router), TypeScript, Vitest, Supabase/Postgres (plpgsql), `supabase/manutencao/aplicar-migracao.js`.

**Spec:** `docs/superpowers/specs/2026-09-23-quem-entra-no-fluxo-de-leads-design.md`

## Global Constraints

- Código, nomes e commits em **português**, no padrão do repositório.
- Migração **aditiva**: `create or replace`/`drop constraint … add constraint` do vocabulário é permitido (padrão de `20260822210000`); nada de DROP de tabela/coluna.
- Toda migração termina com o rodapé `insert into supabase_migrations.schema_migrations …`.
- Migração **só em ensaio** (`aplicar-migracao.js` sem `--gravar`) neste plano. Gravar é decisão do dono depois do PR.
- Worktree sem `node_modules`: criar a junção antes de testar (`cmd //c mklink /J node_modules ..\motors-site-oficial\node_modules`); build com `next build --webpack`.
- Cada teste novo é **quebrado com o bug real** (reverter a linha de produção) e precisa ficar vermelho antes de valer.
- SDR: menor privilégio — só "Ver e mover leads no kanban" = `faz`; todo o resto `nao_ve`.
- Não mexer em `handle_new_user` (o convite grava `papeis` pela rota `/api/users`).

---

### Task 1: Papel `sdr` e a régua `recebeLead`

**Files:**
- Modify: `src/lib/permissoes.ts` (PERFIS l.17; mapas l.181–235; `linha` l.244–257; linha "Ver e mover leads no kanban")
- Create: `tests/quem-recebe-lead.test.ts`

**Interfaces:**
- Produces: `PERFIS` inclui `"sdr"`; `export function recebeLead(p: { papeis?: string[] | null; role?: string | null; is_active?: boolean | null } | null | undefined): boolean`

- [ ] **Step 1: Teste que falha**

```ts
// tests/quem-recebe-lead.test.ts
import { describe, it, expect } from "vitest";
import { PERFIS, ehStaff, podeFazer, recebeLead, ROTULO_DO_PERFIL } from "../src/lib/permissoes";

describe("quem recebe lead — só o Comercial (23/09)", () => {
  it("comercial principal ou secundário recebe", () => {
    expect(recebeLead({ papeis: ["comercial"], is_active: true })).toBe(true);
    expect(recebeLead({ papeis: ["admin", "comercial", "gestor"], is_active: true })).toBe(true);
  });
  it("admin sem comercial NÃO recebe — era o Igor no rodízio", () => {
    expect(recebeLead({ papeis: ["admin", "marketing"], is_active: true })).toBe(false);
  });
  it("sdr não recebe", () => {
    expect(recebeLead({ papeis: ["sdr"], is_active: true })).toBe(false);
  });
  it("inativo não recebe, mesmo comercial", () => {
    expect(recebeLead({ papeis: ["comercial"], is_active: false })).toBe(false);
  });
  it("sem papeis, cai no role singular", () => {
    expect(recebeLead({ role: "comercial", is_active: true })).toBe(true);
    expect(recebeLead(null)).toBe(false);
  });
});

describe("o papel sdr", () => {
  it("é de painel, com rótulo", () => {
    expect(PERFIS).toContain("sdr");
    expect(ehStaff(["sdr"])).toBe(true);
    expect(ROTULO_DO_PERFIL.sdr).toBe("SDR");
  });
  it("move lead e não vê o resto", () => {
    expect(podeFazer("sdr", "Ver e mover leads no kanban")).toBe("faz");
    expect(podeFazer("sdr", "Alterar preço até 5%")).toBe("nao_ve");
    expect(podeFazer("sdr", "Gerenciar clientes e fornecedores")).toBe("nao_ve");
    expect(podeFazer("sdr", "Convidar usuário e trocar perfil")).toBe("nao_ve");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/quem-recebe-lead.test.ts` → FAIL (`recebeLead` não existe).

- [ ] **Step 3: Implementar em `src/lib/permissoes.ts`**

`PERFIS`:
```ts
export const PERFIS = ["admin", "gestor", "marketing", "comercial", "financeiro", "sdr"] as const;
```
Nos três mapas, acrescentar:
```ts
// ROTULO_DO_PERFIL
  sdr: "SDR",
// ALCADA_DO_PERFIL
  sdr: "—",
// DESCRICAO_DO_PERFIL
  sdr: {
    descricao:
      "Resgate de leads que o Comercial não converteu. Trabalha no Chatwoot; não entra no rodízio nem recebe lead.",
    chave: "Não recebe lead",
  },
```
`linha` ganha a sexta posição com padrão de menor privilégio:
```ts
const linha = (
  acao: string,
  [admin, gestor, marketing, comercial, financeiro, sdr = "nao_ve"]: [
    Permissao,
    Permissao,
    Permissao,
    Permissao,
    Permissao,
    Permissao?,
  ],
  observacao = "",
): LinhaDaMatriz => ({
  acao,
  permissoes: { admin, gestor, marketing, comercial, financeiro, sdr },
  observacao,
});
```
Linha de leads:
```ts
  // O SDR (2026-09-23) mexe no lead do resgate, mas nunca é dono: quem
  // recebe lead é a régua `recebeLead`, não esta linha.
  linha(
    "Ver e mover leads no kanban",
    ["faz", "nao_ve", "nao_ve", "faz", "nao_ve", "faz"],
    "Marketing vê só o volume agregado",
  ),
```
A régua, logo depois de `ehInvestidor`:
```ts
/**
 * Recebe lead? Ordem do dono em 2026-09-23: *"nenhum destes que não sejam
 * comercial, na atividade principal ou secundária, podem estar no fluxo"*.
 *
 * Só `comercial`, em qualquer posição de `papeis`, e conta ativa. Admin não
 * entra por ser admin — era assim que o Marketing recebia lead no rodízio — e
 * o SDR trabalha o resgate, não é dono. O rodízio do banco
 * (`montar_fila_do_funil`) aplica a mesma régua; o aceite da migração
 * `20260923130100` a prova lá.
 */
export function recebeLead(
  p: { papeis?: string[] | null; role?: string | null; is_active?: boolean | null } | null | undefined,
): boolean {
  if (!p || p.is_active === false) return false;
  return papeisBrutos(p).includes("comercial");
}
```

- [ ] **Step 4: Rodar** `npx vitest run tests/quem-recebe-lead.test.ts` → PASS. Depois `npx tsc --noEmit` → sem erro (UserManagement usa `PERFIS.map` genérico).

- [ ] **Step 5: Quebrar de propósito** — trocar `includes("comercial")` por `some(x => x === "comercial" || x === "admin")`; o teste do Igor tem de ficar vermelho. Reverter.

- [ ] **Step 6: Commit** `feat(papeis): papel SDR e a regua recebeLead — so o Comercial recebe lead`

---

### Task 2: Vocabulário `sdr` no banco

**Files:**
- Create: `supabase/migrations/20260923130000_papel_sdr.sql`
- Modify: `tests/papeis-gestor-investidor.test.ts` (bloco `describe("migração 20260821180000")`), `tests/migracoes-executam.test.ts` (`CADEIA`, teste do vocabulário)

**Interfaces:**
- Consumes: `PERFIS` com `sdr` (Task 1)
- Produces: `papeis_validos(array['sdr'])` verdadeiro; `is_staff` inclui `sdr`.

- [ ] **Step 1: Teste que falha** — em `tests/papeis-gestor-investidor.test.ts`, os dois testes de vocabulário passam a ler a **última** migração que define cada função (a de 20260821 fica velha assim que o vocabulário muda — foi esse o furo do gestor em 22/08):

```ts
import { readdirSync } from "node:fs";
/** A migração mais recente que (re)define `alvo`. */
function ultimaQueDefine(alvo: RegExp): string {
  const dir = join(__dirname, "..", "supabase", "migrations");
  const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (let i = arquivos.length - 1; i >= 0; i--) {
    const txt = readFileSync(join(dir, arquivos[i]), "utf8");
    if (alvo.test(txt)) return txt;
  }
  throw new Error(`nenhuma migração define ${alvo}`);
}
```
e nos testes `"o vocabulário do banco é exatamente o do app"` e `"is_staff inclui gestor e exclui investidor"`, trocar `sql` por
`ultimaQueDefine(/function public\.papeis_validos/)` e `ultimaQueDefine(/function public\.is_staff/)`
(importar `readFileSync`/`join` se o arquivo ainda não importa). Rodar → FAIL (a última ainda é a de agosto, sem `sdr`).

- [ ] **Step 2: A migração**

```sql
-- 20260923130000_papel_sdr.sql
-- O papel SDR (2026-09-23). Pedido do dono: *"temos uma role de SDR que está
-- junto no comercial, mas creio seja a hora de mudar"*. O SDR é equipe (entra
-- no painel, move lead do resgate) e NÃO recebe lead — essa régua mora no
-- rodízio, migração seguinte.
--
-- Vocabulário enumerado em três réguas do banco, que mudam JUNTAS: foi por
-- reescrever uma e esquecer outra que o gestor sumiu em 22/08.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr',
                  'cliente', 'investidor'));

create or replace function public.papeis_validos(p text[]) returns boolean
  language sql
  immutable
as $fn$
  select p is not null
     and array_length(p, 1) >= 1
     and p <@ array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr',
                    'cliente', 'investidor']
     and array_length(p, 1) = (select count(distinct x) from unnest(p) x);
$fn$;

comment on function public.papeis_validos(text[]) is
  'Vocabulário de `profiles.papeis` — os seis de painel (admin, gestor, '
  'marketing, comercial, financeiro, sdr) mais os de área própria (cliente, '
  'investidor). Espelha PERFIS + PAPEIS_SEM_PAINEL de src/lib/permissoes.ts, '
  'e um teste trava os dois lados.';

create or replace function public.is_staff(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'gestor', 'comercial', 'financeiro', 'marketing', 'sdr']
  );
$$ language sql security definer set search_path = public;

comment on function public.is_staff(uuid) is
  'Tem ALGUM papel de painel (admin/gestor/comercial/financeiro/marketing/sdr) '
  'e está ativo. `cliente` e `investidor` nunca são staff por isso sozinhos.';

do $$
begin
  if not public.papeis_validos(array['sdr']) then
    raise exception 'ACEITE FALHOU: sdr fora do vocabulário';
  end if;
  if not public.papeis_validos(array['admin','gestor','comercial','financeiro','marketing','sdr','cliente','investidor']) then
    raise exception 'ACEITE FALHOU: algum papel antigo saiu do vocabulário';
  end if;
  if public.papeis_validos(array['vendedor']) then
    raise exception 'ACEITE FALHOU: o vocabulário aceita papel inventado';
  end if;
  raise notice 'Aceite verificado: sdr é papel válido e de painel, e nenhum papel antigo se perdeu.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260923130000', 'papel_sdr')
  on conflict (version) do nothing;
```

- [ ] **Step 3:** Em `tests/migracoes-executam.test.ts`, acrescentar `"20260923130000_papel_sdr.sql"` ao fim de `CADEIA` e `'sdr'` na lista do teste `"o vocabulário de papéis tem os sete…"` (renomear para "oito"). Sem Postgres local esses testes são pulados — a prova real é o ensaio do Step 5.

- [ ] **Step 4:** `npx vitest run tests/papeis-gestor-investidor.test.ts tests/papeis-multiplos.test.ts tests/perfil-investidor.test.ts tests/quem-recebe-lead.test.ts` → PASS.

- [ ] **Step 5: Ensaio** (a partir do checkout principal, que tem `.env.local` e `node_modules`):
`node supabase/manutencao/aplicar-migracao.js ../wt-transferencia-chatwoot/supabase/migrations/20260923130000_papel_sdr.sql`
Esperado: `NOTICE: Aceite verificado…` e `Ensaio OK (revertido)`.

- [ ] **Step 6: Commit** `feat(banco): papel sdr no vocabulario, em is_staff e no CHECK`

---

### Task 3: Rodízio só com o Comercial

**Files:**
- Create: `supabase/migrations/20260923130100_rodizio_so_comercial.sql`

**Interfaces:**
- Consumes: vocabulário da Task 2 (o aceite cria perfil `sdr`).
- Produces: `montar_fila_do_funil` com candidato `p.is_active and 'comercial' = any(p.papeis)`.

- [ ] **Step 1: Conferir o arquivo contra a produção** (já houve função viva ≠ arquivo). Script de leitura no scratchpad, rodado do checkout principal:

```js
// conferir-fila.js — SÓ LEITURA
const { Client } = require("./node_modules/pg");
const fs = require("fs");
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i),l.slice(i+1).replace(/^["']|["']$/g,"")];}));
(async()=>{const c=new Client({connectionString:env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});await c.connect();
const {rows}=await c.query("select prosrc from pg_proc where proname='montar_fila_do_funil'");
const arq=fs.readFileSync("supabase/migrations/20260916150000_sla_conta_depois_do_assistente.sql","utf8");
const corpo=arq.slice(arq.indexOf("as $$",arq.indexOf("function public.montar_fila_do_funil"))+5, arq.indexOf("end $$;",arq.indexOf("function public.montar_fila_do_funil"))+3);
const n=s=>s.replace(/\s+/g," ").trim();
console.log(rows.length, n(rows[0].prosrc)===n(corpo) ? "IGUAL à produção" : "DIFERENTE — parar");await c.end();})();
```
Esperado: `1 IGUAL à produção`. Se diferente, **parar e reportar**.

- [ ] **Step 2: Gerar o corpo a partir do arquivo conferido, mudando só o candidato**

```bash
f=supabase/migrations/20260916150000_sla_conta_depois_do_assistente.sql
sed -n '161,372p' "$f" > /tmp/corpo.sql
grep -c "and p.papeis && array\['comercial', 'admin'\]" /tmp/corpo.sql   # esperado: 1
```
Montar a migração: cabeçalho (abaixo) + `/tmp/corpo.sql` com a linha trocada + aceite + rodapé. A troca (usar a ferramenta Edit, não sed com `\[`):
```
-         and p.papeis && array['comercial', 'admin']
+         and 'comercial' = any(p.papeis)
```
Cabeçalho:
```sql
-- 20260923130100_rodizio_so_comercial.sql
-- O rodízio passa a escolher SÓ quem tem `comercial` em `papeis` (2026-09-23).
--
-- Medido em 23/09: o candidato era `papeis && array['comercial','admin']`, e
-- por isso o Igor (admin + marketing) recebia lead transferido — um lead do
-- print do dono estava na 8ª transferência, rodando entre três pessoas, uma
-- delas fora do comercial. Ordem do dono: *"nenhum destes que não sejam
-- comercial, na atividade principal ou secundária, podem estar no fluxo"*.
--
-- O corpo abaixo é o de `20260916150000`, conferido contra o `prosrc` da
-- produção antes de reescrever. A ÚNICA linha que muda é o filtro do
-- candidato no lateral `prox`. O telefone continua exigido: é por ele que o
-- novo dono é avisado, e não existe transferência silenciosa.
```
Atualizar o `comment on function` acrescentando ao fim: `' Desde 2026-09-23 só quem tem comercial em papeis é candidato — admin não entra por ser admin, e o SDR não recebe lead.'`

- [ ] **Step 3: Aceite** (depois do grant; tudo desfeito no fim — padrão do repositório).

**Por que ele é determinístico:** o `prox` escolhe o candidato com MENOS leads abertos
e, no empate, o primeiro por nome. Os perfis de teste têm zero leads e nomes que começam
com "Aaaa", então ganham de todo perfil real. Com a regra antiga, o "Aaaa Aceite
AdminMkt" seria o escolhido; com a nova, tem de ser o "Aaab Aceite Comercial". E o lead
de teste (parado, sem dono, em etapa aberta com `estagnacao_minutos`) garante que existe
uma linha `atribuicao` para olhar — sem ele, a fila pode estar vazia e o aceite passaria
sem provar nada. **Criar o lead e a etapa exatamente como o aceite de
`20260916150000` cria os dele** (copiar de lá as colunas obrigatórias de `leads` e o
`p_agora` fixo em horário comercial).

Estrutura (completar o `insert` do lead copiando o de `20260916150000`):

```sql
do $$
declare
  v_adm  uuid := gen_random_uuid();
  v_sdr  uuid := gen_random_uuid();
  v_com  uuid := gen_random_uuid();
  v_lead uuid;
  v_p    timestamptz := date_trunc('week', now()) + interval '2 days 14 hours'; -- quarta 14h, fuso SP abaixo
  v_novo text;
  falhas int := 0;
begin
  insert into auth.users (id, email) values
    (v_adm, 'aceite-adm@teste.invalid'), (v_sdr, 'aceite-sdr@teste.invalid'),
    (v_com, 'aceite-com@teste.invalid');
  -- (se o trigger não criar profiles, inserir direto — ver 20260828120000 l.1236)
  update public.profiles set full_name='Aaaa Aceite AdminMkt', papeis=array['admin','marketing'],
         role='admin', is_active=true, telefone_e164='+5541900000001' where id=v_adm;
  update public.profiles set full_name='Aaaa Aceite SDR', papeis=array['sdr'],
         role='sdr', is_active=true, telefone_e164='+5541900000002' where id=v_sdr;
  update public.profiles set full_name='Aaab Aceite Comercial', papeis=array['comercial'],
         role='comercial', is_active=true, telefone_e164='+5541900000003' where id=v_com;

  -- v_lead := lead SEM responsável, parado além de estagnacao_minutos numa etapa
  --           aberta — copiar o insert do aceite de 20260916150000.

  select novo_responsavel into v_novo
    from public.montar_fila_do_funil(v_p, false)
   where lead_id = v_lead and aviso = 'atribuicao';

  if v_novo is distinct from 'Aaab Aceite Comercial' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o rodízio escolheu % — esperado o comercial de teste', coalesce(v_novo, '(ninguém)');
  end if;

  delete from public.leads where id = v_lead;
  delete from auth.users where id in (v_adm, v_sdr, v_com);

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na régua do rodízio', falhas;
  end if;
  raise notice 'Aceite verificado: o rodízio pulou admin+marketing e SDR e escolheu o comercial.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260923130100', 'rodizio_so_comercial')
  on conflict (version) do nothing;
```
> Se `auth.users` → `profiles` não for criado por trigger no ambiente, o `update` não acha linha: nesse caso inserir em `profiles` direto (conferir como o aceite de `20260828120000` l.1236 cria "Aceite Vendedora" e seguir o mesmo caminho).

- [ ] **Step 4: Quebrar de propósito** — ensaiar uma cópia com o filtro antigo (`papeis && array['comercial','admin']`): o aceite **tem de falhar** com "o rodízio escolheu Aaaa Aceite AdminMkt". Se passar, o aceite não prova nada — parar e corrigir o lead de teste.

- [ ] **Step 5: Ensaio da migração verdadeira, em ordem:** primeiro `20260923130000_papel_sdr.sql` e esta **no mesmo ensaio** (o aceite usa `role='sdr'`). Concatenar as duas num arquivo temporário e rodar `aplicar-migracao.js` sem `--gravar`. Esperado: os dois `Aceite verificado`, candidatos só {Dyones Oliveira, Rodrigo Naumowicz}, `Ensaio OK (revertido)`.

- [ ] **Step 6: Commit** `fix(funil): o rodizio so escolhe quem tem comercial — admin e sdr fora`

---

### Task 4: A rota — lista do card e PATCH pela mesma régua

**Files:**
- Modify: `src/app/api/leads/gerenciar/route.ts` (GET l.203–213; PATCH antes de `atualizacao.responsavel`)
- Create: `src/lib/responsavelDoLead.ts`
- Test: `tests/responsavel-do-lead.test.ts`

**Interfaces:**
- Consumes: `recebeLead` (Task 1)
- Produces:
  - `atendentesDoFluxo(perfis: PerfilDoFluxo[]): { nome: string }[]`
  - `recusaDeResponsavel(nome: string | null, perfis: PerfilDoFluxo[]): string | null` — `null` = aceito; string = mensagem de erro.
  - `type PerfilDoFluxo = { full_name: string | null; role?: string | null; papeis?: string[] | null; is_active?: boolean | null }`

- [ ] **Step 1: Teste que falha**

```ts
// tests/responsavel-do-lead.test.ts
import { describe, it, expect } from "vitest";
import { atendentesDoFluxo, recusaDeResponsavel } from "../src/lib/responsavelDoLead";

const equipe = [
  { full_name: "Dyones Oliveira", role: "admin", papeis: ["admin", "comercial", "gestor"], is_active: true },
  { full_name: "Rodrigo Naumowicz", role: "comercial", papeis: ["comercial"], is_active: true },
  { full_name: "Igor Alves", role: "admin", papeis: ["admin", "marketing"], is_active: true },
  { full_name: "Felipe Custódio", role: "sdr", papeis: ["sdr"], is_active: true },
  { full_name: "Ex Vendedor", role: "comercial", papeis: ["comercial"], is_active: false },
];

describe("a lista do card", () => {
  it("só o comercial ativo, inclusive quem tem comercial como papel secundário", () => {
    expect(atendentesDoFluxo(equipe).map((a) => a.nome)).toEqual(["Dyones Oliveira", "Rodrigo Naumowicz"]);
  });
});

describe("o PATCH", () => {
  it("aceita comercial e aceita 'sem responsável'", () => {
    expect(recusaDeResponsavel("Rodrigo Naumowicz", equipe)).toBeNull();
    expect(recusaDeResponsavel(null, equipe)).toBeNull();
  });
  it("recusa quem não é do comercial, inativo e nome desconhecido", () => {
    expect(recusaDeResponsavel("Igor Alves", equipe)).toMatch(/comercial/i);
    expect(recusaDeResponsavel("Felipe Custódio", equipe)).toMatch(/comercial/i);
    expect(recusaDeResponsavel("Ex Vendedor", equipe)).toMatch(/comercial/i);
    expect(recusaDeResponsavel("Dyo Paulino", equipe)).toMatch(/comercial/i);
  });
});
```
Rodar → FAIL (módulo não existe).

- [ ] **Step 2: Implementar**

```ts
// src/lib/responsavelDoLead.ts
import { recebeLead } from "./permissoes";

/**
 * Quem pode ser dono de lead — a régua de `recebeLead` aplicada à lista de
 * perfis. Uma função só para a lista do card e para a recusa do PATCH: se as
 * duas divergirem, a tela oferece quem a rota recusa (ou o contrário).
 *
 * `responsavel` é TEXTO (`full_name`), não FK — ver migração 20260807210000.
 */
export type PerfilDoFluxo = {
  full_name: string | null;
  role?: string | null;
  papeis?: string[] | null;
  is_active?: boolean | null;
};

export function atendentesDoFluxo(perfis: PerfilDoFluxo[]): { nome: string }[] {
  return perfis
    .filter(recebeLead)
    .map((p) => ({ nome: (p.full_name || "").trim() }))
    .filter((p) => p.nome)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * `null` = aceito. Sem responsável é sempre aceito: tirar o dono não põe
 * ninguém de fora no fluxo. Nome que não é de ninguém do comercial ativo é
 * recusado — inclusive nome antigo gravado no lead, que continua podendo
 * FICAR, mas não pode ser escolhido de novo.
 */
export function recusaDeResponsavel(nome: string | null, perfis: PerfilDoFluxo[]): string | null {
  if (nome === null || nome.trim() === "") return null;
  const alvo = nome.trim();
  const ok = atendentesDoFluxo(perfis).some((a) => a.nome === alvo);
  return ok ? null : `"${alvo}" não é do Comercial ativo — só o Comercial recebe lead.`;
}
```

- [ ] **Step 3: Fiação na rota.** GET — trocar o bloco `atendentes` por:
```ts
    let atendentes: { nome: string }[] = [];
    const { data: perfis } = await supabase
      .from("profiles")
      .select("full_name, role, papeis, is_active");
    if (perfis) atendentes = atendentesDoFluxo(perfis as PerfilDoFluxo[]);
```
(o filtro `.in("role", …)` sai: ele olhava só o papel principal e incluía admin). Atualizar o comentário acima com a régua de 23/09.

PATCH — logo antes de `const atualizacao`:
```ts
    // Só o Comercial recebe lead (2026-09-23). A recusa mora AQUI, e não só no
    // select do card, pelo mesmo motivo do desfecho: validação só na tela vira
    // opcional no dia em que alguém chamar a rota de outro lugar.
    if (responsavel !== undefined) {
      const { data: perfis, error: erroPerfis } = await supabase
        .from("profiles")
        .select("full_name, role, papeis, is_active");
      if (erroPerfis) {
        return NextResponse.json({ error: erroPerfis.message }, { status: 500 });
      }
      const recusa = recusaDeResponsavel(responsavel, (perfis ?? []) as PerfilDoFluxo[]);
      if (recusa) return NextResponse.json({ error: recusa }, { status: 422 });
    }
```
Import: `import { atendentesDoFluxo, recusaDeResponsavel, type PerfilDoFluxo } from "../../../../lib/responsavelDoLead";` (conferir a profundidade relativa pelo import de `supabase-server` no topo do arquivo).

> A RLS de `profiles` precisa deixar staff ler `papeis`/`is_active` dos colegas: o GET já lia `full_name, role, papeis`, então a leitura existe. Conferir no ensaio manual (Task 6).

- [ ] **Step 4:** `npx vitest run tests/responsavel-do-lead.test.ts` → PASS. Quebrar: trocar `filter(recebeLead)` por `filter((p) => p.role === "admin" || p.role === "comercial")` (a régua antiga) — o teste da lista e o do Igor ficam vermelhos. Reverter.

- [ ] **Step 5: Commit** `fix(leads): lista do card e PATCH so aceitam o Comercial ativo`

---

### Task 5: O card — opções só do Comercial, dono antigo marcado

**Files:**
- Modify: `src/lib/leadsKanban.ts` (acrescentar função ao lado de `opcoesDeResponsavel`, l.55)
- Modify: `src/components/admin/LeadsKanban.tsx` (select l.982–994)
- Modify: `src/components/admin/UserManagement.tsx` (texto de ajuda l.774–777)
- Test: `tests/leads-kanban.test.ts`

**Interfaces:**
- Produces: `opcoesDoCard(elegiveis: string[], atual: string | null): { nome: string; fora: boolean }[]`

- [ ] **Step 1: Teste que falha** (acrescentar em `tests/leads-kanban.test.ts`):

```ts
import { opcoesDoCard } from "../src/lib/leadsKanban";

describe("opções de responsável no card (23/09)", () => {
  const comercial = ["Dyones Oliveira", "Rodrigo Naumowicz"];
  it("oferece só o comercial", () => {
    expect(opcoesDoCard(comercial, "Rodrigo Naumowicz")).toEqual([
      { nome: "Dyones Oliveira", fora: false },
      { nome: "Rodrigo Naumowicz", fora: false },
    ]);
  });
  it("o dono atual de fora aparece marcado, para não sumir da tela", () => {
    expect(opcoesDoCard(comercial, "Igor Alves")).toEqual([
      { nome: "Dyones Oliveira", fora: false },
      { nome: "Igor Alves", fora: true },
      { nome: "Rodrigo Naumowicz", fora: false },
    ]);
  });
  it("dono antigo de OUTRO card não entra neste", () => {
    expect(opcoesDoCard(comercial, null).map((o) => o.nome)).not.toContain("Dyo Paulino");
  });
});
```
Rodar → FAIL.

- [ ] **Step 2: Implementar em `src/lib/leadsKanban.ts`**

```ts
/**
 * As opções do select de responsável de UM card (2026-09-23).
 *
 * `opcoesDeResponsavel` junta os nomes de todos os leads — serve ao FILTRO,
 * que precisa achar lead com dono antigo, mas no card fazia "Dyo Paulino"
 * aparecer como escolha em todo lead. Aqui só entra o Comercial e, se o dono
 * atual for de fora, ele próprio, marcado: o select precisa conseguir mostrar
 * o valor que o lead tem, e a rota recusa escolhê-lo de novo.
 */
export function opcoesDoCard(
  elegiveis: string[],
  atual: string | null,
): { nome: string; fora: boolean }[] {
  const opcoes = elegiveis.filter(Boolean).map((nome) => ({ nome, fora: false }));
  if (atual && !elegiveis.includes(atual)) opcoes.push({ nome: atual, fora: true });
  return opcoes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
```

- [ ] **Step 3: O select em `LeadsKanban.tsx`** — importar `opcoesDoCard` e trocar o `map` de `opcoesResponsavel`:
```tsx
                              {opcoesDoCard(atendentes, l.responsavel).map((o) => (
                                <option key={o.nome} value={o.nome} disabled={o.fora}>
                                  {o.fora ? `${o.nome} (fora do comercial)` : o.nome}
                                </option>
                              ))}
```
O filtro do topo (`filtro-responsavel`) continua com `opcoesResponsavel` — ele precisa achar lead com qualquer dono.

`UserManagement.tsx`, texto de ajuda do WhatsApp — trocar a última frase por:
`Sem telefone, a pessoa não é avisada. Só quem tem o perfil Comercial entra no rodízio de leads.`
E, se houver texto de rodízio perto do seletor de perfis, conferir que não promete lead a outro perfil.

- [ ] **Step 4:** `npx vitest run tests/leads-kanban.test.ts` → PASS; quebrar: fazer `opcoesDoCard` devolver também todos os nomes de leads (a régua antiga) → teste do "Dyo Paulino"/marcação vermelho. Reverter. `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit** `fix(kanban): o card so oferece o Comercial; dono de fora aparece marcado`

---

### Task 6: Verificação e PR

- [ ] `npx vitest run` (suite inteira) → verde; registrar a contagem.
- [ ] `npx tsc --noEmit` → limpo.
- [ ] `npx next build --webpack` → OK.
- [ ] Ensaio conjunto das duas migrações (Task 3, Step 5) repetido depois de tudo → dois "Aceite verificado".
- [ ] Preview: subir o painel do worktree (`preview_start`), abrir `/admin/leads` logado, conferir que o select de um card lista só Dyones e Rodrigo, e que um card com dono "Dyo Paulino"/"Igor Alves" mostra o nome marcado "(fora do comercial)" e desabilitado. Screenshot.
- [ ] `git push -u origin feat/quem-entra-no-fluxo` e PR com: o que mudou, a medição de 23/09, o ensaio, e o **roteiro de entrega para o dono**: (1) gravar as duas migrações em ordem (`--gravar`), (2) mudar o Felipe para o perfil SDR na tela de usuários, (3) revisar as permissões do SDR na matriz. Rodapé do PR: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] Não mesclar: merge só com CI verde e pela sessão de handoff (memória `merge-no-main-em-lote-verificado`).
