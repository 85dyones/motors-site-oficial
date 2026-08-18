-- ---------------------------------------------------------------------------
-- Desfecho não regride (achado #10 da revisão).
--
-- `registrar_desfecho_ciclo` gravava incondicional: um retry do n8n — que é
-- operação normal, não anomalia — podia rebaixar `convertido` para
-- `sem_resposta`, apagando o dado mais caro do motor (a conversão) e
-- alimentando a quarentena do §4.3 com um "sem resposta" falso.
--
-- A régua, em ranques de informação:
--
--   falha_envio = 1   sem_resposta = 1   agendado = 2   recusado = convertido = 3
--
-- Grava quem: encontra desfecho nulo; repete o mesmo valor (retry
-- idempotente — pode corrigir `valor_gerado`); sobe de ranque (resposta
-- tardia existe: `sem_resposta` → `convertido` aos 25 dias é dado real); ou
-- corrige entre os dois terminais (`convertido` ↔ `recusado` — misclick de
-- operador acontece e a correção é humana).
--
-- O par de ranque 1 é deliberadamente incomunicável: `falha_envio` →
-- `sem_resposta` faria a mensagem que NUNCA saiu voltar a contar como
-- contato (regra 2 — a recusa, e por extensão a falha nossa, nunca
-- penaliza); `sem_resposta` → `falha_envio` apagaria um contato que
-- aconteceu.
--
-- Sobrescrita recusada NÃO é erro: retry é normal, e estourar exceção
-- deixaria a execução do n8n vermelha à toa. A resposta devolve o desfecho
-- que ficou e `sobrescrita_ignorada: true` — a rota repassa o JSON inteiro,
-- então o rastro aparece na execução sem mudança de código.
-- ---------------------------------------------------------------------------

-- A decisão é função pura e imutável: dá para autoconferir exaustivamente
-- aqui embaixo, sem fixture, e fica impossível a régua divergir entre
-- lugares que decidem.
create or replace function public.desfecho_pode_gravar(p_atual text, p_novo text)
returns boolean
  language sql
  immutable
as $$
  select p_atual is null
      or p_novo = p_atual
      or (case p_novo  when 'convertido' then 3 when 'recusado' then 3 when 'agendado' then 2 else 1 end)
       > (case p_atual when 'convertido' then 3 when 'recusado' then 3 when 'agendado' then 2 else 1 end)
      or (p_atual in ('convertido', 'recusado') and p_novo in ('convertido', 'recusado'));
$$;

comment on function public.desfecho_pode_gravar(text, text) is
  'Régua do achado #10: desfecho não regride. Ranques falha_envio/sem_resposta=1, '
  'agendado=2, recusado/convertido=3; grava igual, subida, ou correção entre '
  'terminais. falha_envio↮sem_resposta é deliberado — regra 2.';

revoke all on function public.desfecho_pode_gravar(text, text) from public, anon, authenticated;
grant execute on function public.desfecho_pode_gravar(text, text) to service_role;

create or replace function public.registrar_desfecho_ciclo(
  p_evento   uuid,
  p_desfecho text,
  p_valor    numeric default null
) returns jsonb
  language plpgsql
  set search_path = public
as $$
declare
  v_atual text;
begin
  if p_desfecho not in ('convertido', 'recusado', 'sem_resposta', 'agendado', 'falha_envio') then
    raise exception 'DESFECHO_INVALIDO' using errcode = 'check_violation';
  end if;

  -- `for update` fecha a janela entre ler e gravar: dois desfechos
  -- simultâneos para o mesmo evento se serializam aqui, e o segundo é
  -- avaliado contra o que o primeiro deixou.
  select desfecho into v_atual
    from public.eventos_ciclo
   where id = p_evento
     for update;

  if not found then
    raise exception 'EVENTO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;

  if not public.desfecho_pode_gravar(v_atual, p_desfecho) then
    return jsonb_build_object(
      'ok', true,
      'evento_id', p_evento,
      'desfecho', v_atual,
      'sobrescrita_ignorada', true
    );
  end if;

  update public.eventos_ciclo
     set desfecho      = p_desfecho,
         valor_gerado  = coalesce(p_valor, valor_gerado),
         respondido_em = case
                           when p_desfecho in ('convertido', 'recusado', 'agendado')
                             then coalesce(respondido_em, now())
                           else respondido_em
                         end
   where id = p_evento;

  return jsonb_build_object('ok', true, 'evento_id', p_evento, 'desfecho', p_desfecho);
end;
$$;

comment on function public.registrar_desfecho_ciclo(uuid, text, numeric) is
  'Fecha um evento do motor. falha_envio devolve a vez ao cliente: a linha '
  'fica como rastro mas não conta para a janela de 21 dias do §4.3. Desfecho '
  'não regride (achado #10): sobrescrita rebaixadora é ignorada com '
  'sobrescrita_ignorada=true na resposta, nunca erro — retry é operação normal.';

revoke all on function public.registrar_desfecho_ciclo(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.registrar_desfecho_ciclo(uuid, text, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- Autoconferência: a régua inteira, caso a caso. Pura — roda sem fixture.
-- ---------------------------------------------------------------------------
do $$
declare
  caso record;
begin
  for caso in
    select * from (values
      -- nulo aceita qualquer primeiro desfecho
      (null::text,      'convertido',   true),
      (null::text,      'falha_envio',  true),
      -- retry idempotente
      ('convertido',    'convertido',   true),
      ('falha_envio',   'falha_envio',  true),
      -- subida de ranque: resposta tardia e progressão de agenda
      ('sem_resposta',  'convertido',   true),
      ('sem_resposta',  'agendado',     true),
      ('agendado',      'convertido',   true),
      ('agendado',      'recusado',     true),
      ('falha_envio',   'agendado',     true),
      ('falha_envio',   'convertido',   true),
      -- correção humana entre terminais
      ('convertido',    'recusado',     true),
      ('recusado',      'convertido',   true),
      -- o rebaixamento do achado #10
      ('convertido',    'sem_resposta', false),
      ('recusado',      'sem_resposta', false),
      ('convertido',    'agendado',     false),
      ('agendado',      'sem_resposta', false),
      ('agendado',      'falha_envio',  false),
      -- o par incomunicável da regra 2
      ('falha_envio',   'sem_resposta', false),
      ('sem_resposta',  'falha_envio',  false)
    ) as t(atual, novo, esperado)
  loop
    if public.desfecho_pode_gravar(caso.atual, caso.novo) is distinct from caso.esperado then
      raise exception 'REGUA FALHOU: % -> % deveria ser %',
        coalesce(caso.atual, '(nulo)'), caso.novo, caso.esperado;
    end if;
  end loop;

  raise notice 'Régua do desfecho conferida: 19 transições batem com a tabela.';
end $$;

-- ---------------------------------------------------------------------------
-- Registro no livro-razão. Nenhuma migração se registra sozinha (D6): quem
-- aplica por psql/pg precisa deste rodapé, senão a versão fica invisível
-- para o `supabase db push` e para a conferência. Ver supabase/README.md.
-- ---------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
  values ('20260818140000', 'desfecho_nao_regride')
  on conflict (version) do nothing;
