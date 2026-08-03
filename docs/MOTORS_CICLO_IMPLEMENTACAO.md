# Motors Ciclo — Plano de Implementação
### Instruções de trabalho para o agente

Companheiro de `CLAUDE.md` (regras persistentes) e `MANUAL_MOTORS_CICLO.md` (especificação de produto).

---

## Pacote 0 — Auditoria *(obrigatório, antes de qualquer código)*

**Não escreva nenhuma linha de implementação antes de concluir este pacote e apresentar o relatório.**

O manual foi escrito descrevendo o estado desejado, não o atual. Boa parte pode já existir, parcialmente ou com outro nome. Implementar sem auditar vai duplicar tabela, quebrar sincronização de estoque ou criar um segundo modelo de cliente concorrente com o que já existe.

### O que inspecionar

**Banco (Supabase)**
- Liste todas as tabelas, colunas, FKs e políticas de RLS
- `estoque_motors`: schema completo, como é populada, com que frequência, qual a chave de identidade do veículo
- Existe alguma tabela de cliente, lead ou venda? Com que nome? Como se relacionam?
- Existem migrações versionadas em `supabase/migrations/`? O schema em produção bate com elas?
- Auth está configurado? Que providers? Existe login de cliente hoje?

**Aplicação (Next.js)**
- App Router ou Pages Router? Versão do Next e do React
- Estrutura de pastas, convenções de nomenclatura, biblioteca de estilo
- Como o estoque é consultado: server components, API routes, client-side?
- Existe alguma rota autenticada?
- Estratégia de cache e revalidação do estoque

**Integrações**
- Como o RevendaMais alimenta `estoque_motors` — XML, API, workflow do n8n?
- O que `TRACKING_SPEC.md` já implementa e o que ficou pendente
- Existe integração com financeira, corretora ou oficina hoje?
- Webhooks recebidos ou expostos

### Relatório de saída

Produza `AUDITORIA.md` na raiz com:

1. **Inventário do que existe** — tabelas, rotas, integrações
2. **Mapa de correspondência**: para cada entidade do manual §2, indique se já existe (com que nome), existe parcialmente, ou não existe
3. **Conflitos e riscos** — onde o manual colide com o que está em produção
4. **Recomendação de sequência**, ajustando os pacotes abaixo à realidade encontrada
5. **Perguntas em aberto** — o que você não conseguiu determinar pelo código

**Pare aqui e aguarde revisão.** Os pacotes seguintes só começam depois do relatório aprovado.

---

# BLOCO A — Liberado

## Pacote 1 — Fundação de dados

**Escopo:** manual §2 (schema completo) e §2.3 (view de estado).

- Migrações versionadas para as tabelas novas
- **RLS em todas**: cliente lê apenas as próprias linhas, via `cliente_id` derivado do JWT
- View materializada `vw_ciclo_estado` com job de refresh diário
- Seeds de desenvolvimento com dados sintéticos — **nunca dado real de cliente em ambiente de dev**

**Aceite:** um cliente autenticado consegue ler exclusivamente os próprios registros; qualquer tentativa cruzada retorna vazio, não erro. Teste automatizado que comprove isso.

## Pacote 2 — Captura na venda

**Escopo:** manual §3.

- Formulário de fechamento com validação **bloqueante**, não aviso
- `taxa_mensal` do financiamento é obrigatório — é o campo mais omitido e o mais valioso
- Consentimento LGPD granular no mesmo fluxo, com timestamp e canal
- Rotina noturna listando vendas incompletas, com notificação ao vendedor
- Painel de completude por vendedor

**Aceite:** é impossível marcar uma venda como concluída com campo obrigatório vazio. Confirme por teste, não por inspeção visual.

## Pacote 3 — Motor de gatilhos

**Escopo:** manual §4 (gatilhos 1, 2 e 4) e §5.1–5.2.

- Endpoints ou views que o n8n consome — o orquestrador vive no n8n, não no Next
- Funções de cálculo de saldo devedor (Price) e KM estimado, com testes unitários cobrindo casos de borda: prazo terminado, taxa nula, primeira parcela no futuro
- Regras de frequência do §4.3 aplicadas **no servidor**, não no workflow — o workflow pode ser reconfigurado por engano; a regra não pode

**Aceite:** dado um cliente com três gatilhos simultâneos, o sistema retorna exatamente um, respeitando a prioridade do §4.4.

## Pacote 4 — Painel de conformidade

**Escopo:** manual §5.7.

Pequeno em código, decisivo em consequência: **é o número que destrava a recompra.** Precisa estar no ar antes de existir volume para medir.

