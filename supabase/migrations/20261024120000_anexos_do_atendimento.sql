-- ============================================================================
-- Os anexos da conversa: foto, vídeo, áudio e documento, nos dois sentidos
-- ============================================================================
-- Pedido do dono (2026-10-20): *"uma funcionalidade que precisamos no chat e
-- não foi testada, envio de anexos, fotos, vídeos e documentos"*.
--
-- Até aqui a conversa guardava só o RÓTULO da mídia que o cliente manda
-- ("[Foto] legenda", "[Documento] cnh.pdf"): o arquivo ficava no WhatsApp, e o
-- painel não tinha como mostrar. E a caixa do painel só mandava texto.
--
-- ---------------------------------------------------------------------------
-- O que muda
-- ---------------------------------------------------------------------------
-- 1. `atendimento_mensagens` ganha o arquivo da mensagem: `midia_caminho` (no
--    bucket `atendimento-midia`), `midia_tipo` (o mimetype), `midia_nome` (o
--    nome do arquivo, quando há), `midia_bytes` e `midia_erro` (por que o
--    arquivo não veio — o WhatsApp mostra, o painel diz). `midia_url` segue
--    sendo só a foto PÚBLICA do carro que o assistente manda.
-- 2. O bucket `atendimento-midia`, PRIVADO e sem policy nenhuma: só o servidor
--    (chave de serviço) grava e assina. O painel abre o arquivo por
--    `/api/leads/[id]/conversa/midia/[mensagem]`, que confere o escopo do lead
--    e devolve uma URL assinada de vida curta; o vendedor sobe o anexo por URL
--    assinada de upload (função da Vercel recusa corpo acima de ~4,5 MB, e
--    vídeo de celular passa disso). Caminho `{lead}/{arquivo}`: a eliminação
--    do titular (LGPD) apaga a pasta do lead.
--
-- Fora do Supabase (o Postgres do teste local não tem o schema `storage`), o
-- bucket é pulado e o resto aplica igual.
--
-- Aditiva e idempotente: `add column if not exists`, regra só se ausente,
-- bucket por `on conflict`.
-- ============================================================================

alter table public.atendimento_mensagens add column if not exists midia_caminho text;
alter table public.atendimento_mensagens add column if not exists midia_tipo    text;
alter table public.atendimento_mensagens add column if not exists midia_nome    text;
alter table public.atendimento_mensagens add column if not exists midia_bytes   bigint;
alter table public.atendimento_mensagens add column if not exists midia_erro    text;

