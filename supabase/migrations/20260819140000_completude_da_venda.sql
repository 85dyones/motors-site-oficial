-- ---------------------------------------------------------------------------
-- Pacote 2 — completude do registro da venda (§3.2 e §9).
--
-- O manual pede duas coisas que nunca foram feitas: "rotina noturna que lista
-- vendas com registro incompleto e notifica o vendedor responsável" e
-- "indicador de completude por vendedor, visível e comparativo". O §9 fixa a
-- meta: **completude >= 80% nas vendas novas**.
--
-- ---------------------------------------------------------------------------
-- O problema que aparece antes do indicador: não existia vendedor
-- ---------------------------------------------------------------------------
-- `veiculos_vendidos.vendedor` é TEXTO LIVRE e opcional. Para um ranking isso
-- é fatal — "João", "joão" e "João Silva" viram três pessoas —, e para
-- notificar não serve de nada: não há telefone em lugar nenhum.
--
-- A correção é apontar o vendedor para quem já existe: `profiles`, onde a
-- equipe autentica. Quem fecha a venda está logado na A19, então a atribuição
-- não precisa ser digitada — é observada. Isso mata a divergência de grafia na
-- origem, em vez de tentar normalizar depois.
--
-- Feito agora porque a base tem ZERO vendas: não há dado para migrar. Cada
-- venda fechada a partir daqui encareceria esta mudança.
--
-- A coluna `vendedor` (texto) fica, sem uso novo: é o que a base histórica do
-- §3.3 vai trazer quando o mutirão rodar, e lá não haverá `profiles` para
-- apontar.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists telefone_e164 text;

comment on column public.profiles.telefone_e164 is
  'WhatsApp do membro da equipe, em E.164. Preenchido na tela de usuários '
  '(A17). É por aqui que a rotina de vendas incompletas cutuca o vendedor.';

alter table public.veiculos_vendidos
  add column if not exists vendedor_id uuid references public.profiles(id);

comment on column public.veiculos_vendidos.vendedor_id is
  'Quem fechou a venda, observado da sessão — não digitado. A coluna vendedor '
  '(texto) permanece para a base histórica do §3.3, que não tem profile.';

create index if not exists idx_vv_vendedor on public.veiculos_vendidos(vendedor_id);

-- ---------------------------------------------------------------------------
-- A atribuição é observada, não informada
-- ---------------------------------------------------------------------------
-- Por trigger, e não dentro de `fechar_venda_ciclo`: a função tem 200 linhas
-- de regra do §3.1 já provadas por autoconferência, e reescrevê-la inteira
-- para acrescentar uma atribuição é risco desproporcional. O trigger também
-- cobre qualquer outro caminho de inserção que apareça depois.
--
-- `coalesce` e não sobrescrita: o mutirão da base histórica (§3.3) vai inserir
-- com `vendedor_id` explícito (ou nulo), e o trigger não pode carimbar o
-- operador do mutirão como vendedor de uma venda de 2023.

create or replace function public.marcar_vendedor_da_sessao()
  returns trigger
  language plpgsql
  set search_path = public
as $fn$
begin
  new.vendedor_id := coalesce(new.vendedor_id, auth.uid());
  return new;
end;
$fn$;

drop trigger if exists trg_vendedor_da_sessao on public.veiculos_vendidos;
create trigger trg_vendedor_da_sessao
  before insert on public.veiculos_vendidos
  for each row execute function public.marcar_vendedor_da_sessao();

-- ---------------------------------------------------------------------------
-- A régua da completude
-- ---------------------------------------------------------------------------
-- Os obrigatórios do §3.1 NÃO entram: `fechar_venda_ciclo` já recusa a venda
-- sem eles, então medi-los seria medir uma constante. A régua mede o que o
-- formulário deixa passar em branco e o vendedor consegue preencher no ato:
--
--   vendedor . versao . cep . data_nascimento . consentimento_canais
--
-- `consentimento_canais` conta como pendência quando NENHUM canal está ligado:
-- aí o cliente nunca recebe nada do programa e o motor o suprime com
-- `sem_canal_consentido`, em silêncio. É a pendência mais cara da lista.
--
-- ATENÇÃO: `custo_aquisicao` foi deliberadamente DEIXADO DE FORA — a matriz de
-- permissões esconde o campo do Comercial, e ranquear alguém por um dado que
-- ele não enxerga na tela é armadilha, não indicador.
--
-- Ponto cego conhecido: venda financiada lançada SEM nenhum dado de
-- financiamento é indistinguível de venda à vista. `fechar_venda_ciclo` exige
-- "nenhum ou todos", então quem deixa tudo em branco passa. Só quem estava na
-- negociação sabe, e o banco não tem como saber — fica registrado aqui em vez
-- de virar uma detecção inventada.

