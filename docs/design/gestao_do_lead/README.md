# Handoff: Gestão do lead no funil (/admin/leads)

> Cópia da especificação do projeto de design "Upgrade funil de leads Motors"
> (Claude Design, 23/09/2026). Os protótipos `.dc.html` ficam no projeto de
> design; aqui fica só o texto, que é a fonte para a implementação.
> Onde este texto cita cores em hexadecimal, vale o token `mt-*` do repositório
> (a paleta padrão hoje é a cobre, não a vermelha do protótipo).

## Overview
Upgrade da gestão do lead individual no funil da Motors Store. Hoje cada lead tem **uma** anotação (`leads.observacoes`), sem tipo, sem autor, sem data e sem próximo passo, e o card carrega todos os controles. O redesign:
- enxuga o card para o que o vendedor decide olhando o quadro;
- cria um **detalhe do lead** com vários registros, próximo passo (opcional desde 2026-10-09) e dados do negócio;
- dá ao vendedor uma **fila do dia** ("Minha fila" + "Lista do dia");
- une as três buscas numa só e cria o botão **Chegou na loja**.

## Fidelity
**Alta fidelidade.** Cores, tipografia, espaçamentos e textos são finais e foram derivados do próprio `LeadsKanban.tsx`, `AdminLayoutClientWrapper.tsx`, `SidebarNav.tsx` e `modernist.css`. Recrie com as classes e tokens já existentes. Os dados dos leads no protótipo são fictícios.

## Screens / Views

### 1. Quadro de leads: card enxuto (substitui o card atual)
Casca inalterada: trilho de 248px, barra de topo de 64px com régua de 2px, `main` com padding de 28px.

**Linha de controles** (substitui a busca por referência e a linha de filtros atual), em coluna, com gap de 10px:
1. **Busca única**: input com borda 1px `mt-regua`, fundo `mt-surface`, padding 9×12, 13px. Placeholder "Buscar por nome, telefone ou referência". Com busca ativa, aparecem "limpar" (11px, `accent-700`) e, embaixo, a linha "N encontrado(s) na equipe inteira" (11px, `neutral-700`).
2. Linha com gap de 8px, com wrap:
   - **Escopo**: segmentado "Minha fila (n) | Equipe (n)", borda 1px `mt-regua`, opção 8×12, 11px, peso 600, tracking .06em. A opção ativa tem fundo `mt-ink` e texto `mt-bg`.
   - **Vista**: segmentado "Lista do dia | Quadro", mesmo estilo.
   - **Filtros**: chips "Atrasados (n)" e "Hoje (n)", no estilo do "Só os parados" atual (ativo: borda `mt-accent`, fundo `accent-100`, texto `accent-800`). O "Só os parados" sai.
   - **Remove**: trilho de etapas clicável. **Mantém**: barra de slide (`mt-range`), que só aparece quando o quadro rola.

**Colunas**: inalteradas (240px, gap de 2px, a primeira com cabeçalho em tinta e régua de acento).

**Card** (padding 12, flex em coluna, gap 8; moldura igual ao `MOLDURA` atual por nível de estagnação; o card aberto na gaveta ganha outline 2px `mt-ink`, offset -2px):
1. Nome (13px/800, tracking -.01em), interesse (11px, `neutral-800`) e aviso de estagnação (texto e estilo atuais).
2. **Última interação**: régua fina em cima, padding-top 8. Rótulo "WHATSAPP · HÁ 6 D" (9px/600, tracking .12em, maiúsculas, `neutral-600`) e texto (11px, line-height 1.4, `neutral-800`, cortado em 2 linhas).
3. **Próximo passo**: bloco com padding 7×8, fundo `mt-bg` e border-left 2px (`mt-regua`; se atrasado, `mt-accent`). Rótulo "→ HOJE · 16:30" ou "→ ATRASADO · 5 D" (9px/800, tracking .12em, maiúsculas; atrasado em `accent-800`). Texto em 11px/600.
4. **Linha de ações**: link "Chatwoot (41) 99117-6299" (flex 1, borda 1px `mt-accent`, 11px/600 `mt-accent`, telefone sem DDD em 400 `neutral-700`) + botões ← e → (borda `mt-regua-fina`, 4×9, 11px; desabilitado com opacidade .3). As setas e o link param a propagação (não abrem o detalhe) e o link tem `draggable={false}`, como hoje.
5. Responsável: quadrado de 20px com iniciais, nome em 10px e "13ª TRANSF." à direita (10px, maiúsculas, `neutral-600`).
- **Saem do card**: select de responsável, anotação, Ganho, Perdido e Não é oportunidade (vão para o detalhe). Arrastar continua.
- Clicar no card abre o detalhe.

