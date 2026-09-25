# Quem entra no fluxo de leads — só o Comercial, e o papel SDR

**Data:** 2026-09-23 · Parte **A** de três (A: quem entra no fluxo → B: transferência ↔
Chatwoot → C: resgate configurável). B e C dependem da régua definida aqui.

**Pedido do dono:** *"temos usuários aqui que não são vendedores e temos uma role de SDR
que está junto no comercial [...] Vendedores hoje, o comercial, são o Dyones e Rodrigo,
Felipe é SDR e Igor é Marketing, nenhum destes que não sejam comercial, na atividade
principal ou secundária, podem estar no fluxo"* — e, sobre o SDR: *"só comercial recebe
lead"*; o SDR trabalha o resgate. Divisão A/B/C aprovada ("pode seguir").

## O que está errado hoje (medido em 23/09, só leitura)

| Pessoa | `papeis` | Rodízio automático | Lista do card |
|---|---|---|---|
| Dyones | admin, comercial, gestor, marketing, financeiro | entra | aparece |
| Rodrigo | comercial | entra | aparece |
| Igor | admin, marketing | **entra (errado)** | **aparece (errado)** |
| Felipe | comercial | fora só por não ter telefone | aparece (vai virar SDR) |

- Rodízio (`montar_fila_do_funil`, versão de `20260916150000`): candidato é
  `is_active and papeis && array['comercial','admin']` e com telefone. **Admin entra.**
- Lista do card (`GET /api/leads/gerenciar`): `profiles.role in ('admin','comercial')` —
  olha só o papel **principal** e inclui admin.
- O card mostra também valores antigos gravados no lead ("Dyo Paulino").
- Consequência visível: lead com "8ª transferência", rodando entre três pessoas, uma
  delas fora do comercial.

## A régua

> **Recebe lead quem está ativo e tem `comercial` em `papeis`** — em qualquer posição.

Nada mais conta: `admin`, `gestor`, `marketing`, `financeiro` e `sdr` não põem ninguém no
fluxo. Dyones continua (tem `comercial` secundário); Igor sai; Felipe sai ao virar SDR.

A mesma régua vale em três lugares, e cada um tem sua trava:

1. **Rodízio automático** (banco): troca `papeis && array['comercial','admin']` por
   `'comercial' = any(p.papeis)`. Telefone continua exigido (é por ele que o novo dono é
   avisado — "não existe transferência silenciosa").
2. **Lista de responsáveis do card** (`/api/leads/gerenciar`): lê `papeis` e `is_active`,
   filtra por `comercial`. Usa uma função única `recebeLead(perfil)` em
   `src/lib/permissoes.ts`.
3. **Troca manual por PATCH**: recusa (422) responsável que não passa na régua — a
   validação que mora só na tela vira opcional no dia em que alguém chamar a rota de
   outro lugar (mesmo raciocínio do desfecho). `null` (sem responsável) continua valendo.

**Lead que já está com alguém de fora** (Igor, "Dyo Paulino"): nada é migrado. O card
mostra o nome atual como opção marcada "fora do comercial", para não sumir da tela, e
qualquer troca só oferece o comercial. O rodízio já trata esse dono como qualquer outro:
se estagnar, transfere para o comercial.

## O papel `sdr`

Novo papel **de painel** (é equipe, entra em `ehStaff`/`is_staff`), mas **não recebe
lead**. Rótulo "SDR". Descrição: "Resgate de leads que o Comercial não converteu.
Trabalha no Chatwoot; não entra no rodízio".

Permissões na matriz A17 — **menor privilégio, a revisar pelo dono no PR**:

- Leads: ver e mover no kanban, registrar contato → `faz` (o resgate precisa mexer no
  lead).
- Todo o resto (estoque, preço, ficha, financeiro, configurações, usuários) → `nao_ve`.

Vocabulário é lista enumerada em **quatro** réguas que já se perderam uma vez (o gestor
em 22/08). Todas mudam na mesma migração, e o teste que trava `PERFIS` ×
`papeis_validos` passa a incluir `sdr`:

- `profiles_role_check`
- `papeis_validos()`
- `is_staff()`
- `PERFIS` / `ROTULO_DO_PERFIL` / `ALCADA_DO_PERFIL` / `DESCRICAO_DO_PERFIL` / matriz
  em `src/lib/permissoes.ts` (+ `handle_new_user`, se enumerar).

**Felipe → `papeis = ['sdr']`** é dado de pessoa: sai pela tela de usuários (A17) depois
do deploy, não pela migração. Fica no roteiro de entrega.

## Migração (`2026092313xxxx_quem_entra_no_fluxo.sql`, aditiva)

1. `sdr` nas três réguas do banco.
2. `montar_fila_do_funil` redefinida a partir da versão de `20260916150000`, mudando só
   o filtro do candidato.
3. **Aceite no próprio arquivo** (padrão do repositório, dentro de transação que se
   desfaz): perfil `admin+marketing` com telefone **não** é escolhido; perfil
   `admin+comercial` é; perfil `sdr` não é; `papeis_validos(array['sdr'])` é verdadeiro.
4. Rodapé do livro-razão. Ensaio com ROLLBACK antes de `--gravar`.

## Testes (cada trava quebrada com o bug real antes de valer)

- `recebeLead`: comercial principal, comercial secundário, admin sem comercial, sdr,
  inativo.
- Lista do card: com o `role` principal `admin` e `comercial` secundário, aparece; com
  `admin+marketing`, não.
- PATCH: responsável fora da régua → 422; `null` → aceito.
- Vocabulário: `PERFIS` ⊂ `papeis_validos` (teste existente, estendido).
- Aceite SQL da migração (acima) — é ele que prova o rodízio, não um teste de texto.

## Fora do escopo

- Chave "SDR ativo" e o destino do resgate → parte C.
- Reatribuição vinda do Chatwoot para agente de fora do comercial → parte B (ignorada).
- Chave individual "recebe leads" (férias/afastamento): não pedida; `is_active` segue
  sendo a única chave por pessoa.
