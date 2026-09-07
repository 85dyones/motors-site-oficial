import { nomeComAno, type VeiculoNomeavel } from "./nomeDoVeiculo";

/**
 * As mensagens que o visitante manda para a loja a partir da ficha.
 *
 * ---------------------------------------------------------------------------
 * O defeito: a mensagem chega a uma PESSOA, e não dizia qual carro
 * ---------------------------------------------------------------------------
 * As seis mensagens montavam `${marca} ${modelo} ${ano}` dentro dos handlers
 * de clique, sem passar por `nomeDoVeiculo` — que a MESMA página já usa em
 * três outros pontos. A versão do veículo, preenchida e correta no banco, era
 * simplesmente descartada. Medido no estoque em 2026-09-07, nos 38 publicados
 * à venda:
 *
 *   8059102   "Ford Ka 2020"      joga fora  "Sedan 1.0 SE Flex 4p"
 *   8243644   "Honda HR-V 2016"   joga fora  "EX 1.8 Flexone 16v 5p Aut"
 *
 * O Ford Ka é o caso que dói: o pátio tem TRÊS, e o consultor recebia
 * "Ford Ka 2020" sem ter como saber de qual o cliente falava. Não é problema
 * de cadastro — o dado está certo lá; quem o descartava era esta camada.
 *
 * ---------------------------------------------------------------------------
 * Por que um módulo, e não seis interpolações no componente
 * ---------------------------------------------------------------------------
 * Mesma razão de `lib/tituloDaFicha.ts`, e o comentário de lá vale aqui: dentro
 * de um handler de clique de componente cliente, o único teste possível era
 * procurar palavra no arquivo — e um teste desses não percebe quando o
 * COMPORTAMENTO muda, só quando o texto muda.
 *
 * ---------------------------------------------------------------------------
 * O que não mora aqui
 * ---------------------------------------------------------------------------
 * O módulo é puro. `sufixoRef()` lê estado do navegador e `formatPrice` é do
 * componente: os dois entram por parâmetro. Assim o teste dispensa DOM, e o
 * `ref` continua sendo lido no INSTANTE do clique — ele pode ser gravado
 * depois da montagem da página, e o valor fresco é o que tem de viajar.
 *
 * Nota sobre o ano: em 2026-09-07 o dono corrigiu NA FONTE os cadastros que
 * traziam o ano embutido no `modelo` (o Nissan March), e a correção entra no
 * próximo sync. Por isso aqui não há guarda contra ano repetido: dado certo na
 * origem conserta todas as superfícies de uma vez — feed, JSON-LD, ficha,
 * mensagem —, e guarda em código trataria o sintoma numa de cada vez.
 */

/** Em que estado a ficha está quando o visitante escreve. */
export type EstadoDaFicha = "a-venda" | "vendido" | "indisponivel";

/** O nome do carro, sempre pela régua única do projeto. */
function nome(veiculo: VeiculoNomeavel): string {
  return nomeComAno(veiculo);
}

/**
 * O visitante viu o anúncio e quer falar sobre ESTE carro.
 *
 * Três textos, e a diferença entre os dois últimos não é estilo: "não está
 * mais disponível" NÃO afirma a venda. A saída do feed não diz o motivo — pode
 * ser repasse, reserva ou anúncio expirado —, e o consultor não pode receber o
 * cliente com uma venda que talvez não tenha acontecido. É a mesma distinção
 * que `decidirPublicacao` faz entre VENDIDO e INDISPONÍVEL.
 */
export function mensagemDeInteresse(
  veiculo: VeiculoNomeavel,
  estado: EstadoDaFicha,
  ref = "",
): string {
  if (estado === "vendido") {
    return (
      `Olá! Vi o anúncio no site do ${nome(veiculo)} que foi vendido. ` +
      `Gostaria de saber se possuem modelos semelhantes disponíveis.${ref}`
    );
  }
  if (estado === "indisponivel") {
    return (
      `Olá! Vi o anúncio no site do ${nome(veiculo)}, que não está mais disponível. ` +
      `Gostaria de saber se possuem modelos semelhantes.${ref}`
    );
  }
  // Termina em pergunta de propósito: declaração recebe "um momento", pergunta
  // define a primeira resposta do consultor.
  return `Olá! Vi o ${nome(veiculo)} no site e quero mais informações. Ele ainda está disponível?${ref}`;
}

export function mensagemDeDuvidas(veiculo: VeiculoNomeavel, ref = ""): string {
  return `Olá! Estou vendo o ${nome(veiculo)} no site e tenho algumas dúvidas. Pode me ajudar?${ref}`;
}

export function mensagemDeTroca(veiculo: VeiculoNomeavel, ref = ""): string {
  return (
    `Olá! Estou analisando o ${nome(veiculo)} no site e gostaria de avaliar meu veículo ` +
    `como entrada na troca!${ref}`
  );
}

export function mensagemDeTestDrive(veiculo: VeiculoNomeavel, ref = ""): string {
  return (
    `Olá! Quero ver o ${nome(veiculo)} de perto e fazer um test-drive. ` +
    `Quais horários vocês têm nos próximos dias?${ref}`
  );
}

/**
 * O texto que o visitante compartilha da ficha.
 *
 * A linha `📋 {versão}` saiu, e não é perda de informação: `nomeComAno` já
 * carrega a versão POR CONSTRUÇÃO — `nomeDoVeiculo` a acrescenta quando o
 * modelo não a embute, e a devolve embutida quando embute. A linha era, nos
 * dois casos, a mesma informação uma segunda vez:
 *
 *   🚗 BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut - 2020
 *   📋 m40i 3.0 m sport edit v6 turbo aut          ← cópia, em caixa baixa
 *
 * Escrevi primeiro como condicional ("só mostra se acrescentar algo") e a
 * saída contra o estoque real mostrou que a condição nunca é verdadeira —
 * guarda morta fingindo proteger. Se um dia a versão passar a trazer o que o
 * nome não traz, é `nomeDoVeiculo` que muda, e a linha volta de lá.
 */
export function textoDeCompartilhamento(
  veiculo: VeiculoNomeavel,
  { precoTexto, url }: { precoTexto: string; url: string },
): string {
  return `🚗 ${nome(veiculo)}\n💰 ${precoTexto}\n\n🔗 ${url}`;
}