### 2. Lista do dia (vista padrão do vendedor)
Coluna de 540px (à esquerda da gaveta). Grupos **Atrasados / Hoje / Próximos**, só os que têm itens:
- Título do grupo: 11px/800, tracking .1em, maiúsculas (Atrasados em `accent-800`), contagem em 11px `neutral-700` e régua de 2px embaixo.
- Linha: grid `84px | 1fr | auto`, gap 12, padding 12×10, régua fina embaixo, border-left 3px (transparente; `mt-accent` se atrasado; `mt-ink` + fundo `mt-surface` se aberta). Hover com fundo `mt-surface`.
- **Hora** (13px/800, tabular; atrasado em `accent-800`): "HH:MM" no grupo Hoje, "Amanhã 09:00" / "Sáb 10:00" fora dele, "5 d" / "ontem 17:00" nos atrasados e "Agora" para "Chegou na loja".
- **Meio**: "→ {próximo passo}" (13px/600); "**Nome** · interesse" (12px); última interação em uma linha com reticências (11px, `neutral-600`).
- **Direita**: etapa (10px/600, maiúsculas, `neutral-600`).
- Ordenação: atrasados primeiro, depois por data e hora de vencimento.
- Vazio: caixa tracejada "Nada por aqui. Limpe a busca ou troque para Equipe."

### 3. Detalhe do lead: um componente, dois layouts
- **Desktop (≥1024px): gaveta** de 600px, absoluta à direita sobre o quadro, com border-left 2px `mt-ink`, `--mt-shadow-lg` e rolagem própria. Botão "FECHAR ✕". Esc fecha.
- **Tablet e links: página** `/admin/leads/[id]` com trilha `PAINEL / GERAL / LEADS / {NOME}`, "← voltar para o quadro" e "lead anterior · próximo lead da coluna →". O alerta do n8n aponta para esta URL.

Grid (os blocos se reposicionam por `grid-template-areas`):
- gaveta: uma coluna, na ordem `h p c t d`;
- página: colunas `320px | 1fr | 320px`, com áreas `"h h h" "d c p" "d t p"`.

**h: Cabeçalho** (padding 20×24, régua de 2px embaixo, gap 14):
- Rótulo "PROPOSTA · WHATSAPP PROPOSTA · 8 D NO FUNIL" (`mt-rotulo mt-rotulo-accent`) + aviso de estagnação.
- Nome (28px/800, tracking -.03em) e interesse (13px).
- Botões:
  - "Abrir no Chatwoot {telefone}" (padrão atual): abre a conversa e pré-seleciona **WhatsApp** no registro;
  - "LIGAR" (`mt-btn-contorno`, 9×14, 11px): pré-seleciona **Ligação**;
  - "CHEGOU NA LOJA" (`mt-btn-tinta`, 9×14, 11px).
- Segmentado de etapas (clicar move o lead; terminais seguem pedindo motivo), responsável (quadrado + select) e selo de transferências.
- À direita: Ganho / Perdido (estilo atual) e "Não é oportunidade" com menos peso, como hoje.

