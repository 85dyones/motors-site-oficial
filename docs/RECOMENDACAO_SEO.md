# Recomendação de SEO — Motors Store

Escrita em 2026-08-18, a pedido do dono. Fatos marcados "medido hoje" foram
sondados em produção nesta data; o restante sai de `conteudo-seo/BRIEFING.md`,
`conteudo-seo/POSICIONAMENTO.md` e do código.

---

## A recomendação em uma frase

Antes de produzir qualquer conteúdo novo, **ligar a medição (Search Console) e
ocupar o canal local (Perfil da Empresa no Google)** — os dois maiores retornos
disponíveis custam R$ 0, são ações do dono, e todo o resto fica cego sem o
primeiro.

---

## O que já está no lugar — e não precisa refazer

Uma auditoria genérica recomendaria coisas que este projeto já fez. Estado
verificado:

- **Domínio próprio no ar desde 15/08**: canonical, `og:url` e `Sitemap:`
  corretos.
- **301 do `www` → apex no ar** (medido hoje: 301. O
  `VIRADA_DE_DOMINIO.md` ainda o dá como pendente — corrigir lá).
- **Sitemap dinâmico que acompanha o banco** (48 URLs hoje), com `lastmod`
  real por veículo; o trigger de conteúdo avisa o Google sozinho quando um
  texto muda.
- **robots.ts** com áreas privadas fechadas; `llms.txt` e `llms-full.txt`
  servidos para agentes de IA.
- **Dados estruturados**: `Car` + `BreadcrumbList` na PDP, negócio local na
  home, schema em /sobre, /contato e /destaques.
- **Carro vendido sai do índice com carência** e `follow: true` — a página
  vira porta de entrada para os similares em vez de beco sem saída.
- **41 de 41 anúncios com texto próprio e meta description distinta** (era
  1 de 41 até 17/08). O override de teste no BMW X4 foi removido (medido
  hoje: a PDP não mostra mais o texto de teste).
- **Posicionamento decidido**: "seleção", não "premium"; frase-mãe *"o carro
  que passou"*; vocabulário em `conteudo-seo/POSICIONAMENTO.md`.

A fundação técnica está acima da média do setor — o concorrente do bairro
anuncia com despejo de ficha. O que falta não é técnica: é **medição,
presença local e processo**.

---

## Prioridades, por retorno sobre esforço

> **Atualização de 2026-08-19 — P3 e P4 feitos.**
>
> - **P3**: o `<title>` da PDP passou a usar o nome deduplicado. Canonical e
>   URL não mudaram, então não há reindexação envolvida.
> - **P4**: o 301 do alias entrou em `next.config.ts`, por host, **excluindo
>   `/api/`** — os workflows do n8n seguem entrando pelo alias. Feito em
>   `redirects()` e não no proxy porque o matcher do proxy não cobre páginas,
>   e ampliá-lo faria o middleware rodar em toda visita.
>
> Falta o resto: **P1** e **P2** são seus (Search Console e Perfil da
> Empresa), **P5** é processo contínuo e **P6** é decisão.



### P1 — Search Console: ligar a medição · Dono · ~30 min · R$ 0

O único dado que ordena todo o resto: para que termos a motorsstore.com.br já
aparece, em que posição e quantos clicam. Sem ele, toda decisão de conteúdo é
palpite — inclusive a pergunta aberta do briefing (que modelos são mais
buscados na região).

O código está pronto: `conteudo-seo/gsc.js` consulta a API sem dependência
nova. O que só o dono pode fazer:

1. Verificar `motorsstore.com.br` no Search Console (registro DNS TXT — não
   depende de deploy).
2. No Google Cloud: ativar a Search Console API, criar **conta de serviço**,
   baixar o JSON.
3. Adicionar o e-mail da conta de serviço como usuário de **leitura** no
   Search Console — o passo que todo mundo esquece; sem ele a API responde
   403 com a chave correta.
4. `node conteudo-seo/configurar-gsc.js <caminho-do-json>`.
5. Enviar o sitemap (`https://motorsstore.com.br/sitemap.xml`) na interface.

Nota: a integração do Semrush foi tentada hoje e a conta está **sem créditos
de API**. Não faz falta agora: para uma loja de 41 carros, o dado do próprio
site (grátis) vale mais que estimativa de mercado (paga).

### P2 — Perfil da Empresa no Google · Dono · 1–2 h · R$ 0

Para "seminovos Curitiba" e "loja de carros Bacacheri", o bloco do mapa
aparece **antes** do orgânico — e é disputado por avaliação, proximidade e
completude do perfil, não pelo site. A loja alega média 4.8 no Google: esse
ativo precisa estar num perfil reivindicado, com categoria certa, endereço
idêntico ao do site (Rua Ernesto Piazzetta, 98 — Bacacheri), link para o
domínio, horário e fotos reais do showroom.

E transformar avaliação em processo: 163 famílias atendidas; cada venda nova
deveria terminar com o pedido de avaliação no Google. Quando o motor de
gatilhos do Ciclo estiver rodando, este é candidato natural a gatilho
pós-venda — registrado, não urgente.

