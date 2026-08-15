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

## Passo 0 — o DNS no registro.br (medido em 2026-08-15)

**Estado real hoje**, conferido contra os servidores autoritativos do `.br`:

| O que | Valor encontrado | Leitura |
|---|---|---|
| Nameservers | `a.auto.dns.br`, `b.auto.dns.br` | **DNS automático do registro.br** — o domínio NÃO está na Vercel |
| `A` do apex | não existe | nada responde em `motorsstore.com.br` |
| `www` | não existe | — |
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
