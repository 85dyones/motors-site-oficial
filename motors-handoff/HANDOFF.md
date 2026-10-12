# HANDOFF — Motors Admin: evolução do sistema atual para a plataforma de operação e o SaaS multi-loja

> Documento-mestre. Leia este arquivo primeiro, depois `CLAUDE.md`, depois a spec da fase em curso.
> Fonte completa da análise (contexto, benchmark, decisões): artefato
> https://claude.ai/code/artifact/f23542ac-80a3-4fa1-956c-a0b44523fbc2
> Diagnóstico de prontidão para SaaS (12/10/2026, privado — notas por módulo, riscos, mercado e
> plano): artefato https://claude.ai/artifact/7aLuwwZrSYhBVaTMJ97Xtc

> ## 📌 Virada para SaaS — decisões do Dyones em 2026-10-12
>
> Valem sobre o texto original abaixo onde houver conflito; o texto já foi ajustado a elas.
>
> | # | Questão | Decisão |
> |---|---|---|
> | SaaS-1 | Vender a outras revendas? | **Sim, por módulos.** Revoga a decisão 4 original ("costura de SaaS, um tenant") e tira "multi-tenant UI" e "cobrança SaaS" do fora de escopo. |
> | SaaS-2 | Como as lojas dividem o banco | **Banco único compartilhado.** Toda linha tem `org_id`; o acesso é pela loja do usuário (membro), nunca por constante. Uma instalação por loja só como contingência de piloto. |
> | SaaS-3 | Porta de entrada no mercado | **Pacote de expansão sobre o sistema de gestão que a loja já usa** (RevendaMais, Autoconf, Boom…), não substituto dele. Estoque completo (NF-e, RENAVE, portais) vem depois, e só se a estratégia pedir. |
> | SaaS-4 | Ordem com o plano F0 → F4 | **Fundação multi-loja (S1) antes da F1**: razão, custos e venda nascem multi-loja. Ordem nova em `docs/fases/PLANO.md`. |
> | SaaS-5 | Onde ficam os dados | **Projeto Supabase novo em sa-east-1 (São Paulo)**, criado junto com o staging da S0; a Motors migra para ele como loja nº 1. |
> | SaaS-6 | Repositório e CI | **Repositório privado** (GitHub Pro, que mantém a proteção de branch). CI em runner próprio: no começo o VPS KVM 4 da Hostinger (o mesmo do n8n, do Evolution e do Chatwoot, com teto de memória e CPU e sem acesso aos serviços locais), depois o computador de casa do Dyones. Runner desligado manda o CI sozinho para os servidores do GitHub — ver `docs/RUNNER_DO_CI.md`. |
>
> **Sem decisão:** nome público do produto (até lá, "a plataforma"; é a pendência D8 da
> `AUDITORIA.md`) e quais lojas serão as pilotos.

## O que está sendo construído

O admin de `motorsstore.com.br` (repo `85dyones/motors-site-oficial`, Next.js + Supabase) evolui
para o sistema de operação da Motors Store — substituindo o RevendaMais por completo, sem ruptura:
o site, o funil de leads, o Ciclo e os fluxos n8n atuais continuam funcionando durante toda a migração.

Desde 2026-10-12 o mesmo código vira **plataforma SaaS multi-loja**, vendida por módulos a outras
revendas: Site e SEO, Gestão de leads, Mídia e Ads, Painel do dono, Investidores e Pós-venda. A
Motors é a loja nº 1 e a prova de que funciona. A porta de entrada é o pacote de expansão (site com
SEO local, leads com SLA e conector com o estoque que a loja já mantém em outro sistema); a
substituição do RevendaMais continua sendo o caminho da Motors, não pré-requisito para vender.

**Não é um ERP.** É um sistema de operação de loja, organizado por setor (compras, pátio, marketing,
vendas, documentação, financeiro, pós-venda, Ciclo, direção). Teste para qualquer feature nova:
*quem, na loja, abre isso e em que momento do dia?* Sem resposta com nome e hora, não constrói.

