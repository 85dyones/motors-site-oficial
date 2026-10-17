-- ============================================================================
-- Copiloto de Mídia: o pedido de verba — uma pessoa pede, o painel aprova
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-10-14-copiloto-de-midia-design.md
-- Base: 20261014150000_copiloto_de_midia.sql (a tabela `midia_copiloto_acoes`,
-- o gatilho de transição e as funções do painel e do script).
--
-- Por quê
-- -------
-- Até aqui o banco só deixava a verba DIMINUIR
-- (`midia_copiloto_acoes_proposta_so_corta`): "aumento é decisão de quem
-- paga". Quem paga decidiu (2026-10-16): o aumento pode passar pelo Copiloto,
-- desde que nasça de uma PESSOA com o papel, passe pela MESMA aprovação de
-- hoje, seja aplicado e lido de volta pelo script, e fique na trilha. O
-- diagnóstico continua sem poder aumentar: o corte obrigatório segue de pé
-- para tudo o que vem dele.
--
-- O caminho
--   1. Administrador ou Marketing pede, no painel, a verba nova de uma
--      campanha do Google (`midia_copiloto_pedir_verba`). A verba ATUAL e o
--      nome não vêm de quem pede: são lidos de `midia_campanhas`, que a
--      sincronização de hora em hora grava — ou, logo depois de uma mudança
--      aplicada, do que o script leu de volta (a sincronização roda ANTES de
--      aplicar, e por até uma hora mostra a verba de antes).
--   2. O pedido nasce `proposta`, com a MESMA chave do diagnóstico para a
--      verba (`verba:<campanha>`, `chave` em src/lib/copilotoDeMidia.ts), e
--      passa pela aprovação de sempre (`midia_copiloto_decidir`).
--   3. O script reserva, aplica pela AdsApp e lê de volta, como qualquer ação.
--      Ele já aceita aumento até 10× a verba que espera (`mudarVerba` em
--      scripts/google-ads-script.js: `nova > esperada * 10` → falhou); o banco
--      segura o mesmo teto, para o pedido acima disso não chegar à conta.
--
-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
-- 1. `midia_copiloto_acoes` ganha `pedida_por` (uuid) e `pedida_por_nome`
--    (texto), nulas. Só o pedido as preenche.
-- 2. CHECKs: a origem passa a ser UMA de três (desfazer, pedido, diagnóstico);
--    o corte obrigatório fica só para o diagnóstico; o pedido tem o teto de
--    10×; o nome de quem pediu tem teto e não existe sem quem pediu.
-- 3. Índice único novo: UMA mudança de verba aberta por campanha, qualquer
--    que seja a chave. Sem ele, um pedido e um desfazer (chave
--    `desfazer:<id>`, que já nasce aprovado) ficavam abertos juntos para a
--    mesma campanha: a reserva entregava os dois, o script aplicava um e o
--    outro caía em "a verba mudou desde a proposta".
-- 4. O gatilho `midia_copiloto_acoes_transicao`: quem pediu entra no alvo que
--    não muda depois de proposto.
-- 5. `midia_copiloto_gravar_diagnostico` (mesma assinatura, mesmo corpo, com
--    estas mudanças):
--      * o retrato novo descarta só as propostas que vieram de diagnóstico —
--        o pedido de uma pessoa não some com os números de amanhã;
--      * mas o pedido que ninguém decidiu em uma janela inteira sai de cena:
--        parado, ele seguraria para sempre o corte da campanha;
--      * a janela de "não volta" não conta pedido RECUSADO: recusar o aumento
--        de alguém não cala o diagnóstico. Pedido APLICADO segura, sim: por
--        uma janela o diagnóstico não propõe corte na campanha cuja verba uma
--        pessoa acabou de decidir (a mesma lógica da cascata);
--      * a proposta que bate num índice único (a mesma chave aberta, ou outra
--        mudança de verba aberta na campanha) é PULADA: `on conflict do
--        nothing` sem alvo — com alvo, o conflito no índice novo derrubaria o
--        retrato inteiro.
-- 6. `midia_copiloto_pedir_verba(p_campanha, p_verba_nova, p_motivo)` — porta
--    nova do painel, no padrão das três que já existem: sessão, papel
--    conferido de novo, autoria carimbada por `auth.uid()`, trilha
--    (`copiloto_pediu`) na mesma transação. A mudança de verba ABERTA da
--    campanha, de qualquer chave: proposta é substituída (`descartada`, com o
--    nome de quem pediu); aprovada ou em aplicação — inclusive um desfazer —
--    recusa o pedido.
-- 7. `midia_copiloto_desfazer` (mesma assinatura, mesmo corpo): desfazer uma
--    mudança de verba segue a mesma regra — proposta aberta de verba da
--    campanha é substituída, aprovada ou em aplicação recusa.
-- 8. `midia_campanhas`: a campanha SINCRONIZADA deixa de aceitar escrita pela
--    sessão. Até aqui qualquer staff escrevia em qualquer linha
--    (`midia_campanhas_autenticados`, for all, 20260813120000) e a produção
--    concede ALL a authenticated: um comercial trocava o nome e a verba da
--    campanha sincronizada, e o pedido gravava o forjado na ação imutável e
--    na trilha — um nome trocado faz alguém aprovar aumento na campanha
--    errada. Agora: staff LÊ todas; INSERT, UPDATE e DELETE só em linha
--    `origem = 'manual'` (as campanhas digitadas à mão seguem como eram).
--    Quem grava a sincronizada é a chave de serviço (`midia_gravar_lote`, que
--    só ela executa, e a rota do Meta), que tem BYPASSRLS. Anon perde o
--    acesso (não lia nada, a policy é de authenticated) e authenticated perde
--    TRUNCATE, REFERENCES e TRIGGER — TRUNCATE passa por cima da RLS.
--
-- `midia_campanhas` não tem `org_id` neste banco: a loja da campanha chega
-- com a S1. Até lá a campanha é procurada pelo ID do Google (único por
-- plataforma, `midia_campanhas_plataforma_id_externo_key`) e a ação é gravada
-- na `org_padrao()`, como tudo o que o Copiloto grava.
--
-- ---------------------------------------------------------------------------
-- As regras, e quem as segura
-- ---------------------------------------------------------------------------
--   midia_copiloto_acoes_origem_do_tipo ...... exatamente uma origem:
--                                                desfaz outra ação (sem diagnóstico,
--                                                achado nem pedido); OU é pedido de
--                                                pessoa (sem diagnóstico, achado nem
--                                                desfazer, e por ora só mudar_verba);
--                                                OU vem de um diagnóstico (negativar,
--                                                pausar, mudar verba). Remover negativa
--                                                e reativar grupo só nascem desfazendo
--   midia_copiloto_acoes_proposta_so_corta ... verba que vem do DIAGNÓSTICO só diminui;
--                                                o pedido e o desfazer podem subir
--   midia_copiloto_acoes_pedido_na_faixa ..... o pedido vai até 10× a verba atual —
--                                                o teto do script
--   midia_copiloto_acoes_pedido_carimbado .... nome de quem pediu só com quem pediu,
--                                                de 1 a 200 caracteres
--   midia_copiloto_acoes_uma_verba_aberta .... índice único: uma mudança de verba
--                                                aberta (proposta, aprovada, em
--                                                aplicação) por loja e campanha
--   midia_copiloto_acoes_transicao (gatilho) . pedida_por e pedida_por_nome não mudam
--                                                depois de proposto; o pedido nasce
--                                                proposta
--   midia_copiloto_acoes_chave_aberta (índice, da 20261014150000) . pedido e
--                                                diagnóstico dividem verba:<campanha>
--   midia_campanhas_leitura / _manual_* ...... staff lê; só a manual se escreve
--
-- As linhas que já existem passam nos CHECKs novos: todas têm `pedida_por`
-- nulo, e com ele nulo cada regra nova é a antiga (origem: desfazer sem
-- diagnóstico nem achado, ou diagnóstico; corte: o mesmo; teto e nome:
-- vazios). O índice novo valida a tabela ao nascer; a conferência prévia
-- (seção 0) para a migração ANTES, dizendo qual campanha tem duas mudanças
-- de verba abertas, se houver — o caso possível é um desfazer aprovado e uma
-- proposta do diagnóstico para a mesma campanha. Decide-se no painel e aplica-se
-- de novo.
--
-- Quem lê e quem escreve no Copiloto: nada muda. As colunas novas entram na
-- policy de leitura que já existe (Administrador e Marketing); ninguém
-- escreve direto; a porta nova é de `authenticated` e confere o papel.
--
-- ---------------------------------------------------------------------------
-- Ordem de implantação (a migração NÃO foi aplicada em produção pelo PR)
-- ---------------------------------------------------------------------------
--   1. aplicar esta migração;  2. publicar o site (a rota
--   `/api/marketing/copiloto/verba`, que chama `midia_copiloto_pedir_verba`, e
--   a tela, que lê `pedida_por_nome`). O script da conta não muda.
--   Site antes da migração: a lista de propostas pede uma coluna que não
--   existe e o painel do Copiloto para de carregar — por isso a migração vem
--   primeiro. Migração antes do site: nada muda para ninguém até o site sair,
--   exceto que a campanha sincronizada deixa de ser editável pela sessão (o
--   site não a edita).
--
-- ⚠️ DESFAZER. Fechar a porta é o desfazer seguro — os pedidos que existirem
--    continuam válidos, o script segue aplicando os aprovados, e o índice, o
--    desfazer novo e a policy de midia_campanhas ficam (protegem com ou sem
--    pedido):
--
--   begin;
--   drop function if exists public.midia_copiloto_pedir_verba(text, numeric, text);
--   delete from supabase_migrations.schema_migrations where version = '20261016200000';
--   commit;
--
--    O desfazer inteiro só cabe SEM pedido gravado (os CHECKs antigos recusam
--    o pedido, e ação do copiloto não se apaga):
--      select count(*) from public.midia_copiloto_acoes where pedida_por is not null;  -- precisa dar 0
--    e, nessa ordem — o corpo novo do gatilho e da gravação lê `pedida_por`,
--    então ele sai ANTES das colunas:
--
--   begin;
--   drop function if exists public.midia_copiloto_pedir_verba(text, numeric, text);
--   -- recriar, com o texto da 20261014150000 (seções 3, 5c e 6a), por
--   -- `create or replace`: public.midia_copiloto_acoes_transicao(),
--   -- public.midia_copiloto_desfazer(uuid) e
--   -- public.midia_copiloto_gravar_diagnostico(jsonb);
--   drop index if exists public.midia_copiloto_acoes_uma_verba_aberta;
--   alter table public.midia_copiloto_acoes
--     drop constraint if exists midia_copiloto_acoes_pedido_na_faixa,
--     drop constraint if exists midia_copiloto_acoes_pedido_carimbado,
--     drop constraint if exists midia_copiloto_acoes_origem_do_tipo,
--     drop constraint if exists midia_copiloto_acoes_proposta_so_corta;
--   alter table public.midia_copiloto_acoes
--     add constraint midia_copiloto_acoes_origem_do_tipo check (
--       case when desfaz_acao_id is null
--            then diagnostico_id is not null and tipo not in ('remover_negativa', 'reativar_grupo')
--            else diagnostico_id is null and achado_id is null end),
--     add constraint midia_copiloto_acoes_proposta_so_corta check (
--       desfaz_acao_id is not null or verba_nova is null or verba_nova < verba_atual);
--   alter table public.midia_copiloto_acoes
--     drop column if exists pedida_por_nome, drop column if exists pedida_por;
--   -- e os comentários de midia_copiloto_acoes, de midia_copiloto_acoes.chave e
--   -- de midia_copiloto_desfazer, com o texto da 20261014150000 (seção 7);
--   delete from supabase_migrations.schema_migrations where version = '20261016200000';
--   commit;
--
--    A policy de midia_campanhas (seção 7) fecha um buraco que existia antes
--    do pedido; nenhum dos dois desfazeres a reverte. Voltar à forma antiga
--    devolve a qualquer staff a escrita na campanha sincronizada — só se for
--    preciso:
--
--   begin;
--   drop policy if exists midia_campanhas_leitura on public.midia_campanhas;
--   drop policy if exists midia_campanhas_manual_inclusao on public.midia_campanhas;
--   drop policy if exists midia_campanhas_manual_edicao on public.midia_campanhas;
--   drop policy if exists midia_campanhas_manual_exclusao on public.midia_campanhas;
--   create policy midia_campanhas_autenticados on public.midia_campanhas
--     for all to authenticated
--     using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
--   grant all on public.midia_campanhas to anon, authenticated;
--   commit;
--
--    A trilha em auditoria_admin (copiloto_pediu) fica em todos os casos.
--
-- Aditiva (duas colunas nulas; dois CHECKs trocados por versões que só
-- ALARGAM o que passa, e dois novos que nada do que existe viola; um índice
-- único que a conferência prévia garante; o gatilho, a gravação do retrato e
-- o desfazer com o mesmo nome e a mesma assinatura; uma função nova; a
-- policy de `midia_campanhas` trocada por quatro mais estreitas; `auditoria_admin`
-- só recebe linhas; `leads` e `estoque_motors` não são tocadas) e
-- idempotente: `add column if not exists`, `drop constraint if exists` + `add
-- constraint`, `create unique index if not exists`, `create or replace`,
-- `drop policy if exists` + `create policy`, revoke/grant e comment
-- reaplicáveis.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ----------------------------------------------------------------------------
do $previa$
declare
  v_duas text;
