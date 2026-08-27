# Brechas de mensuração — o que foi corrigido em 27/08

**Responde a:** `HANDOFF_MENSURACAO_BRECHAS.md`.
**Feito:** A.2, A.3, B.1, B.3 e a parte de código do A.1.
**Continua aberto:** a conferência do A.1 no DebugView, o Consent Mode (B.2) e
os cinco itens do contêiner (bloco C).

---

## Antes de tudo: uma medição que muda o A.3

O documento diz que, sem `TURNSTILE_SECRET_KEY` no ambiente, todo token é
aceito — e conclui que o captcha pode estar aberto **hoje**.

Fui conferir antes de mexer, mandando um token inválido para `/api/leads` em
produção, com o corpo incompleto de propósito para não criar lead nenhum:

```
POST /api/leads  {"canal":"WhatsApp Proposta","turnstileToken":"token-invalido"}
→ HTTP 403  {"error":"Falha na verificação de segurança (Anti-Spam)."}
```

Com a chave de teste da Cloudflare, aquele token teria **passado** e a
requisição pararia no 400 de "dados de contato ausentes". O 403 prova que a
variável está configurada e o captcha funciona.

**Então a brecha do fallback era latente, não ativa.** O que estava aberto de
verdade era a outra metade do A.3 — e essa era pior do que o documento
descreve. Ver abaixo.

Isso também é o que torna seguro **falhar fechado**: não há tráfego legítimo
dependendo do fallback, então recusar sem a chave não derruba nada hoje.

---

## A.3 · Captcha — três consertos

**1 · A chave de teste saiu.** `verifyTurnstileToken` recusa e grita no log
quando `TURNSTILE_SECRET_KEY` falta, em vez de cair na chave "always passes"
da Cloudflare. Ambiente novo mal provisionado agora para de aceitar lead —
visível no mesmo dia — em vez de aceitar bot para sempre em silêncio.

**2 · A régua inverteu: de allowlist para lista de isenções.**

Esta era a porta aberta de verdade. `needsCaptcha` saía de uma lista de canais
que exigiam token, e o canal vem no **corpo do POST** — escrito pelo cliente.
Mandar `canal: "Formulário Contato"` pulava a verificação de qualquer canal, e
o nome isento estava escrito no comentário do próprio arquivo.

O caso pior nem era o abuso deliberado: `PDPClientWrapper` manda
`canal: activeChannel`, valor dinâmico. Um canal novo na ficha nasceria fora
da lista e sem captcha, em silêncio, para sempre.

Agora todo lead exige token, e a exceção precisa ser escrita com nome e
motivo. **A lista de isentos está vazia.**

**3 · `/contato` passou a renderizar o desafio.** Era o único formulário de
lead do site sem ele — e o que permitia a lista vazia do item 2. O botão
espera o token, como nos outros formulários, com uma linha explicando a espera
(o desafio é invisível e resolve em menos de um segundo na maioria das
visitas; botão desabilitado sem explicação numa página que só tem formulário
vira chamado de suporte).

---

## A.2 · O valor da conversão deixou de depender de sobra

`pushCamadaGlobal` agora zera `lead_type` junto com os campos de veículo, e os
dois cliques (`pushCliqueWhatsApp`, `pushCliqueTelefone`) declaram
`lead_type: "contato"` explicitamente.

O `lead_type` forçado vem **depois** do spread do contexto, e é de propósito:
antes do spread, um chamador poderia sobrescrever e o valor voltaria a
flutuar, que é exatamente o defeito. Um clique é intenção de contato, tenha
acontecido na ficha, no rodapé ou depois de uma proposta — e o clique
posterior a lead não é contado como conversão (a tag exclui `pos_lead`), então
forçar "contato" não subavalia nada.

Confirmado o diagnóstico do documento: o mesmo clique valia R$ 100 para quem
chegou direto e R$ 500 para quem passou pela avaliação na mesma sessão.

---

## B.1 · O click id sobrevive até o CRM

**1 · `gbraid` e `wbraid` entraram** na lista que `getUtmParameters` lê e
persiste — o tipo, o objeto inicial e a lista de chaves, os três lugares. São
os identificadores que o Google entrega **no lugar** do `gclid` em tráfego iOS
e em boa parte do inventário de PMax e YouTube.

