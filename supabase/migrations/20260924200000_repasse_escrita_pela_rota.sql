-- ============================================================================
-- Repasse Motors — a escrita passa pela rota
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-24-secao-de-repasse-design.md, §4 e §5.
--
-- Decisão I4 da revisão final do PR 1. Com as policies de 20260924180000,
-- qualquer pessoa da equipe publicava um carro direto pelo PostgREST, sem
-- validador e sem checklist. As regras vivem em código testado: o checklist
-- em src/lib/checklistDoRepasse.ts; quem valida (Administrador, Gestor e
-- Comercial), as transições e os campos editáveis em
-- src/lib/transicoesDoRepasse.ts e src/lib/edicaoDoRepasse.ts. A rota do
-- painel roda o portão e grava com a chave de serviço. Aqui:
--
--   1. `authenticated` perde a escrita nas três tabelas e as policies de
--      escrita da equipe saem. A leitura da equipe fica.
--   2. A lista do repasse (inscritos e avisos) passa a ser lida só por quem
--      valida: é WhatsApp e CNPJ, e Marketing e Financeiro não avisam
--      ninguém (matriz A17, linha "Validar e publicar repasse").
--   3. Reforços no banco: arquivado e reservado têm data; fora do rascunho e
--      do arquivo, o carro tem o mínimo (laudo, histórico, FIPE, carroceria,
--      textos) e o "obrigatório quando" (detalhe de leilão e sinistro,
--      oficina e data do orçamento). O checklist do código continua sendo a
--      régua inteira — fotos e termos proibidos ficam só lá.
--
-- A tabela está vazia em produção (o PR 1 não tem tela), então os CHECKs
-- entram validados.
-- ============================================================================

drop policy if exists repasse_staff_insere on public.repasses;
drop policy if exists repasse_staff_atualiza on public.repasses;
drop policy if exists inscrito_staff_atualiza on public.repasse_inscritos;
drop policy if exists inscrito_staff_apaga on public.repasse_inscritos;
drop policy if exists aviso_staff_insere on public.repasse_avisos;
drop policy if exists aviso_staff_apaga on public.repasse_avisos;

-- O Supabase concede tudo a authenticated em tabela nova. Tirar tudo e
-- devolver só a leitura deixa o arquivo dizer o estado final, sem depender
-- de quais privilégios o default ACL deu.
revoke all on public.repasses from authenticated;
revoke all on public.repasse_inscritos from authenticated;
revoke all on public.repasse_avisos from authenticated;
grant select on public.repasses to authenticated;
grant select on public.repasse_inscritos to authenticated;
grant select on public.repasse_avisos to authenticated;

drop policy if exists inscrito_staff_le on public.repasse_inscritos;
drop policy if exists inscrito_validador_le on public.repasse_inscritos;
create policy inscrito_validador_le on public.repasse_inscritos for select to authenticated
  using (
    (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'gestor') or public.tem_papel(auth.uid(), 'comercial'))
    and org_id = public.org_padrao()
  );

drop policy if exists aviso_staff_le on public.repasse_avisos;
drop policy if exists aviso_validador_le on public.repasse_avisos;
create policy aviso_validador_le on public.repasse_avisos for select to authenticated
  using (
    (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'gestor') or public.tem_papel(auth.uid(), 'comercial'))
    and org_id = public.org_padrao()
  );

alter table public.repasses drop constraint if exists repasse_arquivado_tem_data;
alter table public.repasses add constraint repasse_arquivado_tem_data
  check (situacao <> 'arquivado' or arquivado_em is not null);

alter table public.repasses drop constraint if exists repasse_reservado_tem_data;
alter table public.repasses add constraint repasse_reservado_tem_data
  check (situacao <> 'reservado' or reservado_em is not null);

alter table public.repasses drop constraint if exists repasse_completo_fora_do_rascunho;
alter table public.repasses add constraint repasse_completo_fora_do_rascunho check (
  situacao in ('rascunho', 'arquivado') or (
    laudo is not null
    and leilao_consta is not null
    and sinistro_consta is not null
    and historico_consultado_em is not null
    and fipe_valor is not null
    and nullif(trim(fipe_mes_referencia), '') is not null
    and carroceria is not null
    and nullif(trim(resumo), '') is not null
    and nullif(trim(motivo), '') is not null
    and (leilao_consta is false or nullif(trim(leilao_detalhe), '') is not null)
    and (sinistro_consta is false or nullif(trim(sinistro_detalhe), '') is not null)
    and (sem_defeitos_conhecidos or jsonb_array_length(itens_de_estado) > 0)
    and (
      not jsonb_path_exists(itens_de_estado, '$[*] ? (@.orcamento > 0)')
      or (nullif(trim(oficina_do_orcamento), '') is not null and orcamento_em is not null)
    )
  )
);