- Cálculo diário de conformidade de revisão
- Série histórica preservada (não sobrescrever)
- Painel interno com a série e o status do gatilho §1.4

**Aceite:** o painel mostra a série completa e responde de forma inequívoca se a condição de ativação foi atingida.

## Pacote 5 — Telemetria

**Escopo:** manual §2.1 (`telemetria_resumo`) e §5.6.

- Ingestão de agregados mensais do provedor de rastreamento
- **Nunca persistir traçado bruto de GPS**
- Cálculo mensal do Índice Ciclo com a regra de redistribuição (recusa não penaliza)
- Histórico em `indice_ciclo`, uma linha por veículo por mês

**Aceite:** com `consentimento_conducao = false`, o índice calculado é matematicamente equivalente a um cliente sem eventos de condução — não inferior. Teste explícito para isso.

## Pacote 6 — Área do cliente

**Escopo:** manual §6.3. O pacote de maior valor percebido.

- Auth por telefone com OTP
- **Bloco A** — Meu carro hoje: índice, KM e origem do dado, elegibilidade
- **Bloco B** — Minha posição de troca: três números separados, saldo devedor **sempre rotulado como estimativa**
- **Bloco C** — A curva de 12 meses (§5.8) com recomendação calculada, incluindo "espere"
- **Bloco D** — Meus dados: liga/desliga por categoria, exportação em PDF
- **Bloco E** — Documentação e histórico, exportável e compartilhável

**Aceite:**
- Nenhum caminho de código permite sobrescrever a recomendação de troca
- Desligar uma categoria em D produz efeito imediato e verificável no comportamento do sistema
- A curva é reproduzível: mesmos inputs, mesmo resultado

## Pacote 7 — Vitrine por posição de troca

**Escopo:** manual §6.1.

- Anônimo: filtro por parcela com premissas visíveis
- Logado: reordenação por adequação, com rótulo de lacuna por veículo
- **"Ver todo o estoque" permanentemente acessível**

**Aceite:** nenhum veículo em estoque fica inacessível a um cliente logado. Verifique comparando a contagem total com a contagem alcançável pela navegação.

## Pacote 8 — Equity mining

**Escopo:** manual §4.2 (gatilho 5) e §5.4.

- Elegibilidade só quando a parcela nova não excede a atual em mais de 10%
- Quando a recomendação for "espere", gravar `data_ideal_troca` e agendar o gatilho — **a venda é adiada, não descartada**

**Aceite:** nenhuma oferta é gerada violando o teto de parcela.

## Pacote 9 — Eventos de ciclo no tracking

**Escopo:** manual §8, estendendo `TRACKING_SPEC.md`.

- Eventos novos para Meta CAPI e Google Enhanced Conversions, com **valor de ciclo de vida**, não valor de lead
- Eventos existentes preservados

**Aceite:** os eventos atuais continuam disparando idênticos. Diff antes/depois.

---

# BLOCO B — Bloqueado

> **Não inicie estes pacotes.** Eles dependem do gatilho do manual §1.4: conformidade ≥ 70% por três meses consecutivos, 150+ veículos monitorados, 6+ meses de série telemétrica.
>
> Construir a interface de recompra antes da hora cria pressão organizacional para ligá-la antes de o dado sustentar. Se receber uma tarefa deste bloco, confirme primeiro se o gatilho abriu.

- **Pacote 10** — Cálculo de `fator_retencao` sobre série própria de depreciação
- **Pacote 11** — Módulo de precificação com piso, teto e faixa do índice (§5.5)
- **Pacote 12** — Contrato eletrônico de recompra e integração contábil de provisão
- **Pacote 13** — Selo de recompra na vitrine e ficha do veículo
- **Pacote 14** — Gatilhos 6 e 7 (janela de recompra, elegibilidade em risco)
- **Pacote 15** — Painel de exposição agregada vs. teto aprovado

---

## Convenções de trabalho

**Commits:** `tipo(pacote): descrição` — ex.: `feat(p6): bloco de posição de troca na área do cliente`

**Testes obrigatórios** em: cálculo de saldo devedor, Índice Ciclo, curva de troca, elegibilidade de equity mining, políticas de RLS. São os pontos onde erro silencioso vira dano real ao cliente.

**Cada pacote entrega** código, migrações, testes e uma nota curta do que mudou e do que ficou pendente.

**Ao encontrar divergência entre manual e realidade:** documente em `AUDITORIA.md`, proponha, aguarde. Não resolva por conta própria.
