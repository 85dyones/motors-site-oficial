import { concordar, o, seu, type Genero } from "./generoDoVeiculo";
import { FAIXAS_DE_PRECO } from "./faixasDePreco";

/**
 * Busca sob encomenda — o que a página sem carro passa a oferecer.
 *
 * Metade dos hubs de marca e modelo está sem veículo, continua indexada e
 * continua recebendo busca. Até 2026-09-06 ela terminava num `wa.me` que não
 * deixava rastro: quem procurou um modelo específico e não achou — o lead mais
 * qualificado que chega no site — voltava para o Google.
 *
 * Este arquivo é puro de propósito. A copy tem concordância de gênero (quatro
 * dos 42 alvos são de moto) e o pedido vira coluna de `leads` sem passar por
 * React nem por rede, que é o que permite travar as duas coisas em teste.
 *
 * **Não há tabela nova.** `leads` já tinha `modelo_interesse`, `respostas_raw`
 * (jsonb) e `disponivel_estoque`, herdadas da ferramenta de marketing que criou
 * a tabela antes da disciplina de migrações — sem migração e sem nenhum código
 * lendo. Passar a escrever nelas é o que põe o pedido dentro do kanban A1/A8
 * que a loja já abre, em vez de numa tabela que ninguém consulta.
 */

/** O rótulo do canal no funil. É o que o consultor vê na fila da A1. */
export const CANAL_BUSCA_ENCOMENDA = "Busca sob encomenda";

/** As faixas do formulário são as MESMAS de `/estoque` — não se inventa outra régua. */
export const FAIXAS_DE_INVESTIMENTO = FAIXAS_DE_PRECO.map((f) => ({
  valor: f.slug,
  rotulo: f.nome,
}));

// Rótulo por extenso ("quinze"/"trinta"), não em dígito: `tests/promessa-publica.test.ts`
// (regra "prazo como item de estatística") reprova `rotulo: "...N dias"` em
// qualquer objeto do repo — a trava não distingue a PREFERÊNCIA que o cliente
// digita aqui do prazo de resposta que a loja prometeria. `valor` (a slug que
// o código de fato compara) não muda.
export const PRAZOS = [
  { valor: "ate-15-dias", rotulo: "até quinze dias" },
  { valor: "ate-30-dias", rotulo: "até trinta dias" },
  { valor: "sem-pressa", rotulo: "sem pressa" },
] as const;

