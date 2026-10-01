import { precoEfetivo } from "./precoPromocional";

/**
 * O piso do preço — nenhum carro sai por menos do que entrou.
 *
 * Decisão do dono em 2026-08-31, quando a alternativa foi posta como faixas
 * percentuais de alçada: *"sobre a margem de alteração de preço, só trave
 * preços abaixo do preço de entrada"*. É a régua inteira. Não há banda de 5%,
 * não há aprovação em dois passos, não há teto de desconto: a loja desconta o
 * quanto quiser, desde que não venda no prejuízo.
 *
 * "Preço de entrada" é `preco_compra` — o custo de aquisição, o que a loja
 * pagou pelo carro. As telas o chamam de "preço de compra", e é esse o nome
 * que aparece para quem opera; "entrada" é o vocabulário do núcleo, onde a
 * aquisição é um evento (`veiculo_entradas`, spec 10).
 *
 * ## O que a trava compara
 *
 * O **preço EFETIVO**, não o de tabela. Um carro anunciado a 68.900 com
 * promoção de 50.000 e custo de 55.000 está vendendo no prejuízo, ainda que o
 * anúncio diga 68.900 — quem paga, paga 50.000. Comparar contra
 * `preco_original` deixaria a promoção passar por baixo da trava, que é
 * exatamente o caminho que o campo novo abriu.
 *
 * ## Quando ela NÃO tem o que travar
 *
 * Quando o custo não está lançado. Medido em 2026-08-31: **2 dos 38 veículos
 * ativos** tinham `preco_compra` preenchido (3 de 104 na base inteira). A trava
 * é silenciosa nos outros 36 — não porque falhe, mas porque não há contra o que
 * comparar. Ela ganha alcance à medida que o custo for lançado, e passa a valer
 * sozinha quando o núcleo registrar a entrada como evento.
 *
 * Nenhum veículo ativo estava abaixo do custo quando isto entrou, então ligar a
 * trava não invalidou preço nenhum que já estivesse no ar.
 */

/**
 * Por que este preço não pode ser gravado — `null` quando pode.
 *
 * `podeVerCusto` decide se a mensagem NOMEIA o valor. Hoje todos os perfis que
 * alteram preço (Admin, Gestor, Financeiro) também veem custo, então a
 * distinção não muda nada na prática — ela existe para o dia em que a linha
 * "Alterar preço até 5%" do Comercial ganhar tela: o Comercial vê preço e
 * desconto, **não vê custo** (matriz A17), e uma recusa que dissesse "abaixo de
 * R$ 55.000" entregaria a ele exatamente o número que a matriz esconde.
 */
export function recusaPorPisoDeCusto(
  efetivo: number | null | undefined,
  custo: number | null | undefined,
  opcoes: { podeVerCusto: boolean },
): string | null {
  const c = custo === null || custo === undefined ? null : Number(custo);
  // Sem custo lançado não há piso. Zero é "não lançado", como no resto do
  // painel — a checklist do editor conta `preco_compra` nulo como PENDENTE.
  if (c === null || Number.isNaN(c) || c <= 0) return null;

  const p = efetivo === null || efetivo === undefined ? null : Number(efetivo);
  if (p === null || Number.isNaN(p)) return null;

  if (p >= c) return null;

  const reais = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return opcoes.podeVerCusto
    ? `${reais(p)} fica abaixo do preço de compra deste veículo (${reais(c)}). ` +
        `Vender abaixo da entrada não se faz pelo painel.`
    : "Este preço fica abaixo do custo de aquisição do veículo. Fale com quem vê custo.";
}

/**
 * Abaixo desta fração do preço anunciado, o custo é erro de digitação.
 *
 * A trava acima confia no custo — e um custo errado para BAIXO a desarma em
 * silêncio. Foi o que aconteceu em 01/10/2026: o Captur 8506096, anunciado a R$
 * 92.900, ficou com custo de R$ 75,15 ("75.154,40" num campo numérico que
 * engoliu a vírgula), e o City 8517481, a R$ 119.900, com R$ 113 ("113.000"
 * lido como 113). Com esses custos, qualquer preço acima de R$ 113 passa no
 * piso, e a margem do painel diz 99,9%.
 *
 * 10% é larguíssimo de propósito: nenhum carro de revenda entra por menos de um
 * décimo do que se anuncia, e o que se quer pegar é o erro de três zeros, não
 * discutir compra boa. Errado para CIMA não precisa disto: o próprio piso
 * reclama no primeiro preço abaixo do custo inflado.
 */
export const FRACAO_MINIMA_DO_CUSTO = 0.1;

const comoNumero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Por que este custo não pode ser gravado contra este preço anunciado — `null`
 * quando pode.
 *
 * Nomeia os dois valores sem a opção `podeVerCusto` de `recusaPorPisoDeCusto`:
 * quem chega a esta recusa é quem está LANÇANDO o custo, e a matriz A17 só deixa
 * lançar a quem vê (a rota devolve 403 antes, a quem não vê).
 *
 * Sem custo (nulo ou zero, o "não lançado" do painel) ou sem preço anunciado,
 * não há o que comparar.
 */
export function recusaPorCustoImplausivel(
  custo: unknown,
  anunciado: unknown,
): string | null {
  const c = comoNumero(custo);
  if (c === null || c <= 0) return null;
  const a = comoNumero(anunciado);
  if (a === null || a <= 0) return null;
  if (c >= a * FRACAO_MINIMA_DO_CUSTO) return null;

  const reais = (v: number, casas: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: casas });
  return (
    `Preço de compra de ${reais(c, 2)} é menos de ${Math.round(FRACAO_MINIMA_DO_CUSTO * 100)}% do ` +
    `preço anunciado (${reais(a, 0)}) — confira se o milhar não se perdeu. ` +
    `Escreva como na nota: 75.154,40.`
  );
}

/**
 * O preço efetivo que uma gravação produz — o que a trava precisa julgar.
 *
 * Recebe o estado ANTERIOR e o que está sendo escrito, porque as duas pontas
 * podem mudar na mesma chamada: quem reprecifica um veículo nativo pode mandar
 * preço novo e promoção nova juntos, e julgar contra o valor velho recusaria
 * uma combinação válida.
 */
export function efetivoDepoisDaEscrita(
  anterior: Record<string, unknown>,
  escrita: Record<string, unknown>,
): number | null {
  const depois = { ...anterior, ...escrita };
  const original =
    depois.preco_original === null || depois.preco_original === undefined
      ? null
      : Number(depois.preco_original);
  const promo =
    depois.preco_promocional === null || depois.preco_promocional === undefined
      ? null
      : Number(depois.preco_promocional);

  // `preco` explícito na escrita vence: é o efetivo que quem chamou derivou.
  if (escrita.preco !== undefined && escrita.preco !== null) return Number(escrita.preco);
  return precoEfetivo(promo, original);
}
