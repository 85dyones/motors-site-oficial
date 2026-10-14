-- ============================================================================
-- Copiloto de Mídia: diagnóstico diário do Google Ads e mudanças aprovadas
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-10-14-copiloto-de-midia-design.md
-- Pedido do dono (2026-10-14), com o número que o motivou: de 6 a 12/10 o
-- Google gastou R$ 357 com zero conversão. O GTM e o site medem certo; em 21
-- dias só 2 de 62 leads chegaram com gclid. Faltava alguém ler a conta todo
-- dia e transformar o que ela mostra em mudança, com uma pessoa aprovando.
--
-- O caminho:
--   1. O script colado na conta (`scripts/google-ads-script.js`, o mesmo que
--      já sincroniza de hora em hora) manda, uma vez por dia, o retrato da
--      conta: termos de pesquisa de 7 dias, palavras-chave com índice de
--      qualidade, anúncios e recursos reprovados, ações de conversão, verbas e
--      ritmo. A rota `/api/marketing/copiloto/diagnostico` aplica as regras
--      (`src/lib/copilotoDeMidia.ts`) e grava tudo por
--      `midia_copiloto_gravar_diagnostico`, numa transação.
--   2. Administrador ou Marketing aprova ou recusa cada proposta no painel
--      (`/admin/marketing/copiloto`) — `midia_copiloto_decidir`, com a trilha
--      em `auditoria_admin`.
--   3. Na rodada seguinte o script reserva o que foi aprovado
--      (`midia_copiloto_reservar_acoes`), aplica pela AdsApp, lê de volta e
--      devolve o resultado (`midia_copiloto_registrar_resultado`).
--
-- ---------------------------------------------------------------------------
-- O que nasce
-- ---------------------------------------------------------------------------
-- 1. `public.midia_copiloto_parametros` — as regras da loja, com vigência
--    (D-T1.7: valor vigente não sofre UPDATE): os mínimos de gasto, o ritmo,
--    o corte de verba, o índice de qualidade baixo, a hora do diagnóstico e as
--    três listas que classificam termo — concorrentes, cidades fora da área e
--    palavras informativas. O código não conhece concorrente nem cidade de
--    ninguém: a semente traz as duas listas VAZIAS, e a loja as preenche na
--    tela. A lista informativa nasce com palavras de quem pesquisa e não
--    compra carro (emprego, peça, multa, manual…), igual para qualquer loja.
--    Os números da semente são de partida, para o dono confirmar na tela.
-- 2. `public.midia_copiloto_diagnosticos` — uma linha por retrato recebido: a
--    janela, o retrato inteiro (`dados`), o resumo calculado e as seções que o
--    Google não deixou ler. Não muda nem some (gatilho): é a prova de por que
--    cada proposta nasceu.
-- 3. `public.midia_copiloto_achados` — o que as regras acharam em cada
--    retrato, com gravidade e evidência. Também imutável.
-- 4. `public.midia_copiloto_acoes` — as propostas e, depois, as ações: o alvo
--    (campanha, grupo, negativa, verba), o motivo, quem decidiu, quando o
--    script reservou, o que ele leu de volta e o resultado.
-- 5. Seis funções:
--      midia_copiloto_nova_vigencia(...) ........ painel: regras novas (admin, marketing)
--      midia_copiloto_decidir(ids, decisao) ..... painel: aprovar ou recusar
--      midia_copiloto_desfazer(id) .............. painel: o inverso do que foi aplicado
--      midia_copiloto_gravar_diagnostico(p) ..... chave de serviço: o retrato e as propostas
--      midia_copiloto_reservar_acoes(limite) .... chave de serviço: o lote para o script
--      midia_copiloto_registrar_resultado(...) .. chave de serviço: o que o script fez
--    e duas auxiliares: `midia_copiloto_lista_valida` (o CHECK das listas) e
--    `midia_copiloto_descrever` (a frase da trilha).
--
-- ---------------------------------------------------------------------------
-- O que o copiloto pode mudar, e o que nunca muda
-- ---------------------------------------------------------------------------
-- Cinco tipos (`TIPOS_DE_ACAO` em src/lib/copilotoDeMidia.ts): negativar,
-- remover_negativa, pausar_grupo, reativar_grupo, mudar_verba. A ÚNICA
-- exclusão é `remover_negativa`, e o banco só a deixa nascer como o desfazer
-- de uma negativa aplicada (`midia_copiloto_acoes_origem_do_tipo` +
-- o gatilho de transição). Palavra-chave, anúncio, grupo e campanha nunca são
-- excluídos; o script, do lado dele, só conhece estes cinco verbos.
--
-- O que foi aprovado é o que é aplicado: depois de proposta, o alvo da ação
-- (tipo, campanha, grupo, texto, correspondência, verbas) não muda — o
-- gatilho `midia_copiloto_acoes_transicao` recusa. As situações andam numa
-- direção só:
--   proposta → aprovada | recusada | descartada
--   aprovada → em_aplicacao | recusada (desistir antes de o script pegar)
--   em_aplicacao → aplicada | falhou | sem_efeito (ou em_aplicacao de novo,
--                  quando o script some sem responder e a ação é reentregue)
-- Nenhuma linha é apagada.
--
-- Repetir a proposta todo dia seria cobrar a mesma decisão sete vezes. Por
-- isso a gravação de um retrato:
--   * substitui (`descartada`) as propostas ainda não decididas dos retratos
--     anteriores — os números delas são de ontem;
--   * não propõe de novo o que está aberto (aprovada, em aplicação: índice
--     único por chave enquanto aberta);
--   * não propõe de novo, durante o tamanho da janela (7 dias), o que foi
--     aplicado ou recusado. É também o que impede o corte de verba em cascata:
--     a campanha que perdeu 30% hoje ainda mostra os 7 dias de gasto alto
--     amanhã.
--
-- ---------------------------------------------------------------------------
-- Quem lê e quem escreve
-- ---------------------------------------------------------------------------
-- As quatro tabelas: Administrador e Marketing com conta ativa LEEM pelo
-- painel (a linha "Aprovar mudanças do Copiloto de Mídia" da matriz A17,
-- `PAPEIS_DO_COPILOTO`). Ninguém escreve direto — nem `authenticated`, nem a
-- chave de serviço: INSERT, UPDATE, DELETE e TRUNCATE revogados dos dois.
-- Toda escrita passa pelas funções, que rodam como dono:
--   * as três do painel carimbam a autoria com `auth.uid()` (B6 da f0m: autoria
--     é carimbada, não declarada) e conferem o papel de novo, mesmo depois de
--     a rota ter conferido a matriz;
--   * as três do script são só da chave de serviço; a rota confere antes o
--     segredo `midia_google_segredo` (o mesmo da sincronização, no Vault).
-- A loja das linhas escritas pelo script é `org_padrao()`: até a S1, o
-- segredo do script é um só. Na plataforma, o segredo passa a ser da loja
-- (`org_integracoes`) e a loja vem dele.
--
-- `auditoria_admin` recebe uma linha por decisão (copiloto_aprovou,
-- copiloto_recusou, copiloto_desfez, copiloto_regras) e uma por resultado do
-- script (copiloto_aplicou, copiloto_ja_estava, copiloto_falhou), na MESMA
-- transação da mudança: a trilha não falha separada do ato.
--
-- ---------------------------------------------------------------------------
-- As regras, e quem as segura
-- ---------------------------------------------------------------------------
--   midia_copiloto_parametros_gastos_validos ..... os três mínimos > 0 e ≤ 100.000
--   midia_copiloto_parametros_ritmo_valido ....... 1 ≤ baixo < alto ≤ 100
--   midia_copiloto_parametros_reducao_valida ..... corte de 5% a 90%
--   midia_copiloto_parametros_iq_valido .......... 1 a 10
--   midia_copiloto_parametros_hora_valida ........ 0 a 23
--   midia_copiloto_parametros_listas_validas ..... até 200 itens, 2 a 60 caracteres,
--                                                  minúsculos e aparados, sem nulo
--   midia_copiloto_parametros_vigencia_em_ordem .. vigencia_ate ≥ vigencia_desde
--   midia_copiloto_parametros_um_vigente ......... índice único: uma vigente por loja
--
--   midia_copiloto_diagnosticos_janela_valida .... de ≤ ate, no máximo 31 dias
--   midia_copiloto_diagnosticos_formas_validas ... dados, resumo e erros são objetos JSON
--
--   midia_copiloto_achados_regra_valida .......... a lista de REGRAS
--   midia_copiloto_achados_grupo_valido .......... nulo ou a lista de GRUPOS_DE_TERMO
--   midia_copiloto_achados_gravidade_valida ...... alta, media, baixa
--   midia_copiloto_achados_texto_valido .......... título de 1 a 200, detalhe até 2.000
--   midia_copiloto_achados_ordem_unica ........... (diagnostico, ordem)
--
--   midia_copiloto_acoes_tipo_valido ............. a lista de TIPOS_DE_ACAO
--   midia_copiloto_acoes_situacao_valida ......... a lista de SITUACOES_DA_ACAO
--   midia_copiloto_acoes_ids_validos ............. campanha e grupo são IDs numéricos do Google
--   midia_copiloto_acoes_alvo_do_tipo ............ cada tipo com o seu alvo, e só ele
--   midia_copiloto_acoes_negativa_cabe ........... 1 a 80 caracteres, até 10 palavras, aparada
--   midia_copiloto_acoes_verba_na_faixa .......... verbas > 0 e ≤ 100.000, a nova ≠ a atual
--   midia_copiloto_acoes_origem_do_tipo .......... vem de um diagnóstico (negativar, pausar,
--                                                  mudar verba) OU desfaz outra ação, nunca
--                                                  as duas; remover negativa e reativar
--                                                  grupo só nascem desfazendo
--   midia_copiloto_acoes_decisao_carimbada ....... fora de proposta/descartada, tem quem e quando
--   midia_copiloto_acoes_reserva_carimbada ....... do script em diante, tem a hora da reserva
--   midia_copiloto_acoes_conclusao_carimbada ..... concluída ⇔ tem a hora da conclusão
--   midia_copiloto_acoes_falha_explicada ......... falhou ⇒ tem o motivo
--   midia_copiloto_acoes_textos_curtos ........... motivo, nota, erro e descarte com teto
--   midia_copiloto_acoes_chave_aberta ............ índice único: uma aberta por (loja, chave)
--   midia_copiloto_acoes_transicao (gatilho) ..... o alvo não muda, as situações só andam
--                                                  para a frente, nada se apaga, e o
--                                                  desfazer espelha a ação aplicada
--
-- `midia_copiloto_parametros` é tabela de parâmetro (vigência, guarda
-- `nucleo_so_encerra_vigencia`). Diagnóstico e achado são append-only (gatilho
-- `midia_copiloto_imutavel`). A ação muda de situação por desenho, mas não de
-- alvo, e não some.
--
-- ---------------------------------------------------------------------------
-- Ordem de implantação (a migração NÃO foi aplicada em produção pelo PR)
-- ---------------------------------------------------------------------------
--   1. aplicar esta migração;  2. publicar o site;  3. colar o script novo na
--   conta do Google Ads. Script novo antes do site: a sincronização de hora em
--   hora segue, e só a parte do copiloto falha, com o motivo no registro.
--
-- ⚠️ DESFAZER (nada mais depende destes objetos; a trilha em auditoria_admin
--    fica, e os diagnósticos, propostas e resultados se perdem):
--
--   begin;
--   drop function if exists public.midia_copiloto_registrar_resultado(uuid, text, jsonb, text);
--   drop function if exists public.midia_copiloto_reservar_acoes(integer);
--   drop function if exists public.midia_copiloto_gravar_diagnostico(jsonb);
--   drop function if exists public.midia_copiloto_desfazer(uuid);
--   drop function if exists public.midia_copiloto_decidir(uuid[], text, text);
--   drop function if exists public.midia_copiloto_nova_vigencia(numeric, numeric, numeric, integer, integer, integer, integer, text[], text[], text[], integer);
--   drop table    if exists public.midia_copiloto_acoes;
--   drop function if exists public.midia_copiloto_acoes_transicao();
--   drop table    if exists public.midia_copiloto_achados;
--   drop table    if exists public.midia_copiloto_diagnosticos;
--   drop function if exists public.midia_copiloto_imutavel();
--   drop table    if exists public.midia_copiloto_parametros;
--   drop function if exists public.midia_copiloto_lista_valida(text[]);
--   delete from supabase_migrations.schema_migrations where version = '20261014150000';
--   commit;
--
-- Aditiva (quatro tabelas e oito funções novas; nenhuma coluna, policy ou
-- gatilho em tabela que já existia; `auditoria_admin` só recebe linhas;
-- `leads` e `estoque_motors` não são tocadas) e idempotente: `create table if
-- not exists`, `create index if not exists`, `create or replace`, `drop
-- constraint if exists` + `add constraint`, `drop policy if exists` + `create
-- policy`, `create or replace trigger`, semente só se não houver vigente,
-- revoke/grant e comment reaplicáveis.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Conferência prévia — o que este arquivo pressupõe
-- ----------------------------------------------------------------------------
do $previa$
begin
  if to_regprocedure('public.tem_papel(uuid, text)') is null
     or to_regprocedure('public.org_padrao()') is null
     or to_regprocedure('public.nucleo_so_encerra_vigencia()') is null then
    raise exception
      'DEPENDÊNCIA: falta tem_papel(uuid, text), org_padrao() ou nucleo_so_encerra_vigencia(). Nada foi aplicado.';
  end if;
  if public.org_padrao() is null then
    raise exception
      'DEPENDÊNCIA: org_padrao() devolveu null (public.orgs vazia). Nada foi aplicado.';
  end if;
  if to_regclass('public.auditoria_admin') is null then
    raise exception
      'DEPENDÊNCIA: public.auditoria_admin não existe (20260807120000). Nada foi aplicado.';
  end if;
