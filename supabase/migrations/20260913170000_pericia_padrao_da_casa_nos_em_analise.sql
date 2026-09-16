-- ---------------------------------------------------------------------------
-- A perícia "Em análise" do feed deixa de apagar o laudo de 20 fichas
-- ---------------------------------------------------------------------------
-- Decisão de 2026-09-13, sobre os 20 carros publicados cuja perícia chega do
-- RevendaMais como "Em análise":
--
--   *"suba a frase nos 20 em análise, esse status é do revenda, neste caso,
--   usamos sempre o nosso padrão e se for o caso, ainda complemento
--   manualmente"*.
--
-- O status é do feed, não da loja. A premissa da casa já estava escrita no
-- editor de veículo desde 29/08 — *"100% do pátio é periciado, e
-- `laudo_pericia` guarda APONTAMENTOS pontuais"* — e é a mesma que as peças da
-- Onda 1 afirmam: *"o resultado da perícia está publicado na ficha de cada
-- um"*. Medido antes desta migração, com a régua exata do site
-- (`formatPericia` + texto de laudo): **19 de 40** fichas publicadas mostravam
-- o resultado. As outras 20 estavam "Em análise" — e o bloco não acendia.
--
-- ---------------------------------------------------------------------------
-- O que muda, e o que NÃO muda
-- ---------------------------------------------------------------------------
-- Muda o DADO de 20 linhas, listadas por id:
--
--   · `pericia`: "Em análise" → "Aprovado" — a mesma grafia das 19 que o
--     feed já trazia aprovadas, e que `formatPericia` lê como PERÍCIA APROVADA;
--   · `laudo_pericia`: a redação canônica de `LAUDO_APROVADO_PADRAO`, fixada
--     pelo dono em 09/09 para o caso em que a perícia aprova — só onde o campo
--     está vazio ou ainda guarda o texto de preenchimento de 01/09.
--
-- NÃO muda a regra. `PDPClientWrapper` continua abrindo o bloco só com texto
-- E perícia aprovada; esta migração não afrouxa o portão, ela diz ao portão o
-- que a loja sabe e o feed não sabia.
--
-- ---------------------------------------------------------------------------
-- Customização vence o padrão — a mesma regra de 01/09
-- ---------------------------------------------------------------------------
-- A Saveiro 8358193 tem complemento manual: *"100% aprovada em mais de 120
-- itens de inspeção"*. Ela ganha a perícia aprovada e MANTÉM o texto. É o caso
-- que uma migração descuidada apagaria, e o aceite prova que não apagou.
--
-- ---------------------------------------------------------------------------
-- Por que o sync não desfaz isto
-- ---------------------------------------------------------------------------
-- A trava de `estoque_motors` (versão viva em `20260908160000`) é allowlist
-- por construção: o sync do RevendaMais manda em SEIS colunas — preco,
-- preco_original, preco_promocional, last_seen_at, portas e opcionais — e em
-- nenhuma outra. `pericia` e `laudo_pericia` ficam fora, então o próximo ciclo
-- de 6 horas não volta nada para "Em análise".
--
-- E é migração, e não script com a chave de serviço, pelo mesmo motivo de
-- 01/09: a trava recusa em silêncio toda escrita feita como `service_role` —
-- devolve 200 e grava zero. Pelo pooler, o `current_user` é o dono do banco.
--
-- ---------------------------------------------------------------------------
-- O que esta migração não resolve
-- ---------------------------------------------------------------------------
-- · **Carro importado daqui para frente chega "Em análise" de novo.** A trava
--   protege a coluna de UPDATE, não de INSERT: a primeira importação escreve o
--   que o feed mandar. A decisão diz "se for o caso, complemento manualmente" —
--   o mecanismo para os próximos fica para depois, e está registrado aqui para
--   ninguém achar que o problema acabou.
-- · **Uma ficha aprovada sem texto de laudo**, fora destes 20, segue sem
--   acender o bloco. Não é "Em análise", e a decisão foi sobre os 20.
--
-- ---------------------------------------------------------------------------
-- Reversão
-- ---------------------------------------------------------------------------
-- `supabase/manutencao/reversao/pericia-em-analise-2026-09-13.sql`, gerado da
-- produção ANTES de aplicar, com os valores exatos de cada linha.
-- ---------------------------------------------------------------------------