### P3 — Título da PDP: a duplicação que corta o preço · Código · pequeno

Medido hoje, no carro mais caro da vitrine:

> BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut m40i 3.0 m sport edit v6 turbo
> aut - R$ 318.900 | Motors Store

O RevendaMais embute a versão no modelo e o `<title>` concatena os dois. O
Google corta por volta de 60 caracteres: o que sobra é só a repetição —
preço e nome da loja nunca aparecem no resultado. O card de WhatsApp já foi
corrigido com a deduplicação (`nomeDoVeiculo`, no mesmo arquivo da PDP); o
title ficou de fora na época por ser decisão de SEO em produção.

**Recomendação: aplicar a mesma deduplicação ao `<title>`.** Canonical e URL
não mudam — risco baixo, efeito direto no CTR.

### P4 — 301 do alias da Vercel, com o desvio das APIs · Código · pequeno, com cuidado

`motors-site-oficial.vercel.app` segue servindo 200 em tudo (medido hoje) —
conteúdo duplicado aos olhos do Google, mitigado pelo canonical, mas mitigado
não é resolvido. O 301 ingênuo derrubaria os **4 workflows do n8n que apontam
para o alias** (ver `VIRADA_DE_DOMINIO.md:44-47` e `MOTOR_DE_GATILHOS.md:116-118`).

A saída: redirecionar por host **só as rotas de página**, preservando
`/api/*` — no middleware ou `next.config`, condicionado ao host do alias.
O Google consolida, e feed/webhooks continuam de pé até a migração dos
workflows (cosmética, sem prazo).

### P5 — Processo contínuo: o texto não pode ser fotografia · Código + processo · médio

Os 41/41 de hoje valem até o sync trazer o próximo carro — e ele roda a cada
6 horas. Veículo novo entra **sem** `descricao_seo` e cai no texto genérico.
Três peças:

1. **Fila visível no painel** — os perfis que já editam texto (Admin,
   Marketing, Comercial) precisam ver "quais veículos estão sem texto
   próprio" sem procurar.
2. **`ACCESSORIES` no mapeamento do n8n** — a correção definitiva já mapeada
   no briefing §9: sem ela, todo carro novo entra sem opcionais, que é a
   matéria-prima da diferenciação entre dois carros do mesmo modelo.
3. **Revisar os 10 textos antigos** contra o frame de seleção — não estão
   quebrados; foram escritos antes do posicionamento.

Menor, mas real: a Fiat Strada Ranch de R$ 125.900 está com **1 foto**.
Texto bom não compensa anúncio sem foto.

### P6 — Nomenclatura das motos: decidir antes de crescer · Decisão · uma conversa

Motos deixaram de ser exceção e as rotas são `/carros/...`. Mudar URL depois
custa 301 em massa e reindexação; decidir agora custa uma conversa. Opções:
manter `/carros/` como rota única (custo zero, leve incoerência) ou criar
`/motos/` novo sem mexer no existente. O que não pode é o volume de motos
crescer primeiro e a decisão vir depois.

---

## O que NÃO fazer

- **Não criar blog genérico** ("como financiar", "melhor SUV de 2026") antes
  de o Search Console medir. Conteúdo genérico disputa com portais gigantes;
  o diferencial real da Motors é o texto por veículo — que o vizinho não tem —
  e a única afirmação que nenhum concorrente pode copiar: *3 de cada 10
  entram*.
- **Não criar páginas-cidade** ("seminovos em São José dos Pinhais") com o
  mesmo estoque de 41 carros — conteúdo raso aos olhos do Google; o raio de
  50 km se resolve melhor no Perfil da Empresa e no texto dos veículos.
- **Não exibir FIPE** — decisão do dono em 17/08.
- **Não filtrar a vitrine** em nome de SEO — regra 6: ordena, nunca esconde.
- **Não renomear ou remover eventos de tracking** — regra 7.
- **Não fazer o 301 do alias sem o desvio de `/api/*`** — derruba 4 workflows.

---

## Horizonte — depois que o básico medir

- **Uma página "como selecionamos"**, contando a perícia cautelar, o crivo de
  120 pontos e os 3-de-10 — uma página forte vale mais que dez posts, e é o
  único conteúdo institucional que trabalha o posicionamento inteiro.
- **Pacote 9** (eventos de Ciclo no tracking) — não é SEO, mas sem ele não se
  mede o funil que o SEO alimenta.
- **Reavaliar ferramenta paga de keyword** só se o GSC mostrar demanda que o
  estoque não cobre.

---

## Resumo executivo

| # | Ação | Quem | Custo |
|---|------|------|-------|
| P1 | Search Console: verificação + conta de serviço + sitemap | Dono | ~30 min |
| P2 | Perfil da Empresa no Google + processo de avaliação | Dono | 1–2 h |
| P3 | Deduplicar o `<title>` da PDP | Código | pequeno |
| P4 | 301 do alias preservando `/api/*` | Código | pequeno |
| P5 | Fila de texto no painel + `ACCESSORIES` no n8n + revisar 10 textos | Código + processo | médio |
| P6 | Nomenclatura de motos | Decisão | uma conversa |