-- ----------------------------------------------------------------------------
-- Autoconferência: privilégios, policies, e cada violação recusada PELA
-- RESTRIÇÃO CERTA (uma linha incompleta em outro campo passaria por engano).
-- ----------------------------------------------------------------------------
do $$
declare
  falhas     int := 0;
  restricao  text;
  completo   uuid;
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if exists (
      select 1
      from unnest(array['public.repasses', 'public.repasse_inscritos', 'public.repasse_avisos']) as t(tabela)
      where has_any_column_privilege('authenticated', t.tabela, 'INSERT')
         or has_any_column_privilege('authenticated', t.tabela, 'UPDATE')
         or has_table_privilege('authenticated', t.tabela, 'DELETE')
         or has_table_privilege('authenticated', t.tabela, 'TRUNCATE')
    ) then
      raise exception 'ACEITE FALHOU: authenticated ainda escreve numa tabela do repasse';
    end if;

    -- O positivo: a equipe continua lendo. Um SELECT revogado por engano
    -- apagaria o painel inteiro, e o aceite acima diria OK.
    if exists (
      select 1
      from unnest(array['public.repasses', 'public.repasse_inscritos', 'public.repasse_avisos']) as t(tabela)
      where not has_table_privilege('authenticated', t.tabela, 'SELECT')
    ) then
      raise exception 'ACEITE FALHOU: authenticated perdeu a leitura numa tabela do repasse';
    end if;
  else
    raise notice 'Papel authenticated inexistente (banco fora do Supabase): conferência de privilégio pulada.';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('repasses', 'repasse_inscritos', 'repasse_avisos')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'ACEITE FALHOU: sobrou policy de escrita numa tabela do repasse';
  end if;

  -- A leitura da lista é EXATAMENTE a das duas policies de quem valida, e
  -- nenhuma delas abre por is_staff: "tem_papel(...) or is_staff(...)"
  -- passaria num aceite que só procurasse tem_papel.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('repasse_inscritos', 'repasse_avisos')
      and cmd = 'SELECT'
      and (
        (tablename, policyname) not in (('repasse_inscritos', 'inscrito_validador_le'), ('repasse_avisos', 'aviso_validador_le'))
        or coalesce(qual, '') not like '%tem_papel%'
        or coalesce(qual, '') like '%is_staff%'
      )
  ) then
    raise exception 'ACEITE FALHOU: a lista do repasse ainda é lida por quem não valida';
  end if;

  if (
    select count(*) from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and (tablename, policyname) in (('repasse_inscritos', 'inscrito_validador_le'), ('repasse_avisos', 'aviso_validador_le'))
  ) <> 2 then
    raise exception 'ACEITE FALHOU: falta a policy de leitura de quem valida na lista do repasse';
  end if;

  -- 1. arquivado sem data
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao)
    values ('aceite-arquivado', 'T', 'T', 2020, 1, 1, 'arquivado');
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_arquivado_tem_data' then
      falhas := falhas + 1;
      raise notice 'arquivado: esperava repasse_arquivado_tem_data, veio %', restricao;
    end if;
  end;

  -- 2. reservado sem data (completo em todo o resto)
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao, lojistas_desde,
      laudo, leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
      carroceria, resumo, motivo, sem_defeitos_conhecidos)
    values ('aceite-reservado', 'T', 'T', 2020, 1, 1, 'reservado', now(),
      'nao_feito', false, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo', true);
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_reservado_tem_data' then
      falhas := falhas + 1;
      raise notice 'reservado: esperava repasse_reservado_tem_data, veio %', restricao;
    end if;
  end;

  -- 3. em validação sem laudo (completo em todo o resto)
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao,
      leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
      carroceria, resumo, motivo, sem_defeitos_conhecidos)
    values ('aceite-sem-laudo', 'T', 'T', 2020, 1, 1, 'em_validacao',
      false, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo', true);
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_completo_fora_do_rascunho' then
      falhas := falhas + 1;
      raise notice 'sem laudo: esperava repasse_completo_fora_do_rascunho, veio %', restricao;
    end if;
  end;

  -- 4. leilão consta sem o detalhe
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao,
      laudo, leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
      carroceria, resumo, motivo, sem_defeitos_conhecidos)
    values ('aceite-leilao', 'T', 'T', 2020, 1, 1, 'em_validacao',
      'nao_feito', true, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo', true);
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_completo_fora_do_rascunho' then
      falhas := falhas + 1;
      raise notice 'leilão: esperava repasse_completo_fora_do_rascunho, veio %', restricao;
    end if;
  end;

  -- 5. orçamento sem oficina
  begin
    insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao,
      laudo, leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
      carroceria, resumo, motivo, itens_de_estado)
    values ('aceite-orcamento', 'T', 'T', 2020, 1, 1, 'em_validacao',
      'nao_feito', false, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo',
      '[{"descricao":"Embreagem","local":"Câmbio","foto":null,"orcamento":1400,"estetico":false}]'::jsonb);
    falhas := falhas + 1;
  exception when check_violation then
    get stacked diagnostics restricao = constraint_name;
    if restricao <> 'repasse_completo_fora_do_rascunho' then
      falhas := falhas + 1;
      raise notice 'orçamento: esperava repasse_completo_fora_do_rascunho, veio %', restricao;
    end if;
  end;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % violação(ões) passaram ou foram barradas pela restrição errada', falhas;
  end if;

  -- Controle positivo: o carro completo entra em validação.
  insert into public.repasses (slug, marca, modelo, ano_modelo, quilometragem, preco, situacao,
    laudo, leilao_consta, sinistro_consta, historico_consultado_em, fipe_valor, fipe_mes_referencia,
    carroceria, resumo, motivo, sem_defeitos_conhecidos)
  values ('aceite-completo', 'T', 'T', 2020, 1, 1, 'em_validacao',
    'nao_feito', false, false, current_date, 1, 'setembro de 2026', 'hatch', 'Resumo', 'Motivo', true)
  returning id into completo;
  delete from public.repasses where id = completo;

  raise notice 'Repasse (escrita) OK: authenticated só lê as três tabelas, lista lida só pelas duas policies de quem valida (sem is_staff), 5 violações recusadas pela restrição certa.';
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260924200000', 'repasse_escrita_pela_rota')
  on conflict (version) do nothing;
