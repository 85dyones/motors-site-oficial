# Plano de fases — estrangulamento sem ruptura

Regra da janela: enquanto o RevendaMais existir, ele só recebe lançamento fiscal — nunca decisão
comercial. Uma fase só começa com o critério de saída da anterior cumprido. O site público e o
funil /avaliacao não quebram em NENHUMA fase (qa-guardian verifica em todo PR).

## Ordem a partir de 2026-10-12 (virada para SaaS)

**S0 → S1 → S2 → S3 → F1 → F2 → F3 → F4**, com a trilha comercial correndo em paralelo desde a
metade da S1. Decisões SaaS-1 a SaaS-6 no topo do `HANDOFF.md`; notas por módulo, riscos e mercado
no diagnóstico de 12/10 (artefato privado linkado no `HANDOFF.md`).

O que a F0 e a F0.5 entregaram fica como está. O que ficou pendente nelas e é infraestrutura
(staging, backup PITR testado) passa para a S0; o resto (carga histórica, conferência diária)
volta antes da F1. As fases F1 a F4 não mudam de conteúdo: começam depois da S3 — ou junto com
ela, havendo uma segunda pessoa técnica — e tudo o que criarem já nasce multi-loja.

Durações supõem uma pessoa técnica em tempo integral com os agentes; com duas, encurtam perto de 40%.

### S0 — Higiene, segurança e infraestrutura (≈2 semanas)
Humano (Dyones): assinar o GitHub Pro e tornar o repositório privado; gerar hash novo do feed no
RevendaMais (o antigo está no histórico do git); preparar o VPS do runner (`docs/RUNNER_DO_CI.md`);
criar o projeto Supabase em sa-east-1.
Código: os itens de "Corrigir agora" do diagnóstico — rotas sensíveis com permissão abaixo do
necessário, aporte de investidor gravado na tabela aposentada (achado 2 de
`docs/ACHADOS_FINANCEIRO.md`), alertas do Security Advisor, admin concedido por e-mail fixo ·
staging com banco separado e preview da Vercel apontando para ele · migrações aplicadas pelo CI
(Supabase CLI) no lugar de `supabase/manutencao/aplicar-migracao.js` · job do CI com Postgres que
roda os testes de RLS hoje pulados · PITR com restauração testada · docs defasados
(`AUDITORIA.md`, `docs/ACHADOS_FINANCEIRO.md`, `supabase/README.md`).
Saída: Security Advisor sem ERROR; preview sem acesso à produção; repositório privado; CI no runner
próprio com a reserva do GitHub testada.

### S1 — Fundação multi-loja (≈10 semanas)
Entregas, nesta ordem: `org_membros` + loja no token (Custom Access Token Hook) + `org_atual()` ·
trocar `org_padrao()` nas policies e funções (67 policies em 12/10) e fazer `is_staff`, `tem_papel`
e o escopo de leads conhecerem a loja · dono do lead por id de usuário, não por nome · `org_id` nas
tabelas legadas (46 em 12/10, inclusive `estoque_motors`, `leads`, `site_settings`, `profiles`,
investidores, mídia e guias), preenchido com a Motors, com unicidades por loja · filtro de loja
obrigatório nas rotas que usam a chave de serviço e loja na chave do cache · loja pelo domínio
(`org_dominios` lido no `proxy.ts`, URL do site em tempo de execução, domínio próprio pela API da
Vercel) · credenciais por loja (`org_integracoes` no Vault) saindo do env e de `site_settings` ·
fluxos críticos do n8n (relógio do funil, envio de WhatsApp, sync de estoque) para dentro do app ou
parametrizados por loja · conteúdo da Motors fora do código (layout, páginas geo, schema da loja,
horário, templates de e-mail do Auth, e-mails de admin, temas) · storage com prefixo de loja ·
`org_modulos` + função de provisionamento de loja · correções de dado da Motors fora das migrações
· `src/modules/` com fronteiras, começando por estoque, leads e configuração da loja · Motors
migrada para o projeto sa-east-1.
Saída: duas lojas criadas pela função de provisionamento não se enxergam em nenhuma tabela, provado
no CI; a Motors roda como loja nº 1 no projeto novo, sem regressão no site nem no /avaliacao.

### S2 — Pacote de expansão (≈10 semanas; pilotos a partir da 6ª semana)
Site e SEO: configuração da loja (endereço, cidade, bairros, horário, autor, garantia) como dado ·
páginas geo vindas de uma tabela de regiões, com a trava de similaridade de
`tests/paginas-geo.test.ts` contra página-porta · modelos de hub com variáveis e edição de title e
meta · editor de guias com rascunho por IA no painel · `llms.txt` por loja · Search Console por loja.
Leads: entrada por API com chave por loja e Meta Lead Ads · WhatsApp plugável (Cloud API oficial;
Chatwoot como adaptador) · relógio do funil no app a cada 5 min · fuso, janela de avisos e papéis
por loja · deduplicação e idempotência · relatório por origem e tempo de primeira resposta ·
consentimento na captação e prazo de retenção.
Estoque: conector configurável (XML do RevendaMais, Autoconf, Boom, planilha) · dicionário canônico
de marca e modelo · prompt do descritivo por loja.
Onboarding: tema e logo por loja, assistente de configuração, importação dos redirecionamentos do
site antigo.
Saída: 2 ou 3 lojas piloto no ar com domínio próprio, leads chegando ao funil e páginas indexando.

