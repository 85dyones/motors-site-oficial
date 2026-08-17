-- ==========================================================
-- Storage do diário de bordo: a foto da etiqueta
-- ==========================================================
--
-- A Emenda 01 fez da **foto da etiqueta de troca de óleo** a prova do carimbo
-- (§5.7). Até aqui ela chegava por WhatsApp e alguém colava uma URL no campo
-- de texto da fila — o que significa que a prova de procedência vivia fora do
-- sistema, num link que ninguém garante que continua de pé.
--
-- Este bucket é onde ela passa a morar. Três decisões:
--
-- 1. **PRIVADO.** A foto mostra o odômetro e, com frequência, o para-brisa e a
--    placa. É dado de cliente, não é ativo de marketing. O bucket `branding`,
--    que já existia, é público — este não pode ser.
--
-- 2. **Caminho é `{veiculo_vendido_id}/arquivo`**, e a RLS lê o primeiro
--    segmento. Assim a autorização não depende de tabela intermediária: o
--    dono do veículo é dono da pasta, e a mesma régua vale para o upload e
--    para a leitura.
--
-- 3. **Sem `manutencao_id` no caminho.** O upload acontece ANTES do registro
--    existir (o navegador manda a foto direto, depois a rota grava a linha) —
--    exigir o id criaria uma ordem impossível. O vínculo é o campo
--    `url_etiqueta_atual` da própria manutenção.
--
-- Por que o upload é direto do navegador, e não pela rota: função serverless
-- da Vercel recusa corpo acima de ~4,5 MB, e foto de celular passa disso com
-- folga. Passar o arquivo pelo servidor seria trocar um limite de storage por
-- um erro 413 no meio da estrada.
-- ==========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'diario-de-bordo', 'diario-de-bordo', false,
  15728640,  -- 15 MB: foto de celular sem tratamento chega a 12 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ==========================================================
-- Policies — a mesma régua do resto do Ciclo
-- ==========================================================
--
-- `storage.objects` já tem RLS ligada por padrão no Supabase. Sem policy,
-- ninguém entra — inclusive a equipe. As quatro abaixo são o mínimo:
-- o cliente escreve e lê a própria pasta; a equipe lê e apaga tudo.
--
-- Comparação em TEXTO, sem cast para uuid: pasta com nome que não é uuid
-- faria o cast estourar dentro da policy, e erro em policy é erro na
-- requisição inteira. Comparar texto com texto simplesmente não casa.

-- ---- cliente: manda a foto para a pasta do próprio veículo ----
drop policy if exists diario_cliente_envia on storage.objects;
create policy diario_cliente_envia on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'diario-de-bordo'
    and (storage.foldername(name))[1] in (
      select vv.id::text
        from public.veiculos_vendidos vv
       where vv.cliente_id = public.cliente_atual()
    )
  );

-- ---- cliente: vê o que mandou ----
drop policy if exists diario_cliente_le on storage.objects;
create policy diario_cliente_le on storage.objects
  for select to authenticated
  using (
    bucket_id = 'diario-de-bordo'
    and (storage.foldername(name))[1] in (
      select vv.id::text
        from public.veiculos_vendidos vv
       where vv.cliente_id = public.cliente_atual()
    )
  );

-- Sem UPDATE e sem DELETE para o cliente, pelo mesmo motivo de `manutencoes`:
-- prova enviada não se reescreve. Foto ilegível se resolve com registro novo,
-- e o anterior fica no rastro com o motivo da recusa.

-- ---- equipe: lê tudo (é quem verifica) e limpa quando precisa ----
drop policy if exists diario_staff_le on storage.objects;
create policy diario_staff_le on storage.objects
  for select to authenticated
  using (bucket_id = 'diario-de-bordo' and public.is_staff(auth.uid()));

drop policy if exists diario_staff_envia on storage.objects;
create policy diario_staff_envia on storage.objects
  for insert to authenticated
  with check (bucket_id = 'diario-de-bordo' and public.is_staff(auth.uid()));

drop policy if exists diario_staff_apaga on storage.objects;
create policy diario_staff_apaga on storage.objects
  for delete to authenticated
  using (bucket_id = 'diario-de-bordo' and public.is_staff(auth.uid()));


-- ==========================================================
-- Autoconferência — a régua da pasta, contra o banco real
-- ==========================================================

do $$
declare
  uid_cli  uuid := gen_random_uuid();
  cli      uuid;
  vv_a     uuid;
  vv_alheio uuid;
  cli_b    uuid;
  ok       boolean;
  ok_staff boolean;
  qtd      int;
