-- ==========================================================
-- Garagem Motors: o vínculo entre a venda e o login
-- ==========================================================
--
-- A fundação (20260813150000) deixou `clientes.auth_user_id` como o elo entre
-- o registro de negócio e o usuário do Auth — e ninguém o preenchia. Este
-- arquivo cria os dois preenchedores, um para cada momento em que o elo pode
-- nascer:
--
--   `vincular_auth_por_email(p_cliente)` — no FECHAMENTO DA VENDA. A rota
--   A19 cria o usuário no Auth (manual §6.3: "a conta nasce no fechamento da
--   venda") e usa o id devolvido; quando o e-mail JÁ tem usuário — cliente de
--   segundo carro, funcionário comprando — a criação falha e esta função
--   resolve pelo banco. Só o service_role executa.
--
--   `reivindicar_garagem()` — no PRIMEIRO LOGIN. Rede de segurança para o
--   cliente cujo vínculo não nasceu na venda (falha do Auth naquele dia, base
--   histórica do §3.3). Liga pelo e-mail VERIFICADO: quem chegou aqui provou
--   ser dono do e-mail clicando no link mágico, e o cadastro público está
--   fechado — não existe e-mail estranho no Auth.
--
-- O que NENHUMA das duas faz: mexer em papel. Vincular liga o cliente à
-- própria linha de negócio; promover alguém a staff é outra régua
-- (`app_metadata`, regra 2-b do CLAUDE.md) e não passa por aqui.
-- ==========================================================


-- ==========================================================
-- 1. vincular_auth_por_email — o lado da venda
-- ==========================================================

create or replace function public.vincular_auth_por_email(p_cliente uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_uid uuid;
begin
  -- O candidato: usuário do Auth com o mesmo e-mail do cliente. O mais
  -- recente vence se houver duplicata histórica no Auth (não deveria haver —
  -- GoTrue impõe e-mail único por instância — mas ORDER BY custa nada).
  select u.id into v_uid
    from auth.users u
    join public.clientes c on lower(c.email) = lower(u.email)
   where c.id = p_cliente
     and c.auth_user_id is null
     and c.email is not null
   order by u.created_at desc
   limit 1;

  if v_uid is null then
    return jsonb_build_object('vinculado', false);
  end if;

  -- `auth_user_id` é UNIQUE: se este usuário já estiver preso a OUTRO
  -- cliente (dois CPFs com o mesmo e-mail — pai e filho, por exemplo), o
  -- update abaixo estoura em vez de roubar o vínculo. É o comportamento
  -- certo: e-mail compartilhado entre clientes é decisão de gente, não desta
  -- função.
  update public.clientes
     set auth_user_id = v_uid
   where id = p_cliente
     and auth_user_id is null;

  return jsonb_build_object('vinculado', true, 'auth_user_id', v_uid);
end;
$$;

comment on function public.vincular_auth_por_email(uuid) is
  'Liga clientes.auth_user_id ao usuário do Auth de mesmo e-mail. Usada pela '
  'rota de fechamento de venda quando o e-mail já tinha conta. Nunca rouba '
  'vínculo existente e nunca toca em papel.';

revoke all on function public.vincular_auth_por_email(uuid) from public, anon, authenticated;
grant execute on function public.vincular_auth_por_email(uuid) to service_role;


-- ==========================================================
-- 2. reivindicar_garagem — o lado do login
-- ==========================================================
--
-- O e-mail sai do JWT (`auth.jwt()->>'email'`), não de parâmetro: o chamador
-- não escolhe qual e-mail reivindica — reivindica o que provou ter.

create or replace function public.reivindicar_garagem()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_qtd   int;
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('vinculados', 0);
  end if;

  -- `auth_user_id` é UNIQUE: um usuário ↔ um cliente. Quando o mesmo e-mail
  -- tiver mais de um cliente sem vínculo (a pessoa física e a empresa dela),
  -- a reivindicação pega o mais antigo e o resto fica para a loja resolver —
  -- dois CPFs num e-mail é exceção operacional, não fluxo. E quem já está
  -- vinculado a um cliente não reivindica outro.
  update public.clientes c
     set auth_user_id = auth.uid()
   where c.id = (
           select c2.id from public.clientes c2
            where c2.auth_user_id is null
              and c2.email is not null
              and lower(c2.email) = v_email
            order by c2.created_at
            limit 1
         )
     and not exists (
           select 1 from public.clientes c3 where c3.auth_user_id = auth.uid()
         );
  get diagnostics v_qtd = row_count;

  return jsonb_build_object('vinculados', v_qtd);
end;
$$;

comment on function public.reivindicar_garagem() is
  'Primeiro login da Garagem: liga o cliente sem vínculo cujo e-mail é o do '
  'JWT da sessão. Rede de segurança para quando o vínculo não nasceu na '
  'venda. Idempotente; nunca rouba vínculo nem toca em papel.';

revoke all on function public.reivindicar_garagem() from public, anon;
grant execute on function public.reivindicar_garagem() to authenticated, service_role;


-- ==========================================================
-- 3. Autoconferência — os dois lados, contra o banco real
-- ==========================================================

do $$
declare
  uid_novo  uuid := gen_random_uuid();
  cli_a     uuid;
  cli_b     uuid;
  r         jsonb;
  qtd       int;
begin
  -- Um usuário sintético direto em auth.users, com o mínimo que o GoTrue
  -- exige. O trigger handle_new_user vai criar a linha de profiles com
  -- role='cliente' — parte do que se quer provar. Tudo morre no fim do bloco.
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at,
     confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', uid_novo, 'authenticated',
     'authenticated', 'autoconf-garagem@exemplo.invalido', '',
     now(), now(), now(), '', '', '', '');

  select to_jsonb(p.role) into strict r
    from public.profiles p where p.id = uid_novo;
  if r <> to_jsonb('cliente'::text) then
    raise exception 'ACEITE FALHOU: usuário novo nasceu com papel %', r;
  end if;

  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email)
  values ('AUTOCONF-GARAGEM-A', 'Cliente Garagem A', '+550000000031',
          'AUTOCONF-GARAGEM@exemplo.invalido')
  returning id into cli_a;

  -- ---- 1. o lado da venda: vincula pelo e-mail, ignorando caixa ---------
  r := public.vincular_auth_por_email(cli_a);
  if (r->>'vinculado')::boolean is not true then
    raise exception 'ACEITE FALHOU: vincular_auth_por_email não achou o usuário pelo e-mail';
  end if;
  select count(*) into qtd from public.clientes
   where id = cli_a and auth_user_id = uid_novo;
  if qtd <> 1 then
    raise exception 'ACEITE FALHOU: o vínculo da venda não gravou';
  end if;

  -- Repetir não duplica nem estoura.
  r := public.vincular_auth_por_email(cli_a);
  if (r->>'vinculado')::boolean is not false then
    raise exception 'ACEITE FALHOU: vincular repetido deveria devolver false';
  end if;

  -- ---- 2. o lado do login: reivindicação pelo e-mail do JWT -------------
  update public.clientes set auth_user_id = null where id = cli_a;

  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid_novo, 'role', 'authenticated',
    'email', 'Autoconf-Garagem@exemplo.invalido')::text, true);
  set local role authenticated;

  r := public.reivindicar_garagem();
  if (r->>'vinculados')::int <> 1 then
    raise exception 'ACEITE FALHOU: reivindicar_garagem não vinculou (voltou %)', r;
  end if;

  -- Idempotente: segunda chamada não vincula de novo.
  r := public.reivindicar_garagem();
  if (r->>'vinculados')::int <> 0 then
    raise exception 'ACEITE FALHOU: reivindicar repetido vinculou de novo';
  end if;

  set local role none;

  -- ---- 3. ninguém reivindica e-mail que não provou ----------------------
  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email)
  values ('AUTOCONF-GARAGEM-B', 'Cliente Garagem B', '+550000000032',
          'outro-email@exemplo.invalido')
  returning id into cli_b;

  perform set_config('request.jwt.claims', json_build_object(
    'sub', uid_novo, 'role', 'authenticated',
    'email', 'autoconf-garagem@exemplo.invalido')::text, true);
  set local role authenticated;

  r := public.reivindicar_garagem();
  if (r->>'vinculados')::int <> 0 then
    raise exception 'ACEITE FALHOU: reivindicou cliente de OUTRO e-mail';
  end if;

  set local role none;

  select count(*) into qtd from public.clientes
   where id = cli_b and auth_user_id is not null;
  if qtd <> 0 then
    raise exception 'ACEITE FALHOU: cliente B ganhou vínculo indevido';
  end if;

  -- ---- limpeza ----------------------------------------------------------
  delete from public.clientes where id in (cli_a, cli_b);
  delete from public.profiles where id = uid_novo;
  delete from auth.users      where id = uid_novo;

  raise notice 'Autoconferência do vínculo da Garagem: OK.';
end $$;
