# Plano de Aquisição Digital — Motors Store

### Seminovos • Bacacheri, Curitiba/PR • SEO \+ Google Ads \+ GA4/GTM

**Versão 2.0 — 24/08/2026** *(revisada após auditoria do site)* · Auditoria da conta Google Ads `830-658-0678` **e** do site `motorsstore.com.br`

> **Domínio canônico:** `https://motorsstore.com.br` (sem `www` — confirmado pela tag canonical do próprio site). **GA4 já instalado:** `G-CZ4B4RYF61` (via gtag.js direto, sem GTM). **Meta Pixel** também presente.

---

## 0\. Sumário Executivo e Diagnóstico da Conta

### 0.1 Auditoria da conta atual (lida diretamente na conta `830-658-0678`)

| Item verificado | Situação encontrada | Severidade |
| :---- | :---- | :---- |
| Campanhas ativas | **Nenhuma.** 1 campanha (`Motors Store`, Performance Max) **pausada** | 🔴 Crítico |
| Status dos grupos de recursos | "Todos os grupos de recursos em revisão" | 🟠 Alto |
| Orçamento | **R$ 15,10/dia** (≈ R$ 453/mês) | 🔴 Crítico |
| Estratégia de lances | **Maximizar conversões** | 🔴 Crítico |
| Ações de conversão | **Nenhuma meta configurada** ("Você não está medindo nenhuma meta aqui no momento") | 🔴 Crítico |
| Histórico de dados | 0 impressões, 0 cliques, 0 conversões, R$ 0,00 de custo | — |
| Pontuação de otimização | — (sem dados) | — |
| Conta antiga | Existe uma conta `654-359-7123` "Motors Store" **fechada** | 🟡 Médio |

### 0.2 Os 5 erros estruturais que precisam ser corrigidos ANTES de ativar qualquer verba

1. **PMax com "Maximizar conversões" e zero ações de conversão.** É o erro mais caro do setup atual. Sem sinal de conversão, o algoritmo não tem função-objetivo: ele otimiza para um evento que não existe e entrega tráfego aleatório (majoritariamente Display/YouTube barato). **Nada deve ser ativado antes da Seção 4 (GA4/GTM) estar concluída e com pelo menos 15 conversões/semana registradas.**  
2. **PMax como primeira campanha.** PMax é uma campanha de *escala*, não de *descoberta*. Sem histórico de conversão, sem público-alvo próprio e sem feed, ela é uma caixa-preta. A entrada correta é **Pesquisa (Search) com termos de fundo de funil**, que já têm intenção declarada.  
3. **Orçamento incompatível.** R$ 15,10/dia não sustenta PMax (que precisa distribuir verba entre 5+ inventários). Em Curitiba, o CPC de termos de seminovos com intenção comercial roda tipicamente na faixa de R$ 2,50–R$ 7,00. Com R$ 15/dia você compra de 2 a 6 cliques diários — estatisticamente insuficiente para qualquer aprendizado de máquina.  
4. **Conta antiga fechada.** Se a conta `654-359-7123` tiver histórico relevante (conversões, públicos, listas de negativas), avalie reativá-la em vez de partir do zero — histórico de qualidade é ativo. Se não tiver, mantenha a nova e **renomeie a conta atual** para "Motors Store — Seminovos Curitiba" (hoje ela aparece como "Conta do Google Ads", sem nome).  
5. **Sem Perfil de Empresa vinculado nem Merchant Center.** Sem isso não há extensão de local, não há campanha de Máximo Desempenho para Metas de Loja Física e não há remarketing dinâmico de estoque.

### 0.3 Descoberta crítica de viabilidade: **Vehicle Ads NÃO está disponível no Brasil**

> Verificado na documentação oficial do Google (agosto/2026): os **anúncios de veículos (Vehicle Listing Ads)** estão em **disponibilidade total apenas em Austrália, Canadá, Japão e Estados Unidos**, e em **beta aberto na Alemanha, Espanha, França, Itália, Países Baixos e Reino Unido**. Os **feeds de veículos em anúncios de pesquisa** estão disponíveis **somente nos EUA**. **O Brasil não consta em nenhuma das listas.**

Isso invalida a rota "Merchant Center \+ feed de veículos" que a maioria dos playbooks importados recomenda. A Seção 3.4 traz a **arquitetura substitutiva homologada para o Brasil**: DSA sobre o estoque \+ PMax com feed de remarketing dinâmico do tipo *Personalizado* \+ Search por modelo.

### 0.4 Roadmap resumido

| Fase | Janela | Foco | Não fazer ainda |
| :---- | :---- | :---- | :---- |
| **Fase 0 — Fundação** | Semanas 1–2 | GTM \+ GA4 \+ conversões \+ GBP \+ schema \+ URLs | Não ligar mídia |
| **Fase 1 — Colheita** | Semanas 3–6 | Search fundo de funil \+ Local, lances em Maximizar cliques | Não usar PMax |
| **Fase 2 — Otimização** | Semanas 7–10 | Migrar para Maximizar conversões, negativação pesada, DSA | Não usar tCPA ainda |
| **Fase 3 — Escala** | Semanas 11+ | PMax com sinais próprios, tCPA, remarketing dinâmico | — |

### 0.5 Auditoria técnica do site `motorsstore.com.br` (lida em 24/08/2026)

O site está no ar, é moderno, tem estoque real (39 veículos), Car schema e até `llms.txt` para crawlers de IA — está **acima da média** do vertical. Mas tem três defeitos que anulam boa parte desse esforço.

#### 0.5.1 O que já está certo (não mexer)

| Item | Estado |
| :---- | :---- |
| Domínio canônico | ✅ `https://motorsstore.com.br` (sem `www`), canonical correto e autorreferente |
| Estrutura de URLs | ✅ `/carros/{marca}/{modelo}/{versão}/{slug-id}` — **excelente**, com ID no fim |
| Meta descriptions | ✅ Únicas, bem escritas e com os termos certos (laudo cautelar, procedência, garantia) |
| Schema `Car` | ✅ Presente nas fichas, com `mileageFromOdometer`, `vehicleTransmission`, `fuelType`, `color`, `offers` |
| Schema `BreadcrumbList` | ✅ Presente nas fichas |
| Schema `AutoDealer` | ✅ Presente na home, com `openingHoursSpecification` e `sameAs` |
| `robots.txt` \+ `sitemap.xml` | ✅ Ambos válidos; 50 URLs com `lastmod` real (15–22/08/2026) |
| `llms.txt` liberado para GPTBot/ClaudeBot/Google-Extended | ✅ Poucos concorrentes fazem isso — vantagem de AEO/GEO |
| GA4 | ✅ Instalado (`G-CZ4B4RYF61`) |
| Meta Pixel | ✅ Instalado |
| Cloudflare Turnstile no formulário | ✅ Antibot sem CAPTCHA hostil |

#### 0.5.2 🔴 Defeito nº 1 — **`<title>` idêntico em todas as páginas**

Home, `/estoque`, `/avaliacao` e todas as fichas de veículo retornam exatamente o mesmo título:

Motors Store | Fora da Curva

**Consequência:** o `<title>` é o campo de maior peso de relevância on-page. Com o site inteiro compartilhando um único título — que não contém "seminovos", "carros usados", "Curitiba" nem nome de modelo — **nenhuma página tem chance real de ranquear** para os termos comerciais da Seção 1.6. É como ter 50 vitrines com a mesma placa.

**Correção (maior prioridade do plano inteiro — Semana 1):** implementar títulos dinâmicos conforme a Seção 2.2.3. O impacto esperado é desproporcional ao esforço.

#### 0.5.3 🔴 Defeito nº 2 — **Não existem páginas de marca nem de modelo**

`https://motorsstore.com.br/carros/jeep/renegade` retorna **404**. As URLs de marca e modelo funcionam apenas como *segmentos de caminho* da ficha, não como páginas navegáveis.

**Consequência:** a autoridade do site fica presa em páginas efêmeras. Quando o Renegade é vendido, todo o sinal acumulado morre com a URL. Não há onde ranquear para `renegade usado curitiba` — que é exatamente o cluster P0 de maior conversão.

**Correção:** criar hubs perenes (Seção 2.2.2). Não é migração — é **preenchimento de lacuna**, risco zero.

#### 0.5.4 🟠 Defeito nº 3 — **GA4 sem camada de eventos e sem GTM**

O `dataLayer` existe, mas contém apenas os pushes automáticos do gtag (`js`, `config`, `page_view`). **Não há nenhum evento de negócio:** clique em WhatsApp, envio de proposta, simulação de financiamento, clique para ligar — nada é medido. O `gtag.js` está hardcoded no código, então cada evento novo hoje exige deploy do dev.

**Consequência direta:** é a mesma causa-raiz da conta de Ads sem conversões. O Google Ads não tem o que importar porque o site não emite nada.

**Correção:** migrar para GTM (Seção 4.1.1) — passa o controle de tags para o marketing e destrava todo o restante do plano.

#### 0.5.5 Defeitos menores

| \# | Achado | Impacto | Correção |
| :---- | :---- | :---- | :---- |
| 1 | `<h1>` da ficha é só `Jeep Renegade` — sem versão, ano ou cidade | Médio | `Jeep Renegade S T270 1.3 Turbo 4x4 2022 — Curitiba` |
| 2 | `name` do schema `Car` vem duplicado: `"Jeep Renegade S T270 1.3 Tb 4x4 Flex Aut s t270 1.3 tb 4x4 flex aut"` | Médio | Corrigir a concatenação no template |
| 3 | `Car` sem `sku`, `bodyType`, `numberOfDoors`, `itemCondition` (nível raiz), `numberOfPreviousOwners`, `seller` | Médio | Seção 2.2.4 |
| 4 | `Offer` sem `seller`, `availableAtOrFrom` e `priceValidUntil` | Médio | Ligar ao `@id` do `AutoDealer` |
| 5 | `/estoque` sem schema `ItemList` | Médio | Seção 2.2.4 (c) |
| 6 | `AutoDealer` só na home; ausente nas fichas e páginas internas | Baixo | Replicar por `@id` |
| 7 | `AutoDealer` sem `geo`, `priceRange`, `areaServed`, `paymentAccepted` | Baixo | Seção 2.2.4 (a) |
| 8 | Sitemap com 50 URLs e sem divisão por tipo | Baixo | Sitemap index (Seção 2.2.5) |
| 9 | Sem páginas geo (`/seminovos-bacacheri` etc.) | Médio | Seção 2.2.2 |
| 10 | Sem `FAQPage` em nenhuma página | Baixo | Seção 2.2.4 (e) |

#### 0.5.6 🔴 NAP divergente entre canais — **corrigir antes de qualquer ação de SEO local**

Foram encontrados **dois endereços e dois telefones diferentes** para a Motors Store:

| Origem | Endereço | Telefone |
| :---- | :---- | :---- |
| **Site (schema \+ links de WhatsApp)** | Rua Ernesto Piazzetta, 98 — Bacacheri, 82510-350 | (41) 99737-2165 |
| **Perfil Mobiauto** | Rua Canadá, 1250 — Bacacheri, 82510-290 | (41) 99842-6127 |

**Decisão adotada neste plano:** ambos são válidos, e a **Rua Ernesto Piazzetta, 98 é a unidade principal**. Todo o plano usa esse NAP como canônico. Ver Seção 2.1.2 para o tratamento de dois locais (matriz \+ filial) no GBP, no schema e no Google Ads.

---

## 1\. Inteligência de Mercado & Comportamento Local (Curitiba e RMC)

### 1.1 Cenário da demanda

**Números nacionais verificados (use-os como denominador, não como promessa):**

| Indicador | Valor | Período | Fonte |
| :---- | :---- | :---- | :---- |
| Vendas de seminovos/usados — 1º tri | 4.378.062 un. (jan 1.340.333 / fev 1.363.383 / mar 1.674.346) | 1T/2026 | Fenauto via Infocar |
| Emplacamentos de novos — 1º tri | ≈ 1,25 milhão un. (jan 366.713 / fev 374.931 / mar 513.099) | 1T/2026 | Fenabrave via Infocar |
| Crescimento de março vs. março/2025 (novos) | \+35,3% | mar/2026 | Fenabrave via Infocar |
| **Ticket médio nacional do usado** | **R$ 90.082** — maior do ano | mai/2026 | Estudo Megadealer PVU (dados Auto Avaliar) |
| Volume de avaliações vs. mai/2025 | \+22,6% | mai/2026 | Megadealer PVU |
| Captações vs. mai/2025 | \+15,56% | mai/2026 | Megadealer PVU |

**Leitura estratégica:** a razão usados/novos no 1T/2026 é de **≈ 3,5 usados para cada 1 novo**. O mercado de seminovos não é um mercado secundário — é o mercado principal em volume. E o ticket médio subindo para a casa dos R$ 90 mil significa que **a decisão de compra está mais longa, mais pesquisada e mais dependente de financiamento**. Isso muda a estratégia de mídia: o clique não converte em venda no mesmo dia; converte em *lead* que amadurece em 7–30 dias. Toda a modelagem de atribuição (Seção 4.5) precisa refletir isso.

> ⚠️ **Dados de Curitiba/PR especificamente:** não há série pública gratuita e atualizada de emplacamentos de usados por município. Os números municipais de referência devem ser obtidos com o **Sindicato dos Revendedores de Veículos do Paraná (Sindivel/PR)** e no **Detran-PR (Estatísticas de Transferências de Propriedade por município)** — a transferência de propriedade é o proxy oficial de "venda de usado". Recomendo puxar a série mensal de transferências de Curitiba \+ Região Metropolitana dos últimos 24 meses antes de definir metas de volume.

### 1.2 Giro de estoque — o KPI que amarra mídia e operação

O erro clássico é tratar mídia e estoque como áreas separadas. Em revenda de seminovos, **verba de mídia deve ser alocada por unidade de estoque, não por campanha**.

Giro de estoque (vezes/período) \= Custo dos veículos vendidos ÷ Estoque médio (valor)

Tempo médio de estoque (dias)   \= 30 ÷ Giro mensal

Custo de carregamento diário    \= (valor do veículo × custo de capital mensal ÷ 30\) \+ custo fixo/dia de pátio

**Referências operacionais de mercado para multimarcas:**

| Faixa de tempo em estoque | Classificação | Ação de mídia recomendada |
| :---- | :---- | :---- |
| 0–30 dias | Saudável | Mídia padrão; não superinvestir (vende sozinho) |
| 31–60 dias | Atenção | Entrar no grupo de anúncios de modelo específico \+ remarketing dinâmico |
| 61–90 dias | Encalhe | Verba reforçada \+ reprecificação \+ destaque na home \+ campanha de oferta |
| 90+ dias | Perda de margem | Repasse/atacado; **retirar de mídia paga** — cada dia extra come a margem |

**Regra prática de alocação:** monte no GA4/Looker um relatório de "veículos com mais de 45 dias" e sincronize com uma **etiqueta de campanha** (`label:encalhe_45d`) nos grupos de anúncios de modelo. Reveja semanalmente.

### 1.3 Ticket médio e mix de estoque para Curitiba

Com estoque atual de \~40 veículos na faixa **R$ 23.900 a R$ 318.900** (observado nos portais), a Motors Store opera num espectro amplo demais para uma estratégia única de mídia. Segmente em três faixas com CPL-alvo distintos:

| Faixa | Ticket | Perfil de comprador | CPL-alvo sugerido¹ | Peso de verba sugerido |
| :---- | :---- | :---- | :---- | :---- |
| **Entrada** | até R$ 60 mil | 1º carro, troca de usado antigo, dependente de financiamento longo | R$ 25–45 | 30% |
| **Core** | R$ 60–130 mil | Família, troca com entrada, SUV compacto | R$ 40–70 | 50% |
| **Premium** | R$ 130 mil+ | Baixo volume, alta margem, ciclo longo, exige prova de procedência | R$ 90–180 | 20% |

¹ *CPL-alvo \= valores de referência de partida para o mercado automotivo local. Devem ser recalibrados após 60 dias com dados reais da conta — a fórmula está na Seção 3.7.*

**Fórmula de sanidade antes de definir qualquer tCPA:**

CPL máximo aceitável \= Margem bruta média por veículo × Taxa de conversão Lead→Venda × (1 − % da margem destinada a mídia... invertido)

Exemplo aplicado (substitua pelos seus números reais):

  Margem bruta média por unidade .......... R$ 7.000

  Taxa Lead→Venda ......................... 6%

  Receita bruta por lead .................. R$ 7.000 × 0,06 \= R$ 420

  Teto de mídia (25% da margem) ........... R$ 420 × 0,25 \= R$ 105

  → CPA máximo por LEAD QUALIFICADO ....... R$ 105

⚠️ Esse cálculo só funciona se o CRM devolver a taxa Lead→Venda real. Sem importação de conversões offline (Seção 4.6), você estará otimizando para o lead mais barato, não para o lead que vende.

