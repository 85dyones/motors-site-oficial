# Handoff de volta — conversões otimizadas, lado do código

**Responde a:** `HANDOFF_CONVERSOES_OTIMIZADAS.md`, de 26/08/2026.
**Data:** 26/08/2026.
**Estado:** implementado, testado e mesclado na `main` — commit `e209227`.
**Complementa:** `docs/GTM_CONFIGURACAO.md`, que ganhou os §5.1, §5.2 e §6.1
nesta rodada.

---

## 1. Resumo executivo

A pendência do §3 do documento recebido — *"o formulário da ficha capta só o
nome, e nome sozinho gera match zero"* — está resolvida. O modal de lead agora
pede **telefone (obrigatório)** e **e-mail (opcional)**, com a marcação que a
detecção automática do Google lê. `/contato` e `/avaliacao` ganharam os mesmos
atributos, que também não tinham.

Três coisas para saber, em ordem de importância:

1. **Havia um defeito maior que o tracking, e ele estava em produção.** O lead
   da ficha, do CarMatch e do pop-up chegava ao n8n com `telefone: ""` e
   `remoteJid: ""`. Quem não mandava a mensagem no WhatsApp virava um nome sem
   contato. Detalhes no §5.
2. **Três decisões divergem do que o documento pediu**, e cada uma tem motivo
   técnico que não se lê no diff — §3. A mais importante: os IDs do modal
   **não** são `#phone-input`/`#email-input`.
3. **⚠️ Não preencher `googleAdsId` no painel.** O §5 do documento recebido
   partia de uma premissa que precisa de um ajuste — §4 —, e a consequência
   prática é que aquele campo virou uma armadilha de dupla contagem.

**O que depende de você:** o critério de aceite do §6 do documento recebido,
no GTM Preview. Está reproduzido no §6 abaixo.

---

## 2. Item a item, contra o documento recebido

| Documento recebido | Estado | Onde |
|---|---|---|
| §3.1 · telefone no formulário da ficha | ✅ feito, **obrigatório** | `LeadCaptureModal.tsx` |
| §3.1 · e-mail, "se couber no fluxo" | ✅ feito, **opcional** | `LeadCaptureModal.tsx` |
| §3.1 · `type="tel"` / `type="email"` | ✅ | os três campos |
| §3.1 · `autocomplete="tel"` / `"email"` | ✅ — e acrescentado também em `/contato` e `/avaliacao`, que não tinham | `ContatoClientWrapper.tsx`, `AutoAvaliacao.tsx` |
| §3.1 · `name` semântico | ✅ `phone`, `email`, `name` | idem |
| §3.1 · `id` na convenção do site | ⚠️ **divergiu** — ver §3.1 abaixo | — |
| §3.1 · `label`/`aria-label` | ⚠️ **`label` sim, `aria-label` não** — ver §3.2 | — |
| §3.2 · campo montado no instante do push | ✅ já estava correto; agora **travado por teste** | `tests/conversoes-otimizadas.test.ts` |
| §3.2 · conferir `/contato` e `/avaliacao` | ✅ conferido, os dois medem antes de limpar; travado por teste | idem |
| §3.3 · nada de PII no `dataLayer` | ✅ travado por teste | idem |
| §5 · atualizar o `GTM_CONFIGURACAO.md` | ✅ §0 reescrito, §5.1 e §5.2 novos | `docs/GTM_CONFIGURACAO.md` |
| §6 · critérios de aceite | ⏳ **depende de você**, no GTM Preview | §6.1 do `GTM_CONFIGURACAO.md` |
| §7 · tabela de seletores | ✅ atualizada, com as linhas do modal | §0.5 do `GTM_CONFIGURACAO.md` |

Nada do documento ficou de fora.

---

## 3. As três divergências, e por quê

### 3.1 · Os IDs são `#lead-phone-input` e `#lead-email-input`

O §7 pediu `#phone-input` e `#email-input`, "seguindo a convenção já existente".
**Não dá**, e o motivo vale registrar:

O `LeadPopup` está montado no **layout raiz** (`src/app/layout.tsx`), ou seja,
existe em toda página do site — **inclusive `/contato`**, que já tem
`#phone-input` e `#email-input`. Com o pop-up aberto ali, a página passaria a
ter **dois elementos com o mesmo `id`**: HTML inválido, e `querySelector`
devolvendo o primeiro em ordem de documento. Ambiguidade exatamente no instante
da conversão — e do tipo que não dá erro nenhum, só um `emd` apontando para o
campo errado.

**A troca não custa nada** porque a detecção automática do Google **não usa o
`id`**: ela varre por `type`, `autocomplete` e `name`, e os três campos do modal
declaram os três. O próprio §2.3 do documento recebido diz que as variáveis
baseadas em ID estão *"hoje sem consumidor"*.

**O que muda para você:** no dia em que ligar aquelas variáveis, o seletor
precisa cobrir os dois conjuntos:

| Variável | Seletor |
|---|---|
| telefone | `#phone-input, #whatsapp-input, #lead-phone-input` |
| e-mail | `#email-input, #lead-email-input` |