**p: Próximo passo** (padding 20×24):
- Rótulo "PRÓXIMO PASSO".
- Caixa com padding 14 e borda 1px `mt-regua`, fundo `mt-surface`. Se atrasado: borda 2px `mt-accent` e fundo `accent-100`.
- Conteúdo: quando (11px/800, maiúsculas), texto (15px/600), "Com {responsável} · definido {há X}" (11px).
- Botões: "CONCLUIR" (tinta), que abre o registro com "Feito: {passo}. " e o próximo passo vazio; "Remarcar" (contorno fino), que abre com "Remarcado: " e o mesmo passo para trocar a data.
- Nota: "É o que aparece no card e o que dispara o aviso quando vence."

**c: Registrar interação**:
- Segmentado "Anotação | Ligação | WhatsApp | Visita à loja". O padrão é Anotação, ou o tipo vindo do contexto.
- Se Ligação: chips "Atendeu | Não atendeu | Caixa postal" (10×14, 12px/600), e o texto vira opcional.
- Textarea de 3 linhas (borda `mt-regua`, fundo `mt-surface`, 13px). O placeholder muda por tipo:
  - Anotação: "O que foi combinado…"
  - Ligação: "Opcional: o que ficou combinado?"
  - WhatsApp: "Resumo da conversa no WhatsApp…"
  - Visita: "Veio à loja? Viu qual carro? Fez test drive?"
- Caixa "PRÓXIMO PASSO · OPCIONAL" (era "OBRIGATÓRIO" até 2026-10-09; fundo `neutral-100`, borda fina). Enquanto vazia, mostra duas **sugestões por etapa** (botões tracejados "+ texto · amanhã 10:00"):
  - Novo: Primeiro contato pelo WhatsApp · hoje +15 min | Ligar para qualificar · hoje +1 h
  - Em contato: Enviar proposta · amanhã 10:00 | Convidar para visita · amanhã 10:00
  - Proposta: Cobrar retorno da proposta · amanhã 10:00 | Enviar simulação de financiamento · hoje 17:00
  - Visita agendada: Confirmar visita · amanhã 09:00 | Avaliar carro na troca · hoje 16:00
  - Negociação: Levar contraproposta ao gerente · hoje 16:00 | Fechar pedido · amanhã 10:00
- Na mesma caixa: input do passo, chips "Hoje | Amanhã | Em 3 dias | Próx. semana" e campo de hora.
- "REGISTRAR →" (`mt-btn-primario`, 12×20), desabilitado (opacidade .45) até valer a regra. A dica ao lado muda conforme o estado:
  - "Escreva o que aconteceu." / "Marque se atendeu."
  - "Falta o próximo passo: toque numa sugestão ou escreva."
  - "O card passa a mostrar “{passo}” · {quando} {hora}."

**t: Histórico**:
- Rótulo e filtros "Tudo (n) | Interações (n) | Sistema (n)" (chips no estilo dos filtros), régua de 2px em cima.
- Item: marcador de 8px (humano = quadrado cheio `mt-ink`; sistema = contorno `neutral-500`). Tipo em 10px/800 maiúsculas (sistema em `neutral-600`), autor em 11px, data à direita (10px, tabular).
- Texto em 13px (sistema: 12px, `neutral-700`) e "→ Próximo passo: **…**" em 11px quando houver.

**d: Dados do negócio** (na página fica numa coluna à esquerda; na gaveta, ao fim):
- Telefone e e-mail.
- Carro de interesse vinculado ao estoque: caixa com nome, "Estoque · km · preço" e o botão "Trocar".
- Carro na troca.
- Faixa de entrada (select: Sem entrada, Até R$ 5 mil, R$ 5 a 10 mil, R$ 10 a 20 mil, Acima de R$ 20 mil).
- Forma de pagamento pretendida (segmentado: À vista | Financiado | Com troca | Consórcio; os mesmos cortes dos motivos de ganho).
- Origem / campanha e Ref., só leitura.
- Recomendação: mostrar só os campos preenchidos e agrupar o resto atrás de "+ adicionar dado".

