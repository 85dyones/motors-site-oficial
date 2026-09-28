# Carro "em preparação" — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** o painel publica com uma foto só o carro marcado "em preparação" com data prevista de chegada ao pátio, e o site mostra a contagem até essa data: em dias no card, em relógio na ficha.

**Arquitetura:** duas colunas novas em `estoque_motors`. A régua de publicação ganha uma exceção que vive num lugar só (`bloqueiosDePublicacao`); todas as superfícies já perguntam a ela. O tempo mora numa biblioteca pura (`lib/emPreparacao.ts`) consultada pelo card, pela ficha, pela TV, pelo balcão e pela tabela do painel. O feed de anúncios é a única superfície que recusa a exceção.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres 17), Vitest 3 com jsdom, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-09-28-em-preparacao-design.md` — leia antes de começar.

## Restrições globais

- Todo texto de código, comentário, teste e mensagem de commit em português, no estilo do repositório: o comentário diz o PORQUÊ, com data e medição quando houver.
- **Nenhum `new Date()` nem `Date.now()` no corpo de componente.** A regra `react-hooks/purity` é erro no lint. O "agora" entra por parâmetro com valor padrão nas funções de `lib/emPreparacao.ts`, ou dentro de callback de temporizador.
- **Erro de lint novo reprova o CI** (catraca em `eslint-suppressions.json`). Rode `npx eslint <arquivos tocados>` antes de cada commit.
- **Migração só é ensaiada** (`node supabase/manutencao/aplicar-migracao.js <arquivo>`, sem `--gravar`). Gravar em produção exige ordem explícita do dono, e **o PR só é mesclado depois da migração gravada**: `CAMPOS_NOSSOS` entra no `select` de toda gravação do painel, e sem as colunas o editor inteiro deixa de salvar.
- Os números da régua vêm das constantes (`MINIMO_DE_FOTOS`, `MINIMO_DE_FOTOS_EM_PREPARACAO`, `FOTOS_DA_FICHA_COMPLETA`), nunca digitados.
- **Trava só vale se reprovar:** depois de cada teste verde, quebre o código com o defeito que o teste existe para impedir, confirme o vermelho, e restaure.
- Worktree sem `node_modules`: `cmd /c mklink /J node_modules <clone principal>\node_modules`. Teste com `npx vitest run <arquivo>`; tipos com `npx tsc --noEmit`.
- Fuso: `America/Sao_Paulo`. O Brasil não tem horário de verão desde 2019 (Decreto 9.772), e o campo do painel converte com `-03:00` fixo.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20260928150000_em_preparacao.sql` (novo) | As duas colunas, o CHECK, comentários, autoconferência, rodapé do livro-razão |
| `src/lib/estoqueEscrita.ts` | `CAMPOS_NOSSOS` ganha os dois campos |
| `src/lib/permissoes.ts` | Linha da matriz A17 para os dois campos |
| `src/types/index.ts`, `src/lib/supabase.ts` | Tipo `Veiculo` e mapper público |
| `src/lib/coerenciaDoCadastro.ts` | A exceção da régua, a contagem de foto de verdade, a régua do feed |
| `src/lib/estadoDoCadastro.ts` | Tipo de `recusasParaPublicar` aceita os campos novos |
| `src/app/api/feed/xml/route.ts` | Carro em preparação sem 4 fotos fica fora do feed |
| `src/lib/emPreparacao.ts` (novo) | Tempo: fase, dias de calendário, relógio, data escrita, campo do painel |
| `src/components/modernist/FaixaEmPreparacao.tsx` (novo) | A faixa em dias, sem estado — serve card, TV e balcão |
| `src/components/modernist/primitivos.tsx`, `VitrineTV.tsx`, `VitrineBalcao.tsx` | Usam a faixa |
| `src/components/RelogioDaChegada.tsx` (novo) | O relógio da ficha (client) |
| `src/components/PDPClientWrapper.tsx` | Usa o relógio antes do preço |
| `src/components/admin/EditorDeVeiculo.tsx` | Caixa, data, validação, envio, checklist |
| `src/lib/estoqueTabela.ts`, `src/app/admin/estoque/page.tsx`, `src/components/admin/TabelaDeEstoque.tsx` | Selo e aviso de previsão vencida |
| `docs/PROPRIEDADE_DOS_CAMPOS.md`, `supabase/README.md` | Documentação dos campos e da migração |

`CadastroDeVeiculo.tsx` **não muda**: o cadastro termina com um link para o editor (`/admin/estoque/{id}`, linha ~401), e o carro nasce rascunho — a caixa no editor cobre o carro nativo.

**Convivência com o PR #161** (placa e ano no admin, ainda não mesclado): ele acrescenta `anoFabricacao` depois de `ano` em `LinhaDeEstoque`, `anoFabricacaoModelo` depois do fechamento da interface, e mexe nas células de código e de ano da tabela. Este plano põe os campos novos depois de `naTv`, e o selo na linha de metadados do veículo — longe dos trechos dele.

---

### Tarefa 1: Os dados — migração, tipo, mapper, lista branca, permissão

**Arquivos:**
- Criar: `supabase/migrations/20260928150000_em_preparacao.sql`
- Modificar: `src/lib/estoqueEscrita.ts` (`CAMPOS_NOSSOS`), `src/lib/permissoes.ts` (`ACAO_DO_CAMPO_DE_VEICULO`, perto de `status_tag`), `src/types/index.ts` (`Veiculo`), `src/lib/supabase.ts` (`mapVeiculoDbToVeiculo`, depois de `status_tag_color`), `docs/PROPRIEDADE_DOS_CAMPOS.md`, `supabase/README.md`
- Teste: `tests/em-preparacao-dados.test.ts` (novo)

**Interfaces:**
- Produz: colunas `em_preparacao boolean not null default false` e `previsao_chegada_em timestamptz`; `Veiculo.em_preparacao?: boolean`; `Veiculo.previsao_chegada_em?: string | null`; os dois nomes em `CAMPOS_NOSSOS`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { CAMPOS_NOSSOS } from "../src/lib/estoqueEscrita";
import { podeGravarCampo } from "../src/lib/permissoes";

/**
 * Os dados do carro "em preparação" — spec 2026-09-28-em-preparacao-design.
 *
 * Duas colunas NOSSAS: o sync do RevendaMais não as conhece, e a trava
 * `estoque_motors_trava_do_sync` (allowlist por construção) descarta qualquer
 * escrita dele fora de preço e `last_seen_at`.
 */

const MIGRACAO = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260928150000_em_preparacao.sql"),
  "utf8",
);

describe("a migração", () => {
  it("cria as duas colunas com a forma que a trava de colunas lê", () => {
    expect(MIGRACAO).toMatch(/add column if not exists em_preparacao boolean not null default false/i);
    expect(MIGRACAO).toMatch(/add column if not exists previsao_chegada_em timestamptz/i);
  });

  it("caixa marcada sem data não existe nem no banco", () => {
    expect(MIGRACAO).toMatch(/check \(not em_preparacao or previsao_chegada_em is not null\)/i);
  });

  it("termina com o rodapé do livro-razão", () => {
    expect(MIGRACAO).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s+values \('20260928150000', 'em_preparacao'\)/i,
    );
  });
});

/** Uma linha crua plausível — o mapper formata marca, modelo e fotos. */
const LINHA = {
  id: 8497421,
  marca: "fiat",
  modelo: "argo",
  versao: "drive 1.0",
  ano: 2025,
  quilometragem: 9000,
  preco_original: 79900,
  whatsapp_images: ["https://cdn.exemplo/f.jpg"],
};

describe("o mapper público", () => {
  it("leva os dois campos — a contagem é do cliente", () => {
    const v = mapVeiculoDbToVeiculo({
      ...LINHA,
      em_preparacao: true,
      previsao_chegada_em: "2026-10-03T17:00:00+00:00",
    });
    expect(v.em_preparacao).toBe(true);
    expect(v.previsao_chegada_em).toBe("2026-10-03T17:00:00+00:00");
  });

  it("coluna ausente (migração por aplicar) vira false e null, nunca undefined solto", () => {
    const v = mapVeiculoDbToVeiculo(LINHA);
    expect(v.em_preparacao).toBe(false);
    expect(v.previsao_chegada_em).toBeNull();
  });

  it("só `true` de verdade liga a caixa", () => {
    expect(mapVeiculoDbToVeiculo({ ...LINHA, em_preparacao: "true" }).em_preparacao).toBe(false);
  });
});

