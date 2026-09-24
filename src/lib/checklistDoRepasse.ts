/**
 * O que um repasse precisa ter para ir à validação (spec §5), e os termos que
 * a seção nunca usa (spec §2 e §9).
 *
 * Duas listas, por ALCANCE (revisão final de 24/09, bloqueio B1):
 *
 *   TERMOS_JURIDICOS_DO_REPASSE  o que o dono mandou não citar (CDC, direitos
 *                                 do consumidor, garantia legal, Lei 8.078…)
 *   TERMOS_PROIBIDOS_DO_REPASSE  a lista inteira: termos de venda + os jurídicos
 *
 * `resumo` e `motivo` (spec §5, texto de vitrine) levam a lista INTEIRA. Já a
 * ficha de estado — `laudo_apontamento`, `leilao_detalhe`, `sinistro_detalhe`
 * e a descrição de cada item — é o documento que o COMPRADOR ASSINA, e só
 * leva o subconjunto jurídico: "Ventoinha do radiador não gira", "Pneus
 * dianteiros com 30% de vida útil" e "Alto-falante do som premium com chiado"
 * são texto legítimo de defeito, não apelo de venda. O PR 3 usa
 * `TERMOS_PROIBIDOS_DO_REPASSE` (a lista inteira) no texto fixo da página.
 *
 * As regras são do dono, 24/09: nunca dizer que um carro "não girou" — tira o
 * apelo —, não citar CDC nem direitos do consumidor, e os rótulos antigos
 * ("fora do perfil", "veio em lote") saíram.
 *
 * Cada padrão casa a EXPRESSÃO, não a palavra solta: "retrovisor direito" e
 * "o repasse gira rápido" são texto legítimo e precisam passar.
 */
import { MINIMO_DE_FOTOS } from "./coerenciaDoCadastro";
import type { Repasse } from "./repasse";

/** O que o dono mandou não citar: CDC, direitos do consumidor, garantia legal. */
export const TERMOS_JURIDICOS_DO_REPASSE: ReadonlyArray<{ termo: string; padrao: RegExp }> = [
  { termo: "CDC", padrao: /\bCDC\b/i },
  { termo: "código de defesa", padrao: /\bc[óo]digo\s+de\s+defesa\b/i },
  { termo: "direitos do consumidor", padrao: /\bdireitos?\s+(do|de|dos)\s+consumidor(es)?\b/i },
  { termo: "seus direitos", padrao: /\bseus\s+direitos\b/i },
  { termo: "direito de arrependimento", padrao: /\bdireito\s+de\s+arrependimento\b/i },
  { termo: "garantia legal", padrao: /\bgarantia\s+legal\b/i },
  { termo: "Lei 8.078", padrao: /\blei\s*(n[º°o.]?\s*)?8\.?078\b/i },
];

/**
 * Termos de venda: só valem em `resumo` e `motivo` — texto de vitrine. A
 * ficha de estado não usa esta lista (ver o docblock do arquivo).
 */
