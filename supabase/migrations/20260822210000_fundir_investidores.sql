-- ===========================================================================
-- Funde os dois módulos de investidor, e devolve o Gestor ao financeiro
-- ===========================================================================
-- 2026-08-22. Em 21 e 22 de agosto, dois trabalhos paralelos entregaram
-- controle de investidor sem saber um do outro:
--
--   * `20260821120000` + `20260821180000` — o CADASTRO (`investidores`) com
--     razão de aportes e retiradas (`movimentacoes_investidor`). O investidor
--     é uma ficha da loja; a conta de acesso é opcional e se liga pelo e-mail.
--   * `20260822120000_perfil_investidor` — a PARTICIPAÇÃO por veículo
--     (`investidor_veiculos`) com razão próprio (`investidor_movimentos`). Ali
--     o investidor É o usuário: a FK aponta direto para `profiles`.
--
-- As duas responderam perguntas que a outra não responde — *quanto* o sócio
-- tem no negócio, e *em quais carros* ele entrou — e por isso as duas ficam.
-- O que NÃO pode ficar são dois razões para o mesmo dinheiro: é literalmente
-- o controle "um pouco bagunçado" que o briefing pediu para acabar.
--
-- ---------------------------------------------------------------------------
-- Qual identidade vence, e por quê
-- ---------------------------------------------------------------------------
-- Vence `investidores`. Não por antiguidade: o pai do Igor pode aportar sem
-- nunca abrir o sistema, e amarrar a identidade dele a `profiles` obrigaria a
-- criar uma conta de acesso só para poder registrar o dinheiro — conta que
-- existe, pode ser convidada e logada. Ficha primeiro, login depois (ou
-- nunca) é o que descreve o negócio real.
--
-- `investidor_veiculos` passa a apontar para a ficha. A coluna antiga
-- (`investidor_id` → `profiles`) FICA: apagá-la quebraria qualquer leitura
-- ainda em produção, e o custo de mantê-la é uma coluna.
--
-- ---------------------------------------------------------------------------
-- Defensiva de propósito
-- ---------------------------------------------------------------------------
-- Esta migração NÃO pode assumir que `perfil_investidor` rodou. As duas
-- migrações nasceram com o mesmo número (`20260822120000`), e número
-- duplicado faz o `supabase db push` pular a segunda inteira, sem erro. Então
-- cada passo aqui pergunta se a tabela existe antes de tocá-la, e a migração
-- termina bem nos dois mundos.
--
-- E não apaga nada. Há dinheiro de sócio nessas linhas; consolidar é copiar
-- e apontar, nunca destruir o original. Se a fusão estiver errada, o que
-- sobrou é a prova de como era.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. O Gestor volta a EXISTIR, e volta a abrir o financeiro
-- ---------------------------------------------------------------------------
-- `perfil_investidor` reescreveu as duas réguas do papel sem `gestor`:
-- `papeis_validos()`, que é o CHECK de `profiles.papeis`, e
-- `has_finance_access()`. O número dela é posterior ao da migração que criou o
-- papel, então, aplicada em ordem, ela apaga o `gestor` do vocabulário.
--
-- O estrago do CHECK é o pior dos dois, e não é só "não dá para conceder":
-- quem JÁ é gestor em produção tem uma linha que o CHECK novo recusa, então
-- qualquer UPDATE nesse perfil passa a falhar — desativar a pessoa, trocar o
-- nome, corrigir o e-mail. A linha fica congelada e o erro não diz por quê.
--
-- Nada disso foi intencional: os dois trabalhos correram no mesmo dia e o
-- segundo reescreveu a lista inteira a partir do que conhecia. É o risco de
-- função que enumera vocabulário — quem reescreve precisa saber de todos, e
-- não há como o SQL avisar que faltou um.
-- São TRÊS réguas, e todas as três perderam o gestor. Repor duas e esquecer a
-- terceira deixaria o papel meio existindo — que é pior que não existir, porque
-- falha só em alguns caminhos.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'gestor', 'comercial', 'financeiro', 'marketing',
                  'cliente', 'investidor'));

create or replace function public.papeis_validos(p text[]) returns boolean
  language sql
  immutable
as $fn$
  select p is not null
     and array_length(p, 1) >= 1
     and p <@ array['admin', 'gestor', 'comercial', 'financeiro', 'marketing',
                    'cliente', 'investidor']
     and array_length(p, 1) = (select count(distinct x) from unnest(p) x);
