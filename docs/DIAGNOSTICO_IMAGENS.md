# Por que as imagens do site quebram

Investigação de 2026-08-26, conduzida por quatro frentes em paralelo: origem das
URLs, renderização no front, infraestrutura, e medição ao vivo em produção.

---

## Resumo

**A causa é uma só, e não está no código: a cota de Image Optimization da conta
Vercel estourou.** Toda transformação nova responde `402`. O que ainda aparece
na tela é o resto de um cache de borda que não se repõe.

```
$ curl -sSI "https://motorsstore.com.br/_next/image?url=%2Flogo.png&w=256&q=75"
HTTP/2 402
x-vercel-error: OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED
x-vercel-cache: MISS
```

O `url=%2Flogo.png` desse teste é o **arquivo local do próprio deploy**. Um 402
ali encerra a discussão: não é o `remotePatterns`, não é o Supabase, não é o
carro57, não é URL assinada expirando. É faturamento.

Enquanto isso, **todas as origens estão saudáveis** — 28 de 28 URLs testadas
retornam 200, incluindo as 10 do feed de anúncios.

---

## As três hipóteses que a medição derrubou

| Hipótese | Veredito | Prova |
|---|---|---|
| URL assinada com `expiresIn` curto gravada no banco | **Refutada** | Zero `token=`, `X-Amz-`, `Expires=` ou `/object/sign/` no HTML servido. A única URL assinada do sistema (`api/ciclo/foto/route.ts:46`, 300 s) não é persistida — a rota assina a cada request e responde 307 com `no-store`. O padrão está certo. |
| `remotePatterns` sem cobrir algum host | **Refutada** | Erro de host na Vercel é `400 INVALID_IMAGE_OPTIMIZE_REQUEST`, não 402 — e esse 400 existe e foi observado (com `w=16`). Além disso o **mesmo host** alterna 200 e 402 conforme o cache: se fosse config, seria determinístico. |
| `minimumCacheTTL` curto forçando re-busca | **Refutada** | O default do `next@16.2.6` é 14400 s (4 h), não 60 s — lido em `dist/shared/lib/image-config.js:57`. E `image-optimizer.js:1074` faz `max(minimumCacheTTL, maxAge da origem)`: a origem manda `max-age=31536000`, então o TTL efetivo é 1 ano. |

---

## Por que parece intermitente

Não é aleatório. É uma regra binária, verificada em 14 medições:

> `x-vercel-cache: HIT` → 200 · `x-vercel-cache: MISS` → 402

As respostas que ainda funcionam têm `age` entre 1.102.186 s e 1.103.169 s — uma
janela de **16 minutos, em ~13/08/2026**. Nada foi otimizado nos 12,8 dias
seguintes. O site está vivendo de um estoque de transformações que só encolhe.

Isso explica a forma exata da quebra que se vê na tela:

- **Quebram**: cards de veículo (`primitivos.tsx:268`) e a galeria da ficha
  (`PDPClientWrapper.tsx:932`, `:1033`, `:1396`) — os quatro `<Image>` de produto
- **Não quebram**: o hero (`HeroHome.tsx:128`) e as vitrines, porque são `<img>`
  cru; e o logo (`Header.tsx:80`, `:165`), porque alguém já pôs `unoptimized`
  ali — sem registrar por quê
- **Não quebra**: o feed `/api/feed/xml`, cujas 39 `<g:image_link>` apontam
  direto para o S3. **Meta e Google continuam vendo as fotos; só o site não.**

Medido no browser: `/estoque` → 9 de 11 imagens quebradas; PDP → 20 de 23.

---

## O que estourou a cota

O commit `46932d3` (2026-08-25 17:52) migrou o `CardVeiculo` de `<img>` cru para
`next/image`. O card aparece na home, no catálogo, nas landings, nos hubs e nas
páginas de bairro — **145 URLs no sitemap**. A revisão registrou o item em
`docs/ACHADOS_FINANCEIRO.md:277` como resolvido porque *"o host está em
`remotePatterns`"*. Isso é necessário e insuficiente: não diz nada sobre cota.

A aritmética que faltou:

```
39 veículos × ~19 fotos       ≈   740 imagens-fonte
× 10 larguras (256…3840)      ≈ 7.400 transformações
cota Hobby                    =  5.000/mês
```