end $previa$;


-- ----------------------------------------------------------------------------
-- 1. As regras da loja, com vigência
-- ----------------------------------------------------------------------------
create or replace function public.midia_copiloto_lista_valida(p text[])
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p is not null
     and coalesce(cardinality(p), 0) <= 200
     and not exists (
       select 1 from unnest(p) as x
        where x is null
           or x <> lower(btrim(x, E' \t\r\n'))
           or char_length(x) not between 2 and 60
     );
$$;

create table if not exists public.midia_copiloto_parametros (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null default public.org_padrao(),
  gasto_minimo_termo     numeric(10, 2) not null,
  gasto_minimo_grupo     numeric(10, 2) not null,
  gasto_minimo_campanha  numeric(10, 2) not null,
  ritmo_alto_pct         smallint not null,
  ritmo_baixo_pct        smallint not null,
  reducao_verba_pct      smallint not null,
  iq_baixo               smallint not null,
  concorrentes           text[] not null default '{}',
  cidades_fora           text[] not null default '{}',
  palavras_informativas  text[] not null default '{}',
  hora_do_diagnostico    smallint not null,
  criado_por             uuid,
  criado_por_nome        text,
  vigencia_desde         date not null default current_date,
  vigencia_ate           date,
  criado_em              timestamptz not null default now()
);

alter table public.midia_copiloto_parametros
  drop constraint if exists midia_copiloto_parametros_gastos_validos,
  drop constraint if exists midia_copiloto_parametros_ritmo_valido,
  drop constraint if exists midia_copiloto_parametros_reducao_valida,
  drop constraint if exists midia_copiloto_parametros_iq_valido,
  drop constraint if exists midia_copiloto_parametros_hora_valida,
  drop constraint if exists midia_copiloto_parametros_listas_validas,
  drop constraint if exists midia_copiloto_parametros_vigencia_em_ordem;
alter table public.midia_copiloto_parametros
  add constraint midia_copiloto_parametros_gastos_validos check (
        gasto_minimo_termo    > 0 and gasto_minimo_termo    <= 100000
    and gasto_minimo_grupo    > 0 and gasto_minimo_grupo    <= 100000
    and gasto_minimo_campanha > 0 and gasto_minimo_campanha <= 100000),
  add constraint midia_copiloto_parametros_ritmo_valido check (
    ritmo_baixo_pct >= 1 and ritmo_baixo_pct < ritmo_alto_pct and ritmo_alto_pct <= 100),
  add constraint midia_copiloto_parametros_reducao_valida check (
    reducao_verba_pct between 5 and 90),
  add constraint midia_copiloto_parametros_iq_valido check (
    iq_baixo between 1 and 10),
  add constraint midia_copiloto_parametros_hora_valida check (
    hora_do_diagnostico between 0 and 23),
  add constraint midia_copiloto_parametros_listas_validas check (
        public.midia_copiloto_lista_valida(concorrentes)
    and public.midia_copiloto_lista_valida(cidades_fora)
    and public.midia_copiloto_lista_valida(palavras_informativas)),
  add constraint midia_copiloto_parametros_vigencia_em_ordem check (
    vigencia_ate is null or vigencia_ate >= vigencia_desde);

-- D-T1.7: a linha vigente só aceita o encerramento da vigência.
create or replace trigger midia_copiloto_parametros_vigencia
  before update on public.midia_copiloto_parametros
  for each row execute function public.nucleo_so_encerra_vigencia();

create unique index if not exists midia_copiloto_parametros_um_vigente
  on public.midia_copiloto_parametros (org_id)
  where vigencia_ate is null;

-- A semente: só se a loja ainda não tem vigente. Concorrentes e cidades
-- VAZIOS — são da loja, e a loja os escreve na tela.
insert into public.midia_copiloto_parametros
  (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha,
   ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo,
   concorrentes, cidades_fora, palavras_informativas, hora_do_diagnostico,
   criado_por_nome)
select 10, 50, 100,
       90, 50, 30, 3,
       '{}', '{}',
       array['como', 'o que é', 'significado', 'manual', 'consumo', 'ficha técnica',
             'recall', 'defeito', 'defeitos', 'problema', 'problemas', 'reclame aqui',
             'reclamação', 'vale a pena', 'comparativo', 'review', 'download', 'pdf',
             'wikipedia', 'história', 'emprego', 'empregos', 'vaga', 'vagas',
             'trabalhe conosco', 'curso', 'peça', 'peças', 'oficina', 'mecânico',
             'pneu', 'óleo', 'multa', 'ipva', 'licenciamento', 'detran', 'aluguel',
             'alugar', 'locadora', 'miniatura', 'brinquedo', 'jogo', 'desenho',
             'papel de parede', 'wallpaper', 'grátis'],
       7,
       'Semente da migração 20261014150000'
 where not exists (select 1 from public.midia_copiloto_parametros
                    where org_id = public.org_padrao() and vigencia_ate is null);


-- ----------------------------------------------------------------------------
-- 2. O retrato da conta e o que as regras acharam — append-only
-- ----------------------------------------------------------------------------
create or replace function public.midia_copiloto_imutavel()
  returns trigger
  language plpgsql
as $$
begin
  raise exception '% é append-only: o retrato e o achado são a prova de por que a proposta nasceu.',
    tg_table_name using errcode = 'raise_exception';
end;
$$;

create table if not exists public.midia_copiloto_diagnosticos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default public.org_padrao(),
  conta        text not null,
  de           date not null,
  ate          date not null,
  previa       boolean not null default false,
  recebido_em  timestamptz not null default now(),
  dados        jsonb not null,
  resumo       jsonb not null,
  erros        jsonb not null default '{}'::jsonb
);

alter table public.midia_copiloto_diagnosticos
  drop constraint if exists midia_copiloto_diagnosticos_janela_valida,
  drop constraint if exists midia_copiloto_diagnosticos_formas_validas;
alter table public.midia_copiloto_diagnosticos
  add constraint midia_copiloto_diagnosticos_janela_valida check (
    de <= ate and ate - de <= 31),
  add constraint midia_copiloto_diagnosticos_formas_validas check (
        jsonb_typeof(dados)  = 'object'
    and jsonb_typeof(resumo) = 'object'
    and jsonb_typeof(erros)  = 'object');

create index if not exists midia_copiloto_diagnosticos_recebido_idx
  on public.midia_copiloto_diagnosticos (org_id, recebido_em desc);

create or replace trigger midia_copiloto_diagnosticos_imutavel
  before update or delete on public.midia_copiloto_diagnosticos
  for each row execute function public.midia_copiloto_imutavel();