$fn$;

comment on function public.papeis_validos(text[]) is
  'Vocabulário de `profiles.papeis` — os cinco de painel (admin, gestor, '
  'marketing, comercial, financeiro) mais os de área própria (cliente, '
  'investidor). Espelha PERFIS + PAPEIS_SEM_PAINEL de src/lib/permissoes.ts, '
  'e um teste trava os dois lados.';

-- `perfil_investidor` redefiniu `has_finance_access` sem `gestor`, e o número
-- dela é posterior ao da migração que criou o papel — então, aplicada em
-- ordem, ela desliga em silêncio o acesso que o dono pediu explicitamente:
-- *"gestor, que terá o poder de aprovar os agendamentos financeiro, ajustar
-- valores de negócios de carro, entrada e saída, bem como acesso aos
-- relatórios"*. Ninguém teria visto até o Gestor reclamar que o menu sumiu.
create or replace function public.has_finance_access(user_id uuid) returns boolean as $$
  select exists (
    select 1 from public.profiles
     where id = user_id
       and is_active = true
       and papeis && array['admin', 'gestor', 'financeiro']
  );
$$ language sql security definer set search_path = public;

comment on function public.has_finance_access(uuid) is
  'Quem abre o financeiro: admin, gestor ou financeiro, por `papeis` '
  '(multi-papel). O gestor foi reposto em 2026-08-22 — uma migração paralela '
  'o havia removido sem intenção.';

do $$
declare
  v_tem_veiculos boolean := to_regclass('public.investidor_veiculos')   is not null;
  v_tem_movs     boolean := to_regclass('public.investidor_movimentos') is not null;
  v_fichas int := 0;
  v_linhas int := 0;