Está na tabela do §0.5 do `GTM_CONFIGURACAO.md`, e
`tests/conversoes-otimizadas.test.ts` impede o modal de voltar a usar os IDs
de `/contato`.

### 3.2 · Sem `aria-label` nos campos

O snippet do §3.1 traz `aria-label="Telefone"`. Ele presume um campo **sem
rótulo visível** — e aqui há `<label htmlFor>` em todos.

`aria-label` **sobrescreve** o rótulo visível. O resultado seria a tela dizendo
"Seu WhatsApp" e o leitor de tela anunciando "Telefone" — é o critério
*Label in Name* (WCAG 2.5.3). O `<label>` já dá o nome acessível e já é o sinal
de rótulo que a varredura procura, então não se perde nada.

### 3.3 · Os campos ficam `readOnly` durante o envio, nunca `disabled`

O modal desabilitava os campos enquanto enviava. Isso é anterior a esta rodada
e passava despercebido porque não havia campo que importasse.

Só que o §3.2 do documento recebido é claro: a detecção lê o DOM **no instante
do `generate_lead`** — e esse instante cai dentro do envio, com o estado de
carregando já ligado. Campo `disabled` é exatamente o tipo de coisa que um
varredor de formulário descarta, e o formulário de `/contato`, o único que
comprovadamente entrega hash em produção hoje, **não desabilita nada**.

`readOnly` trava a edição do mesmo jeito e mantém o campo indistinguível de um
campo comum para quem lê o DOM. Não temos como testar o varredor do Google por
fora, então a escolha foi a que não depende de adivinhar o comportamento dele.

---

## 4. Um ajuste na premissa do §5

O documento recebido diz: *"o `IntegrationsTracker` nunca configurou o
`AW-18360613832`"*. O **efeito** relatado está certo — não havia `config` do Ads
na página, e os hits saíam adiados. A **causa** é outra, e a diferença importa.

O `IntegrationsTracker` **tem** o código do `config` do `AW-` (bloco "1.5" do
arquivo). Ele é condicionado ao campo `googleAdsId` de `site_settings`, que está
**vazio**. O bloco nunca rodou porque ninguém preencheu o campo — não porque o
código não exista.

> ### ⚠️ Por isso `googleAdsId` virou uma armadilha
>
> Preencher aquele campo hoje **não é "ligar o Ads"** — ele já está ligado, pela
> Tag do Google do contêiner. O que acontece é:
>
> 1. um **segundo `config`** para o mesmo destino; e, pior,
> 2. como o interruptor `gtmAssumeEventos` também está em `false`, o
>    `src/lib/telemetry.ts` volta a disparar a conversão de lead por conta
>    própria — **em cima** da tag `Ads - conv_lead` do contêiner.
>
> Dupla contagem e CPA pela metade, sem nenhum aviso na tela. Se um dia for
> preciso preencher, marcar `gtmAssumeEventos` **na mesma gravação**.
>
> O aviso está no próprio `IntegrationsTracker.tsx`, no ponto onde alguém iria
> mexer, e no §5.1 do `GTM_CONFIGURACAO.md`.

A sugestão do §5 do documento — atualizar o `GTM_CONFIGURACAO.md` para a próxima
pessoa não remover a Tag do Google achando que é duplicação — foi seguida: o §0
deixou de proibir o Ads dentro do contêiner, e o §5.1 explica por quê.

---

## 5. O defeito que apareceu ao verificar

Não estava no documento recebido porque só aparece do lado do CRM.

### 5.1 · O lead chegava sem telefone

O `LeadCaptureModal` é **um só** e serve **quatro** fluxos: ficha, CarMatch,
pop-up e avaliação. Ele já tinha `email` e `whatsapp` no estado, mas renderizava
um único campo — o nome. Só a avaliação preenchia o telefone, porque o coleta
num passo anterior.

Para visitante de primeira viagem nos outros três:

```
n8n recebia:  { nome: "Fulano", telefone: "", remoteJid: "" }
```

Logo depois o site abre o WhatsApp. Se a pessoa não manda a mensagem, a loja
fica com um nome e nada para onde responder.

### 5.2 · E o único fluxo que tinha telefone mandava errado

Os quatro `handleLeadSubmit` repetiam a mesma linha, com um nome que mentia:

```js
const cleanPhone = leadData.whatsapp;   // não limpava nada
const formattedPhone =
  cleanPhone.length === 10 || cleanPhone.length === 11 ? "55" + cleanPhone : cleanPhone;
```

A avaliação passava o valor **mascarado**. Com 15 caracteres, o teste de
comprimento falhava e o número seguia inteiro:

| | antes | agora |
|---|---|---|
| `remoteJid` | `(41) 99737-2165@s.whatsapp.net` | `5541997372165@s.whatsapp.net` |
| `phoneE164` | `+(41) 99737-2165` | `+5541997372165` |

O Evolution não conversa com aquele `remoteJid`, e o Ads não casa aquele E.164.
Medido antes de o modal ganhar o campo — que teria estendido o mesmo estrago aos
outros três fluxos.