### 1.4 Comportamento do consumidor paranaense

O comprador de seminovo em Curitiba tem três traços que diferenciam a comunicação local:

**a) Obsessão documentada com procedência.** Curitiba tem um ecossistema denso e maduro de perícia cautelar independente (IBPA, DEKRA, Terceira Visão, Super Visão Marechal, entre outras). Isso significa que **o comprador local sabe o que é laudo cautelar e vai perguntar** — muitos já vão à loja com o orçamento da vistoria na mão. Consequência prática:

- Transforme isso de objeção em ativo: **"Todo carro já sai com laudo cautelar aprovado"** é o diferencial de maior impacto de conversão nessa praça.  
- Se a loja não faz laudo em todo o estoque, faça pelo menos nos veículos acima do ticket core e **exiba o número do laudo na ficha do veículo**.  
- Nunca use o termo genérico "carro revisado". O termo com peso local é **"periciado"**, **"laudo cautelar aprovado"**, **"procedência verificada"**.

**b) Sensibilidade a financiamento e troca acima da média.** Com ticket médio nacional em R$ 90 mil, a variável decisiva raramente é o preço à vista — é **valor da parcela** e **quanto vale meu carro na troca**. Duas consequências para mídia:

- Uma landing de **"Avaliamos seu usado em 30 minutos"** costuma ter CPL substancialmente menor que uma landing de venda, e alimenta as duas pontas do negócio (captação de estoque \+ venda).  
- Copies com parcela (`"Entrada + 48x"`) performam melhor que copies com preço cheio — **mas atenção à conformidade**: anúncio com valor de parcela exige, pela regulação de publicidade de crédito, exibição de CET, quantidade de parcelas e valor total. Coloque isso na landing, não no anúncio, e no anúncio use "consulte condições".

**c) Comportamento geográfico de bairro.** Curitibano pesquisa por bairro e por eixo viário, não por "cidade". Isso é raro em outras praças e é a maior oportunidade de SEO local aqui.

### 1.5 Mapa competitivo por polo automotivo

| Polo | Perfil dominante | Nível de disputa em Ads | Oportunidade para a Motors Store |
| :---- | :---- | :---- | :---- |
| **Av. Mal. Floriano Peixoto** | Polo histórico de multimarcas \+ locadoras (Movida, Unidas, Localiza Seminovos). Altíssima densidade. | 🔴 Muito alto — CPC inflado por locadoras com verba nacional | **Não disputar de frente.** Usar apenas em campanha de conquista (Seção 3.5) com copy de contraste: atendimento consultivo vs. balcão de locadora |
| **Bacacheri / Linha Verde / Av. Paraná** | Concessionárias de marca, seminovos de grupo (Barigüi, Servopa, Metrosul) e multimarcas de bairro | 🟠 Médio-alto | 🎯 **Território natural.** Aqui a Motors Store tem vantagem de localização real (Rua Canadá, 1250). Dominar SEO local \+ Search geolocalizada |
| **Tarumã / Boa Vista / Atuba** | Multimarcas de médio porte, forte tráfego de passagem | 🟡 Médio | Expansão natural do raio — mesma região administrativa, 5–10 min de deslocamento |
| **RMC (São José dos Pinhais, Colombo, Pinhais, Almirante Tamandaré)** | Estoque mais barato, comprador disposto a deslocar por preço | 🟢 Baixo-médio | 🎯 **Melhor custo-benefício de aquisição.** CPC mais baixo, menos concorrência, e o comprador da RMC já se desloca a Curitiba |

**Recomendação de raio geográfico (Fase 1):**

Raio primário   → 8 km do endereço (Rua Canadá, 1250\) ....... ajuste de lance \+20%

Raio secundário → Curitiba (município inteiro) .............. ajuste base 0%

Raio terciário  → Pinhais, Colombo, São José dos Pinhais,

                  Almirante Tamandaré, Araucária, Piraquara .. ajuste de lance −15% (Fase 2\)

Excluir         → resto do Paraná e demais estados

### 1.6 Termos com forte intenção regional (mapa de intenção)

> ⚠️ **Sobre volumes:** a tabela abaixo classifica por **intenção e prioridade estratégica** — nenhum volume medido entrou na montagem dela. A validação sai do **Planejador de Palavras-Chave** do Google Ads, de graça, dentro da própria conta `830-658-0678`, e precisa acontecer **antes do go-live** (Semana 2 do §5.1): *Ferramentas → Planejamento → Planejador de palavras-chave* → "Descobrir novas palavras-chave", com **localização travada em Curitiba/PR** — ou nos raios do §1.5, para separar o 8 km do município inteiro — e idioma **Português**.
>
> **Ressalva que muda a leitura do número:** com a conta **sem veiculação ativa** — que é o estado de hoje (§0.1) — o Planejador devolve **faixas largas** ("100 – 1 mil", "1 mil – 10 mil"), não média mensal. Com campanha rodando as faixas ficam bem mais estreitas, mas ainda são faixas. Por isso esta validação **não termina na Semana 2**: repita na Semana 6, já com a Fase 1 no ar, antes de dimensionar a Fase 2. Faixa larga basta para ordenar cluster e para decidir se um termo merece campanha própria; **não** basta para projetar lead nem receita, e nenhum número deste plano deve ser recalculado em cima dela.
>
> **Contorno enquanto a conta não gasta:** na aba **Previsões**, com um lance de CPC máximo deliberadamente alto, o Planejador estima impressões para o termo — e impressão projetada é um proxy de volume mais fino que a faixa. Serve para desempatar dois termos dentro do mesmo cluster; não vira número de plano.
>
> **Isto está automatizado:** `conteudo-seo/planejador.js` puxa os mesmos números pela Google Ads API, com os termos deste cluster gerados a partir do estoque real — nada de `[modelo]` como placeholder. Comece por `node conteudo-seo/planejador.js --conferir`, que diz exatamente o que ainda falta configurar. **Atenção ao pré-requisito que não é código:** a API exige um **token de desenvolvedor**, que só sai de uma conta **administradora (MCC)** e passa por aprovação do Google — a `830-658-0678` é conta comum. Sem esse token, só resta a interface.

| Cluster | Termos representativos | Intenção | Prioridade |
| :---- | :---- | :---- | :---- |
| **Geo-comercial** | `seminovos curitiba`, `carros usados curitiba`, `loja de carros curitiba`, `revenda de carros curitiba` | Comercial alta | 🔴 P0 |
| **Hiperlocal (bairro)** | `seminovos bacacheri`, `carros usados bacacheri`, `loja de carros bairro bacacheri`, `seminovos boa vista curitiba`, `carros usados atuba` | Comercial altíssima, baixo volume, baixo CPC | 🔴 P0 — melhor ROI da conta |
| **Modelo \+ geo** | `[modelo] usado curitiba`, `[modelo] seminovo curitiba`, `comprar [modelo] curitiba` | Transacional | 🔴 P0 |
| **Categoria \+ geo** | `suv seminovo curitiba`, `carro automático usado curitiba`, `hatch usado curitiba`, `picape usada curitiba` | Comercial média | 🟠 P1 |
| **Financiamento** | `financiamento de carro usado curitiba`, `carro usado sem entrada curitiba`, `carro parcelado curitiba`, `financiar carro nome sujo curitiba` | Comercial, alto volume, **qualificação irregular** | 🟠 P1 — exigir negativação forte |
| **Compra/avaliação (captação)** | `quem compra carro usado curitiba`, `vender meu carro curitiba`, `avaliação de carro curitiba`, `loja que compra carro curitiba` | Transacional (outro lado do negócio) | 🔴 P0 — campanha separada |
| **Confiança/procedência** | `carro periciado curitiba`, `seminovo com garantia curitiba`, `loja de carros confiável curitiba` | Comercial alta, baixíssimo volume | 🟡 P2 — ótimo para SEO, fraco para Ads |
| **Navegacional concorrente** | nomes de multimarcas e grupos locais | Conquista | 🟡 P2 — só na Fase 3 |

---

## 2\. Estratégia Completa de SEO (Orgânico e Local)

### 2.1 SEO Local — Google Perfil de Empresa (GBP)

O GBP é o ativo de maior retorno para uma loja física de seminovos: ele responde à busca "perto de mim", alimenta o Google Maps e é pré-requisito para as extensões de local no Ads.

#### 2.1.1 Categorias

| Tipo | Categoria | Por quê |
| :---- | :---- | :---- |
| **Primária** | `Revendedor de carros usados` | Termo exato do vertical; é o que aciona o pacote local para `seminovos curitiba` |
| Secundária 1 | `Concessionária de veículos` | Captura buscas genéricas de "concessionária" |
| Secundária 2 | `Loja de automóveis` | Cobertura de sinônimo |
| Secundária 3 | `Serviço de financiamento de automóveis` | Ativa buscas de financiamento local |
| Secundária 4 | `Avaliador de veículos` *(se aplicável)* | Alimenta o funil de captação de estoque |

> ⚠️ Não adicione categorias que a loja não executa de fato (ex.: "oficina mecânica" se não há oficina). Categoria inflada gera denúncia de concorrente e suspensão de perfil — risco real e comum nessa vertical em Curitiba.

#### 2.1.2 NAP Consistency — dois locais, uma hierarquia clara

A auditoria (§0.5.6) encontrou dois endereços ativos. Com dois locais, a regra muda: **cada unidade precisa do próprio perfil GBP e do próprio `@id` no schema** — mas com uma matriz claramente definida, senão os dois perfis competem entre si e diluem os sinais.

**NAP canônico — Unidade Principal (matriz):**

Nome:      Motors Store

Endereço:  Rua Ernesto Piazzetta, 98 — Bacacheri, Curitiba — PR, 82510-350

Telefone:  (41) 99737-2165   ·   WhatsApp: https://wa.me/5541997372165

Site:      https://motorsstore.com.br/

**NAP — Unidade 2 (filial):**

Nome:      Motors Store — Rua Canadá     ← ver regra de nomenclatura abaixo

Endereço:  Rua Canadá, 1250 — Bacacheri, Curitiba — PR, 82510-290

Telefone:  (41) 99842-6127

Site:      https://motorsstore.com.br/unidades/rua-canada

**Regras de ferro para operação com dois locais:**

1. **Nomes distintos no GBP.** Dois perfis com o nome idêntico "Motors Store" no mesmo bairro é o padrão que dispara verificação e suspensão. Use `Motors Store` (matriz) e `Motors Store — Rua Canadá` (filial). O sufixo deve ser o **nome da rua**, nunca uma palavra-chave ("Motors Store Seminovos" \= suspensão).  
2. **Uma página no site por unidade.** Cada perfil GBP precisa apontar para uma **URL própria** (`/unidades/ernesto-piazzetta` e `/unidades/rua-canada`), com endereço, mapa embutido, horário, fotos daquela loja e o telefone daquela loja. Dois perfis apontando para a mesma home é sinal de duplicidade.  
3. **Um `LocalBusiness`/`AutoDealer` por unidade no schema**, cada um com seu `@id` (§2.2.4a). A home referencia a matriz.  
4. **Telefone: nunca cruzar.** O WhatsApp do site (hoje `5541997372165`) é o da matriz. Se a filial atende, ela precisa do próprio link — e o evento `click_whatsapp` deve carregar `store_id` para você saber qual unidade gerou o lead (§4.2.3).  
5. **Padronização de escrita** em todos os canais: "Rua" (não "R."), número sem "nº", CEP com hífen, "Curitiba — PR".

**Auditoria de citações (Semana 1):** hoje o Mobiauto exibe o NAP da filial **e estoque zerado**, enquanto o site e o Chaves na Mão mostram \~39–40 veículos. Monte a planilha `portal · URL do perfil · NAP exibido · unidade · estoque sincronizado? · status` e corrija cada linha. Portais para cobrir: Webmotors, iCarros, OLX Autos, Mobiauto, Chaves na Mão, Napista, Usadosbr, Apontador, Foursquare, Bing Places, Apple Business Connect.

#### 2.1.3 Catálogo de produtos no GBP

O GBP permite cadastrar produtos. Para seminovos, **não cadastre veículo por veículo** (o estoque gira e o perfil fica cheio de item vendido, o que gera avaliação negativa). Cadastre **categorias comerciais**:

| Produto no GBP | Descrição (resumo) | URL de destino |
| :---- | :---- | :---- |
| SUVs Seminovos | "SUVs seminovos periciados, com garantia e laudo cautelar. Financiamento e troca." | `/estoque/suv` |
| Hatchs e Sedans | "Carros de entrada e médios, revisados e com procedência verificada." | `/estoque/hatch` |
| Picapes Seminovas | "Picapes seminovas com histórico verificado." | `/estoque/picape` |
| Avaliação do seu usado | "Avaliamos seu carro em até 30 minutos. Troca com troco." | `/avaliacao` |
| Financiamento | "Simulação em até 60x. Aprovação rápida com múltiplos bancos." | `/financiamento` |

#### 2.1.4 Estratégia de reviews locais

Reviews são o fator de ranqueamento local de maior peso depois de proximidade e relevância — e o de maior impacto em conversão nessa vertical.

**Meta operacional:** 8–12 avaliações novas/mês, nota agregada ≥ 4,6.

**Processo (transforme em SOP da loja):**

1. **Momento do pedido:** na entrega da chave, não na assinatura do contrato. O pico emocional é a entrega.  
2. **Como pedir:** QR code impresso no cartão de entrega \+ link curto enviado por WhatsApp 2h depois. Use o link direto de review do GBP (`https://g.page/r/[ID]/review`).  
3. **Palavras-chave nas reviews:** você não pode ditar o texto, mas pode *sugerir o tema*: "se puder, conta qual carro levou e como foi a parte da vistoria/laudo". Reviews que mencionam **modelo \+ bairro \+ laudo** aumentam a relevância semântica do perfil.  
4. **Resposta a 100% das avaliações em até 24h.** Na resposta, use naturalmente os termos locais: *"Obrigado, Carlos\! Ficamos felizes que o Compass tenha atendido. Estamos aqui no Bacacheri sempre que precisar."*  
5. **Avaliações negativas:** responda publicamente com fatos e ofereça canal privado. Nunca discuta. Uma resposta madura a uma nota 2 converte mais que dez notas 5 silenciosas.

#### 2.1.5 Georreferenciamento e sinais de proximidade

- **Pin do Maps:** confirme, **em cada uma das duas unidades**, que o marcador cai exatamente na entrada da loja (Rua Ernesto Piazzetta, 98 e Rua Canadá, 1250\) — não no meio da quadra. Ajuste manualmente se necessário.  
- **Área de serviço:** para loja física com atendimento no local, **não** configure "área de serviço" (isso oculta o endereço e derruba o ranqueamento por proximidade).  
- **Posts do GBP:** 2 por semana. Alternar entre "Novidade" (veículo que entrou no estoque) e "Oferta" (condição de financiamento). Cada post com UTM próprio (Seção 4.7).  
- **Fotos:** mínimo 30 fotos, incluindo fachada (essencial para reconhecimento), showroom, equipe e veículos. Faça upload de 4–6 fotos novas por mês — perfis com atualização constante ranqueiam melhor.  
- **Geotag em fotos:** o Google remove EXIF no upload; geotagging de imagem é mito de SEO local. Invista o esforço em fotos da fachada com pontos de referência reconhecíveis do Bacacheri.  
- **Atributos:** ative "Aceita cartão", "Estacionamento no local", "Acessível para cadeirantes" (se verdadeiro), "Faz orçamento online".

### 2.2 SEO On-Page e Arquitetura para Estoque Rotativo

O desafio central do SEO de seminovos: **o estoque gira, as URLs morrem**. Com 39 veículos e giro de 45 dias, o site cria e destrói \~310 URLs por ano. Arquitetura errada aqui produz um site cheio de 404 e sem autoridade acumulada.

> **Ponto de partida real (§0.5):** as URLs de ficha do `motorsstore.com.br` já estão corretas e **não serão migradas**. Os problemas são outros dois: `<title>` duplicado no site inteiro e ausência total de páginas perenes de marca/modelo. Esta seção resolve os dois.

#### 2.2.1 Princípio arquitetural: a autoridade mora nas categorias, não nas fichas

O site já acerta a parte difícil — as URLs de ficha são limpas, hierárquicas e têm ID no fim. O que falta é a camada **perene** acima delas. Hoje o estoque inteiro pendura toda a autoridade em páginas que morrem quando o carro é vendido.

                  ┌────────────────────────────────────────┐

   FALTA CRIAR →  │  PÁGINAS PERENES                       │  ← acumulam autoridade

                  │  /estoque/{carroceria}                 │     nunca são deletadas

                  │  /carros/{marca}                       │

                  │  /carros/{marca}/{modelo}              │

                  │  /seminovos-{bairro}                   │

                  └────────────────────┬───────────────────┘

                                       │ link interno \+ ItemList

                  ┌────────────────────▼───────────────────┐

   JÁ EXISTE →    │  FICHAS (efêmeras) — MANTER COMO ESTÃO │  ← convertem, não ranqueiam

                  │  /carros/{marca}/{modelo}/{versão}/{slug-id}│  vendidas → 301

                  └────────────────────────────────────────┘