begin
  -- -------------------------------------------------------------------------
  -- 2. Toda pessoa com dado de investidor ganha ficha em `investidores`
  -- -------------------------------------------------------------------------
  if v_tem_veiculos or v_tem_movs then
    insert into public.investidores (nome, email, perfil_id, observacoes)
    select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Investidor sem nome'),
           p.email,
           p.id,
           'Ficha criada na fusão de 2026-08-22, a partir do perfil de acesso.'
      from public.profiles p
     where p.papeis && array['investidor']
       and not exists (select 1 from public.investidores i where i.perfil_id = p.id)
       and (
         (v_tem_veiculos and exists (
            select 1 from public.investidor_veiculos v where v.investidor_id = p.id))
         or
         (v_tem_movs and exists (
            select 1 from public.investidor_movimentos m where m.investidor_id = p.id))
       );
    get diagnostics v_fichas = row_count;
  end if;

  -- -------------------------------------------------------------------------
  -- 3. A participação por veículo passa a apontar para a ficha
  -- -------------------------------------------------------------------------
  if v_tem_veiculos then
    alter table public.investidor_veiculos
      add column if not exists investidor_cadastro_id uuid references public.investidores(id);

    update public.investidor_veiculos v
       set investidor_cadastro_id = i.id
      from public.investidores i
     where i.perfil_id = v.investidor_id
       and v.investidor_cadastro_id is null;

    -- O índice único original é (investidor_id, veiculo_id) e continua valendo.
    -- Este é o gêmeo pela ficha: sem ele, duas contas ligadas à mesma ficha
    -- poderiam registrar participação dobrada no mesmo carro, e a soma por
    -- carro mentiria — que é exatamente o que a constraint deles evita.
    create unique index if not exists idx_investidor_veiculos_ficha
      on public.investidor_veiculos (investidor_cadastro_id, veiculo_id)
      where investidor_cadastro_id is not null;
  end if;

  -- -------------------------------------------------------------------------
  -- 4. O razão vira um só
  -- -------------------------------------------------------------------------
  -- `veiculo_id` muda de tipo: bigint (`estoque_motors.id`) para text (código
  -- RevendaMais), que é o que `movimentacoes_investidor` usa em todo o resto
  -- do módulo. `::text` do bigint preserva o número; quem lê sabe qual carro.
  if v_tem_movs then
    insert into public.movimentacoes_investidor
           (investidor_id, tipo, valor, descricao, data, veiculo_id, observacoes, created_by)
    select i.id,
           m.tipo,
           m.valor,
           coalesce(nullif(btrim(m.descricao), ''), 'Movimentação importada da fusão'),
           m.data,
           m.veiculo_id::text,
           format('Importada de investidor_movimentos (%s) na fusão de 2026-08-22.', m.id),
           m.created_by
      from public.investidor_movimentos m
      join public.investidores i on i.perfil_id = m.investidor_id
     where not exists (
             select 1 from public.movimentacoes_investidor x
              where x.observacoes like '%' || m.id::text || '%'
           );
    get diagnostics v_linhas = row_count;
  end if;

  -- -------------------------------------------------------------------------
  -- 5. `investidor_posicao` passa a somar do razão ÚNICO
  -- -------------------------------------------------------------------------
  -- A view era a fonte dos números da tela `/investidor` e somava
  -- `investidor_movimentos`. Depois da fusão esse não é mais o razão — deixá-la
  -- como estava faria a tela mostrar um saldo e o painel do financeiro outro,
  -- pela mesma pessoa, no mesmo dia. Duas verdades sobre o dinheiro do sócio é
  -- o pior resultado possível desta fusão.
  --
  -- Ela continua chaveada por `profiles.id`, e não pela ficha: é o que a tela
  -- já consulta (`auth.uid()`), e mudar a chave obrigaria a reescrever a tela
  -- para ganhar nada. Investidor sem conta não aparece aqui, e está certo —
  -- quem não tem login não abre a tela.
  --
  -- `security_invoker` é o ponto inteiro da view e continua ligado: sem ele
  -- ela roda com os privilégios do dono e vira caminho para contornar a RLS,
  -- com qualquer investidor lendo a posição de todos.
  if to_regclass('public.investidor_posicao') is not null then
    drop view public.investidor_posicao;
  end if;

  execute $v$
    create view public.investidor_posicao
      with (security_invoker = true)
    as
    select
      i.perfil_id as investidor_id,
      coalesce(sum(m.valor) filter (where m.tipo = 'aporte'),   0)::numeric(12,2) as aporte_total,
      coalesce(sum(m.valor) filter (where m.tipo = 'retirada'), 0)::numeric(12,2) as retirado_total,
      ( coalesce(sum(m.valor) filter (where m.tipo = 'aporte'),   0)
      - coalesce(sum(m.valor) filter (where m.tipo = 'retirada'), 0)
      )::numeric(12,2) as saldo_investido
    from public.investidores i
    join public.movimentacoes_investidor m on m.investidor_id = i.id
    where i.perfil_id is not null
    group by i.perfil_id
  $v$;

  comment on view public.investidor_posicao is
    'Aporte total, retirado e saldo por investidor, somados do razão único '
    '(`movimentacoes_investidor`) desde a fusão de 2026-08-22. '
    'security_invoker: cada um agrega só o que a RLS já lhe deixava ler.';

  raise notice 'Fusão: % ficha(s) criada(s), % movimentação(ões) trazida(s) para o razão único.',
    v_fichas, v_linhas;
end $$;

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
-- Prova contra o banco real:
--   a) o Gestor abre o financeiro de novo — o defeito que motivou a migração;
--   b) o investidor continua NÃO abrindo (a reposição não afrouxou a porta);
--   c) pessoa com participação ganha ficha em `investidores`;
--   d) movimentação do razão antigo chega ao razão único, com o valor intacto;
--   e) reaplicar não duplica — a migração é idempotente, como todas daqui.
do $$
declare
  v_gestor uuid := gen_random_uuid();
  v_inv    uuid := gen_random_uuid();
  v_ficha  uuid;
  v_antes  int;
  v_depois int;
