-- ---------------------------------------------------------------------------
-- Os textos das páginas de hub — 30 de uma vez
-- ---------------------------------------------------------------------------
-- Decisão do dono em 2026-09-01: *"comece pelos textos e escreva o restante
-- sob a recomendação do documento"*. O documento é o relatório "Textos dos
-- Hubs" de 31/08, que trouxe oito prontos e uma fórmula para os demais.
--
-- Sete dos oito entram aqui verbatim — `/estoque/picape` já estava no ar desde
-- 31/08 e o `on conflict do nothing` no fim protege ele e qualquer outro que
-- alguém tenha escrito pelo painel nesse meio-tempo.
--
-- ---------------------------------------------------------------------------
-- A fórmula, e por que ela é assim
-- ---------------------------------------------------------------------------
-- Cada texto tem uma linha de abertura e três parágrafos, nesta ordem:
--
--   1. PARA QUEM  — quem é a pessoa certa para essa página, e quem deveria
--                   olhar outra coisa. Filtra lead ruim antes do WhatsApp.
--   2. O QUE OLHAR — o que se verifica NESSE modelo ou categoria ao comprar
--                   usado. É o parágrafo que só quem mexe com carro escreve.
--   3. POR QUE AQUI — o critério da loja, terminando em convite concreto.
--
-- E uma regra que decide todo o resto: **o texto tem de ser verdadeiro com
-- zero carros na página**. Contagem, preço, faixa de ano e KM mínimo o
-- template já imprime acima, a partir do estoque — repetir aqui duplicaria o
-- que está logo em cima e ficaria errado na semana seguinte. Nenhum dos 30
-- cita número.
--
-- ---------------------------------------------------------------------------
-- `titulo` fica NULO de propósito
-- ---------------------------------------------------------------------------
-- `resolverTextoDoHub` faz `editado.titulo ?? gerado.titulo`, e o gerado é
-- melhor: "Picapes Seminovas em Curitiba" carrega a palavra que a busca usa e
-- a cidade. Sobrescrever o H1 com um título mais curto perderia as duas
-- coisas. Só os parágrafos são override aqui.
--
-- (Consequência a olhar depois: `/estoque/picape`, salvo em 31/08, gravou
-- `titulo = 'Picapes em Curitiba'` e por isso perdeu o "Seminovas" no H1.
-- Não é desfeito aqui — customização do dono não se desfaz sozinha.)
--
-- ---------------------------------------------------------------------------
-- Quais 30, e por que não os 103
-- ---------------------------------------------------------------------------
-- A prioridade é a do relatório, medida no estoque real de hoje:
--
--   carroceria e perfil ... todas as que têm hub (hatch 15, urbano 18,
--                           economico 14, familia 14 na vitrine hoje)
--   faixa de preço ....... as três
--   marca ................ as seis maiores por histórico: volkswagen 24,
--                           chevrolet 17, ford 10, fiat 9, honda 8, renault 6
--   modelo ............... só os RECORRENTES — Saveiro, Onix, Ka, Kombi,
--                           HB20, EcoSport, Duster, Renegade. Modelo de uma
--                           unidade que sai em três semanas não paga o texto.
--
-- Ficaram de fora, deliberadamente: os 57 hubs de modelo não recorrentes, as
-- 10 marcas de cauda e `/estoque/wagon` — este último porque duplica
-- `/estoque/perua` (as duas respondem, as duas vazias) e o certo é unificar a
-- classificação, não escrever texto para as duas.
--
-- As páginas locais (`/seminovos-curitiba`, `/seminovos-bacacheri`) NÃO estão
-- aqui porque não passam por `resolverTextoDoHub` — o texto delas é código.
-- ---------------------------------------------------------------------------