begin
  if to_regclass('public.midia_copiloto_acoes') is null
     or to_regprocedure('public.midia_copiloto_decidir(uuid[], text, text)') is null
     or to_regprocedure('public.midia_copiloto_desfazer(uuid)') is null
     or to_regprocedure('public.midia_copiloto_descrever(public.midia_copiloto_acoes)') is null then
    raise exception
      'DEPENDÊNCIA: falta o Copiloto de Mídia (20261014150000): midia_copiloto_acoes, midia_copiloto_decidir, midia_copiloto_desfazer ou midia_copiloto_descrever. Nada foi aplicado.';
  end if;
  if to_regclass('public.midia_campanhas') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'midia_campanhas'
                       and column_name = 'sincronizado_em') then
    raise exception
      'DEPENDÊNCIA: public.midia_campanhas sincronizada (20260924120000) não existe. Nada foi aplicado.';
  end if;
  if to_regprocedure('public.tem_papel(uuid, text)') is null
     or to_regprocedure('public.is_staff(uuid)') is null
     or public.org_padrao() is null then
    raise exception
      'DEPENDÊNCIA: falta tem_papel(uuid, text) ou is_staff(uuid), ou org_padrao() devolveu null. Nada foi aplicado.';
  end if;

  -- O índice "uma mudança de verba aberta por campanha" valida a tabela ao
  -- nascer. Se já houver duas, para aqui, dizendo onde — antes de mudar nada.
  select string_agg(format('%s (%s abertas)', campanha_id_externo, n), ', ' order by campanha_id_externo)
    into v_duas
    from (select campanha_id_externo, count(*) as n
            from public.midia_copiloto_acoes
           where tipo = 'mudar_verba' and situacao in ('proposta', 'aprovada', 'em_aplicacao')
           group by org_id, campanha_id_externo
          having count(*) > 1) d;
  if v_duas is not null then
    raise exception
      'CONFLITO: campanha(s) com mais de uma mudança de verba aberta: %. Recuse a proposta (ou desista da aprovada) no painel até sobrar uma por campanha, e aplique de novo. Nada foi aplicado.', v_duas;
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. Quem pediu
-- ----------------------------------------------------------------------------
alter table public.midia_copiloto_acoes
  add column if not exists pedida_por      uuid,
  add column if not exists pedida_por_nome text;


-- ----------------------------------------------------------------------------
-- 2. As regras
-- ----------------------------------------------------------------------------
alter table public.midia_copiloto_acoes
  drop constraint if exists midia_copiloto_acoes_origem_do_tipo,
  drop constraint if exists midia_copiloto_acoes_proposta_so_corta,
  drop constraint if exists midia_copiloto_acoes_pedido_na_faixa,
  drop constraint if exists midia_copiloto_acoes_pedido_carimbado;
alter table public.midia_copiloto_acoes
  add constraint midia_copiloto_acoes_origem_do_tipo check (
    case
      when desfaz_acao_id is not null then
        diagnostico_id is null and achado_id is null and pedida_por is null
      when pedida_por is not null then
        diagnostico_id is null and achado_id is null and tipo = 'mudar_verba'
      else
        diagnostico_id is not null and tipo not in ('remover_negativa', 'reativar_grupo')
    end),
  add constraint midia_copiloto_acoes_proposta_so_corta check (
    desfaz_acao_id is not null or pedida_por is not null or verba_nova is null or verba_nova < verba_atual),
  add constraint midia_copiloto_acoes_pedido_na_faixa check (
    pedida_por is null or verba_nova <= verba_atual * 10),
  add constraint midia_copiloto_acoes_pedido_carimbado check (
    pedida_por_nome is null or (pedida_por is not null and char_length(pedida_por_nome) between 1 and 200));

-- Uma mudança de verba aberta por campanha, venha de onde vier (diagnóstico,
-- pedido ou desfazer — cada um com a sua chave). Duas abertas = o script
-- aplica uma e a outra cai em "a verba mudou desde a proposta".
create unique index if not exists midia_copiloto_acoes_uma_verba_aberta
  on public.midia_copiloto_acoes (org_id, campanha_id_externo)
  where tipo = 'mudar_verba' and situacao in ('proposta', 'aprovada', 'em_aplicacao');


-- ----------------------------------------------------------------------------
-- 3. O gatilho: quem pediu também não muda depois de proposto
-- ----------------------------------------------------------------------------
create or replace function public.midia_copiloto_acoes_transicao()
  returns trigger
  language plpgsql
  set search_path = public
as $fn$
declare
  v_origem public.midia_copiloto_acoes;
begin
  if tg_op = 'DELETE' then
    raise exception 'Ação do copiloto não se apaga: ela é o registro do que mudou na conta do Google Ads.'
      using errcode = 'raise_exception';
  end if;

  if tg_op = 'INSERT' then
    -- O que vem do diagnóstico e o que uma pessoa pede nascem propostos: quem
    -- aprova é uma pessoa, pelo painel.
    if new.desfaz_acao_id is null then
      if new.situacao <> 'proposta' then
        raise exception 'Ação do copiloto nasce proposta (veio %): quem aprova é uma pessoa, pelo painel.', new.situacao
          using errcode = 'raise_exception';
      end if;
      return new;
    end if;

    -- O desfazer: nasce aprovado (quem clica é quem aprova) e espelha a ação
    -- aplicada — o inverso dela, no mesmo alvo. É por aqui, e só por aqui, que
    -- uma negativa pode ser removida.
    if new.situacao <> 'aprovada' then
      raise exception 'O desfazer nasce aprovado (veio %).', new.situacao using errcode = 'raise_exception';
    end if;
    select * into v_origem from public.midia_copiloto_acoes where id = new.desfaz_acao_id;
    if not found or v_origem.situacao <> 'aplicada' or v_origem.org_id <> new.org_id then
      raise exception 'Só se desfaz ação aplicada da mesma loja.' using errcode = 'raise_exception';
    end if;
    if new.tipo is distinct from (case v_origem.tipo
                                    when 'negativar'        then 'remover_negativa'
                                    when 'remover_negativa' then 'negativar'
                                    when 'pausar_grupo'     then 'reativar_grupo'
                                    when 'reativar_grupo'   then 'pausar_grupo'
                                    when 'mudar_verba'      then 'mudar_verba'
                                  end)
       or new.campanha_id_externo is distinct from v_origem.campanha_id_externo
       or new.grupo_id_externo    is distinct from v_origem.grupo_id_externo
       or new.texto               is distinct from v_origem.texto
       or new.correspondencia     is distinct from v_origem.correspondencia
       or (v_origem.tipo = 'mudar_verba'
           and (new.verba_atual is distinct from v_origem.verba_nova
                or new.verba_nova is distinct from v_origem.verba_atual)) then
      raise exception 'O desfazer tem de ser o inverso exato da ação %.', v_origem.id using errcode = 'raise_exception';
    end if;
    return new;
  end if;

  -- UPDATE: o alvo, a origem e quem pediu não mudam depois de propostos.
  if (new.org_id, new.diagnostico_id, new.achado_id, new.desfaz_acao_id, new.chave, new.tipo,
      new.campanha_id_externo, new.campanha_nome, new.grupo_id_externo, new.grupo_nome,
      new.texto, new.correspondencia, new.verba_atual, new.verba_nova, new.motivo,
      new.economia_7d, new.evidencias, new.proposta_em, new.pedida_por, new.pedida_por_nome)
     is distinct from
     (old.org_id, old.diagnostico_id, old.achado_id, old.desfaz_acao_id, old.chave, old.tipo,
      old.campanha_id_externo, old.campanha_nome, old.grupo_id_externo, old.grupo_nome,
      old.texto, old.correspondencia, old.verba_atual, old.verba_nova, old.motivo,
      old.economia_7d, old.evidencias, old.proposta_em, old.pedida_por, old.pedida_por_nome) then
    raise exception 'O alvo de uma ação do copiloto não muda depois de proposto: o que foi aprovado é o que é aplicado.'
      using errcode = 'raise_exception';
  end if;

  if not ((old.situacao, new.situacao) in (
            ('proposta', 'aprovada'), ('proposta', 'recusada'), ('proposta', 'descartada'),
            ('aprovada', 'em_aplicacao'), ('aprovada', 'recusada'),
            ('em_aplicacao', 'em_aplicacao'),
            ('em_aplicacao', 'aplicada'), ('em_aplicacao', 'falhou'), ('em_aplicacao', 'sem_efeito'))) then
    raise exception 'Ação do copiloto não vai de % para %.', old.situacao, new.situacao
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$fn$;

create or replace trigger midia_copiloto_acoes_transicao
  before insert or update or delete on public.midia_copiloto_acoes
  for each row execute function public.midia_copiloto_acoes_transicao();