Um único rastreamento do Googlebot já estoura. E como os nomes do RevendaMais
carregam hash (`7947766_2_W_cbee277ada.jpeg`), **cada re-upload no sync gera
chave de cache nova** — o consumo não estabiliza, cresce com o giro do estoque.

### Risco separado, e maior que as imagens

O Fair Use da Vercel restringe o plano Hobby a **uso não-comercial**, e lista
"anunciar a venda de um produto ou serviço" como violação explícita. Uma revenda
anunciando carros não é caso de dúvida. A consequência não é foto quebrada: é o
projeto ser pausado.

---

## O que foi corrigido nesta rodada

**1. `next.config.ts` — `unoptimized: true`.** Estancamento, não solução final.
Devolve as fotos ao ar hoje, servindo a origem direta como o feed e o hero
sempre fizeram. O S3 do RevendaMais responde atrás de Cloudflare com
`max-age=31536000`. Custo: peso de página (foto `_W_` ≈ 190 KB contra ~25 KB
otimizada).

**2. `next.config.ts` — `remotePatterns` fechados.** `s3.carro57.com.br` ganhou
`pathname: "/FC/9037/**"` e `*.supabase.co` virou o projeto real com o caminho
do bucket público. Sem isso, qualquer pessoa apontava o nosso otimizador para
qualquer objeto daquele S3 compartilhado — que hospeda **todas** as revendas
RevendaMais — e queimava a nossa cota. Pode ter acelerado o estouro.
`dangerouslyAllowSVG` saiu junto: nenhum `<Image>` do projeto serve SVG.

**3. `src/lib/supabase.ts` — o mapper deixou de aceitar `[""]` como foto.**
Quando o anúncio chega sem `<IMAGES>`, o sincronizador do n8n grava
`[carro.IMAGES?.IMAGE_URL || '']` — array de **um elemento vazio**, não array
vazio. O teste `length > 0` aceitava isso como foto legítima, o fallback
`/logo.png` nunca disparava, e o `""` chegava ao `src` dos cards (`??` não
socorre: string vazia não é nullish). É uma segunda quebra intermitente,
independente do 402: o veículo ficava sem foto só nos ciclos em que o feed veio
capenga, e voltava no ciclo seguinte.

**4. `src/lib/settings.ts` — vazamento de credencial fechado.** Ver abaixo.

**5. `src/app/api/feed/xml/route.ts` — `<g:link>` e `<g:image_link>` escapados.**
`title`, `description` e `brand` já eram; as URLs entravam cruas. Um `&` numa
URL futura derruba o parse do catálogo **inteiro**, não só do item.

---

## 🔴 Achado fora de escopo: credenciais S3 públicas

Durante a investigação, verificado ao vivo:

```
$ curl -sS https://motorsstore.com.br/api/settings   # anônimo, sem sessão
  companySettings.s3AccessKeyId      → 32 caracteres
  companySettings.s3SecretAccessKey  → 64 caracteres
```

São as credenciais S3 do Storage do Supabase, em texto puro, para qualquer
pessoa na internet. `recortePublicoDeSettings` removia `webhooks` e
`bankBalances` — que são **linhas** da tabela — mas as chaves S3 moram **dentro**
do objeto `company`, que o recorte entregava inteiro. A RLS decide por linha e
também não as via. Ponto cego estrutural, não descuido.

O código está corrigido, mas **a correção não basta**: as chaves já circularam.

**Ação necessária, e só o dono da conta pode fazer:** rotacionar as credenciais
em *Supabase → Project Settings → Storage → S3 Access Keys*, revogar a antiga, e
gravar a nova pelo painel de configurações. Enquanto isso não acontecer, quem
copiou a chave continua com acesso de escrita ao Storage do projeto.

---

## Trazer o Supabase Storage para dentro da Vercel?

**Não. A pergunta parte de uma premissa que a investigação derrubou: as fotos
dos veículos nunca estiveram no Supabase Storage.**

Elas vêm de `s3.carro57.com.br` (RevendaMais), por feed XML, via n8n. O Supabase
Storage guarda só dois conjuntos pequenos:

| Bucket | Conteúdo | Visibilidade |
|---|---|---|
| `branding` | logo e favicon — 2 arquivos | público (criado em runtime, **sem migração**) |
| `diario-de-bordo` | fotos de etiqueta do Ciclo | privado, RLS, URL assinada de 300 s |

Migrar isso para o Vercel Blob moveria alguns megabytes e **não tocaria em um
único pixel do problema**.