> ✅ **Decisão do projeto: manter a estrutura de URLs atual.** Nenhuma ficha existente será migrada. Tudo abaixo é **acréscimo**, não substituição — risco zero de perda de ranqueamento.

#### 2.2.2 Estrutura de URLs — o que existe e o que criar

**Já existe (manter intacto):**

| Página | URL | Situação |
| :---- | :---- | :---- |
| Home | `/` | ✅ OK |
| Hub de estoque | `/estoque` | ✅ OK — 39 veículos, filtros por marca/modelo/preço |
| Ficha do veículo | `/carros/{marca}/{modelo}/{versão}/{marca-modelo-versão-id}` | ✅ Excelente |
| Coleções temáticas | `/destaques/{tema}` (ex.: `baixa-quilometragem`, `pole-position-motors`) | ✅ OK |
| Avaliação | `/avaliacao` | ✅ OK |
| Consultoria | `/carro-perfeito` | ✅ OK |
| Institucional | `/sobre` · `/contato` · `/privacidade` | ✅ OK |

**Criar (a lacuna):**

| Página | URL a criar | Prioridade | Conteúdo mínimo |
| :---- | :---- | :---- | :---- |
| **Hub de marca** | `/carros/{marca}` — ex.: `/carros/jeep` | 🔴 P0 (hoje é **404**) | Listagem filtrada \+ 150–250 palavras sobre a marca no contexto de seminovos em Curitiba |
| **Hub de modelo** | `/carros/{marca}/{modelo}` — ex.: `/carros/jeep/renegade` | 🔴 P0 (hoje é **404**) | Listagem \+ versões, anos, faixa de preço, o que checar nesse modelo usado |
| Carroceria | `/estoque/suv` · `/estoque/sedan` · `/estoque/hatch` · `/estoque/picape` | 🟠 P1 | Listagem \+ texto de categoria |
| Faixa de preço | `/estoque/ate-100-mil` · `/estoque/100-a-200-mil` · `/estoque/acima-200-mil` | 🟠 P1 | Só as faixas com estoque recorrente |
| **Geo** | `/seminovos-bacacheri` · `/seminovos-curitiba` · `/seminovos-pinhais` | 🔴 P0 | **Máx. 6 páginas**, cada uma com conteúdo real: rota de acesso, referências do bairro, unidade que atende |
| Unidades | `/unidades/ernesto-piazzetta` · `/unidades/rua-canada` | 🔴 P0 | Exigido pela operação de dois locais (§2.1.2) |
| Financiamento | `/financiamento` | 🟠 P1 | Simulador \+ conteúdo; destino da campanha 05 |
| Vender meu carro | `/vendemos-seu-carro` | 🟡 P2 | Pode ser variação de `/avaliacao` com foco em "vender" |
| Garantia | `/garantia` | 🟡 P2 | Destino de sitelink; reforça o diferencial local |

**Regras de indexação:**

| Situação | Diretiva |
| :---- | :---- |
| Hubs perenes (marca, modelo, carroceria, geo) | `index, follow` \+ self-canonical |
| Fichas de veículo | `index, follow` \+ self-canonical ✅ *(já correto)* |
| Filtros com 1 parâmetro (`?marca=jeep`) | `noindex, follow` \+ canonical para o hub correspondente |
| Filtros com 2+ parâmetros | `noindex, follow` |
| Paginação (`/estoque?pagina=2`) | `index, follow` \+ **self-canonical** (nunca canonizar para a página 1\) |
| `/destaques/{tema}` | `index, follow` — são coleções curatoriais, têm valor próprio |

**Ciclo de vida da ficha vendida** (regra ainda mais importante agora que os hubs vão existir):

Veículo vendido

   ├─ Dia 0 a 30:  manter no ar com selo "VENDIDO" \+ bloco

   │               "veículos similares disponíveis"  (captura tráfego residual

   │               e o link interno mantém o hub de modelo aquecido)

   └─ Dia 31+:     301 → hub do MODELO  (/carros/jeep/renegade)

                   Se o modelo saiu de linha no estoque → 301 para o hub da MARCA

                   Se a marca também saiu → 301 para /estoque

                   NUNCA 301 para a home (o Google trata como soft-404)

> Sem os hubs de marca e modelo, esse fluxo não tem destino — hoje um Renegade vendido só poderia redirecionar para `/estoque`, perdendo toda a especificidade. **É por isso que criar os hubs é P0.**

**Sitemap:** substituir o arquivo único de 50 URLs por um sitemap index:

/sitemap.xml                    → index

  ├── /sitemap-estoque.xml      → fichas (regenerar a cada 6h)

  ├── /sitemap-hubs.xml         → marca, modelo, carroceria, faixa de preço

  ├── /sitemap-geo.xml          → páginas de bairro/cidade \+ unidades

  └── /sitemap-institucional.xml

#### 2.2.2b Registro de decisão — por que NÃO adotar `/carros/seminovos/curitiba/{marca}/…`

Alternativa avaliada em 24/08/2026 e **descartada**. Fica registrada para não ser rediscutida.

**Proposta:** `/carros/seminovos/curitiba/{marca}/{modelo}/{versão}/{slug-id}` **Decisão:** manter `/carros/{marca}/{modelo}/{versão}/{slug-id}`

| \# | Motivo | Peso |
| :---- | :---- | :---- |
| 1 | **O ganho é marginal.** Palavras na URL são um sinal fraco — a documentação do Google diz apenas que elas *"podem ajudar o Google a entender melhor a página"*. Quem carrega a relevância é o `<title>`, o `<h1>` e o conteúdo. E é justamente o `<title>` que está quebrado hoje (§0.5.2) | 🔴 Alto |
| 2 | **O custo é real e assimétrico.** Migrar exige 301 em todas as fichas vivas e no histórico já indexado, com perda temporária de posição, diluição de sinal na cadeia de redirect e espera de recrawl. O próprio Google recomenda *"use long-term, persistent URLs"* | 🔴 Alto |
| 3 | **`curitiba` na URL de cada veículo é frágil.** O site já anuncia entrega em todo o Brasil. Se abrir uma segunda praça ou reforçar a venda a distância, 100% das URLs de ficha passam a mentir — e aí a migração vira obrigatória, não opcional | 🔴 Alto |
| 4 | **`seminovos` também é frágil.** O estoque atual tem Camaro SS, BMW X4 M40i e Kia Bongo. Chamar tudo de "seminovo" no caminho da URL engessa a taxonomia justamente no segmento premium, que é o de maior margem | 🟠 Médio |
| 5 | **É redundante.** Numa revenda, `/carros/` já significa "carros à venda". `/carros/seminovos/` é pleonasmo de caminho e tem cheiro de *keyword stuffing* estrutural | 🟠 Médio |
| 6 | **Profundidade e comprimento.** Sai de 5 para 7 níveis; a URL de exemplo passaria de 95 para 114 caracteres, truncando na SERP e piorando o compartilhamento por WhatsApp — canal principal desta operação | 🟡 Baixo |
| 7 | **O breadcrumb da SERP não depende da URL.** Ele vem do `BreadcrumbList` (que o site já tem, §2.2.4d). Dá para exibir `Seminovos › Curitiba › Jeep › Renegade` na busca **sem tocar em uma única URL** | 🟡 Baixo |

**O que aproveitar da ideia (e é o ponto certo dela):** "seminovos" e "curitiba" *precisam* mesmo estar na arquitetura — só que como **páginas próprias**, não como segmentos do caminho de cada veículo. Uma palavra no path de 39 fichas não ranqueia; uma página dedicada, sim:

/seminovos-curitiba      ← ranqueia para "seminovos curitiba"   (P0)

/seminovos-bacacheri     ← ranqueia para "seminovos bacacheri"  (P0)

/estoque/suv             ← ranqueia para "suv seminovo curitiba"

/carros/jeep/renegade    ← ranqueia para "renegade usado curitiba"

> **Gatilho de reavaliação:** se a Motors Store abrir unidade em outra cidade, o padrão correto **não** é o proposto acima, e sim um prefixo de praça na raiz — `/curitiba/carros/{marca}/…`. Essa decisão se toma **no momento da expansão**, com o volume de URLs ainda pequeno, nunca antes.

#### 2.2.3 Metatags, títulos e headings

> 🔴 **Este é o item de maior impacto do plano inteiro.** Hoje as 50 páginas do site retornam o mesmo `<title>`: `Motors Store | Fora da Curva` (§0.5.2). As meta descriptions já são únicas e boas — só os títulos estão quebrados. Corrigir isso é uma alteração de template, não de arquitetura.

**Fórmulas por tipo de página** (aplicar como template dinâmico):

| Página | Title (≤ 60 car.) | Meta description (≤ 155 car.) | H1 |
| :---- | :---- | :---- | :---- |
| Home | `Seminovos Premium em Curitiba | Motors Store` | *(manter a atual — já está boa)* | `Fora da Curva` *(manter — é marca)* |
| `/estoque` | `Carros Seminovos em Curitiba — {N} Ofertas | Motors Store` | *(manter a atual — já está boa)* | `Carros seminovos em Curitiba — {N} no estoque` |
| Marca | `{Marca} Seminovo em Curitiba | Motors Store Bacacheri` | `{Marca} seminovos periciados em Curitiba. {N} unidades com laudo cautelar, garantia e financiamento. Loja no Bacacheri.` | `{Marca} seminovos em Curitiba` |
| Modelo | `{Modelo} Seminovo em Curitiba a partir de R$ {min}` | `{Marca} {Modelo} seminovo em Curitiba com laudo cautelar aprovado. {N} unidades, financiamento em até 60x. Veja fotos e ficha.` | `{Marca} {Modelo} seminovo em Curitiba` |
| Carroceria | `{Carroceria} Seminovo em Curitiba — {N} Ofertas | Motors Store` | `{Carroceria}s seminovas periciadas em Curitiba a partir de R$ {min}. Garantia, laudo cautelar e troca com troco.` | `{Carroceria}s seminovas em Curitiba` |
| **Ficha** | `{Modelo} {Versão} {Ano} — R$ {preço} | Motors Store` | *(manter as atuais — já são únicas e bem escritas)* | `{Marca} {Modelo} {Versão} {Ano} — Curitiba` |
| `/destaques/{tema}` | `{Tema} — Seminovos Selecionados em Curitiba | Motors Store` | `{N} veículos {tema} com procedência auditada e laudo cautelar. Curitiba, Bacacheri.` | `{Tema}` |
| Geo | `Seminovos no {Bairro}, Curitiba | Motors Store` | `Loja de carros seminovos no {Bairro}, Curitiba. Estoque periciado, avaliação do seu usado e financiamento. Rua Ernesto Piazzetta, 98.` | `Seminovos no {Bairro}` |
| Unidade | `Motors Store {Rua} — Bacacheri, Curitiba` | `Unidade Motors Store na {Rua}, Bacacheri. Horário, rota e estoque disponível nesta loja.` | `Motors Store — {Rua}` |
| `/avaliacao` | `Avaliação de Carro Usado em Curitiba | Motors Store` | *(manter a atual — já está boa)* | `Avaliação Express` *(manter)* |

**Exemplo aplicado** (veículo real do estoque hoje):

URL    /carros/jeep/renegade/s-t270-13-tb-4x4-flex-aut/jeep-renegade-s-t270-13-tb-4x4-flex-aut-7977579

Title  Jeep Renegade S T270 1.3 2022 — R$ 105.900 | Motors Store        (57 car.)

H1     Jeep Renegade S T270 1.3 Turbo 4x4 2022 — Curitiba

*(Hoje esse mesmo veículo tem title `Motors Store | Fora da Curva` e H1 `Jeep Renegade`.)*

**Estrutura de headings da ficha do veículo (a página que mais converte):**

\<h1\>Jeep Renegade S T270 1.3 Turbo 4x4 2022 — Curitiba\</h1\>

  \<h2\>Ficha técnica\</h2\>

  \<h2\>Itens e opcionais\</h2\>

  \<h2\>Procedência e laudo cautelar\</h2\>          \<\!-- diferencial local \--\>

  \<h2\>Monte sua parcela\</h2\>                      \<\!-- já existe no site, manter \--\>

  \<h2\>Avalie seu usado na troca\</h2\>

  \<h2\>Onde retirar: Motors Store — Bacacheri, Curitiba\</h2\>

  \<h2\>Também no seu perfil\</h2\>                   \<\!-- já existe, manter \--\>

  \<h2\>Perguntas frequentes sobre este veículo\</h2\> \<\!-- FAQPage schema \--\>

**Calda longa local — banco de 20 termos para distribuir em H2/H3 e conteúdo:**

`SUV seminovo periciado em Bacacheri Curitiba` · `carro seminovo com laudo cautelar Curitiba` · `Corolla usado automático Curitiba` · `loja de seminovos perto do Bacacheri` · `carro usado com garantia em Curitiba` · `seminovo financiado sem entrada Curitiba` · `troca com troco carro Curitiba` · `HR-V seminovo Curitiba Bacacheri` · `carro usado único dono Curitiba` · `seminovos Linha Verde Curitiba` · `melhor loja de seminovos do Bacacheri` · `carros seminovos até 60 mil Curitiba` · `SUV automático seminovo Curitiba` · `revenda que aceita carro na troca Curitiba` · `seminovos com IPVA pago Curitiba` · `picape seminova Curitiba` · `quem compra carro usado em Curitiba` · `avaliação de carro usado Bacacheri` · `carro seminovo revisado Curitiba` · `financiamento de seminovo em Curitiba aprovação rápida`

> **Regra anticanibalização:** cada termo deve ter **uma e apenas uma** página-alvo. Monte a planilha de mapeamento keyword → URL antes de escrever qualquer conteúdo.

#### 2.2.4 Schema Markup (JSON-LD)

> O site **já tem** `AutoDealer` na home e `Car` \+ `BreadcrumbList` nas fichas. Esta seção é sobre **completar e corrigir** o que existe — não recomeçar. Os campos marcados 🆕 são os que faltam hoje.

**a) `AutoDealer` — um por unidade (§2.1.2). Colocar na home, nas páginas de unidade e referenciar por `@id` nas demais:**

{

  "@context": "https://schema.org",

  "@type": "AutoDealer",

  "@id": "https://motorsstore.com.br/\#dealer-piazzetta",

  "name": "Motors Store",

  "url": "https://motorsstore.com.br",

  "logo": "https://motorsstore.com.br/logo.png",

  "image": \[

    "https://motorsstore.com.br/fachada-piazzetta.jpg",

    "https://motorsstore.com.br/showroom.jpg"

  \],

  "telephone": "+5541997372165",

  "priceRange": "R$$$$",

  "currenciesAccepted": "BRL",

  "paymentAccepted": "Dinheiro, Cartão de Crédito, Financiamento, Consórcio, Troca",

  "address": {

    "@type": "PostalAddress",

    "streetAddress": "Rua Ernesto Piazzetta, 98",

    "addressLocality": "Curitiba",

    "addressRegion": "PR",

    "postalCode": "82510-350",

    "addressCountry": "BR"

  },

  "geo": {

    "@type": "GeoCoordinates",

    "latitude": "SUBSTITUIR",

    "longitude": "SUBSTITUIR"

  },

  "areaServed": \[

    { "@type": "City", "name": "Curitiba" },

    { "@type": "City", "name": "Pinhais" },

    { "@type": "City", "name": "Colombo" },

    { "@type": "City", "name": "São José dos Pinhais" },

    { "@type": "City", "name": "Almirante Tamandaré" }

  \],

  "openingHoursSpecification": \[

    {

      "@type": "OpeningHoursSpecification",

      "dayOfWeek": \["Monday","Tuesday","Wednesday","Thursday","Friday"\],

      "opens": "08:30", "closes": "18:30"

    },

    {

      "@type": "OpeningHoursSpecification",

      "dayOfWeek": "Saturday",

      "opens": "08:30", "closes": "15:00"

    }

  \],

  "sameAs": \[

    "https://instagram.com/motorsstore.oficial",

    "https://facebook.com/motorsstore.oficial",

    "https://www.chavesnamao.com.br/revenda/motors-store/pr-curitiba/id-292906/",

    "https://www.mobiauto.com.br/comprar/estoque/motors-store-69363"

  \]

}

**Delta em relação ao que está no ar hoje:**