do $restricoes$
begin
  -- `{lead}/{arquivo}`: sem subir de pasta, sem barra inicial, sem URL.
  if not exists (select 1 from pg_constraint where conname = 'atendimento_mensagens_midia_caminho_valido') then
    alter table public.atendimento_mensagens add constraint atendimento_mensagens_midia_caminho_valido check (
      midia_caminho is null
      or midia_caminho ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'atendimento_mensagens_midia_no_formato') then
    alter table public.atendimento_mensagens add constraint atendimento_mensagens_midia_no_formato check (
      (midia_tipo is null or (length(midia_tipo) between 3 and 120 and midia_tipo ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+'))
      and (midia_nome is null or length(midia_nome) between 1 and 255)
      and (midia_bytes is null or midia_bytes >= 0)
      and (midia_erro is null or length(midia_erro) between 1 and 500)
    );
  end if;
end
$restricoes$;

comment on column public.atendimento_mensagens.midia_caminho is
  'O arquivo da mensagem no bucket privado atendimento-midia ({lead}/{arquivo}), 2026-10-20. '
  'Só o servidor grava e assina; o painel abre por /api/leads/[id]/conversa/midia/[mensagem].';
comment on column public.atendimento_mensagens.midia_erro is
  'Por que o arquivo da mensagem não foi guardado (grande demais, a Evolution não entregou).';

do $bucket$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sem o schema storage (Postgres fora do Supabase): o bucket atendimento-midia fica para o Supabase.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'atendimento-midia', 'atendimento-midia', false,
    52428800,  -- 50 MB: o teto de upload do Supabase; documento do WhatsApp maior fica no celular
    null       -- qualquer tipo: documento de cliente vem em formato que não se escolhe; o painel filtra o que envia
  )
  on conflict (id) do update
    set public             = false,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end
$bucket$;

-- ============================================================================
-- Aceite — prova o efeito, não o nome
-- ============================================================================
do $aceite$
declare
  falhas   int := 0;
  v_falhou text[] := '{}';
  v_etapa  text;
  v_lead   uuid;
  v_caminho_ruim text;
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'atendimento_mensagens'
         and column_name in ('midia_caminho', 'midia_tipo', 'midia_nome', 'midia_bytes', 'midia_erro')) <> 5 then
    falhas := falhas + 1;
    raise warning 'FALHOU: atendimento_mensagens sem as cinco colunas do anexo';
  end if;

  -- Aninhado, e não num `and`: o plpgsql planeja a expressão inteira, e sem o
  -- schema `storage` a consulta ao bucket nem compila.
  if to_regclass('storage.buckets') is not null then
    if not exists (select 1 from storage.buckets where id = 'atendimento-midia' and public = false) then
      falhas := falhas + 1;
      raise warning 'FALHOU: o bucket atendimento-midia não existe ou é público';
    end if;
  end if;

  begin
    select chave into v_etapa from public.funil_etapas where tipo = 'aberta' and ativa order by ordem limit 1;
    insert into public.leads (nome, telefone, situacao)
      values ('Aceite Anexos', '5541900005001', coalesce(v_etapa, 'novo'))
      returning id into v_lead;

    -- O documento do cliente, guardado na pasta do lead.
    insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, conteudo, texto, situacao,
                                              midia_caminho, midia_tipo, midia_nome, midia_bytes)
    values (v_lead, '5541900005001', 'entrada', 'cliente', 'documento', 'cnh.pdf', 'recebida',
            v_lead::text || '/msg-1.pdf', 'application/pdf', 'cnh.pdf', 120345);

    -- O anexo do vendedor, que sai pela loja.
    insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, conteudo, situacao, gatilho,
                                              midia_caminho, midia_tipo, midia_bytes)
    values (v_lead, '5541900005001', 'saida', 'vendedor', 'video', 'pendente', 'painel',
            v_lead::text || '/painel-1.mp4', 'video/mp4', 9000000);

    -- O arquivo que não veio fica com o motivo, sem caminho.
    insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, conteudo, situacao, midia_erro)
    values (v_lead, '5541900005001', 'entrada', 'cliente', 'video', 'recebida', 'arquivo grande demais');

    foreach v_caminho_ruim in array array[
      '../' || v_lead::text || '/x.pdf',
      '/' || v_lead::text || '/x.pdf',
      'https://exemplo.com/x.pdf',
      v_lead::text || '/../x.pdf',
      v_lead::text || '/sub/x.pdf'
    ] loop
      begin
        insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, conteudo, situacao, midia_caminho)
        values (v_lead, '5541900005001', 'entrada', 'cliente', 'documento', 'recebida', v_caminho_ruim);
        v_falhou := v_falhou || format('aceitou o caminho %s', v_caminho_ruim);
      exception when check_violation then
        null;
      end;
    end loop;

    begin
      insert into public.atendimento_mensagens (lead_id, telefone, direcao, autor, conteudo, situacao, midia_tipo)
      values (v_lead, '5541900005001', 'entrada', 'cliente', 'documento', 'recebida', 'não é mimetype');
      v_falhou := v_falhou || 'aceitou mimetype torto';
    exception when check_violation then
      null;
    end;

    raise exception 'SENTINELA_DO_ACEITE';
  exception
    when others then
      if sqlerrm <> 'SENTINELA_DO_ACEITE' then
        v_falhou := v_falhou || format('o bloco de efeito estourou: %s', sqlerrm);
      end if;
  end;

  if array_length(v_falhou, 1) > 0 then
    falhas := falhas + array_length(v_falhou, 1);
    for i in 1..array_length(v_falhou, 1) loop
      raise warning 'FALHOU: %', v_falhou[i];
    end loop;
  end if;

  if exists (select 1 from public.leads where nome = 'Aceite Anexos') then
    falhas := falhas + 1;
    raise warning 'FALHOU: o aceite deixou linha para trás';
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % verificação(ões) dos anexos da conversa', falhas;
  end if;
  raise notice 'Aceite verificado: a conversa guarda o arquivo da mensagem (caminho na pasta do lead, tipo, nome, '
               'tamanho ou o motivo de não ter vindo), recusa caminho que sobe de pasta e mimetype torto.';
end
$aceite$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20261024120000', 'anexos_do_atendimento')
  on conflict (version) do nothing;
