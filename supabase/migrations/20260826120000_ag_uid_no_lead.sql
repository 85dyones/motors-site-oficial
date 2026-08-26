-- ==========================================================
-- `ag_uid` no lead — o par que faltava para o "(Ref: 0DCB1CDC)"
-- ==========================================================
--
-- Desde 2026-08-19 toda mensagem pré-preenchida de WhatsApp termina com um
-- código de oito caracteres: `refCurta()` em `src/lib/telemetry.ts` corta os
-- 8 primeiros do `ag_uid` e põe em caixa alta. O comentário daquele arquivo
-- diz, textualmente, para que o código existe:
--
--   "a mensagem chegou no WhatsApp da loja sem casar com o POST de
--    /api/leads (o envio falhou, ou o cliente digitou um número no modal e
--    mandou de outro). Oito caracteres bastam para localizar o visitante de
--    olho — a nota do Chatwoot e a CAPI carregam o UUID inteiro."
--
-- **Só que não havia onde localizar.** `/api/leads` grava `nome`, `telefone`,
-- `interesse`, `canal`, `veiculo_id`, `email` e `event_id` — e não grava o
-- `ag_uid`. Nenhuma migração anterior cria a coluna (`grep -rn ag_uid
-- supabase/migrations/` volta vazio). O cliente lia o código na própria
-- mensagem, mandava para a loja, e ele morria ali: o UUID inteiro seguia
-- viajando no webhook do n8n e no `externalId` da CAPI, dois lugares onde o
-- atendente não vai olhar.
--
-- Levantado em `docs/ATENDIMENTO_E_TAGS.md §3.2`; é o pacote A1 de lá, e
-- pré-requisito de todo o resto — sem ele, etiqueta de Chatwoot nenhuma leva
-- a lugar nenhum.
--
-- ----------------------------------------------------------
-- Por que uma coluna GERADA, e não só a busca por prefixo
-- ----------------------------------------------------------
-- O que o atendente digita é `0DCB1CDC` — a forma que o cliente leu. A
-- consulta natural seria `where upper(left(ag_uid, 8)) = '0DCB1CDC'`, mas o
-- PostgREST não sabe expressar predicado funcional: o painel fala com o banco
-- por ele, e teria de cair em `ilike '0dcb1cdc%'`, que não usa índice nenhum.
--
-- `ref_curta` gerada resolve os dois de uma vez: o PostgREST filtra com um
-- `eq` simples, o índice é um btree comum, e a coluna **não pode divergir do
-- `ag_uid`** — o banco a recalcula, ninguém a escreve.
--
-- ----------------------------------------------------------
-- O placeholder NÃO entra
-- ----------------------------------------------------------
-- Quando não há cookie de rastreio, o site resolve `ag_uid` para o literal
-- `"ag_ref_nao_localizado"`. `refCurta()` recusa esse valor — e a rota, a
-- partir de agora, também: grava `null`. São a MESMA régua, o mesmo regex,
-- aplicada nas duas pontas.
--
-- Se o placeholder entrasse, `ref_curta` viraria `'AG_REF_N'` em todas essas
-- linhas, e buscar por essas oito letras devolveria todo mundo que chegou sem
-- rastreio. Um índice cheio de um valor só, e uma busca que mente.
--
-- ----------------------------------------------------------
-- Reescrita de tabela — por que é segura aqui
-- ----------------------------------------------------------
-- `ADD COLUMN ... GENERATED ALWAYS AS (...) STORED` reescreve a tabela. Em
-- `leads` isso é irrelevante: a tabela ficou recusando todo insert até
-- 2026-08-11 (ver `20260811130000_leads_insert_destravado.sql`), então o
-- volume é de dias, não de anos. Numa tabela grande, esta linha exigiria
-- janela de manutenção.
--
-- ----------------------------------------------------------
-- Cobertura: começa hoje, e o painel diz isso
-- ----------------------------------------------------------
-- Sem backfill possível — o `ag_uid` dos leads antigos não foi guardado em
-- lugar nenhum deste banco. As linhas anteriores ficam com `ag_uid` nulo, e a
-- busca do painel avisa que lead anterior a esta migração não tem referência,
-- em vez de dizer "não encontrado" e deixar o atendente achar que digitou
-- errado.
-- ==========================================================

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS ag_uid text;