insert into public.textos_de_hub (caminho, paragrafos) values
  ($t$/estoque/suv$t$, array[
    $t$SUV compacto ou médio: a conta que decide$t$,
    $t$A diferença entre um SUV compacto e um médio raramente é o espaço do porta-malas — é o custo de manter. Pneu maior, seguro mais caro e revisão em concessionária pesam todo ano, não só na compra. Se o uso é escola, trabalho e uma viagem no feriado, o compacto entrega quase tudo por bem menos.$t$,
    $t$Em SUV usado, o item que mais custa caro depois é o câmbio automático: peça o histórico de troca de óleo do câmbio, não só o do motor. Nos turbo, desconfie de quem nunca trocou vela no prazo. E em Curitiba vale olhar a suspensão com atenção — paralelepípedo e lombada de bairro maltratam batente e coxim mais do que asfalto liso.$t$,
    $t$Cada SUV do nosso estoque tem laudo cautelar independente na ficha. Estamos no Bacacheri, aceitamos troca e financiamos. Venha dirigir dois modelos no mesmo dia: a diferença entre compacto e médio se resolve no volante em vinte minutos.$t$
  ]),
  ($t$/estoque/primeiro-carro$t$, array[
    $t$Primeiro carro: o que ninguém conta sobre o custo do primeiro ano$t$,
    $t$O preço na vitrine é a menor das contas. No primeiro ano entram IPVA, seguro — mais caro para condutor jovem —, licenciamento e a primeira revisão. Um carro R$ 5.000 mais barato com motor 1.6 e seguro alto sai mais caro que um 1.0 bem cuidado. Some tudo antes de escolher.$t$,
    $t$Para quem está começando, três coisas importam mais que ano de fabricação: peça barata e fácil de achar, direção leve para manobra, e histórico limpo. Carro de leilão ou com sinistro pode custar 20% menos e virar prejuízo na revenda — é exatamente o que o laudo cautelar existe para separar.$t$,
    $t$De cada dez carros que avaliamos, três entram no showroom. Os outros sete reprovaram em algo que você não veria na foto. Estamos no Bacacheri e explicamos o laudo linha por linha — inclusive para quem vem com o pai, a mãe ou o amigo que entende de carro.$t$
  ]),
  ($t$/estoque/trabalho$t$, array[
    $t$Carro de trabalho: disponibilidade vale mais que conforto$t$,
    $t$Quem usa o carro para ganhar dinheiro tem uma métrica diferente: dia parado custa mais que banco de couro. Por isso, na hora de escolher, peça barata e mecânica conhecida vencem acabamento. Um modelo com oficina em toda esquina volta a rodar no mesmo dia; um importado de nicho espera peça por semanas.$t$,
    $t$Em carro de trabalho usado, o que mais engana é a quilometragem baixa demais para a idade. Carro parado estraga diferente de carro rodado: borracha ressecada, embreagem colada, tanque com resíduo. Prefira histórico coerente a número bonito, e confira se as revisões foram feitas por quilometragem, não por sorte.$t$,
    $t$Trabalhamos com troca e financiamento, e todo carro sai com laudo cautelar independente na ficha. Se você precisa fechar rápido porque o carro atual já está parando, avise — a gente organiza a avaliação do seu usado e a proposta no mesmo dia.$t$
  ]),
  ($t$/carros/volkswagen$t$, array[
    $t$Volkswagen usada: por que a revenda segura$t$,
    $t$Volkswagen é a marca que mais aparece no nosso pátio, e não é acaso: peça em qualquer autopeça, mecânico em qualquer bairro e uma fila de compradores na hora de revender. Isso aparece no bolso duas vezes — na manutenção do ano que vem e no valor que você recebe quando trocar.$t$,
    $t$Nos modelos flex mais antigos, verifique o funcionamento do reservatório de partida a frio: em Curitiba ele trabalha muito mais que na média do país, e quem morou em cidade quente pode nunca ter usado o dele. Nos motores TSI, o histórico de óleo é decisivo — turbo não perdoa intervalo esticado.$t$,
    $t$Cada Volkswagen do estoque passa por perícia cautelar independente antes de ir para o showroom do Bacacheri, e o laudo fica na ficha. Aceitamos seu usado na troca. Chame no WhatsApp com o modelo que te interessa e a gente manda o laudo antes de você sair de casa.$t$
  ]),
  ($t$/carros/volkswagen/saveiro$t$, array[
    $t$Saveiro usada: Trendline, Robust ou Cross$t$,
    $t$A Saveiro se divide por vocação. A Robust é a versão sem luxo feita para trabalhar — caçamba maior, acabamento simples, preço menor. A Trendline traz o que o dia a dia pede sem virar carro de passeio. A Cross é a que menos carrega e mais custa. Se o carro vai trabalhar, a Robust costuma ser a compra mais racional.$t$,
    $t$Em Saveiro usada, olhe primeiro a caçamba por baixo e o assoalho: é onde a vida dura aparece. Confira se o engate tem chicote próprio e teste a embreagem em subida com carga — Saveiro que rodou carregada mostra o desgaste aí antes de qualquer outro lugar. Suspensão traseira de mola vencida deixa o carro de nariz empinado vazio.$t$,
    $t$As Saveiros que entram aqui passam por perícia cautelar independente e o laudo fica aberto na ficha. Estamos no Bacacheri, aceitamos troca e financiamos. Vale vir com a carga que você costuma levar: dá para sentir a diferença entre uma cabine simples e uma dupla em cinco minutos de manobra.$t$
  ]),
  ($t$/carros/chevrolet/onix$t$, array[
    $t$Onix usado: hatch ou Plus, aspirado ou turbo$t$,
    $t$Onix e Onix Plus são carros diferentes com o mesmo nome. O Plus é o sedã — porta-malas grande, ideal para quem viaja ou usa aplicativo. O hatch estaciona melhor e custa menos. Entre o 1.0 aspirado e o 1.0 turbo, a conta é honesta: o turbo anda muito mais em estrada, e cobra isso em manutenção e em gasolina de qualidade.$t$,
    $t$No Onix usado, verifique o histórico de troca de óleo com atenção redobrada nos turbo, e teste o câmbio automático em arrancada e em rampa. Nas versões com central multimídia, confirme se o espelhamento do celular funciona de fato — é o item que mais chega com defeito e o que o dono menos declara.$t$,
    $t$Todo Onix daqui tem laudo cautelar independente na ficha, antes de você perguntar. Showroom no Bacacheri, com troca e financiamento. Se estiver decidindo entre o hatch e o Plus, venha ver os dois no mesmo dia — a diferença de porta-malas resolve a dúvida na hora.$t$
  ]),
  ($t$/carros/ford/ka$t$, array[
    $t$Ka usado: hatch e sedã, e o que olhar em cada um$t$,
    $t$O Ka hatch é carro de cidade: leve, econômico e fácil de estacionar. O Ka Sedan resolve o problema de quem precisa de porta-malas sem subir de categoria — é uma das formas mais baratas de ter um sedã de verdade. Entre o 1.0 e o 1.5, o 1.5 faz diferença real em estrada e com o carro cheio.$t$,
    $t$Em Ka usado, confira o funcionamento do ar-condicionado sob sol forte e o estado das buchas da suspensão dianteira: são os itens que mais aparecem em unidades que rodaram muito em cidade. Verifique também se o câmbio manual engata a segunda sem aspereza a frio, algo comum em carro que rodou pouco e ficou parado.$t$,
    $t$Os Ka que passam pela nossa avaliação entram com laudo cautelar independente na ficha. Estamos no Bacacheri e aceitamos seu usado na troca. Diga qual versão te interessa no WhatsApp que a gente manda as fotos reais e o laudo, sem você precisar vir para descobrir.$t$
  ]),
  ($t$/estoque/hatch$t$, array[
    $t$Hatch: por que ele ainda resolve a vida de quase todo mundo$t$,
    $t$É o carro que cabe na vaga curta, no orçamento apertado e na oficina do bairro. Quem faz trajeto de cidade, estaciona na rua e divide garagem raramente precisa de mais do que isso. Já quem viaja com quatro adultos e mala toda semana vai reclamar do porta-malas antes do segundo mês — nesse caso o sedã costuma valer a diferença.$t$,
    $t$O desgaste de cidade aparece em três lugares: buchas e coxins da suspensão dianteira, embreagem nos manuais e o câmbio automatizado, que engasga em rampa quando está no fim. Levante o carpete do porta-malas e olhe a calha do estepe — é onde a infiltração do vidro traseiro se acumula sem ninguém ver, e é barata de resolver cedo e cara depois.$t$,
    $t$Nenhum carro é anunciado antes da perícia cautelar independente, e o laudo fica aberto na ficha. Venha com a medida da sua vaga na cabeça: manobra e visibilidade se resolvem em cinco minutos de test drive, e é o que separa dois carros parecidos no papel.$t$
  ]),
  ($t$/estoque/sedan$t$, array[
    $t$Sedã: porta-malas de verdade, e o que ele cobra em troca$t$,
    $t$O sedã resolve dois problemas que o hatch não resolve: mala de viagem sem rebater banco e conforto de quem vai atrás em trajeto longo. Cobra por isso em comprimento — estacionamento de rua e garagem antiga ficam mais difíceis. Se o carro vive em vaga apertada e quase nunca sai da cidade, o porta-malas extra vira metro que atrapalha todo dia.$t$,
    $t$Em sedã usado, olhe a região do para-choque traseiro e as bordas do porta-malas: é onde aparecem os toques de baliza que a foto esconde. Abra o forro lateral do porta-malas e confira o assoalho por baixo do estepe. Nos que rodaram por aplicativo, o banco traseiro e as maçanetas de trás contam a verdade que o hodômetro não conta.$t$,
    $t$Periciamos por empresa independente antes de anunciar, e o laudo fica na ficha. Traga a mala que você realmente usa e ponha dentro — é a única forma honesta de saber se o porta-malas resolve o seu caso ou se você está pagando por espaço que não vai usar.$t$
  ]),
  ($t$/estoque/perua$t$, array[
    $t$Perua: o espaço de um SUV sem a altura e sem o consumo$t$,
    $t$A perua entrega porta-malas de utilitário mantendo altura e comportamento de carro baixo — dirige melhor, gasta menos e cabe em garagem de prédio antigo. Quem precisa de espaço mas nunca sai do asfalto costuma achar aqui a conta mais racional. Quem enfrenta estrada de terra ou meio-fio alto toda semana vai sentir falta do vão livre.$t$,
    $t$É uma carroceria que envelhece pela traseira: verifique as molas e os batentes traseiros, que passaram a vida carregando peso, e teste o funcionamento do vidro e do limpador da tampa. Borracha do vidro traseiro ressecada é infiltração certa no assoalho do porta-malas — olhe embaixo do carpete antes de qualquer outra coisa.$t$,
    $t$A perícia é independente e vem antes do anúncio; o laudo fica na ficha. Esta página continua no ar mesmo sem unidade disponível: é um formato que a loja compra quando aparece bem cuidado, então vale avisar o que você procura para a gente buscar.$t$
  ]),
  ($t$/estoque/van$t$, array[
    $t$Van e furgão: quem compra pelo cubo, não pelo motor$t$,
    $t$Van se escolhe pelo volume de carga ou pelo número de assentos, nessa ordem — desempenho vem depois. Para entrega urbana, o que importa é altura interna, largura entre caixas de roda e altura da soleira, que decide se o carregamento é no braço ou no carrinho. Quem vai usar como passeio precisa saber que a dirigibilidade não se compara à de um carro.$t$,
    $t$O que mais custa caro depois é a estrutura embaixo do assoalho de carga: olhe as travessas e as bordas das portas laterais, onde carga mal amarrada bate a vida inteira. Confira também as corrediças da porta de correr, o estado das dobradiças traseiras e se as borrachas ainda vedam — porta de van desalinhada entra água e barulho.$t$,
    $t$O laudo cautelar independente fica na ficha desde o primeiro dia do anúncio. Venha com a carga que você transporta, ou com as medidas dela: em dez minutos dá para saber se cabe de pé, deitada, ou se não cabe — e isso não se descobre por foto.$t$
  ]),
  ($t$/estoque/utilitario$t$, array[
    $t$Utilitário: a compra que se paga em disponibilidade$t$,
    $t$Utilitário é ferramenta. Quem compra está resolvendo um problema de trabalho, e a métrica muda: dia parado custa mais que acabamento, e peça fácil vale mais que folha de especificação. Se o veículo vai fazer volume de entrega ou obra, mecânica conhecida e rede de oficina pesam mais na conta do ano do que qualquer item de conforto.$t$,
    $t$Olhe primeiro o chassi e as fixações da carroceria, depois a suspensão traseira: é onde a sobrecarga aparece antes de aparecer no motor. Feixe de molas com folha trocada, batente esmagado e amortecedor suando contam que o veículo andou pesado. Confira também se o histórico de revisão acompanha a quilometragem, e não o calendário.$t$,
    $t$Periciamos todos por empresa independente, e o laudo fica na ficha. Se você precisa fechar rápido porque o veículo atual já está parando, avise na primeira mensagem: a gente organiza a avaliação do seu usado e a proposta no mesmo dia, para não deixar você a pé.$t$
  ]),
  ($t$/estoque/urbano$t$, array[
    $t$Carro de cidade: o que faz diferença no trânsito de todo dia$t$,
    $t$Para quem roda quase só na cidade, três coisas importam mais que potência: direção leve para manobra, visibilidade traseira e câmbio que não canse no engarrafamento. Motor grande em trajeto curto é dinheiro parado — consome mais, esquenta menos e desgasta pior. Quem faz estrada com frequência deve olhar outra coisa, porque aqui a escolha é feita para o outro extremo.$t$,
    $t$Trânsito parado castiga o que ninguém olha na compra: embreagem, coxim de motor e sistema de arrefecimento. Peça para ver o carro já quente, com o ar ligado, e observe o ponteiro de temperatura em marcha lenta. Em automático, teste as trocas nas primeiras marchas em subida lenta — é ali que o câmbio cansado se entrega, e não em aceleração forte.$t$,
    $t$Curitiba tem paralelepípedo, lombada e frio de manhã, e as três coisas aparecem no carro — por isso a perícia é independente e vem antes do anúncio, com laudo na ficha. Venha dirigir no fim da tarde, no trânsito real: é o teste que o quarteirão vazio nunca faz.$t$
  ]),
  ($t$/estoque/economico$t$, array[
    $t$Econômico não é só consumo: é a conta do ano inteiro$t$,
    $t$Carro econômico de verdade é o que custa pouco para andar E pouco para manter. Consumo é a parte visível; seguro, IPVA, pneu, revisão e preço de peça são a parte que aparece depois. Um modelo com um quilômetro por litro a mais e peça cara costuma perder a conta no primeiro conserto — vale somar tudo antes de decidir.$t$,
    $t$Em carro de baixo consumo, verifique se as revisões foram feitas por quilometragem e não por sorte, e olhe a vela e o filtro de ar: motor pequeno mal mantido perde eficiência rápido e o dono nem percebe. Nos flex, teste a partida a frio de manhã cedo. Em Curitiba o reservatório de partida trabalha muito mais que na média do país.$t$,
    $t$Nenhum carro chega à vitrine sem perícia independente, e o laudo fica aberto na ficha. Diga quantos quilômetros você roda por mês e qual é o trajeto: com isso a gente compara duas opções pela conta real do ano, não pelo número da tabela.$t$
  ]),
  ($t$/estoque/familia$t$, array[
    $t$Carro de família: o teste é a cadeirinha, não a ficha técnica$t$,
    $t$Família muda a lista de prioridades: espaço atrás, porta-malas que engole carrinho e portas traseiras que abrem o suficiente para instalar cadeirinha sem contorcionismo. Quem tem duas crianças descobre que largura do banco traseiro importa mais que potência. Se o uso é de casal sem passageiro fixo atrás, quase tudo isso vira espaço pago e não usado.$t$,
    $t$Confira os pontos de fixação Isofix e o cinto central traseiro — muita gente descobre tarde que o modelo escolhido só tem dois pontos. Verifique também o funcionamento dos travamentos de segurança das portas traseiras e o estado do estofamento sob a capa. E teste o ar-condicionado na traseira, se houver: é o item que mais chega com defeito.$t$,
    $t$O laudo da perícia independente fica na ficha antes de você perguntar. Traga a cadeirinha que você usa e o carrinho: instalar e guardar leva cinco minutos e responde de uma vez a dúvida que nenhuma especificação responde.$t$
  ]),
  ($t$/estoque/estrada$t$, array[
    $t$Carro de estrada: estabilidade e fôlego valem mais que zero a cem$t$,
    $t$Quem faz estrada com frequência precisa de outra coisa: motor que rode em rotação baixa na velocidade de cruzeiro, câmbio com marcha longa e conforto de suspensão em piso ruim. Aceleração de arrancada quase não aparece nesse uso. Já quem só roda na cidade paga por esse pacote todo mês em consumo urbano e não usa quase nada dele.$t$,
    $t$Em carro que rodou estrada, a quilometragem alta assusta menos do que parece — é o uso menos agressivo que existe. O que precisa ser conferido é outro: alinhamento e desgaste irregular dos pneus, folga na direção em velocidade, e o histórico de troca de fluido de freio. Olhe o para-brisa contra a luz: micro-riscos de estrada cansam a vista à noite.$t$,
    $t$Periciamos por empresa independente antes de anunciar, com o laudo na ficha. Se der, inclua um trecho de via rápida no test drive: comportamento acima de oitenta e ruído de cabine não aparecem em volta no quarteirão, e são exatamente o que você vai sentir todo fim de semana.$t$
  ]),
  ($t$/estoque/performance$t$, array[
    $t$Carro de performance usado: o histórico vale mais que a potência$t$,
    $t$Aqui a escolha é emocional e tudo bem — mas a manutenção não é. Motor turbo, freio maior e pneu de perfil baixo custam por ano o que um carro simples custa em três. Quem vai usar como único carro da casa precisa fazer essa conta antes. Quem tem um segundo carro para o dia a dia aproveita muito mais e gasta menos.$t$,
    $t$O que mais importa é o histórico: intervalo de óleo curto e respeitado, e nenhum indício de preparação. Procure furos ou emendas no chicote, central remapeada e escapamento fora do original — modificação some antes da venda e a conta fica com o próximo dono. Verifique disco e pastilha, e desconfie de pneu novo barato num carro que pede pneu caro.$t$,
    $t$A perícia independente vem antes do anúncio e o laudo fica na ficha. Chame para conversar antes de vir: nesse tipo de carro a procedência decide a compra, e a gente prefere mandar o laudo por WhatsApp a deixar você descobrir alguma coisa no balcão.$t$
  ]),
  ($t$/estoque/ate-60-mil$t$, array[
    $t$Nesta faixa, procedência vale mais do que ano de fabricação$t$,
    $t$É a faixa de quem está comprando o primeiro carro, o segundo da casa ou uma ferramenta de trabalho. O erro mais comum é gastar o orçamento inteiro no carro e não sobrar para documentação, seguro e a primeira revisão. Vale reservar uma parte antes de escolher: carro mais barato com histórico limpo bate carro mais novo de origem duvidosa.$t$,
    $t$Nesta faixa aparecem os carros que mais mudaram de dono, e é aí que o laudo cautelar deixa de ser detalhe. Sinistro de médio porte, chassi remarcado e leilão são exatamente o que faz um veículo custar menos do que deveria. Verifique também se o número do motor confere e se as revisões têm registro — não só a promessa de que foram feitas.$t$,
    $t$De cada dez veículos que avaliamos, três entram. Os outros sete reprovam em algo que não se vê na foto, e o laudo do que entrou fica na ficha. Venha ver o laudo antes do carro: aqui ele é a primeira coisa que a gente abre, não a última.$t$
  ]),
  ($t$/estoque/60-a-100-mil$t$, array[
    $t$A faixa em que dá para escolher: use isso a seu favor$t$,
    $t$É onde a oferta é maior e a decisão fica difícil justamente por isso. Aqui você não está mais comprando o que dá — está escolhendo entre categorias diferentes pelo mesmo dinheiro: um hatch bem equipado, um sedã mais simples ou um SUV compacto de entrada. A pergunta útil não é qual é melhor, e sim qual erra menos no seu uso real.$t$,
    $t$Com mais opções, o desempate costuma vir da manutenção. Compare o preço de um jogo de pneus e de uma revisão dos dois modelos que você está considerando: a diferença anual costuma ser maior que a diferença de preço na compra. E verifique a central multimídia e os itens elétricos de conforto, que são caros e chegam com defeito com frequência.$t$,
    $t$Todo carro é periciado por empresa independente antes de ser anunciado, com laudo na ficha. Se estiver entre dois, venha ver os dois no mesmo dia: vinte minutos de volante resolvem uma dúvida que semanas de comparativo na internet não resolvem.$t$
  ]),
  ($t$/estoque/acima-100-mil$t$, array[
    $t$Acima de cem mil, o que você compra é histórico$t$,
    $t$Nessa faixa o carro costuma ser mais novo, mais equipado e mais complexo — e cada uma dessas três coisas encarece o conserto. Quem compra aqui geralmente já sabe o que quer; o que muda o resultado é a procedência da unidade específica, não o modelo. Um exemplar bem cuidado e outro negligenciado do mesmo carro são compras completamente diferentes.$t$,
    $t$Peça o histórico de manutenção item por item, com atenção ao câmbio automático e, nos turbo, ao intervalo de óleo. Teste toda a eletrônica com calma: sensores, câmeras, assistentes e ar-condicionado digital são o que mais aparece com defeito e o que menos se declara. E confira se os pneus são do tamanho e da carga originais — trocar por barato aqui sai caro.$t$,
    $t$A perícia é independente, vem antes do anúncio, e o laudo fica aberto na ficha. Marque com hora: nessa faixa vale reservar um test drive mais longo e conferir a documentação junto, com calma, em vez de decidir no fim da tarde de sábado.$t$
  ]),
  ($t$/carros/chevrolet$t$, array[
    $t$Chevrolet usada: rede grande e peça em qualquer esquina$t$,
    $t$É uma das marcas mais fáceis de manter no Brasil, e isso decide mais do que parece: oficina em qualquer bairro, peça de reposição barata e um mercado grande na hora de revender. Para quem usa o carro todo dia e não quer depender de especialista, essa previsibilidade costuma valer mais do que qualquer item de série.$t$,
    $t$Nos motores mais recentes de três cilindros, o histórico de óleo é decisivo — turbo não perdoa intervalo esticado. Nas versões com câmbio automático, teste arrancada e rampa antes de fechar. E confira a central multimídia com o seu celular na mão: o espelhamento é o item que mais chega com defeito e o que o dono menos declara.$t$,
    $t$Periciamos por empresa independente antes de anunciar, e o laudo fica na ficha. Diga qual modelo te interessa no WhatsApp: a gente manda as fotos reais e o laudo antes de você sair de casa.$t$
  ]),
  ($t$/carros/ford$t$, array[
    $t$Ford usada: o que mudou depois da saída da fábrica do país$t$,
    $t$A marca deixou de produzir no Brasil, e isso assusta mais do que deveria — a rede de peças de reposição dos modelos de volume continua ampla, porque são carros que rodam às centenas de milhares por aí. O que exige atenção é o oposto: modelos de nicho e importados de baixo volume, onde peça específica pode virar espera longa.$t$,
    $t$Nos motores três cilindros, verifique o histórico de óleo e o funcionamento da correia banhada, que tem prazo e não avisa. No câmbio automático de dupla embreagem, teste trocas em baixa velocidade e em rampa, que é onde a hesitação aparece. Confira também o ar-condicionado sob sol forte e as buchas da suspensão dianteira nos que rodaram muito na cidade.$t$,
    $t$Nenhuma unidade é anunciada antes da perícia independente, e o laudo fica na ficha. Se a sua dúvida for justamente peça e manutenção, pergunte antes de vir — a gente responde com o que a oficina cobra de verdade, não com o que seria bonito dizer.$t$
  ]),
  ($t$/carros/fiat$t$, array[
    $t$Fiat usada: manutenção barata e um mercado que sempre absorve$t$,
    $t$É a marca com a maior oferta de peça alternativa do país, e isso puxa o custo de manutenção para baixo de forma consistente. Para quem faz muitos quilômetros ou usa o carro para trabalhar, esse é um argumento concreto. A contrapartida é que a oferta grande também significa exemplares muito rodados no mercado — a escolha da unidade pesa mais aqui.$t$,
    $t$Verifique a suspensão dianteira e o assoalho nos que rodaram em piso ruim, e teste a embreagem em subida com carga nos utilitários. Nos flex mais antigos, confira o reservatório de partida a frio: em Curitiba ele trabalha muito mais que na média do país, e quem morou em cidade quente pode nunca ter usado o dele.$t$,
    $t$O laudo da perícia independente fica aberto na ficha desde o anúncio. Chame no WhatsApp com o modelo e o ano que te interessam: a gente já manda o laudo junto das fotos, sem você precisar pedir.$t$
  ]),
  ($t$/carros/honda$t$, array[
    $t$Honda usada: durabilidade que aparece na revenda$t$,
    $t$Honda é a marca em que a manutenção preventiva mais compensa: motor que passa dos duzentos mil quilômetros sem drama quando o óleo foi respeitado, e um mercado de revenda que reconhece isso no preço. Em compensação, peça original é mais cara que a média, e é por isso que histórico de manutenção pesa tanto na escolha da unidade.$t$,
    $t$Peça a nota das revisões, não só a palavra do dono. Nos câmbios automáticos CVT, teste a resposta em retomada e desconfie de trepidação em aceleração constante. Verifique também os coxins de motor e o estado das borrachas de porta — em carro que ficou muito tempo parado, borracha ressecada e bateria fraca costumam andar juntas.$t$,
    $t$A perícia é independente e vem antes da vitrine, com o laudo na ficha. Se você já tem um exemplar em vista, mande o modelo e o ano: a gente compara com o que temos e diz honestamente se vale a pena trocar.$t$
  ]),
  ($t$/carros/renault$t$, array[
    $t$Renault usada: preço de entrada convidativo, manutenção que pede atenção$t$,
    $t$A marca costuma oferecer mais carro por menos dinheiro no usado, e isso é real. O que equilibra a conta é a manutenção: alguns componentes pedem oficina que conheça a marca, e improviso sai caro. Para quem tem um mecânico de confiança familiarizado, a relação é excelente; para quem vai rodar oficina por oficina, vale considerar.$t$,
    $t$Verifique o histórico da correia dentada e da bomba d água, que têm prazo e não avisam. Teste a parte elétrica com calma — vidros, travas, painel e sensores —, porque é o capítulo que mais aparece. No câmbio automático, avalie as trocas a frio e a quente. E confira se as revisões seguiram a quilometragem, não o calendário.$t$,
    $t$Periciamos todos por empresa independente, e o laudo fica aberto na ficha. Pergunte pelo histórico de manutenção antes de vir: é a informação que mais muda a decisão nessa marca, e a gente prefere dizer antes do que você descobrir depois.$t$
  ]),
  ($t$/carros/volkswagen/kombi$t$, array[
    $t$Kombi usada: ferramenta de trabalho ou projeto de coleção$t$,
    $t$Existem duas Kombis no mercado, e elas não têm nada a ver uma com a outra. A de trabalho ainda faz entrega urbana como poucas: cubo grande, mecânica simples e peça em qualquer lugar. A de coleção é outra compra, com outro critério e outro preço. Decidir de qual delas você está atrás é o primeiro passo — misturar as duas leva a arrependimento.$t$,
    $t$Olhe a lataria de baixo para cima: soleira, caixa de roda e a emenda do assoalho com as laterais, onde a ferrugem começa escondida. Verifique as corrediças e as dobradiças da porta lateral, e se as portas fecham sem forçar. Na mecânica, o ponto clássico é o arrefecimento a ar e a vedação do motor — motor suando é conversa antes de proposta.$t$,
    $t$A perícia independente vem antes do anúncio e o laudo fica na ficha. Esta página continua no ar mesmo sem unidade disponível: é um veículo que a loja compra quando aparece bem cuidado, então vale avisar o que você procura para a gente buscar.$t$
  ]),
  ($t$/carros/hyundai/hb20$t$, array[
    $t$HB20 usado: por que ele revende tão bem$t$,
    $t$É um dos hatches mais procurados do país no usado, e isso tem efeito prático duplo: você paga um pouco mais na compra e recebe um pouco mais na revenda. Para quem troca de carro a cada três ou quatro anos, a conta costuma fechar a favor. Para quem vai ficar dez anos com o carro, o prêmio de revenda importa bem menos.$t$,
    $t$Verifique o histórico de troca de óleo com atenção redobrada nas versões turbo, e teste o câmbio automático em arrancada e em rampa. Nas versões com central multimídia, confirme o espelhamento com o seu próprio celular. Olhe também as buchas da suspensão dianteira e o alinhamento dos pneus: uso urbano intenso aparece aí antes de qualquer outro lugar.$t$,
    $t$Nenhum carro vai à vitrine sem perícia independente, e o laudo fica aberto na ficha. Diga qual versão te interessa no WhatsApp: a gente manda as fotos reais e o laudo antes de você se deslocar.$t$
  ]),
  ($t$/carros/ford/ecosport$t$, array[
    $t$EcoSport usado: o SUV compacto que cabe em garagem de verdade$t$,
    $t$Foi o SUV compacto mais vendido do país por muito tempo, e por um motivo prático: altura de embarque e posição de dirigir de SUV com dimensões de hatch. Quem quer sentar alto e continuar estacionando em vaga curta encontra aqui a solução mais direta. Quem precisa de porta-malas grande deve olhar outra categoria, porque não é o forte dele.$t$,
    $t$Verifique o estepe externo, quando houver: a dobradiça e a fechadura da tampa traseira sofrem com o peso e desalinham. Teste o câmbio automático em rampa e confira o histórico de óleo. Olhe também as borrachas do teto e das colunas, e o assoalho do porta-malas por baixo do carpete, onde infiltração de tampa traseira se acumula sem aviso.$t$,
    $t$Periciamos por empresa independente antes de anunciar, com o laudo na ficha. Venha com a medida da sua garagem: a diferença entre este e um SUV médio é justamente o que decide se o carro entra fácil ou se vira manobra todo dia.$t$
  ]),
  ($t$/carros/renault/duster$t$, array[
    $t$Duster usado: o SUV que aceita estrada de terra sem drama$t$,
    $t$O Duster é procurado por quem realmente sai do asfalto de vez em quando: vão livre alto, suspensão de curso longo e mecânica sem firula. Para sítio, estrada de terra e meio-fio alto, resolve com folga. Quem vive só na cidade paga por um vão e um consumo que não vai usar, e provavelmente se dá melhor com um SUV compacto de rua.$t$,
    $t$Se o exemplar rodou fora do asfalto, olhe por baixo antes de tudo: proteção de cárter amassada, barras de direção e coifas de semieixo rasgadas. Verifique a correia dentada e a bomba d água pelo prazo, não pela aparência. Nas versões automáticas, teste as trocas a frio, e confira a parte elétrica com calma, item por item.$t$,
    $t$O laudo da perícia independente fica na ficha desde o anúncio. Se o seu uso inclui terra com frequência, diga isso na primeira conversa: muda o que a gente olha na avaliação e o que a gente te recomenda de verdade.$t$
  ]),
  ($t$/carros/jeep/renegade$t$, array[
    $t$Renegade usado: escolha primeiro o motor, depois a versão$t$,
    $t$No Renegade a decisão que mais pesa não é o pacote de itens, é a motorização. Flex e diesel entregam experiências e custos diferentes, e a tração integral só se justifica para quem realmente sai do asfalto. Quem vai usar na cidade e viajar no feriado costuma achar a versão mais simples suficiente — e economiza duas vezes, na compra e na manutenção.$t$,
    $t$Nas versões diesel, o histórico de manutenção é decisivo e o uso urbano curto castiga o sistema de escape. Peça o registro das revisões. No câmbio automático, teste rampa e retomada. Confira também o funcionamento de todos os sensores e câmeras, e olhe o assoalho e as caixas de roda nos exemplares que rodaram fora do asfalto.$t$,
    $t$A perícia é independente e vem antes da vitrine; o laudo fica na ficha, antes de você perguntar. Conte como você vai usar antes de escolher a versão — é a conversa que mais evita compra errada nesse modelo, e leva cinco minutos.$t$
  ])
