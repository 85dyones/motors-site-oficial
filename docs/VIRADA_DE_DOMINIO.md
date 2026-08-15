# Virada de domínio — para `motorsstore.com.br`

Decisão do dono em 2026-08-14: **site e e-mail** passam a usar
**`motorsstore.com.br`**. O endereço antigo `@motorsstoreoficial.com.br`
(com "oficial") sai de cena — mas não de uma vez: ver "A conta do painel".

## O que já está pronto

O endereço do site vivia escrito à mão em **15 pontos** do código — canonical,
`sitemap.ts`, `robots.ts`, JSON-LD de quatro páginas, breadcrumb da ficha do
veículo e o `metadataBase` do layout. Trocar caçando string é como se perde
um, e o erro é do tipo que não aparece: a página responde 200 e aponta o
canonical para um endereço que não é mais o do site.

Desde 2026-08-14 há um módulo só — [`src/lib/site.ts`](../src/lib/site.ts) —
que lê `NEXT_PUBLIC_SITE_URL` e cai no endereço da Vercel quando ela não está
definida. Um teste (`tests/dominio-do-site.test.ts`) falha se alguém voltar a
escrever o domínio à mão em `src/`.

**Enquanto a variável não mudar, nada muda de comportamento.** A virada é uma
variável de ambiente, não um commit.

> ## ✅ Virada CONCLUÍDA em 2026-08-15
>
> DNS, variável e redeploy, os três feitos no mesmo dia. Conferido em produção
> depois do deploy — os pontos que o `src/lib/site.ts` centraliza saíram todos
> no domínio novo:
>
> | Conferência | Resultado |
> |---|---|
> | `https://motorsstore.com.br` | 200, certificado válido |
> | `<link rel="canonical">` | `https://motorsstore.com.br` |
> | `robots.txt` → `Sitemap:` | `https://motorsstore.com.br/sitemap.xml` |
> | `sitemap.xml` | todas as URLs no domínio novo |
> | `og:url` da ficha de veículo | domínio novo |
> | Feed do catálogo (`/api/feed/xml`) | 64 itens, `g:link` no domínio novo |
> | `/og` (card social) | 200 `image/png`, e fora do `Disallow: /api/` |
> | `/login`, `/api/auth/callback` | 200 e 307 |
>
> **O `g:id` do catálogo não mudou** (é o id do veículo, não a URL): o Meta
> reaproveita os produtos existentes e só atualiza os links — anúncio ativo
> não recomeça do zero.
>
> **O alias `motors-site-oficial.vercel.app` continua servindo tudo**,
> inclusive o feed. Os dois workflows do n8n apontam para ele e **não precisam
> ser alterados**; trocar para o domínio novo é cosmético e mexe em workflow
> ativo — não vale o risco enquanto o alias existir.
>
> Fica pendente só o **301 de `www` para o apex** (hoje os dois servem 200).
> Com o canonical correto não há prejuízo de indexação; é acabamento.

## Os registros de e-mail (decisão de 2026-08-15)

**Caixas na Hostinger, envio pelo Resend.** São funções diferentes e é bom que
sejam separadas: quem recebe `motors@motorsstore.com.br` não precisa ser quem
envia o link mágico da Garagem. A zona está na **Vercel**
(`ns1/ns2.vercel-dns.com`), então tudo abaixo entra em
**Vercel → Domains → motorsstore.com.br → DNS Records**.

Estado de partida, conferido em 2026-08-15: **o domínio não tem nenhum
registro de e-mail**. O `MX` nulo e o `SPF -all` que o registro.br colocava
saíram junto com a zona antiga. Começamos do zero, sem nada para desfazer.

### 🔴 A regra que quebra a maioria das configurações

**Só pode existir UM registro TXT de SPF por nome.** Dois registros `v=spf1`
no mesmo nome não somam — deixam o SPF inválido (`permerror`), e o efeito é
pior que não ter nenhum: provedores passam a desconfiar de tudo que sai do
domínio. Se a Hostinger e o Resend pedirem SPF no mesmo nome, **funda os dois
numa linha só**, com um `include:` para cada.

### Fase 1 (2026-08-15): só o Resend, para destravar a Garagem