**2 · Os dois fluxos de maior volume pararam de descartar o objeto.**
`PDPClientWrapper` e `LeadPopup` remontavam o `utm` campo a campo com quatro
chaves, jogando fora `gclid`, `gbraid`, `wbraid`, `utm_term` e `fbclid`. Agora
passam o objeto inteiro. No pop-up, o spread vem primeiro e os defaults
depois — preserva tudo sem perder a atribuição própria de quem chegou sem UTM
nenhum.

O terceiro item (publicar o `gclid` no `dataLayer`) ficou de fora, como o
documento sugere: é conveniência de GTM, não perda de dado.

---

## B.3 · O `_fbc` entrou no portão

A escrita do cookie passou para dentro do consentimento. O argumento anterior
— capturar não é enviar — tem lógica, mas a política publicada afirma que
*"enquanto você não aceitar, nenhuma ferramenta de análise ou publicidade é
carregada"* e declara `_fbc` como cookie de atribuição de anúncio. O texto que
o visitante leu vence a lógica.

Perde-se menos do que parece: a captura roda também no evento de mudança de
consentimento, então quem aceita ainda na página de entrada tem o `fbclid`
capturado direto da URL. Some só o caso de quem navega para outra página antes
de aceitar.

> **Fica um vizinho por decidir.** `getUtmParameters` persiste `gclid`,
> `fbclid` e as UTMs em `localStorage` independentemente do aceite. É
> atribuição própria, não ferramenta de terceiro — defensável, e por isso não
> mexi —, mas se o critério for a letra da política, esse também merece uma
> linha no texto. Decisão sua.

---

## A.1 · O que dava para consertar sem o DebugView

O documento pede a conferência ao vivo antes de mexer, e ela continua
necessária: **só o DebugView diz** se o `generate_lead` do formulário está
chegando uma ou duas vezes, e a resposta decide se `gtmAssumeEventos` deve ser
ligado.

Mas havia uma parte que não dependia disso. No clique de contato, o site
mandava `generate_lead` — **o mesmo nome do formulário efetivamente enviado**
— para um clique que só abre a conversa. A nota que morava ali descrevia o
defeito como resolvido pelo contêiner, enquanto o portão que faria isso valer
segue fechado: a correção estava escrita, não aplicada.

Agora manda `click_whatsapp` ou `click_to_call`, o nome do que de fato
aconteceu. Apagar o disparo dependeria de o contêiner estar publicado com as
tags 201/202 no ar; com o nome certo, o evento existe nos dois mundos e nenhum
deles infla a contagem de leads.

Um teste conta as ocorrências: `generate_lead` aparece **uma vez** em
`telemetry.ts`, e é a do formulário.

**Na sua mão:** abrir o DebugView do GA4, enviar um formulário e contar. Se
chegar um só, o A.1 morre. Se chegar dois, marcar `gtmAssumeEventos` no painel
— e **não** preencher `googleAdsId` no mesmo save, senão a duplicação volta
pelo lado do Ads.

---

## B.2 · Consent Mode v2 — por que não entrou nesta rodada

Não é discordância: o diagnóstico está certo, e a ressalva de grau do próprio
documento (invisível é só quem **nunca** aceita na sessão) também.

Ficou de fora porque é a única mudança da lista que altera o comportamento do
banner para **todo visitante**, e porque metade dela é do contêiner. Fazer só
a metade do site — carregar o GTM sempre, com `consent default denied` — sem a
tag de defaults publicada do outro lado deixaria uma janela em que o contêiner
carrega sem instrução de consentimento. Pior que o estado atual.

Quando for fazer, é uma rodada própria, com as duas metades no mesmo dia.

---

## O que eu não toquei

Os cinco itens do bloco C são do contêiner e estão registrados — ninguém aqui
vai desfazê-los. As recomendações do §6 (não migrar para tCPA, não tirar a
avaliação das principais, não remover o clique de WhatsApp, não automatizar
conversão offline, não mexer em quatro coisas na mesma semana) são de gestão
de campanha e continuam valendo.

## Testes

14 asserções novas em `tests/brechas-de-mensuracao.test.ts`, mais duas em
`tests/contrato-do-container.test.ts`. As que mais importam:

- **todo formulário que posta em `/api/leads` manda o token** — a régua nova só
  é segura enquanto isso for verdade; um formulário novo sem captcha faria o
  lead voltar 400 e sumir;
- **`generate_lead` aparece uma vez só** em `telemetry.ts`;
- **`lead_type` forçado depois do spread**, não antes;
- **a lista de isentos do captcha está vazia**.
