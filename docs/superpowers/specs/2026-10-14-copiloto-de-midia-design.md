# Copiloto de Mídia — diagnóstico diário do Google Ads e mudanças aprovadas

Data: 2026-10-14 · Pedido do dono. v1 = diagnóstico + aprovação.

## Problema

De 6 a 12/10/2026 o Google Ads gastou R$ 357 com zero conversão. O GTM e o
site medem certo; em 21 dias só 2 de 62 leads chegaram com `gclid`. A
sincronização de hora em hora (`2026-09-24-midia-paga-sincronizada-design.md`)
traz gasto, cliques e conversões por campanha, mas não diz **para onde** o
dinheiro foi nem o que mudar. Faltava alguém ler a conta todo dia e
transformar o que ela mostra em mudança, com uma pessoa aprovando antes.

## Quem abre, quando, e que decisão sai

- **Quem:** Marketing ou Administrador — linha nova da matriz A17, "Aprovar
  mudanças do Copiloto de Mídia" (`ACAO_COPILOTO_DE_MIDIA`).
- **Quando:** de manhã, depois do diagnóstico diário (hora nas regras;
  semente 7h).
- **Decisão:** aprovar ou recusar cada mudança proposta na conta — negativar
  termo, pausar grupo, cortar verba — e, quando a medição acusa problema,
  consertar a medição antes de cortar qualquer coisa.

## Restrições do pedido

- Sem API token nem terceiros: o script já colado na conta faz tudo pela
  AdsApp, com o segredo `midia_google_segredo` que a sincronização já usa.
- O script nunca exclui nada além de negativas.
- Migração no PR, **sem aplicar em produção** (`zwbqmzgnagfeqinqkolp`).

## Fluxo

```
script (de hora em hora)
  1. sincroniza (como antes)  → /api/marketing/sincronizar/google
  2. pede o que fazer          → /api/marketing/copiloto/acoes        {previa, fuso}
        ← {diagnosticoDevido, acoes}   (ações RESERVADAS no banco)
     aplica cada uma, lê de volta → /api/marketing/copiloto/acoes/resultado
  3. se devido (1x/dia)        → /api/marketing/copiloto/diagnostico  (retrato de 7 dias fechados)
        rota: valida → conta leads da janela → diagnosticar() → grava numa transação
painel /admin/marketing/copiloto
  aprovar / recusar / desfazer / regras → funções do banco, com a SESSÃO
```

Em "Visualizar" o Google não deixa o script mudar a conta: a prévia lista o
que espera, não reserva nada e manda o diagnóstico (marcado `previa`; não conta
como o do dia).

## O retrato (contrato: `validarDiagnostico`)

Últimos 7 dias fechados (ontem e os seis antes), no fuso da conta:

| Seção | GAQL | Para quê |
|---|---|---|
| `conta` | `customer.auto_tagging_enabled` | gclid ligado? |
| `termos` | `search_term_view` (Pesquisa, gasto > 0, top 2000) | gasto sem conversão |
| `palavras` | `keyword_view` + `quality_info` | índice de qualidade |
| `anuncios` | `ad_group_ad` ativos + `policy_summary` | reprovado, grupo sem anúncio |
| `recursos` | `ad_group_ad_asset_view`, `campaign_asset` com problema | recurso reprovado |
| `conversoes` | `conversion_action` + `segments.conversion_action` 30d | medição quebrada |
| `campanhas` | verba, compartilhada?, 7d, mês, parcela perdida | ritmo de verba |
| `grupos` | `ad_group` ativos (Pesquisa e Display) + 7d | pausar grupo |

Cada seção é lida à parte. A que o Google recusar vai vazia, com a mensagem em
`erros`, e as regras a tratam como **desconhecida**, nunca como "sem problema".

## Regras (`diagnosticar`, `src/lib/copilotoDeMidia.ts`)

Ordem importa: a medição vem primeiro, porque é ela que diz se "zero
conversão" é prova ou falta de dado.

1. **Medição** — marcação automática desligada; nenhuma ação primária ativa;
   primárias sem registro em 30 dias; 2+ leads com gclid e zero conversão no
   Google; seção ilegível. Qualquer "alta" aqui = medição não confiável, e aí
   **não há proposta de pausa nem de corte de verba**.
2. **Cliques × leads com gclid** — cliques pagos contra leads do site com
   `gclid` (tabela `leads`, só contagem). utm de Google pago sem gclid lembra
   que o iPhone manda `gbraid`/`wbraid`, que a tabela não guarda.
3. **Termos com gasto sem conversão** — agrupados por classe:
   concorrente → negativa de **frase** pelo nome, na campanha; cidade fora da
   área → negativa de frase pela cidade; informativo → negativa **exata** do
   termo (a palavra sozinha bloquearia busca boa); outros → exata, só a partir
   do mínimo de gasto. Termo já negativado, termo que é palavra-chave e termo
   que converteu nunca viram negativa. A negativa guarda a grafia do termo
   ("são tomé" e "sao tome" são duas negativas: negativa não pega variação).
4. **Ritmo de verba** — gasta ≥ ritmo alto sem conversão e acima do mínimo →
   corte de `reducao_verba_pct` (não em verba compartilhada); limitada pela
   verba e convertendo → achado (aumento é decisão de quem paga); abaixo do
   ritmo baixo → achado, com a parcela perdida por classificação.
5. **Grupos** — gastou ≥ mínimo sem conversão → pausar; o motivo avisa quando
   aprovar todos desliga a campanha.
6. **Anúncios parados** — campanha ativa sem impressão; grupo só com anúncio
   reprovado ou sem anúncio; anúncio e recurso reprovado/limitado.
7. **Índice de qualidade** — palavra com nota ≤ `iq_baixo` e gasto.