Decisão do dono: configurar **só o envio** agora. As caixas da Hostinger ficam
para depois. Isso simplifica tudo — sem MX de caixa no domínio, não há
conflito nenhum e o SPF tem um `include:` só.

**Verifique o subdomínio `send.motorsstore.com.br` no Resend, não o apex.**
O motivo é o futuro: quando a Hostinger entrar, ela vai querer o `MX` do apex,
e o Resend também usa um `MX` (de retorno de bounce). Dois serviços não podem
receber no mesmo nome. Verificando o subdomínio agora, o apex fica livre para
a Hostinger e **nunca mais é preciso mexer no que já funciona**. O custo é o
remetente ser `@send.motorsstore.com.br` — normal em e-mail transacional, e o
cliente vê "Motors Store" como nome do remetente de qualquer forma.

#### 🔑 A tradução que confunde todo mundo

O Resend mostra o **nome completo** do registro. A Vercel pede só o **prefixo**
(o pedaço antes de `.motorsstore.com.br`). Ao copiar, corte o final:

| O Resend mostra | Na Vercel, o campo *Name* recebe |
|---|---|
| `send.motorsstore.com.br` | `send` |
| `resend._domainkey.send.motorsstore.com.br` | `resend._domainkey.send` |
| `_dmarc.motorsstore.com.br` | `_dmarc` |

Colar o nome completo cria `send.motorsstore.com.br.motorsstore.com.br` — que
não dá erro nenhum, só nunca verifica. Se a verificação do Resend ficar
teimando em "pendente", **é quase sempre isto.**

#### Os três registros

Na tela do Resend (Domains → Add Domain → `send.motorsstore.com.br`), ele
lista os registros. Tipicamente são estes três — mas **copie os valores da
tela**, porque a chave DKIM é única da sua conta e a região do `MX` depende da
que você escolher:

| # | Type | Name (na Vercel) | Value | Priority |
|---|---|---|---|---|
| 1 | `MX` | `send` | `feedback-smtp.<região>.amazonses.com` | `10` |
| 2 | `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | — |
| 3 | `TXT` | `resend._domainkey.send` | a chave DKIM (`p=MIGfMA0…`, bem longa) | — |

Depois, clique em **Verify DNS Records** no Resend. Leva de alguns minutos a
meia hora (o TTL da zona é de 10 min).

#### Quando a Hostinger entrar, depois

Nada do que está acima muda. Você só acrescenta, no **apex**, o `MX`, o SPF e o
DKIM que a Hostinger mostrar — e como o SPF do apex ainda não existe, também
não haverá o que fundir. É por isso que o subdomínio vale a pena agora.

### 1. Hostinger — receber

A Hostinger tem **dois** produtos de e-mail, e os dois existem no DNS:
`mx1/mx2.hostinger.com` e `mx1/mx2.titan.email`. Qual vale depende do seu
plano — **copie os valores da tela da Hostinger**, em E-mails → o domínio →
Registros DNS / Configuração. Não use os daqui nem os de tutorial: MX errado
não dá erro, só silencia a caixa.

Você vai precisar de, tipicamente:

| Tipo | Nome | Valor | Prioridade |
|---|---|---|---|
| `MX` | `@` | *o que a Hostinger mostrar* | *a que ela mostrar* |
| `MX` | `@` | *o segundo servidor* | *a segunda prioridade* |
| `TXT` | `@` | o `include:` de SPF da Hostinger | — |
| `TXT` | `hostingermail._domainkey` (ou o nome que ela indicar) | a chave DKIM | — |

### 2. Resend — enviar

Ao adicionar o domínio no Resend, ele mostra a lista exata de registros (a
chave DKIM é única da sua conta — não existe valor "padrão"). **Observe uma
coisa ao ler essa lista:**

- **Se o Resend pedir um `MX` no apex** (`@`, geralmente
  `feedback-smtp.<região>.amazonses.com`, para retorno de bounce), ele
  **conflita com o MX da Hostinger** — dois serviços não podem receber no
  mesmo nome. Nesse caso, **verifique um subdomínio no Resend**
  (`send.motorsstore.com.br`): todos os registros dele passam a viver no
  subdomínio, o apex fica só com a Hostinger, e não há conflito nenhum. O
  preço é o remetente virar `@send.motorsstore.com.br`.
- **Se você verificar o apex** e pular o MX de feedback, o remetente fica
  `garagem@motorsstore.com.br` (mais bonito para o cliente), e aí o SPF do
  apex precisa conter **os dois** includes:

```
v=spf1 include:<spf-da-hostinger> include:amazonses.com ~all
```

> `~all` (softfail) no começo, não `-all`. Enquanto você testa, softfail faz o
> e-mail suspeito ir para spam; `-all` faz ser **recusado**, e um erro de
> digitação no include vira "ninguém recebe o link mágico". Aperte para `-all`
> depois de uma semana sem bounce — foi o que o domínio antigo fez.

### 3. DMARC — este é independente de provedor

| Tipo | Nome | Valor |
|---|---|---|
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:SEU-ENDERECO; fo=1` |

