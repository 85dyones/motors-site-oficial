import { CARENCIA_VENDIDO_DIAS, diasDesde, resolverDatasDeVenda } from "../publicacao";

/**
 * Os carros VENDIDOS que o seletor do fechamento de venda (A19) ainda oferece.
 *
 * ---------------------------------------------------------------------------
 * Por que o seletor passou a mostrar vendido
 * ---------------------------------------------------------------------------
 * Até 2026-09-16 a rota `api/ciclo/vendas/estoque` servia só `vendido = false`,
 * com a nota "um carro já marcado como vendido não deveria estar sendo fechado
 * agora". Valia enquanto marcar vendido era ato de gente, feito depois — em
 * 15 e 16/09 a loja marcou o HB20 8191855 e a EcoSport 8193514 três a quatro
 * dias depois de saírem do RevendaMais.
 *
 * Com a disponibilidade espelhando o RevendaMais (decisão do dono, 16/09;
 * migração `20260916220000`), o sync marca o carro vendido 24 horas depois de
 * ele sair do feed — quase sempre ANTES de o vendedor registrar a venda no
 * Ciclo. A regra antiga tiraria do seletor justamente o carro que está sendo
 * fechado: chassi e placa voltariam a ser digitados à mão, com o cliente
 * esperando, e `estoque_id` ficaria nulo — a venda do Ciclo perderia o elo com a
 * ficha. É o "não quebrar o Ciclo" da decisão.
 *
 * ---------------------------------------------------------------------------
 * Quem entra, e quem não
 * ---------------------------------------------------------------------------
 * Entra o vendido cuja ÚLTIMA mudança de `vendido` no histórico é "true" e
 * recente, e que ainda não tem venda em `veiculos_vendidos`.
 *
 *   - A data é a mesma régua da ficha (`resolverDatasDeVenda`), sem segunda
 *     interpretação do histórico.
 *   - A janela é `CARENCIA_VENDIDO_DIAS`: o tempo em que o carro ainda existe
 *     publicamente como VENDIDO. Não é número novo — é o mesmo prazo.
 *   - Quem já tem venda registrada sai: o `chassi` é único em
 *     `veiculos_vendidos`, e oferecer o carro de novo só levaria a um erro de
 *     duplicidade no fim do formulário.
 *   - Os vendidos antigos, sem linha no histórico (23 dos 25 publicados em
 *     16/09), ficam de fora: sem data, não há como saber se a venda é desta
 *     semana ou de março.
 *
 * Pura de propósito: a rota fala com o banco, esta função decide.
 */
export function vendidosAguardandoRegistro(
  mudancasDeVendido: Array<{ veiculo_id?: unknown; valor_novo?: unknown; registrado_em?: unknown }>,
  vendasDoCiclo: Array<{ estoque_id?: unknown }>,
  agora: Date = new Date(),
): number[] {
  const datas = resolverDatasDeVenda([], mudancasDeVendido);
  const registrados = new Set(
    vendasDoCiclo
      .map((venda) => venda.estoque_id)
      .filter((id) => id !== null && id !== undefined)
      .map(String),
  );

  const ids: number[] = [];
  for (const [id, data] of Object.entries(datas)) {
    if (registrados.has(id)) continue;
    const dias = diasDesde(data, agora);
    // `dias >= 0` pela mesma razão de `decidirNoFeed`: data no futuro é erro de
    // digitação, e não pode segurar carro em lista nenhuma.
    if (dias === null || dias < 0 || dias > CARENCIA_VENDIDO_DIAS) continue;
    const numero = Number(id);
    if (Number.isSafeInteger(numero) && numero > 0) ids.push(numero);
  }
  return ids.sort((a, b) => a - b);
}

/**
 * O filtro do PostgREST para o seletor: à venda, OU vendido aguardando registro.
 *
 * Os ids vão na string do `.or()`, e por isso só passam inteiros positivos — o
 * que chega aqui já saiu de `vendidosAguardandoRegistro`, mas a string é uma
 * fronteira e a guarda mora nela.
 */
export function filtroDoSeletorDeVenda(aguardandoRegistro: number[]): string {
  const aVenda = "vendido.is.null,vendido.eq.false";
  const ids = aguardandoRegistro.filter((id) => Number.isSafeInteger(id) && id > 0);
  return ids.length > 0 ? `${aVenda},id.in.(${ids.join(",")})` : aVenda;
}
