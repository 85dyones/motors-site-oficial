-- ==========================================================
-- Consentimento por canal, na mão do cliente — §6.3-D
-- ==========================================================
--
-- O manual dá ao cliente uma chave liga/desliga por categoria, e a linha que
-- tem efeito real hoje é "Comunicação por WhatsApp / e-mail — opt-in por
-- canal". Desligar não penaliza nada: o motor de gatilhos simplesmente
-- suprime o envio com o motivo `sem_canal_consentido` (regra 2 do CLAUDE.md).
--
-- **Por que uma função e não uma policy de UPDATE.** A tabela `clientes` dá
-- grant de UPDATE em TODAS as colunas para o papel `authenticated` — que é o
-- mesmo papel da equipe. Uma policy de UPDATE para o cliente abriria junto
-- `cpf_cnpj`, `email` e `auth_user_id`: ele poderia reescrever o próprio
-- registro de negócio, ou mexer no vínculo de login. Restringir por coluna
-- exigiria revogar o grant do `authenticated`, o que tiraria a edição da
-- equipe no mesmo gesto.
--
-- `security definer` com escopo estreito resolve: a função escreve UMA coluna,
-- da linha de QUEM CHAMOU, e mais nada. Mesmo desenho de
-- `reivindicar_garagem()`.
--
-- Fora daqui, de propósito: localização e telemetria de condução. O §6.3-D
-- v1.1 é explícito — enquanto não houver provedor contratado, essas linhas não
-- aparecem para o cliente, porque "chave que não liga nada é ruído, e sugere
-- um rastreamento que não existe".
-- ==========================================================

create or replace function public.atualizar_consentimento_canais(
  p_whatsapp boolean,
  p_email    boolean
) returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_cliente uuid;
  v_atual   jsonb;
  v_novo    jsonb;
begin
  if auth.uid() is null then
    raise exception 'SEM_SESSAO' using errcode = 'insufficient_privilege';
  end if;
  if p_whatsapp is null or p_email is null then
    raise exception 'CONSENTIMENTO_INVALIDO' using errcode = 'check_violation';
  end if;

  select id, coalesce(consentimento_canais, '{}'::jsonb)
    into v_cliente, v_atual
    from public.clientes
   where auth_user_id = auth.uid();

  if v_cliente is null then
    raise exception 'CLIENTE_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  -- Preserva o que existir além dos dois canais (hoje `sms`, que não tem
  -- transporte e por isso não vira botão) e carimba a data da escolha: prova
  -- de consentimento sem tabela nova. Chave extra não atrapalha o motor, que
  -- lê `canais->>'whatsapp'` e `canais->>'email'`.
  v_novo := v_atual
            || jsonb_build_object(
                 'whatsapp', p_whatsapp,
                 'email',    p_email,
                 'atualizado_em', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                 'atualizado_por', 'cliente'
               );

  update public.clientes
     set consentimento_canais = v_novo,
         updated_at = now()
   where id = v_cliente;

  return jsonb_build_object('ok', true, 'consentimento_canais', v_novo);
end;
$$;

comment on function public.atualizar_consentimento_canais(boolean, boolean) is
  'O cliente liga/desliga os canais de comunicação (§6.3-D). SECURITY DEFINER '
  'de escopo estreito: escreve só consentimento_canais, só da própria linha. '
  'Policy de UPDATE abriria cpf_cnpj e auth_user_id junto, porque o grant da '
  'tabela não é por coluna e o papel é o mesmo da equipe.';

revoke all on function public.atualizar_consentimento_canais(boolean, boolean) from public, anon;
grant execute on function public.atualizar_consentimento_canais(boolean, boolean) to authenticated;


-- ==========================================================
-- Autoconferência — a chave do cliente, contra o banco real
-- ==========================================================

do $$
declare
  uid_cli uuid := gen_random_uuid();
  uid_b   uuid := gen_random_uuid();
  cli     uuid;
  cli_b   uuid;
  r       jsonb;
  ok      boolean;
  v_cpf   text;
begin
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at,
     confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', uid_cli, 'authenticated',
     'authenticated', 'autoconf-consent@exemplo.invalido', '',
     now(), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_b, 'authenticated',
     'authenticated', 'autoconf-consent-b@exemplo.invalido', '',
     now(), now(), now(), '', '', '', '');

  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email, auth_user_id,
                               consentimento_canais)
  values ('AUTOCONF-CONSENT-A', 'Cliente Consent A', '+550000000051',
          'autoconf-consent@exemplo.invalido', uid_cli,
          '{"whatsapp":true,"email":true,"sms":false}'::jsonb)
  returning id into cli;

  insert into public.clientes (cpf_cnpj, nome, telefone_e164, auth_user_id)
  values ('AUTOCONF-CONSENT-B', 'Cliente Consent B', '+550000000052', uid_b)
  returning id into cli_b;

  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_cli, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. desliga o WhatsApp, mantém o e-mail.
  r := public.atualizar_consentimento_canais(false, true);
  if (r->'consentimento_canais'->>'whatsapp')::boolean is not false then
    raise exception 'ACEITE FALHOU: desligar o WhatsApp não gravou';
  end if;
  if (r->'consentimento_canais'->>'email')::boolean is not true then
    raise exception 'ACEITE FALHOU: o e-mail foi junto sem ser pedido';
  end if;

  -- 2. o que não é canal sobrevive, e a escolha fica datada.
  if (r->'consentimento_canais'->>'sms') is null then
    raise exception 'ACEITE FALHOU: a chave sms sumiu do jsonb';
  end if;
  if (r->'consentimento_canais'->>'atualizado_em') is null then
    raise exception 'ACEITE FALHOU: a escolha não ficou datada';
  end if;

  -- 3. desligar tudo é permitido — recusa nunca é bloqueada.
  r := public.atualizar_consentimento_canais(false, false);
  if (r->'consentimento_canais'->>'email')::boolean is not false then
    raise exception 'ACEITE FALHOU: não deu para desligar todos os canais';
  end if;

  -- 4. a função NÃO é porta para reescrever o resto do cadastro.
  select cpf_cnpj into v_cpf from public.clientes where id = cli;
  if v_cpf <> 'AUTOCONF-CONSENT-A' then
    raise exception 'ACEITE FALHOU: o cadastro mudou junto com o consentimento';
  end if;

  -- 5. e o cliente segue sem UPDATE direto na tabela.
  ok := false;
  begin
    update public.clientes set cpf_cnpj = 'INVADIDO' where id = cli;
    if not found then ok := true; end if;   -- RLS devolve zero linhas
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: cliente reescreveu o próprio cadastro por UPDATE direto';
  end if;

  -- 6. não mexe no cadastro de outro cliente.
  select consentimento_canais into r from public.clientes where id = cli_b;
  if r is not null and (r->>'whatsapp') is not null and (r->>'atualizado_por') is not null then
    raise exception 'ACEITE FALHOU: o consentimento do outro cliente foi tocado';
  end if;

  set local role none;

  delete from public.clientes where id in (cli, cli_b);
  delete from public.profiles where id in (uid_cli, uid_b);
  delete from auth.users  where id in (uid_cli, uid_b);

  raise notice 'Autoconferência do consentimento: OK.';
end $$;