`p=none` só observa e **não afeta entrega**: é o modo certo para começar. O
`rua` recebe os relatórios diários — use um endereço que você leia, e lembre
que esse registro é público. Depois de semanas de relatório limpo, dá para
subir para `p=quarantine`.

### 4. Conferir (10 a 30 min depois — o TTL da zona é de 10 min)

```bash
nslookup -type=MX motorsstore.com.br 8.8.8.8
nslookup -type=TXT motorsstore.com.br 8.8.8.8
nslookup -type=TXT _dmarc.motorsstore.com.br 8.8.8.8
```

O `TXT` do apex tem que voltar **uma única linha** `v=spf1`. Se voltarem duas,
o SPF está inválido — funda antes de mandar qualquer e-mail real.

O SMTP do Supabase, com os valores do Resend, está em
[`AREA_DO_CLIENTE_AUTH.md`](AREA_DO_CLIENTE_AUTH.md) §3.

### Depois da virada, no marketing (fora deste repositório)

Dois itens que não são de código e ninguém avisa quando faltam:

- **Verificação de domínio no Meta Business Manager.** O `motorsstore.com.br`
  precisa ser verificado lá para a mensuração agregada de eventos continuar
  atribuindo. O Pixel dispara igual, mas a atribuição pode degradar.
- **Google Search Console:** adicionar a nova propriedade e reenviar o
  sitemap. O `.vercel.app` seguirá indexado por um tempo — o canonical novo é
  o que vai migrar a autoridade.

## Passo 0 — o DNS no registro.br (medido em 2026-08-15)

**Estado real hoje**, conferido contra os servidores autoritativos do `.br`:

| O que | Valor encontrado | Leitura |
|---|---|---|
| Nameservers | `a.auto.dns.br`, `b.auto.dns.br` | **DNS automático do registro.br** — o domínio NÃO está na Vercel |
| `A` do apex | não existe | nada responde em `motorsstore.com.br` |
| `www` | não existe | — |

> **Resolvido no mesmo dia, pelo caminho alternativo.** O dono manteve a zona
> no registro.br e apontou os registros para a Vercel — o apex responde em
> `216.198.79.1/.65` e o `www` em `64.29.17.1/.65`, ambos com certificado
> válido. A tabela acima fica como registro do diagnóstico. **Consequência a
> lembrar:** com a zona no registro.br, se a Vercel trocar o IP do apex, é
> preciso trocar à mão — vale conferir de tempos em tempos que o apex ainda
> responde com o certificado certo.
>
> Ponto menor de SEO: apex e `www` servem 200 **sem redirecionar** um para o
> outro. Com o canonical correto (passo 2) isso deixa de ser problema de
> indexação, mas o ideal é um 301 do `www` para o apex, configurável na
> própria Vercel (Domains → o `www` → *Redirect to*).
| `MX` | *null MX* (`preference 0`, alvo vazio) | padrão do registro.br: "este domínio não recebe e-mail" |
| `TXT` | `v=spf1 -all` | padrão do registro.br: "ninguém envia e-mail por este domínio" |

Ou seja: o domínio está registrado e estacionado no DNS do próprio
registro.br. A tentativa de apontar para a Vercel não pegou.

### Cloudflare é necessário? Não.

A dúvida é razoável, mas vem de uma confusão comum: **o Turnstile não exige
que seu DNS esteja na Cloudflare.** Ele é um serviço independente — você
cadastra o *hostname* no painel do Turnstile e ele funciona em qualquer
domínio, hospedado em qualquer DNS. As chaves do captcha não têm relação
nenhuma com nameserver.

