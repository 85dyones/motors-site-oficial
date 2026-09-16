# `not-found.tsx` da ficha de veículo

**Rota:** `app/[categoria]/[marca]/[modelo]/[ficha]/not-found.tsx`
**Prioridade:** máxima. É o único item do pacote que está custando dinheiro hoje.

---

## O problema, confirmado em produção

A rota chama `notFound()` para veículo inexistente ou vendido. O metadata já é customizado — título "Veículo não encontrado | Motors Store", descrição mencionando que o veículo pode já ter sido vendido — e o `noindex` já está aplicado.

Mas o corpo renderizado é o 404 nativo do Next: `404: This page could not be found.`, em system-ui, inglês, sem estilo. O header e o rodapé do site renderizam em volta, então o usuário vê a moldura da marca com um erro genérico em inglês no meio.

Resposta verificada:

```
HTTP/2 404 Not Found
x-matched-path: /[categoria]/[marca]/[modelo]/[ficha]
x-nextjs-prerender: 1
x-nextjs-stale-time: 300
```

**Por que é urgente:** o catálogo do Meta aponta para o feed do próprio site, com recarga diária às 7h. Entre a venda e a próxima recarga existe uma janela de até 24 horas em que anúncio pago leva o clique para essa página.

---

## O que implementar

Manter o status 404, o `noindex` e o metadata customizado que já existem.

**1. Mensagem em português**, na linguagem do site: o veículo saiu do estoque ou já foi vendido.

**2. De 4 a 6 veículos similares**, com esta cascata de prioridade:
- mesma carroceria
- mesma faixa de preço (±20%)
- mesma marca

Derivar marca e modelo dos params da rota. **Reutilizar o card de veículo da listagem** — não criar componente novo.

**3. Links de saída:**
- página do modelo
- a carroceria correspondente
- a faixa de preço
- `/estoque`

Âncoras descritivas. Nada de "ver todos" ou "clique aqui" — regra R7 do guia normativo.

**4. Captura de lead** no mesmo padrão das páginas de marca e modelo sem estoque ("avise-me quando chegar"). Reutilizar o componente existente.

---

## Restrições

- Reaproveitar componentes, helpers de busca e tokens de tema que já existem no projeto. Zero componente novo se der para evitar.
- Nenhuma página do site pode terminar sem saída. É a regra R5 do guia normativo, e é ela que esse arquivo existe para cumprir.

---

## Fora de escopo neste PR

Mudar o status para 200 com página de "vendido", usando o status do veículo no `estoque_motors`. É a solução melhor a médio prazo — preserva a URL, a intenção de busca e o equity — mas depende de decisão de produto e fica para depois.

---

## Verificação depois do deploy

```bash
# pegar o ID de um veículo vendido nos últimos 60 dias no estoque_motors
curl -I https://motorsstore.com.br/carros/{marca}/{modelo}/{slug}-{id}
```

Esperado: `404` com a página nova renderizando em português, com similares e saídas.
