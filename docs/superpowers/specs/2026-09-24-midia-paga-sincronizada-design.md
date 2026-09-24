# Mídia paga sincronizada — Meta e Google entram sozinhos

Data: 2026-09-24 · Aprovado pelo dono em conversa (três partes: dados, telas, falhas).

## Problema

`/admin/marketing/midia-paga` e a visão geral só mostram o que alguém digita à
mão (formulário "Nova campanha" + "Atualizar leitura"). Ninguém digita, então
a tela fica vazia enquanto o Meta tem 3 campanhas no ar (conta `act_802008949148808`,
"motorsstore", objetivo `OUTCOME_LEADS`). Medido em 24/09: `midia_campanhas`
tem 0 linhas — não há histórico manual a preservar.

## Decisões do dono

- **Google Ads**: script colado na conta do Google Ads empurra os números por
  HTTP (sem developer token).
- **Meta**: Graph API `/insights`, puxado pelo site.
- **Lead**: os dois números lado a lado — o que a plataforma reporta e o que
  chegou em `public.leads` com `utm_campaign` da campanha.
- **Manual**: some o cadastro e a leitura digitada; fica o registro de
  ajustes. Campanhas manuais antigas (hoje zero) ficariam como `origem = manual`.

## Dados

Migração `20260924120000_midia_paga_sincronizada.sql`:

- `midia_campanhas` + `origem` (`manual|meta|google`, default `manual`),
  `id_externo`, `alcance_total` (alcance da vida inteira, só Meta), `sincronizado_em`.
  Único `(plataforma, id_externo)`.
- `midia_anuncios` + `id_externo`, único `(campanha_id, id_externo)`.
- **`midia_diario`**: uma linha por (campanha, anúncio|null, dia) —
  investido, impressões, cliques, conversões da plataforma. `unique nulls not
  distinct`. Cada rodada regrava a janela (7 dias no agendamento), então
  repetir não duplica. Meta grava por anúncio; Google grava por campanha
  (`anuncio_id` nulo). Uma campanha nunca mistura os dois.
- **`midia_sincronizacoes`**: registro de cada rodada (plataforma, início,
  fim, ok, contagens, erro).
- Escrita só pela service role; leitura para `authenticated`.
- Segredos no Vault: `midia_cron_segredo` (o pg_cron chama a rota do Meta)
  e `midia_google_segredo` (o script do Google). Gerados pela própria
  migração; o site confere com `public.midia_confere_segredo(nome, valor)`,
  SECURITY DEFINER e só para `service_role`. Nenhum segredo vira variável
  de ambiente nem passa por `/api/settings`.
- pg_cron `sincronizar-midia-meta` a `17 * * * *` → `net.http_post` em
  `https://motorsstore.com.br/api/marketing/sincronizar/meta`.

## Fluxo

- `src/lib/midiaSync.ts` (puro, testado): normaliza a resposta do Meta e o
  payload do Google para um formato único; mapeia situação; conta leads do
  Meta a partir de `actions`.
- `src/lib/midiaSyncGravar.ts`: grava o formato único (upsert de campanhas,
  anúncios e dias) e registra a rodada.
- `POST /api/marketing/sincronizar/meta`: aceita `Authorization: Bearer
  <midia_cron_segredo>` OU sessão de staff com "Gerenciar campanhas de mídia
  paga" (botão "Sincronizar agora"). Token: `META_ADS_ACCESS_TOKEN`, cai para
  `META_CAPI_ACCESS_TOKEN`; conta: `META_AD_ACCOUNT_ID`.
- `POST /api/marketing/sincronizar/google`: cabeçalho `X-Motors-Segredo`;
  JSON validado; payload inválido responde 400 e não apaga nada.
- `scripts/google-ads-script.js`: o script para colar na conta.

## Telas

- Consolidado: sem formulário; filtro 7/14/30 dias; linha "última
  sincronização" por plataforma com erro visível; botão "Sincronizar agora";
  tabela com leads da plataforma, leads no banco, R$/lead dos dois, selo de
  origem e aviso "sem UTM" quando a plataforma tem lead e o banco não.
- Campanha: sem "Atualizar leitura" e sem troca de situação para campanhas
  sincronizadas (situação vem da plataforma); números da vida inteira (os
  portões de aprendizagem são da vida inteira); gráfico de investimento por dia.
- Visão geral: cartão "Mídia paga · 7 dias" por plataforma + alerta de
  sincronização parada há mais de 6 h.

## Falhas

- Erro da API: a rodada fica registrada com a mensagem; dados antigos
  permanecem; a tela mostra "falhou às HH:MM: …". O token nunca aparece em log.
- Segredo errado: 401, só no log do servidor — qualquer um na internet pode
  bater na rota, e a tabela do painel não é lugar para isso. JSON fora do
  formato (com segredo válido): 400, registrado como rodada recusada.

## Testes

Normalização Meta e Google com dados de exemplo, contagem de leads, mapeamento
de situação, validação do payload, gravação idempotente (cliente falso) e
recusa de segredo. Cada teste é visto reprovando com o código quebrado antes
de ser aceito.

## Fora do escopo

Visitas à loja e vendas atribuídas (seguem dependendo do kanban de leads);
nível de anúncio no Google; reescrever o vocabulário "conversa" dos
diagnósticos.