E pôr a Cloudflare como proxy na frente da Vercel **acrescenta problema, não
segurança**, neste caso: a Vercel já entrega CDN, certificado e proteção de
borda; o proxy duplo exige SSL em modo *Full (strict)* (fora dele, laço de
redirecionamento), duplica cache e cria mais uma camada para depurar quando
algo sai errado. Só vale a pena se você quiser especificamente o WAF ou a
analítica da Cloudflare — e não é o caso agora.

### Por que a delegação não pegou (o provável)

O registro.br **valida** os nameservers antes de aceitar a mudança: ele
consulta os servidores informados e, se eles ainda não conhecem a zona, a
alteração fica pendente ou é recusada. Como o domínio provavelmente ainda não
tinha sido adicionado na Vercel, os `ns1/ns2.vercel-dns.com` não respondiam
por ele — e o registro.br manteve o DNS automático.

**A ordem certa é: primeiro a Vercel conhecer o domínio, depois o registro.br
delegar.**

### Caminho recomendado — delegar para a Vercel

1. **Vercel → Settings → Domains → Add.** Digite `motorsstore.com.br`.
   Adicione também `www.motorsstore.com.br` e deixe um redirecionando para o
   outro (escolha uma forma canônica; o código usa o apex).
2. A Vercel mostra uma tela de configuração. Escolha a opção de
   **nameservers** — ela exibe `ns1.vercel-dns.com` e `ns2.vercel-dns.com`.
   *(Se a tela oferecer valores de `A`/`CNAME` em vez disso, é o outro
   caminho — veja a alternativa abaixo.)*
3. **registro.br → Painel → seu domínio → DNS.** Troque de "usar os servidores
   DNS do registro.br" para **"usar outros servidores DNS"** e informe os dois
   nameservers da Vercel, exatamente como ela mostrou.
4. **Espere.** O `.br` publica em minutos, mas resolvedores no mundo levam até
   algumas horas. O TTL da zona atual é de 900 s (15 min).
5. Confirme antes de seguir para o passo 1 da sequência abaixo:
   ```bash
   nslookup -type=NS motorsstore.com.br 8.8.8.8
   ```
   Tem que responder `ns1.vercel-dns.com` / `ns2.vercel-dns.com`. Enquanto
   mostrar `auto.dns.br`, a delegação não entrou.
6. Volte à Vercel e confirme que o domínio saiu de *Pending* e que o
   **certificado foi emitido**.

### Alternativa — manter o DNS no registro.br

Se o registro.br insistir em recusar a delegação, dá para deixar a zona onde
está e só apontar os registros, pelo editor de zona do DNS automático:

- `A` no apex (`@` ou em branco) → **o IP que a tela da Vercel mostrar**
- `CNAME` em `www` → **o alvo que a tela da Vercel mostrar**
  (hoje `cname.vercel-dns.com`)

> ⚠️ Use os valores da tela da Vercel, não os de tutoriais: o IP do apex já
> mudou de valor mais de uma vez, e um IP velho responde — com o site errado
> ou com erro de certificado, que é pior do que não responder.

O custo dessa alternativa é manutenção manual: se a Vercel trocar o IP, você
troca à mão. Por isso a delegação é preferível.

### ⚠️ O e-mail: dois padrões do registro.br que bloqueiam envio

O domínio novo veio com `MX` nulo e `SPF -all`. **Enquanto estiverem assim,
`motors@motorsstore.com.br` não recebe nem envia nada** — e isso atinge duas
coisas já decididas: o e-mail da loja (que `papelPadrao.ts` já aceita) e o
remetente do **link mágico** da Garagem (`AREA_DO_CLIENTE_AUTH.md` §3), que
cairia direto em spam com `-all`.

Não é urgente para o site entrar no ar, mas precisa entrar no mesmo plano:
quando for configurar o e-mail, os registros `MX`, `SPF` (com o servidor de
envio autorizado), `DKIM` e `DMARC` vão para **onde a zona estiver** — na
Vercel, se você delegar; no registro.br, se ficar. O domínio antigo
`motorsstoreoficial.com.br` segue com MX na KingHost e **não é afetado** por
nada disto.

## A sequência, quando o domínio estiver apontando

A ordem importa: o passo 3 depende do 2, e o 4 do 3.

