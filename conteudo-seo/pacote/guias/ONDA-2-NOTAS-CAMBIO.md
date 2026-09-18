# Onda 2 — notas das peças 12 e 13

Acompanha `12-cambio-dupla-embreagem-usado.md` e `13-vicio-oculto-carro-usado.md`.
Separa o que é **conhecimento técnico geral** (verificável em qualquer literatura
do assunto, e que a loja não precisa comprovar) do que é **prática da casa**
(vem só do arquivo de fatos confirmado pelo dono em 17/09/2026) — e lista o que
ficou faltando.

A régua: técnica pode ser afirmada como técnica; prática só pode ser afirmada se
estiver nos fatos. Nenhuma das duas peças atribui estatística, prevalência ou
preço à loja.

---

## 1. O que veio de conhecimento técnico geral

Nada aqui é dado da Motors Store, e nenhum item foi quantificado.

**Peça 12 — dupla embreagem.** Como o mecanismo funciona: duas embreagens, uma
para as marchas ímpares e outra para as pares e a ré; pré-seleção da marcha
seguinte; a troca como passagem de torque entre as duas. As duas famílias, a
seco e banhada em óleo, e a diferença de refrigeração e de torque suportado. O
módulo hidráulico e eletrônico com sensores e atuadores. A ausência de conversor
de torque, e a consequência dela: a embreagem patina de forma controlada para o
carro sair do lugar, e patinar gera calor. Os componentes que concentram custo de
reparo: kit de embreagem, módulo, atuadores e garfos, volante bimassa.

Também é técnica a separação entre comportamento de projeto (pausa na saída,
comportamento diferente a frio, hesitação em fila lenta, ausência do "rastejo" de
um automático de conversor) e sintoma de avaria (trepidação na saída, solavanco
entre primeira e segunda, atraso de engate, engate que escapa, superaquecimento,
cheiro de queimado). Os roteiros de test-drive — frio, trânsito parado, rampa,
faixa completa de marchas, modo manual — são método, não medição.

**Peça 13 — vício oculto.** A descrição conceitual de vício oculto (já existia,
não era perceptível num exame comum, compromete uso ou valor) e o contraste com
defeito aparente, desgaste natural e dano posterior. As quatro razões pelas quais
certeza absoluta não existe: história não reconstruível, inspeção como foto de um
dia, fadiga de material que não avisa, sintoma intermitente. O que reduz risco
sem eliminá-lo: exame por quem não vende, histórico com nota, avaliação mecânica
separada para conjunto caro, test-drive longo começando a frio.

**O que foi deliberadamente omitido por ser número sem fonte:** preço de kit de
embreagem, de módulo ou de mão de obra; quilometragem típica de vida útil de
embreagem; percentual de carros com dupla embreagem que apresentam o defeito;
qualquer ranking de modelos ou marcas. Nenhuma faixa estimada entrou — quando o
leitor precisa de valor, o texto o manda pedir orçamento à oficina.

## 2. O que veio dos fatos da casa

Tudo abaixo está no arquivo de fatos de 17/09. Nada foi ampliado.

| Afirmação nas peças | Fato |
|---|---|
| Perícia cautelar independente em todo veículo, antes da vitrine | Operação |
| A cautelar olha identificação, estrutura e histórico; não abre motor, não mede compressão, não avalia bomba de alta | Operação |
| O crivo de 120 pontos é da cautelar, não da mecânica | Operação (peça 13) |
| Perícia mecânica só nos carros que levantam suspeita; sob demanda e exploratória | Operação |
| Os gatilhos de câmbio: solavanco no engate, atraso para entrar a marcha, trepidação na arrancada em dupla embreagem, óleo escuro ou com cheiro de queimado | Gatilhos confirmados |
| Os gatilhos gerais citados na peça 13 (motor, arrefecimento, rodagem, histórico) | Gatilhos confirmados |
| Troca de óleo e filtros em todo carro que entra | Operação |
| Não existe registro da etapa mecânica entregue ao cliente; ele pode solicitar | Operação. As duas peças dizem isso em voz alta |
| De cada dez carros avaliados, três entram | Operação |
| O laudo fica com o vendedor e sai a pedido | Regra de escrita 1 |
| Não compramos dupla embreagem com trepidação na saída, solavanco entre 1ª e 2ª, atraso de engate ou mensagem de superaquecimento | O que a loja não compra |
| Carro que exige abrir motor ou câmbio para saber o estado real não entra | O que a loja não compra |
| Garantia: 3 meses da entrega, sem carência, sem franquia, sem termo de isenção, mão de obra inclusa | Garantia da loja |
| Cobre falha interna de motor, câmbio e diferencial | Garantia da loja — ver pendência 3 |
| Não cobre desgaste, manutenção, embreagem em uso normal, bombas, fluidos, remap, peça fora de especificação, evento externo, transporte, guincho, alimentação e hospedagem | Garantia da loja |
| Avisar a loja antes de levar a qualquer oficina | Garantia da loja, regra mais importante |
| Conserto em oficina parceira credenciada indicada pela loja; mais de quinze, por especialidade | Operação |
| Existe limite de quilometragem, citado sem número | Garantia da loja — valor não informado |
| Plano estendido, opcional, à parte, administrado pela Gestauto; não cobre kit de embreagem; exige óleo e filtro a cada 7.000 km ou 6 meses com nota | Plano Gestauto. Só isso foi citado |
| Contratar o plano é opcional e não muda preço, financiamento nem entrega | Plano Gestauto + trava de venda casada |