| Campo | Hoje | Ação |
| :---- | :---- | :---- |
| `@id` | ❌ ausente | 🆕 adicionar — sem ele, nada pode referenciar o dealer |
| `geo` | ❌ ausente | 🆕 adicionar coordenadas reais (Maps → botão direito no pin → copiar coordenadas) |
| `priceRange` | ❌ ausente | 🆕 adicionar |
| `paymentAccepted` / `currenciesAccepted` | ❌ ausente | 🆕 adicionar |
| `areaServed` | ❌ ausente | 🆕 adicionar (sinaliza a RMC) |
| `sameAs` | ⚠️ só Instagram e Facebook | Ampliar com os perfis de portal |
| Horário de sábado | ✅ 08:30–15:00 | Manter *(confirmar que bate com o GBP)* |
| Segunda unidade | ❌ ausente | 🆕 bloco idêntico com `@id: "#dealer-canada"` na página `/unidades/rua-canada` |

> ⚠️ **Não publique coordenadas aproximadas.** Divergência entre `geo`, o pin do GBP e o endereço textual é sinal negativo de SEO local. Pegue as coordenadas reais das duas unidades antes do deploy.

**b) Ficha do veículo — `Car`. O site já tem; faltam campos importantes:**

{

  "@context": "https://schema.org",

  "@type": "Car",

  "@id": "https://motorsstore.com.br/carros/jeep/renegade/s-t270-13-tb-4x4-flex-aut/jeep-renegade-s-t270-13-tb-4x4-flex-aut-7977579\#car",

  "name": "Jeep Renegade S T270 1.3 Turbo 4x4 Flex Automático 2022",

  "description": "Jeep Renegade S T270 1.3 turbo 2022, tração 4x4 e câmbio automático, cinza, 79.745 km, laudo cautelar aprovado.",

  "url": "https://motorsstore.com.br/carros/jeep/renegade/s-t270-13-tb-4x4-flex-aut/jeep-renegade-s-t270-13-tb-4x4-flex-aut-7977579",

  "image": \["https://s3.carro57.com.br/FC/9037/7947766\_0\_W\_e497489fd5.jpeg"\],

  "brand": { "@type": "Brand", "name": "Jeep" },

  "model": "Renegade",

  "vehicleConfiguration": "S T270 1.3 Turbo 4x4 Flex Aut",

  "sku": "7977579",

  "mpn": "7977579",

  "vehicleModelDate": 2022,

  "modelDate": "2022",

  "color": "Cinza",

  "bodyType": "SUV",

  "numberOfDoors": 5,

  "vehicleSeatingCapacity": 5,

  "vehicleTransmission": "AutomaticTransmission",

  "fuelType": "Flex",

  "driveWheelConfiguration": "https://schema.org/AllWheelDriveConfiguration",

  "vehicleEngine": {

    "@type": "EngineSpecification",

    "engineDisplacement": { "@type": "QuantitativeValue", "value": 1.3, "unitCode": "LTR" },

    "fuelType": "Flex"

  },

  "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 79745, "unitCode": "KMT" },

  "numberOfPreviousOwners": 1,

  "itemCondition": "https://schema.org/UsedCondition",

  "offers": {

    "@type": "Offer",

    "price": "105900.00",

    "priceCurrency": "BRL",

    "availability": "https://schema.org/InStock",

    "itemCondition": "https://schema.org/UsedCondition",

    "url": "https://motorsstore.com.br/carros/jeep/renegade/s-t270-13-tb-4x4-flex-aut/jeep-renegade-s-t270-13-tb-4x4-flex-aut-7977579",

    "priceValidUntil": "2026-12-31",

    "seller": { "@id": "https://motorsstore.com.br/\#dealer-piazzetta" },

    "availableAtOrFrom": { "@id": "https://motorsstore.com.br/\#dealer-piazzetta" }

  }

}

**Delta em relação ao que está no ar hoje:**

| Campo | Hoje | Ação |
| :---- | :---- | :---- |
| `name` | 🔴 `"Jeep Renegade S T270 1.3 Tb 4x4 Flex Aut s t270 1.3 tb 4x4 flex aut"` — **versão duplicada e em minúsculas** | Corrigir a concatenação no template |
| `vehicleTransmission` | ⚠️ `"Automático"` (texto livre) | Usar o enum do schema.org: `AutomaticTransmission` |
| `sku` / `mpn` | ❌ ausente | 🆕 usar o ID que já está na URL (`7977579`) |
| `bodyType` | ❌ ausente | 🆕 essencial para as páginas de carroceria e para as audiências do GA4 |
| `numberOfDoors`, `vehicleSeatingCapacity` | ❌ ausente | 🆕 adicionar |
| `itemCondition` (raiz) | ⚠️ só dentro de `offers` | 🆕 replicar no nível do `Car` |
| `numberOfPreviousOwners` | ❌ ausente | 🆕 adicionar quando conhecido — é diferencial de venda |
| `vehicleEngine` | ❌ ausente | 🆕 adicionar |
| `driveWheelConfiguration` | ❌ ausente | 🆕 relevante em SUV/picape 4x4 |
| `offers.seller` / `availableAtOrFrom` | ❌ ausente | 🆕 ligar ao `@id` do dealer — conecta o veículo à loja física |
| `offers.priceValidUntil` | ❌ ausente | 🆕 adicionar |
| `offers.price` | ⚠️ número (`105900`) | Usar string com 2 casas (`"105900.00"`) |
| `@id` | ❌ ausente | 🆕 adicionar |

**Quando o veículo for vendido**, altere apenas `availability` para `https://schema.org/SoldOut` — **não remova o schema** enquanto a página estiver no ar (dias 0–30 do ciclo da §2.2.2).

**c) `/estoque`, hubs de marca/modelo e `/destaques/{tema}` — `ItemList` 🆕 (hoje não existe nenhum schema nessas páginas):**

{

  "@context": "https://schema.org",

  "@type": "ItemList",

  "name": "SUVs seminovas em Curitiba",

  "numberOfItems": 12,

  "itemListElement": \[

    {

      "@type": "ListItem",

      "position": 1,

      "url": "https://motorsstore.com.br/carros/jeep/renegade/s-t270-13-tb-4x4-flex-aut/jeep-renegade-s-t270-13-tb-4x4-flex-aut-7977579"

    },

    {

      "@type": "ListItem",

      "position": 2,

      "url": "https://motorsstore.com.br/carros/bmw/x4/m40i-30-m-sport-edit-v6-turbo-aut/bmw-x4-m40i-30-m-sport-edit-v6-turbo-aut-7947766"

    }

  \]

}

**d) `BreadcrumbList`** — ✅ já existe nas fichas. 🆕 Estender para `/estoque`, hubs e `/destaques/{tema}`.

**e) `FAQPage`** 🆕 nas páginas de categoria, geo e unidades — 4 a 6 perguntas reais (financiamento, troca, laudo cautelar, garantia, entrega, rota de acesso). Não usar em ficha de veículo (rotatividade alta gera inconsistência).

**Validação obrigatória antes do deploy:** Rich Results Test (`search.google.com/test/rich-results`) \+ Schema Markup Validator (`validator.schema.org`). Depois do deploy, acompanhe o relatório de "Aprimoramentos" no Search Console.

#### 2.2.5 Checklist técnico complementar

| Item | Especificação |
| :---- | :---- |
| **Core Web Vitals** | LCP \< 2,5 s. Em site de estoque, o vilão é sempre a galeria de fotos: sirva WebP/AVIF, `loading="lazy"` em tudo abaixo da dobra, `fetchpriority="high"` só na 1ª foto |
| **Sitemap** | Sitemap index com arquivos separados: `sitemap-estoque.xml` (regenerado a cada 6h), `sitemap-categorias.xml`, `sitemap-conteudo.xml`. `<lastmod>` real, não a data de build |
| **robots.txt** | Bloquear `/*?ordenar=`, `/*?pagina=` só se houver duplicação real, `/busca`, `/carrinho`. **Nunca bloquear** `/carros/` |
| **Mobile** | 70%+ do tráfego automotivo é mobile. Botão de WhatsApp fixo, clique-para-ligar no topo, formulário com no máx. 4 campos |
| **hreflang** | Não aplicável (site monolíngue) |
| **HTTPS \+ HSTS** | Obrigatório. Formulário de financiamento coleta CPF — sem HTTPS há risco jurídico (LGPD) além de SEO |
| **Índice de páginas vendidas** | Monitorar mensalmente no Search Console o volume de 404 — se subir, o processo de 301 da Seção 2.2.2 não está sendo executado |

### 2.3 SEO Off-Page e Autoridade Local

Em SEO automotivo local, **citação consistente vale mais que backlink genérico**. A prioridade é NAP correto em muitos lugares, não DA alto em poucos.

#### 2.3.1 Camada 1 — Citações e diretórios (executar primeiro, 100% de cobertura)

| Categoria | Alvos | Prioridade |
| :---- | :---- | :---- |
| **Portais automotivos nacionais** | Webmotors, iCarros, OLX Autos, Mobiauto, Chaves na Mão, Usadosbr, Napista | 🔴 P0 |
| **Portais/marketplaces regionais** | Portais de classificados do Paraná e agregadores de revendas de Curitiba | 🟠 P1 |
| **Diretórios locais** | Google Perfil de Empresa, Bing Places, Apple Business Connect, Apontador, Guia Mais, Foursquare, Yelp Brasil | 🔴 P0 |
| **Institucionais** | Sindivel/PR (sindicato dos revendedores), ACP (Associação Comercial do Paraná), CDL Curitiba | 🟠 P1 — link institucional de alta confiança |
| **Redes sociais** | Instagram, Facebook, YouTube, TikTok, LinkedIn — todos com NAP idêntico na bio | 🔴 P0 |

> Já existe divergência de dados entre portais (estoque zerado no Mobiauto vs. 40 veículos no Chaves na Mão). **Auditoria de citações é a primeira tarefa off-page.** Monte uma planilha com: portal · URL do perfil · NAP exibido · status · data da última correção.

#### 2.3.2 Camada 2 — Link building local com conteúdo (o que realmente move a agulha)

Não compre links. Produza ativos que a imprensa e os sites locais de Curitiba naturalmente citam:

| Ativo | Formato | Quem linka |
| :---- | :---- | :---- |
| **Índice Motors Store de Seminovos em Curitiba** | Estudo trimestral com os 10 modelos mais procurados na loja, tempo médio de estoque e faixa de preço na praça | Portais de notícia locais (Bem Paraná, Gazeta do Povo, Tribuna), blogs automotivos |
| **Guia: como comprar seminovo em Curitiba sem cair em golpe** | Página perene, com passo a passo de laudo cautelar, consulta de multas no Detran-PR, checagem de leilão | Blogs de finanças pessoais, sites de vistoria, fóruns |
| **Comparativo de IPVA/licenciamento PR** | Calculadora simples de custo anual por modelo no Paraná | Sites de utilidade pública, portais de bairro |
| **Parcerias com o ecossistema local** | Página "Nossos parceiros de vistoria" linkando (e sendo linkada por) empresas de perícia cautelar de Curitiba, despachantes, seguradoras e oficinas de bairro | Troca natural, relevância temática e geográfica máxima |
| **Patrocínio local** | Time de futebol de várzea do Bacacheri, evento de carros antigos, associação de moradores | Sites de bairro e de eventos — links geograficamente hiper-relevantes |

**Cadência sugerida:** 1 ativo de conteúdo por mês \+ 4 ações de relacionamento/parceria por mês. Meta realista: **6–10 domínios referenciadores locais novos por trimestre**.

#### 2.3.3 O que NÃO fazer

- ❌ PBN, guest post em rede de blogs, compra de links em massa — em vertical local com concorrência que denuncia, o risco/retorno é péssimo.  
- ❌ Criar múltiplos perfis GBP no mesmo endereço (um por "marca" ou por vendedor). Suspensão garantida.  
- ❌ Páginas doorway por bairro (30 páginas iguais trocando "Bacacheri" por "Cabral"). Limite-se a 4–6 páginas geográficas **com conteúdo genuinamente diferente** (rota de acesso, referências do bairro, veículos disponíveis para aquela região).

---

## 3\. Configuração e Arquitetura Completa do Google Ads

### 3.1 Setup inicial da conta (fazer antes de qualquer campanha)

**Conta: `830-658-0678`**

| Configuração | Onde | Valor correto | Motivo |
| :---- | :---- | :---- | :---- |
| Nome da conta | Adm. → Preferências da conta | `Motors Store — Seminovos Curitiba` | Hoje está como "Conta do Google Ads" |
| Fuso horário | Adm. → Preferências | `(GMT-03:00) Brasília` ✅ *(já correto)* | Imutável depois — confira antes de gastar |
| Moeda | Adm. → Preferências | `BRL` | Imutável |
| Faturamento | Faturamento | Cartão \+ backup / boleto | Cartão recusado \= campanha pausada em pico de fim de mês |
| **Consentimento (LGPD)** | Adm. → Configurações de consentimento | Modo de consentimento v2 ativado | Obrigatório para modelagem de conversões |
| Rede de Pesquisa: **parceiros de pesquisa** | Nível de campanha | ❌ **Desativado** na Fase 1 | Qualidade irregular; reavaliar na Fase 3 com dados |
| Rede de Display em campanha de Search | Nível de campanha | ❌ **Desativado** sempre | Mistura métricas e destrói o CPA de Search |
| Idiomas | Nível de campanha | `Português` \+ `Todos os idiomas`¹ | ¹Muitos brasileiros usam Chrome em inglês; travar só em PT perde volume real |
| **Local: opções de segmentação** | Nível de campanha | `Presença: pessoas que estão ou frequentam regularmente os locais incluídos` | ⚠️ **Crítico.** O padrão ("interesse") faz você pagar por clique de alguém em Manaus pesquisando "carro em Curitiba" |
| Local: exclusão | Nível de campanha | Excluir "pessoas que demonstraram interesse" em locais fora do alvo | Reforça o item acima |
| Rotação de anúncios | Nível de campanha | `Otimizar` | Padrão correto com lances automáticos |
| Programação | Nível de campanha | Fase 1: 24/7 para coletar dados · Fase 2: ajustar por hora | Não corte horários sem dados |
| URL de acompanhamento | Adm. → Configurações da conta | `{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}&utm_term={keyword}&gad_source={network}&device={device}&matchtype={matchtype}` | Padroniza UTM sem tocar em cada anúncio |
| Vinculação com **Google Perfil de Empresa** | Ferramentas → Contas vinculadas | ✅ Vincular | Habilita extensão de local e Maps |
| Vinculação com **GA4** | Ferramentas → Contas vinculadas | ✅ Vincular | Importação de conversões e públicos |
| Vinculação com **Search Console** | Ferramentas → Contas vinculadas | ✅ Vincular | Relatório pago x orgânico |
| Vinculação com **Merchant Center** | Ferramentas → Contas vinculadas | ⚠️ **Não aplicável para veículos no BR** — ver 3.4 | Vehicle Ads indisponível no Brasil |

**Configurações de segurança da conta (frequentemente ignoradas):**

- Aplicação automática de recomendações: **desative todas**. O Google tende a aplicar "adicionar palavras-chave de correspondência ampla" e "atualizar para PMax" automaticamente, o que destrói estruturas enxutas.  
- Acesso: use e-mails nominais com nível "Padrão"; reserve "Administrador" para 1 pessoa.  
- Ative alertas de orçamento e de conversão zerada.

### 3.2 Estrutura de conta recomendada

CONTA: Motors Store — Seminovos Curitiba (830-658-0678)

│

├── 01 · SEARCH — Marca / Institucional              \[Orçamento baixo, defensivo\]

│    ├── AG: Marca Exata            → "motors store", "motors store curitiba"

│    └── AG: Marca \+ Erros de grafia→ "motor store curitiba", "motorstore bacacheri"

│

├── 02 · SEARCH — Seminovos Geo (Curitiba)           \[Carro-chefe\]

│    ├── AG: Seminovos Curitiba     → seminovos/carros usados \+ curitiba

│    ├── AG: Loja / Revenda         → loja de carros, revenda, multimarcas \+ curitiba

│    └── AG: Bacacheri & Bairros    → bacacheri, boa vista, atuba, tarumã, cabral

│

├── 03 · SEARCH — Modelos de Alto Giro               \[1 AG por modelo em estoque\]

│    ├── AG: Corolla Curitiba

│    ├── AG: HR-V Curitiba

│    ├── AG: Compass Curitiba

│    ├── AG: Onix Curitiba

│    └── AG: {modelo}…              → criado/pausado conforme o estoque

│

├── 04 · SEARCH — Categorias & Atributos             \[Meio de funil\]

│    ├── AG: SUV Seminovo

│    ├── AG: Automático

│    ├── AG: Faixa de Preço (até 50k / 50–100k)

│    └── AG: Picape / Hatch / Sedan

│

├── 05 · SEARCH — Financiamento & Troca              \[Alto volume, exige negativação\]

│    ├── AG: Financiamento Seminovo

│    └── AG: Troca / Entrada

│

├── 06 · SEARCH — COMPRA / AVALIAÇÃO (captação)      \[Outro lado do negócio\]

│    ├── AG: Vender Meu Carro

│    └── AG: Avaliação de Veículo

│

├── 07 · SEARCH — DSA (Anúncios Dinâmicos)           \[Fase 2 — cobre a cauda longa do estoque\]