create or replace view public.vw_vendas_incompletas as
select
  vv.id                                                   as veiculo_vendido_id,
  vv.data_venda,
  vv.placa,
  vv.marca,
  vv.modelo,
  vv.vendedor_id,
  coalesce(p.full_name, vv.vendedor, '(sem vendedor)')    as vendedor_nome,
  p.telefone_e164                                         as vendedor_telefone,
  c.id                                                    as cliente_id,
  c.nome                                                  as cliente_nome,
  array_remove(array[
    case when vv.vendedor_id is null                    then 'vendedor'            end,
    case when coalesce(trim(vv.versao), '')       = ''  then 'versao'              end,
    case when coalesce(trim(c.cep), '')           = ''  then 'cep'                 end,
    case when c.data_nascimento is null                 then 'data_nascimento'     end,
    case when not coalesce((c.consentimento_canais->>'whatsapp')::boolean, false)
          and not coalesce((c.consentimento_canais->>'email')::boolean,    false)
          and not coalesce((c.consentimento_canais->>'sms')::boolean,      false)
         then 'consentimento_canais' end
  ], null)                                                as pendencias
from public.veiculos_vendidos vv
join public.clientes  c on c.id = vv.cliente_id
left join public.profiles p on p.id = vv.vendedor_id
-- Matview e view comum não respeitam RLS: o corte é este WHERE, mesmo padrão
-- de `vw_ciclo_estado_painel`. Sem ele, um cliente logado leria a base inteira.
where public.is_staff(auth.uid())
   -- A chave de serviço não tem `uid`, então `is_staff` responde false e a
   -- view devolveria VAZIO SEM ERRO — que é como a consulta de margens passou
   -- semanas somando zero em 2026-08-12. A rotina noturna lê por aqui, e uma
   -- lista vazia é indistinguível de "está tudo completo".
   --
   -- Não afrouxa nada: `service_role` já ignora RLS em toda tabela do projeto.
   -- Esta linha só impede que a view seja mais restritiva que o banco.
   or current_user = 'service_role';

comment on view public.vw_vendas_incompletas is
  'Uma linha por venda, com as pendências do registro (§3.2). Régua de 5 '
  'campos que o formulário deixa passar em branco — os obrigatórios do §3.1 '
  'não entram porque fechar_venda_ciclo já os recusa. Restrita a staff.';

revoke all on public.vw_vendas_incompletas from anon, authenticated;
grant select on public.vw_vendas_incompletas to authenticated;

-- ---------------------------------------------------------------------------
-- O ranking
-- ---------------------------------------------------------------------------
-- Função com janela, e não view fixa: qualquer período que eu cravasse aqui
-- (30 dias? 90?) seria número inventado, e o manual não dá um. `null` nos dois
-- extremos = tudo. Quem escolhe é a tela.
--
-- `completude` é a fração de campos preenchidos sobre o total possível — não a
-- fração de vendas perfeitas. Uma venda a que falta 1 campo de 5 conta 0,8, e
-- não zero: o indicador do §9 mede registro, e tratar "quase completo" como
-- "incompleto" apagaria justamente o progresso que ele deve mostrar.

create or replace function public.completude_por_vendedor(
  p_desde date default null,
  p_ate   date default null
)
returns table (
  vendedor_id       uuid,
  vendedor_nome     text,
  vendas            bigint,
  vendas_completas  bigint,
  campos_pendentes  bigint,
  completude        numeric,
  posicao           bigint
)
  language sql
  stable
  set search_path = public
as $fn$
  with base as (
    select v.vendedor_id, v.vendedor_nome, v.pendencias
      from public.vw_vendas_incompletas v
     where (p_desde is null or v.data_venda >= p_desde)
       and (p_ate   is null or v.data_venda <= p_ate)
  ), agregado as (
    select
      b.vendedor_id                                        as vendedor_id,
      b.vendedor_nome                                      as vendedor_nome,
      count(*)                                             as vendas,
      count(*) filter (where cardinality(b.pendencias) = 0) as vendas_completas,
      sum(cardinality(b.pendencias))                       as campos_pendentes,
      round(
        1 - sum(cardinality(b.pendencias))::numeric / (count(*) * 5),
        4
      )                                                    as completude
    from base b
    group by b.vendedor_id, b.vendedor_nome
  )
  select
    a.vendedor_id,
    a.vendedor_nome,
    a.vendas,
    a.vendas_completas,
    a.campos_pendentes,
    a.completude,
    rank() over (order by a.completude desc, a.vendas desc) as posicao
  from agregado a
  order by posicao, a.vendedor_nome;