on conflict (caminho) do nothing;

-- ---------------------------------------------------------------------------
-- Aceite — prova que os textos existem E que valem a regra
-- ---------------------------------------------------------------------------
do $$
declare
  falhas   int := 0;
  total    int;
  curtos   int;
  com_num  int;
  picape   text;
begin
  select count(*) into total from public.textos_de_hub;
  if total < 31 then
    falhas := falhas + 1;
    raise warning 'FALHOU: só % texto(s) na tabela — a inserção não chegou', total;
  end if;

  -- Três parágrafos e uma abertura: menos que isso é texto pela metade.
  select count(*) into curtos
    from public.textos_de_hub where coalesce(array_length(paragrafos, 1), 0) < 4;
  if curtos > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % hub(s) com menos de 4 parágrafos', curtos;
  end if;

  -- A regra que decide todo o resto: verdadeiro com ZERO carros na página.
  -- O que a quebra é número VINDO DO ESTOQUE — contagem, preço mínimo,
  -- disponibilidade. Esse envelhece na semana seguinte e duplica o que o
  -- template já imprime logo acima.
  --
  -- Número ILUSTRATIVO não entra na régua, e a primeira versão desta checagem
  -- reprovava um: o texto do primeiro carro diz *"um carro R$ 5.000 mais
  -- barato com motor 1.6 e seguro alto sai mais caro que um 1.0 bem cuidado"*.
  -- É um exemplo de raciocínio, não uma oferta — não envelhece e não repete
  -- nada que esteja acima na página.
  select count(*) into com_num
    from public.textos_de_hub
   where array_to_string(paragrafos, ' ') ~ '(a partir de R\$|[0-9]+ (no estoque|unidades|carros disponíveis|veículos disponíveis)|temos [0-9]+)';
  if com_num > 0 then
    falhas := falhas + 1;
    raise warning 'FALHOU: % hub(s) citam contagem ou preço no texto', com_num;
  end if;

  -- A customização de 31/08 continua de pé, título incluído.
  select titulo into picape from public.textos_de_hub where caminho = '/estoque/picape';
  if picape is distinct from 'Picapes em Curitiba' then
    falhas := falhas + 1;
    raise warning 'FALHOU: o texto de /estoque/picape foi sobrescrito (titulo: %)', picape;
  end if;

  if falhas > 0 then
    raise exception 'ACEITE FALHOU: % problema(s) nos textos dos hubs', falhas;
  end if;

  raise notice 'Textos OK: % hubs com texto próprio, nenhum com número, /estoque/picape preservado.', total;
end $$;

insert into supabase_migrations.schema_migrations (version, name)
  values ('20260901130000', 'textos_dos_hubs')
  on conflict (version) do nothing;