│    └── Alvo: URLs em /carros/ e /estoque

│

├── 08 · LOCAL / Máx. Desempenho p/ Metas de Loja    \[Visitas presenciais \+ rotas\]

│

├── 09 · PMAX — Estoque                              \[Fase 3 — só com 30+ conv./mês\]

│    ├── Grupo de recursos: SUVs

│    ├── Grupo de recursos: Hatch/Sedan

│    └── Grupo de recursos: Premium

│

└── 10 · DISPLAY/VÍDEO — Remarketing Dinâmico        \[Fase 3\]

**Nomenclatura padrão** (facilita filtros, scripts e relatórios):

{ID}\_{TIPO}\_{TEMA}\_{GEO}\_{OBJETIVO}

Exemplos:

  02\_SEARCH\_Seminovos\_CWB\_Leads

  03\_SEARCH\_Corolla\_CWB\_Leads

  08\_LOCAL\_Loja\_Bacacheri\_Visitas

  09\_PMAX\_Estoque\_CWB\_Leads

Grupos de anúncios:  {TEMA}\_{MATCHTYPE}    →  Seminovos\_EXA / Seminovos\_FRA

### 3.3 Detalhamento das campanhas de Pesquisa

#### 3.3.1 Campanha `01 · Marca / Institucional`

| Parâmetro | Valor |
| :---- | :---- |
| Orçamento | R$ 10–15/dia (defensivo) |
| Lances | Parcela de impressões desejada — 90%, posição "qualquer lugar na página de resultados" |
| Correspondência | Exata \+ Frase |
| Negativas obrigatórias | `-trabalhe`, `-vaga`, `-emprego`, `-reclame aqui`, `-reclamação`, `-processo` |

**Por que investir em marca:** concorrentes locais e portais (OLX, Webmotors) dão lance no seu nome. Se alguém pesquisa "motors store curitiba" e o primeiro resultado é a Webmotors, você pagou o marketing de outro. CPC de marca é o mais barato da conta.

#### 3.3.2 Campanha `02 · Seminovos Geo (Curitiba)` — carro-chefe

| Parâmetro | Fase 1 | Fase 2 | Fase 3 |
| :---- | :---- | :---- | :---- |
| Orçamento/dia | R$ 60–80 | R$ 100–150 | R$ 150+ |
| Lances | Maximizar cliques com **teto de CPC de R$ 4,50** | Maximizar conversões | Maximizar conversões com tCPA |
| Correspondência | Exata \+ Frase | \+ Ampla com público-alvo (observação) | \+ Ampla |

**Palavras-chave prioritárias:**

\#\#\# AG: Seminovos Curitiba  (EXATA)

\[seminovos curitiba\]

\[carros seminovos curitiba\]

\[carros usados curitiba\]

\[seminovos em curitiba\]

\[carro usado curitiba\]

\[venda de carros usados curitiba\]

\#\#\# AG: Seminovos Curitiba  (FRASE)

"seminovos curitiba"

"carros seminovos em curitiba"

"comprar carro usado curitiba"

"carros usados e seminovos curitiba"

\#\#\# AG: Loja / Revenda  (EXATA)

\[loja de carros curitiba\]

\[loja de seminovos curitiba\]

\[revenda de carros curitiba\]

\[multimarcas curitiba\]

\[concessionaria de seminovos curitiba\]

\#\#\# AG: Bacacheri & Bairros  (EXATA \+ FRASE)  ← melhor CPA da conta

\[seminovos bacacheri\]

\[carros usados bacacheri\]

\[loja de carros bacacheri\]

"seminovos boa vista curitiba"

"carros usados atuba"

"loja de carros tarumã curitiba"

"seminovos cabral curitiba"

"loja de carros perto de mim"        ← \+ segmentação de raio de 8 km

#### 3.3.3 Campanha `03 · Modelos de Alto Giro`

**Regra de governança:** um grupo de anúncios por modelo, **ativado apenas enquanto houver ≥ 1 unidade do modelo em estoque**. Um clique em "Corolla Curitiba" que cai numa página sem Corolla é dinheiro queimado e nota de qualidade destruída.

Estrutura de keywords por modelo (substitua `{modelo}` e `{marca}`):

\[{modelo} usado curitiba\]

\[{modelo} seminovo curitiba\]

\[{marca} {modelo} usado curitiba\]

\[comprar {modelo} curitiba\]

"{modelo} {ano} curitiba"

"{modelo} automatico usado curitiba"

Destino: **sempre a página de modelo** (`/carros/toyota/corolla`), nunca a home nem a ficha individual (a ficha pode ser vendida a qualquer momento).

**Priorização de quais modelos merecem grupo próprio** — use esta matriz mensal:

| Critério | Peso |
| :---- | :---- |
| Nº de unidades do modelo em estoque | 30% |
| Dias médios em estoque desse modelo | 30% |
| Margem bruta média do modelo | 25% |
| Volume de busca do modelo \+ "curitiba" | 15% |

#### 3.3.4 Campanha `05 · Financiamento & Troca`

Esta é a campanha que mais **parece** boa e mais decepciona se mal configurada. Volume alto, intenção ambígua (muita gente com restrição de crédito, muita gente pesquisando taxa de banco).

**Mitigações obrigatórias:**

1. Correspondência **exata e frase apenas** — nunca ampla.  
2. Landing page dedicada com **pré-qualificação no formulário**: campo obrigatório "Você tem restrição no CPF? (sim/não)" e "Valor de entrada disponível". Isso derruba o volume de lead e sobe a taxa Lead→Venda.  
3. Conversão separada (`gerar_lead_financiamento`) com **valor menor** que a de proposta de veículo, para o algoritmo não canibalizar.  
4. Lista de negativas específica (Seção 3.6).

#### 3.3.5 Campanha `06 · Compra / Avaliação` (captação de estoque)

Frequentemente esquecida, é a de melhor economia unitária: o CPL costuma ser menor e o "lead" é um carro entrando no estoque com margem.

\[quem compra carro usado curitiba\]

\[vender meu carro curitiba\]

\[vender carro rapido curitiba\]

\[avaliacao de carro usado curitiba\]

\[loja que compra carro curitiba\]

\[compro seu carro curitiba\]

"quero vender meu carro curitiba"

"quanto vale meu carro curitiba"

Destino: `/avaliacao` com formulário de 4 campos (placa/modelo, ano, km, WhatsApp) e promessa de tempo ("resposta em até 30 minutos em horário comercial").

#### 3.3.6 Campanha `07 · DSA` (Fase 2\)

Cobre a cauda longa que você não consegue mapear manualmente (versões, anos, combinações).

- Fonte: **"Usar apenas URLs do meu feed de páginas"** ou "Categorias de páginas" limitado a `/carros/` e `/estoque`.  
- Excluir do alvo: `/blog/`, `/sobre`, `/contato`, `/vendidos`.  
- Sempre em campanha **separada** da Search manual, com orçamento próprio (R$ 25–40/dia) e a **lista mestre de negativas aplicada**.  
- Usar o relatório de "Categorias de destino" semanalmente para promover termos vencedores para a Search manual.

### 3.4 ⚠️ Vehicle Ads / PMax — a rota correta no Brasil

**O fato:** conforme a documentação oficial do Google verificada em agosto/2026, os anúncios de veículos estão disponíveis integralmente apenas em **Austrália, Canadá, Japão e EUA**, e em beta aberto em **Alemanha, Espanha, França, Itália, Países Baixos e Reino Unido**. Os **feeds de veículos em anúncios de pesquisa** estão disponíveis **somente nos EUA**. **O Brasil não está habilitado.**

**Implicação:** qualquer plano que dependa de "subir o feed de veículos no Merchant Center e rodar Vehicle Listing Ads" **não é executável no Brasil hoje**. Também não adianta cadastrar veículos como produtos no Merchant Center comum — a política do Shopping não permite listar automóveis como produtos.

#### Arquitetura substitutiva (o que realmente funciona no BR)

| Objetivo do Vehicle Ad | Substituto viável no Brasil | Como fazer |
| :---- | :---- | :---- |
| Mostrar o veículo certo para a busca certa | **DSA** \+ Search por modelo | Seções 3.3.3 e 3.3.6 |
| Anúncio com foto \+ preço \+ modelo | **Remarketing dinâmico** com feed **Personalizado** | Abaixo |
| Escala multicanal automática | **PMax sem feed**, com sinais de público próprios | Fase 3 |
| Visita à loja | **Máximo Desempenho para Metas de Loja Física** | Seção 3.5 |

**Feed de remarketing dinâmico — vertical `Personalizado`** (Ferramentas → Dados da empresa → Feeds de dados → Anúncios dinâmicos de display → Personalizado):

| Coluna do feed | Obrigatório | Conteúdo para veículo |
| :---- | :---- | :---- |
| `ID` | ✅ | ID interno do veículo (ex.: `45231`) — **precisa bater exatamente** com `dynx_itemid` do site |
| `Item title` | ✅ | `Toyota Corolla XEi 2.0 2021` |
| `Final URL` | ✅ | URL absoluta da ficha |
| `Image URL` | Recomendado | Foto principal, ≥ 600×314, sem moldura/texto sobreposto |
| `Item description` | Recomendado | `48.500 km · Automático · Único dono · Laudo aprovado` |
| `Price` | Recomendado | `112900.00 BRL` |
| `Item category` | Recomendado | `SUV` / `Sedan` / `Hatch` — usado para segmentar grupos de recursos |
| `Contextual keywords` | Opcional | `corolla usado curitiba, sedan automatico` |
| `Sale price` | Opcional | Preço promocional quando houver |

Atualização do feed: **automática, no mínimo 2× ao dia**, via URL agendada (não upload manual). Veículo vendido deve sair do feed em até 24h — anúncio de carro vendido é a principal causa de review negativa nessa vertical.

**Se e quando ativar PMax (Fase 3, não antes):**

| Configuração | Valor |
| :---- | :---- |
| Pré-requisito | ≥ 30 conversões/mês na conta, tracking validado, feed dinâmico ativo |
| Orçamento mínimo | ≥ 3× o tCPA-alvo por dia (ex.: tCPA R$ 80 → mínimo R$ 240/dia) |
| Expansão de URL final | ❌ **Desativar** (senão a PMax canibaliza a Search de marca e manda tráfego para páginas aleatórias) |
| Exclusão de marca | ✅ Adicionar lista de marca para não canibalizar a campanha 01 |
| Grupos de recursos | 1 por categoria (SUV / Hatch-Sedan / Premium), **nunca 1 só genérico** |
| Sinais de público | Listas próprias (leads, visitantes de ficha), dados do cliente, públicos personalizados por termo de busca |
| Segmentação de local | Presença, mesmos raios da Search |
| Exclusão de canais | Não é possível excluir canais na PMax — por isso ela só entra depois que Search está madura |

### 3.5 Campanha Local (Search \+ Maps \+ visitas)

**Tipo:** Máximo Desempenho para Metas de Loja Física (substituiu a antiga "Campanha Local").

| Parâmetro | Valor |
| :---- | :---- |
| Pré-requisito | GBP vinculado e verificado; local ativo na conta |
| Objetivo de conversão | Visitas à loja \+ Cliques em "Como chegar" \+ Ligações |
| Orçamento | R$ 30–50/dia |
| Raio | 8 km (primário) \+ Curitiba |
| Recursos | Logo, 5+ imagens da fachada e do showroom, 1 vídeo curto (15 s) do showroom, textos com endereço |
| Copy-chave | "Loja física no Bacacheri — Rua Canadá, 1250\. Venha ver o carro pessoalmente." |

**Ativos que mais influenciam visita à loja nessa vertical:** foto real da fachada (não render), foto do showroom com carros, e texto com ponto de referência do bairro.

> Nota: "visitas à loja" como conversão só é disponibilizada pelo Google quando a conta atinge volume mínimo de dados de localização. Não conte com essa métrica no início — use **"Cliques em como chegar"** e **"Cliques para ligar"** como proxy (Seção 4.4).

### 3.6 Palavras-chave negativas — lista mestre

Aplique como **lista de negativas compartilhada** (Ferramentas → Segmentação compartilhada → Listas de palavras-chave negativas), vinculada a **todas** as campanhas. Revise os termos de pesquisa semanalmente nas primeiras 8 semanas.

#### Lista A — `NEG_MASTER_Seminovos` (todas as campanhas)

\# \--- Gratuidade / pesquisa sem intenção \---

gratis, gratuito, de graca, doacao, doado, simulador gratis

\# \--- Emprego \---

vaga, vagas, emprego, empregos, trabalhe conosco, curriculo, salario,

consultor de vendas vaga, contrata, contratacao, estagio, cnh emprego

\# \--- Educação / DIY / conteúdo \---

como, o que e, o que significa, tutorial, curso, cursos, apostila, pdf,

significado, historia do, wikipedia, forum, blog, dicas de, aprenda

\# \--- Peças, serviços e pós-venda (não é o negócio) \---

peca, pecas, autopeca, autopecas, sucata, desmanche, ferro velho,

oficina, mecanico, funilaria, pintura, martelinho de ouro, polimento,

higienizacao, insulfilm, som automotivo, pneu, pneus, bateria,

retrovisor, farol, parachoque, revisao preco, troca de oleo, alinhamento

\# \--- Aluguel / assinatura / frota \---

aluguel, alugar, aluga, locadora, locacao, carro por assinatura,

assinatura de carro, leasing, motorista de aplicativo aluguel,

uber aluguel, 99 aluguel

\# \--- Leilão / sinistrado / batido \---

leilao, leiloes, leiloeiro, batido, sinistrado, recuperado, sucateado,

salvado, monta, remontado, chassi, documento perdido

\# \--- Novos (0km) \---

0km, zero km, novo 2026, carro novo, tabela fipe 0km, lancamento

\# \--- Motos e outros veículos (a menos que a loja opere) \---

moto, motos, motocicleta, scooter, caminhao, caminhoes, onibus,

trator, implemento, reboque, carreta, barco, lancha, jet ski, quadriciclo

\# \--- Financeiro / crédito puro (não é lead de carro) \---

emprestimo, emprestimo pessoal, credito consignado, refinanciamento,

consorcio contemplado, carta de credito, cartao de credito, fgts,

banco central, serasa, limpar nome, score, negativado consulta

\# \--- Consulta / documentação (intenção informacional) \---

tabela fipe, consulta fipe, valor fipe, consultar placa, consulta placa,

detran, ipva, ipva 2026, licenciamento, multa, cnh, transferencia

documento, despachante, seguro, cotacao seguro, seguradora, sinistro

\# \--- Concorrência de marketplace (drena verba) \---

olx, webmotors, mercado livre, icarros, chaves na mao, mobiauto,

usadosbr, napista, facebook marketplace, classificados

\# \--- Outras cidades e estados \---

sao paulo, rio de janeiro, joinville, florianopolis, blumenau, maringa,

londrina, cascavel, ponta grossa, foz do iguacu, porto alegre,

brasilia, belo horizonte, salvador, recife

\# \--- Reputação / jurídico \---

reclame aqui, reclamacao, processo, golpe, fraude, procon, e confiavel

#### Lista B — `NEG_Financiamento` (só na campanha 05\)

nome sujo, nome negativado, negativado, spc, serasa, sem consulta spc,

sem consulta serasa, sem comprovar renda, sem entrada e sem consulta,

100 financiado sem entrada, financiamento sem burocracia negativado,

autonomo sem comprovacao, aposentado inss emprestimo, taxa de juros bacen,

qual banco tem menor juros, cet, simulador caixa, simulador bb

> Estes termos não são "ruins" por natureza — alguns viram venda. Mas **matam o CPA médio e envenenam o aprendizado do lance automático**. Bloqueie na Fase 1–2; reavalie na Fase 3 com dados de CRM em mãos.

#### Lista C — `NEG_Marca_paraPMax` (aplicar como exclusão de marca na PMax)

motors store, motorsstore, motor store curitiba, motors store bacacheri

#### Rotina de negativação

| Frequência | Ação |
| :---- | :---- |
| **Diária (1ª semana)** | Relatório de termos de pesquisa; negativar tudo que não seja intenção de compra/venda de carro |
| Semanal (semanas 2–8) | Termos de pesquisa \+ análise de correspondência (exata vs. frase) |
| Quinzenal (depois) | Termos de pesquisa \+ revisão de DSA e PMax (relatório de "Termos de pesquisa" e "Insights") |
| Mensal | Auditoria da lista mestre \+ verificar se alguma negativa está bloqueando termo bom |

### 3.7 Estratégia de lances por maturidade

FASE 1 (sem conversões)          FASE 2 (15–30 conv./mês)      FASE 3 (30+ conv./mês)

─────────────────────────        ────────────────────────       ──────────────────────

Maximizar cliques                Maximizar conversões           Maximizar conversões

\+ CPC máx. de R$ 4,50            (sem tCPA — deixar aprender)   com tCPA