do $$
declare
  ids constant bigint[] := array[
    7416830, 7447739, 7812719, 7947766, 8137195, 8152210, 8191855, 8193514,
    8256747, 8310901, 8333811, 8335025, 8335204, 8358193, 8392516, 8393824,
    8402155, 8407873, 8416946, 8446229
  ];
  preenchimento_0109 constant text :=
    'Laudo cautelar completo — estrutura, chassi e histórico de sinistro auditados por empresa credenciada junto ao Detran';
  padrao_0909 constant text :=
    'Perícia cautelar aprovada — estrutura, chassi e histórico de sinistro auditados por empresa independente, credenciada junto ao Detran.';
  nega constant text := '(nao|não|sem|reprovad|pendent|negad|indeferid)';

  falhas              int := 0;
  mudou_pericia       int;
  mudou_laudo         int;
  aprovadas_nos_20    int;
  analise_nos_20      int;
  padrao_nos_20       int;
  customizada         text;
  acesas_antes        int;
  acesas_depois       int;
  publicadas          int;
  lastmod_antes       timestamptz;
  lastmod_movidos     int;
begin
  -- A ficha acende com texto E perícia aprovada: a mesma régua de
  -- `formatPericia`, escrita em SQL como no aceite de 01/09.
  select count(*) into acesas_antes
    from public.estoque_motors
   where estado_cadastro = 'publicado' and coalesce(vendido, false) = false
     and lower(coalesce(pericia, '')) ~ 'aprovad'
     and lower(coalesce(pericia, '')) !~ nega
     and coalesce(btrim(laudo_pericia), '') <> '';

  select max(conteudo_atualizado_em) into lastmod_antes
    from public.estoque_motors where id = any(ids);

  update public.estoque_motors
     set pericia = 'Aprovado'
   where id = any(ids)
     and origem = 'sync'
     and coalesce(vendido, false) = false
     and estado_cadastro = 'publicado'
     and lower(coalesce(pericia, '')) ~ 'an[aá]lise';
  get diagnostics mudou_pericia = row_count;

  update public.estoque_motors
     set laudo_pericia = padrao_0909
   where id = any(ids)
     and (coalesce(btrim(laudo_pericia), '') = '' or laudo_pericia = preenchimento_0109);
  get diagnostics mudou_laudo = row_count;

  -- ---- Aceite: prova o EFEITO lendo de volta, não o row_count --------------
  -- A escrita engolida pela trava em 01/09 "reportou 103 sucessos e gravou
  -- zero". O row_count acima é o que o UPDATE acha que fez; o que vale é a
  -- leitura abaixo.

  select count(*) into aprovadas_nos_20
    from public.estoque_motors
   where id = any(ids)
     and lower(coalesce(pericia, '')) ~ 'aprovad'
     and lower(coalesce(pericia, '')) !~ nega;
  if aprovadas_nos_20 <> 20 then
    falhas := falhas + 1;
    raise warning 'FALHOU: só % dos 20 leem como perícia aprovada', aprovadas_nos_20;
  end if;

  select count(*) into analise_nos_20
    from public.estoque_motors
   where id = any(ids) and lower(coalesce(pericia, '')) ~ 'an[aá]lise';
  if analise_nos_20 <> 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % dos 20 seguem "Em análise"', analise_nos_20;
  end if;

  select count(*) into padrao_nos_20
    from public.estoque_motors
   where id = any(ids) and laudo_pericia = padrao_0909;
  if padrao_nos_20 <> 19 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % dos 20 têm a redação de 09/09 (esperado 19: 18 preenchimentos + 1 vazio)', padrao_nos_20;
  end if;

  select laudo_pericia into customizada
    from public.estoque_motors where id = 8358193;
  if customizada is null or customizada not like '%120 itens de inspeção%' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o complemento manual da Saveiro 8358193 foi sobrescrito (valor: %)', customizada;
  end if;

  select count(*) into acesas_depois
    from public.estoque_motors
   where estado_cadastro = 'publicado' and coalesce(vendido, false) = false
     and lower(coalesce(pericia, '')) ~ 'aprovad'
     and lower(coalesce(pericia, '')) !~ nega
     and coalesce(btrim(laudo_pericia), '') <> '';
  if acesas_depois - acesas_antes <> 20 then
    falhas := falhas + 1;
    raise warning 'FALHOU: as fichas que acendem o bloco foram de % para % — esperado +20', acesas_antes, acesas_depois;
  end if;

  select count(*) into publicadas
    from public.estoque_motors
   where estado_cadastro = 'publicado' and coalesce(vendido, false) = false;

  select count(*) into lastmod_movidos
    from public.estoque_motors
   where id = any(ids) and conteudo_atualizado_em > coalesce(lastmod_antes, '-infinity'::timestamptz);

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) na perícia padrão dos em análise', falhas;
  end if;

  raise notice 'Perícia OK: % perícias e % laudos alterados; fichas que acendem o bloco: % → % de % publicadas; complemento da 8358193 preservado; lastmod movido em % dos 20.',
    mudou_pericia, mudou_laudo, acesas_antes, acesas_depois, publicadas, lastmod_movidos;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260913170000', 'pericia_padrao_da_casa_nos_em_analise')
  on conflict (version) do nothing;
