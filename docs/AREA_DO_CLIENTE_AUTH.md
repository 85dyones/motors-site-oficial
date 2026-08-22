# Entrada da Garagem Motors — configuração do Supabase Auth

Decisão D3, 2026-08-13: o cliente entra por **link mágico enviado por e-mail**
(emenda E5 em `EMENDA_01_MANUAL_CICLO.md`). Este documento é o que precisa ser
feito no painel do Supabase — a parte que não vive no repositório.

O projeto é `zwbqmzgnagfeqinqkolp`. Os passos abaixo foram escritos contra o
painel do Supabase; se um rótulo de menu não bater exatamente, o conceito é o
mesmo. **Nada aqui foi aplicado por mim — não tenho acesso ao painel.**

---

## 1. O template do e-mail

Arquivo pronto: [`supabase/templates/magic-link.html`](../supabase/templates/magic-link.html)

**Não existe "importar".** O painel do Supabase não tem upload de arquivo para
template de e-mail: o campo *Message body* é uma caixa de texto e o fluxo é
selecionar tudo no arquivo e colar. O arquivo é HTML puro, sem comentário
nenhum, exatamente para isso — o que estiver nele é o que o cliente recebe.

**Onde colar:** Authentication → Emails → template **Magic Link** → campo
*Message body*.

> Existe um segundo caminho, por `supabase/config.toml` com
> `[auth.email.template.magic_link] content_path = "./templates/magic-link.html"`
> e `supabase config push`. **Ele não funciona neste projeto**: exige
> `supabase link`, e o link falha em `api.supabase.com` — é o mesmo bloqueio
> documentado no runbook de `supabase/README.md`. Enquanto o projeto não for
> linkado, colar no painel é o caminho.

**Por que o HTML é feito de tabela, com estilo inline e sem fonte externa:**
cliente de e-mail não é browser. O Gmail remove `<style>` em parte dos
contextos, o Outlook renderiza com o motor do Word, e nenhum dos dois carrega
webfont. A Archivo do site entra só como primeira opção da pilha — quem tiver,
vê; quem não tiver, cai em Helvetica e o layout não muda.

**O link do template aponta para `/api/auth/confirm`, com `{{ .TokenHash }}`**
— duas vezes: no botão e no endereço em texto, para quem usa cliente que
bloqueia botão. Formato:

```
https://motorsstore.com.br/api/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

> **Por que não `{{ .ConfirmationURL }}`** (que era o formato até 2026-08-15):
> aquele link depende do fluxo que PEDIU o acesso. Fora do PKCE, o token volta
> no **fragmento** da URL (`#access_token`) — que o servidor nunca recebe — e
> o cliente quicava de volta para a entrada; foi o primeiro sintoma real do
> link mágico. E mesmo no PKCE, o clique precisa acontecer no MESMO navegador
> que pediu o link, o que e-mail não garante (pede no notebook, abre no
> celular). `token_hash` é verificado no servidor por `/api/auth/confirm`,
> funciona em qualquer navegador e continua de uso único. O destino pós-login
> é decidido pelo papel: cliente → `/garagem`, staff → `/admin`.
>
> ⚠️ **Se o template do painel ainda estiver com `{{ .ConfirmationURL }}`,
> recole-o** — o arquivo deste repositório é a fonte.

**Assunto sugerido:**

```
Sua entrada no diário de bordo do seu carro
```

Evite "Login", "Verificação" e "Confirme sua conta": e-mail de acesso com
vocabulário de sistema é o que mais cai em spam e o que menos se parece com a
Motors. O assunto acima diz o que é, na língua do cliente.

O template usa `{{ .TokenHash }}` apontando para `/api/auth/confirm` — ver o
bloco acima. **Não** use `{{ .ConfirmationURL }}`: ele quebra o login fora do
PKCE e exige que o clique aconteça no mesmo navegador que pediu o link.

> Até 2026-08-18 este parágrafo dizia o contrário — mandava usar
> `{{ .ConfirmationURL }}`, trinta linhas depois de explicar por que aquilo
> não funciona. Quem seguisse o guia até o fim desfazia a correção (D1).

### 1-b. Qual template serve qual público (2026-08-21)

O painel do Supabase tem seis caixas de e-mail, e o erro fácil é achar que
elas são intercambiáveis. Não são: **cada uma dispara com uma chamada de API
diferente**, e colar o texto certo na caixa errada não faz o e-mail sair.

