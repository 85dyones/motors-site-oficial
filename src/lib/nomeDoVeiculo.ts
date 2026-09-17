/**
 * O nome de um veículo sem a versão repetida — num lugar só.
 *
 * O RevendaMais embute a versão dentro do modelo em boa parte do estoque, e
 * `marca + modelo + versao` produzia, no carro mais caro da vitrine:
 *
 *   BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut m40i 3.0 m sport edit v6 turbo aut
 *
 * A deduplicação nasceu no card de WhatsApp, passou para o `<title>` da ficha
 * em 2026-08-19 (P3 da `docs/RECOMENDACAO_SEO.md`) e ficou de fora do
 * `Car` do schema.org — que é exatamente o defeito nº 2 da lista de achados
 * menores do plano de aquisição (§0.5.5). Este módulo existe para que
 * `<title>`, `<h1>`, JSON-LD e card de compartilhamento não possam mais
 * divergir: quem precisar do nome do veículo chama daqui.
 *
 * Não importa nada de propósito — serve servidor e cliente.
 */

export interface VeiculoNomeavel {
  marca: string;
  modelo: string;
  versao?: string | null;
  ano?: number | string | null;
}

/**
 * A versão já está embutida neste nome?
 *
 * Por SUBSTRING, e não por palavra como o ano: a versão é uma expressão
 * inteira ("1.6 Rio 2016"), e o `modelo` do RevendaMais a embute com a mesma
 * pontuação e outra caixa. Comparar por token exigiria casar a sequência toda,
 * que é o que o `includes` já faz.
 *
 * Exportado junto com o irmão abaixo, para quem monta texto fora daqui fazer a
 * mesma pergunta. O caso que pedia isto, a linha `📋 {versão}` do card de
 * compartilhamento, saiu: `nomeComAno` já carrega a versão por construção (ver
 * `lib/mensagensDoVeiculo.ts`).
 */
export function nomeTemAVersao(nome: string, versao: string | null | undefined): boolean {
  const v = (versao ?? "").trim();
  return v !== "" && nome.toLowerCase().includes(v.toLowerCase());
}

/**
 * O ano já está neste nome?
 *
 * Por PALAVRA INTEIRA, ao contrário da versão: "2016" dentro de "2016V" ou de
 * uma cilindrada não é o ano do carro, e suprimir por substring tiraria o ano
 * de quem precisava dele — falha silenciosa e na direção errada. Dividir por
 * espaço também dispensa montar regex com dado do cadastro.
 *
 * Exportado pelo mesmo motivo do irmão acima: `lib/tituloDaFicha.ts` monta a
 * meta description com o ano num traço separado, e precisa saber se o nome já
 * o carrega.
 */
export function nomeTemOAno(nome: string, ano: number | string | null | undefined): boolean {
  const a = String(ano ?? "").trim();
  return a !== "" && nome.split(/\s+/).includes(a);
}

/** "Jeep Renegade S T270 1.3 Tb 4x4 Flex Aut" — sem repetir a versão. */
export function nomeDoVeiculo(veiculo: VeiculoNomeavel): string {
  const marcaModelo = `${veiculo.marca ?? ""} ${veiculo.modelo ?? ""}`.trim();
  const versao = (veiculo.versao ?? "").trim();

  if (!versao) return marcaModelo;
  return nomeTemAVersao(marcaModelo, versao) ? marcaModelo : `${marcaModelo} ${versao}`;
}

/**
 * O mesmo nome com o ano no fim — o que vai para `Car.name` do schema.org.
 *
 * O ano é o mesmo caso da versão, e passou batido quando a deduplicação acima
 * nasceu: o RevendaMais embute o ano no `modelo` em parte do cadastro, do mesmo
 * jeito que embute a versão. Medido no estoque em 2026-09-07, o Nissan March
 * `8203724` (`modelo = "March 1.6 Rio 2016"`, `ano = 2016`) publicava:
 *
 *   Nissan March 1.6 Rio 2016 2016
 *
 * Estava no ar, no `Car.name` do JSON-LD da ficha. **Só ali**: a `description`
 * do schema também chama esta função, mas no terceiro degrau de uma cascata
 * (`descricao_seo || descricao || fallback`) — medido em 2026-09-07, 2 das 110
 * linhas chegam nesse degrau e nenhuma delas é um dos Marchs. O teste da
 * descrição existe como guarda, não como correção de defeito visto.
 *
 * As outras superfícies que nomeiam o carro já não montam nome e ano por conta
 * própria. As mensagens de WhatsApp da ficha, a calculadora e a saída do
 * captcha passam por aqui (`lib/mensagensDoVeiculo.ts`). A meta description da
 * ficha (`lib/tituloDaFicha.ts`) recebe `nome` e `ano` separados por desenho, e
 * pergunta a `nomeTemOAno` antes de pôr o ano no traço.
 *
 * Por que a guarda fica mesmo com o dado corrigido na origem: corrigir o
 * `modelo` no RevendaMais não chega aqui, porque a trava do sync só deixa
 * passar seis colunas e `modelo` não é uma delas. Quem corrige o nome de fato é
 * o override do painel ("Nome do veículo"); a guarda cobre o carro que ainda
 * não passou por lá.
 *
 * A comparação é por PALAVRA INTEIRA, e não `includes` como a da versão: "2016"
 * dentro de "2016V" ou de uma cilindrada não é o ano do carro, e suprimir por
 * substring tiraria o ano de um carro que precisava dele — falha silenciosa e
 * na direção errada. Dividir por espaço também dispensa montar uma regex com
 * dado do cadastro.
 */
export function nomeComAno(veiculo: VeiculoNomeavel): string {
  const nome = nomeDoVeiculo(veiculo);
  const ano = String(veiculo.ano ?? "").trim();
  if (!ano) return nome;

  return nomeTemOAno(nome, ano) ? nome : `${nome} ${ano}`;
}