begin
  if not exists (select 1 from storage.buckets where id = 'diario-de-bordo' and public = false) then
    raise exception 'ACEITE FALHOU: bucket não existe ou está público';
  end if;

  -- Dois clientes, um veículo cada. O primeiro tem login.
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at,
     confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', uid_cli, 'authenticated',
     'authenticated', 'autoconf-foto@exemplo.invalido', '',
     now(), now(), now(), '', '', '', '');

  insert into public.clientes (cpf_cnpj, nome, telefone_e164, email, auth_user_id)
  values ('AUTOCONF-FOTO-A', 'Cliente Foto A', '+550000000041',
          'autoconf-foto@exemplo.invalido', uid_cli)
  returning id into cli;

  insert into public.clientes (cpf_cnpj, nome, telefone_e164)
  values ('AUTOCONF-FOTO-B', 'Cliente Foto B', '+550000000042')
  returning id into cli_b;

  insert into public.veiculos_vendidos
    (cliente_id, chassi, placa, marca, modelo, ano_fabricacao, ano_modelo,
     data_venda, km_na_venda, valor_venda, aderiu_ciclo)
  values (cli, 'AUTOCONF-FOTO-1', 'FTO0A00', 'M', 'X', 2020, 2021,
          current_date, 10000, 50000, true)
  returning id into vv_a;

  insert into public.veiculos_vendidos
    (cliente_id, chassi, placa, marca, modelo, ano_fabricacao, ano_modelo,
     data_venda, km_na_venda, valor_venda, aderiu_ciclo)
  values (cli_b, 'AUTOCONF-FOTO-2', 'FTO0B00', 'M', 'X', 2020, 2021,
          current_date, 10000, 50000, true)
  returning id into vv_alheio;

  -- ⚠️ `storage.objects` tem trigger `protect_delete`: DELETE direto é
  -- recusado ("Use the Storage API instead"). E `plpgsql` não aceita SAVEPOINT
  -- explícito. O que sobra — e funciona — é o bloco `begin/exception`, que é
  -- uma subtransação: levantar exceção dentro dele desfaz os inserts sem
  -- passar pelo trigger. As variáveis `ok*` sobrevivem ao rollback, porque
  -- variável de plpgsql não é transacional. É assim que o resultado do teste
  -- atravessa o desfazimento.

  perform set_config('request.jwt.claims',
    json_build_object('sub', uid_cli, 'role', 'authenticated')::text, true);

  -- 1. cliente manda para a própria pasta: passa.
  ok := false;
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, owner)
    values ('diario-de-bordo', vv_a::text || '/etiqueta-teste.jpg', uid_cli);
    select count(*) into qtd from storage.objects
     where bucket_id = 'diario-de-bordo' and name like vv_a::text || '/%';
    ok := (qtd = 1);
    raise exception using errcode = 'ZZ999', message = 'DESFAZER';
  exception
    when sqlstate 'ZZ999'    then null;                 -- desfeito de propósito
    when insufficient_privilege then ok := false;
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: o cliente não conseguiu enviar para a própria pasta';
  end if;

  -- 2. cliente manda para a pasta de OUTRO cliente: barrado.
  ok := false;
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name, owner)
    values ('diario-de-bordo', vv_alheio::text || '/invasao.jpg', uid_cli);
    raise exception using errcode = 'ZZ999', message = 'DESFAZER';
  exception
    when sqlstate 'ZZ999'       then ok := false;       -- entrou: é a falha
    when insufficient_privilege then ok := true;        -- barrado: é o certo
  end;
  if not ok then
    raise exception 'ACEITE FALHOU: cliente enviou foto para a pasta de outro cliente';
  end if;

  -- 3. a foto da loja na pasta alheia: privilegiado vê, cliente não.
  ok := false;
  ok_staff := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('diario-de-bordo', vv_alheio::text || '/da-loja.jpg');

    select count(*) into qtd from storage.objects
     where bucket_id = 'diario-de-bordo' and name like vv_alheio::text || '/%';
    ok_staff := (qtd = 1);

    set local role authenticated;
    select count(*) into qtd from storage.objects
     where bucket_id = 'diario-de-bordo' and name like vv_alheio::text || '/%';
    ok := (qtd = 0);

    raise exception using errcode = 'ZZ999', message = 'DESFAZER';
  exception
    when sqlstate 'ZZ999' then null;
  end;
  if not ok_staff then
    raise exception 'ACEITE FALHOU: a foto da loja não ficou visível para quem tem privilégio';
  end if;
  if not ok then
    raise exception 'ACEITE FALHOU: cliente enxergou foto de veículo alheio';
  end if;

  -- ---- limpeza (o storage já se desfez nas subtransações) ----
  delete from public.plano_revisoes    where veiculo_vendido_id in (vv_a, vv_alheio);
  delete from public.leituras_odometro where veiculo_vendido_id in (vv_a, vv_alheio);
  delete from public.veiculos_vendidos where id in (vv_a, vv_alheio);
  delete from public.clientes          where id in (cli, cli_b);
  delete from public.profiles          where id = uid_cli;
  delete from auth.users               where id = uid_cli;

  raise notice 'Autoconferência do storage do diário: OK.';
end $$;