$fn$;

comment on function public.completude_por_vendedor(date, date) is
  'Ranking de completude do registro por vendedor (§3.2, meta §9 >= 80%). '
  'Janela opcional; null = tudo. Lê a view restrita a staff, então herda o '
  'corte de acesso dela.';

revoke all on function public.completude_por_vendedor(date, date) from public, anon;
grant execute on function public.completude_por_vendedor(date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Autoconferência
-- ---------------------------------------------------------------------------
-- `is_staff()` consulta a tabela `profiles`, não o `app_metadata` do JWT: um
-- `sub` sintético sem perfil correspondente NÃO é staff. Por isso a conferência
-- monta um vendedor de verdade — usuário e perfil — e assume a sessão dele.
do $ac$
declare
  v_uid   uuid;
  v_cli   uuid;
  v_vv    uuid;
  v_pend  text[];
  v_comp  numeric;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'autoconf-completude@exemplo.invalido',
          now(), now())
  returning id into v_uid;

  -- `handle_new_user` já criou o perfil junto com o usuário, com papel
  -- `cliente` (o padrão de todo cadastro novo desde 2026-08-13). Promovê-lo a
  -- `comercial` aqui é o que faz `is_staff()` responder true.
  insert into public.profiles (id, email, full_name, role, is_active)
  values (v_uid, 'autoconf-completude@exemplo.invalido',
          'Vendedor Autoconferência', 'comercial', true)
  on conflict (id) do update
    set role = 'comercial', is_active = true, full_name = excluded.full_name;

  -- Um cliente e uma venda sintéticos, com TUDO que a régua mede em branco.
  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email, consentimento_canais)
    values ('00000000000', 'Autoconferência Completude', '+5541900000000',
            'autoconf-completude@exemplo.invalido',
            '{"whatsapp":false,"email":false,"sms":false}'::jsonb)
    returning id into v_cli;

  insert into public.veiculos_vendidos
    (cliente_id, chassi, placa, marca, modelo, ano_fabricacao, ano_modelo,
     data_venda, km_na_venda, valor_venda)
    values (v_cli, 'AUTOCONF00000000', 'AUT0C0F', 'Marca', 'Modelo', 2020, 2021,
            current_date, 10000, 50000)
    returning id into v_vv;

  -- Sem sessão de staff, a view não devolve nada — o corte de acesso.
  -- (Aqui `current_user` é `postgres`, dono da migração, não `service_role`.)
  if exists (select 1 from public.vw_vendas_incompletas where veiculo_vendido_id = v_vv) then
    raise exception 'ACEITE FALHOU: a view devolveu linha sem sessão de staff';
  end if;

  -- E a chave de serviço PRECISA enxergar: é por ela que a rotina noturna lê.
  -- Sem isto a rota devolveria lista vazia sem erro, e ninguém seria avisado.
  set local role service_role;
  if not exists (select 1 from public.vw_vendas_incompletas where veiculo_vendido_id = v_vv) then
    raise exception 'ACEITE FALHOU: service_role não enxerga a view — a rotina noturna nasceria muda';
  end if;
  reset role;

  -- Com a sessão do vendedor (que TEM perfil de staff), as pendências aparecem.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  select pendencias into v_pend
    from public.vw_vendas_incompletas where veiculo_vendido_id = v_vv;

  if v_pend is null then
    raise exception 'ACEITE FALHOU: staff não enxergou a venda';
  end if;
  if not (v_pend @> array['vendedor','versao','cep','data_nascimento','consentimento_canais']) then
    raise exception 'ACEITE FALHOU: régua não acusou as cinco pendências (%)', v_pend;
  end if;

  -- E o ranking traduz isso em zero de completude.
  select completude into v_comp
    from public.completude_por_vendedor() where vendedor_nome = '(sem vendedor)';
  if v_comp is distinct from 0 then
    raise exception 'ACEITE FALHOU: completude esperada 0, veio %', v_comp;
  end if;

  perform set_config('request.jwt.claims', '', true);
  delete from public.veiculos_vendidos where id = v_vv;
  delete from public.clientes where id = v_cli;
  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;

  raise notice 'Aceite verificado: régua de 5 campos, corte de staff e ranking conferidos.';
end $ac$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260819140000', 'completude_da_venda')
  on conflict (version) do nothing;