1. **Vercel → Domains:** adicionar `motorsstore.com.br` (e `www`, redirecionando
   para o apex ou vice-versa — escolha uma forma canônica e mantenha).
   Confirmar que o certificado saiu antes de seguir.

2. **Vercel → Environment Variables:** definir
   `NEXT_PUBLIC_SITE_URL=https://motorsstore.com.br`.
   ⚠️ `NEXT_PUBLIC_*` é embutido no bundle em tempo de **build**: salvar a
   variável não basta, é preciso **um deploy novo** para valer.

3. **Redeploy.** Depois dele, conferir em produção:
   - `/robots.txt` → a linha `Sitemap:` aponta para o domínio novo
   - `/sitemap.xml` → as URLs saem no domínio novo
   - qualquer ficha de veículo → `<link rel="canonical">` e o JSON-LD no
     domínio novo
   - colar um link no WhatsApp → o card renderiza (o `og:image` é resolvido
     contra o `metadataBase`)

4. **Supabase → Authentication → URL Configuration:** trocar o *Site URL* e
   deixar **os dois** endereços na lista de *Redirect URLs* por um tempo — link
   mágico que já está na caixa de entrada de alguém aponta para o endereço
   antigo, e removê-lo cedo quebra o login dessas pessoas.

5. **SMTP:** o remetente do e-mail de acesso passa a ser
   `@motorsstore.com.br`, com SPF/DKIM configurados no domínio novo. E-mail de
   acesso que cai em spam é login que não acontece.

## A conta do painel — onde isso pode trancar você do lado de fora

O e-mail fundador aparece em `src/lib/papelPadrao.ts`, na lista que concede
`admin` a quem **não tem linha em `profiles`**. Desde 2026-08-14 ela aceita os
dois endereços, o novo e o antigo, exatamente para a migração não virar um
bloqueio.

Duas coisas que valem saber antes de mexer na conta:

1. **A lista de e-mails é rede de segurança, não o mecanismo.** Quem manda é a
   coluna `role` em `profiles`. Hoje há três contas de equipe em produção, e
   todas têm linha lá — então o fallback nem chega a ser consultado.

2. **Criar uma conta nova com o e-mail novo NÃO dá admin sozinho.** O trigger
   `handle_new_user` grava `role = 'cliente'` por padrão (é a trava da role
   `cliente`, de 2026-08-13), e com uma linha existente o fallback por e-mail
   não roda. O caminho certo é um dos dois:
   - trocar o e-mail da conta existente no Supabase Auth, mantendo o mesmo
     `id` — a linha em `profiles` continua valendo e o papel se preserva; **ou**
   - criar a conta nova e, logo em seguida, promover o papel pelo painel de
     usuários (tela A17) ou direto em `profiles`.

Só depois de confirmar que a conta nova entra no `/admin` é que vale remover
`@motorsstoreoficial.com.br` da lista em `papelPadrao.ts`.

> O e-mail antigo também aparece em `supabase_schema.sql`, em policies de
> `site_settings`. **Não atualize aquele arquivo**: ele está obsoleto e é
> perigoso — recria policies públicas que as migrações fecharam. A produção usa
> `is_staff()`, não e-mail. Ver a nota em `supabase/README.md`.

## O que NÃO muda

- **Tracking:** o Pixel e o GA4 não dependem do domínio. O `event_source_url`
  do CAPI passa a sair no endereço novo sozinho, porque é lido da requisição.
- **Feed XML** (`/api/feed/xml`): já lia `NEXT_PUBLIC_SITE_URL`, com o host da
  requisição como reserva. Nada a fazer — mas vale reprocessar o catálogo no
  Meta e no Google Merchant depois da virada, para as URLs dos anúncios
  acompanharem.
- **Nada no banco.** Nenhuma tabela guarda o domínio.

## Depois da virada

- Redirecionamento 301 do endereço da Vercel para o domínio novo, para não
  dividir a autoridade de SEO entre dois endereços.
- Google Search Console: propriedade nova, e o sitemap reenviado.
- A célula do QR na vitrine de TV (`VitrineTV.tsx`) hoje mostra o código do
  veículo porque não havia domínio para imprimir. Com o domínio no ar, ela
  pode virar o QR que o design doc pede — o endereço sai de `lib/site.ts`.
