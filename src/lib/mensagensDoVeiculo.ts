import { nomeComAno, type VeiculoNomeavel } from "./nomeDoVeiculo";

/**
 * As mensagens que o visitante manda para a loja a partir da ficha.
 *
 * ---------------------------------------------------------------------------
 * Por que isto é um módulo, e não seis interpolações no `PDPClientWrapper`
 * ---------------------------------------------------------------------------
 * Mesma razão de `lib/tituloDaFicha.ts`, e vale repetir: eram seis strings
 * montadas dentro de handlers de clique de um componente de cliente, e o único
 * teste possível era procurar palavras no arquivo — teste que não percebe
 * quando o comportamento muda, só quando o texto muda.
 *
 * E o comportamento estava errado. As mensagens montavam
 * `${marca} ${modelo} ${ano}` cru, sem passar por `nomeDoVeiculo`, enquanto a
 * mesma página nomeava o carro por ele em três outros pontos. Dois defeitos
 * medidos no estoque em 2026-09-07:
 *
 *   Nissan March 1.6 Rio 2016 2016   o ano em dobro — o `modelo` já o embute
 *   Ford Ka 2020                     sem a versão, e o pátio tem TRÊS Ford Ka
 *
 * O segundo é o mais caro, e não aparece em relatório nenhum: a mensagem chega
 * a uma PESSOA, e o consultor não tem como saber de qual Ka o cliente falou.
 *
 * ---------------------------------------------------------------------------
 * O que não mora aqui
 * ---------------------------------------------------------------------------
 * O módulo é puro. `sufixoRef()` lê estado do navegador e `formatPrice` é do
 * componente: os dois entram por parâmetro. Assim o teste não precisa de DOM,
 * e o `ref` continua sendo lido no INSTANTE do clique — ele pode ser gravado
 * depois da montagem da página, e o valor fresco é o que tem de viajar.
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
 * Três textos, e a diferença entre os dois últimos não é estilo:
 * "não está mais disponível" não afirma a venda. A saída do feed não diz o
 * motivo — pode ser repasse, reserva ou anúncio expirado —, e o consultor não
 * pode receber o cliente com uma venda que talvez não tenha acontecido. A
 * mesma distinção que `decidirPublicacao` faz entre VENDIDO e INDISPONÍVEL.
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
 * Escrevi primeiro como condicional (`só mostra se acrescentar algo`) e a
 * saída contra o estoque real mostrou que a condição nunca é verdadeira —
 * guarda morta fingindo proteger. Se um dia a versão passar a trazer o que o
 * nome não traz, é `nomeDoVeiculo` que muda, e esta linha volta de lá.
 */
export function textoDeCompartilhamento(
  veiculo: VeiculoNomeavel,
  { precoTexto, url }: { precoTexto: string; url: string },
): string {
  return `🚗 ${nome(veiculo)}\n💰 ${precoTexto}\n\n🔗 ${url}`;
}
