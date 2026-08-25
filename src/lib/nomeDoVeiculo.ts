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

interface VeiculoNomeavel {
  marca: string;
  modelo: string;
  versao?: string | null;
  ano?: number | string | null;
}

/** "Jeep Renegade S T270 1.3 Tb 4x4 Flex Aut" — sem repetir a versão. */
export function nomeDoVeiculo(veiculo: VeiculoNomeavel): string {
  const marcaModelo = `${veiculo.marca ?? ""} ${veiculo.modelo ?? ""}`.trim();
  const versao = (veiculo.versao ?? "").trim();

  if (!versao) return marcaModelo;
  return marcaModelo.toLowerCase().includes(versao.toLowerCase())
    ? marcaModelo
    : `${marcaModelo} ${versao}`;
}

/** O mesmo nome com o ano no fim — o que vai para `Car.name` do schema.org. */
export function nomeComAno(veiculo: VeiculoNomeavel): string {
  const nome = nomeDoVeiculo(veiculo);
  const ano = String(veiculo.ano ?? "").trim();
  return ano ? `${nome} ${ano}` : nome;
}