Todo número de régua mora em `midia_copiloto_parametros` (vigência; editável
na tela), inclusive os limiares da medição (leads com gclid que provam a
medição quebrada, cliques do achado de gclid) e da impressão perdida (por
verba, por classificação). As listas de **concorrentes** e **cidades fora da área** nascem
vazias: são da loja, e o código não conhece nenhuma. A de palavras
informativas nasce com o vocabulário de quem pesquisa e não compra carro.

## O que o copiloto pode mudar

Cinco verbos, lista fechada no banco, no código e no script:
`negativar`, `remover_negativa`, `pausar_grupo`, `reativar_grupo`,
`mudar_verba`. A única exclusão é `remover_negativa`, e o banco só a deixa
nascer como o **desfazer** de uma negativa aplicada.

O script, antes de mexer, confere o estado: negativa que já existe →
`sem_efeito`; verba que alguém mudou depois da proposta → `falhou`, nada é
feito; verba compartilhada → `falhou`; grupo de outra campanha → `falhou`.
Depois de mexer, lê de volta e devolve o que leu.

## Pedido de verba (16/10/2026)

Pedido do dono: "aumentos pelo copiloto". O diagnóstico continua só cortando
— aumento é decisão de quem paga —, e quem paga (ou o Marketing) agora o pede
no painel, em "Para decidir" → **Pedir mudança de verba**.

- **Quem:** a mesma linha da matriz A17 (Administrador e Marketing).
- **Fluxo:** escolhe a campanha e a verba nova (com o motivo, opcional) →
  `/api/marketing/copiloto/verba` → `midia_copiloto_pedir_verba`. O pedido
  nasce **proposta**, no grupo "Pedidos de verba", e passa pela mesma
  aprovação (`midia_copiloto_decidir`); o script aplica na rodada seguinte e lê
  de volta. O script não muda: `mudarVerba` já aceitava aumento.
- **A verba de agora não vem da tela:** o banco lê `midia_campanhas.orcamento_diario`
  (gravada pela sincronização de hora em hora). Se alguém mudou a verba no
  Google Ads depois, o script devolve `falhou` sem mexer, como em qualquer
  mudança de verba.
- **Teto:** até 10× a verba de agora — o mesmo do script e do CHECK
  `midia_copiloto_acoes_pedido_na_faixa`. Igual à de agora é recusado.
- **Com o diagnóstico:** o pedido usa a chave dele (`verba:<campanha>`).
  Proposta do diagnóstico aberta para a campanha é substituída pelo pedido;
  mudança já aprovada esperando o script recusa o pedido. O retrato novo não
  descarta pedido; e, depois de aplicado, o diagnóstico não propõe corte na
  mesma campanha por uma janela (7 dias), como na cascata. Pedido recusado não
  segura proposta do diagnóstico.
- **Trilha:** `copiloto_pediu` (quem pediu, carimbado por `auth.uid()`), depois
  `copiloto_aprovou` e `copiloto_aplicou`, como as outras.
- Migração `20261016200000_copiloto_pedido_de_verba` (aditiva, não aplicada
  em produção pelo PR): `pedida_por`/`pedida_por_nome`, a terceira origem da
  ação, o corte obrigatório só para o que vem do diagnóstico, e a função.

## Dados (`20261014150000_copiloto_de_midia.sql`)

- `midia_copiloto_parametros` — regras com vigência (D-T1.7), uma vigente por loja.
- `midia_copiloto_diagnosticos` / `midia_copiloto_achados` — append-only.
- `midia_copiloto_acoes` — situação: proposta → aprovada | recusada |
  descartada; aprovada → em_aplicacao | recusada; em_aplicacao → aplicada |
  falhou | sem_efeito. O alvo não muda depois de proposto; nada se apaga
  (gatilho). Verba vinda do diagnóstico só diminui (CHECK); voltar ao valor
  de antes é pelo desfazer, que o banco confere como o inverso exato. A
  prévia não tira de cena as propostas em revisão. Uma aberta por chave; aplicada ou recusada não volta por uma
  janela (7 dias) — é também o que impede o corte de verba em cascata.
- RLS: admin e marketing leem; ninguém escreve direto (nem a chave de
  serviço). Funções: `midia_copiloto_{nova_vigencia,decidir,desfazer}`
  (sessão, papel conferido de novo, autoria por `auth.uid()`, trilha em
  `auditoria_admin` na mesma transação) e
  `midia_copiloto_{gravar_diagnostico,reservar_acoes,registrar_resultado}`
  (só a chave de serviço; o resultado do script também vai à trilha).
- Autoconferência veste admin, marketing, comercial, marketing desativado,
  cliente, anon e a chave de serviço; entra na cadeia de
  `tests/migracoes-executam.test.ts`.

## Implantação

1. Aplicar a migração. 2. Publicar o site. 3. Colar o script novo na conta
(Ferramentas → Ações em massa → Scripts) e clicar em "Visualizar": o registro
termina com "copiloto: diagnóstico recebido". 4. Preencher concorrentes e
cidades fora da área na tela.

Script novo antes do site: a sincronização segue, e só o copiloto falha, com o
motivo no registro do Google Ads.

## Em aberto (para o dono)

- Os números da semente (R$ 10 por termo, R$ 50 por grupo, R$ 100 por
  campanha, ritmo 50–90%, corte de 30%, IQ ≤ 3, 2 leads com gclid, 30
  cliques, 10% perdido por verba, 30% por classificação, 7h) são de partida.
- `gbraid`/`wbraid` não são guardados em `leads`: clique de iPhone chega sem
  gclid. Guardá-los é outra migração (colunas novas + `contextoDeMidia`).
- v2: subir a conversão offline (lead → venda) com o gclid guardado.