export interface PedidoDeBusca {
  /** A marca da página onde o pedido nasceu. */
  marca: string;
  /** O que a pessoa escreveu. Na página de modelo já vem preenchido. */
  modelo_desejado: string;
  /** `slug` de `FAIXAS_DE_PRECO`. */
  investimento: string;
  /** "/carros/citroen" — o hub que gerou o lead. */
  pagina_origem: string;
  ano_min?: number | null;
  /** `null` é "não respondeu"; `false` é "respondeu que não". */
  tem_troca?: boolean | null;
  prazo?: string | null;
  observacao?: string | null;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * "Citroën" + "C3" vira "Citroën C3"; "Citroën" + "Citroen C3" continua
 * "Citroen C3".
 *
 * Na página de MARCA o campo nasce vazio e a pessoa escreve o carro inteiro —
 * sem esta comparação a coluna guardaria a marca duas vezes.
 */
function juntarMarcaEModelo(marca: string, modelo: string): string {
  const m = (marca ?? "").trim();
  const d = (modelo ?? "").trim();
  if (!m) return d;
  if (!d) return m;
  return semAcento(d).startsWith(semAcento(m)) ? d : `${m} ${d}`;
}

/**
 * O que a linha de `leads` ganha, além do que `/api/leads` já grava.
 *
 * `respostas_raw` é jsonb e recebe o pedido inteiro: é o único lugar onde
 * `ano_min`, `tem_troca` e `prazo` cabem sem inventar coluna. Os opcionais
 * viram `null` e não `undefined` — `undefined` some do insert do PostgREST e a
 * chave nem chega ao banco, o que faria "não respondeu" e "campo inexistente"
 * ficarem indistinguíveis na leitura.
 */
export function colunasDoPedido(pedido: PedidoDeBusca) {
  return {
    modelo_interesse: juntarMarcaEModelo(pedido.marca, pedido.modelo_desejado),
    disponivel_estoque: false as const,
    respostas_raw: {
      marca: pedido.marca,
      modelo_desejado: pedido.modelo_desejado,
      investimento: pedido.investimento,
      pagina_origem: pedido.pagina_origem,
      ano_min: pedido.ano_min ?? null,
      tem_troca: pedido.tem_troca ?? null,
      prazo: pedido.prazo ?? null,
      observacao: pedido.observacao ?? null,
    } as Record<string, unknown>,
  };
}

/** O pedido em uma linha — vai para o WhatsApp e para a coluna `interesse`. */
export function mensagemDoPedido(pedido: PedidoDeBusca): string {
  const alvo = juntarMarcaEModelo(pedido.marca, pedido.modelo_desejado);
  const faixa = FAIXAS_DE_INVESTIMENTO.find((f) => f.valor === pedido.investimento)?.rotulo;
  const prazo = PRAZOS.find((p) => p.valor === pedido.prazo)?.rotulo;

  const partes = [
    `Quero um ${alvo}`,
    pedido.ano_min ? `a partir de ${pedido.ano_min}` : "",
    faixa ? `investimento ${faixa}` : "",
    pedido.tem_troca === true ? "tenho carro na troca" : "",
    prazo ? `prazo ${prazo}` : "",
    (pedido.observacao ?? "").trim(),
  ].filter((p) => p !== "");

  return `${partes.join(" · ")}.`;
}

export interface TextoDaBusca {
  titulo: string;
  paragrafo: string;
  selo: string;
  rotuloPrimario: string;
}

/**
 * A copy das duas variantes.
 *
 * As duas expressões aparecem lado a lado de propósito: perícia é o PROCESSO de
 * aquisição do laudo, laudo cautelar independente é o DOCUMENTO que sai dele
 * (direção do dono, 2026-09-06). O banco já separava os dois —
 * `estoque_motors.pericia` é o estado, `laudo_pericia` é o documento — e
 * ninguém tinha nomeado a regra.
 *
 * Os canais de busca ficam de fora por decisão do dono na mesma data: a loja
 * não anuncia por onde compra.
 */
export function textoDaBusca(alvo: {
  marca: string;
  modelo?: string;
  genero: Genero;
}): TextoDaBusca {
  const { marca, modelo, genero } = alvo;
  // Sem prazo de resposta. `tests/promessa-publica.test.ts` (04/09) proíbe
  // afirmar tempo de retorno que nada mede, e "hora útil" não é calculada em
  // lugar nenhum do sistema — o funil mede tempo até o primeiro contato
  // (`ultimo_contato_em`) em relógio, não em hora comercial. Decisão do dono
  // em 2026-09-06, revendo o §14.2 do handoff.
  const selo = "Sem taxa, sem compromisso.";

  if (!modelo) {
    return {
      titulo: `Sem ${marca} hoje. A gente busca ${o(genero)} ${seu(genero)}.`,
      paragrafo:
        "Você diz o modelo, o ano e quanto quer investir. Um consultor procura e volta com as " +
        "opções que encontrar — cada uma pela mesma perícia cautelar independente por que passa " +
        "todo veículo antes da vitrine, com o laudo cautelar independente na ficha assim que " +
        "aprovado.",
      selo,
      rotuloPrimario: `PROCURE ${concordar(genero, "ESSE CARRO", "ESSA MOTO")} PRA MIM`,
    };
  }

  return {
    titulo:
      `${concordar(genero, "Nenhum", "Nenhuma")} ${marca} ${modelo} no estoque agora. ` +
      "Quer que a gente ache?",
    // "assim que aprovado" NÃO é enfeite: `tests/coerencia-da-pericia.test.ts`
    // exige a ressalva em toda promessa de laudo, porque afirmar laudo limpo
    // sobre carro que ainda não passou na perícia é passivo de CDC. A variante
    // de marca já a trazia; a de modelo terminava em "na ficha." e reprovava.
    paragrafo:
      "Diz o ano, a versão e o quanto pretende investir. Um consultor procura e te chama no " +
      "WhatsApp com o que encontrar — depois da perícia cautelar independente, com o laudo " +
      "cautelar independente na ficha assim que aprovado.",
    selo,
    rotuloPrimario: `PROCURE ${concordar(genero, "ESSE", "ESSA")} ${modelo.toUpperCase()} PRA MIM`,
  };
}