create table if not exists public.midia_copiloto_achados (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default public.org_padrao(),
  diagnostico_id  uuid not null references public.midia_copiloto_diagnosticos (id),
  ordem           smallint not null,
  regra           text not null,
  grupo           text,
  gravidade       text not null,
  titulo          text not null,
  detalhe         text not null,
  evidencias      jsonb not null default '{}'::jsonb
);

alter table public.midia_copiloto_achados
  drop constraint if exists midia_copiloto_achados_regra_valida,
  drop constraint if exists midia_copiloto_achados_grupo_valido,
  drop constraint if exists midia_copiloto_achados_gravidade_valida,
  drop constraint if exists midia_copiloto_achados_texto_valido,
  drop constraint if exists midia_copiloto_achados_ordem_unica;
alter table public.midia_copiloto_achados
  add constraint midia_copiloto_achados_regra_valida check (
    regra in ('termos_sem_conversao', 'ritmo_de_verba', 'anuncios_parados',
              'medicao', 'cliques_e_leads', 'qualidade')),
  add constraint midia_copiloto_achados_grupo_valido check (
    grupo is null or grupo in ('concorrente', 'cidade', 'informativo', 'outros')),
  add constraint midia_copiloto_achados_gravidade_valida check (
    gravidade in ('alta', 'media', 'baixa')),
  add constraint midia_copiloto_achados_texto_valido check (
        char_length(btrim(titulo)) between 1 and 200
    and char_length(detalhe) <= 2000
    and jsonb_typeof(evidencias) = 'object'),
  add constraint midia_copiloto_achados_ordem_unica unique (diagnostico_id, ordem);

create or replace trigger midia_copiloto_achados_imutavel
  before update or delete on public.midia_copiloto_achados
  for each row execute function public.midia_copiloto_imutavel();


-- ----------------------------------------------------------------------------
-- 3. As propostas e as ações
-- ----------------------------------------------------------------------------
create table if not exists public.midia_copiloto_acoes (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null default public.org_padrao(),
  diagnostico_id       uuid references public.midia_copiloto_diagnosticos (id),
  achado_id            uuid references public.midia_copiloto_achados (id),
  desfaz_acao_id       uuid references public.midia_copiloto_acoes (id),
  chave                text not null,
  tipo                 text not null,
  campanha_id_externo  text not null,
  campanha_nome        text not null,
  grupo_id_externo     text,
  grupo_nome           text,
  texto                text,
  correspondencia      text,
  verba_atual          numeric(12, 2),
  verba_nova           numeric(12, 2),
  motivo               text not null,
  economia_7d          numeric(12, 2),
  evidencias           jsonb not null default '{}'::jsonb,
  situacao             text not null default 'proposta',
  proposta_em          timestamptz not null default now(),
  decidida_por         uuid,
  decidida_por_nome    text,
  decidida_em          timestamptz,
  nota                 text,
  descartada_motivo    text,
  reservada_em         timestamptz,
  tentativas           smallint not null default 0,
  concluida_em         timestamptz,
  lido_de_volta        jsonb,
  erro                 text
);

alter table public.midia_copiloto_acoes
  drop constraint if exists midia_copiloto_acoes_tipo_valido,
  drop constraint if exists midia_copiloto_acoes_situacao_valida,
  drop constraint if exists midia_copiloto_acoes_ids_validos,
  drop constraint if exists midia_copiloto_acoes_alvo_do_tipo,
  drop constraint if exists midia_copiloto_acoes_negativa_cabe,
  drop constraint if exists midia_copiloto_acoes_verba_na_faixa,
  drop constraint if exists midia_copiloto_acoes_origem_do_tipo,
  drop constraint if exists midia_copiloto_acoes_decisao_carimbada,
  drop constraint if exists midia_copiloto_acoes_reserva_carimbada,
  drop constraint if exists midia_copiloto_acoes_conclusao_carimbada,
  drop constraint if exists midia_copiloto_acoes_falha_explicada,
  drop constraint if exists midia_copiloto_acoes_textos_curtos;
alter table public.midia_copiloto_acoes
  add constraint midia_copiloto_acoes_tipo_valido check (
    tipo in ('negativar', 'remover_negativa', 'pausar_grupo', 'reativar_grupo', 'mudar_verba')),
  add constraint midia_copiloto_acoes_situacao_valida check (
    situacao in ('proposta', 'aprovada', 'recusada', 'descartada',
                 'em_aplicacao', 'aplicada', 'falhou', 'sem_efeito')),
  add constraint midia_copiloto_acoes_ids_validos check (
        campanha_id_externo ~ '^[0-9]{1,20}$'
    and (grupo_id_externo is null or grupo_id_externo ~ '^[0-9]{1,20}$')
    and char_length(btrim(campanha_nome)) between 1 and 300
    and char_length(chave) between 1 and 300),
  add constraint midia_copiloto_acoes_alvo_do_tipo check (
    case
      when tipo in ('negativar', 'remover_negativa') then
            texto is not null and correspondencia in ('exata', 'frase')
        and grupo_id_externo is null and verba_atual is null and verba_nova is null
      when tipo in ('pausar_grupo', 'reativar_grupo') then
            grupo_id_externo is not null and grupo_nome is not null
        and texto is null and correspondencia is null
        and verba_atual is null and verba_nova is null
      when tipo = 'mudar_verba' then
            verba_atual is not null and verba_nova is not null
        and grupo_id_externo is null and texto is null and correspondencia is null
      -- Tipo desconhecido é da regra de tipo, não desta.
      else true
    end),
  add constraint midia_copiloto_acoes_negativa_cabe check (
    texto is null or (
          texto = btrim(texto)
      and char_length(texto) between 1 and 80
      and cardinality(regexp_split_to_array(texto, '\s+')) <= 10)),
  add constraint midia_copiloto_acoes_verba_na_faixa check (
    (verba_atual is null or (verba_atual > 0 and verba_atual <= 100000))
    and (verba_nova is null or (verba_nova > 0 and verba_nova <= 100000))
    and (verba_nova is null or verba_nova <> verba_atual)),
  add constraint midia_copiloto_acoes_origem_do_tipo check (
    case
      when desfaz_acao_id is null then
        diagnostico_id is not null and tipo not in ('remover_negativa', 'reativar_grupo')
      else
        diagnostico_id is null and achado_id is null
    end),
  add constraint midia_copiloto_acoes_decisao_carimbada check (
    situacao in ('proposta', 'descartada')
    or (decidida_por is not null and decidida_em is not null)),
  add constraint midia_copiloto_acoes_reserva_carimbada check (
    situacao not in ('em_aplicacao', 'aplicada', 'falhou', 'sem_efeito')
    or reservada_em is not null),
  add constraint midia_copiloto_acoes_conclusao_carimbada check (
    (situacao in ('aplicada', 'falhou', 'sem_efeito')) = (concluida_em is not null)),
  add constraint midia_copiloto_acoes_falha_explicada check (
    situacao <> 'falhou' or char_length(btrim(coalesce(erro, ''))) > 0),
  add constraint midia_copiloto_acoes_textos_curtos check (
        char_length(btrim(motivo)) between 1 and 1000
    and (nota is null or char_length(nota) <= 500)
    and (erro is null or char_length(erro) <= 500)
    and (descartada_motivo is null or char_length(descartada_motivo) <= 300)
    and (economia_7d is null or economia_7d >= 0)
    and tentativas between 0 and 10
    and jsonb_typeof(evidencias) = 'object'
    and (lido_de_volta is null or jsonb_typeof(lido_de_volta) = 'object'));

-- Uma aberta por chave: a mesma negativa não espera aprovação duas vezes.
create unique index if not exists midia_copiloto_acoes_chave_aberta
  on public.midia_copiloto_acoes (org_id, chave)
  where situacao in ('proposta', 'aprovada', 'em_aplicacao');

create index if not exists midia_copiloto_acoes_situacao_idx
  on public.midia_copiloto_acoes (org_id, situacao, proposta_em desc);

create index if not exists midia_copiloto_acoes_desfaz_idx
  on public.midia_copiloto_acoes (desfaz_acao_id) where desfaz_acao_id is not null;

-- A frase da trilha — a mesma de `descreverAcao` em src/lib/copilotoDeMidia.ts.
create or replace function public.midia_copiloto_descrever(a public.midia_copiloto_acoes)
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select case a.tipo
    when 'negativar' then format('Negativar %s na campanha %s',
      case a.correspondencia when 'exata' then '[' || a.texto || ']' else '"' || a.texto || '"' end,
      a.campanha_nome)
    when 'remover_negativa' then format('Remover a negativa %s da campanha %s',
      case a.correspondencia when 'exata' then '[' || a.texto || ']' else '"' || a.texto || '"' end,
      a.campanha_nome)
    when 'pausar_grupo'   then format('Pausar o grupo %s (%s)', a.grupo_nome, a.campanha_nome)
    when 'reativar_grupo' then format('Reativar o grupo %s (%s)', a.grupo_nome, a.campanha_nome)
    when 'mudar_verba' then format('Verba de %s: R$ %s → R$ %s por dia', a.campanha_nome,
      replace(to_char(a.verba_atual, 'FM999999990.00'), '.', ','),
      replace(to_char(a.verba_nova,  'FM999999990.00'), '.', ','))
  end;
$$;

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
       or (v_origem.tipo = 'mudar_verba' and new.verba_nova is distinct from v_origem.verba_atual) then
      raise exception 'O desfazer tem de ser o inverso exato da ação %.', v_origem.id using errcode = 'raise_exception';
    end if;
    return new;
  end if;

  -- UPDATE: o alvo e a origem não mudam depois de propostos.
  if (new.org_id, new.diagnostico_id, new.achado_id, new.desfaz_acao_id, new.chave, new.tipo,
      new.campanha_id_externo, new.campanha_nome, new.grupo_id_externo, new.grupo_nome,
      new.texto, new.correspondencia, new.verba_atual, new.verba_nova, new.motivo,
      new.economia_7d, new.evidencias, new.proposta_em)
     is distinct from
     (old.org_id, old.diagnostico_id, old.achado_id, old.desfaz_acao_id, old.chave, old.tipo,
      old.campanha_id_externo, old.campanha_nome, old.grupo_id_externo, old.grupo_nome,
      old.texto, old.correspondencia, old.verba_atual, old.verba_nova, old.motivo,
      old.economia_7d, old.evidencias, old.proposta_em) then
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
-- 4. Quem lê e quem escreve
-- ----------------------------------------------------------------------------
-- O default ACL do Supabase concede tudo a anon, authenticated e service_role
-- (f0l); o que não se quer, sai por nome. A chave de serviço também perde a
-- escrita direta: um defeito numa rota não pula o gatilho nem a trilha.
revoke all on public.midia_copiloto_parametros, public.midia_copiloto_diagnosticos,
              public.midia_copiloto_achados, public.midia_copiloto_acoes
  from anon;
