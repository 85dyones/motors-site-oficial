-- ---------------------------------------------------------------------------
-- Pacote 4 — a série de conformidade passa a andar sozinha.
--
-- Até aqui `calcular_conformidade_diaria()` só avançava por clique no painel,
-- e a série do §1.4 tinha **zero dias**: o relógio que abre o gatilho de
-- recompra nunca começou a contar. Série que depende de alguém lembrar não é
-- série.
--
-- ---------------------------------------------------------------------------
-- Por que pg_cron e não o n8n
-- ---------------------------------------------------------------------------
-- Este trabalho nunca sai do banco: é uma função SQL que lê tabelas do banco e
-- grava numa tabela do banco. Passá-lo pelo n8n significaria n8n → HTTP → rota
-- da Vercel → Supabase, três saltos e dois segredos para o banco fazer uma
-- coisa consigo mesmo — e cada elo é um modo de falha novo. Em 2026-08-18 um
-- desses elos (deploy atrasado) custou uma tarde de depuração num 401.
--
-- Soma-se que a cópia versionada de workflow do n8n já divergiu do que roda ao
-- vivo duas vezes neste projeto (ver `supabase/README.md`). Agendamento em
-- `pg_cron` mora numa migração: versionado, revisado e ensaiável como o resto.
--
-- O que continua no n8n é o que precisa SAIR do banco — entrega de mensagem.
-- É a mesma divisão que o motor de gatilhos já usa: o banco decide, o n8n
-- entrega.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- O ponto de entrada do cron
-- ---------------------------------------------------------------------------
-- Duas coisas que o `pg_cron` não traz de graça, e que ficam declaradas aqui
-- em vez de escondidas na string do agendamento:
--
-- 1. **Fuso.** O banco roda em UTC, então `current_date` dentro da função
--    seria a data UTC — e a série do §1.4 é um calendário de loja, em
--    Curitiba. `set timezone` no corpo da função resolve de uma vez: a data
--    que a série grava é sempre a data de Curitiba.
--
-- 2. **Contexto de confiança.** A guarda de `calcular_conformidade_diaria()`
--    libera staff (painel) ou chamador SEM claims de JWT — e o comentário dela
--    já previa "o cron futuro". Só que `pg_cron` chega com
--    `request.jwt.claims` **nulo**, e `null is distinct from ''` é verdadeiro:
--    medido em 2026-08-19, a função recusava o cron com "restrito à equipe".
--    Declarar a variável como string vazia é dizer, na língua que a guarda já
--    fala, "não há JWT aqui". A guarda em si não muda — `anon` segue barrado,
--    verificado abaixo.
--
-- ⚠️ Por isso esta função é um portão: quem a executa PULA a checagem de
-- staff. O `revoke` logo abaixo não é formalidade — sem ele, o EXECUTE que o
-- Postgres concede a PUBLIC por padrão deixaria qualquer sessão autenticada
-- (inclusive papel `cliente`) rodar o cálculo.

create or replace function public.rodar_conformidade_diaria()
  returns jsonb
  language plpgsql
  set search_path = public
  set timezone = 'America/Sao_Paulo'
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  return public.calcular_conformidade_diaria();
end;
$$;

comment on function public.rodar_conformidade_diaria() is
  'Ponto de entrada do pg_cron para a série do §1.4. Fixa o fuso de Curitiba e '
  'se apresenta como chamador sem JWT. É um portão que pula a checagem de '
  'staff: NUNCA conceder execute a authenticated ou anon.';

revoke all on function public.rodar_conformidade_diaria() from public, anon, authenticated;
grant execute on function public.rodar_conformidade_diaria() to service_role;

-- ---------------------------------------------------------------------------
-- O agendamento
-- ---------------------------------------------------------------------------
-- `30 2 * * *` em UTC = **23h30 em Curitiba**. A escolha não é estética: a
-- função grava do último dia registrado até `current_date`, e nunca reescreve
-- um dia já gravado. Rodando às 23h30, o dia que entra na série é um dia
-- **inteiro e terminado** — expediente da loja incluído. Rodar de manhã
-- congelaria o dia no estado em que ele amanheceu, para sempre.
--
-- `cron.schedule` com nome existente ATUALIZA o agendamento, então reaplicar
-- esta migração não duplica job.

select cron.schedule(
  'conformidade-diaria',
  '30 2 * * *',
  $cron$select public.rodar_conformidade_diaria();$cron$
);

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
do $$
declare
  v_job     record;
  v_pode    boolean;
begin
  -- 1. O job existe, está ativo e com o agendamento esperado.
  select * into v_job from cron.job where jobname = 'conformidade-diaria';
  if not found then
    raise exception 'ACEITE FALHOU: job conformidade-diaria não foi agendado';
  end if;
  if v_job.schedule <> '30 2 * * *' then
    raise exception 'ACEITE FALHOU: agendamento inesperado (%)', v_job.schedule;
  end if;
  if not v_job.active then
    raise exception 'ACEITE FALHOU: job agendado mas inativo';
  end if;

  -- 2. O portão NÃO está aberto para quem não é equipe. Esta é a linha que
  --    impede o pulo da checagem de staff virar escada.
  for v_pode in
    select has_function_privilege(r, 'public.rodar_conformidade_diaria()', 'execute')
      from unnest(array['anon', 'authenticated']) as r
  loop
    if v_pode then
      raise exception 'ACEITE FALHOU: anon ou authenticated pode executar o portão do cron';
    end if;
  end loop;

  -- 3. O caminho do cron funciona de verdade — com a base vazia, o esperado é
  --    "nenhum veiculo com Ciclo ativo", não uma exceção de privilégio.
  perform public.rodar_conformidade_diaria();

  raise notice 'Aceite verificado: job diário às 23h30 (Curitiba), portão fechado para anon e authenticated.';
end $$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260819120000', 'cron_da_conformidade')
  on conflict (version) do nothing;
