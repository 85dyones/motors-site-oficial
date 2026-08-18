-- ==========================================================
-- O vínculo da Garagem passa a exigir e-mail confirmado
-- ==========================================================
--
-- `reivindicar_garagem()` liga a conta do Auth ao cliente comparando o e-mail
-- do JWT com o e-mail do cadastro. Ela não verificava se esse e-mail foi
-- **confirmado** — e a segurança inteira do vínculo repousava numa afirmação
-- de configuração: "o cadastro público está fechado, então não existe e-mail
-- estranho no Auth".
--
-- Isso é verdade hoje e é frágil por natureza. É um checkbox no painel do
-- Supabase, fora do controle de versão, sem teste que o guarde e sem nada que
-- avise se alguém religá-lo. O dia em que for religado por engano, este é o
-- caminho:
--
--   1. a base histórica do §3.3 tem cliente com `email` preenchido e
--      `auth_user_id` nulo — é o estado normal de quem comprou antes do Ciclo;
--   2. um estranho cria conta com o e-mail de um desses clientes;
--   3. no primeiro acesso a /garagem, a função entrega placa, chassi, diário
--      de bordo, CPF mascarado e a exportação completa de "Meus dados".
--
-- Uma linha de SQL fecha isso no lugar certo. `email_confirmed_at` é gravado
-- pelo próprio Supabase quando o link mágico é usado — e o link mágico vai
-- para o e-mail, então confirmá-lo É a prova de posse que o vínculo
-- pressupunha o tempo todo.
--
-- Nada mais da função muda: o resto do corpo é o que estava em produção.
-- ==========================================================

create or replace function public.reivindicar_garagem()
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_qtd   int;
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('vinculados', 0);
  end if;

  -- A prova de posse do e-mail. Sem ela, o vínculo dependia de o cadastro
  -- público estar fechado no painel — configuração, não código.
  if not exists (
       select 1 from auth.users u
        where u.id = auth.uid()
          and u.email_confirmed_at is not null
     ) then
    return jsonb_build_object('vinculados', 0, 'motivo', 'email_nao_confirmado');
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
$function$;

comment on function public.reivindicar_garagem() is
  'Liga a conta do Auth ao cliente pelo e-mail, e SÓ com e-mail confirmado '
  '(email_confirmed_at). A confirmação é a prova de posse que o vínculo '
  'pressupõe — antes de 2026-08-18 ela dependia do cadastro público estar '
  'fechado no painel, que é configuração e não código.';


-- ==========================================================
-- Autoconferência — conta sem e-mail confirmado não reivindica
-- ==========================================================

do $$
declare
  uid   uuid;
  cli   uuid;
  r     jsonb;
begin
  -- Precisa de um usuário real do Auth: `clientes.auth_user_id` não tem FK,
  -- mas a função lê `auth.users`. Se não houver nenhum sem confirmação, o
  -- teste cria um e apaga depois.
  select id into uid from auth.users where email_confirmed_at is null limit 1;

  if uid is null then
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated', 'autoconf-nao-confirmado@exemplo.invalido',
            now(), now())
    returning id into uid;
  end if;

  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email)
  values ('AUTOCONF-VINCULO', 'Cliente Autoconferência', '+550000000009',
          'autoconf-nao-confirmado@exemplo.invalido')
  returning id into cli;

  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated',
                      'email', 'autoconf-nao-confirmado@exemplo.invalido')::text, true);
  set local role authenticated;

  r := public.reivindicar_garagem();

  reset role;

  if (r->>'vinculados')::int <> 0 then
    raise exception 'ACEITE FALHOU: conta sem e-mail confirmado reivindicou garagem';
  end if;
  if coalesce(r->>'motivo', '') <> 'email_nao_confirmado' then
    raise exception 'ACEITE FALHOU: recusa sem o motivo esperado (%)', r;
  end if;

  delete from public.clientes where id = cli;
  delete from auth.users where email = 'autoconf-nao-confirmado@exemplo.invalido'
     and email_confirmed_at is null;

  raise notice 'Aceite verificado: e-mail não confirmado não reivindica garagem.';
end $$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260818130000', 'vinculo_exige_email_confirmado')
  on conflict (version) do nothing;