begin
  insert into auth.users (id, email, email_confirmed_at)
    values (v_gestor, 'aceite.gestor@local', now()), (v_inv, 'aceite.inv@local', now());
  update public.profiles set papeis = array['gestor'],     full_name = 'Gestor Aceite'
   where id = v_gestor;
  update public.profiles set papeis = array['investidor'], full_name = 'Investidor Aceite'
   where id = v_inv;

  -- (a0) o CHECK aceita gestor de novo — se não aceitasse, os `update` acima
  -- teriam explodido antes de chegar aqui. Esta linha existe para dizer em voz
  -- alta o que aqueles dois updates provam de lado.
  if not public.papeis_validos(array['gestor']) then
    raise exception 'ACEITE FALHOU: gestor continua fora do vocabulário de papeis';
  end if;
  if not public.papeis_validos(array['admin','gestor','financeiro']) then
    raise exception 'ACEITE FALHOU: gestor não combina com outros papéis';
  end if;
  if public.papeis_validos(array['inventado']) then
    raise exception 'ACEITE FALHOU: o vocabulário aceitou papel que não existe';
  end if;
  -- A terceira régua: o CHECK da coluna `role`. Os dois `update` acima só
  -- passam se ele também aceitar 'gestor' — o trigger espelha `papeis[1]` em
  -- `role`, então gestor no array vira gestor na coluna.
  if not exists (select 1 from public.profiles where id = v_gestor and role = 'gestor') then
    raise exception 'ACEITE FALHOU: o espelho `role` não recebeu gestor';
  end if;

  -- (a) e (b)
  if not public.has_finance_access(v_gestor) then
    raise exception 'ACEITE FALHOU: o gestor continua sem o financeiro';
  end if;
  if public.has_finance_access(v_inv) then
    raise exception 'ACEITE FALHOU: o investidor abriu o financeiro';
  end if;

  -- (c) e (d) só valem onde a migração paralela existe.
  if to_regclass('public.investidor_movimentos') is not null then
    insert into public.investidor_movimentos (investidor_id, tipo, valor, data, descricao)
      values (v_inv, 'aporte', 12345.67, current_date, 'Aporte do aceite');

    select count(*) into v_antes from public.movimentacoes_investidor;

    -- Roda de novo o corpo da fusão, agora com dado plantado.
    insert into public.investidores (nome, email, perfil_id, observacoes)
    select coalesce(nullif(btrim(p.full_name), ''), p.email, 'Investidor sem nome'),
           p.email, p.id, 'Ficha criada na fusão de 2026-08-22, a partir do perfil de acesso.'
      from public.profiles p
     where p.id = v_inv
       and not exists (select 1 from public.investidores i where i.perfil_id = p.id);

    select id into v_ficha from public.investidores where perfil_id = v_inv;
    if v_ficha is null then
      raise exception 'ACEITE FALHOU: quem tem movimentação não ganhou ficha';
    end if;

    insert into public.movimentacoes_investidor
           (investidor_id, tipo, valor, descricao, data, veiculo_id, observacoes, created_by)
    select v_ficha, m.tipo, m.valor,
           coalesce(nullif(btrim(m.descricao), ''), 'Movimentação importada da fusão'),
           m.data, m.veiculo_id::text,
           format('Importada de investidor_movimentos (%s) na fusão de 2026-08-22.', m.id),
           m.created_by
      from public.investidor_movimentos m
     where m.investidor_id = v_inv
       and not exists (
             select 1 from public.movimentacoes_investidor x
              where x.observacoes like '%' || m.id::text || '%');

    select count(*) into v_depois from public.movimentacoes_investidor;
    if v_depois <> v_antes + 1 then
      raise exception 'ACEITE FALHOU: a movimentação não chegou ao razão único (% -> %)',
        v_antes, v_depois;
    end if;
    if not exists (select 1 from public.movimentacoes_investidor
                    where investidor_id = v_ficha and valor = 12345.67 and tipo = 'aporte') then
      raise exception 'ACEITE FALHOU: o valor não sobreviveu à cópia';
    end if;

    -- (e) a mesma cópia de novo não pode duplicar
    insert into public.movimentacoes_investidor
           (investidor_id, tipo, valor, descricao, data, veiculo_id, observacoes, created_by)
    select v_ficha, m.tipo, m.valor, coalesce(nullif(btrim(m.descricao), ''), 'x'),
           m.data, m.veiculo_id::text,
           format('Importada de investidor_movimentos (%s) na fusão de 2026-08-22.', m.id),
           m.created_by
      from public.investidor_movimentos m
     where m.investidor_id = v_inv
       and not exists (
             select 1 from public.movimentacoes_investidor x
              where x.observacoes like '%' || m.id::text || '%');
    if (select count(*) from public.movimentacoes_investidor) <> v_depois then
      raise exception 'ACEITE FALHOU: reaplicar duplicou o razão';
    end if;

    delete from public.movimentacoes_investidor where investidor_id = v_ficha;
    delete from public.investidor_movimentos where investidor_id = v_inv;
    delete from public.investidores where id = v_ficha;
  end if;

  delete from auth.users where id in (v_gestor, v_inv);

  raise notice 'Aceite verificado: gestor reposto nas três réguas (role, papeis, financeiro), investidor fora, ficha criada, razão unificado e idempotente.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260822210000', 'fundir_investidores')
  on conflict (version) do nothing;