Objetivo: gerar dados            Objetivo: encontrar o CPA      Objetivo: escalar com

e mapear termos                  natural da conta               eficiência controlada

     │                                   │                              │

     └─ 2 a 4 semanas ────────────►      └─ 3 a 4 semanas ─────►        └─ contínuo

**Regras de transição (não pule etapas):**

| De → Para | Gatilho | Cuidado |
| :---- | :---- | :---- |
| Max. cliques → Max. conversões | ≥ 15 conversões nos últimos 30 dias **na campanha** | Sem esse volume, o algoritmo entra em "aprendizado limitado" permanente |
| Max. conversões → \+ tCPA | ≥ 30 conversões/mês e CPA estável por 3 semanas | Defina o **primeiro tCPA igual ao CPA médio real dos últimos 30 dias**, não ao CPA que você gostaria |
| Ajuste de tCPA | — | Nunca mexer mais de **±20% por vez**, e no máximo 1× por semana. Cada alteração reinicia o aprendizado |

**Cálculo do tCPA inicial:**

tCPA inicial \= CPA médio real dos últimos 30 dias

Só depois de 3 semanas estáveis, aplique reduções de 10–15%:

  Semana 1:  tCPA \= R$ 80  (= CPA real)

  Semana 4:  tCPA \= R$ 70   ← −12,5%

  Semana 8:  tCPA \= R$ 62   ← −11%

  … até o volume começar a cair. Aí você achou o piso.

**Ajustes de lance manuais que continuam valendo (mesmo com lance automático):**

| Dimensão | Ajuste sugerido | Fase |
| :---- | :---- | :---- |
| Raio de 8 km da loja | \+20% | 1 |
| Dispositivo mobile | \+10% (Fase 1, para coletar dados de WhatsApp) | 1 |
| Sábado 9h–13h | \+15% (horário de pico de visita física) | 2 |
| 00h–07h | −40% ou pausar | 2 |
| RMC (fora de Curitiba) | −15% | 2 |
| Lista de remarketing "visitou ficha e não converteu" | \+25% (observação → segmentação) | 2 |

### 3.8 Criativos, extensões (recursos) e copy

#### 3.8.1 Diferenciais de Curitiba que devem aparecer no anúncio

Ordem de impacto testada nessa praça:

1. **Laudo cautelar / periciado** — a objeção nº 1 do curitibano  
2. **Garantia** (mínimo 3 meses de motor e câmbio)  
3. **Aceitamos seu usado na troca / avaliação em 30 min**  
4. **Financiamento com aprovação rápida / múltiplos bancos**  
5. **Loja física no Bacacheri** (endereço concreto \= confiança)  
6. **IPVA pago / transferência inclusa** (quando verdadeiro)

#### 3.8.2 Anúncio Responsivo de Pesquisa — banco de ativos

**Títulos (30 caracteres — 15 slots; fixe 2–3 dos melhores na posição 1):**

Seminovos em Curitiba              (21)

Seminovos no Bacacheri             (22)

Carros Periciados em Curitiba      (29)

Laudo Cautelar Aprovado            (23)

Todo Carro com Laudo Cautelar      (29)

Garantia de 3 Meses                (19)

Aceitamos Seu Usado na Troca       (28)

Avaliamos Seu Carro em 30min       (28)

Financiamento em até 60x           (24)

Aprovação Rápida no Financiamento  (33) ✂ → "Aprovação Rápida do Crédito" (27)

Loja Física — Rua Canadá 1250      (29)

Estoque Selecionado 1 a 1          (25)

{KeyWord:Seminovos Curitiba}       (dinâmico)

Veja o Estoque Completo            (23)

Fale no WhatsApp Agora             (22)

**Descrições (90 caracteres — 4 slots):**

Seminovos periciados com laudo cautelar aprovado. Garantia e procedência verificada.   (84)

Loja física no Bacacheri, Curitiba. Venha ver o carro pessoalmente. Rua Canadá, 1250\.  (85)

Avaliamos seu usado em até 30 minutos. Troca com troco e financiamento em até 60x.     (82)

Estoque selecionado um a um, com inspeção rigorosa. Fale agora pelo WhatsApp.          (77)

> ⚠️ **Compliance:** não use valor de parcela no anúncio sem CET. Prefira "financiamento em até 60x" ou "consulte condições". Evite superlativos não comprováveis ("a melhor loja de Curitiba") — o Google reprova e o Procon também.

#### 3.8.3 Recursos (extensões) — configuração completa

| Recurso | Nível | Configuração |
| :---- | :---- | :---- |
| **Sitelinks** (mín. 6\) | Conta \+ Campanha | ver abaixo |
| **Frases de destaque** (mín. 8\) | Conta | `Laudo Cautelar` · `Garantia 3 Meses` · `Aceitamos Troca` · `Financiamento 60x` · `Loja no Bacacheri` · `Estoque Selecionado` · `Entrega em Todo Brasil` · `Atendimento Consultivo` |
| **Snippets estruturados** | Conta | Cabeçalho `Tipos`: `SUV, Sedan, Hatch, Picape` · Cabeçalho `Marcas`: `Toyota, Honda, Jeep, Chevrolet, VW, Hyundai` |
| **Chamada** | Conta | `(41) 99842-6127`, com **relatório de chamadas ativado** e conversão de "ligação de 60s+" |
| **Local** | Conta | Via GBP vinculado — essencial para Maps |
| **Formulário de lead** | Campanha 02, 05, 06 | ver abaixo |
| **Imagem** | Campanha | 4–6 imagens 1:1 e 1.91:1 de veículos reais do estoque (não banco de imagens) |
| **Preço** | Campanha 04 | Tipo "Marcas" ou "Categorias de serviço", 3–8 itens: `SUVs · a partir de R$ X` |
| **Promoção** | Sazonal | Feirão, condição especial de fim de mês |
| **Logo \+ Nome da empresa** | Conta | Obrigatório para RSA moderno |

**Sitelinks (25 car. no título, 35 car. em cada descrição):**

| Título | Descrição 1 | Descrição 2 | URL |
| :---- | :---- | :---- | :---- |
| `Ver Estoque Completo` | `Mais de 40 veículos periciados` | `Atualizado diariamente` | `/estoque` |
| `SUVs Seminovas` | `SUVs com garantia e laudo` | `Confira preços e fotos` | `/estoque/suv` |
| `Avalie Seu Usado` | `Resposta em até 30 minutos` | `Troca com troco` | `/avaliacao` |
| `Simule Financiamento` | `Em até 60x, múltiplos bancos` | `Aprovação rápida` | `/financiamento` |
| `Como Chegar` | `Rua Canadá, 1250 — Bacacheri` | `Estacionamento no local` | `/contato` |
| `Falar no WhatsApp` | `Atendimento das 8h30 às 18h30` | `Tire dúvidas na hora` | `/whatsapp` |
| `Nossa Garantia` | `3 meses de motor e câmbio` | `Laudo cautelar incluso` | `/garantia` |
| `Até R$ 60 Mil` | `Opções de entrada` | `Financiamento facilitado` | `/estoque/ate-100-mil` |

**Formulário de lead (usar com cautela):** gera volume alto e qualidade média. Configure com:

- Perguntas: Nome, WhatsApp, "Qual carro te interessou?", "Tem veículo na troca?"  
- Chamada para ação: `Receber proposta`  
- **Integração via webhook** para o CRM (não deixe lead parado no painel do Ads — a taxa de contato cai drasticamente após 15 minutos)  
- Conversão separada `gerar_lead_formulario_ads` com valor menor que o lead do site

### 3.9 Orçamento sugerido por fase

| Campanha | Fase 1 (sem./3–6) | Fase 2 (sem./7–10) | Fase 3 (sem./11+) |
| :---- | :---- | :---- | :---- |
| 01 Marca | R$ 10 | R$ 12 | R$ 15 |
| 02 Seminovos Geo | R$ 70 | R$ 120 | R$ 160 |
| 03 Modelos | R$ 40 | R$ 70 | R$ 100 |
| 04 Categorias | — | R$ 40 | R$ 60 |
| 05 Financiamento/Troca | R$ 25 | R$ 40 | R$ 50 |
| 06 Compra/Avaliação | R$ 25 | R$ 40 | R$ 50 |
| 07 DSA | — | R$ 30 | R$ 40 |
| 08 Local | R$ 30 | R$ 40 | R$ 50 |
| 09 PMax | — | — | R$ 120 |
| 10 Remarketing | — | R$ 15 | R$ 30 |
| **Total/dia** | **R$ 200** | **R$ 407** | **R$ 675** |
| **Total/mês** | **≈ R$ 6.000** | **≈ R$ 12.200** | **≈ R$ 20.250** |

> **Piso realista:** abaixo de **R$ 100–120/dia** (≈ R$ 3.000–3.600/mês) não é possível manter mais de 2 campanhas com aprendizado saudável nessa praça. Se o orçamento disponível for menor, **concentre tudo em `02 Seminovos Geo` \+ `06 Compra/Avaliação`** e ignore o resto até o caixa permitir. O erro dos R$ 15,10/dia atuais é justamente espalhar o que não dá nem para uma campanha.

---

## 4\. Ecossistema GA4 \+ Google Tag Manager

> **Esta é a seção que destrava tudo.** A conta hoje tem PMax em "Maximizar conversões" com **zero ações de conversão configuradas**. Enquanto isso não for resolvido, qualquer verba investida é aposta.

### 4.1 Ponto de partida e ordem de implementação

**O que já existe no site (§0.5.4):**

| Item | Estado |
| :---- | :---- |
| GA4 | ✅ Instalado — `G-CZ4B4RYF61`, via `gtag.js` **direto no código** |
| GTM | ❌ Não existe contêiner |
| Meta Pixel | ✅ Instalado (`fbq`) |
| `dataLayer` | ⚠️ Existe, mas só com os pushes automáticos do gtag (`js`, `config`, `page_view`) |
| Eventos de negócio | ❌ **Zero.** WhatsApp, proposta, financiamento, ligação — nada é medido |
| Conversões no Google Ads | ❌ Nenhuma |

O problema não é falta de GA4 — é que **o GA4 instalado não recebe nenhum evento que importa**. E como o `gtag.js` está hardcoded, cada evento novo exige deploy do desenvolvedor. Isso trava a operação de mídia.

#### 4.1.1 Migração `gtag.js` → GTM (sem perder histórico)

> ⚠️ **Regra crítica:** a Google Tag do GA4 pode existir **uma única vez** na página. Se você instalar o GTM com a tag de configuração do GA4 **sem remover o `gtag.js` do código**, todo `page_view` será contado em dobro e as métricas ficarão inutilizáveis.

Passo 1  Criar contêiner GTM (web) e instalar os snippets no \<head\> e no \<body\>

         → nesta etapa o GTM ainda não tem nenhuma tag GA4: nada muda na medição

Passo 2  Implementar o dataLayer de negócio no site (§4.2) — dev

         → os eventos passam a existir, mas ainda não são enviados a lugar nenhum

Passo 3  Criar no GTM a Google Tag do GA4 com o MESMO ID G-CZ4B4RYF61

         → mantém todo o histórico da propriedade; NÃO criar propriedade nova

Passo 4  No MESMO deploy: publicar o contêiner GTM E remover o \<script\> do

         gtag.js do código-fonte

         → janela de duplicação \= zero

Passo 5  Migrar o Meta Pixel para o GTM (mesmo cuidado: remover do código)

Passo 6  Criar as tags de evento GA4 e as conversões do Google Ads (§4.3)

Passo 7  Validar com o checklist da §4.9

Passo 8  Só então: ativar campanhas

**Validação do Passo 4** (fazer no dia do deploy): abrir o site com o Tag Assistant e confirmar que existe **uma única** Google Tag `G-CZ4B4RYF61` na página. No GA4, comparar o volume de `page_view` do dia seguinte com a média dos 7 dias anteriores — variação maior que ±10% indica duplicação ou perda.

**Se o time preferir não migrar agora:** é possível manter o `gtag.js` e enviar eventos via `gtag('event', ...)` direto no código. Funciona, mas cada ajuste de mensuração vira ticket de desenvolvimento — e nesta vertical a mensuração muda toda semana. **A migração para GTM se paga em 30 dias.**

### 4.2 Estrutura de Data Layer

O dataLayer é responsabilidade do **desenvolvedor do site**, não do GTM. Especifique assim para a equipe de dev.

#### 4.2.1 Camada global (todas as páginas, **antes** do snippet do GTM)

\<script\>

  window.dataLayer \= window.dataLayer || \[\];

  dataLayer.push({

    // valores alinhados às rotas reais do motorsstore.com.br

    'page\_type'    : 'vehicle\_detail',   // home | inventory | brand | model | bodytype | highlight

                                         // | vehicle\_detail | appraisal | financing | unit

                                         // | contact | thank\_you

    'user\_logged'  : false,

    'store\_id'     : 'piazzetta',        // piazzetta | canada  ← qual unidade atende esta página

    'store\_city'   : 'Curitiba',

    'stock\_count'  : 39

  });

\</script\>

#### 4.2.2 Ficha de veículo — objeto `vehicle` (o coração do tracking)

\<script\>

  window.dataLayer \= window.dataLayer || \[\];

  dataLayer.push({

    'event'   : 'view\_vehicle',

    'vehicle' : {

      'id'            : '45231',                    // ID interno — DEVE bater com o feed dinâmico

      'name'          : 'Toyota Corolla XEi 2.0 Flex 2021',

      'brand'         : 'Toyota',

      'model'         : 'Corolla',

      'version'       : 'XEi 2.0 Flex',

      'model\_year'    : 2021,

      'manufacture\_year': 2020,

      'price'         : 112900.00,

      'currency'      : 'BRL',

      'mileage'       : 48500,

      'transmission'  : 'Automatico',               // Automatico | Manual

      'fuel'          : 'Flex',

      'body\_type'     : 'Sedan',                    // SUV | Sedan | Hatch | Picape

      'color'         : 'Prata',

      'doors'         : 4,

      'owners'        : 1,

      'has\_report'    : true,                       // laudo cautelar

      'days\_in\_stock' : 37,                         // ← permite otimizar mídia por encalhe

      'price\_range'   : '100k-150k'                 // faixa para audiências

    },

    // Espelho no formato GA4 ecommerce (habilita relatórios nativos de itens):

    'ecommerce': {

      'currency': 'BRL',

      'value'   : 112900.00,

      'items'   : \[{

        'item\_id'       : '45231',

        'item\_name'     : 'Toyota Corolla XEi 2.0 Flex 2021',

        'item\_brand'    : 'Toyota',

        'item\_category' : 'Sedan',

        'item\_category2': 'Corolla',

        'item\_category3': '2021',

        'item\_category4': 'Automatico',

        'item\_variant'  : 'Prata',

        'price'         : 112900.00,

        'quantity'      : 1

      }\]

    }

  });

\</script\>

> 🔧 **Importante:** sempre dê `dataLayer.push({ecommerce: null})` **antes** de cada push de ecommerce, para não vazar dados do item anterior em navegação SPA.

#### 4.2.3 Eventos de interação (disparados pelo front-end)

// \--- Clique em WhatsApp (o principal lead desta vertical) \---

dataLayer.push({

  'event': 'click\_whatsapp',

  'whatsapp\_location': 'vehicle\_detail\_sticky',  // header | footer | sticky | vehicle\_detail\_sticky | float

  'store\_id': 'piazzetta',                       // ← qual unidade recebeu o lead

  'whatsapp\_number': '5541997372165',

  'vehicle\_id': '7977579',

  'vehicle\_name': 'Jeep Renegade S T270 1.3 Turbo 4x4 2022',

  'vehicle\_price': 105900.00

});

// \--- Envio de formulário de proposta \---

dataLayer.push({

  'event': 'generate\_lead',

  'lead\_type': 'proposta',                       // proposta | financiamento | avaliacao | contato

  'form\_id': 'form-proposta-veiculo',

  'vehicle\_id': '45231',

  'vehicle\_price': 112900.00,

  'has\_trade\_in': true,

  'lead\_id': 'LD-2026-08-24-0091'                // ID para reconciliar com o CRM (conversão offline)

});

// \--- Simulação de financiamento concluída \---

dataLayer.push({

  'event': 'financing\_simulation',

  'vehicle\_id': '45231',

  'down\_payment': 30000,

  'installments': 48,

  'lead\_id': 'LD-2026-08-24-0092'

});

// \--- Formulário de avaliação do usado (/avaliacao — já existe no site) \---

// Disparar no SUCESSO do envio (após o Turnstile validar), nunca no clique do botão.

dataLayer.push({

  'event': 'generate\_lead',

  'lead\_type': 'avaliacao',

  'trade\_in\_brand': 'Volkswagen',

  'trade\_in\_model': 'Gol',

  'trade\_in\_year': 2016,

  'lead\_id': 'LD-2026-08-24-0093'

});

// \--- Clique para ligar \---