## Decisões de arquitetura (não renegociar sem o Dyones)

1. **Evento é a fonte da verdade.** `veiculo_eventos` é imutável (sem UPDATE/DELETE — trigger + RLS).
   Situação, dias em estoque, custo e margem são projeções. `situacao` NUNCA é coluna editável.
2. **Razão de partidas dobradas com dimensões.** Todo evento de negócio emite lançamento balanceado
   (débito = crédito, constraint deferida). Partidas carregam veiculo/modalidade/vendedor/campanha/
   centro_custo. Contas a pagar/receber são VISÕES do razão, nunca uma segunda verdade.
   Escopo: resultado operacional. Não é contabilidade fiscal (sem SPED/ECD/apuração de tributos).
3. **Regra é dado, não código.** Comissão, contabilização, parâmetros de avaliação (curva de deságio)
   e parâmetros do Ciclo vivem em tabelas com vigência datada e tela de edição no admin.
   Registro antigo guarda os parâmetros do dia em que foi criado.
4. **Multi-loja de verdade, num banco só** (SaaS-1 e SaaS-2; substitui a "costura de SaaS, um
   tenant"). TODA tabela tem `org_id uuid not null` + RLS que filtra pela loja do usuário —
   `org_atual()`, lida da tabela de membros (`org_membros`) via claim no token — e nunca por
   constante. Configuração, conteúdo e credenciais de integração são dado por loja (segredo no
   Vault), nunca código nem variável de ambiente. Módulo é liberado por loja (`org_modulos`); loja
   nova nasce por função de provisionamento, com seus dados iniciais.
   *Transição:* até a S1 entregar `org_atual()`, tabela nova segue com `default org_padrao()` (o
   teste `tests/f0-nucleo.test.ts` trava isso); a S1 troca default, policies e funções de uma vez.
5. **Módulos conversam por evento ou função pública.** Um módulo não lê tabela de outro diretamente.
6. **Strangler, não big-bang.** O sistema novo cresce AO LADO do atual no mesmo repo e no mesmo
   banco — que passa a ser o projeto novo em sa-east-1 (SaaS-5), com a Motors como loja nº 1.
   `estoque_motors` (que alimenta o site hoje) vira PROJEÇÃO do núcleo na F2 — até lá, permanece
   intocada como origem, com UMA exceção autorizada em 2026-10-12: a S1 acrescenta `org_id` (aditivo,
   preenchido com a Motors) e a policy por loja. O contrato de leitura do site não muda. Nada do
   site público quebra em nenhuma fase.
7. **Integrar, não construir:** NF-e (provedor com API, ex. Focus NFe), RENAVE (integradora
   autorizada SENATRAN), assinatura eletrônica avançada/qualificada. Construir: estoque, eventos,
   razão, avaliação, pré-venda, Ciclo, vitrine/mídia.
8. **Nada da loja no código.** Nome, cidade, bairros, endereço, horário, telefone, domínio, IDs de
   conta (Pixel, GA4, GTM, Ads, Chatwoot, Evolution, feed) e textos institucionais vêm da
   configuração da loja. Código novo que escreve "Motors", "Curitiba" ou um telefone está errado;
   o legado é limpo na S1 e na S2.

## Urgência normativa (litígio de prazo — tratar antes de qualquer código de fase)

- **Res. CONTRAN 1.026/2026**: RENAVE obrigatório; escrituração eletrônica de entrada, saída,
  consignação e transferência entre revendas, com NF-e emitida de forma integrada e sincronizada
  ao registro. Prazo de adequação ≈ **28/09/2026**. A adequação operacional pode ocorrer via
  RevendaMais; o sistema novo nasce integrado à MESMA integradora escolhida.
- **Res. CONTRAN 1.027/2026**: ATPV-e com 3 modalidades; assinatura eletrônica avançada/qualificada;
  comunicação de venda automática; na consignação, os 30 dias do consignante contam do comprador.

## Regras de negócio inegociáveis (ver specs para detalhe)

- 5 portas de ENTRADA: compra_direta, troca, consignacao, parceria, repasse (lote = momento B).
  `posse` (propria|terceiro) é campo separado de `modalidade`.
- Troca não existe sem a venda de origem (constraint). Consignação tem valor_entrada = 0 e NÃO toca
  o razão até a venda. Parceria tem preço travado + margem acordada + confirmação de disponibilidade
  obrigatória antes de fechar (trava anti venda dupla).
- SAÍDAS: varejo, repasse (contrato + termo de isenção obrigatórios, receita em conta própria 3.1.2,
  comissão reduzida, fora da margem média do varejo), devolução a terceiro, estorno.
- Garantia é de quem vende ao consumidor (CDC art. 3º e 24) — nunca é campo do banco.
- PRÉ-VENDA: negócio com composição de pagamentos apurada (previsto→confirmado→liquidado);
  fechamento atômico bloqueado até tudo conferir; só o sinal toca o razão antes (passivo 2.1.3).
- Curva de deságio sobre FIPE: base 20 p.p., piso 15%, teto 40%, degraus de km e avaria — tudo
  editável em `parametros_avaliacao`.
- Ciclo (JÁ EXISTE em operação — portar, não recriar): nasce no ato da venda; percentual de
  recompra sobre FIPE definido no fechamento; revisões documentadas mantêm o direito; conformidade
  CALCULADA da documentação, nunca declarada.
- Venda abaixo do piso exige aprovação registrada como evento.
- Toda despesa tem dono (veiculo_id ou centro_custo_id).

## Como trabalhar (multiagente)

Agentes em `.claude/agents/`. O orquestrador (sessão principal) segue `docs/fases/PLANO.md`:
uma fase por vez, critério de saída cumprido antes da próxima. Dentro de uma fase, paralelize
por módulo usando os agentes; toda entrega passa pelo `qa-guardian` antes de merge.

Fluxo padrão por entrega:
1. `db-architect` escreve a migração (aditiva, ver REGRAS DE MIGRAÇÃO no CLAUDE.md) + testes de constraint.
2. `backend-core` implementa domínio/Server Actions consumindo o schema.
3. `frontend-admin` implementa a tela no padrão visual do admin existente (ler componentes atuais antes).
4. `integrations` liga n8n/terceiros quando a spec pedir.
5. `qa-guardian` roda o checklist de invariantes + testes + revisão adversarial.
6. `migration-runner` só atua na F0 e na conferência diária.

## Ordem de leitura das specs

`docs/specs/00-schema-core.md` → `10-entradas.md` → `11-avaliacao-desagio.md` → `20-pre-venda-e-saidas.md`
→ `30-razao.md` → `40-ciclo.md` → `50-vitrine-midia.md` → `60-fiscal-renave-docs.md` → `70-pos-venda.md`

## O que NUNCA fazer

- Editar/deletar linhas de `veiculo_eventos` ou `partidas`.
- Migração destrutiva (DROP/ALTER de coluna em uso) enquanto o Revenda for paralelo.
- Tocar em `estoque_motors` antes da F2 (e na F2, apenas convertê-la em projeção, mantendo o contrato de leitura do site). Única exceção: `org_id` e policy por loja na S1.
- Depois da S1: policy comparando `org_id` com constante (`org_padrao()`), consulta com a chave de
  serviço sem filtrar pela loja, ou unicidade global onde ela deveria ser por loja.
- Escrever dado de uma loja (nome, cidade, telefone, domínio, conta, credencial) no código.
- Hardcodar percentual, comissão ou parâmetro que a spec manda ser tabela.
- Criar tela sem responder "quem abre e quando".
- Inventar regra de negócio: lacuna na spec → perguntar ao Dyones, não assumir.