const TERMOS_DE_VENDA_DO_REPASSE: ReadonlyArray<{ termo: string; padrao: RegExp }> = [
  // Qualquer passado/infinitivo de "girar" ("Demorou a girar", "Girou
  // pouco", "Os dois não giraram") e o presente NEGADO ("não gira"). O
  // presente puro segue permitido — "o repasse gira rápido" não é sobre o
  // carro que não vendeu.
  { termo: "girou", padrao: /\bgir(ou|aram|ar|ava|avam)\b|\bn[ãa]o\s+gira\b/i },
  { termo: "sem giro", padrao: /\bsem\s+giro\b/i },
  { termo: "encalhado", padrao: /\bencalh\w*\b/i },
  { termo: "parado no pátio", padrao: /\bparad[oa]s?\s+no\s+p[áa]tio\b/i },
  { termo: "tempo demais no pátio", padrao: /\btempo\s+demais\s+no\s+p[áa]tio\b/i },
  { termo: "fora do perfil", padrao: /\bfora\s+do\s+perfil\b/i },
  { termo: "veio em lote", padrao: /\bveio\s+(em|num|de)\s+lote\b/i },
  { termo: "consumidor", padrao: /\bconsumidor(a|es|as)?\b/i },
  { termo: "premium", padrao: /\bpremium\b/i },
  { termo: "exclusivo", padrao: /\bexclusiv[oa]s?\b/i },
  { termo: "superlativo de preço", padrao: /\bmelhor(es)?\s+pre[çc]os?\b/i },
  { termo: "consulte", padrao: /\bconsulte(-nos)?\b/i },
  { termo: "a partir de R$", padrao: /\ba\s+partir\s+de\s+R\$/i },
  { termo: "porcentagem", padrao: /\d\s*%|\bpor\s+cento\b/i },
  {
    termo: "três em dez",
    // Duas formas ("3 em cada 10 carros" / "a cada dez avaliados"), com a
    // mesma exceção nas duas: não casa "a cada 10 mil km" nem "a cada
    // 10.000 km" — texto de manutenção, não estatística de venda.
    padrao:
      /\b(\d+|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove)\s+(em|de)\s+(cada\s+)?(dez|10)\b(?![.,]?\d)(?!\s*(mil|km))|\b(de|a)\s+cada\s+(dez|10)\b(?![.,]?\d)(?!\s*(mil|km))/i,
  },
];

/** A lista inteira: termos de venda + os jurídicos. Vale para `resumo` e `motivo`. */
export const TERMOS_PROIBIDOS_DO_REPASSE: ReadonlyArray<{ termo: string; padrao: RegExp }> = [
  ...TERMOS_DE_VENDA_DO_REPASSE,
  ...TERMOS_JURIDICOS_DO_REPASSE,
];

export function termosProibidosEm(
  texto: string | null | undefined,
  lista: ReadonlyArray<{ termo: string; padrao: RegExp }> = TERMOS_PROIBIDOS_DO_REPASSE,
): string[] {
  if (!texto) return [];
  // "direitos do consumidor" também casa "consumidor"; os dois rótulos saem,
  // e isso é certo — a mensagem mostra o primeiro.
  return lista.filter(({ padrao }) => padrao.test(texto)).map(({ termo }) => termo);
}

export interface FaltaDoChecklist {
  campo: string;
  mensagem: string;
}

const vazio = (v: string | null | undefined) => !v || v.trim() === "";