-- ----------------------------------------------------------------------------
-- 4. A gravação do retrato: o pedido de uma pessoa não some com o retrato
--    novo (mas não fica parado para sempre)
-- ----------------------------------------------------------------------------
create or replace function public.midia_copiloto_gravar_diagnostico(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_org          uuid := public.org_padrao();
  v_de           date;
  v_ate          date;
  v_janela       interval;
  v_diag         uuid;
  v_achados      uuid[] := '{}';
  v_id           uuid;
  x              jsonb;
  v_indice       integer;
  v_descartadas  integer := 0;
  v_propostas    integer := 0;
  v_puladas      integer := 0;
  v_ins          integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Diagnóstico precisa ser um objeto JSON.' using errcode = '22023';
  end if;
  begin
    v_de  := (p->>'de')::date;
    v_ate := (p->>'ate')::date;
  exception when others then
    raise exception 'Janela do diagnóstico inválida: % a %.', p->>'de', p->>'ate' using errcode = '22023';
  end;
  if v_de is null or v_ate is null then
    raise exception 'Diagnóstico sem janela.' using errcode = '22023';
  end if;
  v_janela := ((v_ate - v_de) + 1) * interval '1 day';

  insert into public.midia_copiloto_diagnosticos (org_id, conta, de, ate, previa, dados, resumo, erros)
  values (v_org, coalesce(nullif(btrim(p->>'conta'), ''), '?'), v_de, v_ate,
          coalesce((p->>'previa')::boolean, false),
          coalesce(p->'dados', '{}'::jsonb), coalesce(p->'resumo', '{}'::jsonb),
          coalesce(p->'erros', '{}'::jsonb))
  returning id into v_diag;

  for x, v_indice in
    select e, (n - 1)::int from jsonb_array_elements(coalesce(p->'achados', '[]'::jsonb)) with ordinality as t(e, n)
  loop
    insert into public.midia_copiloto_achados
      (org_id, diagnostico_id, ordem, regra, grupo, gravidade, titulo, detalhe, evidencias)
    values (v_org, v_diag, v_indice, x->>'regra', nullif(x->>'grupo', ''), x->>'gravidade',
            x->>'titulo', coalesce(x->>'detalhe', ''), coalesce(x->'evidencias', '{}'::jsonb))
    returning id into v_id;
    v_achados := v_achados || v_id;
  end loop;

  -- O que ninguém decidiu ainda tem os números de ontem: sai de cena. A
  -- prévia ("Visualizar" no Google Ads) não tira nada de cena: quem clicou
  -- estava testando a instalação, e alguém pode estar revisando as propostas.
  -- O pedido de uma pessoa (sem diagnóstico) fica: os números dele não são de
  -- retrato nenhum. Mas o pedido que ninguém decidiu em uma janela inteira
  -- sai — parado, ele seguraria para sempre o corte daquela campanha.
  if not coalesce((p->>'previa')::boolean, false) then
    update public.midia_copiloto_acoes
       set situacao = 'descartada',
           descartada_motivo = format('Substituída pelo diagnóstico de %s a %s.',
                                      to_char(v_de, 'DD/MM'), to_char(v_ate, 'DD/MM'))
     where org_id = v_org and situacao = 'proposta' and diagnostico_id is not null;
    get diagnostics v_descartadas = row_count;

    update public.midia_copiloto_acoes
       set situacao = 'descartada',
           descartada_motivo = format('Pedido sem decisão por %s dias; o diagnóstico volta a propor para a campanha.',
                                      floor(extract(epoch from (now() - proposta_em)) / 86400)::int)
     where org_id = v_org and situacao = 'proposta' and pedida_por is not null
       and proposta_em < now() - v_janela;
    get diagnostics v_ins = row_count;
    v_descartadas := v_descartadas + v_ins;
  end if;

  for x in select e from jsonb_array_elements(coalesce(p->'propostas', '[]'::jsonb)) as t(e) loop
    v_indice := (x->>'achado')::int;
    if v_indice is null or v_indice < 0 or v_indice >= coalesce(cardinality(v_achados), 0) then
      raise exception 'Proposta % aponta para o achado %, que não existe.', x->>'chave', x->>'achado'
        using errcode = '22023';
    end if;

    -- Aplicada, ou recusada, há menos de uma janela: não volta. O pedido
    -- RECUSADO não conta — recusar o aumento de alguém não cala o diagnóstico;
    -- o pedido APLICADO conta: a verba que uma pessoa acabou de decidir não
    -- leva corte no dia seguinte.
    if exists (select 1 from public.midia_copiloto_acoes a
                where a.org_id = v_org and a.chave = x->>'chave'
                  and ((a.situacao in ('aplicada', 'sem_efeito') and a.concluida_em > now() - v_janela)
                       or (a.situacao = 'recusada' and a.pedida_por is null
                           and a.decidida_em > now() - v_janela))) then
      v_puladas := v_puladas + 1;
      continue;
    end if;

    -- `on conflict do nothing` SEM alvo: dois índices únicos podem recusar a
    -- proposta — a mesma chave aberta (`midia_copiloto_acoes_chave_aberta`) e
    -- outra mudança de verba aberta na campanha, de outra chave, como um
    -- desfazer aprovado (`midia_copiloto_acoes_uma_verba_aberta`). Com alvo,
    -- o conflito no segundo derrubaria o retrato inteiro; sem alvo, a
    -- proposta é pulada e contada em `puladas`.
    insert into public.midia_copiloto_acoes
      (org_id, diagnostico_id, achado_id, chave, tipo, campanha_id_externo, campanha_nome,
       grupo_id_externo, grupo_nome, texto, correspondencia, verba_atual, verba_nova,
       motivo, economia_7d, evidencias)
    values
      (v_org, v_diag, v_achados[v_indice + 1], x->>'chave', x->>'tipo',
       x->>'campanha_id_externo', x->>'campanha_nome',
       nullif(x->>'grupo_id_externo', ''), nullif(x->>'grupo_nome', ''),
       nullif(x->>'texto', ''), nullif(x->>'correspondencia', ''),
       (x->>'verba_atual')::numeric, (x->>'verba_nova')::numeric,
       x->>'motivo', (x->>'economia_7d')::numeric, coalesce(x->'evidencias', '{}'::jsonb))
    on conflict do nothing;
    get diagnostics v_ins = row_count;
    if v_ins = 1 then v_propostas := v_propostas + 1; else v_puladas := v_puladas + 1; end if;
  end loop;

  return jsonb_build_object(
    'diagnostico', v_diag,
    'achados', coalesce(cardinality(v_achados), 0),
    'propostas', v_propostas,
    'puladas', v_puladas,
    'descartadas', v_descartadas);
end;
$fn$;

-- Os privilégios da 20261014150000, reafirmados: o `create or replace`
-- preserva, e reafirmar deixa o arquivo valer sozinho.
revoke all on function public.midia_copiloto_gravar_diagnostico(jsonb) from public, anon, authenticated;
grant execute on function public.midia_copiloto_gravar_diagnostico(jsonb) to service_role;
revoke all on function public.midia_copiloto_acoes_transicao() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. A porta nova do painel: pedir a verba de uma campanha
-- ----------------------------------------------------------------------------
-- Sessão, papel conferido de novo (a rota já conferiu a matriz), autoria por
-- `auth.uid()`, a verba de hoje lida da sincronização (ou do que o script leu
-- de volta, se for mais novo), e a trilha na mesma transação. Devolve o id da
-- ação proposta.
create or replace function public.midia_copiloto_pedir_verba(
  p_campanha    text,
  p_verba_nova  numeric,
  p_motivo      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem        uuid := auth.uid();
  v_org         uuid := public.org_padrao();
  v_nome        text;
  v_motivo      text := nullif(btrim(coalesce(p_motivo, ''), E' \t\r\n'), '');
  v_chave       text;
  v_camp_nome   text;
  v_atual       numeric;
  v_situacao    text;
  v_lida_em     timestamptz;
  v_lida_de     text := 'sincronizacao';
  v_aplicada_em timestamptz;
  v_lido        jsonb;
  v_aberta      public.midia_copiloto_acoes;
  v_nova        public.midia_copiloto_acoes;
begin
  if v_quem is null then
    raise exception 'Pedido de verba sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;
  if not (public.tem_papel(v_quem, 'admin') or public.tem_papel(v_quem, 'marketing')) then
    raise exception 'Só Administrador ou Marketing pedem mudança de verba pelo copiloto (matriz A17, "Aprovar mudanças do Copiloto de Mídia").'
      using errcode = '42501';
  end if;
  if p_campanha is null or p_campanha !~ '^[0-9]{1,20}$' then
    raise exception 'A campanha é o ID numérico dela no Google Ads (veio %).', coalesce(p_campanha, 'nada')
      using errcode = '22023';
  end if;
  if p_verba_nova is null or p_verba_nova <= 0 or p_verba_nova > 100000
     or p_verba_nova <> round(p_verba_nova, 2) then
    raise exception 'Verba nova é por dia, acima de zero, até R$ 100.000 e com até 2 casas (veio %).',
      coalesce(p_verba_nova::text, 'nada')
      using errcode = '22023';
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'O motivo do pedido vai até 500 caracteres (veio com %).', char_length(v_motivo)
      using errcode = '22023';
  end if;

  -- A verba de hoje e o nome vêm da sincronização, nunca de quem pede.
  -- `midia_campanhas` não tem `org_id` (S1): a campanha é achada pelo ID do
  -- Google, único por plataforma; a sincronizada só a chave de serviço
  -- escreve (seção 7).
  select nome, orcamento_diario, situacao, sincronizado_em
    into v_camp_nome, v_atual, v_situacao, v_lida_em
    from public.midia_campanhas
   where plataforma = 'google' and id_externo = p_campanha;
  if not found or v_situacao = 'encerrada' then
    raise exception 'A campanha % não está entre as do Google Ads sincronizadas, ou foi encerrada.', p_campanha
      using errcode = 'P0002';
  end if;

  -- O script sincroniza ANTES de aplicar: por até uma hora depois de uma
  -- mudança aplicada, `midia_campanhas` mostra a verba de antes, e o pedido
  -- feito nessa hora cairia sempre em "a verba mudou". Se a última mudança de
  -- verba APLICADA na campanha é mais nova que a sincronização, vale o que o
  -- script leu de volta.
  select a.concluida_em, a.lido_de_volta
    into v_aplicada_em, v_lido
    from public.midia_copiloto_acoes a
   where a.org_id = v_org and a.campanha_id_externo = p_campanha
     and a.tipo = 'mudar_verba' and a.situacao = 'aplicada'
   order by a.concluida_em desc
   limit 1;
  if found and jsonb_typeof(v_lido->'verba') = 'number'
     and (v_lida_em is null or v_aplicada_em > v_lida_em) then
    v_atual   := round((v_lido->>'verba')::numeric, 2);
    v_lida_em := v_aplicada_em;
    v_lida_de := 'aplicacao';
  end if;

  if v_atual is null or v_atual <= 0 then
    raise exception 'A sincronização ainda não trouxe a verba desta campanha (%); espere a próxima rodada, de hora em hora.', p_campanha
      using errcode = '22023';
  end if;
  if v_atual > 100000 then
    raise exception 'A verba desta campanha (R$ % por dia) passa do teto que o copiloto conhece (R$ 100.000); mude pelo Google Ads.',
      replace(to_char(v_atual, 'FM999999990.00'), '.', ',')
      using errcode = '22023';
  end if;
  if p_verba_nova = v_atual then
    raise exception 'A verba já é essa: R$ % por dia.', replace(to_char(v_atual, 'FM999999990.00'), '.', ',')
      using errcode = '22023';
  end if;
  -- O teto do script (`mudarVerba`): acima de 10× a verba esperada, falhou.
  -- O CHECK `midia_copiloto_acoes_pedido_na_faixa` seguraria; a mensagem é
  -- para quem pediu entender.
  if p_verba_nova > v_atual * 10 then
    raise exception 'O copiloto sobe a verba até 10 vezes a de hoje: de R$ %, no máximo R$ % por dia. Acima disso, mude pelo Google Ads.',
      replace(to_char(v_atual, 'FM999999990.00'), '.', ','),
      replace(to_char(v_atual * 10, 'FM999999990.00'), '.', ',')
      using errcode = '22023';
  end if;
  v_camp_nome := left(coalesce(nullif(btrim(v_camp_nome), ''), 'Campanha ' || p_campanha), 300);

  select left(nullif(btrim(full_name), ''), 200) into v_nome from public.profiles where id = v_quem;
  v_chave := 'verba:' || p_campanha;

  -- A mudança de verba aberta da campanha, nesta loja, de QUALQUER chave
  -- (diagnóstico, outro pedido, desfazer), travada — o índice
  -- `midia_copiloto_acoes_uma_verba_aberta` garante que é uma só. Proposta
  -- sai de cena; aprovada ou em aplicação, o pedido espera.
  select * into v_aberta
    from public.midia_copiloto_acoes
   where org_id = v_org and campanha_id_externo = p_campanha and tipo = 'mudar_verba'
     and situacao in ('proposta', 'aprovada', 'em_aplicacao')
   for update;
  if found then
    if v_aberta.situacao = 'aprovada' and v_aberta.desfaz_acao_id is not null then
      raise exception 'Há um desfazer de verba aprovado para esta campanha esperando o script; desista dele ou espere a rodada.'
        using errcode = '22023';
    elsif v_aberta.situacao = 'aprovada' then
      raise exception 'Já há uma mudança de verba aprovada para esta campanha esperando o script; desista dela ou espere a rodada.'
        using errcode = '22023';
    elsif v_aberta.situacao = 'em_aplicacao' then
      raise exception 'O script já está aplicando uma mudança de verba nesta campanha; espere o resultado da rodada.'
        using errcode = '22023';
    end if;
    update public.midia_copiloto_acoes
       set situacao = 'descartada',
           descartada_motivo = left(format('Substituída pelo pedido de %s.', coalesce(v_nome, 'alguém da equipe')), 300)
     where id = v_aberta.id;
  end if;

  begin
    insert into public.midia_copiloto_acoes
      (org_id, chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova,
       motivo, evidencias, situacao, pedida_por, pedida_por_nome)
    values
      (v_org, v_chave, 'mudar_verba', p_campanha, v_camp_nome, v_atual, p_verba_nova,
       left('Pedido de ' || coalesce(v_nome, 'alguém da equipe') || coalesce(': ' || v_motivo, '.'), 1000),
       jsonb_build_object('origem', 'pedido', 'verbaLidaDe', v_lida_de, 'verbaLidaEm', v_lida_em),
       'proposta', v_quem, v_nome)
    returning * into v_nova;
  exception when unique_violation then
    -- Dois pedidos (ou um pedido e o retrato, ou um desfazer) ao mesmo tempo:
    -- o outro entrou primeiro.
    raise exception 'Outra mudança de verba para esta campanha acabou de entrar; recarregue e confira antes de pedir de novo.'
      using errcode = '22023';
  end;

  insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
  values ('copiloto_pediu',
          format('Pedido: %s (ação %s)', public.midia_copiloto_descrever(v_nova), v_nova.id),
          v_quem, v_nome);

  return v_nova.id;
end;
$fn$;

revoke all on function public.midia_copiloto_pedir_verba(text, numeric, text) from public, anon;
grant execute on function public.midia_copiloto_pedir_verba(text, numeric, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. Desfazer: com verba, a mesma regra do pedido
-- ----------------------------------------------------------------------------
-- O corpo da 20261014150000 (5c), com uma mudança: desfazer uma mudança de
-- verba respeita "uma aberta por campanha" — a proposta aberta de verba da
-- campanha (do diagnóstico ou de um pedido) sai de cena com o nome de quem
-- desfez; a aprovada ou em aplicação recusa o desfazer.
create or replace function public.midia_copiloto_desfazer(p_acao uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem    uuid := auth.uid();
  v_nome    text;
  v_id      uuid;
  a         public.midia_copiloto_acoes;
  v_aberta  public.midia_copiloto_acoes;
begin
  if v_quem is null then
    raise exception 'Desfazer sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;
  if not (public.tem_papel(v_quem, 'admin') or public.tem_papel(v_quem, 'marketing')) then
    raise exception 'Só Administrador ou Marketing desfazem mudanças do copiloto (matriz A17).'
      using errcode = '42501';
  end if;
  select * into a from public.midia_copiloto_acoes
   where id = p_acao and org_id = public.org_padrao()
   for update;
  if not found then
    raise exception 'Ação % não encontrada.', p_acao using errcode = 'P0002';
  end if;
  if a.situacao <> 'aplicada' then
    raise exception 'Só se desfaz o que foi aplicado (esta está %).', a.situacao using errcode = '22023';
  end if;
  if exists (select 1 from public.midia_copiloto_acoes
              where desfaz_acao_id = a.id
                and situacao in ('aprovada', 'em_aplicacao', 'aplicada', 'sem_efeito')) then
    raise exception 'Esta ação já foi desfeita (ou o desfazer está a caminho).' using errcode = '22023';
  end if;
  select nullif(btrim(full_name), '') into v_nome from public.profiles where id = v_quem;

  -- Verba: uma mudança aberta por campanha (`midia_copiloto_acoes_uma_verba_aberta`).
  if a.tipo = 'mudar_verba' then
    select * into v_aberta
      from public.midia_copiloto_acoes
     where org_id = a.org_id and campanha_id_externo = a.campanha_id_externo and tipo = 'mudar_verba'
       and situacao in ('proposta', 'aprovada', 'em_aplicacao')
     for update;
    if found then
      if v_aberta.situacao = 'aprovada' then
        raise exception 'Já há uma mudança de verba aprovada para esta campanha esperando o script; desista dela ou espere a rodada antes de desfazer.'
          using errcode = '22023';
      elsif v_aberta.situacao = 'em_aplicacao' then
        raise exception 'O script já está aplicando uma mudança de verba nesta campanha; espere o resultado da rodada antes de desfazer.'
          using errcode = '22023';
      end if;
      update public.midia_copiloto_acoes
         set situacao = 'descartada',
             descartada_motivo = left(format('Substituída pelo desfazer de %s.', coalesce(v_nome, 'alguém da equipe')), 300)
       where id = v_aberta.id;
    end if;
  end if;

  begin
    insert into public.midia_copiloto_acoes
      (org_id, desfaz_acao_id, chave, tipo, campanha_id_externo, campanha_nome,
       grupo_id_externo, grupo_nome, texto, correspondencia, verba_atual, verba_nova,
       motivo, situacao, decidida_por, decidida_por_nome, decidida_em)
    values
      (a.org_id, a.id, 'desfazer:' || a.id,
       case a.tipo
         when 'negativar'        then 'remover_negativa'
         when 'remover_negativa' then 'negativar'
         when 'pausar_grupo'     then 'reativar_grupo'
         when 'reativar_grupo'   then 'pausar_grupo'
         when 'mudar_verba'      then 'mudar_verba'
       end,
       a.campanha_id_externo, a.campanha_nome, a.grupo_id_externo, a.grupo_nome,
       a.texto, a.correspondencia,
       case when a.tipo = 'mudar_verba' then a.verba_nova end,
       case when a.tipo = 'mudar_verba' then a.verba_atual end,
       left('Desfaz: ' || public.midia_copiloto_descrever(a), 1000),
       'aprovada', v_quem, v_nome, now())
    returning id into v_id;
  exception when unique_violation then
    -- Outro desfazer da mesma ação, ou outra mudança de verba da campanha,
    -- entrou ao mesmo tempo.
    raise exception 'Outra mudança para este alvo acabou de entrar; recarregue e confira antes de desfazer.'
      using errcode = '22023';
  end;

  insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
  values ('copiloto_desfez', format('Desfazer: %s (ação %s → %s)', public.midia_copiloto_descrever(a), a.id, v_id),
          v_quem, v_nome);
  return v_id;
end;
$fn$;

revoke all on function public.midia_copiloto_desfazer(uuid) from public, anon;
grant execute on function public.midia_copiloto_desfazer(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 7. midia_campanhas: a sincronizada é da sincronização
-- ----------------------------------------------------------------------------
-- O pedido lê daqui o nome e a verba de hoje. A policy antiga (for all,
-- staff) deixava qualquer staff reescrever a campanha sincronizada. Quem a
-- grava é a chave de serviço (`midia_gravar_lote`, executável só por ela, e a
-- rota do Meta), com BYPASSRLS — nenhuma policy a atinge. A manual
-- (`origem = 'manual'`, digitada no painel) segue de staff, para ler e
-- escrever; a linha não vira sincronizada pela sessão (WITH CHECK).
drop policy if exists midia_campanhas_autenticados on public.midia_campanhas;
drop policy if exists midia_campanhas_leitura on public.midia_campanhas;
drop policy if exists midia_campanhas_manual_inclusao on public.midia_campanhas;
drop policy if exists midia_campanhas_manual_edicao on public.midia_campanhas;
drop policy if exists midia_campanhas_manual_exclusao on public.midia_campanhas;

create policy midia_campanhas_leitura on public.midia_campanhas
  for select to authenticated
  using (public.is_staff(auth.uid()));
create policy midia_campanhas_manual_inclusao on public.midia_campanhas
  for insert to authenticated
  with check (public.is_staff(auth.uid()) and origem = 'manual');
create policy midia_campanhas_manual_edicao on public.midia_campanhas
  for update to authenticated
  using (public.is_staff(auth.uid()) and origem = 'manual')
  with check (public.is_staff(auth.uid()) and origem = 'manual');
create policy midia_campanhas_manual_exclusao on public.midia_campanhas
  for delete to authenticated
  using (public.is_staff(auth.uid()) and origem = 'manual');

-- TRUNCATE passa por cima da RLS; anon não lia nada (as policies são de
-- authenticated) e deixa de ter o privilégio.
revoke all on public.midia_campanhas from anon;
revoke truncate, references, trigger on public.midia_campanhas from authenticated;
grant select, insert, update, delete on public.midia_campanhas to authenticated;


-- ----------------------------------------------------------------------------
-- 8. Para quem abrir o banco sem abrir o código
-- ----------------------------------------------------------------------------
comment on table public.midia_copiloto_acoes is
  'Propostas e ações do Copiloto de Mídia na conta do Google Ads: negativar, '
  'remover negativa (só como desfazer), pausar e reativar grupo, mudar verba. '
  'Três origens, uma por linha: o diagnóstico diário (verba só diminui), o '
  'pedido de verba de uma pessoa (midia_copiloto_pedir_verba; sobe até 10×) e '
  'o desfazer de uma ação aplicada. Nasce proposta (o desfazer, aprovado); '
  'Administrador ou Marketing aprova (midia_copiloto_decidir, com trilha em '
  'auditoria_admin); o script reserva, aplica, lê de volta e registra. Uma '
  'mudança de verba aberta por campanha. O alvo não muda depois de proposto, '
  'as situações só andam para a frente e nada se apaga (gatilho '
  'midia_copiloto_acoes_transicao). Ver 20261014150000 e 20261016200000.';
comment on column public.midia_copiloto_acoes.chave is
  'Identidade do alvo (ex.: negativar:<campanha>:exata:<texto>, verba:<campanha>). '
  'Uma aberta por chave — o pedido de verba e o diagnóstico dividem verba:<campanha>. '
  'Aplicada, ou recusada, há menos de uma janela não volta pelo diagnóstico; '
  'pedido recusado não conta.';
comment on column public.midia_copiloto_acoes.pedida_por is
  'Quem pediu a mudança pelo painel (auth.uid() carimbado por '
  'midia_copiloto_pedir_verba, nunca declarado). Nulo no que vem do diagnóstico '
  'e no desfazer. Não muda depois de proposto.';
comment on column public.midia_copiloto_acoes.pedida_por_nome is
  'O nome de quem pediu (profiles.full_name na hora do pedido), para a tela e a '
  'trilha. Nulo quando o perfil não tem nome; nunca sem pedida_por.';
comment on index public.midia_copiloto_acoes_uma_verba_aberta is
  'Uma mudança de verba aberta (proposta, aprovada, em aplicação) por loja e '
  'campanha, de qualquer origem. Duas abertas = o script aplica uma e a outra '
  'cai em "a verba mudou desde a proposta". Ver 20261016200000.';
comment on function public.midia_copiloto_pedir_verba(text, numeric, text) is
  'Pedir a verba diária nova de uma campanha do Google (até 10× a de hoje). '
  'Sessão de Administrador ou Marketing; a verba de hoje e o nome vêm de '
  'midia_campanhas (ou, logo depois de uma mudança aplicada, do que o script '
  'leu de volta), nunca de quem pede. Nasce proposta e passa por '
  'midia_copiloto_decidir; substitui a mudança de verba proposta da mesma '
  'campanha e recusa se há uma aprovada ou em aplicação (inclusive desfazer). '
  'Trilha copiloto_pediu. Devolve o id da ação.';
comment on function public.midia_copiloto_desfazer(uuid) is
  'Cria o inverso de uma ação aplicada, já aprovado por quem clicou. É o único '
  'caminho por onde uma negativa é removida. Com verba: substitui a proposta '
  'aberta de verba da campanha e recusa se há uma aprovada ou em aplicação.';


-- ============================================================================
-- 9. Autoconferência — pelo efeito, dentro de um bloco que se desfaz
-- ============================================================================
-- Em produção a tabela já pode ter propostas e aprovadas de verdade: a prova
-- usa campanhas de ID impossível (20 dígitos, 9999…) e só olha para as linhas
-- que ela mesma criou — os retornos que somam a loja inteira (descartadas da
-- gravação, lote da reserva) não entram no veredito.
do $aceite$
declare
  c1  constant text := '99999999999999999001';   -- no ar, R$ 50
  c2  constant text := '99999999999999999002';   -- pausada, R$ 40
  c3  constant text := '99999999999999999003';   -- encerrada
  c4  constant text := '99999999999999999004';   -- sem verba sincronizada
  c5  constant text := '99999999999999999005';   -- R$ 10: o teto exato
  c6  constant text := '99999999999999999006';   -- R$ 20: o diagnóstico tenta subir
  c7  constant text := '99999999999999999007';   -- Meta, não Google
  c8  constant text := '99999999999999999008';   -- verba acima do teto do copiloto
  c9  constant text := '99999999999999999404';   -- não sincronizada
  c10 constant text := '99999999999999999010';   -- só para as regras gravadas como dono
  c11 constant text := '99999999999999999011';   -- a que alguém tenta forjar
  falhas          int := 0;
  v_nome          text;
  v_n             bigint;
  v_i             int;
  v_uid           uuid;
  v_papel         text;
  v_ids           jsonb := '{}'::jsonb;
  v_cli           uuid := gen_random_uuid();     -- authenticated sem perfil: cliente
  v_padrao        uuid := public.org_padrao();
  v_outra_org     uuid;
  v_fn            regprocedure := to_regprocedure('public.midia_copiloto_pedir_verba(text, numeric, text)');
  v_antes         jsonb;
  v_depois        jsonb;
  v_restou        bigint;
  v_lote          jsonb;
  v_ra            jsonb;
  v_rb            jsonb;
  v_rc            jsonb;
  v_rd            jsonb;
  v_diag          uuid;
  v_d_verba2      uuid;
  v_d_neg         uuid;
  v_p1            uuid;
  v_p2            uuid;
  v_p5            uuid;
  v_p6            uuid;
  v_p7            uuid;
  v_p8            uuid;
  v_d1            uuid;
  v_d2            uuid;
  v_velho         uuid;
  v_alheia        uuid;
  v_id            uuid;
  v_linha         public.midia_copiloto_acoes;
  v_caso          record;
  v_estado        text;
  v_msg           text;
  v_obtido        text;
  -- o que a prova mediu, lido depois do rollback
  v_campanhas     text := '';
  v_recusas       int := 0;
  v_recusas_ok    int := 0;
  v_pedidos       text := '';
  v_substituiu    text := '';
  v_regravou      text := '';
  v_aumento_diag  text := '';
  v_decidiu       text := '';
  v_gatilho       int := 0;
  v_gatilho_ok    int := 0;
  v_janela        text := '';
  v_aplicada      text := '';
  v_desfazer      text := '';
  v_uma_aberta    text := '';
  v_parado        text := '';
  v_regras        int := 0;
  v_regras_certas int := 0;
  v_trilha        text := '';
begin
  -- 1 · As colunas: do tipo certo, nulas, comentadas.
  for v_caso in select * from (values ('pedida_por', 'uuid'), ('pedida_por_nome', 'text')) as t(coluna, tipo) loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'midia_copiloto_acoes'
                      and column_name = v_caso.coluna and data_type = v_caso.tipo and is_nullable = 'YES') then
      falhas := falhas + 1; raise warning 'FALHOU: midia_copiloto_acoes.% ausente, de outro tipo ou não nula', v_caso.coluna;
    end if;
    if col_description('public.midia_copiloto_acoes'::regclass,
         (select attnum from pg_attribute
           where attrelid = 'public.midia_copiloto_acoes'::regclass and attname = v_caso.coluna)) is null then
      falhas := falhas + 1; raise warning 'FALHOU: midia_copiloto_acoes.% sem comentário', v_caso.coluna;
    end if;
  end loop;

  -- 2 · As regras: CHECK validado na tabela; o índice de uma verba aberta,
  --     único, parcial, sobre (org_id, campanha_id_externo).
  foreach v_nome in array array['midia_copiloto_acoes_origem_do_tipo', 'midia_copiloto_acoes_proposta_so_corta',
                                'midia_copiloto_acoes_pedido_na_faixa', 'midia_copiloto_acoes_pedido_carimbado'] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = 'public.midia_copiloto_acoes'::regclass
                      and conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1; raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;
  if not exists (select 1 from pg_index i
                  where i.indexrelid = to_regclass('public.midia_copiloto_acoes_uma_verba_aberta')
                    and i.indrelid = 'public.midia_copiloto_acoes'::regclass and i.indisunique and i.indisvalid
                    and pg_get_indexdef(i.indexrelid) like '%(org_id, campanha_id_externo) WHERE ((tipo = ''mudar_verba''::text) AND (situacao = ANY (ARRAY[''proposta''::text, ''aprovada''::text, ''em_aplicacao''::text])))') then
    falhas := falhas + 1; raise warning 'FALHOU: índice midia_copiloto_acoes_uma_verba_aberta ausente ou com outra forma';
  end if;

  -- 3 · As portas: a nova roda como dono, com search_path fixo, comentada; é
  --     de authenticated e não de anon; o desfazer segue igual nisso. O
  --     gatilho segue ligado.
  if v_fn is null then
    raise exception 'ACEITE FALHOU: midia_copiloto_pedir_verba(text, numeric, text) não existe';
  end if;
  if not exists (select 1 from pg_proc where oid = v_fn and prosecdef and proconfig @> array['search_path=public']) then
    falhas := falhas + 1; raise warning 'FALHOU: midia_copiloto_pedir_verba não é SECURITY DEFINER com search_path=public';
  end if;
  if obj_description(v_fn, 'pg_proc') is null then
    falhas := falhas + 1; raise warning 'FALHOU: midia_copiloto_pedir_verba sem comentário';
  end if;
  foreach v_nome in array array['public.midia_copiloto_pedir_verba(text, numeric, text)', 'public.midia_copiloto_desfazer(uuid)'] loop
    if has_function_privilege('anon', v_nome, 'execute') or not has_function_privilege('authenticated', v_nome, 'execute')
       or not exists (select 1 from pg_proc where oid = v_nome::regprocedure and prosecdef) then
      falhas := falhas + 1; raise warning 'FALHOU: privilégio de execução ou SECURITY DEFINER errado em %', v_nome;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.midia_copiloto_gravar_diagnostico(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.midia_copiloto_gravar_diagnostico(jsonb)', 'execute') then
    falhas := falhas + 1; raise warning 'FALHOU: a gravação do retrato deixou de ser só da chave de serviço';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.midia_copiloto_acoes'::regclass
                    and tgname = 'midia_copiloto_acoes_transicao' and not tgisinternal and tgenabled <> 'D') then
    falhas := falhas + 1; raise warning 'FALHOU: o gatilho de transição não está ligado';
  end if;

  -- 4 · midia_campanhas: só as quatro policies novas, anon sem acesso,
  --     authenticated sem TRUNCATE.
  select string_agg(policyname || ':' || cmd, ',' order by policyname) into v_nome
    from pg_policies where schemaname = 'public' and tablename = 'midia_campanhas';
  if v_nome is distinct from 'midia_campanhas_leitura:SELECT,midia_campanhas_manual_edicao:UPDATE,'
                             'midia_campanhas_manual_exclusao:DELETE,midia_campanhas_manual_inclusao:INSERT' then
    falhas := falhas + 1; raise warning 'FALHOU: policies de midia_campanhas — %', v_nome;
  end if;
  if has_table_privilege('anon', 'public.midia_campanhas', 'SELECT')
     or has_table_privilege('authenticated', 'public.midia_campanhas', 'TRUNCATE')
     or not has_table_privilege('authenticated', 'public.midia_campanhas', 'SELECT') then
    falhas := falhas + 1; raise warning 'FALHOU: privilégios de midia_campanhas (anon lê, authenticated trunca ou não lê)';
  end if;

  -- As ações que já existem, por situação: a sonda reserva, descarta e
  -- decide na tabela de verdade, e tudo isso tem de voltar.
  select jsonb_build_object(
           'aco', (select count(*) from public.midia_copiloto_acoes),
           'aco_situacoes', (select jsonb_object_agg(situacao, n)
                               from (select situacao, count(*) as n from public.midia_copiloto_acoes group by 1) s))
    into v_antes;

  -- 5 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    -- 5a · Quem pede: admin, marketing, comercial, um marketing desativado e
    --      um marketing sem nome no perfil.
    foreach v_papel in array array['admin', 'marketing', 'comercial', 'desativado', 'semnome'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-pedido-verba-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = case when v_papel = 'semnome' then '   ' else 'Aceite Pedido ' || v_papel end,
             papeis    = array[case when v_papel in ('desativado', 'semnome') then 'marketing' else v_papel end],
             role      = case when v_papel in ('desativado', 'semnome') then 'marketing' else v_papel end,
             is_active = (v_papel <> 'desativado')
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;

    -- 5b · As campanhas, como a sincronização as grava (a chave de serviço;
    --      aqui, o dono).
    insert into public.midia_campanhas
      (nome, plataforma, origem, id_externo, orcamento_diario, situacao, sincronizado_em)
    values
      ('Aceite Pesquisa',    'google', 'google', c1, 50,     'no_ar',     now() - interval '20 minutes'),
      ('Aceite Display',     'google', 'google', c2, 40,     'pausada',   now() - interval '20 minutes'),
      ('Aceite Encerrada',   'google', 'google', c3, 30,     'encerrada', now() - interval '20 minutes'),
      ('Aceite Sem Verba',   'google', 'google', c4, null,   'no_ar',     now() - interval '20 minutes'),
      ('Aceite Dez Vezes',   'google', 'google', c5, 10,     'no_ar',     now() - interval '20 minutes'),
      ('Aceite Diagnóstico', 'google', 'google', c6, 20,     'no_ar',     now() - interval '20 minutes'),
      ('Aceite Meta',        'meta',   'meta',   c7, 25,     'no_ar',     now() - interval '20 minutes'),
      ('Aceite Teto',        'google', 'google', c8, 150000, 'no_ar',     now() - interval '20 minutes');

    -- 5c · Ninguém forja a campanha sincronizada pela sessão: nem comercial,
    --      nem marketing, nem admin alteram ou apagam (0 linhas), e ninguém
    --      cria nem transforma uma em sincronizada (42501). A manual segue de
    --      staff: entra, muda e sai. Cliente não lê; anon nem chega.
    for v_caso in
      select * from (values
        ('comercial', format('update public.midia_campanhas set nome = ''Forjada'', orcamento_diario = 5 where id_externo = %L', c1)),
        ('marketing', format('update public.midia_campanhas set orcamento_diario = 5000 where id_externo = %L', c1)),
        ('admin',     format('update public.midia_campanhas set nome = ''Forjada'' where id_externo = %L', c1)),
        ('marketing', format('delete from public.midia_campanhas where id_externo = %L', c1)),
        ('comercial', format('insert into public.midia_campanhas (nome, plataforma, origem, id_externo, orcamento_diario) values (''Forjada'', ''google'', ''google'', %L, 5)', c11)),
        ('comercial', 'insert into public.midia_campanhas (nome, plataforma, orcamento_diario) values (''Aceite Manual'', ''meta'', 30)'),
        ('marketing', 'update public.midia_campanhas set orcamento_diario = 35 where nome = ''Aceite Manual'''),
        ('comercial', format('update public.midia_campanhas set origem = ''google'', plataforma = ''google'', id_externo = %L where nome = ''Aceite Manual''', c11)),
        ('comercial', 'delete from public.midia_campanhas where nome = ''Aceite Manual'''),
        ('comercial', format('select count(*) from public.midia_campanhas where id_externo = %L', c1)),
        ('cliente',   format('select count(*) from public.midia_campanhas where id_externo = %L', c1)),
        ('anon',      format('select count(*) from public.midia_campanhas where id_externo = %L', c1))
      ) as t(quem, comando)
    loop
      begin
        perform set_config('request.jwt.claims', '', true);
        if v_caso.quem = 'anon' then
          set local role anon;
        else
          perform set_config('request.jwt.claims',
            json_build_object('sub', coalesce((v_ids->>v_caso.quem)::uuid, v_cli), 'role', 'authenticated')::text, true);
          set local role authenticated;
        end if;
        if v_caso.comando like 'select%' then
          execute v_caso.comando into v_n;
        else
          execute v_caso.comando;
          get diagnostics v_n = row_count;
        end if;
        reset role;
        v_obtido := v_n::text;
      exception when others then
        get stacked diagnostics v_obtido = returned_sqlstate;
      end;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      v_campanhas := v_campanhas || v_obtido || ' ';
    end loop;
    v_campanhas := v_campanhas || (select format('c1:%s/%s', nome, orcamento_diario)
                                     from public.midia_campanhas where id_externo = c1);

    -- 5d · O primeiro retrato: corte na Display e uma negativa na Pesquisa.
    v_lote := jsonb_build_object(
      'conta', '123-456-7890', 'de', '2026-10-08', 'ate', '2026-10-14', 'previa', false,
      'dados', '{}'::jsonb, 'resumo', '{}'::jsonb, 'erros', '{}'::jsonb,
      'achados', jsonb_build_array(
        jsonb_build_object('regra', 'ritmo_de_verba', 'gravidade', 'media', 'titulo', 'Ritmo', 'detalhe', 'aceite')),
      'propostas', jsonb_build_array(
        jsonb_build_object('achado', 0, 'chave', 'verba:' || c1, 'tipo', 'mudar_verba',
                           'campanha_id_externo', c1, 'campanha_nome', 'Aceite Pesquisa',
                           'verba_atual', 50, 'verba_nova', 35, 'motivo', 'aceite', 'economia_7d', 105),
        jsonb_build_object('achado', 0, 'chave', 'verba:' || c2, 'tipo', 'mudar_verba',
                           'campanha_id_externo', c2, 'campanha_nome', 'Aceite Display',
                           'verba_atual', 40, 'verba_nova', 28, 'motivo', 'aceite', 'economia_7d', 84),
        jsonb_build_object('achado', 0, 'chave', 'negativar:' || c1 || ':exata:aceite pedido de verba',
                           'tipo', 'negativar', 'campanha_id_externo', c1, 'campanha_nome', 'Aceite Pesquisa',
                           'texto', 'aceite pedido de verba', 'correspondencia', 'exata', 'motivo', 'aceite')));
    set local role service_role;
    v_ra := public.midia_copiloto_gravar_diagnostico(
              jsonb_set(v_lote, '{propostas}', jsonb_build_array(v_lote->'propostas'->1, v_lote->'propostas'->2)));
    reset role;
    v_diag := (v_ra->>'diagnostico')::uuid;
    select id into v_d_verba2 from public.midia_copiloto_acoes where diagnostico_id = v_diag and chave = 'verba:' || c2;
    select id into v_d_neg    from public.midia_copiloto_acoes where diagnostico_id = v_diag and tipo = 'negativar';

    -- 5e · Quem não pode, e o que não se pede. Cada um pelo código e pela frase.
    for v_caso in
      select * from (values
        ('comercial',  c1,    80::numeric, null::text,       '42501', 'matriz A17'::text),
        ('desativado', c1,    80,          null,             '42501', 'matriz A17'),
        ('cliente',    c1,    80,          null,             '42501', 'matriz A17'),
        ('anon',       c1,    80,          null,             '42501', null),
        ('ninguem',    c1,    80,          null,             '42501', 'sem sessão'),
        ('marketing',  'abc', 80,          null,             '22023', 'ID numérico'),
        ('marketing',  null,  80,          null,             '22023', 'ID numérico'),
        ('marketing',  c1,    0,           null,             '22023', 'Verba nova'),
        ('marketing',  c1,    null,        null,             '22023', 'Verba nova'),
        ('marketing',  c1,    12.345,      null,             '22023', 'Verba nova'),
        ('marketing',  c1,    100000.01,   null,             '22023', 'Verba nova'),
        ('marketing',  c1,    80,          repeat('x', 501), '22023', '500 caracteres'),
        ('marketing',  c1,    50,          null,             '22023', 'já é essa'),
        ('marketing',  c1,    500.01,      null,             '22023', '10 vezes'),
        ('marketing',  c9,    80,          null,             'P0002', null),
        ('marketing',  c3,    80,          null,             'P0002', null),
        ('marketing',  c7,    80,          null,             'P0002', null),
        ('marketing',  c4,    80,          null,             '22023', 'ainda não trouxe'),
        ('marketing',  c8,    90000,       null,             '22023', 'passa do teto')
      ) as t(quem, campanha, verba, motivo, codigo, trecho)
    loop
      v_recusas := v_recusas + 1;
      begin
        perform set_config('request.jwt.claims', '', true);
        if v_caso.quem = 'anon' then
          set local role anon;
        elsif v_caso.quem <> 'ninguem' then
          perform set_config('request.jwt.claims',
            json_build_object('sub', coalesce((v_ids->>v_caso.quem)::uuid, v_cli), 'role', 'authenticated')::text, true);
          set local role authenticated;
        end if;
        v_id := public.midia_copiloto_pedir_verba(v_caso.campanha, v_caso.verba, v_caso.motivo);
        reset role;
        v_estado := 'aceitou'; v_msg := '';
      exception when others then
        get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
      end;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      if v_estado = v_caso.codigo and (v_caso.trecho is null or strpos(v_msg, v_caso.trecho) > 0) then
        v_recusas_ok := v_recusas_ok + 1;
      else
        raise warning 'pedido %/%/%: esperava % (%), veio % — %',
          v_caso.quem, v_caso.campanha, v_caso.verba, v_caso.codigo, v_caso.trecho, v_estado, v_msg;
      end if;
    end loop;

    -- 5f · O marketing pede AUMENTO na Pesquisa (motivo aparado); quem não tem
    --      nome no perfil pede exatamente 10× na Dez Vezes. Antes, outra loja
    --      abre a MESMA chave da Pesquisa: é a única aberta com ela, e o
    --      pedido desta loja não pode tocá-la (nem tropeçar nela).
    insert into public.orgs (nome, criada_em)
    select 'Aceite outra loja', max(criada_em) + interval '1 day' from public.orgs
    returning id into v_outra_org;
    insert into public.midia_copiloto_acoes
      (org_id, chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova,
       motivo, pedida_por, pedida_por_nome)
    values (v_outra_org, 'verba:' || c1, 'mudar_verba', c1, 'Aceite Pesquisa', 50, 55,
            'aceite', gen_random_uuid(), 'Outra loja')
    returning id into v_alheia;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_p1 := public.midia_copiloto_pedir_verba(c1, 80, E'  Convertendo e perdendo impressão por verba.\n ');
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'semnome')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_p5 := public.midia_copiloto_pedir_verba(c5, 100, '   ');
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select * into v_linha from public.midia_copiloto_acoes where id = v_p1;
    v_pedidos := format('p1:%s/%s/%s/%s/%s→%s/%s/%s/sem_diag:%s/%s/lida:%s/%s motivo:%s',
      v_linha.tipo, v_linha.situacao, v_linha.chave = 'verba:' || c1, v_linha.campanha_nome,
      v_linha.verba_atual, v_linha.verba_nova, v_linha.pedida_por = (v_ids->>'marketing')::uuid,
      v_linha.pedida_por_nome, (v_linha.diagnostico_id is null and v_linha.achado_id is null),
      v_linha.evidencias->>'origem', (v_linha.evidencias->>'verbaLidaEm')::timestamptz = now() - interval '20 minutes',
      v_linha.evidencias->>'verbaLidaDe', v_linha.motivo);
    select * into v_linha from public.midia_copiloto_acoes where id = v_p5;
    v_pedidos := v_pedidos || format(' p5:%s/%s→%s/nome:%s/motivo:%s',
      v_linha.situacao, v_linha.verba_atual, v_linha.verba_nova,
      coalesce(v_linha.pedida_por_nome, 'nulo'), v_linha.motivo);

    -- 5g · Substituir: o admin pede CORTE na Display, onde há proposta aberta
    --      do diagnóstico (sai de cena com o nome dele). E o marketing pede de
    --      novo na Dez Vezes: o pedido aberto de outra pessoa também sai de cena.
    --      A aberta da outra loja (5f) segue proposta.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_p2 := public.midia_copiloto_pedir_verba(c2, 30, 'Pausada; segura até voltar.');
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_p6 := public.midia_copiloto_pedir_verba(c5, 60, null);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_substituiu := format('diag:%s/%s alheia:%s p2:%s/%s/%s p5:%s/%s p6:%s padrao:%s',
      (select situacao from public.midia_copiloto_acoes where id = v_d_verba2),
      (select descartada_motivo from public.midia_copiloto_acoes where id = v_d_verba2),
      (select situacao from public.midia_copiloto_acoes where id = v_alheia),
      (select situacao from public.midia_copiloto_acoes where id = v_p2),
      (select org_id = v_padrao from public.midia_copiloto_acoes where id = v_p2),
      (select verba_atual from public.midia_copiloto_acoes where id = v_p2),
      (select situacao from public.midia_copiloto_acoes where id = v_p5),
      (select descartada_motivo from public.midia_copiloto_acoes where id = v_p5),
      (select situacao from public.midia_copiloto_acoes where id = v_p6),
      public.org_padrao() = v_padrao);

    -- 5h · O retrato seguinte (não prévia): os pedidos ficam; a proposta do
    --      diagnóstico sai e volta como nova; as duas verbas com pedido
    --      aberto são puladas.
    set local role service_role;
    v_rb := public.midia_copiloto_gravar_diagnostico(v_lote);
    reset role;
    v_regravou := format('propostas:%s puladas:%s p1:%s p2:%s p6:%s neg_antiga:%s neg_nova:%s verba_do_diag_aberta:%s',
      v_rb->>'propostas', v_rb->>'puladas',
      (select situacao from public.midia_copiloto_acoes where id = v_p1),
      (select situacao from public.midia_copiloto_acoes where id = v_p2),
      (select situacao from public.midia_copiloto_acoes where id = v_p6),
      (select situacao from public.midia_copiloto_acoes where id = v_d_neg),
      (select count(*) from public.midia_copiloto_acoes
        where diagnostico_id = (v_rb->>'diagnostico')::uuid and tipo = 'negativar' and situacao = 'proposta'),
      (select count(*) from public.midia_copiloto_acoes
        where diagnostico_id is not null and chave in ('verba:' || c1, 'verba:' || c2) and situacao = 'proposta'));

    -- 5i · O diagnóstico continua sem poder AUMENTAR.
    begin
      set local role service_role;
      perform public.midia_copiloto_gravar_diagnostico(jsonb_set(v_lote, '{propostas}', jsonb_build_array(
        jsonb_build_object('achado', 0, 'chave', 'verba:' || c6, 'tipo', 'mudar_verba',
                           'campanha_id_externo', c6, 'campanha_nome', 'Aceite Diagnóstico',
                           'verba_atual', 20, 'verba_nova', 30, 'motivo', 'aceite'))));
      reset role;
      v_aumento_diag := 'gravou';
    exception when check_violation then
      get stacked diagnostics v_aumento_diag = constraint_name;
    end;
    reset role;

    -- 5j · Aprovar o pedido é a mesma porta de sempre; com ele aprovado e
    --      esperando o script, pedir de novo na mesma campanha é recusado.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_decidiu := 'aprovou:' || public.midia_copiloto_decidir(array[v_p1], 'aprovar', 'pode subir');
    reset role;
    select * into v_linha from public.midia_copiloto_acoes where id = v_p1;
    v_decidiu := v_decidiu || format(' p1:%s/%s', v_linha.situacao, v_linha.decidida_por = (v_ids->>'marketing')::uuid);
    begin
      set local role authenticated;
      perform public.midia_copiloto_pedir_verba(c1, 90, null);
      reset role;
      v_decidiu := v_decidiu || ' de_novo:aceitou';
    exception when invalid_parameter_value then
      get stacked diagnostics v_msg = message_text;
      v_decidiu := v_decidiu || ' de_novo:' || case when strpos(v_msg, 'Já há uma mudança de verba aprovada') > 0 then 'recusou' else v_msg end;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_decidiu := v_decidiu || ' p1_depois:' || (select situacao from public.midia_copiloto_acoes where id = v_p1);

    -- 5k · Quem pediu não muda depois de proposto; o pedido não nasce aprovado
    --      (como dono, sem sessão: só o gatilho fala). Cada troca de quem
    --      pediu vai junto com uma transição PERMITIDA (proposta → descartada,
    --      aprovada → recusada): assim só a guarda do alvo pode recusá-la — a
    --      das situações deixaria passar.
    for v_caso in
      select * from (values
        (format('update public.midia_copiloto_acoes set situacao = ''descartada'', pedida_por = %L where id = %L', v_ids->>'marketing', v_p2)),
        (format('update public.midia_copiloto_acoes set situacao = ''descartada'', pedida_por_nome = ''Outra pessoa'' where id = %L', v_p2)),
        (format('update public.midia_copiloto_acoes set situacao = ''descartada'', pedida_por = null, pedida_por_nome = null where id = %L', v_p2)),
        (format('update public.midia_copiloto_acoes set situacao = ''recusada'', pedida_por_nome = null where id = %L', v_p1)),
        (format('delete from public.midia_copiloto_acoes where id = %L', v_p2)),
        (format('insert into public.midia_copiloto_acoes (chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova, motivo, pedida_por, situacao, decidida_por, decidida_em) values (''aceite-aprovado'', ''mudar_verba'', %L, ''c'', 10, 20, ''m'', %L, ''aprovada'', %L, now())', c10, v_ids->>'admin', v_ids->>'admin'))
      ) as t(comando)
    loop
      v_gatilho := v_gatilho + 1;
      begin
        execute v_caso.comando;
        raise warning 'gatilho: passou — %', v_caso.comando;
      exception when raise_exception then
        v_gatilho_ok := v_gatilho_ok + 1;
      end;
    end loop;

    -- 5l · A janela: o admin recusa o pedido da Display; o da Pesquisa é
    --      reservado e aplicado pelo script. No retrato seguinte, o corte da
    --      Display volta (pedido recusado não segura) e o da Pesquisa não
    --      (pedido aplicado segura).
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_janela := 'recusou:' || public.midia_copiloto_decidir(array[v_p2], 'recusar');
    reset role;
    perform set_config('request.jwt.claims', '', true);
    -- A fila da loja pode ter aprovadas de verdade antes do p1: reserva de 50
    -- em 50 até ele sair (tudo isto se desfaz).
    set local role service_role;
    for v_i in 1..200 loop
      select count(*) into v_n from public.midia_copiloto_reservar_acoes(50) r where r.id = v_p1;
      exit when v_n > 0;
    end loop;
    v_janela := v_janela || ' reservou:' || v_n || ' resultado:'
      || coalesce(public.midia_copiloto_registrar_resultado(v_p1, 'aplicada', jsonb_build_object('verba', 80), null), 'nulo');
    v_rc := public.midia_copiloto_gravar_diagnostico(
              jsonb_set(v_lote, '{propostas}', jsonb_build_array(v_lote->'propostas'->0, v_lote->'propostas'->1)));
    reset role;
    v_janela := v_janela || format(' propostas:%s puladas:%s pesquisa_aberta:%s display_do_diag:%s',
      v_rc->>'propostas', v_rc->>'puladas',
      (select count(*) from public.midia_copiloto_acoes
        where org_id = v_padrao and chave = 'verba:' || c1 and situacao = 'proposta'),
      (select count(*) from public.midia_copiloto_acoes
        where org_id = v_padrao and chave = 'verba:' || c2 and situacao = 'proposta'
          and diagnostico_id = (v_rc->>'diagnostico')::uuid));

    -- 5m · A verba "de agora" logo depois de uma aplicação: a sincronização
    --      ainda mostra R$ 50 (é de 20 min antes), o script leu R$ 80 de volta
    --      agora. O pedido parte de R$ 80, e diz de onde leu.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_p7 := public.midia_copiloto_pedir_verba(c1, 120, null);
    reset role;
    select * into v_linha from public.midia_copiloto_acoes where id = v_p7;
    v_aplicada := format('p7:%s→%s/%s/%s', v_linha.verba_atual, v_linha.verba_nova,
      v_linha.evidencias->>'verbaLidaDe',
      (v_linha.evidencias->>'verbaLidaEm')::timestamptz = (select concluida_em from public.midia_copiloto_acoes where id = v_p1));

    -- 5n · Desfazer com pedido PROPOSTO na campanha: o pedido sai de cena com
    --      o nome de quem desfez, e o desfazer nasce aprovado.
    v_d1 := public.midia_copiloto_desfazer(v_p1);
    select * into v_linha from public.midia_copiloto_acoes where id = v_d1;
    v_desfazer := format('d1:%s/%s/%s→%s/pedido:%s p7:%s/%s',
      v_linha.tipo, v_linha.situacao, v_linha.verba_atual, v_linha.verba_nova,
      coalesce(v_linha.pedida_por::text, 'nulo'),
      (select situacao from public.midia_copiloto_acoes where id = v_p7),
      (select descartada_motivo from public.midia_copiloto_acoes where id = v_p7));

    -- 5o · Pedido com DESFAZER aprovado na campanha: recusado, e a frase diz
    --      que é um desfazer.
    begin
      set local role authenticated;
      perform public.midia_copiloto_pedir_verba(c1, 200, null);
      reset role;
      v_uma_aberta := 'pedido_com_desfazer:aceitou';
    exception when invalid_parameter_value then
      get stacked diagnostics v_msg = message_text;
      v_uma_aberta := 'pedido_com_desfazer:'
        || case when strpos(v_msg, 'desfazer de verba aprovado') > 0 then 'recusou' else v_msg end;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- 5p · O índice, sem função no meio: uma segunda mudança de verba aberta
    --      na campanha, de outra chave, é recusada (como dono).
    begin
      insert into public.midia_copiloto_acoes
        (diagnostico_id, chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova, motivo)
      values (v_diag, 'aceite-outra-chave', 'mudar_verba', c1, 'Aceite Pesquisa', 80, 60, 'aceite');
      v_uma_aberta := v_uma_aberta || ' indice:aceitou';
    exception when unique_violation then
      get stacked diagnostics v_msg = constraint_name;
      v_uma_aberta := v_uma_aberta || ' indice:' || v_msg;
    end;

    -- 5q · O admin desiste do desfazer. A sincronização chega DEPOIS da
    --      aplicação (R$ 82): agora vale ela. O pedido sai dela, o admin o
    --      aprova, e desfazer com pedido APROVADO na campanha é recusado.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_uma_aberta := v_uma_aberta || ' desistiu:' || public.midia_copiloto_decidir(array[v_d1], 'recusar');
    reset role;
    update public.midia_campanhas
       set orcamento_diario = 82, sincronizado_em = now() + interval '1 minute'
     where id_externo = c1;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_p8 := public.midia_copiloto_pedir_verba(c1, 100, null);
    reset role;
    select * into v_linha from public.midia_copiloto_acoes where id = v_p8;
    v_aplicada := v_aplicada || format(' p8:%s→%s/%s/%s', v_linha.verba_atual, v_linha.verba_nova,
      v_linha.evidencias->>'verbaLidaDe',
      (v_linha.evidencias->>'verbaLidaEm')::timestamptz = now() + interval '1 minute');
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_uma_aberta := v_uma_aberta || ' aprovou_p8:' || public.midia_copiloto_decidir(array[v_p8], 'aprovar');
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    begin
      set local role authenticated;
      perform public.midia_copiloto_desfazer(v_p1);
      reset role;
      v_uma_aberta := v_uma_aberta || ' desfazer_com_aprovada:aceitou';
    exception when invalid_parameter_value then
      get stacked diagnostics v_msg = message_text;
      v_uma_aberta := v_uma_aberta || ' desfazer_com_aprovada:'
        || case when strpos(v_msg, 'antes de desfazer') > 0 then 'recusou' else v_msg end;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    v_uma_aberta := v_uma_aberta || ' p8:' || (select situacao from public.midia_copiloto_acoes where id = v_p8);

    -- 5r · O retrato com uma verba aberta de OUTRA chave pula sem erro, e o
    --      pedido parado há mais de uma janela sai de cena.
    --      Dez Vezes: o pedido p6 é aprovado e aplicado há 10 dias (fora da
    --      janela, então a chave verba:<c5> não segura nada), e desfeito agora
    --      — o desfazer aprovado tem a chave desfazer:<p6>.
    --      Diagnóstico: um pedido proposto há 8 dias, que ninguém decidiu.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform public.midia_copiloto_decidir(array[v_p6], 'aprovar');
    reset role;
    update public.midia_copiloto_acoes
       set situacao = 'em_aplicacao', reservada_em = now() - interval '10 days', tentativas = 1
     where id = v_p6;
    update public.midia_copiloto_acoes
       set situacao = 'aplicada', concluida_em = now() - interval '10 days', lido_de_volta = '{"verba": 60}'::jsonb
     where id = v_p6;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_d2 := public.midia_copiloto_desfazer(v_p6);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    insert into public.midia_copiloto_acoes
      (chave, tipo, campanha_id_externo, campanha_nome, verba_atual, verba_nova, motivo,
       pedida_por, pedida_por_nome, proposta_em)
    values ('verba:' || c6, 'mudar_verba', c6, 'Aceite Diagnóstico', 20, 30, 'Pedido de Aceite Pedido marketing.',
            (v_ids->>'marketing')::uuid, 'Aceite Pedido marketing', now() - interval '8 days')
    returning id into v_velho;
    set local role service_role;
    v_rd := public.midia_copiloto_gravar_diagnostico(jsonb_set(v_lote, '{propostas}', jsonb_build_array(
      jsonb_build_object('achado', 0, 'chave', 'verba:' || c5, 'tipo', 'mudar_verba',
                         'campanha_id_externo', c5, 'campanha_nome', 'Aceite Dez Vezes',
                         'verba_atual', 60, 'verba_nova', 42, 'motivo', 'aceite'),
      jsonb_build_object('achado', 0, 'chave', 'verba:' || c6, 'tipo', 'mudar_verba',
                         'campanha_id_externo', c6, 'campanha_nome', 'Aceite Diagnóstico',
                         'verba_atual', 20, 'verba_nova', 14, 'motivo', 'aceite'))));
    reset role;
    v_parado := format('propostas:%s puladas:%s d2:%s c5_do_diag:%s velho:%s/%s c6_do_diag:%s p8:%s',
      v_rd->>'propostas', v_rd->>'puladas',
      (select situacao from public.midia_copiloto_acoes where id = v_d2),
      (select count(*) from public.midia_copiloto_acoes
        where diagnostico_id = (v_rd->>'diagnostico')::uuid and campanha_id_externo = c5),
      (select situacao from public.midia_copiloto_acoes where id = v_velho),
      (select descartada_motivo from public.midia_copiloto_acoes where id = v_velho),
      (select count(*) from public.midia_copiloto_acoes
        where diagnostico_id = (v_rd->>'diagnostico')::uuid and campanha_id_externo = c6 and situacao = 'proposta'),
      (select situacao from public.midia_copiloto_acoes where id = v_p8));

    -- 5s · Cada regra, tentando gravar o inválido como dono (só o CHECK fala),
    --      e um controle que tem de entrar. Numa campanha só delas.
    for v_caso in
      select * from (values
        ('midia_copiloto_acoes_origem_do_tipo',    'negativar',   false, true,  null::numeric, null::numeric, null::text),
        ('midia_copiloto_acoes_origem_do_tipo',    'mudar_verba', true,  true,  10,            20,            null),
        ('midia_copiloto_acoes_proposta_so_corta', 'mudar_verba', true,  false, 10,            20,            null),
        ('midia_copiloto_acoes_pedido_na_faixa',   'mudar_verba', false, true,  10,            100.01,        null),
        ('midia_copiloto_acoes_pedido_carimbado',  'mudar_verba', true,  false, 20,            10,            'Ninguém'),
        ('midia_copiloto_acoes_pedido_carimbado',  'mudar_verba', false, true,  10,            20,            repeat('n', 201)),
        ('',                                       'mudar_verba', false, true,  10,            100,           'Aceite')
      ) as t(regra, tipo, com_diag, com_pedido, verba_atual, verba_nova, nome)
    loop
      v_regras := v_regras + 1;
      begin
        insert into public.midia_copiloto_acoes
          (diagnostico_id, chave, tipo, campanha_id_externo, campanha_nome, texto, correspondencia,
           verba_atual, verba_nova, motivo, pedida_por, pedida_por_nome)
        values
          (case when v_caso.com_diag then v_diag end, 'aceite-regra-' || v_regras, v_caso.tipo, c10, 'c',
           case when v_caso.tipo = 'negativar' then 'x' end,
           case when v_caso.tipo = 'negativar' then 'exata' end,
           v_caso.verba_atual, v_caso.verba_nova, 'm',
           case when v_caso.com_pedido then (v_ids->>'marketing')::uuid end, v_caso.nome);
        v_msg := '';
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
      end;
      if v_msg = v_caso.regra then
        v_regras_certas := v_regras_certas + 1;
      else
        raise warning 'regra %: caiu em %', nullif(v_caso.regra, ''), nullif(v_msg, '');
      end if;
    end loop;

    -- 5t · A trilha: um copiloto_pediu por pedido aceito (p1, p5, p2, p6, p7,
    --      p8), com a frase da ação e o carimbo de quem pediu; os dois
    --      desfazer; a aprovação.
    select count(*) into v_n from public.auditoria_admin
     where acao = 'copiloto_pediu'
       and autor_id in ((v_ids->>'marketing')::uuid, (v_ids->>'admin')::uuid, (v_ids->>'semnome')::uuid);
    v_trilha := 'pediu:' || v_n
      || ' p1:' || exists (select 1 from public.auditoria_admin
                            where acao = 'copiloto_pediu' and autor_id = (v_ids->>'marketing')::uuid
                              and autor_nome = 'Aceite Pedido marketing'
                              and detalhe = format('Pedido: Verba de Aceite Pesquisa: R$ 50,00 → R$ 80,00 por dia (ação %s)', v_p1))
      || ' semnome:' || exists (select 1 from public.auditoria_admin
                                 where acao = 'copiloto_pediu' and autor_id = (v_ids->>'semnome')::uuid
                                   and autor_nome is null and detalhe like '%' || v_p5 || '%')
      || ' desfez:' || (select count(*) from public.auditoria_admin
                         where acao = 'copiloto_desfez' and autor_id = (v_ids->>'marketing')::uuid)
      || ' aprovou:' || exists (select 1 from public.auditoria_admin
                                 where acao = 'copiloto_aprovou' and autor_id = (v_ids->>'marketing')::uuid
                                   and detalhe like '%' || v_p1 || '%');

    raise exception 'DESFAZER_ACEITE_PEDIDO_DE_VERBA' using errcode = 'PCP03';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PCP03' then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_ids->>'semnome' is null or v_p1 is null or v_d2 is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou ao fim (usuários, primeiro pedido, segundo desfazer) — nada foi provado';
  end if;
  if v_campanhas <> '0 0 0 0 42501 1 1 42501 1 1 0 42501 c1:Aceite Pesquisa/50.00' then
    falhas := falhas + 1; raise warning 'FALHOU: escrita em midia_campanhas pela sessão — %', v_campanhas;
  end if;
  if (v_ra->>'propostas')::int <> 2 or (v_ra->>'puladas')::int <> 0 then
    falhas := falhas + 1; raise warning 'FALHOU: primeiro retrato gravou %', v_ra;
  end if;
  if v_recusas < 19 or v_recusas_ok <> v_recusas then
    falhas := falhas + 1; raise warning 'FALHOU: recusas — % de % pelo código e pela frase certos', v_recusas_ok, v_recusas;
  end if;
  if v_pedidos <> 'p1:mudar_verba/proposta/t/Aceite Pesquisa/50.00→80.00/t/Aceite Pedido marketing/sem_diag:t/pedido/lida:t/sincronizacao'
                  ' motivo:Pedido de Aceite Pedido marketing: Convertendo e perdendo impressão por verba.'
                  ' p5:proposta/10.00→100.00/nome:nulo/motivo:Pedido de alguém da equipe.' then
    falhas := falhas + 1; raise warning 'FALHOU: pedidos — %', v_pedidos;
  end if;
  if v_substituiu <> 'diag:descartada/Substituída pelo pedido de Aceite Pedido admin. alheia:proposta p2:proposta/t/40.00 '
                     'p5:descartada/Substituída pelo pedido de Aceite Pedido marketing. p6:proposta padrao:t' then
    falhas := falhas + 1; raise warning 'FALHOU: substituição — %', v_substituiu;
  end if;
  if v_regravou <> 'propostas:1 puladas:2 p1:proposta p2:proposta p6:proposta neg_antiga:descartada neg_nova:1 verba_do_diag_aberta:0' then
    falhas := falhas + 1; raise warning 'FALHOU: retrato com pedido aberto — %', v_regravou;
  end if;
  if v_aumento_diag <> 'midia_copiloto_acoes_proposta_so_corta' then
    falhas := falhas + 1; raise warning 'FALHOU: diagnóstico aumentando verba — %', v_aumento_diag;
  end if;
  if v_decidiu <> 'aprovou:1 p1:aprovada/t de_novo:recusou p1_depois:aprovada' then
    falhas := falhas + 1; raise warning 'FALHOU: aprovar o pedido — %', v_decidiu;
  end if;
  if v_gatilho < 6 or v_gatilho_ok <> v_gatilho then
    falhas := falhas + 1; raise warning 'FALHOU: gatilho — % de % recusadas', v_gatilho_ok, v_gatilho;
  end if;
  if v_janela <> 'recusou:1 reservou:1 resultado:aplicada propostas:1 puladas:1 pesquisa_aberta:0 display_do_diag:1' then
    falhas := falhas + 1; raise warning 'FALHOU: janela — %', v_janela;
  end if;
  if v_aplicada <> 'p7:80.00→120.00/aplicacao/t p8:82.00→100.00/sincronizacao/t' then
    falhas := falhas + 1; raise warning 'FALHOU: verba de agora (aplicação × sincronização) — %', v_aplicada;
  end if;
  if v_desfazer <> 'd1:mudar_verba/aprovada/80.00→50.00/pedido:nulo p7:descartada/Substituída pelo desfazer de Aceite Pedido marketing.' then
    falhas := falhas + 1; raise warning 'FALHOU: desfazer com pedido proposto — %', v_desfazer;
  end if;
  if v_uma_aberta <> 'pedido_com_desfazer:recusou indice:midia_copiloto_acoes_uma_verba_aberta desistiu:1 '
                     'aprovou_p8:1 desfazer_com_aprovada:recusou p8:aprovada' then
    falhas := falhas + 1; raise warning 'FALHOU: uma mudança de verba aberta por campanha — %', v_uma_aberta;
  end if;
  if v_parado <> 'propostas:1 puladas:1 d2:aprovada c5_do_diag:0 velho:descartada/Pedido sem decisão por 8 dias; '
                 'o diagnóstico volta a propor para a campanha. c6_do_diag:1 p8:aprovada' then
    falhas := falhas + 1; raise warning 'FALHOU: retrato com verba aberta de outra chave e pedido parado — %', v_parado;
  end if;
  if v_regras < 7 or v_regras_certas <> v_regras then
    falhas := falhas + 1; raise warning 'FALHOU: regras — % de % pela regra certa', v_regras_certas, v_regras;
  end if;
  if v_trilha <> 'pediu:6 p1:true semnome:true desfez:2 aprovou:true' then
    falhas := falhas + 1; raise warning 'FALHOU: trilha — %', v_trilha;
  end if;

  -- Nada da prova ficou: nem campanha, nem ação, nem retrato, nem trilha, nem
  -- loja, nem usuário — e as ações que já existiam estão como estavam. Fora
  -- de `midia_copiloto_acoes` (travada pelo ALTER desta migração quando ela
  -- roda numa transação), procura-se a MARCA da sonda, não a contagem: o
  -- painel e a sincronização podem estar gravando trilha e campanha agora, e
  -- isso não é rastro da prova.
  select jsonb_build_object(
           'aco', (select count(*) from public.midia_copiloto_acoes),
           'aco_situacoes', (select jsonb_object_agg(situacao, n)
                               from (select situacao, count(*) as n from public.midia_copiloto_acoes group by 1) s))
    into v_depois;
  select count(*) into v_restou from auth.users where email like 'aceite-pedido-verba-%@exemplo.invalido';
  if v_depois <> v_antes or v_restou <> 0
     or exists (select 1 from public.midia_campanhas
                 where id_externo = any (array[c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11])
                    or nome = 'Aceite Manual')
     or exists (select 1 from public.midia_copiloto_acoes
                 where campanha_id_externo = any (array[c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11]))
     or exists (select 1 from public.midia_copiloto_diagnosticos
                 where conta = '123-456-7890' and de = date '2026-10-08' and ate = date '2026-10-14')
     or exists (select 1 from public.auditoria_admin
                 where detalhe ~ 'Aceite (Pesquisa|Display|Dez Vezes|Diagnóstico|Teto)')
     or exists (select 1 from public.orgs where nome = 'Aceite outra loja')
     or public.org_padrao() is distinct from v_padrao then
    falhas := falhas + 1; raise warning 'FALHOU: a prova deixou rastro (% → %, % usuário(s))', v_antes, v_depois, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no pedido de verba do Copiloto de Mídia', falhas;
  end if;

  raise notice
    'Aceite verificado: midia_copiloto_acoes tem pedida_por e pedida_por_nome, nulas e '
    'comentadas, as quatro regras do pedido validadas e o índice de uma mudança de verba '
    'aberta por campanha; midia_copiloto_pedir_verba roda como dono, é de authenticated e '
    'não de anon. Em midia_campanhas, comercial, marketing e admin não alteram nem apagam a '
    'campanha sincronizada e ninguém a cria pela sessão, a manual segue de staff, cliente não '
    'lê e anon não chega. Admin e marketing pedem (nasce proposta, com quem pediu carimbado, '
    'a verba e o nome lidos de midia_campanhas — ou do que o script leu de volta, quando é '
    'mais novo — e a trilha copiloto_pediu), e o aumento passa até 10× exatos; comercial, '
    'marketing desativado, cliente, anon e sem sessão levam 42501; % pedidos tortos caem pelo '
    'código e pela frase certos. O pedido substitui a proposta aberta do diagnóstico e o pedido '
    'aberto de outra pessoa, não toca a mesma chave de outra loja, e é recusado com uma '
    'aprovada ou um desfazer aprovado esperando o script; o desfazer substitui o pedido '
    'proposto e é recusado com um aprovado; o índice recusa a segunda aberta; o retrato novo '
    'não descarta pedido, pula a verba com pedido ou desfazer aberto e tira de cena o pedido '
    'parado há mais de uma janela; o diagnóstico continua sem poder aumentar; '
    'midia_copiloto_decidir aprova o pedido; quem pediu não muda depois de proposto; pedido '
    'recusado não segura o corte do diagnóstico e pedido aplicado segura; % tentativas '
    'inválidas caem na regra certa; a prova não deixou rastro.', v_recusas, v_regras - 1;
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261016200000', 'copiloto_pedido_de_verba')
  on conflict (version) do nothing;
