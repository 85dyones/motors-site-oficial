# Handoff — configuração do Turnstile pelo conector Chrome

**Para quem executa:** Claude com o conector do Chrome, no navegador do dono,
já logado na Cloudflare e na Vercel.
**O que este documento desbloqueia:** a "Leva 2" da auditoria do Turnstile —
validação de `hostname` e de `action` no servidor. Sem as respostas do
**Bloco A**, essa parte do código não pode ser escrita sem chutar.
**Auditoria que originou:** ver a seção "O que a auditoria achou", no fim.

Este documento é a tarefa inteira. Ele foi escrito para ser colado direto numa
sessão do Claude com o Chrome ligado.

---

## Regras invioláveis

1. **A chave secreta do Turnstile nunca aparece no chat.** Nem no resumo, nem
   "só os primeiros caracteres", nem numa captura de tela. Se um painel a
   exibir, não transcreva.
2. **Este roteiro foi desenhado para não precisar de nenhuma chave secreta
   real.** A secret de produção já está na Vercel e continua lá, intocada. Só o
   Bloco G, que é exceção e só roda se o Bloco A revelar um problema, encosta
   numa secret — e mesmo lá, por copiar-e-colar entre dois campos do navegador.
3. **Sitekeys podem ser reportadas.** Sitekey é público — vai no HTML do site.
   Secret não.
4. **Não crie, não apague e não rotacione nada** que este documento não mande
   explicitamente criar. Widget existente é produção viva.
5. **Em caso de divergência entre o que o painel mostra e o que este documento
   descreve, pare e reporte.** Não improvise. Toda condição de parada está no
   fim, em "Quando parar".

---

## Bloco 0 · O que já se sabe (não precisa descobrir)

Levantado no código, em 27/08. Serve para você reconhecer o que vê no painel,
não para você confiar cegamente — se o painel discordar, o painel ganha e você
reporta.

| Fato | Valor |
|---|---|
| Hospedagem | Vercel |
| Projeto na Vercel | `motors-site-oficial` (pacote: `motors-leads-antigravity`) |
| Domínio de produção | `motorsstore.com.br` |
| Também responde 200 | `www.motorsstore.com.br` |
| Alias da Vercel, ainda ativo e servindo tudo | `motors-site-oficial.vercel.app` |
| Variável da sitekey (pública, embutida no build) | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |
| Variável da secret (servidor) | `TURNSTILE_SECRET_KEY` |
| Variável nova, que este handoff cria | `TURNSTILE_HOSTNAMES` |
| Rotas protegidas | `POST /api/leads`, `POST /api/avaliacao` |

⚠️ **`NEXT_PUBLIC_*` é embutido em tempo de BUILD.** Mudar na Vercel só vale
para o próximo deploy — salvar e recarregar a página não basta. O mesmo alerta
já está em `src/lib/site.ts` por ter mordido antes.

---

## Bloco A · Inventário na Cloudflare (só leitura)

**Este bloco é o mais importante do documento.** Ele não muda nada; ele
responde as três perguntas que travam o código.

1. Abra `https://dash.cloudflare.com`.
2. Selecione a conta do dono.
3. No menu lateral, entre em **Turnstile**.
4. Liste **todos** os widgets que existirem — não só o que parece o certo.

Para cada widget, colete:

- **Nome**
- **Sitekey** (pode reportar)
- **Widget Mode** — `Managed`, `Non-Interactive` ou `Invisible`
- **Hostnames / domínios registrados** — a lista completa, item por item
- **Pre-Clearance** — ligado ou desligado, e em que nível

Depois, na Vercel, confira qual sitekey está de fato em uso:

5. Abra `https://vercel.com`, entre no projeto **motors-site-oficial**.
6. **Settings → Environment Variables**.
7. Localize `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e leia o valor **do ambiente
   Production**. Sitekey é público; pode reportar.
8. Confirme que `TURNSTILE_SECRET_KEY` **existe** em Production. **Não revele o
   valor** — a Vercel mostra secrets mascaradas por padrão, e é para continuar
   assim. O que se reporta é só: existe / não existe, e em quais ambientes.

### As três perguntas que precisam de resposta

**A.1 — Qual é o Widget Mode do widget de produção?**

É a pergunta decisiva. O componente `src/components/Turnstile.tsx` renderiza o
desafio dentro de uma `<div class="hidden">` — invisível para o visitante.

- Se o modo for **`Invisible`**: o código está coerente. Segue o jogo.
- Se o modo for **`Managed`** ou **`Non-Interactive`**: existe um **bug ativo em
  produção agora**. Quando a Cloudflare decide mostrar o desafio interativo, ele
  aparece dentro de uma div escondida — o visitante não tem como resolver, o
  token nunca chega, e o botão de enviar fica `disabled` para sempre. Lead
  perdido sem log, sem erro, sem ninguém saber.

Reporte o modo exatamente como o painel escreve. **Não mude o modo** — a
correção depende de uma decisão de produto (widget visível no formulário vs.
manter invisível) e do código correspondente. Só reporte.

**A.2 — `localhost` e/ou `127.0.0.1` estão na lista de domínios do widget de
produção?**

Se estiverem, existe um bypass real: qualquer pessoa sobe uma página local com
essa sitekey, colhe um token válido — a Cloudflare aceita, porque `localhost`
está registrado — e faz `POST` na produção. O servidor hoje só olha
`success: true` e aceita. O Bloco C fecha isso.

**A.3 — Existe mais de um widget?**

Se houver dois ou mais, diga qual sitekey bate com a variável da Vercel. Os
outros ficam de fora deste handoff — não mexa neles.

---

## Bloco B · A arquitetura que se quer chegar

Não execute nada aqui. É o alvo, para os blocos seguintes fazerem sentido.

| Ambiente | Sitekey / Secret | Domínios | `TURNSTILE_HOSTNAMES` |
|---|---|---|---|
| **Production** | o widget real que já existe | `motorsstore.com.br`, `www.motorsstore.com.br`, `motors-site-oficial.vercel.app` | os mesmos três, sem `localhost` |
| **Preview** (deploys de PR) | chaves de **teste** da Cloudflare | — | vazio |
| **Development** (máquina local) | chaves de **teste** da Cloudflare | — | vazio |

As chaves de teste da Cloudflare são constantes públicas e documentadas, e
podem circular à vontade:

```
Sitekey de teste (sempre passa):  1x00000000000000000000AA
Secret  de teste (sempre passa):  1x0000000000000000000000000000000AA
```

**Por que chave de teste em variável de ambiente é certo, se a auditoria acusou
chave de teste no código?** Porque o problema nunca foi a chave — foi o
*fallback silencioso*. `src/app/api/avaliacao/route.ts` cai na secret de teste
sozinho quando a variável falta, e aí produção aceita qualquer bot sem uma
linha de log. Escrita explicitamente na variável de Preview, a mesma chave é
uma escolha declarada, num ambiente onde ela é o comportamento desejado. Uma é
armadilha, a outra é configuração.

**Por que Preview usa chave de teste e não um widget de verdade:** deploy de
preview da Vercel ganha hostname aleatório a cada PR. Não há lista de domínios
que dê conta disso sem virar uma lista que aceita tudo.

---

## Bloco C · Fechar a lista de domínios do widget de produção

**Só execute se o Bloco A.2 achou `localhost` ou `127.0.0.1`** na lista. Se a
lista já estiver limpa, pule para o Bloco D e diga que pulou.

1. Cloudflare → **Turnstile** → o widget de produção → **Settings**.
2. Em **Hostname Management**, deixe a lista com **exatamente** estes três:

   ```
   motorsstore.com.br
   www.motorsstore.com.br
   motors-site-oficial.vercel.app
   ```

3. **Remova** `localhost`, `127.0.0.1` e qualquer outro host que não esteja na
   lista acima. Antes de remover um host que este documento não previu,
   **pare e pergunte** — pode ser um domínio legítimo que o código não revelou.
4. Salve.
5. **Não** mexa em Widget Mode nem em Pre-Clearance neste bloco.

**Efeito colateral que é esperado e aceitável:** com `localhost` fora, o
`npm run dev` na máquina do dono para de gerar token contra o widget de
produção. É por isso que o Bloco E configura o ambiente Development com as
chaves de teste — faça os dois, ou o dev local quebra.

---

## Bloco D · Verificar se a lista pegou

1. Continue no widget de produção e recarregue a página do painel.
2. Confirme que a lista mostra os três hostnames e nenhum a mais.
3. Anote a lista final como o painel a exibe, para a ficha de retorno.

---

## Bloco E · Variáveis de ambiente na Vercel

Projeto **motors-site-oficial** → **Settings → Environment Variables**.

Atenção ao seletor de ambiente de cada variável (Production / Preview /
Development). É o ponto onde mais se erra.

### E.1 — `TURNSTILE_HOSTNAMES` (nova, só Production)

- **Name:** `TURNSTILE_HOSTNAMES`
- **Value:** `motorsstore.com.br,www.motorsstore.com.br,motors-site-oficial.vercel.app`
- **Environments:** ✅ Production · ❌ Preview · ❌ Development
- Sem espaços em volta das vírgulas. Sem `https://`. Sem barra no fim.
- **Não** inclua `localhost` nem `127.0.0.1` aqui. É exatamente o que esta
  variável existe para impedir.