dataLayer.push({ 'event': 'click\_to\_call', 'call\_location': 'header' });

// \--- Clique em "Como chegar" \---

dataLayer.push({ 'event': 'click\_directions', 'directions\_source': 'contact\_page' });

// \--- Visualização da ficha técnica (micro-conversão de engajamento) \---

dataLayer.push({ 'event': 'view\_specs', 'vehicle\_id': '45231' });

// \--- Interação com a galeria \---

dataLayer.push({ 'event': 'view\_gallery', 'vehicle\_id': '45231', 'images\_viewed': 5 });

// \--- Início de preenchimento (para detectar abandono) \---

dataLayer.push({ 'event': 'form\_start', 'form\_id': 'form-proposta-veiculo', 'vehicle\_id': '45231' });

### 4.3 Estrutura do contêiner GTM

#### 4.3.1 Variáveis

**Variáveis integradas a ativar:** Click Element, Click Classes, Click ID, Click URL, Click Text, Form ID, Form Classes, Page Path, Page Hostname, Referrer, Scroll Depth Threshold, Video variables.

**Variáveis da camada de dados (criar todas):**

| Nome da variável | Nome da variável de camada de dados | Versão |
| :---- | :---- | :---- |
| `dlv - page_type` | `page_type` | 2 |
| `dlv - vehicle.id` | `vehicle.id` | 2 |
| `dlv - vehicle.name` | `vehicle.name` | 2 |
| `dlv - vehicle.brand` | `vehicle.brand` | 2 |
| `dlv - vehicle.model` | `vehicle.model` | 2 |
| `dlv - vehicle.model_year` | `vehicle.model_year` | 2 |
| `dlv - vehicle.price` | `vehicle.price` | 2 |
| `dlv - vehicle.body_type` | `vehicle.body_type` | 2 |
| `dlv - vehicle.transmission` | `vehicle.transmission` | 2 |
| `dlv - vehicle.price_range` | `vehicle.price_range` | 2 |
| `dlv - vehicle.days_in_stock` | `vehicle.days_in_stock` | 2 |
| `dlv - lead_type` | `lead_type` | 2 |
| `dlv - lead_id` | `lead_id` | 2 |
| `dlv - whatsapp_location` | `whatsapp_location` | 2 |
| `dlv - ecommerce.items` | `ecommerce.items` | 2 |

**Constantes:**

| Nome | Valor |
| :---- | :---- |
| `const - GA4 Measurement ID` | `G-CZ4B4RYF61` |
| `const - Google Ads Conversion ID` | `AW-XXXXXXXXX` |

**Variável JavaScript personalizada — valor econômico do lead** (permite lance por valor, não só por volume):

function() {

  var tipo  \= {{dlv \- lead\_type}};

  var preco \= parseFloat({{dlv \- vehicle.price}}) || 0;

  // Valor estimado do lead \= preço do veículo × margem estimada × taxa de conversão do tipo de lead

  var MARGEM \= 0.08;   // 8% de margem bruta estimada — AJUSTE COM O NÚMERO REAL DA LOJA

  var taxas \= {

    'proposta'     : 0.10,   // lead de proposta converte \~10%

    'financiamento': 0.05,

    'avaliacao'    : 0.12,   // captação: alta conversão em entrada de estoque

    'contato'      : 0.03

  };

  var taxa \= taxas\[tipo\] || 0.03;

  if (preco \> 0\) return \+(preco \* MARGEM \* taxa).toFixed(2);

  // Fallback quando não há veículo associado (ex.: avaliação de usado)

  var fallback \= { 'proposta': 420, 'financiamento': 210, 'avaliacao': 500, 'contato': 120 };

  return fallback\[tipo\] || 100;

}

> ⚠️ Os coeficientes acima são **placeholders**. Substitua `MARGEM` e as taxas por dados reais do CRM da Motors Store antes de usar lances por valor (Maximizar valor da conversão / tROAS).

#### 4.3.2 Tags

| \# | Tag | Tipo | Gatilho | Observações |
| :---- | :---- | :---- | :---- | :---- |
| T01 | `GA4 — Configuração` | Google Tag (`G-CZ4B4RYF61`) | All Pages | Adicionar parâmetros globais: `page_type`, `store_id` |
| T02 | `Google Ads — Google Tag` | Google Tag (`AW-XXXXXXXXX`) | All Pages | Substitui o antigo Conversion Linker |
| T03 | `GA4 — view_vehicle` | GA4 Event | CE \- view\_vehicle | Enviar `items` |
| T04 | `GA4 — click_whatsapp` | GA4 Event | CE \- click\_whatsapp |  |
| T05 | `GA4 — generate_lead` | GA4 Event | CE \- generate\_lead | `value` \= variável JS de valor do lead |
| T06 | `GA4 — financing_simulation` | GA4 Event | CE \- financing\_simulation |  |
| T07 | `GA4 — click_to_call` | GA4 Event | CE \- click\_to\_call **ou** Click URL contém `tel:` |  |
| T08 | `GA4 — click_directions` | GA4 Event | CE \- click\_directions **ou** Click URL contém `maps.google` / `goo.gl/maps` |  |
| T09 | `GA4 — view_specs` | GA4 Event | CE \- view\_specs |  |
| T10 | `GA4 — form_start` | GA4 Event | CE \- form\_start | Base da audiência de abandono |
| T11 | `Ads — Conv. WhatsApp` | Conversão do Google Ads | CE \- click\_whatsapp |  |
| T12 | `Ads — Conv. Lead Proposta` | Conversão do Google Ads | CE \- generate\_lead \+ `lead_type = proposta` |  |
| T13 | `Ads — Conv. Lead Financiamento` | Conversão do Google Ads | CE \- generate\_lead \+ `lead_type = financiamento` |  |
| T14 | `Ads — Conv. Lead Avaliação` | Conversão do Google Ads | CE \- generate\_lead \+ `lead_type = avaliacao` |  |
| T15 | `Ads — Conv. Ligação` | Conversão do Google Ads | CE \- click\_to\_call |  |
| T16 | `Ads — Conv. Como Chegar` | Conversão do Google Ads | CE \- click\_directions | Secundária |
| T17 | `Ads — Remarketing Dinâmico` | Remarketing do Google Ads | All Pages | Ver 4.3.4 |
| T18 | `GA4 — scroll_90` | GA4 Event | Scroll Depth 90% em `page_type = vehicle_detail` | Sinal de interesse forte |

**Configuração dos parâmetros da tag `GA4 — generate_lead` (T05):**

| Parâmetro | Valor |
| :---- | :---- |
| `value` | `{{js - valor do lead}}` |
| `currency` | `BRL` |
| `lead_type` | `{{dlv - lead_type}}` |
| `lead_id` | `{{dlv - lead_id}}` |
| `vehicle_id` | `{{dlv - vehicle.id}}` |
| `vehicle_brand` | `{{dlv - vehicle.brand}}` |
| `vehicle_model` | `{{dlv - vehicle.model}}` |
| `vehicle_price` | `{{dlv - vehicle.price}}` |
| `body_type` | `{{dlv - vehicle.body_type}}` |
| `price_range` | `{{dlv - vehicle.price_range}}` |

#### 4.3.3 Gatilhos

CE \- view\_vehicle            → Evento personalizado, nome \= view\_vehicle

CE \- click\_whatsapp          → Evento personalizado, nome \= click\_whatsapp

CE \- generate\_lead           → Evento personalizado, nome \= generate\_lead

CE \- generate\_lead PROPOSTA  → Evento personalizado, nome \= generate\_lead

                                E {{dlv \- lead\_type}} igual a "proposta"

CE \- generate\_lead FINANC.   → idem, lead\_type \= "financiamento"

CE \- generate\_lead AVALIACAO → idem, lead\_type \= "avaliacao"

CE \- click\_to\_call           → Evento personalizado, nome \= click\_to\_call

CE \- click\_directions        → Evento personalizado, nome \= click\_directions

CE \- financing\_simulation    → Evento personalizado, nome \= financing\_simulation

CE \- view\_specs              → Evento personalizado, nome \= view\_specs

CE \- form\_start              → Evento personalizado, nome \= form\_start

FALLBACK (se o dev demorar a implementar o dataLayer):

CLICK \- WhatsApp  → Clique em todos os elementos,

                    Click URL corresponde a RegEx: (wa\\.me|api\\.whatsapp\\.com|web\\.whatsapp\\.com)

CLICK \- Telefone  → Clique em todos os elementos, Click URL começa com "tel:"

CLICK \- Rota      → Clique em todos os elementos,

                    Click URL corresponde a RegEx: (maps\\.google|goo\\.gl/maps|maps\\.app\\.goo\\.gl)

> O fallback por clique funciona, mas **não carrega o contexto do veículo**. Use como ponte, não como solução definitiva.

#### 4.3.4 Tag de remarketing dinâmico (T17)

Tipo: *Remarketing do Google Ads*. ID de conversão: `AW-XXXXXXXXX`.

| Parâmetro personalizado | Valor |
| :---- | :---- |
| `dynx_itemid` | `{{dlv - vehicle.id}}` |
| `dynx_pagetype` | `{{js - dynx pagetype}}` |
| `dynx_totalvalue` | `{{dlv - vehicle.price}}` |

Variável `js - dynx pagetype`:

function() {

  var map \= {

    'home'          : 'home',

    'inventory'     : 'searchresults',

    'category'      : 'searchresults',

    'model'         : 'searchresults',

    'vehicle\_detail': 'offerdetail',

    'financing'     : 'conversionintent',

    'appraisal'     : 'conversionintent',

    'thank\_you'     : 'conversion'

  };

  return map\[{{dlv \- page\_type}}\] || 'other';

}

O `dynx_itemid` **precisa ser idêntico** à coluna `ID` do feed de dados da empresa (Seção 3.4). Divergência aqui \= anúncio dinâmico em branco.

### 4.4 Mapa de eventos e conversões

| Evento | Tipo | GA4: evento-chave? | Google Ads | Contagem | Janela clique | Valor |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| `click_whatsapp` | 🎯 Macro | ✅ Sim | ✅ **Principal** | Uma | 30 dias | Variável JS |
| `generate_lead` (proposta) | 🎯 Macro | ✅ Sim | ✅ **Principal** | Uma | 30 dias | Variável JS |
| `generate_lead` (avaliação) | 🎯 Macro | ✅ Sim | ✅ **Principal** | Uma | 30 dias | Variável JS |
| `generate_lead` (financiamento) | 🎯 Macro | ✅ Sim | ✅ Principal (valor menor) | Uma | 30 dias | Variável JS |
| `click_to_call` | 🎯 Macro | ✅ Sim | ✅ Principal | Uma | 30 dias | R$ 200 fixo |
| `financing_simulation` | 🔸 Micro | ✅ Sim | ⚪ Secundária | Uma | 30 dias | R$ 50 |
| `click_directions` | 🔸 Micro | ✅ Sim | ⚪ Secundária | Uma | 7 dias | R$ 80 |
| `view_vehicle` | 📊 Comport. | ❌ Não | ❌ Não | — | — | — |
| `view_specs` | 📊 Comport. | ❌ Não | ❌ Não | — | — | — |
| `view_gallery` | 📊 Comport. | ❌ Não | ❌ Não | — | — | — |
| `form_start` | 📊 Comport. | ❌ Não | ❌ Não | — | — | — |
| `scroll_90` (ficha) | 📊 Comport. | ❌ Não | ❌ Não | — | — | — |
| **`venda_confirmada`** | 💰 Offline | ✅ Sim | ✅ **Principal** (import.) | Uma | 90 dias | Margem real |

**Regra de ouro:** apenas eventos **macro** e a **venda offline** devem estar marcados como "Principal" no Google Ads. Se você marcar `view_vehicle` como conversão, o algoritmo vai otimizar para curiosos.

**Configuração de "Contagem":**

- `Uma` → para leads (uma pessoa que manda 3 WhatsApps é 1 lead)  
- `Todas` → nunca nesta vertical

**Modelo de atribuição no Ads:** `Baseado em dados` (padrão atual). Se o volume for baixo demais, o Google usa "Último clique" automaticamente até acumular dados.

### 4.5 Criação das conversões no Google Ads

Metas → Conversões → Resumo → \+ Nova ação de conversão → Site → Adicionar manualmente (usando código)

Para cada uma:

  Categoria de meta ......... "Envio de formulário de lead" ou "Contato"

  Nome ...................... conv\_whatsapp / conv\_lead\_proposta / conv\_lead\_avaliacao / …

  Valor ..................... "Usar valores diferentes para cada conversão"

                              (valor padrão de reserva: R$ 300\)

  Contagem .................. Uma

  Janela de conversão ....... 30 dias (90 dias para venda offline)

  Janela de engajamento ..... 1 dia (padrão)

  Ação de conversão ......... PRINCIPAL para macros, SECUNDÁRIA para micros

  Modelo de atribuição ...... Baseado em dados

  Conversões otimizadas ..... ✅ Ativar (envia dados de 1ª parte com hash — melhora a mensuração)

**Sobre importar do GA4 vs. criar nativa no Ads:** para lances automáticos, **prefira conversões nativas do Ads** (via GTM) — são mais rápidas e mais precisas para o algoritmo. Use a importação do GA4 apenas para conversões que só existem lá (ex.: eventos de exploração) e **nunca duplique a mesma conversão nos dois caminhos** — isso dobra a contagem e corrompe o tCPA.

### 4.6 Conversões offline — o que separa amador de profissional nessa vertical

O lead de seminovo converte em venda em 7–45 dias, presencialmente. Sem importar a venda, o Google otimiza para o lead mais barato — que costuma ser o pior lead.

**Fluxo:**

1\. Site → GTM captura o GCLID e grava em cookie de 1ª parte (90 dias)

        (a Google Tag já faz isso; leia o cookie \_gcl\_aw)

2\. Formulário envia o GCLID em campo oculto  ──►  CRM

3\. CRM registra: lead\_id, gclid, data/hora, canal

4\. Vendedor atualiza o status no CRM: Contato → Visita → Proposta → VENDIDO

5\. Semanalmente: exportar CSV e importar em

   Metas → Conversões → Uploads

**Formato do CSV de upload (offline conversions):**

Parameters:TimeZone=America/Sao\_Paulo

Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency

Cj0KCQjw...abc,venda\_confirmada,2026-08-20 15:32:00,7200,BRL

Cj0KCQjw...def,visita\_loja,2026-08-18 10:05:00,300,BRL

**Alternativa sem GCLID (mais simples, recomendada se o CRM não guarda GCLID):** use **Conversões otimizadas para leads** — o CRM envia e-mail/telefone com hash SHA-256 no lugar do GCLID. Requer que o formulário capture e-mail ou telefone e que a Google Tag esteja com dados de 1ª parte ativados.

**Ações de conversão offline a criar:**

| Nome | Categoria | Valor | Janela | Uso |
| :---- | :---- | :---- | :---- | :---- |
| `visita_loja` | Visita à loja | R$ 300 | 45 dias | Secundária, sinal intermediário |
| `venda_confirmada` | Compra | Margem bruta real | 90 dias | **Principal na Fase 3** |

### 4.7 Audiências de remarketing

Criar no **GA4** (Admin → Públicos-alvo) e compartilhar com o Ads via vinculação.

| \# | Audiência | Definição | Duração | Uso |
| :---- | :---- | :---- | :---- | :---- |
| A1 | **Visitantes gerais** | Qualquer sessão | 90 d | Base / exclusão |
| A2 | **Viu ficha de veículo** | `view_vehicle` ≥ 1 | 60 d | Remarketing dinâmico |
| A3 | **Viu ficha e NÃO converteu** | `view_vehicle` ≥ 1 **E NÃO** (`generate_lead` OU `click_whatsapp`) | 45 d | 🎯 Principal audiência de remarketing |
| A4 | **Abandono de formulário** | `form_start` ≥ 1 **E NÃO** `generate_lead` | 14 d | 🎯 Maior taxa de recuperação |
| A5 | **Lead quente** | `generate_lead` ≥ 1 **E NÃO** `venda_confirmada` | 60 d | Remarketing de fechamento \+ exclusão de campanhas de topo |
| A6 | **Interessados em SUV** | `view_vehicle` com `body_type = SUV`, ≥ 2 eventos | 45 d | Segmentação por categoria |
| A7 | **Interessados em {modelo}** | `view_vehicle` com `vehicle_model = X` | 45 d | Sinal para grupos de modelo |
| A8 | **Faixa premium** | `view_vehicle` com `price_range = 150k+` | 60 d | Campanha premium |
| A9 | **Alta intenção** | `view_vehicle` ≥ 3 sessões **OU** `financing_simulation` ≥ 1 | 30 d | Ajuste de lance \+30% |
| A10 | **Captação (avaliação)** | Visitou `/avaliacao` e não converteu | 30 d | Remarketing de captação de estoque |
| A11 | **Compradores** | `venda_confirmada` \= 1 | 540 d | **Excluir** de aquisição; usar em pós-venda/recompra |
| A12 | **Lookalike de compradores** | Segmento semelhante a A11 | — | Sinal de público para PMax |