export function checklistDoRepasse(r: Repasse): FaltaDoChecklist[] {
  const faltas: FaltaDoChecklist[] = [];
  const falta = (campo: string, mensagem: string) => faltas.push({ campo, mensagem });

  if (r.web_full_images.length < MINIMO_DE_FOTOS) {
    falta("web_full_images", `Faltam fotos: o mínimo é ${MINIMO_DE_FOTOS}.`);
  }
  if (vazio(r.marca)) falta("marca", "Informe a marca.");
  if (vazio(r.modelo)) falta("modelo", "Informe o modelo.");
  if (!(Number.isInteger(r.ano_modelo) && r.ano_modelo >= 1950 && r.ano_modelo <= 2100)) {
    falta("ano_modelo", "Informe o ano do modelo.");
  }
  if (!r.carroceria) falta("carroceria", "Escolha a carroceria — é por ela que a lista é avisada.");
  if (!(r.preco > 0)) falta("preco", "Informe o preço à vista.");
  if (!(r.quilometragem >= 0)) falta("quilometragem", "Informe a quilometragem.");

  if (!(typeof r.fipe_valor === "number" && r.fipe_valor > 0)) falta("fipe_valor", "Consulte a FIPE.");
  if (vazio(r.fipe_mes_referencia)) falta("fipe_mes_referencia", "Falta o mês de referência da FIPE.");

  if (!r.laudo) falta("laudo", "Escolha a situação do laudo cautelar.");
  if (r.laudo === "aprovado_com_apontamento" && vazio(r.laudo_apontamento)) {
    falta("laudo_apontamento", "Escreva o apontamento do laudo.");
  }

  if (r.leilao_consta === null) falta("leilao_consta", "Informe se consta leilão.");
  if (r.leilao_consta === true && vazio(r.leilao_detalhe)) falta("leilao_detalhe", "Descreva o registro de leilão.");
  if (r.sinistro_consta === null) falta("sinistro_consta", "Informe se consta sinistro.");
  if (r.sinistro_consta === true && vazio(r.sinistro_detalhe)) falta("sinistro_detalhe", "Descreva o registro de sinistro.");
  if (vazio(r.historico_consultado_em)) falta("historico_consultado_em", "Informe a data da consulta do histórico.");

  if (vazio(r.resumo)) falta("resumo", "Escreva a linha do card.");
  else if ((r.resumo ?? "").length > 140) falta("resumo", "A linha do card tem até 140 caracteres.");
  if (vazio(r.motivo)) falta("motivo", "Escreva por que o carro está no repasse.");

  const temItens = r.itens_de_estado.length > 0;
  if (!temItens && !r.sem_defeitos_conhecidos) {
    falta("itens_de_estado", "Liste os defeitos conhecidos ou marque 'nenhum defeito conhecido'.");
  }
  if (temItens && r.sem_defeitos_conhecidos) {
    falta("sem_defeitos_conhecidos", "Há defeitos listados: desmarque 'nenhum defeito conhecido'.");
  }
  r.itens_de_estado.forEach((item, i) => {
    if (vazio(item.descricao)) falta(`itens_de_estado[${i}].descricao`, "Descreva o defeito.");
    if (vazio(item.local)) falta(`itens_de_estado[${i}].local`, "Diga onde está o defeito.");
    if (vazio(item.foto)) falta(`itens_de_estado[${i}].foto`, "Todo defeito tem foto.");
    if (item.orcamento !== null && !(item.orcamento > 0)) {
      falta(`itens_de_estado[${i}].orcamento`, "Orçamento precisa ser maior que zero.");
    }
  });
  const temOrcamento = r.itens_de_estado.some((item) => typeof item.orcamento === "number" && item.orcamento > 0);
  if (temOrcamento && vazio(r.oficina_do_orcamento)) falta("oficina_do_orcamento", "Informe a oficina do orçamento.");
  if (temOrcamento && vazio(r.orcamento_em)) falta("orcamento_em", "Informe a data do orçamento.");

  // Texto de vitrine: resumo e motivo levam a lista INTEIRA (venda + jurídico).
  const textosDeVitrine: Array<[string, string | null]> = [
    ["resumo", r.resumo],
    ["motivo", r.motivo],
  ];
  for (const [campo, texto] of textosDeVitrine) {
    const achados = termosProibidosEm(texto);
    if (achados.length > 0) {
      falta(campo, `O texto usa um termo que o repasse não usa: ${achados[0]}.`);
    }
  }

  // A ficha de estado é o documento que o comprador assina: só o subconjunto
  // jurídico barra aqui. "Ventoinha não gira" e "30% de vida útil" descrevem
  // o defeito de verdade e precisam passar.
  const textosDaFicha: Array<[string, string | null]> = [
    ["laudo_apontamento", r.laudo_apontamento],
    ["leilao_detalhe", r.leilao_detalhe],
    ["sinistro_detalhe", r.sinistro_detalhe],
    ...r.itens_de_estado.map((item, i): [string, string | null] => [`itens_de_estado[${i}].descricao`, item.descricao]),
  ];
  for (const [campo, texto] of textosDaFicha) {
    const achados = termosProibidosEm(texto, TERMOS_JURIDICOS_DO_REPASSE);
    if (achados.length > 0) {
      falta(campo, `O texto usa um termo que o repasse não usa: ${achados[0]}.`);
    }
  }

  return faltas;
}