Vírgulas separando hosts, e Preview/Development vazios de propósito: o código
que vai consumir isso trata "vazio" como "não validar hostname", e exige a
variável preenchida quando `VERCEL_ENV=production`. Produção sem a variável
falha fechado — visível no mesmo dia — em vez de aceitar em silêncio.

### E.2 — Chaves de teste em Preview e Development

Quatro entradas, ou duas variáveis com dois ambientes marcados cada:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` | Preview, Development |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` | Preview, Development |

⚠️ **Não toque nas entradas de Production dessas duas variáveis.** Se a Vercel
avisar que já existe uma variável com esse nome, a saída é **editar os
ambientes** da entrada existente ou criar uma entrada separada só para
Preview/Development — nunca sobrescrever o valor de Production. Se a interface
não deixar separar por ambiente sem sobrescrever, **pare e reporte**.

### E.3 — Conferir o que já existia

Sem revelar valores de secret, confirme e reporte:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` existe em **Production**? Valor (é público)?
- `TURNSTILE_SECRET_KEY` existe em **Production**? (só existe/não existe)
- A sitekey de Production bate com a sitekey do widget do Bloco A?

**Se a sitekey da Vercel não bater com nenhum widget da Cloudflare**, pare.
Isso significa que o site está apontando para um widget que ninguém sabe onde
está, e o Bloco G passa a valer.

---

## Bloco F · Redeploy

Só necessário se o Bloco E mexeu em `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Se só
`TURNSTILE_HOSTNAMES` e `TURNSTILE_SECRET_KEY` mudaram, elas são lidas em
tempo de execução e o próximo deploy natural já pega — mas o redeploy também
não faz mal.

1. Vercel → projeto → **Deployments**.
2. No deploy de produção mais recente: menu **⋯** → **Redeploy**.
3. **Desmarque "Use existing Build Cache"** — variável `NEXT_PUBLIC_*` só entra
   em build novo de verdade.
4. Espere terminar e confirme que o status ficou **Ready**.

### Verificação em produção, no navegador

5. Abra `https://motorsstore.com.br/contato`.
6. Confirme que o formulário de contato carrega e que o botão de envio deixa de
   ficar `disabled` depois de alguns segundos (é o token do Turnstile
   chegando). **Não envie o formulário** — isso cria lead de verdade no CRM e
   dispara conversão no Ads.
7. Se o botão **continuar travado**, isso confirma o problema do A.1. Reporte
   com o print do console do navegador (F12 → Console), filtrando por
   `[Turnstile]`. As mensagens do componente têm esse prefixo.

---

## Bloco G · Exceção — só se o Bloco A revelou que falta widget

Não execute a menos que E.3 tenha falhado, ou que não exista widget de produção
nenhum. Este é o único bloco que encosta numa secret real.

1. Cloudflare → **Turnstile** → **Add widget**.
2. **Widget name:** `motorsstore-producao`
3. **Hostnames:** os três do Bloco C. Nada de `localhost`.
4. **Widget Mode:** `Managed`.
5. **Pre-Clearance:** desligado.
6. Criar.
7. A sitekey nova → Vercel, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, **Production**.
8. A secret nova → Vercel, `TURNSTILE_SECRET_KEY`, **Production**, por
   **copiar do painel da Cloudflare e colar direto no campo da Vercel**. Sem
   passar por chat, sem arquivo intermediário, sem transcrever.
9. Redeploy pelo Bloco F.
10. Na ficha de retorno, informe **só a sitekey**. A secret não é reportada —
    "gravada em Production" é toda a informação necessária.

---

## Ficha de retorno

Devolva preenchido, neste formato:

```
BLOCO A — INVENTÁRIO
Widgets encontrados: ___
Widget de produção — nome: ___
Widget de produção — sitekey: ___
A.1 Widget Mode: ___            (Managed | Non-Interactive | Invisible)
A.2 localhost/127.0.0.1 na lista? ___   (sim | não)
Lista de domínios ANTES: ___
Pre-Clearance: ___
A.3 Outros widgets (nome + sitekey): ___

BLOCO C/D — DOMÍNIOS
Executado? ___                  (sim | pulado, lista já estava limpa)
Lista de domínios DEPOIS: ___

BLOCO E — VARIÁVEIS
TURNSTILE_HOSTNAMES criada em Production? ___
Valor gravado: ___
Chaves de teste em Preview? ___
Chaves de teste em Development? ___
NEXT_PUBLIC_TURNSTILE_SITE_KEY existia em Production? ___  Valor: ___
TURNSTILE_SECRET_KEY existe em Production? ___  (só sim/não)
Sitekey da Vercel bate com o widget da Cloudflare? ___

BLOCO F — DEPLOY
Redeploy feito? ___   Status: ___
/contato carrega e o botão destrava? ___
Erros no console com prefixo [Turnstile]: ___

BLOCO G — só se aplicável
Widget novo criado? ___   Sitekey nova: ___
(secret NÃO vai aqui)

O QUE DEU ERRADO / DIVERGIU DO DOCUMENTO
___
```

---

## O que **não** é tarefa do conector Chrome

Para não perder tempo procurando no painel — estas coisas não existem lá:

- **Os nomes de `action` por formulário.** `action` é um atributo que o widget
  manda do navegador (`data-action`), definido no código, não no painel da
  Cloudflare. O mapa abaixo é o que vai ser implementado; está aqui só para o
  registro ficar num lugar só:

  | Superfície | Arquivo | Rota | `action` |
  |---|---|---|---|
  | Formulário de contato | `ContatoClientWrapper.tsx` | `/api/leads` | `contato` |
  | Ficha do veículo | `PDPClientWrapper.tsx` | `/api/leads` | `pdp` |
  | CarMatch | `CarMatch.tsx` | `/api/leads` | `carmatch` |
  | Popup de saída | `LeadPopup.tsx` | `/api/leads` | `popup` |
  | Auto-avaliação (form) | `AutoAvaliacao.tsx` | `/api/avaliacao` | `avaliacao` |
  | Auto-avaliação (modal) | `AutoAvaliacao.tsx` | `/api/leads` | `avaliacao_whatsapp` |

- **A secret de teste que está em `src/app/api/avaliacao/route.ts`.** É código,
  sai por commit.
- **O reset do widget depois de envio falho.** É código.
- **O rate limit de 5/h por IP.** Já existe, em `src/proxy.ts`, via Upstash.

---

## Quando parar

Pare, não improvise, e reporte:

- Um widget que este documento não previu, com domínios que não se explicam.
- A sitekey da Vercel não bate com nenhum widget da Cloudflare.
- A Vercel não deixa separar a variável por ambiente sem sobrescrever
  Production.
- Qualquer painel pedindo confirmação de algo destrutivo — apagar widget,
  rotacionar secret, remover domínio que não está na lista do Bloco C.
- O widget de produção está em modo `Managed`/`Non-Interactive` **e** alguém
  sugere mudar para `Invisible` para "resolver" o botão travado. Não é a
  correção certa; é o código que precisa mudar junto, e a decisão é do dono.
- Login expirado, 2FA, ou qualquer coisa que peça credencial.

---

## O que a auditoria achou (contexto)

Levantado em 27/08 sobre a integração atual. O handoff acima destrava os itens
marcados 🔒.

**Crítico**
- `src/app/api/avaliacao/route.ts:13` ainda cai na secret de teste "always
  passes" quando `TURNSTILE_SECRET_KEY` falta. É o mesmo alçapão que
  `/api/leads` fechou em 27/08 e que o teste de regressão não cobriu, porque
  ele só lê o arquivo de `leads`.

**Alto**
- 🔒 Nenhuma das duas rotas valida `hostname`. Com `localhost` no widget, vira
  bypass real.
- Token gasto não é resetado depois de envio falho. Token do Turnstile é de uso
  único: o segundo clique manda o mesmo token, a Cloudflare responde
  `timeout-or-duplicate`, e o visitante fica preso até recarregar a página.

**Médio**
- 🔒 `action` nunca é enviada nem validada.
- Sem timeout no `fetch` do siteverify.
- Sem validação de tipo e tamanho do token vindo do corpo do POST.
- 🔒 Widget renderizado dentro de `div.hidden` — ver A.1.
- Corrida na segunda instância do widget: quando dois formulários montam juntos,
  o segundo pode nunca renderizar, em silêncio.

**Baixo**
- Sem `remoteip` no siteverify.
- Sem checagem de `response.ok`.
- Listener de `load` não removido no cleanup.
- Teste de regressão da chave de teste cobre só `/api/leads`.

**O que já estava certo:** fail-closed com log em `/api/leads`; a régua de
captcha invertida para lista de isenções, fechando o bypass via `body.canal`;
rate limit de 5/h por IP nos dois endpoints; callbacks estabilizados em refs,
com teste dedicado.