| Template no painel | Só dispara com | Público | Arquivo aqui |
|---|---|---|---|
| **Magic link or OTP** | `auth.signInWithOtp()` | Cliente, na Garagem | [`magic-link.html`](../supabase/templates/magic-link.html) |
| **Invite user** | `admin.inviteUserByEmail()` | Equipe, investidor — todo acesso ao painel | [`invite-user.html`](../supabase/templates/invite-user.html) |
| **Confirm sign up** | `auth.signUp()` | Ninguém, hoje — rede de segurança (§1-e) | [`confirm-signup.html`](../supabase/templates/confirm-signup.html) |
| **Reset password** | `auth.resetPasswordForEmail()` | Equipe que esqueceu a senha | [`reset-password.html`](../supabase/templates/reset-password.html) |
| **Change email address** | `auth.updateUser({email})` | — | ainda não existe |
| **Reauthentication** | `auth.reauthenticate()` | — | ainda não existe |

As duas últimas linhas só ganham template quando existir tela de perfil: hoje
seriam e-mails apontando para páginas que ninguém pode abrir. As quatro
primeiras estão prontas — e as três de senha (convite, troca e confirmação)
terminam na mesma tela, `/definir-senha`.

### 1-c. O convite — como o acesso ao painel nasce (2026-08-21)

Arquivo pronto: [`supabase/templates/invite-user.html`](../supabase/templates/invite-user.html)

**Onde colar:** Authentication → Emails → template **Invite user** → campo
*Message body*. Mesmo fluxo do §1: selecionar tudo e colar.

**Assunto sugerido:**

```
Seu acesso ao painel da Motors
```

**O que mudou no código junto com este template.** Até 2026-08-21 a tela A17
pedia uma *"Senha Provisória"* ao admin e criava a conta com ela
(`createUser` + `email_confirm: true`). O efeito colateral não era pequeno:

- **nenhum e-mail saía** — `email_confirm: true` mata o envio;
- a senha do funcionário **viajava por WhatsApp** ou era dita em voz alta;
- não havia troca obrigatória na primeira entrada;
- quem cuidava do painel **conhecia a senha de todo mundo**.

Agora `/api/users` chama `inviteUserByEmail`: a conta nasce **sem senha**, o
convite sai por e-mail e a senha é escolhida em `/definir-senha`, no navegador
de quem vai usá-la. **Nenhuma rota do projeto recebe senha em corpo de
requisição** — e o campo de senha sumiu da tela A17.

**O link é `token_hash`, como o do link mágico** — e aqui o motivo é ainda
mais forte. A doc do próprio SDK avisa que o convite **não suporta PKCE**,
"porque o navegador que inicia o convite costuma ser diferente do que o
aceita". É exatamente o quicar de 2026-08-15 (§1), só que garantido: quem
convida é o admin, na máquina da loja; quem aceita é o convidado, na dele.

```
https://motorsstore.com.br/api/auth/confirm?token_hash={{ .TokenHash }}&type=invite
```

> **O papel entra em DOIS passos, e isso não é redundância.**
> `inviteUserByEmail` só grava `user_metadata`, e `handle_new_user`
> (migração `20260813120000`) lê o papel de `app_metadata` — que ainda está
> vazio quando o trigger roda. Por isso a rota, logo depois de convidar,
> grava `app_metadata` **e** corrige `profiles`. Sem o segundo passo, **todo
> convidado nasceria `cliente`** e não entraria em lugar nenhum. Se esse
> segundo passo falhar, a rota devolve o erro dizendo isso — o convite já
> saiu e o perfil aparece na lista para ser corrigido ali mesmo.

**Validade:** o convite não promete prazo no texto, de propósito. O §4 fixa
uma hora para o link mágico porque aquele número está no painel; o do convite
é outra configuração, e prometer o número errado gera chamado. O texto diz o
que é sempre verdade: vale uma vez só.

> **O limite deste desenho, dito em voz alta:** `/definir-senha` troca a senha
> de quem já está com a sessão aberta, sem pedir a senha antiga. Quem senta
> numa máquina com o painel logado consegue trocá-la — mas essa pessoa já
> teria o painel inteiro de qualquer forma. Fechar isso é ligar *secure
> password change* no painel do Supabase, que passa a exigir reautenticação
> (e aí o template **Reauthentication** deixa de ser decorativo).

### 1-c-bis. Investidor (2026-08-22)

**Investidor passou a existir** — e NÃO como quinto perfil de painel. `PERFIS`
continua sendo `admin | marketing | comercial | financeiro`; investidor entrou
em `PAPEIS_SEM_PAINEL`, ao lado de `cliente` (`src/lib/permissoes.ts`).