revoke insert, update, delete, truncate
  on public.midia_copiloto_parametros, public.midia_copiloto_diagnosticos,
     public.midia_copiloto_achados, public.midia_copiloto_acoes
  from authenticated, service_role;
grant select
  on public.midia_copiloto_parametros, public.midia_copiloto_diagnosticos,
     public.midia_copiloto_achados, public.midia_copiloto_acoes
  to authenticated, service_role;

alter table public.midia_copiloto_parametros   enable row level security;
alter table public.midia_copiloto_diagnosticos enable row level security;
alter table public.midia_copiloto_achados      enable row level security;
alter table public.midia_copiloto_acoes        enable row level security;

-- A linha "Aprovar mudanças do Copiloto de Mídia" da matriz
-- (PAPEIS_DO_COPILOTO): Administrador e Marketing. `tem_papel` já exige conta
-- ativa. Uma policy de SELECT por tabela, e nenhuma de escrita.
drop policy if exists midia_copiloto_parametros_leitura on public.midia_copiloto_parametros;
create policy midia_copiloto_parametros_leitura on public.midia_copiloto_parametros
  for select to authenticated
  using (org_id = public.org_padrao()
         and (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'marketing')));

drop policy if exists midia_copiloto_diagnosticos_leitura on public.midia_copiloto_diagnosticos;
create policy midia_copiloto_diagnosticos_leitura on public.midia_copiloto_diagnosticos
  for select to authenticated
  using (org_id = public.org_padrao()
         and (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'marketing')));

drop policy if exists midia_copiloto_achados_leitura on public.midia_copiloto_achados;
create policy midia_copiloto_achados_leitura on public.midia_copiloto_achados
  for select to authenticated
  using (org_id = public.org_padrao()
         and (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'marketing')));

drop policy if exists midia_copiloto_acoes_leitura on public.midia_copiloto_acoes;
create policy midia_copiloto_acoes_leitura on public.midia_copiloto_acoes
  for select to authenticated
  using (org_id = public.org_padrao()
         and (public.tem_papel(auth.uid(), 'admin') or public.tem_papel(auth.uid(), 'marketing')));


-- ----------------------------------------------------------------------------
-- 5. As portas do painel — sessão, papel conferido de novo, autoria carimbada
-- ----------------------------------------------------------------------------

-- 5a. Regras novas: encerra a vigente e abre a nova, junto.
create or replace function public.midia_copiloto_nova_vigencia(
  p_gasto_minimo_termo     numeric,
  p_gasto_minimo_grupo     numeric,
  p_gasto_minimo_campanha  numeric,
  p_ritmo_alto_pct         integer,
  p_ritmo_baixo_pct        integer,
  p_reducao_verba_pct      integer,
  p_iq_baixo               integer,
  p_concorrentes           text[],
  p_cidades_fora           text[],
  p_palavras_informativas  text[],
  p_hora_do_diagnostico    integer
)
returns public.midia_copiloto_parametros
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem     uuid := auth.uid();
  v_nome     text;
  v_vigente  uuid;
  v_nova     public.midia_copiloto_parametros;
begin
  if v_quem is null then
    raise exception 'Regras do copiloto sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;
  if not (public.tem_papel(v_quem, 'admin') or public.tem_papel(v_quem, 'marketing')) then
    raise exception 'Só Administrador ou Marketing mudam as regras do copiloto (matriz A17, "Aprovar mudanças do Copiloto de Mídia").'
      using errcode = '42501';
  end if;
  select nullif(btrim(full_name), '') into v_nome from public.profiles where id = v_quem;

  -- Trava a vigente: duas edições ao mesmo tempo não abrem duas vigências.
  select id into v_vigente
    from public.midia_copiloto_parametros
   where org_id = public.org_padrao() and vigencia_ate is null
   for update;
  if found then
    update public.midia_copiloto_parametros set vigencia_ate = current_date where id = v_vigente;
  end if;

  -- As listas: minúsculas, aparadas, sem vazio e sem repetido, na ordem em que
  -- vieram. O que sobrar fora da régua (1 caractere, mais de 60) o CHECK recusa.
  insert into public.midia_copiloto_parametros
    (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha,
     ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo,
     concorrentes, cidades_fora, palavras_informativas, hora_do_diagnostico,
     criado_por, criado_por_nome, vigencia_desde)
  select p_gasto_minimo_termo, p_gasto_minimo_grupo, p_gasto_minimo_campanha,
         p_ritmo_alto_pct, p_ritmo_baixo_pct, p_reducao_verba_pct, p_iq_baixo,
         l.concorrentes, l.cidades_fora, l.palavras_informativas, p_hora_do_diagnostico,
         v_quem, v_nome, current_date
    from (select
            (select coalesce(array_agg(x order by n), '{}') from (
               select lower(btrim(x, E' \t\r\n')) as x, min(n) as n
                 from unnest(p_concorrentes) with ordinality as u(x, n)
                where btrim(coalesce(x, ''), E' \t\r\n') <> ''
                group by 1) s) as concorrentes,
            (select coalesce(array_agg(x order by n), '{}') from (
               select lower(btrim(x, E' \t\r\n')) as x, min(n) as n
                 from unnest(p_cidades_fora) with ordinality as u(x, n)
                where btrim(coalesce(x, ''), E' \t\r\n') <> ''
                group by 1) s) as cidades_fora,
            (select coalesce(array_agg(x order by n), '{}') from (
               select lower(btrim(x, E' \t\r\n')) as x, min(n) as n
                 from unnest(p_palavras_informativas) with ordinality as u(x, n)
                where btrim(coalesce(x, ''), E' \t\r\n') <> ''
                group by 1) s) as palavras_informativas) l
  returning * into v_nova;

  insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
  values ('copiloto_regras',
          format('Regras do Copiloto de Mídia: termo %s, grupo %s, campanha %s; ritmo %s–%s%%; corte %s%%; IQ ≤ %s; %s concorrente(s), %s cidade(s), %s palavra(s) informativa(s); diagnóstico às %sh',
                 v_nova.gasto_minimo_termo, v_nova.gasto_minimo_grupo, v_nova.gasto_minimo_campanha,
                 v_nova.ritmo_baixo_pct, v_nova.ritmo_alto_pct, v_nova.reducao_verba_pct, v_nova.iq_baixo,
                 cardinality(v_nova.concorrentes), cardinality(v_nova.cidades_fora),
                 cardinality(v_nova.palavras_informativas), v_nova.hora_do_diagnostico),
          v_quem, v_nome);

  return v_nova;
end;
$fn$;

