# Faixa do Instagram automática — como ligar

A faixa do Instagram da home lê as publicações mais recentes de
@motorsstore.oficial pela **Instagram Graph API**, no servidor, uma vez por hora.
Mostra as seis mais recentes: a foto (Reels entram pela capa, carrossel pela
primeira foto) e o link para o post. **A legenda não vai para o site** — ver o
docblock de `src/lib/instagramAoVivo.ts`.

Sem as variáveis, ou com a API fora do ar, a faixa usa a curadoria do painel
(`site_settings.instagram_curadoria`). Se a curadoria também estiver vazia, a
faixa não aparece.

| Onde | O quê |
|---|---|
| `src/lib/instagramAoVivo.ts` | A chamada, o cache e o que entra na grade |
| `src/lib/instagramCuradoria.ts` | A reserva editada no painel |
| `tests/instagram-ao-vivo.test.ts` | Mapeamento da resposta e a ordem das fontes |

## Ligar (uma vez só)

1. No Business Manager da loja (Motors Store BM): **Configurações do negócio →
   Usuários → Usuários do sistema → Adicionar**. Papel: funcionário.
2. **Atribuir ativos** ao usuário do sistema: a conta do Instagram
   @motorsstore.oficial (e a Página do Facebook ligada a ela), com permissão de
   visualizar.
3. **Gerar token** para esse usuário, com as permissões `instagram_basic` e
   `pages_show_list`. Escolha a validade **"Nunca"**. É o token de usuário do
   sistema que não expira; o token de usuário comum vence em 60 dias.
4. Na Vercel (motors-site-oficial → Settings → Environment Variables,
   Production):

```
INSTAGRAM_TOKEN=<o token>
INSTAGRAM_USER_ID=17841476585399183
```

5. Novo deploy. As variáveis só valem a partir dele.

## Verificar

A home deve mostrar "Publicações mais recentes" ao lado do @ da loja e seis
fotos com link para o Instagram. Se continuar "Chegadas e entregas da semana",
está na curadoria: o log do servidor diz por quê (a Graph API explica o erro no
corpo da resposta).

## O que não fazer

**Não mostrar a legenda.** Ela traz preço, promoção com data e promessas que o
site não faz.

**Não expor o token no cliente.** `INSTAGRAM_TOKEN` é lida em Server Component;
com `NEXT_PUBLIC_` ela iria para o bundle.