**Do plano estendido, só entrou o que é carregador de sentido para estas duas
peças** — a exclusão do kit de embreagem na 12 e a existência do plano como
opção na 13. Prazos vendidos, elegibilidade, lista completa de cobertura,
acionamento, teto de reparo e transferência ficaram de fora: são da peça do
plano, que é do dono.

## 3. Decisões de forma que valem registro

**Corpo em texto puro.** As duas peças não têm tabela, lista com hífen, negrito
nem link escrito no corpo — só o CTA final. É a regra 7 dos fatos e é também o
que o renderizador exige (`src/app/guias/[slug]/page.tsx` serve parágrafo como
texto puro). Isso contraria a anatomia do `00-guia-normativo.md`, que pede
"tabela sempre que houver comparação": onde havia comparação, ela virou parágrafo
com ponto e vírgula, como a Onda 1 já fez na conversão para o banco. As tabelas
que sobraram nos arquivos são de implementação e não vão para o site.

**Citação por título, nunca por link.** A peça 12 cita "Motores turbo de baixa
cilindrada: o que checar" (pilar da Onda 2, escrito por outro agente) e
"Vício oculto em carro usado: o que é e o que não é". A peça 13 cita "Câmbio de
dupla embreagem em carro usado: o que checar". Nenhuma é link — viram link quando
os títulos entrarem em `TERMOS_COM_DESTINO`, o que é trabalho do dono da onda.
Cada arquivo traz, no bloco de links internos, o termo sugerido.

**Nada de laudo na ficha.** As oito peças da Onda 1 em markdown ainda afirmam
que o resultado da perícia fica publicado na ficha do veículo; o banco já foi
corrigido (`guias-onda-1-mudancas.md`). Estas duas peças nasceram com a redação
nova: o laudo fica com o vendedor e sai a pedido.

## 4. O que faltou do dono

1. **Limite de quilometragem da garantia.** Existe, e o valor não foi informado.
   As duas peças dizem "dentro do limite de quilometragem previsto no contrato",
   sem número. Com o número, a frase melhora nas duas e na `/garantia`.
2. **A `/garantia` publicada ainda fala só em motor e câmbio.** O contrato traz o
   diferencial, e a peça 13 o cita. Enquanto a página não citar, o guia promete
   mais que o hub — que é exatamente o que a T3 proíbe. Ou a página passa a citar
   o diferencial, ou a peça 13 recua para dois conjuntos. **É a única pendência
   que bloqueia a publicação da 13.**
3. **Revisão jurídica da peça 13.** Ela descreve vício oculto em termos gerais,
   sem artigo, sem prazo, sem afirmar obrigação da loja, e encaminha a Procon ou
   advogado. Ainda assim é a peça de maior exposição da onda.
4. **O teste de dupla embreagem faz parte da avaliação do time?** A peça 12
   afirma que quem testa o câmbio é o time, no volante, porque a cautelar não
   alcança — isso é dedução a partir dos gatilhos confirmados, não um fato
   escrito. Se existir um roteiro de test-drive padronizado na avaliação, ele
   merece uma frase própria, e é um ativo que nenhuma revenda publica.
5. **Registro da etapa mecânica.** As duas peças dizem que ele não existe e que o
   cliente pode solicitar. Quando o termo de revisões existir, as duas mudam — e
   é a melhoria de maior efeito nas duas, porque transforma "pergunte ao
   vendedor" em documento.
6. **Quilometragem e idade do estoque com dupla embreagem.** Nenhuma peça cita
   prevalência ("x% do nosso estoque tem DCT") porque não há medição. Se o ERP
   souber responder, a peça 12 ganha um dado próprio e passa a atrair citação —
   com amostra, período e método declarados no texto, como a régua exige.
