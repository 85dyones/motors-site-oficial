# Ligar as visitas do GA4 no painel

**Para:** o dono.
**Tempo:** ~10 minutos, uma vez.
**Onde termina:** Painel → **Configurações → Integração → Google Analytics —
leitura**. Não precisa da Vercel, não precisa de deploy.

---

## O que isto liga, e o que não

O site **já coleta** no GA4 desde sempre, sem nenhuma configuração aqui — é o
`G-KBL1MFN9E3` que roda no navegador do visitante.

O que falta é o caminho de volta: o painel **ler** esses números. Com as três
credenciais preenchidas, aparecem:

- **visitas ao catálogo** e visitas totais, na visão geral;
- **visitas por veículo**, na tabela de estoque e na ficha de cada carro.

Sem elas, essas células mostram **—**. É de propósito: zero é um número e
mente, "—" diz a verdade — *não sei*.

---

## Do lado do Google

São quatro passos, e o quarto é o que costuma faltar.

**1 · Criar o projeto e ativar a API**
`console.cloud.google.com` → criar um projeto (ou usar um existente) →
**APIs e serviços → Biblioteca** → procurar **Google Analytics Data API** →
**Ativar**.

**2 · Criar a conta de serviço**
**IAM e Admin → Contas de serviço → Criar conta de serviço**. Nome livre
(ex.: `painel-motors`). Não precisa dar papel nenhum no Google Cloud — o
acesso que importa é o do passo 4.

**3 · Gerar a chave JSON**
Na conta recém-criada → aba **Chaves** → **Adicionar chave → Criar nova chave
→ JSON**. O arquivo baixa uma vez só. Dele saem dois dos três campos:
`client_email` e `private_key`.

**4 · Dar acesso à propriedade do GA4** ← *o passo esquecido*
No **GA4** → **Admin → Gerenciamento de acesso à propriedade → +** → colar o
`client_email` da conta de serviço → papel **Leitor**.

> Sem este passo a API responde **403** mesmo com a chave correta, e a
> mensagem não diz que o problema é permissão. Se as visitas não aparecerem
> depois de tudo preenchido, é quase sempre aqui.

**Onde achar o ID da propriedade:** GA4 → **Admin → Detalhes da propriedade →
ID da propriedade**. É um número (ex.: `123456789`). **Não é** o
`G-KBL1MFN9E3` — esse é o de coleta, e não serve aqui.

---

## Do lado do painel

**Configurações → Integração → Google Analytics — leitura**. Três campos:

| Campo | De onde vem |
|---|---|
| ID da propriedade | GA4 → Admin → Detalhes da propriedade |
| E-mail da conta de serviço | campo `client_email` do JSON |
| Chave privada | campo `private_key` do MESMO JSON |

Na chave privada, cole o valor **inteiro**, do `-----BEGIN PRIVATE KEY-----`
ao `-----END PRIVATE KEY-----`, com as quebras de linha como vieram. O código
aceita as duas formas — quebra real ou `\n` escapado.

### A chave não aparece de volta

Depois de salvar, o campo volta vazio e o rótulo mostra **configurada ✓**. É
de propósito: a chave assina em nome da conta de serviço, e nada na tela
precisa lê-la. Mandá-la para o navegador de cada pessoa da equipe, a cada
abertura da tela, seria exposição sem uso.

**Salvar com o campo vazio mantém a chave que já está guardada.** Só substitui
quem colar uma nova. Isso vale, inclusive, quando você mexer só no ID da
propriedade.

Sendo justo sobre o alcance: quem é da equipe e sabe consultar o banco
consegue ler a chave. A máscara elimina o vazamento *rotineiro*, não o
deliberado.

---

## Onde a credencial fica guardada

Na tabela `site_settings`, linha `ga4` — a mesma casa do token do n8n. A
leitura dessa tabela exige `is_staff` na RLS
(`20260813120000_role_cliente_e_is_staff.sql`, com autoconferência que aborta a
migração se um logado comum conseguir ler), e a linha `ga4` está fora da lista
que o visitante anônimo enxerga.

As variáveis `GA4_PROPERTY_ID`, `GA4_CLIENT_EMAIL` e `GA4_PRIVATE_KEY`
continuam funcionando como **reserva**, campo a campo: o que estiver no painel
vence; o que faltar lá cai na variável. Quem já configurou por ambiente não
precisa mudar nada.

---

## A mesma conta serve para o Search Console

O `conteudo-seo/gsc.js` — que mostra para quais buscas o site já aparece e em
que posição — usa a **mesma conta de serviço**. Para ligá-lo:

1. ativar também a **Google Search Console API** no mesmo projeto do Google Cloud;
2. em Search Console → **Configurações → Usuários e permissões**, adicionar o
   mesmo `client_email`.

As credenciais dele (`GSC_SITE`, `GSC_CLIENT_EMAIL`, `GSC_PRIVATE_KEY`) ficam
**só** no `.env` — aquele script roda na máquina de quem escreve conteúdo, não
no site, e por isso não tem campo no painel.

---

## Conferindo

Preenchido e salvo, abra a **visão geral** do painel. As visitas aparecem na
mesma hora — o salvamento já limpa o cache de settings, sem redeploy.

Se continuar mostrando **—**:

1. o passo 4 foi feito? (é o suspeito número um);
2. o ID da propriedade é o **numérico**, não o `G-…`?
3. a **Google Analytics Data API** está ativada no projeto certo?
