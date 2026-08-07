# Música do showroom — telas 08 A/B/C e A18

Como ligar o Spotify da loja no site. Sem as variáveis preenchidas, nada disso
aparece: a barra da TV fica como era e `/vitrine/musica` explica o que falta.

| Tela | Rota | O que faz |
| --- | --- | --- |
| 08 A | `/vitrine` | **É o player.** Registra a aba como "TV Showroom" no Connect e mostra o que está tocando. |
| 08 B | `/vitrine/balcao` | O CHAMAR CONSULTOR abaixa o volume para 20%. |
| 08 C | `/vitrine/musica` | Controle remoto: tocar, pular, volume, playlist, fila. |
| A18 | `/admin/site/musica` | Grade por horário, regras fixas e dispositivos. |
| A5 | `/admin/configuracoes?tab=integracao` | Linha do conector, com o estado real. |

**Quem toca é a TV, quem manda é o tablet.** A vitrine carrega o Web Playback
SDK e vira um dispositivo Spotify Connect; o painel do balcão fala com a Web
API e comanda esse dispositivo. É por isso que as duas telas mostram a mesma
faixa: elas olham o mesmo player de conta.

---

## Antes de tudo: o que isso não é

O caminho barato — o iframe de `open.spotify.com/embed/…` — não serve, e não é
questão de gosto:

- toca **30 segundos** por faixa para quem não estiver logado com Premium
  naquele navegador. Numa TV de showroom, ninguém está;
- **não dá autoplay.** Navegador bloqueia áudio sem gesto do usuário, e a TV é
  justamente a tela em que ninguém toca;
- é cross-origin: a página não consegue pausar, pular nem mexer no volume dele.
  O "abaixa para 20% no CHAMAR CONSULTOR" fica impossível;
- não expõe o que está tocando, então a faixa do topo da TV ficaria sem dado.

O design desenha um **controle remoto** (08 C) e um **mostrador** (08 A) em dois
aparelhos diferentes olhando o mesmo player. Isso é estado de conta, e quem tem
estado de conta é a Web API. O áudio sai de onde a loja já ouve música — a caixa
de som, o celular do balcão —, não do alto-falante da TV.

## Antes de tudo, parte 2: licenciamento

Isto é observação técnica, não parecer jurídico, e vale resolver antes de ligar
na TV:

- o plano **pessoal** do Spotify proíbe uso em estabelecimento comercial. O
  produto deles para isso é o **Soundtrack Your Brand**;
- no Brasil, tocar música em loja gera cobrança do **ECAD** independente da
  origem do som.

O código aqui funciona com qualquer conta Premium. Se a loja está regular ou não
é decisão da loja.

---

## Configuração

### 1. Criar o app

Em <https://developer.spotify.com/dashboard>, com a conta **Premium** da loja:

1. **Create app.** Nome e descrição livres.
2. Em **Redirect URI**, `http://127.0.0.1:8888/callback`. Serve só para gerar o
   token uma vez, na sua máquina — o site em produção nunca usa esse endereço.
3. Anote o **Client ID** e o **Client secret**.

### 2. Gerar o refresh token

**Use o script** — o passo manual erra fácil, e o Spotify só responde
`invalid_grant` sem dizer o motivo:

```bash
node scripts/spotify-refresh-token.mjs
```

Ele lê o ID e o secret do `.env.local`, imprime a URL de autorização, e no
segundo comando (`node scripts/spotify-refresh-token.mjs SEU_CODE`) troca o
code, **grava o token no `.env.local`** e confere na hora se os escopos vieram
completos e se a conta é Premium. Nenhuma credencial passa por argumento além
do code, que é de uso único.

O caminho manual, se preferir:

Uma vez só. Os escopos são exatamente estes quatro — `streaming` é o que
permite a TV ser o player, os outros três são o controle remoto:

```
streaming user-read-playback-state user-modify-playback-state playlist-read-private
```

Abra no navegador, logado na conta da loja, trocando `SEU_CLIENT_ID`:

```
https://accounts.spotify.com/authorize?client_id=SEU_CLIENT_ID&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback&scope=streaming%20user-read-playback-state%20user-modify-playback-state%20playlist-read-private
```

Autorize. O navegador vai tentar abrir `127.0.0.1:8888` e falhar — normal. O que
importa é o `?code=…` na barra de endereço. Copie esse valor e troque por um
refresh token:

```bash
curl -X POST https://accounts.spotify.com/api/token -u "SEU_CLIENT_ID:SEU_CLIENT_SECRET" -d grant_type=authorization_code -d code=O_CODE_DA_URL -d redirect_uri=http://127.0.0.1:8888/callback
```

A resposta traz `refresh_token`. Ele não expira sozinho — só morre se o app for
apagado ou o acesso for revogado nas configurações da conta.

### 3. Preencher o ambiente

Em `.env.local` (e nas variáveis do deploy):

```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
```

Nunca prefixar com `NEXT_PUBLIC_`: o secret e o refresh token iriam para o
bundle do site.

### 4. Logar a TV e o tablet

**Os dois aparelhos precisam de sessão do Supabase**, uma vez cada um — ela
persiste no navegador. É o passo 01 da A18 ("login único no navegador da TV,
com a conta da loja").

Por que a TV precisa: o Web Playback SDK roda no navegador e precisa de um
access token do Spotify. Ele vem de `/api/musica/token`, que **exige sessão** —
esse token controla o playback da conta por ~1 h direto contra a API do
Spotify, e aberto vazaria para qualquer visitante que abrisse `/vitrine`.

Por que o tablet precisa: `/vitrine/musica` manda comando, e comando exige
sessão (`src/app/api/musica/route.ts`).

A única exceção é o abaixamento do CHAMAR CONSULTOR, que sai do tablet anônimo
da 08 B: abaixar o volume é a ação que não atrapalha ninguém se for disparada
por engano. **Restaurar** continua exigindo sessão — é ela que sobe o volume de
volta, e essa não podia ficar aberta.

Sem sessão na TV, ela não vira dispositivo: continua mostrando a vitrine e a
faixa do que estiver tocando em outro aparelho.

### 5. Autoplay: a flag do Chrome

O passo 04 da A18 diz "a TV abre a vitrine em tela cheia e dá play na grade do
horário. **Sem clique de ninguém**".

Navegador nenhum faz isso por padrão — áudio sem gesto do usuário é bloqueado,
e o Web Playback SDK não é exceção. O Chrome em modo quiosque faz, com a flag:

```bash
chrome --kiosk --autoplay-policy=no-user-gesture-required http://SEU_SITE/vitrine
```

Sem a flag, alguém toca na tela uma vez por dia. Não há como contornar por
código: a política é do navegador.

### 6. Configurar a grade

Em `/admin/site/musica` (A18): qual playlist e qual volume valem em cada faixa
do dia. Sem grade, a TV não troca de playlist sozinha e o balcão comanda à mão.

---

## As quatro "regras fixas" da A18

Três subiram; uma não pode. A tela mostra o estado de cada uma em vez de
esconder a que não deu.

| Regra | Estado | Onde vive |
| --- | --- | --- |
| Teto de volume 70% | **ativa** | `limitarVolume`, aplicada no servidor e na normalização |
| Abaixa para 20%, volta em 90 s | **ativa** | `encerrarAtendimentoVencido` |
| Conteúdo explícito bloqueado | **na conta** | trava do Spotify; a API deixa ler, nunca escrever |
| Queda de internet: playlist local | **não disponível** | ver abaixo |

**Por que a playlist local não sobe:** o Web Playback SDK não toca offline.
Download de faixa é recurso do app **nativo** do Spotify; um player de
navegador precisa de rede. Para ter som sem internet a saída é uma fonte local
fora do Spotify — o que é outro projeto, não um ajuste deste.

Os números 70%, 20% e 90 s vêm da A18 e estão travados por
`tests/musica-grade.test.ts`. Quem mudar um deles passa pelo teste.

---

## Deploy no Vercel

As três variáveis do Spotify precisam ser criadas em **Project Settings →
Environment Variables**, sem prefixo `NEXT_PUBLIC_`, e o projeto **redeployado**
— o Vercel não aplica variável nova a deploy que já existe.

### E mais uma, por causa do serverless

`UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (as mesmas do rate limit)
passam a importar para a música. Sem elas, **a volta automática dos 90 s não
acontece em produção**:

O POST de `abaixar` cai numa instância lambda; os polls de `/api/musica` que
restaurariam o volume caem em outra, que nunca soube do abaixamento. A loja fica
a 20% até alguém arrastar a barra — e o painel do balcão nem mostra o botão
RESTAURAR, porque para aquela instância não há atendimento em curso.

Com Upstash, o estado é compartilhado e a regra vale. Sem, o painel A18 marca
essa regra como **PARCIAL** e explica — não promete uma volta que não vem.

Local e em servidor único (`next dev`, `next start`) funciona sem Upstash: o
estado cai numa variável de módulo, que é suficiente quando há um processo só.

O que **não** precisa de Upstash: token, cache de estado e grade. Sem ele o
único efeito é mais chamadas ao Spotify, dentro do limite.

---

## Playlists e o horário do design

O design desenha `84 faixas · 09h–17h` nas células da grade.

A contagem de faixas vem do Spotify. **O horário não existe no Spotify** — é
curadoria da loja, e inventá-lo aqui imprimiria uma escala que ninguém combinou.
A saída: escreva o horário na **descrição da playlist**, no app do Spotify. O
painel exibe o que estiver lá, e não exibe nada quando não houver.

O painel mostra as **4 primeiras** playlists da conta (`GET /me/playlists`), que
é o que a grade 2×2 do design comporta. A ordem é a do Spotify — reordene por lá.

---

## Limites que valem saber

- **Poll de 5s.** O painel e a TV perguntam o estado a cada 5s e contam o
  progresso no relógio local entre os polls. Perguntar de segundo em segundo com
  duas ou três telas abertas encosta no rate limit do Spotify (janela móvel de
  30s). O erro máximo do ponteiro é 5s, e zera no poll seguinte.
- **Cache de 2s no servidor** (`lerEstado`), para que N telas abertas não virem
  N chamadas ao Spotify.
- **Conta free devolve 403** em todo comando de playback. O painel traduz isso
  para "a conta conectada não é Premium".
- O volume anterior guardado pelo CHAMAR CONSULTOR vive na memória do processo.
  Se o deploy reiniciar durante um atendimento, o volume fica em 20% até alguém
  subir pelo painel. É estado de sessão de loja, não sobrevive ao fim do dia —
  não vale uma tabela.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/lib/spotify.ts` | Fala com o Spotify. **Só servidor** — lê o secret. |
| `src/lib/musicaShowroom.ts` | Tipos e formatação. Sem segredo, atravessa para o cliente. |
| `src/lib/musicaGrade.ts` | Grade por horário e as regras fixas da A18. Puro e testado. |
| `src/app/api/musica/route.ts` | `GET` estado (aberto), `POST` comando (com sessão). |
| `src/app/api/musica/token/route.ts` | Access token do SDK. **Sempre com sessão.** |
| `src/components/modernist/useMusica.ts` | Poll + relógio local, compartilhado pelas telas. |
| `src/components/modernist/PlayerDaTV.tsx` | Registra a TV como dispositivo Connect. Não desenha nada. |
| `src/components/modernist/FaixaMusica.tsx` | Mostrador da TV (08 A) e o equalizador. |
| `src/components/modernist/ControleMusica.tsx` | Painel do balcão (08 C). |
| `src/components/admin/MusicaShowroom.tsx` | Tela A18 do painel. |
| `src/components/admin/ConectorSpotify.tsx` | Linha do conector em Integrações (A5). |
| `tests/musica-grade.test.ts` | Guarda dos números e do desempate da grade. |