**Regras de exclusão obrigatórias:**

- Excluir **A5 (lead quente)** e **A11 (compradores)** de todas as campanhas de topo de funil.  
- Excluir **A11** também do remarketing dinâmico (nada pior que perseguir com anúncio quem já comprou).

**Segmentação de dados do cliente (Customer Match):** faça upload da base de clientes do CRM (e-mail \+ telefone, com hash) para (a) excluir compradores recentes, (b) reativar base fria após 24–36 meses (ciclo típico de troca), (c) alimentar lookalike.

### 4.8 Modelagem de atribuição e leitura de resultados

| Camada | Ferramenta | Modelo | Para que serve |
| :---- | :---- | :---- | :---- |
| **Otimização de lance** | Google Ads | Baseado em dados | O algoritmo decide onde investir |
| **Leitura de canal** | GA4 → Aquisição | Baseado em dados (padrão GA4) | Comparar Ads x Orgânico x Direto x Social |
| **Leitura de negócio** | CRM | Último clique não direto \+ primeira interação | Entender descoberta vs. fechamento |
| **Consolidação** | Looker Studio | — | Dashboard único (Seção 5.2) |

**Padronização de UTM** (aplicar em tudo que não é Google Ads, que já usa auto-tagging):

GBP — posts:        ?utm\_source=google\&utm\_medium=organic\&utm\_campaign=gbp\_post\&utm\_content={tema}

GBP — site (perfil):?utm\_source=google\&utm\_medium=organic\&utm\_campaign=gbp\_perfil

Instagram bio:      ?utm\_source=instagram\&utm\_medium=social\&utm\_campaign=bio

Instagram stories:  ?utm\_source=instagram\&utm\_medium=social\&utm\_campaign=stories\&utm\_content={data}

WhatsApp broadcast: ?utm\_source=whatsapp\&utm\_medium=crm\&utm\_campaign={campanha}

Portais:            ?utm\_source=webmotors\&utm\_medium=marketplace\&utm\_campaign=estoque

E-mail:             ?utm\_source=email\&utm\_medium=email\&utm\_campaign={campanha}

⚠️ **Não use UTM em links do Google Ads** — quebra o auto-tagging (GCLID) e você perde a importação de conversão offline. Use o modelo de acompanhamento da Seção 3.1, que preserva o GCLID.

### 4.9 Checklist de validação (antes de publicar o contêiner)

| \# | Verificação | Ferramenta | Critério de aprovação |
| :---- | :---- | :---- | :---- |
| 1 | dataLayer presente antes do GTM | Console: `dataLayer` | Objeto populado no 1º push |
| 2 | `view_vehicle` dispara com todos os campos | GTM Preview | `vehicle.id`, `price`, `brand` preenchidos |
| 3 | GA4 recebe os eventos | GA4 DebugView | Eventos aparecem em \< 10 s |
| 4 | Conversões do Ads disparam | Tag Assistant | Status "Recebendo conversões" em até 24h |
| 5 | Sem duplicação de tag GA4 | Tag Assistant / código-fonte | 1 única Google Tag na página |
| 6 | GCLID persistido | Console: `document.cookie` | `_gcl_aw` presente após clique de anúncio |
| 7 | `dynx_itemid` \= ID do feed | Comparar amostra de 10 veículos | 100% de correspondência |
| 8 | Modo de consentimento | Tag Assistant | Sinais `consent` presentes |
| 9 | Eventos não duplicam em SPA | Navegar entre fichas | 1 `view_vehicle` por ficha |
| 10 | Valores de conversão chegam ao Ads | Relatório de conversões (após 48h) | Coluna "Valor conv." \> 0 |
| 11 | Formulário de agradecimento não dispara 2× | Recarregar `/obrigado` | Evento não repete no F5 |
| 12 | Bloqueio de tráfego interno | GA4 → Fluxo de dados → Filtros | IP da loja excluído |

---

## 5\. Roadmap de Execução e KPIs

### 5.1 Plano de 90 dias

| Semana | Frente | Entregas | Responsável |
| :---- | :---- | :---- | :---- |
| **1** | Fundação | **Resolver NAP das 2 unidades** (§2.1.2) · Auditoria de citações · GBP de cada unidade otimizado · Contêiner GTM criado · GA4 `G-CZ4B4RYF61` auditado | Marketing |
| **1** | 🔴 Dev — quick wins | **Títulos dinâmicos** (§0.5.2 — maior impacto/esforço do plano) · Corrigir `name` duplicado no schema `Car` · H1 das fichas com versão e ano | Dev |
| **1–2** | Dev — estrutura | **Criar hubs de marca e modelo** (hoje 404\) · Páginas geo e de unidades · `ItemList` em `/estoque` · Campos faltantes de `Car` e `AutoDealer` · Regras de 301 para vendidos · Sitemap index | Dev |
| **1–2** | Dev — tracking | Contêiner GTM instalado · dataLayer de negócio implementado · Migração `gtag.js` → GTM em deploy único (§4.1.1) | Dev |
| **2** | Tracking | Tags/gatilhos/variáveis do GTM · Conversões no Ads · Audiências no GA4 · **Checklist 4.9 aprovado** | Marketing |
| **2** | Ads | Conta renomeada · Vinculações (GBP, GA4, Search Console) · Listas de negativas criadas · **Volumes do §1.6 validados no Planejador de Palavras-Chave** (`node conteudo-seo/planejador.js --validar`, ou na interface se o token de desenvolvedor não tiver saído) · **PMax atual mantida pausada** | Marketing |
| **3** | 🚀 Go-live Fase 1 | Campanhas 01, 02, 03, 05, 06, 08 no ar · Max. cliques com teto de CPC · R$ 200/dia | Marketing |
| **3–6** | Otimização | Negativação diária → semanal · Ajuste de raio e horário · Primeiras 3 páginas de conteúdo SEO | Marketing |
| **6** | Revisão | Análise de 30 dias: CPL por campanha, termos vencedores, qualidade de lead no CRM | Todos |
| **7** | Fase 2 | Migração para Maximizar conversões · DSA no ar · Campanha 04 · Remarketing estático · R$ 400/dia | Marketing |
| **7–10** | SEO | Link building camada 2 (1º ativo de conteúdo) · Páginas geo · FAQ schema | Marketing |
| **8** | Offline | Integração CRM ↔ GCLID · 1º upload de conversão offline | Dev \+ Vendas |
| **11** | Fase 3 | tCPA calibrado · Feed dinâmico ativo · PMax com sinais próprios · Remarketing dinâmico · R$ 675/dia | Marketing |
| **12–13** | Consolidação | Dashboard Looker Studio · SOP de reviews rodando · Revisão trimestral | Todos |

### 5.2 KPIs por camada

| Camada | KPI | Meta de referência¹ | Frequência |
| :---- | :---- | :---- | :---- |
| **Mídia** | CTR (Search, marca excluída) | \> 6% | Semanal |
|  | CPC médio | R$ 2,50–5,00 | Semanal |
|  | Taxa de conversão da LP | \> 4% | Semanal |
|  | CPL (lead bruto) | R$ 35–70 | Semanal |
|  | % de impressões perdidas por orçamento | \< 15% | Semanal |
| **Qualidade** | Taxa Lead → Contato efetivo | \> 70% | Semanal |
|  | Taxa Lead → Visita à loja | \> 20% | Mensal |
|  | Taxa Lead → Venda | 5–10% | Mensal |
|  | **CAC (custo de aquisição de cliente)** | \< 20% da margem bruta | Mensal |
| **SEO** | Posições no top 3 do pacote local para `seminovos curitiba` | Top 3 em 6 meses | Mensal |
|  | Cliques orgânicos (Search Console) | \+25% a cada trimestre | Mensal |
|  | Reviews novas/mês | 8–12 | Mensal |
|  | Nota agregada GBP | ≥ 4,6 | Mensal |
|  | Domínios referenciadores locais novos | 6–10/trimestre | Trimestral |
| **Operação** | Tempo médio de estoque | \< 45 dias | Semanal |
|  | Giro de estoque mensal | ≥ 0,7× | Mensal |
|  | Tempo de 1º contato com o lead | \< 10 minutos | Diário |

¹ *Metas de referência de mercado para o vertical. Recalibre após 60 dias com os dados reais da conta.*

### 5.3 Rituais

| Ritual | Frequência | Pauta |
| :---- | :---- | :---- |
| Negativação | Diária (1ª sem.) → Semanal | Relatório de termos de pesquisa |
| Sincronia estoque × mídia | Semanal (segunda) | Pausar AGs de modelos sem estoque; reforçar encalhe 45d+ |
| Revisão de leads | Semanal | Ouvir 5 gravações/ler 10 conversas de WhatsApp — a qualidade do lead se lê no atendimento, não no painel |
| Reunião de performance | Quinzenal | CPL, CAC, giro, ajustes de verba |
| Auditoria de tracking | Mensal | Checklist 4.9 |
| Revisão de SEO | Mensal | Search Console, posições locais, reviews |
| Revisão estratégica | Trimestral | Mix de estoque, faixas de preço, expansão geográfica |

---

## 6\. Riscos e Pontos de Atenção

| Risco | Probabilidade | Impacto | Mitigação |
| :---- | :---- | :---- | :---- |
| Ativar mídia antes do tracking | 🔴 Alta (é o estado atual) | Crítico | Bloquear go-live até o checklist 4.9 estar 100% aprovado |
| Orçamento insuficiente para aprendizado | 🔴 Alta | Alto | Concentrar em 2 campanhas em vez de espalhar |
| Anúncio de veículo já vendido | 🟠 Média | Alto (review negativa) | Feed com atualização ≥ 2×/dia \+ sincronia semanal estoque×AG |
| Suspensão do GBP por categoria/nome irregular | 🟡 Média | Crítico | Seguir 2.1.1 e 2.1.2 ao pé da letra |
| Lead não atendido em tempo | 🔴 Alta | Crítico | SLA de 10 minutos \+ integração via webhook, não painel |
| LGPD no formulário de financiamento | 🟠 Média | Alto (jurídico) | HTTPS, aviso de privacidade, base legal explícita, consentimento v2 |
| Publicidade de crédito sem CET | 🟠 Média | Médio (Procon) | Nunca anunciar parcela sem CET; usar "consulte condições" |
| Dependência de PMax como caixa-preta | 🟠 Média | Médio | Só na Fase 3, com exclusão de marca e expansão de URL desativada |
| Divergência de estoque entre portais | 🔴 **Já ocorrendo** | Médio | Auditoria de citações na Semana 1 |

---

## 7\. Anexos — Downloads rápidos

**A. Ordem de execução mínima se o orçamento for curto (\< R$ 3.000/mês):**

1. **Corrigir os `<title>` duplicados** — uma alteração de template, o maior retorno do plano inteiro, custo zero de mídia  
2. **Criar os hubs de marca e modelo** (hoje 404\) — destrava o cluster P0 de maior conversão  
3. GTM \+ dataLayer \+ 3 conversões (WhatsApp, proposta, avaliação) — *inegociável antes de qualquer verba*  
4. NAP das duas unidades resolvido \+ GBP otimizado \+ SOP de reviews — *maior ROI absoluto, custo zero de mídia*  
5. Completar `Car` e `AutoDealer` \+ `ItemList` em `/estoque`  
6. Campanha `02 Seminovos Geo` (R$ 70/dia) \+ `06 Compra/Avaliação` (R$ 30/dia)  
7. Lista mestre de negativas  
8. Tudo o mais depois

**B. O que NÃO fazer nos próximos 30 dias:**

- ❌ Reativar a PMax atual como está  
- ❌ Criar campanha nova antes das conversões existirem  
- ❌ Usar correspondência ampla  
- ❌ Aceitar recomendações automáticas do Google Ads  
- ❌ Tentar configurar Vehicle Ads / feed de veículos (indisponível no Brasil)  
- ❌ **Migrar as URLs de ficha existentes** — elas estão corretas; mexer só traria risco  
- ❌ Instalar a tag GA4 no GTM sem remover o `gtag.js` do código no mesmo deploy (contagem dobrada)  
- ❌ Criar um segundo perfil GBP com o nome idêntico "Motors Store" no Bacacheri

---

## Fontes

- [Mercado de Seminovos no 1º Trimestre de 2026: números Fenauto e Fenabrave — Infocar](https://infocar.com.br/blog/mercado-de-seminovos-no-1-trimestre-de-2026/)  
- [Veículos usados ultrapassam marca de R$ 90 mil em maio — Motor Mais (estudo Megadealer PVU / Auto Avaliar)](https://motormais.com/veiculos-usados-ultrapassam-marca-de-r-90-mil-em-maio/)  
- [Mercado de seminovos e usados encerra semestre em alta no Paraná — Bem Paraná](https://www.bemparana.com.br/noticias/economia/mercado-de-seminovos-e-usados-encerra-semestre-em-alta-no-parana/)  
- [Giro de estoque em loja de carros: como calcular e acelerar — Autoconf](https://autoconf.com.br/blog/giro-de-estoque-loja-de-carros-como-calcular-e-acelerar/)  
- [Tempo médio de estoque na loja de carros — Autoconf](https://autoconf.com.br/blog/tempo-medio-de-estoque-loja-de-carros/)  
- [MOTORS STORE — perfil e endereço (Mobiauto)](https://www.mobiauto.com.br/comprar/estoque/motors-store-69363)  
- [Motors Store — Bacacheri, Curitiba (Chaves na Mão)](https://www.chavesnamao.com.br/revenda/motors-store/pr-curitiba/id-292906/)  
- [Usar o Planejador de palavras-chave — Ajuda do Google Ads](https://support.google.com/google-ads/answer/7337243?hl=pt-br)  
- [Sobre as previsões do Planejador de palavras-chave — Ajuda do Google Ads](https://support.google.com/google-ads/answer/3022575?hl=pt-br)  
- [Visão geral dos anúncios de veículos — Ajuda do Google Ads](https://support.google.com/google-ads/answer/11189169?hl=pt-br)  
- [Ativação dos anúncios de veículos (países disponíveis) — Ajuda do Google Merchant Center](https://support.google.com/merchants/answer/15312145?hl=pt-BR)  
- [Sobre os feeds de veículos nos anúncios de pesquisa — Ajuda do Google Ads](https://support.google.com/google-ads/answer/16920255?hl=PT-BR)  
- [Remarketing dinâmico: criar um feed para seus anúncios responsivos — Ajuda do Google Ads](https://support.google.com/google-ads/answer/6053288?hl=pt-BR)  
- [Eventos e parâmetros de remarketing dinâmico — Ajuda do Google Ads](https://support.google.com/google-ads/answer/7305793?hl=pt-PT)  
- [Perícia Cautelar em Curitiba — IBPA](https://ibpacuritiba.com.br/) · [DEKRA Curitiba](https://dekrabrasil.com.br/curitiba/vistoria-cautelar-dekra/) · [Terceira Visão Curitiba](https://terceiravisaocuritiba.com.br/)  
- [Seminovos Barigüi](https://www.bariguiseminovos.com.br/) · [Chevrolet Metrosul](https://www.metrosulchevrolet.com.br/sobre-nos) · [Servopa](https://servopa.com.br/) — referências competitivas locais

**Auditorias primárias realizadas em 24/08/2026:**

- Conta Google Ads `830-658-0678` — campanhas, ações de conversão e configurações lidas diretamente no painel.  
- Site [motorsstore.com.br](https://motorsstore.com.br) — home, `/estoque`, `/avaliacao`, ficha de veículo, `robots.txt` e `sitemap.xml`; inspeção de `<title>`, canonical, headings, JSON-LD, `dataLayer` e tags de mensuração.

**Volumes de busca:** nenhum volume medido foi usado na montagem deste plano — as prioridades do §1.6 são por intenção declarada, não por demanda observada. A fonte adotada para validá-los é o **Planejador de Palavras-Chave** do Google Ads: grátis, na conta `830-658-0678` que a loja já tem, com localização travada em Curitiba/PR. Limite conhecido e assumido: enquanto a conta não veicular, o Planejador entrega faixas em vez de médias exatas (§1.6). Para puxar o mesmo dado de forma programática, ele está na Google Ads API (`KeywordPlanIdeaService`), sem custo além do token de desenvolvedor — e isso já está escrito em `conteudo-seo/planejador.js`, com os termos gerados do estoque real e as instruções de configuração no cabeçalho do arquivo.

**Fora do escopo, por decisão de custo:** dados de concorrência orgânica de terceiros — backlinks, ranking de concorrente, *share of voice* — exigiriam ferramenta paga de SEO, e nenhuma está contratada. Nenhuma recomendação deste plano depende deles. O contraditório disponível de graça é o Search Console da própria `motorsstore.com.br`, que diz para que termos o site já aparece e em que posição.  