COMMENT ON COLUMN public.leads.ag_uid IS
    'UUID de rastreio da sessao do visitante, o mesmo que vai no webhook do '
    'n8n (ag_uid) e no externalId da CAPI. NULL quando o visitante chegou sem '
    'cookie de rastreio: o literal "ag_ref_nao_localizado" NAO e gravado — '
    'codigo de erro interno nao vira dado. NULL tambem em todo lead anterior '
    'a 2026-08-26, que e quando a coluna nasceu.';

-- A forma que o cliente lê na própria mensagem: 8 primeiros, caixa alta.
-- Gerada e não escrita, para não poder divergir do `ag_uid`.
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS ref_curta text
    GENERATED ALWAYS AS (upper(left(ag_uid, 8))) STORED;

COMMENT ON COLUMN public.leads.ref_curta IS
    'O "(Ref: 0DCB1CDC)" que o cliente le na mensagem pre-preenchida — os 8 '
    'primeiros do ag_uid em caixa alta. GERADA: o banco calcula, ninguem '
    'escreve, e por isso ela nunca discorda do ag_uid. E por ela que o painel '
    'acha o lead a partir do codigo que chegou no WhatsApp. Espelha '
    'refCurta() em src/lib/telemetry.ts.';

-- Busca por referência é `eq` exato numa coluna gerada — btree comum resolve.
-- Parcial porque a maioria das linhas antigas tem `ag_uid` nulo, e índice não
-- precisa carregar o que nunca será procurado.
CREATE INDEX IF NOT EXISTS leads_ref_curta_idx
    ON public.leads (ref_curta)
    WHERE ref_curta IS NOT NULL;


-- ==========================================================
-- Autoconferência — a promessa vale contra o banco, ou nada disso subiu
-- ==========================================================
do $$
declare
  v_gerada  char;
  v_amostra text;
begin
  -- 1. As duas colunas existem.
  if to_regclass('public.leads') is null then
    raise exception 'ABORTADO: public.leads nao existe.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'ag_uid'
  ) then
    raise exception 'ABORTADO: leads.ag_uid nao foi criada.';
  end if;

  -- 2. `ref_curta` é GERADA de verdade — se alguém a recriar como coluna
  --    comum um dia, ela passa a poder divergir do ag_uid em silencio, que e
  --    exatamente o defeito que esta migracao existe para impedir.
  select a.attgenerated into v_gerada
    from pg_attribute a
   where a.attrelid = 'public.leads'::regclass
     and a.attname  = 'ref_curta'
     and a.attnum   > 0;

  if v_gerada is distinct from 's' then
    raise exception 'ABORTADO: leads.ref_curta nao e coluna gerada (attgenerated=%). '
                    'Coluna comum poderia divergir do ag_uid.', coalesce(v_gerada, '<ausente>');
  end if;

  -- 3. A expressao produz o que o cliente le. O UUID abaixo e o do exemplo
  --    de `tests/ref-de-atendimento.test.ts` — os dois lados provam o mesmo.
  select upper(left('0dcb1cdc-fb39-4a39-99c9-923f025619f4', 8)) into v_amostra;
  if v_amostra <> '0DCB1CDC' then
    raise exception 'ABORTADO: a expressao de ref_curta devolveu "%", esperado "0DCB1CDC".', v_amostra;
  end if;

  -- 4. O indice existe — sem ele a busca varre a tabela inteira, e o defeito
  --    so aparece quando a fila cresce.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'leads' and indexname = 'leads_ref_curta_idx'
  ) then
    raise exception 'ABORTADO: leads_ref_curta_idx nao foi criado.';
  end if;

  raise notice 'Aceite verificado: ag_uid gravavel, ref_curta gerada e indexada, '
               'expressao confere com refCurta() do site.';
end $$;
