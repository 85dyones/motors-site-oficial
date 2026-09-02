# A auditoria se recusa a rodar sobre carro fictício

**Data:** 2026-09-02
**Escopo:** `scripts/auditoria-estoque.ts`, `src/lib/supabase.ts` (acréscimo), teste novo

---

## O defeito

`npm run auditoria:estoque` não carregava `.env.local`. Sem
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, o `getEstoque()`
caía no `MOCK_ESTOQUE` — cinco carros de demonstração, entre eles um Porsche 911
de R$ 998.000, um Defender 110 e um BYD Dolphin.

O relatório saía **formatado, completo e plausível**: slug, nome do veículo,
contagem de fotos, seções numeradas, código de saída. Nada nele dizia que o
pátio era inventado.

Em 2026-09-01 isso virou conclusão apresentada ao dono e escrita num commit —
"cinco carros de ticket alto fora da vitrine". O estoque real tinha quatro
bloqueados, todos de entrada: Kombi, Parati, Sandero, Voyage.

O que torna esse defeito caro não é errar: é errar **com a aparência de acerto**.
Um relatório que quebra ninguém cita. Um que sai bonito vira decisão.

## O invariante

> A auditoria só relata sobre o pátio real. Na dúvida, ela não roda.

## Desenho

### 1 · Carga do `.env.local`, e a ordem que a faz funcionar

O script passa a carregar `.env.local` sozinho, com `process.loadEnvFile()` —
API nativa do Node (≥ 20.12; a máquina roda 24.18). **Nenhuma dependência
nova:** `dotenv` não está no `package.json` e continua fora.

O detalhe que decide a implementação: `src/lib/supabase.ts:9` lê `process.env`
numa `const` de topo de módulo. Import estático é avaliado **antes** de qualquer
statement do arquivo que importa — um `loadEnvFile()` na primeira linha rodaria
tarde demais, com `supabaseUrl` já congelado em `""`. A falha seria segura (a
trava dispararia mesmo assim), mas o comando nunca passaria a funcionar.

Por isso `../src/lib/supabase` entra por `await import()` dentro do `main()`,
depois da carga. `coerenciaDoCadastro` e `veiculoUrl` não importam nada — são
folhas puras e seguem estáticos.

O caminho é resolvido a partir do arquivo do script
(`new URL("../.env.local", import.meta.url)`), não do `cwd`: rodando de qualquer
pasta lê o `.env.local` da árvore certa, e num worktree lê o do worktree.

Dois comportamentos medidos contra o Node desta máquina, não presumidos:

- `loadEnvFile` **não sobrescreve** variável já presente no ambiente — inclusive
  quando ela é string vazia. Quem exportou à mão ganha de um `.env.local` velho.
- Arquivo ausente lança `ENOENT`. É capturado em silêncio: quem dá a mensagem é
  a trava, que sabe dizer o que fazer.

### 2 · As travas

Três condições, todas com `process.exit(2)`, respeitando os códigos que o script
já usava: `0` limpo, `1` achados, `2` não rodou.

| | Condição | Por quê |
|---|---|---|
| a | `NEXT_PUBLIC_SUPABASE_URL` ou `ANON_KEY` vazias | dá a mensagem acionável |
| b | a lista devolvida é a de contingência | é a única que pega os outros três caminhos |
| c | a lista veio vazia | hoje isso sai verde sobre nada |

**Por que (b) além de (a).** São quatro caminhos até `estoqueDeContingencia()`,
e só um é falta de credencial: erro de query (`supabase.ts:802`), query certa com
zero linhas (`:865`), exceção de conexão (`:869`) e cliente não configurado
(`:875`). Chave errada, RLS fechada ou queda de rede passam pela trava (a)
intactas e ainda assim relatariam o Porsche.

**Por que (c).** Com lista vazia o script imprime `0 veículos` e
`✓ nada a revisar`, e sai **0**. Em CI isso é sinal verde sobre nada — e é
exatamente o que uma RLS fechada devolve, porque RLS não devolve erro, devolve
vazio.

### 3 · O predicado

`ehEstoqueDeContingencia(lista)` é exportado de `src/lib/supabase.ts`, colado ao
`MOCK_ESTOQUE`. Acréscimo puro: **nada muda no comportamento do site**, e a
válvula documentada em `supabase.ts:828-840` fica intocada.

Mora ali, e não no script, por uma razão só: quem um dia editar os cinco carros
fictícios vê a trava na mesma tela e a atualiza junto. Longe dali, ela apodrece
calada — que é a mesma classe de falha que este documento existe para fechar.

A régua é **algum** id da lista pertencer ao conjunto de ids do mock, derivado do
próprio `MOCK_ESTOQUE` em vez de cravado. "Algum" e não igualdade de conjuntos,
para pegar também mock parcial; nenhum id real (inteiro do RevendaMais, ou
≥ 900000001 do painel) colide com `porsche-911-carrera-s-2023`.

### 4 · Testes

- **O predicado**, sem crava id nenhum: `vi.stubEnv` zera as credenciais,
  `vi.resetModules()` reavalia o módulo e `getEstoque()` devolve a contingência
  de verdade — sem rede, porque cliente não configurado não consulta nada. O
  predicado tem que reconhecê-la. Ids reais e lista vazia dão `false`.
- **A trava, de ponta a ponta**, em processo filho (precedente:
  `tests/migracoes-executam.test.ts`): roda o script com as duas variáveis
  exportadas como string vazia — que sobrevivem ao `loadEnvFile`, o que torna o
  teste determinístico haja ou não `.env.local` na árvore. Afirma saída ≠ 0, a
  mensagem, e que **o Porsche não aparece na saída**. Essa última é a asserção
  que descreve o defeito de 01/09.
- Sem `tsx` alcançável o teste de processo filho é **pulado, não vermelho** —
  mesma disciplina das migrações: vermelho por ausência de infraestrutura ensina
  a ignorar vermelho.

## Fora de escopo

- O comportamento do `MOCK_ESTOQUE` no site. A válvula de `supabase.ts:828-840`
  existe por outra razão, já documentada lá, e não é tocada.
- Outros scripts fora do Next: `scripts/` tem um arquivo só. Quando aparecer o
  segundo, ele importa `ehEstoqueDeContingencia` — a parte reutilizável já está
  no lugar certo.
