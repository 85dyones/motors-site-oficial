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