### S3 — Mídia e Painel do dono (≈8 semanas)
Mídia: OAuth Meta e Google por loja · venda devolvida às plataformas (CAPI e conversão offline do
Google Ads) · atribuição de clique para WhatsApp · `gbraid`/`wbraid` · CAC e ROAS por campanha e por
carro · catálogo de veículos da Meta · públicos sincronizados · relatório mensal para a loja ·
Consent Mode v2.
Dono: fonte única de "venda" (lead ganho, veículo e campanha ligados) · painel com giro, idade do
estoque, capital parado, margem, conversão por origem e vendedor, comparativo de período · metas ·
exportação CSV/PDF · agregação no banco, sem o corte em 1.000 linhas.
Saída: CAC por venda e ROAS por campanha visíveis para a Motors e para os pilotos.

### Trilha comercial (paralela, da metade da S1 ao fim da S2)
Cobrança recorrente com PIX e boleto ligada a `org_modulos` · medição de consumo por loja (SMS,
consulta de placa, IA) com teto · termos de uso, contrato de operador de dados (DPA) e registro de
operações para a LGPD · central de ajuda e página de status · contrato com as lojas piloto · nome e
site do produto.

## F0 — Adequação normativa, base e migração (≈2 semanas)
Humano (Dyones): confirmar adesão RENAVE + escolher integradora e provedor fiscal; pedir exportação
completa ao suporte do RevendaMais; varredura das telas pendentes (financeiro, integrador,
relatórios, form de cadastro) para fechar as specs.
Código: schema núcleo (spec 00) + org_padrao() + RLS + auditoria; staging + carga dos 1.096
veículos (migration-runner); conferência diária n8n; backup PITR + export diário TESTADO.
Saída: adesão RENAVE confirmada; divergência de estoque zero por 5 dias; pendências de tela resolvidas.

## F0.5 — Conteúdo do anúncio (2026-09-01) — conteúdo nosso, operação deles
Pedido do dono: *"a ideia é usar por mais um tempo o revenda como financeiro e gestor de estoque,
mas quero ainda ter o controle sobre o conteúdo no site, pra integrar corretamente nos portais"*.
Fatia vertical fina (vitrine), ortogonal à fatia operação/financeiro — por isso cabe antes da F1,
que pressupõe entrada e venda nascendo no admin. Não antecipa a F2: `estoque_motors` NÃO vira
projeção aqui, e nenhum portal é chamado.

A fronteira: **o RevendaMais diz o que existe e quanto custa; nós dizemos como aparece e se
aparece.** A trava total de 30/08 já tirou dele o poder de reescrever — o que falta não é
proteção, é permissão.

Entregas: foto editável em veículo de qualquer origem (a trava tornou o gate por `origem`
obsoleto) · `marcar_conteudo_atualizado()` passa a ver `modelo_override`, `versao_override`,
`perfis_uso`, `estado_cadastro` · conferência diária que só ACUSA divergência de preço e sumiço
(rota com Bearer próprio, 503 sem config; **não escreve em `estoque_motors`**) — é o item
"conferência diária n8n" que a F0 já pedia · preço de tabela editável (depois da conferência) ·
mapa de completude por portal · as colunas que o mapa provar faltarem · estado do anúncio
(`anuncios_portal` por `estoque_id`) + payload montado em SOMBRA.
Saída: os 38 publicados com foto, preço e ficha editáveis pelo painel; divergência zero por 5
dias; payload de portal montado em sombra para 100% deles.

## F1 — MVP operacional (≈6–8 semanas) — a partir daqui, entrada e venda nascem no admin
Entregas (paralelizáveis por módulo após spec 00 no ar):
compras: 5 portas (spec 10) + diligência de procedência + estornos/correções + confirmação de
disponibilidade · avaliação: curva de deságio + teto de compra + tela de edição de parâmetros
(spec 11) · estoque: ficha, eventos, custos previsto×realizado, piso/preço, bloqueios · pátio:
PWA para km/avarias/vistoria (fotos internas apenas) + upload de fotos profissionais no admin +
Storage próprio (sai o carro57) · vendas: proposta, pré-venda apurada,
fechamento atômico, comissão por regra, repasse de saída com contrato/termo (spec 20) · razão:
15 contas, partidas, regras de contabilização, visões a pagar/receber (spec 30) · ciclo: CICLO_ABERTO
no fechamento + % sobre FIPE + trava pelo praticado (spec 40) · documentos: geração de contratos +
prazos CTB (spec 60) · pós-venda: chamado com relógio de 30 dias (spec 70) · direção: tela do dia.
Saída: 30 dias de operação com entrada, venda e resultado só no admin (Revenda só para NF).

## F2 — Vitrine, mídia, régua e Ciclo no núcleo (≈3–4 semanas)
estoque_motors → projeção (contrato de leitura preservado); integrador de portais com status/
reprocesso; anúncio versionado; despublicação automática; mídia atribuída por unidade; régua de
envelhecimento ativa (30/60/90/120) com gatilho de repasse; revisões do Ciclo no núcleo + painel
de exposição + histograma do deságio; LGPD retenção; observabilidade (fila parada, erro, alerta).
Saída: 100% dos anúncios pelo admin; integrador do Revenda desligado; primeira venda com margem
após mídia fechada.

## F3 — Fiscal e financeiro completo (≈4 semanas)
NF-e integrada nos dois sentidos sincronizada ao RENAVE; ATPV-e (Res. 1.027); conciliação bancária;
DRE competência/caixa com dimensões; assinatura eletrônica.
Saída: um mês fiscal fechado em paralelo, batendo com o Revenda.

## F4 — Entrega e desligamento (≈2 semanas)
Checklist de entrega com assinatura no celular; protocolo de 5 peças completo; Revenda congelado
em leitura por um trimestre; depois, cancelamento.
Saída: 30 dias sem ninguém abrir o Revenda para trabalhar.

## Backlog completo e pesos
Ver artefato (seção Backlog) — itens 00–39 com fase e criticidade. Este plano é a ordem; o artefato
é o detalhe.