A normalização passou para `telefoneDoLead()`, em `src/lib/whatsapp.ts`, usada
pelos quatro. **Fora da faixa de 10–11 dígitos ela devolve tudo vazio**, de
propósito: número incompleto vira lead sem telefone, não lead com telefone
errado. O CRM sabe lidar com campo vazio; com `remoteJid` inválido, não.

### 5.3 · E a máscara inventava números de telefone fixo

A máscara vivia dentro da avaliação e cortava sempre em 5+4 — todo fixo saía
como `(41) 33334-444`, um número que não existe. Não incomodava num campo
chamado WHATSAPP, onde ninguém digita fixo. Com telefone obrigatório no modal,
fixo passa a aparecer. Agora é 4+4 para fixo e 5+4 para celular, num lugar só.

---

## 6. Como validar — o critério é seu

Reproduzido do §6 do documento recebido, com a linha do `emd` ajustada ao ID
novo. Cópia versionada no §6.1 do `GTM_CONFIGURACAO.md`.

1. GTM → **Visualizar** → conectar em `motorsstore.com.br`.
2. Abrir uma ficha de veículo, preencher o formulário **com telefone**, enviar.
3. Assistente de Tags → aba do destino **`AW-18360613832`** → **Hits enviados**.

- [ ] Nenhum aviso de **"Hits adiados"** na sessão nova.
- [ ] Existe hit **`Conversão`** para `AW-18360613832`.
- [ ] Existe hit **`Dados fornecidos pelo usuário`** (endpoint
      `google.com/ccm/form-data/18360613832`).
- [ ] Nesse hit, `em` traz hash — formato `tv.1~em.<hash>`. Só `tv.1` é vazio.
- [ ] Nesse hit, **`pn` traz hash**. *Este é o item que o deploy destrava.*
- [ ] `emd` indica a origem, algo como `…lINPUT.s%23lead-phone-input`.
- [ ] `Ads - Remarketing dinamico` dispara **duas vezes** na ficha.

Depois: Google Ads → Conversões → Configurações → Conversões otimizadas. O
status leva **algumas horas** para refletir — não é motivo para mexer em nada
antes.

---

## 7. O que observar, e o que não foi feito

**Atrito novo.** Telefone obrigatório protege o CRM e destrava o match, mas é
um campo a mais num formulário que pedia só o nome. Vale olhar o volume de leads
da ficha na primeira semana contra a média anterior. Se cair de forma
consistente, a conversa é sobre o que vale mais — volume de nomes ou leads
contatáveis —, e é decisão do dono, não de código.

**O e-mail é opcional de propósito.** Campo opcional que barra envio custa lead;
a validação só reclama se estiver preenchido e torto.

**Continua fora do alcance:** quem fecha direto pelo botão de WhatsApp, sem
passar por formulário nenhum. Para esses o caminho segue sendo o upload de
conversões offline pelo GCLID (§4.6 do plano de aquisição).

**Não foi feito, e não deve ser:** mandar e-mail ou telefone no `dataLayer`.
A regra do §3.3 continua valendo integralmente, e agora tem teste.

---

## 8. O que foi tocado

Commit `e209227` — 10 arquivos, 659 linhas a mais, 48 a menos.

| Arquivo | O que mudou |
|---|---|
| `src/components/LeadCaptureModal.tsx` | os dois campos novos; validação; `readOnly` no lugar de `disabled` |
| `src/lib/whatsapp.ts` | `telefoneDoLead()` e `mascararTelefone()` |
| `src/components/PDPClientWrapper.tsx` | usa `telefoneDoLead` |
| `src/components/CarMatch.tsx` | idem |
| `src/components/LeadPopup.tsx` | idem |
| `src/components/AutoAvaliacao.tsx` | idem; máscara deduplicada; `autocomplete`/`name` nos campos |
| `src/components/ContatoClientWrapper.tsx` | `autocomplete`/`name` nos três campos |
| `src/components/IntegrationsTracker.tsx` | o aviso do §4, no ponto onde alguém iria mexer |
| `docs/GTM_CONFIGURACAO.md` | §0 reescrito; §5.1, §5.2 e §6.1 novos; tabela de seletores |
| `tests/conversoes-otimizadas.test.ts` | **novo** — 22 testes |

### O que os testes prendem

Não é "o campo existe". É o que quebra em silêncio:

- **atributo por atributo** nos oito campos das três telas — `type`,
  `autocomplete`, `name`, `inputmode`;
- **a ordem do §3.2** — o modal só fecha depois do envio; `/contato` mede antes
  de limpar e de trocar de tela;
- **`readOnly`, nunca `disabled`**, nos três campos do modal;
- **os IDs do modal não colidem** com os de `/contato`;
- **o nome acessível vem do `<label>`**, sem `aria-label` por cima;
- **a normalização do telefone**, incluindo fixo, celular e número incompleto;
- **nada de PII no `dataLayer`**;
- **nenhum `config` de `AW-` fixo** no `IntegrationsTracker`.

Estado na entrega: **1222 testes verdes**, typecheck e build limpos. A marcação
foi conferida no HTML renderizado e passada por um navegador de verdade, para
confirmar que o `autoComplete` do React chega ao DOM como `autocomplete` —
chega.
