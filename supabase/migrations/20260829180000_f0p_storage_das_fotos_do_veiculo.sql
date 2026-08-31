-- ============================================================================
-- F0-p — Storage próprio das fotos do veículo (sai o carro57)
-- ============================================================================
-- Decisão do dono em 2026-08-29: "sobe o storage próprio". É o item 16 do
-- backlog do handoff, antecipado — sem ele o cadastro nativo cria carro que
-- nunca chega à vitrine, porque a régua de publicação exige 8 fotos e não há
-- de onde tirá-las (o feed do RevendaMais só traz foto de carro dele).
--
-- ---------------------------------------------------------------------------
-- Por que Supabase Storage, e não um S3 na VPS
-- ---------------------------------------------------------------------------
-- A pergunta do dono era legítima: o plano da Vercel tem tamanho limitado, e
-- ele tem 100 GB livres no Supabase. Três medições resolveram:
--
-- 1. **O limite da Vercel não é este.** O tamanho que ela limita é o do BUNDLE
--    de deploy; foto enviada em runtime nunca entra nele. O limite da Vercel
--    que este projeto de fato já bateu foi outro — a cota de otimização de
--    imagem (`/_next/image` respondendo 402). Servir direto do CDN do Supabase
--    passa ao largo dos dois.
-- 2. **O volume é pequeno.** 104 veículos, 1.497 fotos hoje. Com dois tamanhos
--    tratados no upload, algo entre 0,5 e 1,5 GB — ~1% dos 100 GB, e a conta
--    não muda de ordem de grandeza tão cedo.
-- 3. **A alternativa cobra caro em operação.** MinIO/Garage na VPS é possível e
--    S3-compatível, mas põe TLS, backup, monitoração e a banda de TODA visita
--    à vitrine na mesma máquina que já roda o n8n. Aqui o CDN, a RLS e a auth
--    já estão de pé e integrados.
--
-- A transformação de imagem do Supabase também fica de fora, de propósito: ela
-- cobra por "origin image" e o repositório já tem `lib/imageProcessor.ts`.
-- Tratar no upload custa zero e guarda o resultado.
--
-- ---------------------------------------------------------------------------
-- As decisões deste bucket
-- ---------------------------------------------------------------------------
-- 1. **PÚBLICO**, ao contrário do `diario-de-bordo`. Estas fotos SÃO o anúncio:
--    aparecem na vitrine, no feed dos portais e no card do WhatsApp. Bucket
--    privado exigiria URL assinada em cada card, que expira — e link de anúncio
--    que morre é pior que foto sem tratamento.
-- 2. **Escrita só de quem publica.** Público é a LEITURA; enviar e apagar
--    exigem staff, pela mesma régua da tabela A6.
-- 3. **Caminho é `{estoque_id}/arquivo`** — o mesmo desenho do diário: a pasta
--    é o veículo, e a autorização não depende de tabela intermediária.
-- 4. **Upload direto do navegador**, como no diário: função serverless da
--    Vercel recusa corpo acima de ~4,5 MB e foto de celular passa disso.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'veiculos', 'veiculos', true,
  15728640,  -- 15 MB, o mesmo do diário: foto de celular crua chega perto disso
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---- equipe envia ----
drop policy if exists veiculos_staff_envia on storage.objects;
create policy veiculos_staff_envia on storage.objects
  for insert to authenticated
  with check (bucket_id = 'veiculos' and public.is_staff(auth.uid()));

-- ---- equipe substitui (upsert de uma foto já enviada) ----
drop policy if exists veiculos_staff_atualiza on storage.objects;
create policy veiculos_staff_atualiza on storage.objects
  for update to authenticated
  using (bucket_id = 'veiculos' and public.is_staff(auth.uid()))
  with check (bucket_id = 'veiculos' and public.is_staff(auth.uid()));

-- ---- equipe apaga ----
--
-- Aqui a foto PODE ser apagada, ao contrário do diário de bordo (onde um
-- trigger `protect_delete` impede, porque lá a foto é prova). Foto de anúncio
-- é material de marketing: trocar a que ficou tremida é trabalho normal.
drop policy if exists veiculos_staff_apaga on storage.objects;
create policy veiculos_staff_apaga on storage.objects
  for delete to authenticated
  using (bucket_id = 'veiculos' and public.is_staff(auth.uid()));

-- ---- qualquer um lê ----
--
-- Bucket público já responde pela URL pública sem passar por policy; esta
-- existe para o caminho autenticado do SDK enxergar a mesma coisa (listar,
-- por exemplo), sem precisar de service key na tela.
drop policy if exists veiculos_leitura_publica on storage.objects;
create policy veiculos_leitura_publica on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'veiculos');

-- ----------------------------------------------------------------------------
-- Autoconferência
-- ----------------------------------------------------------------------------
do $$
declare
  b record;
  n int;
  falhas int := 0;
begin
  select * into b from storage.buckets where id = 'veiculos';
  if b is null then
    raise exception 'ACEITE FALHOU: bucket `veiculos` não existe';
  end if;
  if not b.public then
    falhas := falhas + 1;
    raise warning 'FALHOU: o bucket precisa ser público — o card do WhatsApp não assina URL';
  end if;
  if b.file_size_limit <> 15728640 then
    falhas := falhas + 1;
    raise warning 'FALHOU: limite de tamanho inesperado (%)', b.file_size_limit;
  end if;

  -- Escrita não pode estar aberta ao anônimo: a lição de AUDITORIA §3.4.
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'veiculos_%'
     and lower(cmd) in ('insert', 'update', 'delete')
     and 'anon' = any(roles);
  if n > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % policy(ies) de escrita alcançam anon', n;
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'veiculos_%';
  if n <> 4 then
    falhas := falhas + 1;
    raise warning 'FALHOU: esperava 4 policies do bucket, achei %', n;
  end if;

  -- O diário de bordo continua PRIVADO — o bucket novo não pode ter mexido nele.
  if (select public from storage.buckets where id = 'diario-de-bordo') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o diário de bordo virou público';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no bucket de fotos', falhas;
  end if;

  raise notice 'F0-p OK: bucket `veiculos` público na leitura, escrita só de staff, diário intacto.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260829180000', 'f0p_storage_das_fotos_do_veiculo')
  on conflict (version) do nothing;