> **Por que não virou perfil de painel.** `ehStaff`/`is_staff` é a régua única
> de "é gente da loja", e quem passa por ela recebe o payload completo de
> `/api/settings` — token de API, saldos bancários e o `preco_compra` de todo o
> estoque —, além da escrita de estoque e dos leads. Um quinto perfil teria
> dado tudo isso a quem só precisa ver a própria posição. A migração
> `20260822120000` prova o contrário contra o banco, na autoconferência: o
> investidor nasce fora do `is_staff` e fora do `has_finance_access`.

**O convite é este mesmo** (§1-c): a A17 agora oferece o papel no seletor, em
"Área própria (sem painel)". Antes disso não havia como convidá-lo, e o
resultado real foi um investidor cadastrado como **comercial** — a lista ainda
por cima o exibia assim, porque `normalizarPerfil` devolve "comercial" para
qualquer papel que não reconhece.

**Onde ele cai:** `/investidor`, como o cliente cai em `/garagem`. As três
portas de auth (`/definir-senha`, `/api/auth/confirm` e o proxy) decidem pelo
papel, nesta ordem: staff → `/admin`, investidor → `/investidor`, resto →
`/garagem`.

**O que ele enxerga:** os carros em que entrou na compra, o aporte total, o
total retirado e o saldo investido. Nada de custo da loja ou margem. O recorte
é da RLS (`investidor_id = auth.uid()`) nas tabelas `investidor_veiculos` e
`investidor_movimentos`, e a view `investidor_posicao` é `security_invoker`
para que a soma respeite a mesma régua — sem isso, um investidor leria a
posição de todos.

**Ele não lança nada.** Aportes, retiradas e participações entram por
Financeiro → Investidores (`/admin/financeiro/investidores`), sob
`has_finance_access`. As tabelas não têm policy de escrita para o investidor, e
ausência de policy é negação.

### 1-d. Esqueci minha senha (2026-08-21)

Arquivo pronto: [`supabase/templates/reset-password.html`](../supabase/templates/reset-password.html)

**Onde colar:** Authentication → Emails → template **Reset password** → campo
*Message body*.

**Assunto sugerido:**

```
Sua senha nova na Motors
```

Antes disto, quem esquecia a senha **dependia de um admin** — e o admin, até o
convite entrar (§1-c), digitava a senha por ele. O fluxo agora fecha sozinho:

1. `/login` traz **"Esqueci minha senha"** → `/recuperar-senha`;
2. a tela pede o e-mail e chama `resetPasswordForEmail`;
3. o link chega por `token_hash` com `type=recovery`;
4. `/api/auth/confirm` verifica e manda para **`/definir-senha`** — a mesma
   tela do convite.