-- 5b. Aprovar ou recusar. Devolve quantas mudaram: a que já tinha mudado (outra
--     pessoa decidiu, o retrato novo substituiu) fica de fora sem erro.
create or replace function public.midia_copiloto_decidir(
  p_acoes    uuid[],
  p_decisao  text,
  p_nota     text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem  uuid := auth.uid();
  v_nome  text;
  v_nova  text;
  v_nota  text := nullif(btrim(coalesce(p_nota, ''), E' \t\r\n'), '');
  v_n     integer := 0;
  a       public.midia_copiloto_acoes;
begin
  if v_quem is null then
    raise exception 'Decisão do copiloto sem sessão: a autoria não pode ficar em branco nem ser declarada.'
      using errcode = '42501';
  end if;
  if not (public.tem_papel(v_quem, 'admin') or public.tem_papel(v_quem, 'marketing')) then
    raise exception 'Só Administrador ou Marketing aprovam mudanças do copiloto (matriz A17, "Aprovar mudanças do Copiloto de Mídia").'
      using errcode = '42501';
  end if;
  if p_decisao is null or p_decisao not in ('aprovar', 'recusar') then
    raise exception 'Decisão do copiloto é aprovar ou recusar (veio %).', p_decisao using errcode = '22023';
  end if;
  if p_acoes is null or cardinality(p_acoes) = 0 or cardinality(p_acoes) > 200 then
    raise exception 'Decisão do copiloto pede de 1 a 200 ações.' using errcode = '22023';
  end if;
  select nullif(btrim(full_name), '') into v_nome from public.profiles where id = v_quem;
  v_nova := case p_decisao when 'aprovar' then 'aprovada' else 'recusada' end;

  for a in
    select * from public.midia_copiloto_acoes
     where id = any (p_acoes)
       and org_id = public.org_padrao()
       and (situacao = 'proposta' or (p_decisao = 'recusar' and situacao = 'aprovada'))
     order by proposta_em, id
     for update
  loop
    update public.midia_copiloto_acoes
       set situacao = v_nova, decidida_por = v_quem, decidida_por_nome = v_nome,
           decidida_em = now(), nota = coalesce(v_nota, nota)
     where id = a.id;
    insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
    values (case v_nova when 'aprovada' then 'copiloto_aprovou' else 'copiloto_recusou' end,
            format('%s%s (ação %s)', public.midia_copiloto_descrever(a),
                   case when v_nota is null then '' else ' — ' || v_nota end, a.id),
            v_quem, v_nome);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;

-- 5c. Desfazer o que foi aplicado: cria o inverso, já aprovado por quem clicou.
create or replace function public.midia_copiloto_desfazer(p_acao uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quem  uuid := auth.uid();
  v_nome  text;
  v_id    uuid;
  a       public.midia_copiloto_acoes;
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

  insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
  values ('copiloto_desfez', format('Desfazer: %s (ação %s → %s)', public.midia_copiloto_descrever(a), a.id, v_id),
          v_quem, v_nome);
  return v_id;
end;
$fn$;

revoke all on function public.midia_copiloto_nova_vigencia(
  numeric, numeric, numeric, integer, integer, integer, integer, text[], text[], text[], integer)
  from public, anon;
revoke all on function public.midia_copiloto_decidir(uuid[], text, text) from public, anon;
revoke all on function public.midia_copiloto_desfazer(uuid) from public, anon;
grant execute on function public.midia_copiloto_nova_vigencia(
  numeric, numeric, numeric, integer, integer, integer, integer, text[], text[], text[], integer)
  to authenticated;
grant execute on function public.midia_copiloto_decidir(uuid[], text, text) to authenticated;
grant execute on function public.midia_copiloto_desfazer(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. As portas do script — só a chave de serviço
-- ----------------------------------------------------------------------------

-- 6a. O retrato, os achados e as propostas, numa transação.
--     Formato: `diagnosticoParaBanco` em src/lib/copilotoDeMidia.ts.
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

  -- O que ninguém decidiu ainda tem os números de ontem: sai de cena.
  update public.midia_copiloto_acoes
     set situacao = 'descartada',
         descartada_motivo = format('Substituída pelo diagnóstico de %s a %s.',
                                    to_char(v_de, 'DD/MM'), to_char(v_ate, 'DD/MM'))
   where org_id = v_org and situacao = 'proposta';
  get diagnostics v_descartadas = row_count;

  for x in select e from jsonb_array_elements(coalesce(p->'propostas', '[]'::jsonb)) as t(e) loop
    v_indice := (x->>'achado')::int;
    if v_indice is null or v_indice < 0 or v_indice >= coalesce(cardinality(v_achados), 0) then
      raise exception 'Proposta % aponta para o achado %, que não existe.', x->>'chave', x->>'achado'
        using errcode = '22023';
    end if;

    -- Aplicada, ou recusada, há menos de uma janela: não volta.
    if exists (select 1 from public.midia_copiloto_acoes a
                where a.org_id = v_org and a.chave = x->>'chave'
                  and ((a.situacao in ('aplicada', 'sem_efeito') and a.concluida_em > now() - v_janela)
                       or (a.situacao = 'recusada' and a.decidida_em > now() - v_janela))) then
      v_puladas := v_puladas + 1;
      continue;
    end if;

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
    on conflict (org_id, chave) where situacao in ('proposta', 'aprovada', 'em_aplicacao')
    do nothing;
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

-- 6b. O lote para o script: o aprovado, e o que foi entregue e ficou sem
--     resposta por 90 min (a rodada é de hora em hora; aplicar de novo é
--     inofensivo, porque o script confere o estado da conta antes de mexer).
--     Três entregas sem resposta viram falha, com o motivo escrito.
create or replace function public.midia_copiloto_reservar_acoes(p_limite integer default 50)
returns setof public.midia_copiloto_acoes
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 50);
begin
  update public.midia_copiloto_acoes
     set situacao = 'falhou', concluida_em = now(),
         erro = 'O script recebeu a ação 3 vezes e não devolveu o resultado. Confira a conta antes de aprovar de novo.'
   where org_id = public.org_padrao()
     and situacao = 'em_aplicacao'
     and reservada_em < now() - interval '90 minutes'
     and tentativas >= 3;

  return query
    update public.midia_copiloto_acoes a
       set situacao = 'em_aplicacao', reservada_em = now(), tentativas = a.tentativas + 1
     where a.id in (
       select id from public.midia_copiloto_acoes
        where org_id = public.org_padrao()
          and (situacao = 'aprovada'
               or (situacao = 'em_aplicacao' and reservada_em < now() - interval '90 minutes'))
        order by decidida_em, proposta_em, id
        limit v_lim
        for update skip locked)
    returning a.*;
end;
$fn$;

-- 6c. O que o script fez. Só fecha o que está em aplicação; devolve a situação
--     gravada, ou nulo quando não havia o que fechar (já fechada, ou de outra
--     loja) — a rota conta e segue.
create or replace function public.midia_copiloto_registrar_resultado(
  p_acao      uuid,
  p_situacao  text,
  p_lido      jsonb,
  p_erro      text
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a       public.midia_copiloto_acoes;
  v_erro  text := left(nullif(btrim(coalesce(p_erro, ''), E' \t\r\n'), ''), 500);
begin
  if p_situacao is null or p_situacao not in ('aplicada', 'falhou', 'sem_efeito') then
    raise exception 'Resultado do script é aplicada, falhou ou sem_efeito (veio %).', p_situacao
      using errcode = '22023';
  end if;
  if p_lido is not null and jsonb_typeof(p_lido) <> 'object' then
    raise exception 'O que o script leu de volta precisa ser um objeto JSON.' using errcode = '22023';
  end if;

  update public.midia_copiloto_acoes
     set situacao = p_situacao, concluida_em = now(),
         lido_de_volta = coalesce(p_lido, '{}'::jsonb),
         erro = case when p_situacao = 'falhou' then coalesce(v_erro, 'O script não disse por quê.') else v_erro end
   where id = p_acao and org_id = public.org_padrao() and situacao = 'em_aplicacao'
  returning * into a;
  if not found then
    return null;
  end if;

  insert into public.auditoria_admin (acao, detalhe, autor_id, autor_nome)
  values (case p_situacao when 'aplicada' then 'copiloto_aplicou'
                          when 'sem_efeito' then 'copiloto_ja_estava'
                          else 'copiloto_falhou' end,
          format('%s%s (ação %s)', public.midia_copiloto_descrever(a),
                 case when a.erro is null then '' else ' — ' || a.erro end, a.id),
          null, 'Script do Google Ads');
  return p_situacao;
end;
$fn$;

revoke all on function public.midia_copiloto_gravar_diagnostico(jsonb) from public, anon, authenticated;
revoke all on function public.midia_copiloto_reservar_acoes(integer) from public, anon, authenticated;
revoke all on function public.midia_copiloto_registrar_resultado(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.midia_copiloto_gravar_diagnostico(jsonb) to service_role;
grant execute on function public.midia_copiloto_reservar_acoes(integer) to service_role;
grant execute on function public.midia_copiloto_registrar_resultado(uuid, text, jsonb, text) to service_role;

-- As auxiliares: o CHECK e a frase. Nenhuma lê tabela; ficam fechadas ao anônimo.
revoke all on function public.midia_copiloto_lista_valida(text[]) from public, anon;
revoke all on function public.midia_copiloto_descrever(public.midia_copiloto_acoes) from public, anon;
grant execute on function public.midia_copiloto_lista_valida(text[]) to authenticated, service_role;
grant execute on function public.midia_copiloto_descrever(public.midia_copiloto_acoes) to authenticated, service_role;
revoke all on function public.midia_copiloto_imutavel() from public, anon, authenticated;
revoke all on function public.midia_copiloto_acoes_transicao() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. Para quem abrir o banco sem abrir o código
-- ----------------------------------------------------------------------------
comment on table public.midia_copiloto_parametros is
  'Regras do Copiloto de Mídia (2026-10-14), como DADO com vigência: mínimos de '
  'gasto para propor negativa, pausa de grupo e corte de verba; ritmo alto e '
  'baixo da verba; corte proposto; índice de qualidade baixo; hora do '
  'diagnóstico diário; e as listas que classificam termo de pesquisa '
  '(concorrentes, cidades fora da área, palavras informativas). Uma vigente por '
  'loja; valor vigente não sofre UPDATE (D-T1.7). A única escrita é '
  'midia_copiloto_nova_vigencia, de Administrador e Marketing. Ver '
  '20261014150000_copiloto_de_midia.sql.';
comment on table public.midia_copiloto_diagnosticos is
  'Um retrato por dia da conta do Google Ads, mandado pelo script da conta: '
  'termos de pesquisa, palavras-chave, anúncios e recursos com problema, ações '
  'de conversão, verbas e ritmo (dados), o resumo calculado com o cruzamento de '
  'leads (resumo) e as seções que o Google não deixou ler (erros). Append-only. '
  'Escrito só por midia_copiloto_gravar_diagnostico.';
comment on table public.midia_copiloto_achados is
  'O que as regras do copiloto acharam em cada retrato (src/lib/copilotoDeMidia.ts): '
  'regra, classe do termo, gravidade, texto e evidência. Append-only.';
comment on table public.midia_copiloto_acoes is
  'Propostas e ações do Copiloto de Mídia na conta do Google Ads: negativar, '
  'remover negativa (só como desfazer), pausar e reativar grupo, mudar verba. '
  'Nasce proposta; Administrador ou Marketing aprova (midia_copiloto_decidir, '
  'com trilha em auditoria_admin); o script reserva, aplica, lê de volta e '
  'registra. O alvo não muda depois de proposto, as situações só andam para a '
  'frente e nada se apaga (gatilho midia_copiloto_acoes_transicao).';
comment on column public.midia_copiloto_acoes.chave is
  'Identidade do alvo (ex.: negativar:<campanha>:exata:<texto>, verba:<campanha>). '
  'Uma aberta por chave; aplicada ou recusada há menos de uma janela não volta.';
comment on column public.midia_copiloto_acoes.lido_de_volta is
  'O que o script leu da conta DEPOIS de aplicar (a negativa existe, o grupo '
  'está pausado, a verba é tal). É a prova de que a mudança pegou.';
comment on column public.midia_copiloto_acoes.economia_7d is
  'O que o alvo gastou nos 7 dias sem converter (negativa, grupo) ou o que o '
  'corte tira da verba em 7 dias. Teto do que a mudança poupa, não promessa.';
comment on function public.midia_copiloto_decidir(uuid[], text, text) is
  'Aprovar ou recusar propostas (e desistir de aprovada que o script ainda não '
  'pegou). Sessão de Administrador ou Marketing; autoria carimbada; uma linha '
  'por ação em auditoria_admin. Devolve quantas mudaram.';
comment on function public.midia_copiloto_desfazer(uuid) is
  'Cria o inverso de uma ação aplicada, já aprovado por quem clicou. É o único '
  'caminho por onde uma negativa é removida.';


-- ============================================================================
-- 8. Autoconferência — pelo efeito, dentro de um bloco que se desfaz
-- ============================================================================
do $aceite$
declare
  falhas          int := 0;
  v_tabela        text;
  v_nome          text;
  v_n             bigint;
  v_uid           uuid;
  v_papel         text;
  v_ids           jsonb := '{}'::jsonb;
  v_cli           uuid := gen_random_uuid();     -- authenticated sem perfil: cliente
  v_antes         jsonb;
  v_depois        jsonb;
  v_restou        bigint;
  v_r1            jsonb;
  v_r2            jsonb;
  v_lote          jsonb;
  v_lote2         jsonb;
  v_p1            uuid;
  v_p2            uuid;
  v_p3            uuid;
  v_p4            uuid;
  v_desfaz        uuid;
  v_linha         public.midia_copiloto_acoes;
  v_par           public.midia_copiloto_parametros;
  v_caso          record;
  v_obtido        text;
  v_msg           text;
  -- o que a prova mediu, lido depois do rollback
  v_leituras      text := '';
  v_decidiu       text := '';
  v_regravou      text := '';
  v_reserva       text := '';
  v_resultado     text := '';
  v_transicoes    int := 0;
  v_transicoes_ok int := 0;
  v_desfazer      text := '';
  v_vigencia      text := '';
  v_regras        int := 0;
  v_regras_certas int := 0;
  v_trilha        bigint := -1;
begin
  -- 1 · As tabelas: RLS, comentário, uma policy de SELECT e nenhuma outra;
  --     anon sem nada; authenticated e chave de serviço só leem.
  foreach v_tabela in array array['midia_copiloto_parametros', 'midia_copiloto_diagnosticos',
                                  'midia_copiloto_achados', 'midia_copiloto_acoes'] loop
    if not exists (select 1 from pg_class where oid = ('public.' || v_tabela)::regclass and relrowsecurity) then
      falhas := falhas + 1; raise warning 'FALHOU: % sem RLS', v_tabela;
    end if;
    if obj_description(('public.' || v_tabela)::regclass, 'pg_class') is null then
      falhas := falhas + 1; raise warning 'FALHOU: % sem comentário', v_tabela;
    end if;
    select count(*) into v_n from pg_policies where schemaname = 'public' and tablename = v_tabela;
    if v_n <> 1 or not exists (select 1 from pg_policies
                                where schemaname = 'public' and tablename = v_tabela
                                  and policyname = v_tabela || '_leitura' and cmd = 'SELECT'
                                  and roles = '{authenticated}') then
      falhas := falhas + 1; raise warning 'FALHOU: % deveria ter só a policy de leitura (achei %)', v_tabela, v_n;
    end if;
    if has_table_privilege('anon', 'public.' || v_tabela, 'SELECT') then
      falhas := falhas + 1; raise warning 'FALHOU: anon lê %', v_tabela;
    end if;
    foreach v_papel in array array['authenticated', 'service_role'] loop
      if not has_table_privilege(v_papel, 'public.' || v_tabela, 'SELECT')
         or has_table_privilege(v_papel, 'public.' || v_tabela, 'INSERT')
         or has_table_privilege(v_papel, 'public.' || v_tabela, 'UPDATE')
         or has_table_privilege(v_papel, 'public.' || v_tabela, 'DELETE')
         or has_table_privilege(v_papel, 'public.' || v_tabela, 'TRUNCATE') then
        falhas := falhas + 1; raise warning 'FALHOU: % deveria só ler %', v_papel, v_tabela;
      end if;
    end loop;
  end loop;

  -- 2 · As funções: as do painel para authenticated, as do script só para a
  --     chave de serviço, nenhuma para anon.
  for v_caso in
    select * from (values
      ('public.midia_copiloto_nova_vigencia(numeric, numeric, numeric, integer, integer, integer, integer, text[], text[], text[], integer)', true,  false),
      ('public.midia_copiloto_decidir(uuid[], text, text)',                                     true,  false),
      ('public.midia_copiloto_desfazer(uuid)',                                                  true,  false),
      ('public.midia_copiloto_gravar_diagnostico(jsonb)',                                       false, true),
      ('public.midia_copiloto_reservar_acoes(integer)',                                         false, true),
      ('public.midia_copiloto_registrar_resultado(uuid, text, jsonb, text)',                    false, true)
    ) as t(fn, painel, script)
  loop
    if has_function_privilege('anon', v_caso.fn, 'execute')
       or has_function_privilege('authenticated', v_caso.fn, 'execute') <> v_caso.painel
       or (v_caso.script and not has_function_privilege('service_role', v_caso.fn, 'execute')) then
      falhas := falhas + 1; raise warning 'FALHOU: privilégio de execução errado em %', v_caso.fn;
    end if;
  end loop;

  -- 3 · As regras nomeadas existem, são CHECK e estão validadas.
  foreach v_nome in array array[
    'midia_copiloto_parametros_gastos_validos', 'midia_copiloto_parametros_ritmo_valido',
    'midia_copiloto_parametros_reducao_valida', 'midia_copiloto_parametros_iq_valido',
    'midia_copiloto_parametros_hora_valida', 'midia_copiloto_parametros_listas_validas',
    'midia_copiloto_parametros_vigencia_em_ordem',
    'midia_copiloto_diagnosticos_janela_valida', 'midia_copiloto_diagnosticos_formas_validas',
    'midia_copiloto_achados_regra_valida', 'midia_copiloto_achados_grupo_valido',
    'midia_copiloto_achados_gravidade_valida', 'midia_copiloto_achados_texto_valido',
    'midia_copiloto_acoes_tipo_valido', 'midia_copiloto_acoes_situacao_valida',
    'midia_copiloto_acoes_ids_validos', 'midia_copiloto_acoes_alvo_do_tipo',
    'midia_copiloto_acoes_negativa_cabe', 'midia_copiloto_acoes_verba_na_faixa',
    'midia_copiloto_acoes_origem_do_tipo', 'midia_copiloto_acoes_decisao_carimbada',
    'midia_copiloto_acoes_reserva_carimbada', 'midia_copiloto_acoes_conclusao_carimbada',
    'midia_copiloto_acoes_falha_explicada', 'midia_copiloto_acoes_textos_curtos'
  ] loop
    if not exists (select 1 from pg_constraint where conname = v_nome and contype = 'c' and convalidated) then
      falhas := falhas + 1; raise warning 'FALHOU: regra % ausente, não é CHECK ou não está validada', v_nome;
    end if;
  end loop;

  -- 4 · A semente: uma vigente para a loja, com as listas da loja vazias.
  select * into v_par from public.midia_copiloto_parametros
   where org_id = public.org_padrao() and vigencia_ate is null;
  if not found or cardinality(v_par.concorrentes) <> 0 or cardinality(v_par.cidades_fora) <> 0
     or cardinality(v_par.palavras_informativas) < 20 then
    falhas := falhas + 1; raise warning 'FALHOU: semente ausente, ou com concorrente/cidade, ou sem palavras informativas';
  end if;

  select jsonb_build_object(
           'par', (select count(*) from public.midia_copiloto_parametros),
           'diag', (select count(*) from public.midia_copiloto_diagnosticos),
           'ach', (select count(*) from public.midia_copiloto_achados),
           'aco', (select count(*) from public.midia_copiloto_acoes),
           'aud', (select count(*) from public.auditoria_admin))
    into v_antes;

  -- 5 · Efeito. Tudo daqui até o sentinela é desfeito.
  begin
    foreach v_papel in array array['admin', 'marketing', 'comercial', 'desativado'] loop
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
              'authenticated', 'authenticated',
              'aceite-copiloto-' || v_papel || '@exemplo.invalido', now(), now())
      returning id into v_uid;
      update public.profiles
         set full_name = 'Aceite Copiloto ' || v_papel,
             papeis    = array[case when v_papel = 'desativado' then 'marketing' else v_papel end],
             role      = case when v_papel = 'desativado' then 'marketing' else v_papel end,
             is_active = (v_papel <> 'desativado')
       where id = v_uid;
      v_ids := v_ids || jsonb_build_object(v_papel, v_uid);
    end loop;

    -- 5a · O primeiro retrato: dois achados, quatro propostas.
    v_lote := jsonb_build_object(
      'conta', '123-456-7890', 'de', '2026-10-06', 'ate', '2026-10-12', 'previa', false,
      'dados', '{"termos": []}'::jsonb, 'resumo', '{"custo7": 357}'::jsonb, 'erros', '{}'::jsonb,
      'achados', jsonb_build_array(
        jsonb_build_object('regra', 'termos_sem_conversao', 'grupo', 'informativo', 'gravidade', 'alta',
                           'titulo', 'Informativo', 'detalhe', 'aceite', 'evidencias', '{}'::jsonb),
        jsonb_build_object('regra', 'ritmo_de_verba', 'grupo', null, 'gravidade', 'media',
                           'titulo', 'Ritmo', 'detalhe', 'aceite', 'evidencias', '{}'::jsonb)),
      'propostas', jsonb_build_array(
        jsonb_build_object('achado', 0, 'chave', 'negativar:111:exata:como vender carro', 'tipo', 'negativar',
                           'campanha_id_externo', '111', 'campanha_nome', 'Pesquisa', 'texto', 'como vender carro',
                           'correspondencia', 'exata', 'motivo', 'aceite', 'economia_7d', 12.5, 'evidencias', '{}'::jsonb),
        jsonb_build_object('achado', 1, 'chave', 'pausar_grupo:222', 'tipo', 'pausar_grupo',
                           'campanha_id_externo', '111', 'campanha_nome', 'Pesquisa', 'grupo_id_externo', '222',
                           'grupo_nome', 'Grupo', 'motivo', 'aceite', 'economia_7d', 80, 'evidencias', '{}'::jsonb),
        jsonb_build_object('achado', 1, 'chave', 'verba:111', 'tipo', 'mudar_verba',
                           'campanha_id_externo', '111', 'campanha_nome', 'Pesquisa', 'verba_atual', 50,
                           'verba_nova', 35, 'motivo', 'aceite', 'economia_7d', 105, 'evidencias', '{}'::jsonb),
        jsonb_build_object('achado', 0, 'chave', 'negativar:111:frase:cidade vizinha', 'tipo', 'negativar',
                           'campanha_id_externo', '111', 'campanha_nome', 'Pesquisa', 'texto', 'cidade vizinha',
                           'correspondencia', 'frase', 'motivo', 'aceite', 'economia_7d', 3, 'evidencias', '{}'::jsonb)));

    set local role service_role;
    v_r1 := public.midia_copiloto_gravar_diagnostico(v_lote);
    reset role;
    select id into v_p1 from public.midia_copiloto_acoes where chave = 'negativar:111:exata:como vender carro';
    select id into v_p2 from public.midia_copiloto_acoes where chave = 'pausar_grupo:222';
    select id into v_p3 from public.midia_copiloto_acoes where chave = 'verba:111';
    select id into v_p4 from public.midia_copiloto_acoes where chave = 'negativar:111:frase:cidade vizinha';

    -- 5b · Quem lê: admin e marketing veem as quatro; comercial, marketing
    --      desativado e cliente não veem nada; anon leva 42501.
    for v_caso in
      select * from (values ('admin'), ('marketing'), ('comercial'), ('desativado'), ('cliente'), ('anon')) as t(quem)
    loop
      begin
        if v_caso.quem = 'anon' then
          set local role anon;
        else
          perform set_config('request.jwt.claims',
            json_build_object('sub', coalesce((v_ids->>v_caso.quem)::uuid, v_cli), 'role', 'authenticated')::text, true);
          set local role authenticated;
        end if;
        select count(*) into v_n from public.midia_copiloto_acoes;
        reset role;
        v_obtido := v_n::text;
      exception when insufficient_privilege then
        v_obtido := 'negado';
      end;
      perform set_config('request.jwt.claims', '', true);
      v_leituras := v_leituras || v_caso.quem || ':' || v_obtido || ' ';
    end loop;

    -- 5c · Escrita direta: negada até para quem aprova, e para a chave de serviço.
    for v_caso in
      select * from (values
        ('marketing', 'update public.midia_copiloto_acoes set situacao = ''aprovada'''),
        ('marketing', 'delete from public.midia_copiloto_acoes'),
        ('admin',     'insert into public.midia_copiloto_parametros (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha, ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo, hora_do_diagnostico) values (1, 1, 1, 90, 50, 30, 3, 7)'),
        ('service',   'update public.midia_copiloto_acoes set situacao = ''aprovada''')
      ) as t(quem, comando)
    loop
      begin
        if v_caso.quem = 'service' then
          set local role service_role;
        else
          perform set_config('request.jwt.claims',
            json_build_object('sub', (v_ids->>v_caso.quem)::uuid, 'role', 'authenticated')::text, true);
          set local role authenticated;
        end if;
        execute v_caso.comando;
        reset role;
        v_obtido := 'escreveu';
      exception when insufficient_privilege then
        v_obtido := 'negado';
      end;
      perform set_config('request.jwt.claims', '', true);
      v_leituras := v_leituras || 'escrita-' || v_caso.quem || ':' || v_obtido || ' ';
    end loop;

    -- 5d · Decidir: o comercial leva 42501; o marketing aprova duas (carimbo
    --      dele); o admin recusa a verba; aprovar o que já mudou não conta.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.midia_copiloto_decidir(array[v_p1], 'aprovar');
      reset role;
      v_decidiu := v_decidiu || 'comercial:decidiu ';
    exception when insufficient_privilege then
      v_decidiu := v_decidiu || 'comercial:negado ';
    end;
    perform set_config('request.jwt.claims', '', true);

    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_decidiu := v_decidiu || 'marketing:' || public.midia_copiloto_decidir(array[v_p1, v_p2], 'aprovar', 'ok') || ' ';
    v_decidiu := v_decidiu || 'denovo:' || public.midia_copiloto_decidir(array[v_p1], 'aprovar') || ' ';
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'admin')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_decidiu := v_decidiu || 'admin:' || public.midia_copiloto_decidir(array[v_p3], 'recusar') || ' ';
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select * into v_linha from public.midia_copiloto_acoes where id = v_p1;
    v_decidiu := v_decidiu || 'carimbo:' || (v_linha.decidida_por = (v_ids->>'marketing')::uuid
                                             and v_linha.decidida_por_nome = 'Aceite Copiloto marketing'
                                             and v_linha.nota = 'ok') || ' ';
    select count(*) into v_n from public.auditoria_admin
     where acao in ('copiloto_aprovou', 'copiloto_recusou') and autor_id in ((v_ids->>'marketing')::uuid, (v_ids->>'admin')::uuid);
    v_decidiu := v_decidiu || 'trilha:' || v_n;

    -- 5e · O segundo retrato: a pendente (p4) é substituída e volta como nova;
    --      a aprovada (p1) não é proposta de novo; a recusada (p3) não volta
    --      dentro da janela; a nova (p5) entra.
    v_lote2 := jsonb_set(v_lote, '{propostas}', jsonb_build_array(
      v_lote->'propostas'->0, v_lote->'propostas'->2, v_lote->'propostas'->3,
      jsonb_build_object('achado', 1, 'chave', 'pausar_grupo:333', 'tipo', 'pausar_grupo',
                         'campanha_id_externo', '111', 'campanha_nome', 'Pesquisa', 'grupo_id_externo', '333',
                         'grupo_nome', 'Outro grupo', 'motivo', 'aceite', 'economia_7d', 60, 'evidencias', '{}'::jsonb)));
    set local role service_role;
    v_r2 := public.midia_copiloto_gravar_diagnostico(v_lote2);
    reset role;
    v_regravou := format('propostas:%s puladas:%s descartadas:%s p4:%s abertas_vizinha:%s',
      v_r2->>'propostas', v_r2->>'puladas', v_r2->>'descartadas',
      (select situacao from public.midia_copiloto_acoes where id = v_p4),
      (select count(*) from public.midia_copiloto_acoes where chave = 'negativar:111:frase:cidade vizinha' and situacao = 'proposta'));

    -- 5f · Reservar: as duas aprovadas, uma vez só.
    set local role service_role;
    select string_agg(chave, ',' order by chave) into v_reserva from public.midia_copiloto_reservar_acoes(50);
    select count(*) into v_n from public.midia_copiloto_reservar_acoes(50);
    reset role;
    v_reserva := v_reserva || ' segunda:' || v_n;

    -- 5g · Resultado: p1 aplicada (com o que leu), p2 falhou sem dizer por quê
    --      ganha o motivo padrão; registrar de novo não muda nada.
    set local role service_role;
    v_resultado := coalesce(public.midia_copiloto_registrar_resultado(v_p1, 'aplicada', '{"existe": true}'::jsonb, null), 'nulo')
      || ' ' || coalesce(public.midia_copiloto_registrar_resultado(v_p2, 'falhou', null, '  '), 'nulo')
      || ' ' || coalesce(public.midia_copiloto_registrar_resultado(v_p1, 'falhou', null, 'x'), 'nulo');
    reset role;
    select * into v_linha from public.midia_copiloto_acoes where id = v_p2;
    v_resultado := v_resultado || ' erro:' || (v_linha.erro is not null) || ' lido:'
      || (select lido_de_volta->>'existe' from public.midia_copiloto_acoes where id = v_p1);
    select count(*) into v_trilha from public.auditoria_admin
     where acao in ('copiloto_aplicou', 'copiloto_falhou') and autor_nome = 'Script do Google Ads';

    -- 5h · Transições proibidas (sem sessão, como dono: só o gatilho fala).
    for v_caso in
      select * from (values
        (format('update public.midia_copiloto_acoes set situacao = ''aprovada'' where id = %L', v_p1)),
        (format('update public.midia_copiloto_acoes set texto = ''outro'' where id = %L', v_p1)),
        (format('update public.midia_copiloto_acoes set verba_nova = 1 where id = %L', v_p3)),
        (format('delete from public.midia_copiloto_acoes where id = %L', v_p3)),
        (format('update public.midia_copiloto_acoes set situacao = ''aplicada'', concluida_em = now(), reservada_em = now() where chave = %L and situacao = ''proposta''', 'pausar_grupo:333')),
        ('insert into public.midia_copiloto_acoes (diagnostico_id, chave, tipo, campanha_id_externo, campanha_nome, texto, correspondencia, motivo, situacao, decidida_por, decidida_em)
           select id, ''x'', ''negativar'', ''1'', ''c'', ''x'', ''exata'', ''m'', ''aprovada'', gen_random_uuid(), now() from public.midia_copiloto_diagnosticos limit 1'),
        (format('insert into public.midia_copiloto_acoes (desfaz_acao_id, chave, tipo, campanha_id_externo, campanha_nome, texto, correspondencia, motivo, situacao, decidida_por, decidida_em) values (%L, ''y'', ''remover_negativa'', ''111'', ''Pesquisa'', ''outra coisa'', ''exata'', ''m'', ''aprovada'', gen_random_uuid(), now())', v_p1)),
        ('update public.midia_copiloto_diagnosticos set conta = ''0'''),
        ('delete from public.midia_copiloto_achados')
      ) as t(comando)
    loop
      v_transicoes := v_transicoes + 1;
      begin
        execute v_caso.comando;
      exception when raise_exception then
        v_transicoes_ok := v_transicoes_ok + 1;
      end;
    end loop;

    -- 5i · Desfazer: p1 aplicada vira remover_negativa aprovada, no mesmo alvo;
    --      desfazer de novo e desfazer o que falhou são recusados.
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_desfaz := public.midia_copiloto_desfazer(v_p1);
    reset role;
    select * into v_linha from public.midia_copiloto_acoes where id = v_desfaz;
    v_desfazer := format('%s/%s/%s/%s', v_linha.tipo, v_linha.situacao, v_linha.texto, v_linha.correspondencia);
    foreach v_uid in array array[v_p1, v_p2] loop
      begin
        set local role authenticated;
        perform public.midia_copiloto_desfazer(v_uid);
        reset role;
        v_desfazer := v_desfazer || ' aceitou';
      exception when invalid_parameter_value then
        v_desfazer := v_desfazer || ' recusou';
      end;
    end loop;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- 5j · Regras novas: o comercial leva 42501; o marketing abre vigência nova
    --      (listas normalizadas) e encerra a anterior; ritmo invertido cai na regra.
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', (v_ids->>'comercial')::uuid, 'role', 'authenticated')::text, true);
      set local role authenticated;
      perform public.midia_copiloto_nova_vigencia(10, 50, 100, 90, 50, 30, 3, '{}', '{}', '{}', 7);
      reset role;
      v_vigencia := 'comercial:abriu ';
    exception when insufficient_privilege then
      v_vigencia := 'comercial:negado ';
    end;
    perform set_config('request.jwt.claims',
      json_build_object('sub', (v_ids->>'marketing')::uuid, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_par := public.midia_copiloto_nova_vigencia(15, 60, 120, 85, 40, 25, 4,
               array['  Loja Rival ', 'loja rival', '', null], array['Cidade Vizinha'], array['como'], 6);
    reset role;
    v_vigencia := v_vigencia || format('concorrentes:%s cidades:%s vigentes:%s',
      array_to_string(v_par.concorrentes, '|'), array_to_string(v_par.cidades_fora, '|'),
      (select count(*) from public.midia_copiloto_parametros where org_id = public.org_padrao() and vigencia_ate is null));
    begin
      set local role authenticated;
      perform public.midia_copiloto_nova_vigencia(15, 60, 120, 40, 85, 25, 4, '{}', '{}', '{}', 6);
      reset role;
      v_vigencia := v_vigencia || ' ritmo:aceitou';
    exception when check_violation then
      get stacked diagnostics v_msg = constraint_name;
      v_vigencia := v_vigencia || ' ritmo:' || v_msg;
    end;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- 5k · Cada regra, tentando gravar o inválido como dono (só o CHECK fala).
    for v_caso in
      select * from (values
        ('midia_copiloto_acoes_tipo_valido',         'apagar_campanha', '111', null::text, 'x', 'exata', null::numeric, null::numeric),
        ('midia_copiloto_acoes_ids_validos',         'negativar', 'abc', null, 'x', 'exata', null, null),
        ('midia_copiloto_acoes_alvo_do_tipo',        'negativar', '111', null, null, 'exata', null, null),
        ('midia_copiloto_acoes_alvo_do_tipo',        'negativar', '111', null, 'x', 'ampla', null, null),
        ('midia_copiloto_acoes_alvo_do_tipo',        'pausar_grupo', '111', null, null, null, null, null),
        ('midia_copiloto_acoes_alvo_do_tipo',        'mudar_verba', '111', null, null, null, 10, null),
        ('midia_copiloto_acoes_negativa_cabe',       'negativar', '111', null, ' x', 'exata', null, null),
        ('midia_copiloto_acoes_negativa_cabe',       'negativar', '111', null, 'a b c d e f g h i j k', 'exata', null, null),
        ('midia_copiloto_acoes_verba_na_faixa',      'mudar_verba', '111', null, null, null, 10, 10),
        ('midia_copiloto_acoes_verba_na_faixa',      'mudar_verba', '111', null, null, null, 10, 0),
        ('midia_copiloto_acoes_origem_do_tipo',      'remover_negativa', '111', null, 'x', 'exata', null, null),
        ('midia_copiloto_acoes_origem_do_tipo',      'reativar_grupo', '111', '222', null, null, null, null)
      ) as t(regra, tipo, campanha, grupo, texto, corr, verba_atual, verba_nova)
    loop
      v_regras := v_regras + 1;
      begin
        insert into public.midia_copiloto_acoes
          (diagnostico_id, chave, tipo, campanha_id_externo, campanha_nome, grupo_id_externo, grupo_nome,
           texto, correspondencia, verba_atual, verba_nova, motivo)
        select id, 'regra-' || v_regras, v_caso.tipo, v_caso.campanha, 'c', v_caso.grupo,
               case when v_caso.grupo is null then null else 'g' end,
               v_caso.texto, v_caso.corr, v_caso.verba_atual, v_caso.verba_nova, 'm'
          from public.midia_copiloto_diagnosticos limit 1;
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = v_caso.regra then v_regras_certas := v_regras_certas + 1;
        else raise warning 'regra %: caiu em %', v_caso.regra, v_msg; end if;
      end;
    end loop;
    for v_caso in
      select * from (values
        ('midia_copiloto_parametros_listas_validas', 'insert into public.midia_copiloto_parametros (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha, ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo, hora_do_diagnostico, concorrentes, vigencia_ate) values (1, 1, 1, 90, 50, 30, 3, 7, array[''Maiúscula''], current_date)'),
        ('midia_copiloto_parametros_reducao_valida', 'insert into public.midia_copiloto_parametros (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha, ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo, hora_do_diagnostico, vigencia_ate) values (1, 1, 1, 90, 50, 95, 3, 7, current_date)'),
        ('midia_copiloto_parametros_gastos_validos', 'insert into public.midia_copiloto_parametros (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha, ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo, hora_do_diagnostico, vigencia_ate) values (0, 1, 1, 90, 50, 30, 3, 7, current_date)'),
        ('midia_copiloto_parametros_hora_valida',    'insert into public.midia_copiloto_parametros (gasto_minimo_termo, gasto_minimo_grupo, gasto_minimo_campanha, ritmo_alto_pct, ritmo_baixo_pct, reducao_verba_pct, iq_baixo, hora_do_diagnostico, vigencia_ate) values (1, 1, 1, 90, 50, 30, 3, 24, current_date)'),
        ('midia_copiloto_achados_gravidade_valida',  'insert into public.midia_copiloto_achados (diagnostico_id, ordem, regra, gravidade, titulo, detalhe) select id, 99, ''medicao'', ''urgente'', ''t'', ''d'' from public.midia_copiloto_diagnosticos limit 1'),
        ('midia_copiloto_diagnosticos_janela_valida', 'insert into public.midia_copiloto_diagnosticos (conta, de, ate, dados, resumo) values (''1'', ''2026-10-12'', ''2026-10-06'', ''{}'', ''{}'')')
      ) as t(regra, comando)
    loop
      v_regras := v_regras + 1;
      begin
        execute v_caso.comando;
      exception when check_violation then
        get stacked diagnostics v_msg = constraint_name;
        if v_msg = v_caso.regra then v_regras_certas := v_regras_certas + 1;
        else raise warning 'regra %: caiu em %', v_caso.regra, v_msg; end if;
      end;
    end loop;

    raise exception 'DESFAZER_ACEITE_COPILOTO' using errcode = 'PCP02';
  exception
    -- O sentinela, e só ele. Qualquer outro erro sobe e para a migração.
    when sqlstate 'PCP02' then null;
  end;

  -- O veredito, lido das variáveis que sobreviveram ao rollback.
  if v_ids->>'marketing' is null then
    raise exception 'ACEITE FALHOU: a sonda não chegou a criar os usuários — nada foi provado';
  end if;
  if (v_r1->>'achados')::int <> 2 or (v_r1->>'propostas')::int <> 4 then
    falhas := falhas + 1; raise warning 'FALHOU: primeiro retrato gravou %', v_r1;
  end if;
  if v_leituras <> 'admin:4 marketing:4 comercial:0 desativado:0 cliente:0 anon:negado '
                   'escrita-marketing:negado escrita-marketing:negado escrita-admin:negado escrita-service:negado ' then
    falhas := falhas + 1; raise warning 'FALHOU: leitura e escrita direta — %', v_leituras;
  end if;
  if v_decidiu <> 'comercial:negado marketing:2 denovo:0 admin:1 carimbo:true trilha:3' then
    falhas := falhas + 1; raise warning 'FALHOU: decidir — %', v_decidiu;
  end if;
  if v_regravou <> 'propostas:2 puladas:2 descartadas:1 p4:descartada abertas_vizinha:1' then
    falhas := falhas + 1; raise warning 'FALHOU: segundo retrato — %', v_regravou;
  end if;
  if v_reserva <> 'negativar:111:exata:como vender carro,pausar_grupo:222 segunda:0' then
    falhas := falhas + 1; raise warning 'FALHOU: reserva — %', v_reserva;
  end if;
  if v_resultado <> 'aplicada falhou nulo erro:true lido:true' or v_trilha <> 2 then
    falhas := falhas + 1; raise warning 'FALHOU: resultado — % (trilha do script: %)', v_resultado, v_trilha;
  end if;
  if v_transicoes_ok <> v_transicoes or v_transicoes < 9 then
    falhas := falhas + 1; raise warning 'FALHOU: transições — % de % recusadas pelo gatilho', v_transicoes_ok, v_transicoes;
  end if;
  if v_desfazer <> 'remover_negativa/aprovada/como vender carro/exata recusou recusou' then
    falhas := falhas + 1; raise warning 'FALHOU: desfazer — %', v_desfazer;
  end if;
  if v_vigencia <> 'comercial:negado concorrentes:loja rival cidades:cidade vizinha vigentes:1 ritmo:midia_copiloto_parametros_ritmo_valido' then
    falhas := falhas + 1; raise warning 'FALHOU: regras novas — %', v_vigencia;
  end if;
  if v_regras < 18 or v_regras_certas <> v_regras then
    falhas := falhas + 1; raise warning 'FALHOU: regras — % de % recusas pela regra certa', v_regras_certas, v_regras;
  end if;

  -- Nada da prova ficou.
  select jsonb_build_object(
           'par', (select count(*) from public.midia_copiloto_parametros),
           'diag', (select count(*) from public.midia_copiloto_diagnosticos),
           'ach', (select count(*) from public.midia_copiloto_achados),
           'aco', (select count(*) from public.midia_copiloto_acoes),
           'aud', (select count(*) from public.auditoria_admin))
    into v_depois;
  select count(*) into v_restou from auth.users where email like 'aceite-copiloto-%@exemplo.invalido';
  if v_depois <> v_antes or v_restou <> 0 then
    falhas := falhas + 1; raise warning 'FALHOU: a prova deixou rastro (% → %, % usuário(s))', v_antes, v_depois, v_restou;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) no Copiloto de Mídia', falhas;
  end if;

  raise notice
    'Aceite verificado: as quatro tabelas do Copiloto de Mídia têm RLS, comentário '
    'e só a policy de leitura; anon não lê; o painel e a chave de serviço só leem '
    '(escrita direta é 42501); as funções do painel são de authenticated e as do '
    'script só da chave de serviço; a semente traz concorrentes e cidades vazios. '
    'Admin e marketing leem as propostas, e comercial, marketing desativado e '
    'cliente não veem nada; o comercial não decide (42501), o marketing aprova com '
    'o carimbo dele e a trilha registra cada decisão; o segundo retrato substitui a '
    'pendente, não repete a aberta nem a recusada e traz a nova; a reserva entrega '
    'as aprovadas uma vez só; o resultado fecha a ação com o que o script leu, dá '
    'motivo à falha muda e não reabre a fechada; o gatilho recusa voltar situação, '
    'mudar o alvo, apagar, nascer aprovada e remover negativa que não é o inverso '
    'exato; o desfazer cria o inverso aprovado e não desfaz duas vezes nem o que '
    'falhou; as regras novas são de admin e marketing, normalizam as listas, deixam '
    'uma vigente e recusam ritmo invertido; % tentativas inválidas caem na regra '
    'certa; a prova não deixou rastro.', v_regras;
end $aceite$;


insert into supabase_migrations.schema_migrations (version, name)
  values ('20261014150000', 'copiloto_de_midia')
  on conflict (version) do nothing;