Sobre a integração nativa do Marketplace: ela provisiona o projeto, injeta env
vars e centraliza a fatura — não muda nada em storage. E os nomes que ela injeta
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`) **não batem** com os que o app lê
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`); instalar hoje não
configuraria o app sozinho.

### Comparativo

Base: ~740 fotos, ~30 % de giro mensal.

| Opção | Custo | Esforço | Resolve o 402? |
|---|---|---|---|
| **A. Variantes que o RevendaMais já serve** | **$0** | baixo (~meio dia) | ✅ elimina a dependência |
| **B. Vercel Pro** | $20/mês, com imagem < $1 dentro dele | zero (troca de plano) | ✅ e regulariza o uso comercial |
| **C. Supabase Storage + transformações nativas** | $25/mês + ~$3/mês | alto — espelhamento e GC de órfãos | ✅ mas caro e com peça nova |
| **D. Vercel Blob** | centavos de storage | alto — e **Blob não otimiza na leitura** | ❌ não resolve sozinho |

### A descoberta que decide

**O RevendaMais já serve uma escada responsiva completa, de graça.** Basta
trocar o token na URL — verificado em 6 veículos, 200 em todos:

| Variante | Dimensões | Peso |
|---|---|---|
| `_P_` | 72×48 | 1,3 KB |
| `_S_` | 260×173 | 7 KB |
| `_M_` | 485×323 | ~20 KB |
| `_G_` | 640×426 | ~32 KB |
| `_W_` | 1621×1080 | ~187 KB |
| `_O_` | 1920×1279 | ~300 KB |

Hoje o card pega o `_W_` de 187 KB e paga a Vercel para gerar o que o `_G_` de
32 KB **já é**.

E há uma inversão: o **card** (miniatura) lê `web_full_images` — o arquivo grande
— em `primitivos.tsx:234`, enquanto a **ficha em tela cheia** lê
`whatsapp_images` em `PDPClientWrapper.tsx:144`. Está trocado. O efeito colateral
é que card e ficha do mesmo carro nunca compartilham transformação: o conjunto de
chaves de cache dobra.

---

## O que fazer, em ordem

1. **Já feito** — `unoptimized: true` devolve as fotos ao ar no próximo deploy.
2. **Rotacionar as credenciais S3 no Supabase.** Urgente, e só o dono faz.
3. **Assinar o Vercel Pro.** Não é sobre imagem: Hobby proíbe uso comercial e o
   risco é o projeto ser pausado. Com Pro, imagem custa menos de $1/mês.
4. **Adotar a opção A** — um `loader` custom escolhendo `_M_`/`_G_`/`_W_` por
   viewport. Zera transformações, entrega ~32 KB por card e cumpre o objetivo de
   LCP do commit `46932d3` **melhor** do que a solução que quebrou. Corrigir a
   inversão card/ficha no mesmo passo.
5. **Dar `onError` às imagens de produto.** Hoje `onError` existe em dois
   lugares no projeto inteiro, ambos no logo. Nenhuma foto de veículo tem
   tratamento de erro — é por isso que uma falha vira caixa cinza com o alt text
   derramando, em vez de degradar para um placeholder. `primitivos.tsx:250` já
   tem o esqueleto (`bg-mt-neutral-300`); falta o handler que o revele.

---

## Pendências menores registradas

- **`upload-branding/route.ts`** tem três caminhos de upload que divergem: o
  método S3 (`:91`) cria bucket **privado** mas monta URL `/object/public/`
  (`:103`) — o que gravaria uma URL permanentemente quebrada; e o fallback
  (`:176-182`) grava `data:` base64 no banco como se fosse URL. Latente hoje: os
  valores em produção são URLs públicas legítimas e retornam 200.
- **`supabase.ts`**: `url_imagem` é campo livre do sync e entra direto no `src`
  de um `<Image>`. Um host novo ali produziria 400 permanente. É a porta de
  entrada real para o modo de falha que o `remotePatterns` fechado mitiga.
- **`PDPClientWrapper.tsx:144-146`**: `displayImages` pode ser `null` se o banco
  devolver `web_full_images: null`, e `:167`/`:176` desreferenciam sem guarda.
  Hoje protegido só pelo default do mapper, que é acidental.
- **`compartilhamento.ts:163`** rejeita `.webp` como prévia, e
  `upload-branding/route.ts:66` converte todo upload para `.webp` — o logo do
  painel quase nunca aparece no card de compartilhamento, que cai sempre no PNG
  local.