> **A resposta da tela é NEUTRA**, pelo mesmo motivo do §2-a: e-mail cadastrado
> e desconhecido terminam na mesma mensagem ("se estiver cadastrado, o link
> saiu"). Sem isso o formulário vira um **verificador de quem trabalha na
> Motors** — é o problema da entrada da Garagem, com outro público. O retorno
> do Supabase nem chega a ser lido: ler o erro seria o primeiro passo para
> diferenciar.

**O texto diz que a senha atual continua valendo até a troca.** Parece detalhe
e não é: sem essa frase, quem clica por engano acha que ficou trancado para
fora e liga para a loja.

**Validade:** aqui o template promete **1 hora**, igual ao link mágico, porque
os dois saem da mesma configuração (*Email OTP expiration*). Se ela mudar no
painel, **os dois textos mudam juntos** — um teste trava a frase idêntica nos
dois arquivos para que ninguém atualize um e esqueça o outro.

**Cliente não usa este caminho.** A Garagem não tem senha; se um cliente pedir
troca, ele define uma senha que não abre porta nenhuma no painel (o middleware
barra papel `cliente`) e volta para a Garagem. As duas telas apontam o cliente
para o lugar certo, mas nada quebra se ele passar por aqui.

### 1-e. Confirmação de cadastro — a rede de segurança (2026-08-21)

Arquivo pronto: [`supabase/templates/confirm-signup.html`](../supabase/templates/confirm-signup.html)

**Onde colar:** Authentication → Emails → template **Confirm signup** → campo
*Message body*.

**Assunto sugerido:**

```
Sua conta na Motors foi criada
```

Este e-mail **não deve disparar hoje**: `signUp` é o cadastro espontâneo, que
o §2-a manda desabilitar, e nenhum caminho do projeto o usa desde que o
fallback saiu de `/api/users` (§1-c). Ele existe colado no painel para o dia
em que alguém religar o cadastro público ou criar um usuário pelo painel com
envio de confirmação — nesse dia, sai o e-mail da Motors e não o do Supabase,
em inglês e com `{{ .ConfirmationURL }}`, que quebra fora do PKCE.

A voz do texto é neutra de propósito: a mesma caixa atende equipe e cliente, e
quem decide o destino é `/api/auth/confirm`, pelo papel.

## 2. As três travas que importam

### a) Ninguém cria conta sozinho

O acesso é para cliente que **comprou** — a conta nasce no fechamento da venda
(tela A19), não no formulário de entrada. Duas camadas garantem isso:

1. **No painel:** Authentication → Providers → Email → deixe o cadastro público
   desabilitado (a chave costuma aparecer como *Allow new users to sign up* /
   *Enable signups*). Com ela ligada, qualquer e-mail digitado na tela de
   entrada viraria usuário.
2. **No código**, quando a tela `/garagem` for construída: a chamada
   `signInWithOtp` precisa levar `shouldCreateUser: false`. Sem isso, o cliente
   do Supabase cria o usuário na hora, mesmo com o cadastro público fechado no
   nível de API.

A consequência desejada é: e-mail desconhecido → nenhum link enviado. A tela
deve responder a mesma mensagem neutra para e-mail conhecido e desconhecido
("se este e-mail estiver no seu cadastro, o link chegou"), senão o formulário
vira um verificador de quem é cliente da loja.

> **Desabilitar o cadastro público não impede convidar.** O toggle fecha o
> endpoint de `signUp` para quem usa a chave anônima; `inviteUserByEmail` e
> `createUser` passam pela chave de serviço e continuam funcionando. É por
> isso que a trava pode ficar ligada o tempo todo: os dois jeitos legítimos de
> uma conta nascer aqui — o convite (§1-c) e o fechamento da venda — não
> dependem dela.

### b) Só o destino certo aceita o link

Authentication → URL Configuration:

- **Site URL:** `https://motorsstore.com.br` quando o domínio estiver no ar; até
  lá, `https://motors-site-oficial.vercel.app`
- **Redirect URLs:** acrescente **os dois**, para a virada de domínio não
  derrubar o login de quem já tem link na caixa de entrada:
  - `https://motorsstore.com.br/api/auth/callback`
  - `https://motors-site-oficial.vercel.app/api/auth/callback`
  - `http://localhost:3000/api/auth/callback` (desenvolvimento)

A rota de callback já existe e já valida o destino: desde 2026-08-13 ela só
redireciona para caminho interno (`src/app/api/auth/callback/route.ts`). A lista
do painel é a segunda camada — sem ela, o Supabase recusa o retorno.

Quando o domínio próprio entrar no ar, esta lista é um dos lugares que precisa
ser atualizado.

### c) O papel nasce `cliente`

Já está resolvido no banco pela migração
`20260813120000_role_cliente_e_is_staff.sql`, aplicada em produção em
2026-08-13: todo usuário novo nasce com `role = 'cliente'`, e papel de equipe só
entra por `app_metadata`, que apenas a chave de serviço grava. **Nada a fazer no
painel** — está registrado aqui porque é a trava que impede o cliente de virar
equipe, e alguém vai querer conferir.

---

## 3. SMTP — a pegadinha de produção

O servidor de e-mail embutido do Supabase é para desenvolvimento: ele tem
limite baixo de mensagens por hora e o remetente não é o domínio da loja.
Com ele, numa manhã de movimento, parte dos clientes simplesmente não recebe o
link — e o erro não aparece para eles, some no log.

Antes de abrir a Garagem Motors para clientes de verdade: Project Settings → Auth →
**SMTP Settings**, apontando para um provedor próprio, com remetente no domínio
**`motorsstore.com.br`** — o mesmo do site, desde a decisão de 2026-08-14.
Configure SPF e DKIM no domínio novo antes do primeiro envio real: e-mail de
acesso que cai em spam é login que não acontece.

Vale conferir também o limite de e-mails em Authentication → Rate Limits, que é
separado do SMTP.

### Decisão de 2026-08-15: Resend para envio, Hostinger para as caixas

Duas funções diferentes, dois provedores, e é bom que sejam separados: o que
**recebe** `motors@motorsstore.com.br` (Hostinger) não precisa ser o que
**envia** o link mágico (Resend). Os registros de DNS de cada um estão em
[`VIRADA_DE_DOMINIO.md`](VIRADA_DE_DOMINIO.md) — inclusive a regra de SPF
único, que é onde este tipo de configuração costuma quebrar.

**Caminho curto: use a integração Resend ↔ Supabase.** O Resend tem um
assistente (Settings → Integrations → Supabase) que verifica o domínio, cria a
API key e **grava o SMTP no Supabase sozinho**. Ele foi o caminho usado em
2026-08-15, e é preferível ao preenchimento manual por dois motivos: não há
como errar host, porta ou o usuário `resend`, e o campo de remetente vem com o
domínio **travado no que foi verificado** — o que elimina o erro descrito no
aviso abaixo.

> O assistente configura o SMTP e **nada mais**. Template, cadastro público e
> Redirect URLs continuam sendo trabalho manual no painel do Supabase — ver
> §1, §2 e o checklist.

Se preferir preencher à mão (Project Settings → Auth → SMTP Settings), com o
domínio já verificado no Resend:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Porta | `465` (SSL) ou `587` (STARTTLS) |
| Usuário | `resend` — é literal, não é o seu e-mail |
| Senha | a **API key** do Resend (`re_…`), criada em API Keys |
| Sender email | um endereço do domínio verificado (ex.: `garagem@motorsstore.com.br`) |
| Sender name | `Motors Store` |

> ⚠️ O *Sender email* **precisa estar no domínio que você verificou no
> Resend**. Se você verificou um subdomínio (`send.motorsstore.com.br`), o
> remetente tem de ser `@send.motorsstore.com.br` — usar o apex ali faz o
> envio ser recusado, e o sintoma é "link mágico não chega" sem erro na tela.

Depois de salvar, mande um link mágico para um endereço seu e confira **três
coisas**: que chegou, que **não** caiu em spam, e que o link abre em
`/api/auth/callback` no domínio novo. O painel do Resend mostra cada envio com
o status — é lá que se vê bounce e rejeição, não no Supabase.

---

## 3-b. A foto da etiqueta (fase 2, 2026-08-15)

A prova do carimbo passou a morar no projeto, em vez de num link de WhatsApp:
bucket **privado** `diario-de-bordo`, migração
`20260815210000_storage_do_diario_de_bordo.sql`.

- **Caminho:** `{veiculo_vendido_id}/{atual|anterior|nota}-{carimbo}-{sorteio}.{ext}`.
  O primeiro segmento não é organização — é o que a RLS de `storage.objects`
  lê para decidir de quem é a pasta. **Mudar o formato sem mudar a policy abre
  ou tranca o acesso de todo mundo.**
- **Upload direto do navegador**, com a sessão do cliente. Não passa pela rota
  porque função serverless da Vercel recusa corpo acima de ~4,5 MB — e foto de
  celular passa disso. Antes de subir, a imagem é reduzida a 1600px no lado
  maior (`src/lib/ciclo/foto.ts`), respeitando a orientação do EXIF.
- **Leitura por URL assinada de 5 minutos**, via `GET /api/ciclo/foto?caminho=…`,
  que assina com a sessão de quem pede — a RLS é a autoridade, não um `if`.
  Sem direito, responde **404** (e não 403) de propósito: distinguir "não é
  seu" de "não existe" contaria a um estranho que aquele veículo tem foto.
- **Duas origens convivem na mesma coluna:** valor que começa com `http` é URL
  externa colada à mão pela equipe (o jeito antigo, que continua valendo);
  qualquer outra coisa é caminho no bucket. Quem resolve as duas é
  `urlDaFoto()` — use sempre, nunca o valor cru num `href`.
- **Cliente não apaga nem sobrescreve** foto, pela mesma razão de
  `manutencoes`: prova enviada não se reescreve. Foto ilegível se resolve com
  registro novo, e o anterior fica no rastro com o motivo da recusa.

## 3-c. Meus dados e consentimento (fase 2, 2026-08-15)

O §6.3-D dá ao cliente uma chave por categoria. **Duas existem hoje** —
WhatsApp e e-mail — e as outras não viram botão de propósito:

| Categoria do §6.3-D | Está na tela? | Por quê |
|---|---|---|
| Comunicação por WhatsApp / e-mail | ✅ chave | tem efeito imediato no motor |
| Histórico de manutenção | informação | sempre ativo; sustenta a procedência |
| Registro de KM entre revisões | ❌ | controla um lembrete mensal que o motor ainda não tem |
| Localização / telemetria de condução | ❌ | v1.1 manda esconder sem provedor — "chave que não liga nada é ruído" |

**A escrita é por função, não por policy.** `atualizar_consentimento_canais`
(`security definer`, migração `20260815230000`) grava UMA coluna da linha de
quem chamou. Uma policy de UPDATE para o cliente abriria `cpf_cnpj` e
`auth_user_id` junto, porque o grant de `clientes` é para todas as colunas e
para o papel `authenticated` — o mesmo da equipe. Restringir por coluna
tiraria a edição da equipe no mesmo gesto.

**Desligar tudo é válido e não penaliza:** o motor suprime com
`sem_canal_consentido` e nenhum cálculo de conformidade, índice ou
elegibilidade lê o campo (regra 2). Provado ponta a ponta em 2026-08-15: o
cliente desligou os canais na Garagem e os três gatilhos passaram a sair
suprimidos com esse motivo.

**A escolha fica datada** dentro do próprio jsonb (`atualizado_em`,
`atualizado_por`) — prova de consentimento sem tabela nova. Chave extra não
atrapalha o motor, que lê só `whatsapp` e `email`.

### A exportação (§6.3-D e §6.3-E)

`/garagem/meus-dados` é uma página **feita para imprimir**, não um gerador de
PDF: o navegador já imprime em PDF em toda plataforma, e uma biblioteca custaria
dependência e um segundo layout para manter em sincronia. Um teste barra a
entrada de `pdfkit`, `puppeteer`, `jspdf` e afins.

O documento é inteiro e legível fora de contexto — com data de emissão, porque
o §6.3-E quer que o cliente possa **mostrar a quem for comprar o carro dele**.
Traz o cadastro, os veículos, o diário de bordo com a situação de cada
lançamento e a série de KM. E diz o que a loja **não** tem: "não guarda
traçado de localização nem dado de telemetria" — a prova de que nada está
escondido.

> Na Garagem o documento aparece **mascarado** (`123.***.***-09`); inteiro só
> na exportação, que é o titular pedindo os próprios dados.

## 4. Validade do link

O padrão do Supabase para link mágico é **1 hora**, e é o que o template diz ao
cliente. Se esse prazo for alterado no painel, **o texto do template precisa
mudar junto** — prometer uma hora e expirar em dez minutos gera chamado.

O link é de uso único. Pedir um novo invalida o anterior.

A validade é **uma configuração só** (Email OTP expiration) para os e-mails do
Auth — link mágico, troca de senha e confirmação de conta envelhecem juntos. Se
o prazo mudar, são **três** templates para atualizar: `magic-link.html`,
`reset-password.html` e `confirm-signup.html`. O convite (`invite-user.html`)
não promete número nenhum, então não entra na conta. E link de confirmação vencido não é beco: a página de
entrada da Garagem manda um link mágico novo, e o `verifyOtp` dele também
confirma o e-mail.

---

## 5. Checklist

- [ ] Template do **Magic Link** colado, com o assunto sugerido (§1)
- [ ] Template do **Invite user** colado, com o assunto sugerido (§1-c)
- [ ] Template do **Reset password** colado, com o assunto sugerido (§1-d)
- [ ] Template do **Confirm signup** colado, com o assunto sugerido (§1-e)
- [ ] Cadastro público de novos usuários desabilitado
- [ ] Site URL e Redirect URLs preenchidas (produção e localhost)
- [ ] SMTP próprio configurado, com remetente no domínio da loja
- [ ] E-mail de teste recebido, link abrindo em `/api/auth/callback`
- [ ] Validade do link conferida contra o texto do template
- [ ] **Troca de senha testada**: pedir em `/recuperar-senha`, receber, abrir e
      salvar a senha nova — e conferir que a mensagem da tela é a mesma para um
      e-mail que não existe
- [ ] **Convite testado ponta a ponta**: convidar um endereço seu na A17,
      receber, abrir em OUTRO navegador, definir senha e cair no painel com o
      perfil certo — o perfil errado aqui é o sinal de que o segundo passo do
      papel falhou (§1-c)

Nenhum item espera código: a tela `/garagem` está entregue desde 2026-08-15
e a lista inteira é trabalho de painel. Até 2026-08-21 este fecho dizia que a
tela "ainda não existe" — era o resto de quando o documento nasceu, antes da
fase 1 da Garagem.
