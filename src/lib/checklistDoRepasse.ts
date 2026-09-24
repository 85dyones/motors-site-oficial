/**
 * O que um repasse precisa ter para ir à validação (spec §5), e os termos que
 * a seção nunca usa (spec §2 e §9).
 *
 * A lista de termos vale para o texto DIGITADO no painel (resumo, motivo,
 * apontamento, histórico, defeitos) e, no PR 3, para o texto fixo da página.
 * As regras são do dono, 24/09: nunca dizer que um carro "não girou" — tira o
 * apelo —, não citar CDC nem direitos do consumidor, e os rótulos antigos
 * ("fora do perfil", "veio em lote") saíram.
 *
 * Cada padrão casa a EXPRESSÃO, não a palavra solta: "retrovisor direito" e
 * "o repasse gira rápido" são texto legítimo e precisam passar.
 */
import { MINIMO_DE_FOTOS } from "./coerenciaDoCadastro";
import type { Repasse } from "./repasse";

export const TERMOS_PROIBIDOS_DO_REPASSE: ReadonlyArray<{ termo: string; padrao: RegExp }> = [
  { termo: "não girou", padrao: /\bn[ãa]o\s+gir(ou|a|ava|ar)\b/i },
  { termo: "sem giro", padrao: /\bsem\s+giro\b/i },
  { termo: "encalhado", padrao: /\bencalhad[oa]s?\b/i },
  { termo: "parado no pátio", padrao: /\bparad[oa]s?\s+no\s+p[áa]tio\b/i },
  { termo: "tempo demais no pátio", padrao: /\btempo\s+demais\s+no\s+p[áa]tio\b/i },
  { termo: "fora do perfil", padrao: /\bfora\s+do\s+perfil\b/i },
  { termo: "veio em lote", padrao: /\bveio\s+(em|num|de)\s+lote\b/i },
  { termo: "CDC", padrao: /\bCDC\b/ },
  { termo: "código de defesa", padrao: /\bc[óo]digo\s+de\s+defesa\b/i },
  { termo: "direitos do consumidor", padrao: /\bdireitos?\s+(do|de|dos)\s+consumidor(es)?\b/i },
  { termo: "seus direitos", padrao: /\bseus\s+direitos\b/i },
  { termo: "consumidor", padrao: /\bconsumidor(a|es|as)?\b/i },
  { termo: "premium", padrao: /\bpremium\b/i },
  { termo: "exclusivo", padrao: /\bexclusiv[oa]s?\b/i },
  { termo: "melhor preço", padrao: /\bmelhor(es)?\s+pre[çc]os?\b/i },
  { termo: "consulte", padrao: /\bconsulte(-nos)?\b/i },
  { termo: "a partir de R$", padrao: /\ba\s+partir\s+de\s+R\$/i },
  { termo: "três em dez", padrao: /\b(de\s+cada\s+dez|tr[êe]s\s+em\s+dez|3\s+em\s+10|3\s+de\s+cada\s+10)\b/i },
  { termo: "porcentagem", padrao: /\d\s*%/ },
];

export function termosProibidosEm(texto: string | null | undefined): string[] {
  if (!texto) return [];
  // "direitos do consumidor" também casa "consumidor"; os dois rótulos saem,
  // e isso é certo — a mensagem mostra o primeiro.
  return TERMOS_PROIBIDOS_DO_REPASSE.filter(({ padrao }) => padrao.test(texto)).map(({ termo }) => termo);
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

  const textos: Array<[string, string | null]> = [
    ["resumo", r.resumo],
    ["motivo", r.motivo],
    ["laudo_apontamento", r.laudo_apontamento],
    ["leilao_detalhe", r.leilao_detalhe],
    ["sinistro_detalhe", r.sinistro_detalhe],
    ...r.itens_de_estado.map((item, i): [string, string | null] => [`itens_de_estado[${i}].descricao`, item.descricao]),
  ];
  for (const [campo, texto] of textos) {
    const achados = termosProibidosEm(texto);
    if (achados.length > 0) {
      falta(campo, `O texto usa um termo que o repasse não usa: ${achados[0]}.`);
    }
  }

  return faltas;
}