describe("quem grava", () => {
  it("os dois campos são do painel", () => {
    expect(CAMPOS_NOSSOS).toContain("em_preparacao");
    expect(CAMPOS_NOSSOS).toContain("previsao_chegada_em");
  });

  it("a mesma alçada da etiqueta de destaque: comercial grava, financeiro não", () => {
    for (const campo of ["em_preparacao", "previsao_chegada_em"]) {
      expect(podeGravarCampo(["comercial"], campo)).toBe(true);
      expect(podeGravarCampo(["marketing"], campo)).toBe(true);
      expect(podeGravarCampo(["financeiro"], campo)).toBe(false);
    }
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/em-preparacao-dados.test.ts`
Esperado: FALHA — `ENOENT` no arquivo da migração.

- [ ] **Passo 3: escrever a migração**

`supabase/migrations/20260928150000_em_preparacao.sql`:

```sql
-- ==========================================================
-- Carro "em preparação": publica com a foto de cadastro e conta até o pátio
-- ==========================================================
--
-- Pedido do dono em 28/09/2026. Carro que acabou de chegar ia para o mercado
-- com uma foto só, e o site o escondia: a régua de publicação exige 4 fotos
-- (`MINIMO_DE_FOTOS`, `src/lib/coerenciaDoCadastro.ts`). A caixa "em
-- preparação", com a data prevista de chegada ao pátio, libera a publicação
-- com uma foto, e o site mostra a contagem até a data.
--
-- Desenho: docs/superpowers/specs/2026-09-28-em-preparacao-design.md
--
-- ----------------------------------------------------------
-- De quem são as colunas
-- ----------------------------------------------------------
-- NOSSAS. O RevendaMais não as conhece, e a trava `estoque_motors_trava_do_sync`
-- (20260902150000) é allowlist por construção: descarta toda escrita do sync
-- fora de preço e `last_seen_at`. As duas nascem protegidas sem entrar em lista
-- nenhuma.
--
-- Migração ADITIVA: duas colunas, um CHECK, comentários e autoconferência.
-- ==========================================================

alter table public.estoque_motors
  add column if not exists em_preparacao boolean not null default false;

alter table public.estoque_motors
  add column if not exists previsao_chegada_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.estoque_motors'::regclass
      and conname = 'estoque_motors_em_preparacao_tem_data'
  ) then
    -- Caixa marcada sem data é contagem para lugar nenhum. O editor já barra;
    -- este CHECK é a segunda defesa, para o caminho que não passar por ele.
    alter table public.estoque_motors
      add constraint estoque_motors_em_preparacao_tem_data
      check (not em_preparacao or previsao_chegada_em is not null);
  end if;
end $$;

comment on column public.estoque_motors.em_preparacao is
  'Carro que chegou e ainda não está pronto para o pátio. Com previsao_chegada_em, libera a publicação com 1 foto (a de cadastro) e o site mostra a contagem até a data; o feed de anúncios o recusa até ter 4 fotos. A equipe desmarca quando o carro fica pronto — a caixa não se desliga sozinha. Coluna do painel: o sync do RevendaMais não a escreve.';

comment on column public.estoque_motors.previsao_chegada_em is
  'Quando o carro em preparação deve chegar ao pátio. Obrigatória com em_preparacao (CHECK estoque_motors_em_preparacao_tem_data). Depois da data o carro continua no ar com "chega a qualquer momento" (decisão do dono, 28/09/2026) e o painel acusa a previsão vencida.';

-- ----------------------------------------------------------
-- Autoconferência
-- ----------------------------------------------------------
-- Pelo catálogo, e não por um UPDATE de prova: a trava do sync reconhece a
-- identidade de serviço e descartaria a escrita de teste em silêncio, e o
-- "CHECK funcionou" seria falso positivo.
do $$
declare
  n int;
  padrao text;
begin
  select count(*) into n
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'estoque_motors'
     and column_name in ('em_preparacao', 'previsao_chegada_em');
  if n <> 2 then
    raise exception 'AUTOCONFERÊNCIA: esperava 2 colunas novas em estoque_motors, achei %', n;
  end if;

  select column_default into padrao
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'estoque_motors'
     and column_name = 'em_preparacao';
  if padrao is distinct from 'false' then
    raise exception 'AUTOCONFERÊNCIA: em_preparacao tinha de nascer false em todo o estoque (default = %)', padrao;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.estoque_motors'::regclass
       and conname = 'estoque_motors_em_preparacao_tem_data'
  ) then
    raise exception 'AUTOCONFERÊNCIA: o CHECK da data não está no lugar';
  end if;

  raise notice 'Em preparação OK: duas colunas, default false, CHECK da data no lugar.';
end $$;


-- ==========================================================
-- Rodapé de auto-registro no livro-razão (regra do README)
-- ==========================================================
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260928150000', 'em_preparacao')
  on conflict (version) do nothing;
```

- [ ] **Passo 4: tipo, mapper, lista branca e matriz**

Em `src/types/index.ts`, dentro de `interface Veiculo`, logo depois de `vendido?: boolean;`:

```ts
  /**
   * Carro que chegou e ainda não está pronto para o pátio (migração
   * 20260928150000). Com `previsao_chegada_em`, libera a publicação com uma
   * foto só — ver `liberadoEmPreparacao` em `lib/coerenciaDoCadastro.ts`.
   */
  em_preparacao?: boolean;
  /** Quando o carro deve chegar ao pátio. ISO 8601 com fuso, como o banco devolve. */
  previsao_chegada_em?: string | null;
```

Em `src/lib/supabase.ts`, em `mapVeiculoDbToVeiculo`, logo depois de `status_tag_color: dbItem.status_tag_color || "green",`:

```ts
    // Carro em preparação (migração 20260928150000). Público de propósito: a
    // contagem até o pátio é para o cliente. `=== true` e não `!!`: coluna
    // ausente (migração por aplicar) e valor estranho ficam `false`.
    em_preparacao: dbItem.em_preparacao === true,
    previsao_chegada_em: dbItem.previsao_chegada_em ?? null,
```

Em `src/lib/estoqueEscrita.ts`, em `CAMPOS_NOSSOS`, logo depois de `"perfis_uso",`:

```ts
  // Migração 20260928150000. O carro "em preparação" e a data prevista de
  // chegada ao pátio: decisão da loja, que o RevendaMais não conhece.
  "em_preparacao",
  "previsao_chegada_em",
```

Em `src/lib/permissoes.ts`, em `ACAO_DO_CAMPO_DE_VEICULO`, logo depois de `status_tag_color: "Editar opcionais e destaques rápidos",`:

```ts
  // A mesma linha da etiqueta: "em preparação" é o que o anúncio diz sobre o
  // carro, e quem escreve a etiqueta decide isto. Publicar continua sendo outra
  // linha ("Publicar ou despublicar veículo").
  em_preparacao: "Editar opcionais e destaques rápidos",
  previsao_chegada_em: "Editar opcionais e destaques rápidos",
```

- [ ] **Passo 5: documentação**

Em `docs/PROPRIEDADE_DOS_CAMPOS.md`, na linha **Nosso** da tabela "As três origens", acrescentar `` `em_preparacao`, `previsao_chegada_em` `` ao fim da lista de campos.

Em `supabase/README.md`, na tabela de migrações, acrescentar ao fim:

```markdown
| `20260928150000_em_preparacao.sql` | Carro "em preparação": `estoque_motors.em_preparacao` (default false) e `previsao_chegada_em`, com CHECK que exige a data quando a caixa está marcada. Colunas do painel — a trava do sync (allowlist) já as protege. Libera a publicação com 1 foto e mostra a contagem até o pátio (spec 2026-09-28). **Ainda não aplicada.** |
```

- [ ] **Passo 6: rodar e ver passar, com as travas vizinhas**

Rodar: `npx vitest run tests/em-preparacao-dados.test.ts tests/painel-grava-colunas.test.ts tests/permissoes.test.ts`
Esperado: PASSA. `painel-grava-colunas` prova que os dois campos são coluna real (lê o `add column` da migração); `permissoes` prova a linha na matriz.

- [ ] **Passo 7: conferir que a trava reprova**

Apague temporariamente o `"previsao_chegada_em"` da linha de `ACAO_DO_CAMPO_DE_VEICULO`. Rode `npx vitest run tests/permissoes.test.ts tests/em-preparacao-dados.test.ts`. Esperado: FALHA ("Campo gravável sem linha na matriz A17: previsao_chegada_em"). Restaure.

- [ ] **Passo 8: lint e commit**

```bash
npx eslint src/lib/estoqueEscrita.ts src/lib/permissoes.ts src/lib/supabase.ts src/types/index.ts tests/em-preparacao-dados.test.ts
git add supabase/migrations/20260928150000_em_preparacao.sql src/lib/estoqueEscrita.ts src/lib/permissoes.ts src/types/index.ts src/lib/supabase.ts docs/PROPRIEDADE_DOS_CAMPOS.md supabase/README.md tests/em-preparacao-dados.test.ts
git commit -F <arquivo-com-a-mensagem>
```

Mensagem: `feat(estoque): colunas do carro em preparação, no mapper e na lista do painel` + corpo curto + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No PowerShell 5.1, mensagem com aspas vai por arquivo (`git commit -F`), nunca por `-m` com here-string.

---

### Tarefa 2: A régua — a exceção, a foto de verdade e o feed

**Arquivos:**
- Modificar: `src/lib/coerenciaDoCadastro.ts` (bloco "Bloqueio de publicação", linhas ~205-376), `src/lib/estadoDoCadastro.ts` (`recusasParaPublicar`, ~137-151), `src/app/api/feed/xml/route.ts` (laço `for (const car of vehicles)`, ~117)
- Teste: `tests/em-preparacao-regua.test.ts` (novo), `tests/em-preparacao-feed.test.ts` (novo)

**Interfaces:**
- Consome: `Veiculo.em_preparacao`, `Veiculo.previsao_chegada_em` (Tarefa 1).
- Produz:
  - `export const MINIMO_DE_FOTOS_EM_PREPARACAO = 1`
  - `export function liberadoEmPreparacao(v: { em_preparacao?: unknown; previsao_chegada_em?: unknown }): boolean`
  - `export function entraNoFeedDeAnuncios(v: { whatsapp_images?: unknown; em_preparacao?: unknown }): boolean`
  - `bloqueiosDePublicacao` e `publicavel` passam a aceitar `em_preparacao?` e `previsao_chegada_em?` no argumento.

- [ ] **Passo 1: escrever o teste da régua que falha**

`tests/em-preparacao-regua.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  bloqueiosDePublicacao,
  entraNoFeedDeAnuncios,
  liberadoEmPreparacao,
  MINIMO_DE_FOTOS,
  MINIMO_DE_FOTOS_EM_PREPARACAO,
  publicavel,
} from "../src/lib/coerenciaDoCadastro";
import { recusasParaPublicar } from "../src/lib/estadoDoCadastro";

/**
 * A exceção do carro "em preparação" na régua de publicação — spec
 * 2026-09-28-em-preparacao-design, seção "A régua de publicação".
 */

const fotos = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.exemplo/f${i}.jpg`);
const DATA = "2026-10-03T17:00:00+00:00";

describe("quando a exceção vale", () => {
  it("caixa marcada E data válida", () => {
    expect(liberadoEmPreparacao({ em_preparacao: true, previsao_chegada_em: DATA })).toBe(true);
  });

  it("caixa sem data, data sem caixa, data que não é data: não vale", () => {
    expect(liberadoEmPreparacao({ em_preparacao: true, previsao_chegada_em: null })).toBe(false);
    expect(liberadoEmPreparacao({ em_preparacao: true, previsao_chegada_em: "" })).toBe(false);
    expect(liberadoEmPreparacao({ em_preparacao: true, previsao_chegada_em: "amanhã" })).toBe(false);
    expect(liberadoEmPreparacao({ em_preparacao: false, previsao_chegada_em: DATA })).toBe(false);
    expect(liberadoEmPreparacao({ previsao_chegada_em: DATA })).toBe(false);
  });
});

describe("a régua com a exceção", () => {
  it("o mínimo em preparação é uma foto", () => {
    expect(MINIMO_DE_FOTOS_EM_PREPARACAO).toBe(1);
  });

  it("1 foto + caixa + data: publica, com a pendência da ficha à vista", () => {
    const motivos = bloqueiosDePublicacao({
      whatsapp_images: fotos(1),
      em_preparacao: true,
      previsao_chegada_em: DATA,
    });
    expect(motivos.some((m) => m.bloqueia)).toBe(false);
    expect(motivos).toEqual([
      expect.objectContaining({ id: "fotos-incompletas", texto: expect.stringMatching(/^no ar com 1 foto — /) }),
    ]);
  });

  it("1 foto + caixa SEM data: a régua de sempre", () => {
    const motivos = bloqueiosDePublicacao({ whatsapp_images: fotos(1), em_preparacao: true });
    expect(motivos).toEqual([
      expect.objectContaining({ id: "poucas-fotos", bloqueia: true, texto: expect.stringMatching(/^1 de 4 fotos/) }),
    ]);
  });

  it("sem a caixa, nada muda: 1 e 3 fotos seguem fora, 4 entra", () => {
    expect(publicavel({ whatsapp_images: fotos(1) })).toBe(false);
    expect(publicavel({ whatsapp_images: fotos(3) })).toBe(false);
    expect(publicavel({ whatsapp_images: fotos(MINIMO_DE_FOTOS) })).toBe(true);
  });

  it("em preparação sem foto nenhuma continua fora — o texto diz 1, não 4", () => {
    const motivos = bloqueiosDePublicacao({ whatsapp_images: [], em_preparacao: true, previsao_chegada_em: DATA });
    expect(motivos[0]).toMatchObject({ id: "poucas-fotos", bloqueia: true });
    expect(motivos[0].texto).toMatch(/^0 de 1 foto para publicar/);
  });

  it("o /logo.png do mapper não conta como foto", () => {
    // `mapVeiculoDbToVeiculo` põe "/logo.png" quando o carro não tem foto
    // nenhuma. A ficha julga o objeto MAPEADO; sem esta regra, o carro em
    // preparação sem foto sairia bloqueado na vitrine e liberado na ficha.
    expect(
      publicavel({ whatsapp_images: ["/logo.png"], em_preparacao: true, previsao_chegada_em: DATA }),
    ).toBe(false);
  });
});

describe("publicar e marcar em preparação no mesmo salvamento", () => {
  it("a recusa julga o valor NOVO", () => {
    const antes = { id: 8479269, whatsapp_images: fotos(1) };
    const atualizacao = { em_preparacao: true, previsao_chegada_em: DATA };
    expect(recusasParaPublicar([{ ...antes, ...atualizacao }])).toEqual([]);
    expect(recusasParaPublicar([antes])).toHaveLength(1);
  });
});

describe("o feed de anúncios recusa a exceção", () => {
  it("em preparação com menos de 4 fotos fica fora", () => {
    expect(entraNoFeedDeAnuncios({ whatsapp_images: fotos(1), em_preparacao: true })).toBe(false);
    expect(entraNoFeedDeAnuncios({ whatsapp_images: fotos(3), em_preparacao: true })).toBe(false);
  });

  it("em preparação com 4 fotos entra", () => {
    expect(entraNoFeedDeAnuncios({ whatsapp_images: fotos(4), em_preparacao: true })).toBe(true);
  });

  it("carro fora de preparação: o feed confia na vitrine, como sempre", () => {
    // O `getEstoque` já cortou quem não cumpre a régua. Repetir a régua aqui
    // quebraria o feed de todo teste e de todo carro que a vitrine aceita.
    expect(entraNoFeedDeAnuncios({ whatsapp_images: fotos(1) })).toBe(true);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/em-preparacao-regua.test.ts`
Esperado: FALHA — `liberadoEmPreparacao is not a function` (e os outros nomes novos).

- [ ] **Passo 3: implementar em `coerenciaDoCadastro.ts`**

Logo depois de `export const FOTOS_DA_FICHA_COMPLETA = 8;`:

```ts
/**
 * Quantas fotos o carro EM PREPARAÇÃO precisa para ir ao ar: a de cadastro.
 *
 * Pedido do dono em 28/09/2026: carro que acabou de chegar ia ao mercado com
 * uma foto só, e a porta de quatro o escondia do site na janela em que ele é
 * novidade. A exceção vale só com a caixa marcada E a data prevista de
 * chegada ao pátio (`liberadoEmPreparacao`) — é a data que faz da foto única
 * uma promessa com prazo, e não um anúncio magro.
 *
 * O feed de anúncios NÃO aceita a exceção (`entraNoFeedDeAnuncios`): anúncio
 * pago com foto de cadastro rende pouco, e a decisão do dono foi "só no site".
 */
export const MINIMO_DE_FOTOS_EM_PREPARACAO = 1;

/**
 * O último degrau do mapper quando o carro não tem foto nenhuma — não é foto.
 *
 * `mapVeiculoDbToVeiculo` preenche `whatsapp_images` com `url_imagem` ou, sem
 * nada, com este caminho. A vitrine julga a linha crua e a ficha julga o
 * objeto mapeado: com a porta em quatro a diferença nunca mudou a resposta
 * (0 ou 1 foto, fora do mesmo jeito), mas com a porta em UMA o logotipo passaria
 * por foto de cadastro.
 */
const FOTO_DE_QUEDA_DO_MAPPER = "/logo.png";

function contarFotos(whatsappImages: unknown): number {
  return Array.isArray(whatsappImages)
    ? whatsappImages.filter((foto) => Boolean(foto) && foto !== FOTO_DE_QUEDA_DO_MAPPER).length
    : 0;
}

/** Se a exceção do carro em preparação vale: a caixa marcada E uma data de verdade. */
export function liberadoEmPreparacao(veiculo: {
  em_preparacao?: unknown;
  previsao_chegada_em?: unknown;
}): boolean {
  if (veiculo.em_preparacao !== true) return false;
  const data = veiculo.previsao_chegada_em;
  return typeof data === "string" && data.trim() !== "" && !Number.isNaN(Date.parse(data));
}

const fotoOuFotos = (n: number) => (n === 1 ? "foto" : "fotos");
```

Em `bloqueiosDePublicacao`, trocar a assinatura e as linhas da contagem e das duas faixas:

```ts
export function bloqueiosDePublicacao(veiculo: {
  whatsapp_images?: unknown;
  em_preparacao?: unknown;
  previsao_chegada_em?: unknown;
}): MotivoDeBloqueio[] {
  const motivos: MotivoDeBloqueio[] = [];

  const fotos = contarFotos(veiculo.whatsapp_images);
  // A porta baixa para uma foto SÓ com a caixa e a data — ver
  // `MINIMO_DE_FOTOS_EM_PREPARACAO`.
  const minimo = liberadoEmPreparacao(veiculo) ? MINIMO_DE_FOTOS_EM_PREPARACAO : MINIMO_DE_FOTOS;
```

(o bloco de comentário e `const deOndeVemAFoto = "suba as fotos pelo painel";` ficam como estão)

```ts
  if (fotos < minimo) {
    motivos.push({
      id: "poucas-fotos",
      texto: `${fotos} de ${minimo} ${fotoOuFotos(minimo)} para publicar — ${deOndeVemAFoto}`,
      bloqueia: true,
    });
  } else if (fotos < FOTOS_DA_FICHA_COMPLETA) {
    motivos.push({
      id: "fotos-incompletas",
      // (comentário existente mantido)
      texto:
        `no ar com ${fotos} ${fotoOuFotos(fotos)} — a ficha completa pede ${FOTOS_DA_FICHA_COMPLETA} ` +
        `(${deOndeVemAFoto})`,
      bloqueia: false,
    });
  }
```

Em `publicavel`, acrescentar ao tipo do argumento `em_preparacao?: unknown; previsao_chegada_em?: unknown;`.

Depois de `publicavel`:

```ts
/**
 * Se o carro entra no feed de anúncios (Meta e Google, `/api/feed/xml`).
 *
 * O feed confia na vitrine — o `getEstoque` já cortou quem não cumpre a régua —
 * com UMA exceção: o carro em preparação só entra com as quatro fotos de
 * sempre. Decisão do dono em 28/09/2026, "só no site": anúncio pago com a foto
 * de cadastro rende pouco, e a Meta pode reprovar imagem genérica.
 *
 * Olha a CAIXA, não a data: sem data a vitrine já o recusa abaixo de quatro, e
 * com data o feed recusa do mesmo jeito.
 */
export function entraNoFeedDeAnuncios(veiculo: {
  whatsapp_images?: unknown;
  em_preparacao?: unknown;
}): boolean {
  if (veiculo.em_preparacao !== true) return true;
  return contarFotos(veiculo.whatsapp_images) >= MINIMO_DE_FOTOS;
}
```

Em `src/lib/estadoDoCadastro.ts`, no tipo do argumento de `recusasParaPublicar`, acrescentar `em_preparacao?: unknown; previsao_chegada_em?: unknown;`.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run tests/em-preparacao-regua.test.ts tests/coerencia-do-cadastro.test.ts tests/estoque-tabela.test.ts tests/fotos-do-veiculo.test.ts tests/rascunho-e-publicacao.test.ts tests/cadastro-nativo.test.ts`
Esperado: PASSA. Se uma trava antiga comparar o texto exato de "poucas-fotos" ou "fotos-incompletas", ela deve continuar verde: com mais de uma foto o plural não muda.

- [ ] **Passo 5: escrever o teste do feed que falha**

`tests/em-preparacao-feed.test.ts` — o molde é `tests/feed-catalogo-meta.test.ts` (exercita o handler de verdade, com `getEstoque` e `getDatasDeVenda` dublados):

```ts
import { describe, it, expect, vi } from "vitest";
import type { Veiculo } from "../src/types";

/**
 * O feed de anúncios recusa o carro "em preparação" até ter 4 fotos — decisão
 * do dono em 28/09/2026, "só no site". Exercita o handler, como
 * `feed-catalogo-meta.test.ts`.
 */

const fotos = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.exemplo/f${i}.jpg`);

const carro = (id: string, over: Partial<Veiculo> = {}): Veiculo =>
  ({
    id,
    marca: "volkswagen",
    modelo: "polo track",
    versao: "",
    ano: 2025,
    quilometragem: 12000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "",
    preco_original: 89900,
    preco_promocional: 0,
    pericia: "",
    tipo: "Hatch",
    whatsapp_images: fotos(1),
    web_full_images: fotos(1),
    opcionais: "",
    laudo_pericia: "",
    descricao: "Um carro.",
    vendido: false,
    ...over,
  }) as Veiculo;

let estoque: Veiculo[] = [];

vi.mock("../src/lib/supabase", async (original) => {
  const real = await original<typeof import("../src/lib/supabase")>();
  return { ...real, getEstoque: async () => estoque };
});

vi.mock("../src/lib/publicacao", async (original) => {
  const real = await original<typeof import("../src/lib/publicacao")>();
  return { ...real, getDatasDeVenda: async () => ({}) };
});

async function gerarFeed(veiculos: Veiculo[]): Promise<string> {
  estoque = veiculos;
  const { GET } = await import("../src/app/api/feed/xml/route");
  return await (await GET(new Request("https://motorsstore.com.br/api/feed/xml"))).text();
}

const DATA = "2026-10-03T17:00:00+00:00";

describe("o feed e o carro em preparação", () => {
  it("em preparação com a foto de cadastro: fora do feed", async () => {
    const xml = await gerarFeed([
      carro("1001", { em_preparacao: true, previsao_chegada_em: DATA }),
    ]);
    expect(xml).not.toContain("<g:id>1001</g:id>");
  });

  it("em preparação com 4 fotos: no feed", async () => {
    const xml = await gerarFeed([
      carro("1002", { em_preparacao: true, previsao_chegada_em: DATA, whatsapp_images: fotos(4) }),
    ]);
    expect(xml).toContain("<g:id>1002</g:id>");
  });

  it("controle: carro comum que a vitrine aceitou continua no feed", async () => {
    const xml = await gerarFeed([carro("1003")]);
    expect(xml).toContain("<g:id>1003</g:id>");
  });
});
```

- [ ] **Passo 6: rodar e ver falhar**

Rodar: `npx vitest run tests/em-preparacao-feed.test.ts`
Esperado: FALHA no primeiro caso — o 1001 está no feed.

- [ ] **Passo 7: implementar no feed**

Em `src/app/api/feed/xml/route.ts`, importar `entraNoFeedDeAnuncios` de `../../../../lib/coerenciaDoCadastro` e, como PRIMEIRA linha do corpo de `for (const car of vehicles) {`:

```ts
      // Carro em preparação só entra com as quatro fotos de sempre — decisão
      // do dono em 28/09, "só no site". Ver `entraNoFeedDeAnuncios`. Antes de
      // `decidirNoFeed`: ele nunca esteve no catálogo, então não há item a
      // manter como `out_of_stock`.
      if (!entraNoFeedDeAnuncios(car)) continue;
```

- [ ] **Passo 8: rodar e ver passar, com as travas do feed**

Rodar: `npx vitest run tests/em-preparacao-feed.test.ts tests/feed-catalogo-meta.test.ts tests/feed-de-catalogo.test.ts`
Esperado: PASSA.

- [ ] **Passo 9: conferir que as travas reprovam**

Uma de cada vez, restaurando depois:
1. Em `bloqueiosDePublicacao`, troque `const minimo = liberadoEmPreparacao(veiculo) ? ... : MINIMO_DE_FOTOS;` por `const minimo = MINIMO_DE_FOTOS;` → `em-preparacao-regua` reprova.
2. Em `liberadoEmPreparacao`, apague a checagem da data (`return true` logo depois do `if`) → reprova "1 foto + caixa SEM data".
3. Em `contarFotos`, apague `&& foto !== FOTO_DE_QUEDA_DO_MAPPER` → reprova "o /logo.png do mapper não conta como foto".
4. No feed, apague a linha `if (!entraNoFeedDeAnuncios(car)) continue;` → `em-preparacao-feed` reprova.

- [ ] **Passo 10: lint e commit**

```bash
npx eslint src/lib/coerenciaDoCadastro.ts src/lib/estadoDoCadastro.ts src/app/api/feed/xml/route.ts tests/em-preparacao-regua.test.ts tests/em-preparacao-feed.test.ts
git add src/lib/coerenciaDoCadastro.ts src/lib/estadoDoCadastro.ts src/app/api/feed/xml/route.ts tests/em-preparacao-regua.test.ts tests/em-preparacao-feed.test.ts
git commit -F <arquivo-com-a-mensagem>
```

Mensagem: `feat(estoque): carro em preparação publica com a foto de cadastro, e o feed o recusa até ter 4`.

---

### Tarefa 3: O tempo — `lib/emPreparacao.ts`

**Arquivos:**
- Criar: `src/lib/emPreparacao.ts`
- Teste: `tests/em-preparacao-tempo.test.ts` (novo)

**Interfaces:**
- Consome: `liberadoEmPreparacao` (Tarefa 2).
- Produz:
  - `type ChegadaAoPatio = { fase: "a-caminho"; dias: number; data: Date } | { fase: "a-qualquer-momento"; diasDeAtraso: number; data: Date }`
  - `type Instante = Date | number` (número = milissegundos, como `Date.now()`)
  - `chegadaAoPatio(v: { em_preparacao?: unknown; previsao_chegada_em?: unknown }, agora?: Instante): ChegadaAoPatio | null`
  - `faixaDaChegada(c: ChegadaAoPatio): string`
  - `interface Relogio { dias: number; horas: number; minutos: number; segundos: number }`
  - `relogioAte(data: Date, agora: Instante): Relogio | null`
  - `formatarRelogio(r: Relogio): string`
  - `dataDaPrevisao(iso: string): string`
  - `diasDePrevisaoVencida(v: { em_preparacao?: unknown; previsao_chegada_em?: unknown }, agora?: Instante): number | null`
  - `paraCampoDataHora(iso: string | null | undefined): string`
  - `doCampoDataHora(valor: string): string | null`

- [ ] **Passo 1: escrever o teste que falha**

`tests/em-preparacao-tempo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  chegadaAoPatio,
  dataDaPrevisao,
  diasDePrevisaoVencida,
  doCampoDataHora,
  faixaDaChegada,
  formatarRelogio,
  paraCampoDataHora,
  relogioAte,
} from "../src/lib/emPreparacao";

/**
 * O tempo do carro "em preparação", contado em São Paulo — spec
 * 2026-09-28-em-preparacao-design, seção "Site".
 *
 * Os instantes estão em UTC; o comentário de cada um diz a hora de São Paulo
 * (UTC-3 o ano todo desde 2019).
 */

const em = (previsao: string) => ({ em_preparacao: true, previsao_chegada_em: previsao });
const SEGUNDA_10H = new Date("2026-09-28T13:00:00Z"); // seg 28/09, 10h

describe("a fase e os dias de calendário", () => {
  it("cinco dias antes", () => {
    const c = chegadaAoPatio(em("2026-10-03T17:00:00Z"), SEGUNDA_10H); // sáb 03/10, 14h
    expect(c).toMatchObject({ fase: "a-caminho", dias: 5 });
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA EM 5 DIAS");
  });

  it("no mesmo dia, horas antes: HOJE", () => {
    const c = chegadaAoPatio(em("2026-09-28T20:00:00Z"), SEGUNDA_10H); // seg 17h
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA HOJE");
  });

  it("dias de CALENDÁRIO, não horas ÷ 24: faltando 16 horas, a previsão é amanhã", () => {
    // Seg 10h → ter 2h. Horas ÷ 24 dariam 0, "HOJE" — e a pessoa lê o
    // calendário, não o cronômetro.
    const c = chegadaAoPatio(em("2026-09-29T05:00:00Z"), SEGUNDA_10H);
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA AMANHÃ");
  });

  it("a virada do dia é a de São Paulo, não a de Greenwich", () => {
    // Dom 27/09 às 23h30 em SP já é segunda em UTC. A previsão de seg 9h é
    // AMANHÃ para quem está na loja.
    const agora = new Date("2026-09-28T02:30:00Z");
    const c = chegadaAoPatio(em("2026-09-28T12:00:00Z"), agora);
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA AMANHÃ");
  });

  it("depois da data: a qualquer momento, com o atraso contado", () => {
    const agora = new Date("2026-10-05T13:00:00Z"); // seg 05/10
    const c = chegadaAoPatio(em("2026-10-03T17:00:00Z"), agora);
    expect(c).toMatchObject({ fase: "a-qualquer-momento", diasDeAtraso: 2 });
    expect(faixaDaChegada(c!)).toBe("EM PREPARAÇÃO · CHEGA A QUALQUER MOMENTO");
    expect(diasDePrevisaoVencida(em("2026-10-03T17:00:00Z"), agora)).toBe(2);
  });

  it("sem a caixa, ou sem data, não há chegada nenhuma", () => {
    expect(chegadaAoPatio({ em_preparacao: false, previsao_chegada_em: "2026-10-03T17:00:00Z" }, SEGUNDA_10H)).toBeNull();
    expect(chegadaAoPatio({ em_preparacao: true, previsao_chegada_em: null }, SEGUNDA_10H)).toBeNull();
    expect(diasDePrevisaoVencida({ em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00Z" }, SEGUNDA_10H)).toBeNull();
  });
});

describe("o relógio da ficha", () => {
  it("dias, horas, minutos e segundos até a data", () => {
    const r = relogioAte(new Date("2026-10-03T17:00:00Z"), SEGUNDA_10H);
    expect(r).toEqual({ dias: 5, horas: 4, minutos: 0, segundos: 0 });
    expect(formatarRelogio(r!)).toBe("05d 04h 00m 00s");
  });

  it("um segundo depois", () => {
    const r = relogioAte(new Date("2026-10-03T17:00:00Z"), new Date("2026-09-28T13:00:01Z"));
    expect(formatarRelogio(r!)).toBe("05d 03h 59m 59s");
  });

  it("data passada não tem relógio", () => {
    expect(relogioAte(new Date("2026-09-28T12:00:00Z"), SEGUNDA_10H)).toBeNull();
  });
});

describe("a data escrita", () => {
  it("dia, mês e hora de São Paulo", () => {
    expect(dataDaPrevisao("2026-10-03T17:00:00Z")).toBe("03/10 às 14h");
  });

  it("com minutos quando há minutos", () => {
    expect(dataDaPrevisao("2026-10-03T17:30:00Z")).toBe("03/10 às 14h30");
  });
});

describe("o campo de data e hora do painel", () => {
  it("do banco para o campo: o horário de São Paulo", () => {
    expect(paraCampoDataHora("2026-10-03T17:00:00+00:00")).toBe("2026-10-03T14:00");
  });

  it("do campo para o banco: o instante certo", () => {
    expect(doCampoDataHora("2026-10-03T14:00")).toBe("2026-10-03T17:00:00.000Z");
  });

  it("ida e volta devolve o mesmo campo", () => {
    expect(paraCampoDataHora(doCampoDataHora("2026-12-31T23:30"))).toBe("2026-12-31T23:30");
  });

  it("vazio e lixo não viram data", () => {
    expect(paraCampoDataHora(null)).toBe("");
    expect(paraCampoDataHora("ontem")).toBe("");
    expect(doCampoDataHora("")).toBeNull();
    expect(doCampoDataHora("03/10/2026")).toBeNull();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/em-preparacao-tempo.test.ts`
Esperado: FALHA — o módulo não existe.

- [ ] **Passo 3: implementar**

`src/lib/emPreparacao.ts`:

```ts
import { liberadoEmPreparacao } from "./coerenciaDoCadastro";

/**
 * O tempo do carro "em preparação": quanto falta para ele chegar ao pátio.
 *
 * Pedido do dono em 28/09/2026 — "com um countdown na área externa criando
 * expectativa". O card e a TV mostram DIAS; a ficha mostra o relógio. Desenho:
 * docs/superpowers/specs/2026-09-28-em-preparacao-design.md
 *
 * ---------------------------------------------------------------------------
 * O "agora" entra por parâmetro, com valor padrão
 * ---------------------------------------------------------------------------
 * A regra `react-hooks/purity` recusa `new Date()` no corpo de componente. O
 * relógio É uma função do tempo; a impureza mora aqui, num lugar só e à vista,
 * e os testes passam o instante que quiserem.
 */

const FUSO = "America/Sao_Paulo";

/**
 * Um instante: `Date`, ou milissegundos como devolve `Date.now()`. O número
 * existe para o relógio da ficha, que guarda o tempo em estado e não pode
 * construir `Date` no corpo do componente (`react-hooks/purity`).
 */
export type Instante = Date | number;

const emMs = (instante: Instante) => (typeof instante === "number" ? instante : instante.getTime());

/** "2026-10-03": o dia do calendário de São Paulo em que o instante cai. */
function diaEmSaoPaulo(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/**
 * Dias de CALENDÁRIO entre dois instantes, contados em São Paulo.
 *
 * Não é horas ÷ 24: faltando 16 horas numa segunda às 10h, a previsão é
 * terça às 2h — "amanhã" no calendário, e a divisão diria "hoje".
 */
function diasDeCalendario(de: Date, ate: Date): number {
  const inicio = Date.parse(`${diaEmSaoPaulo(de)}T00:00:00Z`);
  const fim = Date.parse(`${diaEmSaoPaulo(ate)}T00:00:00Z`);
  return Math.round((fim - inicio) / 86_400_000);
}

export type ChegadaAoPatio =
  | { fase: "a-caminho"; dias: number; data: Date }
  | { fase: "a-qualquer-momento"; diasDeAtraso: number; data: Date };

/**
 * Em que pé está a chegada, ou `null` quando o carro não está em preparação.
 *
 * Passada a data, o carro continua no ar e a frase deixa de prometer dia —
 * decisão do dono em 28/09 ("continua no ar").
 */
export function chegadaAoPatio(
  veiculo: { em_preparacao?: unknown; previsao_chegada_em?: unknown },
  agora: Instante = Date.now(),
): ChegadaAoPatio | null {
  if (!liberadoEmPreparacao(veiculo)) return null;
  const data = new Date(veiculo.previsao_chegada_em as string);
  const instante = new Date(emMs(agora));
  if (instante.getTime() < data.getTime()) {
    return { fase: "a-caminho", dias: diasDeCalendario(instante, data), data };
  }
  return { fase: "a-qualquer-momento", diasDeAtraso: diasDeCalendario(data, instante), data };
}

/** A faixa do card, da TV e do balcão. */
export function faixaDaChegada(chegada: ChegadaAoPatio): string {
  if (chegada.fase === "a-qualquer-momento") return "EM PREPARAÇÃO · CHEGA A QUALQUER MOMENTO";
  if (chegada.dias <= 0) return "EM PREPARAÇÃO · CHEGA HOJE";
  if (chegada.dias === 1) return "EM PREPARAÇÃO · CHEGA AMANHÃ";
  return `EM PREPARAÇÃO · CHEGA EM ${chegada.dias} DIAS`;
}

/** Há quantos dias a previsão passou; `null` quando não passou ou não há previsão. */
export function diasDePrevisaoVencida(
  veiculo: { em_preparacao?: unknown; previsao_chegada_em?: unknown },
  agora: Instante = Date.now(),
): number | null {
  const chegada = chegadaAoPatio(veiculo, agora);
  return chegada?.fase === "a-qualquer-momento" ? chegada.diasDeAtraso : null;
}

export interface Relogio {
  dias: number;
  horas: number;
  minutos: number;
  segundos: number;
}

/** O que falta até a data, em partes; `null` quando a data já passou. */
export function relogioAte(data: Date, agora: Instante): Relogio | null {
  const total = Math.floor((data.getTime() - emMs(agora)) / 1000);
  if (total <= 0) return null;
  return {
    dias: Math.floor(total / 86_400),
    horas: Math.floor((total % 86_400) / 3_600),
    minutos: Math.floor((total % 3_600) / 60),
    segundos: total % 60,
  };
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** "05d 04h 00m 00s" — largura fixa, para o relógio não tremer a cada segundo. */
export function formatarRelogio(r: Relogio): string {
  return `${doisDigitos(r.dias)}d ${doisDigitos(r.horas)}h ${doisDigitos(r.minutos)}m ${doisDigitos(r.segundos)}s`;
}

function partesEmSaoPaulo(instante: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    ano: parte("year"),
    mes: parte("month"),
    dia: parte("day"),
    hora: parte("hour"),
    minuto: parte("minute"),
  };
}

/** "03/10 às 14h", ou "03/10 às 14h30" — a data que a ficha escreve. */
export function dataDaPrevisao(iso: string): string {
  const p = partesEmSaoPaulo(new Date(iso));
  return `${p.dia}/${p.mes} às ${p.hora}h${p.minuto === "00" ? "" : p.minuto}`;
}

/**
 * O valor do `<input type="datetime-local">` a partir do que o banco guarda.
 *
 * O campo não tem fuso: mostra o horário de São Paulo, que é o da loja, e não
 * o do computador de quem abriu o painel.
 */
export function paraCampoDataHora(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const p = partesEmSaoPaulo(new Date(iso));
  return `${p.ano}-${p.mes}-${p.dia}T${p.hora}:${p.minuto}`;
}

/**
 * O instante que o banco guarda, a partir do campo do painel.
 *
 * `-03:00` fixo: o Brasil não tem horário de verão desde 2019 (Decreto
 * 9.772). Se ele voltar, esta é a linha a mudar.
 */
export function doCampoDataHora(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const instante = new Date(`${valor}:00-03:00`);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run tests/em-preparacao-tempo.test.ts`
Esperado: PASSA.

- [ ] **Passo 5: conferir que a trava reprova**

Troque o corpo de `diasDeCalendario` por `return Math.floor((ate.getTime() - de.getTime()) / 86_400_000);` (o defeito de horas ÷ 24). Esperado: reprovam "faltando 16 horas…" e "a virada do dia…". Restaure.

- [ ] **Passo 6: lint e commit**

```bash
npx eslint src/lib/emPreparacao.ts tests/em-preparacao-tempo.test.ts
git add src/lib/emPreparacao.ts tests/em-preparacao-tempo.test.ts
git commit -F <arquivo-com-a-mensagem>
```

Mensagem: `feat(estoque): o tempo do carro em preparação, em dias de calendário de São Paulo`.

---

### Tarefa 4: A faixa — card, TV e balcão

**Arquivos:**
- Criar: `src/components/modernist/FaixaEmPreparacao.tsx`
- Modificar: `src/components/modernist/primitivos.tsx` (`CardVeiculo`, bloco da foto ~321-330), `src/components/modernist/VitrineTV.tsx` (~126-130), `src/components/modernist/VitrineBalcao.tsx` (~178-182)
- Teste: `tests/em-preparacao-faixa.test.ts` (novo)

**Interfaces:**
- Consome: `chegadaAoPatio`, `faixaDaChegada` (Tarefa 3).
- Produz: `export default function FaixaEmPreparacao({ veiculo, className }: { veiculo: Pick<Veiculo, "em_preparacao" | "previsao_chegada_em">; className?: string }): JSX.Element | null`

- [ ] **Passo 1: escrever o teste que falha**

`tests/em-preparacao-faixa.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Veiculo } from "../src/types";

/**
 * A faixa "EM PREPARAÇÃO · CHEGA EM N DIAS" no card — renderizado, e afirmando
 * sobre o texto que chega ao leitor, nos dois ramos (memória "trava só vale se
 * reprovar": recorte de fonte tem sempre uma borda a mais).
 */

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _f, sizes: _s, priority: _p, unoptimized: _u, fetchPriority: _fp, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));

const veiculo = (over: Partial<Veiculo> = {}): Veiculo =>
  ({
    id: "8497421",
    marca: "Fiat",
    modelo: "Argo",
    versao: "Drive 1.0",
    ano: 2025,
    quilometragem: 9000,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Branco",
    fipe: "",
    preco_original: 79900,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: ["https://cdn.exemplo/f.jpg"],
    web_full_images: ["https://cdn.exemplo/f.webp"],
    opcionais: "",
    laudo_pericia: "",
    ...over,
  }) as Veiculo;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T13:00:00Z")); // seg 28/09, 10h em SP
});
afterEach(() => vi.useRealTimers());

async function card(v: Veiculo): Promise<string> {
  const { CardVeiculo } = await import("../src/components/modernist/primitivos");
  return renderToStaticMarkup(createElement(CardVeiculo, { veiculo: v, href: "/carros/x" }))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

describe("a faixa no card", () => {
  it("carro em preparação: a faixa com os dias, E o preço", async () => {
    const texto = await card(veiculo({ em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00Z" }));
    expect(texto).toContain("EM PREPARAÇÃO · CHEGA EM 5 DIAS");
    expect(texto).toMatch(/R\$\s79\.900/);
  });

  it("carro comum: nenhuma faixa", async () => {
    const texto = await card(veiculo());
    expect(texto).not.toContain("EM PREPARAÇÃO");
  });

  it("data vencida: sem prometer dia", async () => {
    const texto = await card(veiculo({ em_preparacao: true, previsao_chegada_em: "2026-09-25T17:00:00Z" }));
    expect(texto).toContain("EM PREPARAÇÃO · CHEGA A QUALQUER MOMENTO");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/em-preparacao-faixa.test.ts`
Esperado: FALHA — o texto "EM PREPARAÇÃO" não aparece.

- [ ] **Passo 3: implementar a faixa e ligar no card**

`src/components/modernist/FaixaEmPreparacao.tsx`:

```tsx
import type { Veiculo } from "../../types";
import { chegadaAoPatio, faixaDaChegada } from "../../lib/emPreparacao";

/**
 * "EM PREPARAÇÃO · CHEGA EM 5 DIAS", sobre a foto do card, da TV e do balcão.
 *
 * Em DIAS, e não em relógio: a decisão do dono em 28/09 foi o relógio só na
 * ficha, onde a pessoa já está interessada — trinta relógios piscando na grade
 * disputariam a atenção com o preço. Sem estado e sem efeito: serve ao
 * componente de servidor (o card da home) e ao de cliente (o catálogo, a TV).
 *
 * Nada aqui chama `new Date()`: o "agora" é o valor padrão de
 * `chegadaAoPatio`, e a regra `react-hooks/purity` fica satisfeita.
 */
export default function FaixaEmPreparacao({
  veiculo,
  className = "",
}: {
  veiculo: Pick<Veiculo, "em_preparacao" | "previsao_chegada_em">;
  className?: string;
}) {
  const chegada = chegadaAoPatio(veiculo);
  if (!chegada) return null;
  return (
    <span
      className={`pointer-events-none bg-mt-ink font-semibold tracking-[.12em] text-mt-inverso ${className}`}
    >
      {faixaDaChegada(chegada)}
    </span>
  );
}
```

Em `primitivos.tsx`, importar `FaixaEmPreparacao from "./FaixaEmPreparacao"` e, dentro do `<div className="relative aspect-[4/3] …">`, logo depois do bloco `{etiqueta && (…)}`:

```tsx
        {/* Carro em preparação: canto de baixo, à esquerda — o de cima é da
            etiqueta e o da direita é da contagem de fotos. */}
        <FaixaEmPreparacao
          veiculo={veiculo}
          className="absolute bottom-0 left-0 px-2 py-1 text-[9px]"
        />
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run tests/em-preparacao-faixa.test.ts`
Esperado: PASSA.

- [ ] **Passo 5: TV e balcão**

Em `VitrineTV.tsx`, importar a faixa e, logo depois do bloco `{carro.status_tag && (…)}` sobre a foto:

```tsx
          <FaixaEmPreparacao
            veiculo={carro}
            className="absolute bottom-0 left-0 px-[1.15vw] py-[1.3vh] text-[0.83vw]"
          />
```

Em `VitrineBalcao.tsx`, importar a faixa e, logo depois do bloco `{v.status_tag && (…)}` dentro da coluna da foto:

```tsx
                <FaixaEmPreparacao
                  veiculo={v}
                  className="absolute bottom-0 left-0 px-2 py-1 text-[9px]"
                />
```

Acrescentar ao teste um caso para cada um, montando o componente com o menor conjunto de props que o arquivo exige (leia a assinatura: `VitrineBalcao({ veiculos, … })`, `VitrineTV({ filtro, … })`) e afirmando que o texto renderizado contém a faixa para o carro em preparação e não contém para o comum. Se um deles depender de dado que só a página monta (settings, fetch), faça o caso pelo `renderToStaticMarkup` com os dublês de `next/*` já presentes e registre no teste, em comentário, o que foi dublado.

- [ ] **Passo 6: conferir que a trava reprova**

No card, apague o `<FaixaEmPreparacao …/>`. Esperado: reprova "carro em preparação: a faixa com os dias". Restaure.

- [ ] **Passo 7: lint e commit**

```bash
npx eslint src/components/modernist/FaixaEmPreparacao.tsx src/components/modernist/primitivos.tsx src/components/modernist/VitrineTV.tsx src/components/modernist/VitrineBalcao.tsx tests/em-preparacao-faixa.test.ts
git add src/components/modernist/FaixaEmPreparacao.tsx src/components/modernist/primitivos.tsx src/components/modernist/VitrineTV.tsx src/components/modernist/VitrineBalcao.tsx tests/em-preparacao-faixa.test.ts
git commit -F <arquivo-com-a-mensagem>
```

Mensagem: `feat(vitrine): faixa "em preparação · chega em N dias" no card, na TV e no balcão`.

---

### Tarefa 5: O relógio da ficha

**Arquivos:**
- Criar: `src/components/RelogioDaChegada.tsx`
- Modificar: `src/components/PDPClientWrapper.tsx` (em `renderSidebar`, logo antes do comentário `{/* Preço */}`, ~715)
- Teste: `tests/em-preparacao-relogio.test.ts` (novo)

**Interfaces:**
- Consome: `liberadoEmPreparacao` (Tarefa 2); `chegadaAoPatio`, `relogioAte`, `formatarRelogio`, `dataDaPrevisao` (Tarefa 3).
- Produz: `export default function RelogioDaChegada({ veiculo }: { veiculo: Pick<Veiculo, "em_preparacao" | "previsao_chegada_em"> })`

- [ ] **Passo 1: escrever o teste que falha**

`tests/em-preparacao-relogio.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import RelogioDaChegada from "../src/components/RelogioDaChegada";
import { lerCodigo } from "./fonte";

/**
 * O relógio da ficha — decisão do dono em 28/09: "card em dias, ficha em
 * relógio".
 *
 * O HTML servido traz só a DATA. Os números aparecem depois de montar: o
 * servidor e o navegador discordariam no segundo, e a hidratação reclamaria.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EM_PREPARACAO = { em_preparacao: true, previsao_chegada_em: "2026-10-03T17:00:00Z" };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T13:00:00Z")); // seg 28/09, 10h em SP
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const texto = () => (container.textContent ?? "").replace(/\s+/g, " ");

describe("no servidor", () => {
  it("a data, sem números de relógio", () => {
    const html = renderToString(createElement(RelogioDaChegada, { veiculo: EM_PREPARACAO }));
    expect(html).toContain("03/10 às 14h");
    expect(html).not.toMatch(/\d{2}d \d{2}h/);
  });
});

describe("no navegador", () => {
  it("monta e começa a contar", async () => {
    act(() => root.render(createElement(RelogioDaChegada, { veiculo: EM_PREPARACAO })));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(texto()).toContain("05d 04h 00m 00s");
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(texto()).toContain("05d 03h 59m 59s");
    expect(texto()).toContain("03/10 às 14h");
  });

  it("data vencida: sem relógio, e sem prometer dia", async () => {
    act(() =>
      root.render(
        createElement(RelogioDaChegada, {
          veiculo: { em_preparacao: true, previsao_chegada_em: "2026-09-25T17:00:00Z" },
        }),
      ),
    );
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(texto()).toContain("CHEGA A QUALQUER MOMENTO");
    expect(texto()).not.toMatch(/\d{2}d \d{2}h/);
  });

  it("carro comum: nada", () => {
    act(() => root.render(createElement(RelogioDaChegada, { veiculo: { em_preparacao: false } })));
    expect(container.innerHTML).toBe("");
  });

  it("o relógio não fala a cada segundo para o leitor de tela", async () => {
    act(() => root.render(createElement(RelogioDaChegada, { veiculo: EM_PREPARACAO })));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    const relogio = container.querySelector('[role="timer"]');
    expect(relogio).not.toBeNull();
    expect(relogio!.getAttribute("aria-live")).not.toBe("polite");
    expect(relogio!.getAttribute("aria-live")).not.toBe("assertive");
  });
});

describe("a ficha usa o relógio", () => {
  it("antes do preço, nas duas colunas (celular e desktop)", () => {
    // A ficha inteira não monta em teste (1.584 linhas, galeria, fetch); a
    // fiação é conferida na fonte e o comportamento, no componente acima.
    const fonte = lerCodigo("src/components/PDPClientWrapper.tsx");
    expect(fonte).toMatch(/<RelogioDaChegada veiculo=\{veiculo\} \/>\s*\{\/\* Preço \*\/\}/);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/em-preparacao-relogio.test.ts`
Esperado: FALHA — o componente não existe.

- [ ] **Passo 3: implementar**

`src/components/RelogioDaChegada.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Veiculo } from "../types";
import { liberadoEmPreparacao } from "../lib/coerenciaDoCadastro";
import { chegadaAoPatio, dataDaPrevisao, formatarRelogio, relogioAte } from "../lib/emPreparacao";

/**
 * O relógio até o pátio, na ficha do carro "em preparação".
 *
 * Decisão do dono em 28/09/2026: o card conta em dias, a ficha em relógio —
 * a expectativa onde a pessoa já está interessada.
 *
 * O HTML servido traz só a DATA, e os números aparecem depois de montar: o
 * servidor e o navegador discordariam no segundo, e a hidratação reclamaria.
 * O "agora" é lido dentro do temporizador — nunca no corpo do componente
 * (`react-hooks/purity`).
 *
 * `role="timer"` não anuncia sozinho (o `aria-live` implícito é "off"): um
 * leitor de tela falando a cada segundo seria ruído. Quem usa leitor ouve a
 * data, que está em texto.
 */
export default function RelogioDaChegada({
  veiculo,
}: {
  veiculo: Pick<Veiculo, "em_preparacao" | "previsao_chegada_em">;
}) {
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    const bater = () => setAgora(Date.now());
    const primeira = setTimeout(bater, 0);
    const intervalo = setInterval(bater, 1000);
    return () => {
      clearTimeout(primeira);
      clearInterval(intervalo);
    };
  }, []);

  if (!liberadoEmPreparacao(veiculo)) return null;
  const previsao = veiculo.previsao_chegada_em as string;
  // Milissegundos, não `new Date(...)`: nenhum `Date` é construído no corpo do
  // componente (`react-hooks/purity`); as funções de `lib/emPreparacao` aceitam
  // o número.
  const chegada = agora === null ? null : chegadaAoPatio(veiculo, agora);
  const relogio =
    agora !== null && chegada?.fase === "a-caminho" ? relogioAte(chegada.data, agora) : null;

  return (
    <div className="border-l-[3px] border-mt-accent pl-4">
      <div className="text-[10px] font-semibold tracking-[.16em] text-mt-accent">
        EM PREPARAÇÃO
      </div>
      {chegada?.fase === "a-qualquer-momento" ? (
        <div className="mt-1.5 text-[20px] font-extrabold tracking-[-.02em]">
          CHEGA A QUALQUER MOMENTO
        </div>
      ) : (
        <>
          <div className="mt-1.5 text-[11px] font-semibold tracking-[.12em] text-mt-neutral-600">
            CHEGA AO PÁTIO EM
          </div>
          {relogio && (
            <div
              role="timer"
              className="mt-1 text-[28px] font-extrabold tabular-nums tracking-[-.02em]"
            >
              {formatarRelogio(relogio)}
            </div>
          )}
        </>
      )}
      <div className="mt-1.5 text-[12px] text-mt-neutral-700">
        Previsão de chegada ao pátio: {dataDaPrevisao(previsao)}
      </div>
    </div>
  );
}
```

Em `PDPClientWrapper.tsx`, importar `RelogioDaChegada from "./RelogioDaChegada"` e, dentro de `renderSidebar`, imediatamente antes de `{/* Preço */}`:

```tsx
        {/* Carro em preparação: a contagem até o pátio, antes do preço —
            decisão do dono em 28/09. O preço e o resto da ficha seguem iguais. */}
        <RelogioDaChegada veiculo={veiculo} />
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run tests/em-preparacao-relogio.test.ts`
Esperado: PASSA.

- [ ] **Passo 5: conferir que a trava reprova**

1. No componente, troque `useState<number | null>(null)` por `useState<number | null>(Date.now())` (o defeito que desalinha a hidratação). Esperado: reprova "no servidor: a data, sem números de relógio". Restaure.
2. Troque `const primeira = setTimeout(bater, 0);` por nada, e `setInterval(bater, 1000)` por `setInterval(bater, 60000)`. Esperado: reprova "monta e começa a contar". Restaure.

- [ ] **Passo 6: lint e commit**

```bash
npx eslint src/components/RelogioDaChegada.tsx src/components/PDPClientWrapper.tsx tests/em-preparacao-relogio.test.ts
git add src/components/RelogioDaChegada.tsx src/components/PDPClientWrapper.tsx tests/em-preparacao-relogio.test.ts
git commit -F <arquivo-com-a-mensagem>
```

Mensagem: `feat(ficha): relógio até o pátio no carro em preparação`.

---

### Tarefa 6: O painel — caixa, data e checklist no editor

**Arquivos:**
- Modificar: `src/components/admin/EditorDeVeiculo.tsx` — `interface VeiculoDb` (~96), `NOME_DO_CAMPO` (~153), checklist (~283-295), `bloqueios` (~369-377), `salvar` (~465-507), a aba `preco` (depois do grid "Tag de destaque / Disponibilidade", ~1175-1200), a aba de fotos (~681-683)
- Teste: `tests/em-preparacao-editor.test.ts` (novo)

**Interfaces:**
- Consome: `MINIMO_DE_FOTOS_EM_PREPARACAO`, `liberadoEmPreparacao` (Tarefa 2); `paraCampoDataHora`, `doCampoDataHora` (Tarefa 3).
- Produz: PATCH `/api/estoque/{id}` com `em_preparacao: boolean` e `previsao_chegada_em: string | null` quando a coluna existe.

- [ ] **Passo 1: escrever o teste que falha**

`tests/em-preparacao-editor.test.ts` — o molde é `tests/descritivo-painel.test.ts` (dublê de `fetch` que guarda o corpo do PATCH; monta o editor com `perfil`):

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import EditorDeVeiculo from "../src/components/admin/EditorDeVeiculo";

/**
 * A caixa "em preparação" no editor do veículo — spec
 * 2026-09-28-em-preparacao-design, seção "Painel".
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let chamadas: { url: string; metodo: string; corpo?: Record<string, unknown> }[] = [];

function dublarFetch() {
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    chamadas.push({
      url: String(url),
      metodo: opcoes?.method ?? "GET",
      corpo: opcoes?.body ? JSON.parse(String(opcoes.body)) : undefined,
    });
    return { ok: true, status: 200, json: async () => ({ mudancasRegistradas: 1 }) };
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root;
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  chamadas = [];
  dublarFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = fetchOriginal;
});

const COM_COLUNA = {
  id: 8497421,
  marca: "fiat",
  modelo: "argo",
  versao: "drive 1.0",
  preco: 79900,
  estado_cadastro: "rascunho",
  origem: "sync",
  whatsapp_images: ["https://cdn.exemplo/f.jpg"],
  em_preparacao: false,
  previsao_chegada_em: null,
};

async function abrir(inicial: Record<string, unknown>, perfil: string[] = ["comercial"]) {
  await act(async () => {
    root.render(
      createElement(EditorDeVeiculo as never, { inicial: inicial as never, visitas30Dias: null, perfil: perfil as never }),
    );
  });
  const aba = Array.from(container.querySelectorAll("button")).find((b) =>
    /preço e (margem|destaque)/i.test(b.textContent ?? ""),
  );
  await act(async () => aba!.click());
}

const caixa = () =>
  Array.from(container.querySelectorAll("label")).find((l) => /em preparação/i.test(l.textContent ?? ""))
    ?.querySelector('input[type="checkbox"]') as HTMLInputElement | undefined;

const campoDaData = () => container.querySelector("#f-previsao") as HTMLInputElement | null;

async function digitar(campo: HTMLInputElement, valor: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(campo, valor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function salvar() {
  const botao = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === "Salvar");
  await act(async () => botao!.click());
}

const patches = () => chamadas.filter((c) => c.metodo === "PATCH");

describe("a caixa no editor", () => {
  it("marcar pede a data, e salvar manda os dois campos", async () => {
    await abrir(COM_COLUNA);
    await act(async () => caixa()!.click());
    expect(campoDaData()).not.toBeNull();
    await digitar(campoDaData()!, "2026-10-03T14:00");
    await salvar();
    expect(patches()).toHaveLength(1);
    expect(patches()[0].corpo).toMatchObject({
      em_preparacao: true,
      previsao_chegada_em: "2026-10-03T17:00:00.000Z",
    });
  });

  it("marcada sem data não salva, e diz por quê", async () => {
    await abrir(COM_COLUNA);
    await act(async () => caixa()!.click());
    await salvar();
    expect(patches()).toHaveLength(0);
    expect(container.textContent).toContain("Em preparação precisa da previsão de chegada ao pátio.");
  });

  it("coluna ausente (migração por aplicar): sem caixa, e o salvamento não manda os campos", async () => {
    const { em_preparacao: _e, previsao_chegada_em: _p, ...semColuna } = COM_COLUNA;
    await abrir({ ...semColuna, status_tag: "" });
    expect(caixa()).toBeUndefined();
    const tag = container.querySelector("#f-tag") as HTMLInputElement;
    await digitar(tag, "ÚNICO DONO");
    await salvar();
    expect(patches()[0].corpo).not.toHaveProperty("em_preparacao");
    expect(patches()[0].corpo).not.toHaveProperty("previsao_chegada_em");
  });

  it("quem não tem a linha da matriz não vê a caixa", async () => {
    await abrir(COM_COLUNA, ["financeiro"]);
    expect(caixa()).toBeUndefined();
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/em-preparacao-editor.test.ts`
Esperado: FALHA — a caixa não existe.

- [ ] **Passo 3: implementar**

Em `EditorDeVeiculo.tsx`:

(a) Imports: acrescentar `MINIMO_DE_FOTOS_EM_PREPARACAO` e `liberadoEmPreparacao` ao import de `../../lib/coerenciaDoCadastro`, e `import { doCampoDataHora, paraCampoDataHora } from "../../lib/emPreparacao";`.

(b) Em `interface VeiculoDb`, depois de `status_tag_color: string | null;`:

```ts
  /**
   * Migração 20260928150000. Opcionais porque a coluna pode não existir ainda:
   * `select("*")` simplesmente não as traz, e o editor esconde a caixa em vez
   * de mandar ao banco um campo que derrubaria o salvamento inteiro.
   */
  em_preparacao?: boolean | null;
  previsao_chegada_em?: string | null;
```

(c) Em `NOME_DO_CAMPO`, depois de `status_tag_color: "Cor da tag",`:

```ts
  em_preparacao: "Em preparação",
  previsao_chegada_em: "Previsão de chegada ao pátio",
```

(d) Logo depois de `const podeGravar = …` (~214):

```ts
  // A coluna existe? Ver o comentário de `em_preparacao` em `VeiculoDb`.
  const temColunaDoEmPreparacao = "em_preparacao" in inicial;
```

(e) Antes de `const checklist = [` (~283):

```ts
  // A porta de fotos que vale PARA ESTE carro — a mesma conta de
  // `bloqueiosDePublicacao`, para a tela não discordar do site.
  const minimoDeFotos = liberadoEmPreparacao(v) ? MINIMO_DE_FOTOS_EM_PREPARACAO : MINIMO_DE_FOTOS;
```

e, no primeiro item do checklist, trocar as três linhas que usam `MINIMO_DE_FOTOS` por:

```ts
      l:
        minimoDeFotos === MINIMO_DE_FOTOS
          ? `${MINIMO_DE_FOTOS} fotos — libera a publicação`
          : `${MINIMO_DE_FOTOS_EM_PREPARACAO} foto — em preparação, libera a publicação`,
      d: "Frente, traseira, uma lateral e o interior já contam a história.",
      ok: fotos.length >= minimoDeFotos,
      estado: fotos.length >= minimoDeFotos ? "OK" : `FALTAM ${minimoDeFotos - fotos.length}`,
```

(f) No `useMemo` de `bloqueios` (~369), passar os dois campos e acrescentá-los às dependências:

```ts
      bloqueiosDePublicacao({
        whatsapp_images: v.whatsapp_images,
        em_preparacao: v.em_preparacao,
        previsao_chegada_em: v.previsao_chegada_em,
      }).filter((b) => b.bloqueia),
    [v.whatsapp_images, v.em_preparacao, v.previsao_chegada_em],
```

(g) Na aba de fotos (~681-683), trocar `MINIMO_DE_FOTOS` por `minimoDeFotos` nas duas ocorrências do trecho `fotos.length >= MINIMO_DE_FOTOS … mínimo de ${MINIMO_DE_FOTOS} para publicar`.

(h) Em `salvar`, logo depois de `setAviso("");`:

```ts
    // O banco também recusa (CHECK), mas com uma frase que ninguém entende.
    if (v.em_preparacao && !v.previsao_chegada_em) {
      setErro("Em preparação precisa da previsão de chegada ao pátio.");
      setSalvando(false);
      return;
    }
```

e, dentro de `tudo`, depois de `perfis_uso: v.perfis_uso,`:

```ts
        // Só quando a coluna existe (migração 20260928150000). Mandar os dois a
        // um banco sem eles derrubaria o update inteiro — e com ele todo
        // salvamento do editor, não só o desta caixa.
        ...(temColunaDoEmPreparacao
          ? {
              em_preparacao: Boolean(v.em_preparacao),
              previsao_chegada_em: v.previsao_chegada_em ?? null,
            }
          : {}),
```

(i) Na aba `preco`, logo depois do `</div>` que fecha o grid de "Tag de destaque" e "Disponibilidade":

```tsx
              {temColunaDoEmPreparacao && podeGravar("em_preparacao") && (
                <div className="mt-6 border-t-2 border-mt-regua pt-4">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={Boolean(v.em_preparacao)}
                      onChange={(e) => set("em_preparacao", e.target.checked)}
                      className="mt-foco mt-0.5 h-4 w-4 cursor-pointer accent-[var(--mt-accent)]"
                    />
                    <span>
                      <span className="block text-[13px] font-extrabold">Em preparação</span>
                      <span className="block text-[11px] leading-relaxed text-mt-neutral-700">
                        O carro chegou e ainda não está pronto. Publica com{" "}
                        {MINIMO_DE_FOTOS_EM_PREPARACAO} foto (a de cadastro), mostra no site a
                        contagem até a data e fica fora do feed de anúncios até ter{" "}
                        {MINIMO_DE_FOTOS}. Desmarque quando o carro ficar pronto.
                      </span>
                    </span>
                  </label>
                  {v.em_preparacao && (
                    <div className="mt-3 flex flex-col gap-1.5 sm:max-w-[260px]">
                      <label className={rotuloCampo} htmlFor="f-previsao">
                        Previsão de chegada ao pátio
                      </label>
                      <input
                        id="f-previsao"
                        type="datetime-local"
                        required
                        value={paraCampoDataHora(v.previsao_chegada_em)}
                        onChange={(e) => set("previsao_chegada_em", doCampoDataHora(e.target.value))}
                        className={campoCaixa}
                      />
                    </div>
                  )}
                </div>
              )}
```

- [ ] **Passo 4: rodar e ver passar, com as travas do editor**

Rodar: `npx vitest run tests/em-preparacao-editor.test.ts tests/descritivo-painel.test.ts tests/fotos-do-veiculo.test.ts tests/preco-do-nativo.test.ts tests/rascunho-e-publicacao.test.ts`
Esperado: PASSA.

- [ ] **Passo 5: conferir que a trava reprova**

1. Apague o `...(temColunaDoEmPreparacao ? … : {})` do `tudo`. Esperado: reprova "marcar pede a data, e salvar manda os dois campos". Restaure.
2. Troque `temColunaDoEmPreparacao ?` por `true ?`. Esperado: reprova "coluna ausente…". Restaure.
3. Apague o bloco de validação no começo de `salvar`. Esperado: reprova "marcada sem data não salva". Restaure.

- [ ] **Passo 6: lint e commit**

```bash
npx eslint src/components/admin/EditorDeVeiculo.tsx tests/em-preparacao-editor.test.ts
git add src/components/admin/EditorDeVeiculo.tsx tests/em-preparacao-editor.test.ts
git commit -F <arquivo-com-a-mensagem>
```

Mensagem: `feat(painel): caixa "em preparação" com a previsão de chegada no editor do veículo`.

---

### Tarefa 7: A tabela do estoque — selo e previsão vencida

**Arquivos:**
- Modificar: `src/lib/estoqueTabela.ts` (`LinhaDeEstoque`, depois de `naTv: boolean;`), `src/app/admin/estoque/page.tsx` (no `map` das linhas, depois de `naTv: naTv.includes(id),`), `src/components/admin/TabelaDeEstoque.tsx` (linha de metadados, depois de `{l.naTv && …}`, ~1066)
- Teste: `tests/em-preparacao-tabela.test.ts` (novo)

**Interfaces:**
- Consome: `diasDePrevisaoVencida` (Tarefa 3).
- Produz: `LinhaDeEstoque.emPreparacao?: boolean`, `LinhaDeEstoque.previsaoVencidaHaDias?: number | null`.

- [ ] **Passo 1: escrever o teste que falha**

`tests/em-preparacao-tabela.test.ts` — o molde é `tests/painel-de-filtros-fiacao.test.ts` (monta `TabelaDeEstoque` com `linha()` e `props()`; copie os dois ajudantes de lá):

```ts
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import TabelaDeEstoque from "../src/components/admin/TabelaDeEstoque";
import type { LinhaDeEstoque } from "../src/lib/estoqueTabela";

/**
 * O carro em preparação na tabela de /admin/estoque — spec
 * 2026-09-28-em-preparacao-design, seção "Painel". A previsão vencida é AVISO,
 * não estado: o carro segue "Publicado" (decisão do dono, 28/09).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Uma linha plausível — o mesmo elenco de `painel-de-filtros-fiacao.test.ts`. */
const linha = (id: string, over: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque =>
  ({
    id,
    marca: "Fiat",
    modelo: "Argo",
    versao: "",
    placa: "",
    tipo: "Hatch",
    ano: 2025,
    quilometragem: 9000,
    preco: 79900,
    estado: "publicado",
    estadoCadastro: "publicado",
    vendido: false,
    fotos: 1,
    leads: 0,
    visitas: 0,
    diasEmEstoque: 2,
    diasForaDoFeed: null,
    destacado: false,
    naSemana: false,
    naTv: false,
    bloqueios: [],
    quickTags: [],
    perfisUso: [],
    divergente: false,
    foto: "",
    ...over,
  }) as unknown as LinhaDeEstoque;

const props = (linhas: LinhaDeEstoque[]): Parameters<typeof TabelaDeEstoque>[0] =>
  ({
    linhas,
    quickTagsDisponiveis: [],
    destacadosIniciais: [],
    naSemanaIniciais: [],
    naTvIniciais: [],
    overridesIniciais: {},
    visitasDisponiveis: true,
    podeCriar: true,
    podePublicar: true,
    migracaoDoEstadoPendente: false,
  }) as unknown as Parameters<typeof TabelaDeEstoque>[0];

let container: HTMLDivElement;
let root: Root;

async function montar(linhas: LinhaDeEstoque[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(TabelaDeEstoque, props(linhas)));
  });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const textoDaLinha = (id: string) =>
  ([...container.querySelectorAll("tbody tr")].find((tr) => (tr.textContent ?? "").includes(id))?.textContent ?? "")
    .replace(/\s+/g, " ");

describe("o carro em preparação na tabela", () => {
  it("leva o selo, e continua Publicado", async () => {
    await montar([linha("8497421", { emPreparacao: true, previsaoVencidaHaDias: null })]);
    const texto = textoDaLinha("8497421");
    expect(texto).toContain("em preparação");
    expect(texto).not.toContain("previsão vencida");
    expect(texto).toMatch(/Publicado/i);
  });

  it("previsão vencida há 2 dias: o aviso, no plural", async () => {
    await montar([linha("8497421", { emPreparacao: true, previsaoVencidaHaDias: 2 })]);
    expect(textoDaLinha("8497421")).toContain("previsão vencida há 2 dias");
  });

  it("vencida hoje e há 1 dia", async () => {
    await montar([
      linha("1", { emPreparacao: true, previsaoVencidaHaDias: 0 }),
      linha("2", { emPreparacao: true, previsaoVencidaHaDias: 1 }),
    ]);
    expect(textoDaLinha("1")).toContain("previsão vencida hoje");
    expect(textoDaLinha("2")).toContain("previsão vencida há 1 dia");
  });

  it("carro comum: nem selo nem aviso", async () => {
    await montar([linha("8335204")]);
    const texto = textoDaLinha("8335204");
    expect(texto).not.toContain("em preparação");
    expect(texto).not.toContain("previsão vencida");
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run tests/em-preparacao-tabela.test.ts`
Esperado: FALHA — o selo não aparece.

- [ ] **Passo 3: implementar**

Em `estoqueTabela.ts`, em `LinhaDeEstoque`, depois de `naTv: boolean;`:

```ts
  /**
   * Caixa "em preparação" marcada (migração 20260928150000). Opcional porque a
   * curadoria de destaques monta a mesma linha e não precisa dele.
   */
  emPreparacao?: boolean;
  /**
   * Há quantos dias a previsão de chegada ao pátio passou; `null` quando não
   * passou. AVISO, nunca etiqueta — como `diasForaDoFeed`: o carro segue no
   * ar, por decisão do dono em 28/09/2026.
   */
  previsaoVencidaHaDias?: number | null;
```

Em `src/app/admin/estoque/page.tsx`, importar `diasDePrevisaoVencida` de `../../../lib/emPreparacao` e, no objeto de cada linha, depois de `naTv: naTv.includes(id),`:

```ts
      // Em preparação (migração 20260928150000). A conta sai do servidor, e não
      // da tabela: a tabela é client component, e "há 2 dias" calculado dos
      // dois lados da hidratação discordaria na virada do dia.
      emPreparacao: bruto.em_preparacao === true,
      previsaoVencidaHaDias: diasDePrevisaoVencida(bruto),
```

Em `TabelaDeEstoque.tsx`, na linha de metadados do veículo, depois de `{l.naTv && <span className="text-mt-accent">· na TV</span>}`:

```tsx
                          {l.emPreparacao && <span className="text-mt-accent">· em preparação</span>}
                          {typeof l.previsaoVencidaHaDias === "number" && (
                            <span className="font-semibold text-mt-accent-800">
                              · previsão vencida{" "}
                              {l.previsaoVencidaHaDias === 0
                                ? "hoje"
                                : `há ${l.previsaoVencidaHaDias} ${l.previsaoVencidaHaDias === 1 ? "dia" : "dias"}`}
                            </span>
                          )}
```

- [ ] **Passo 4: rodar e ver passar, com as travas da tabela**

Rodar: `npx vitest run tests/em-preparacao-tabela.test.ts tests/painel-de-filtros-fiacao.test.ts tests/estoque-tabela.test.ts tests/painel-de-filtros.test.ts tests/curadoria-de-destaques.test.ts`
Esperado: PASSA.

- [ ] **Passo 5: conferir que a trava reprova**

Troque `l.previsaoVencidaHaDias === 1 ? "dia" : "dias"` por `"dias"`. Esperado: reprova "vencida hoje e há 1 dia". Restaure.

- [ ] **Passo 6: lint e commit**

```bash
npx eslint src/lib/estoqueTabela.ts src/app/admin/estoque/page.tsx src/components/admin/TabelaDeEstoque.tsx tests/em-preparacao-tabela.test.ts
git add src/lib/estoqueTabela.ts src/app/admin/estoque/page.tsx src/components/admin/TabelaDeEstoque.tsx tests/em-preparacao-tabela.test.ts
git commit -F <arquivo-com-a-mensagem>
```

Mensagem: `feat(painel): selo "em preparação" e previsão vencida na tabela do estoque`.

---

### Tarefa 8: Portão final — suíte, tipos, ensaio e prévia

**Arquivos:** nenhum novo.

- [ ] **Passo 1: suíte inteira e tipos**

Rodar: `npx vitest run` e `npx tsc --noEmit`
Esperado: tudo verde; `tsc` sai com 0.

- [ ] **Passo 2: ensaio da migração (sem gravar)**

Pedir ao dono a ordem para ENSAIAR (a proteção de permissões já barrou ensaio antes sem ordem explícita). Com a ordem:

Rodar: `node supabase/manutencao/aplicar-migracao.js supabase/migrations/20260928150000_em_preparacao.sql`
Esperado: a notice `Em preparação OK: duas colunas, default false, CHECK da data no lugar.` e o ROLLBACK no fim.

- [ ] **Passo 3: prévia da Vercel**

Push da branch; achar a prévia com `list_deployments` pelo `sha`; abrir com `get_access_to_vercel_url` no navegador embutido. Conferir, nas páginas públicas: nenhum carro muda (nenhum está em preparação antes da migração gravada) e nenhum erro de console novo em `/estoque` e numa ficha. O painel exige login do dono — a caixa no editor e o selo na tabela ele confere.

- [ ] **Passo 4: PR — sem merge antes da migração gravada**

Abrir o PR pelo Chrome do dono, com o CI verde no head. No corpo: o que muda, a ordem obrigatória (**gravar a migração em produção antes do merge**, com a razão: `CAMPOS_NOSSOS` entra no `select` de toda gravação do painel), e o roteiro para o dono conferir no painel.

---

## Autorrevisão (feita)

- **Cobertura da spec:**

  | Seção da spec | Tarefa |
  |---|---|
  | Modelo de dados | 1 |
  | Régua | 2 |
  | Feed | 2 |
  | Painel: editor | 6 |
  | Painel: tabela | 7 |
  | Painel: permissão | 1 |
  | Site: função pura | 3 |
  | Site: card, TV e balcão | 4 |
  | Site: ficha | 5 |
  | Testes | em cada tarefa |
  | Processo da migração | 8 |

  Desvios registrados na própria spec:
  - `CadastroDeVeiculo` sem mudança;
  - o HTML da ficha traz a data, e não os dias;
  - o feed exclui só o carro com a caixa marcada.
- **Nada de placeholder:** todo passo de código traz o código. A única decisão deixada ao executor é o menor conjunto de props de `VitrineTV` e `VitrineBalcao` no teste da Tarefa 4, com a instrução do que fazer.
- **Tipos:** estes nomes batem entre as tarefas que os produzem e as que os consomem:
  - `liberadoEmPreparacao`, `MINIMO_DE_FOTOS_EM_PREPARACAO` e `entraNoFeedDeAnuncios` (Tarefa 2);
  - `chegadaAoPatio`, `faixaDaChegada`, `relogioAte`, `formatarRelogio`, `dataDaPrevisao`, `diasDePrevisaoVencida`, `paraCampoDataHora` e `doCampoDataHora` (Tarefa 3);
  - `emPreparacao` e `previsaoVencidaHaDias` (Tarefa 7).