## Interactions & Behavior
- **Registrar**: prepende no histórico, atualiza a última interação e o próximo passo do card e **reinicia o relógio** (o nível de estagnação volta a ok e o aviso some). O próximo passo é opcional (decisão do dono em 2026-10-09: nem todo atendimento termina com um passo combinado, e exigir um afastava o comercial do sistema). Sem passo, o lead mantém o que tinha; o CONCLUIR sem passo novo tira o passo feito do card. Se vier passo, vem com texto e data.
- **Chegou na loja**: interação `visita` com o autor "Balcão", move para a etapa de visita, define o próximo passo "Atender na loja · agora" e grava no histórico o evento de sistema "Movido para Visita agendada · {responsável} avisado no WhatsApp", avisando o responsável de fato.
- **Busca**: nome (contém), telefone (dígitos contidos) ou referência (8 caracteres, via `normalizarRef`). Buscando, o escopo é ignorado.
- **Escopo padrão**: Minha fila para o papel comercial; Equipe para Admin e Gestor.
- **Contagens**: os chips contam sobre escopo + busca, nunca sobre o total.
- **Regras que continuam**: estados de erro no padrão atual (faixa `accent-100`/`accent-800` com border-left 3px), gravação otimista com recarga em falha, tique de 60s do relógio, arrasto com rolagem na borda.

## State Management
- Kanban: `escopo: 'minha'|'equipe'`, `vista: 'lista'|'quadro'`, `busca`, `chip: null|'atrasados'|'hoje'`, `leadAberto: id|null`. Todos entram na URL (`?vista=lista&lead=…`) para o F5 e o link do alerta funcionarem.
- Detalhe: `tipo`, `resultado`, `texto`, `passo`, `quando`, `hora`, `filtroHistorico`.
- Dados: GET do detalhe (dados + histórico unificado de `leads_interacoes` + `leads_eventos`), POST de interação, POST de chegou, PATCH dos dados.

## Design Tokens (use as classes `mt-*` existentes)
| Protótipo (`var(--color-*)`) | Repositório |
|---|---|
| `--color-bg` | `mt-bg` |
| `--color-surface` | `mt-surface` |
| `--color-text` | `mt-ink` |
| `--color-accent` | `mt-accent` |
| `--color-accent-100` / `-700` / `-800` | `mt-accent-100` / `mt-accent-hover` / `mt-accent-800` |
| `--color-neutral-100` | não existe em `mt-*`: use `mt-bg` ou crie `mt-neutral-100` |
| `--color-neutral-500/600/700/800` | `mt-neutral-500/600/700/800` |
| `rgba(32,30,29,.18)` / `.4` | `mt-regua-fina` / `mt-regua` |
| `--shadow-lg` | `--mt-shadow-lg` |

- Tipografia: Archivo (`font-modernist`); tamanhos de 9 a 13px no card, 28px no nome do detalhe.
- Raio: 0 em tudo. Sem sombra, exceto na gaveta.

## Assets
Nenhum: não há ícones nem imagens novos, e o painel continua sem ícone, por decisão registrada no `SidebarNav.tsx`.

## O que mudou no repositório depois deste desenho (03/10/2026)
Estas decisões do dono são posteriores e valem sobre o texto acima:
- **Quem vê qual lead** (`src/lib/escopoDeLeads.ts`): admin vê todos; gestor e SDR só os que já têm responsável; comercial só os dele; marketing e financeiro, nenhum. A busca também obedece a essa regra: "na equipe inteira" vale só para quem vê a equipe.
- **Só o administrador deixa um lead sem responsável.**
- **Etiquetas do lead** (`EtiquetasDoLead.tsx`) existem e continuam: resumo no card, edição no detalhe.
- **Chatwoot**: atribuição feita por administrador lá vira responsável aqui.
- **Banco**: `leads_interacoes`, o próximo passo em `leads`, os dados do negócio e a função `registrar_interacao_do_lead` já estão em produção (migração `20260923150000_gestao_do_lead.sql`). A Fase 1 do plano original está feita.
