import { ROTULOS, temRotulo, type Dossie } from "./dossie";
import { NEGA_APROVACAO } from "../supabase";

/**
 * Reprova texto fora do padrão antes de ele chegar à tela.
 *
 * STATUS_INTERNO usa `\bpendente\b` por causa de um defeito medido em
 * 08/09/2026: sem a fronteira de palavra, /pendente/ reprovava "perícia
 * independente" e a validação passava a reprovar tudo — a tabela de
 * resultados chegou a ser lida como "cinco modelos ruins" antes de a causa
 * aparecer. Isso NÃO generaliza: nem toda regra de substring usa `\b` —
 * AFIRMA_PERICIA, GARANTIA, DONOS, EQUIPAMENTOS e a primeira alternativa do
 * próprio STATUS_INTERNO ("em an[áa]lise") não usam —, então uma regra nova
 * precisa avaliar caso a caso se corre o mesmo risco, em vez de supor que o
 * arquivo inteiro já se protege sozinho.
 *
 * LIMITE CONHECIDO: nada aqui detecta TROCA DE CAMPO — "motor manual" quando
 * o manual é o câmbio. As duas frases são bem-formadas e nenhuma regex as
 * separa sem reprovar "motor flex", que é correto. Por isso o texto vai para
 * revisão humana num painel, e não direto para o campo.
 */

/** Onde `truncateString(cleanDescription, 155)` corta a meta description da PDP. */
export const LIMITE_META = 155;

export type CampoDeTexto = "descricao" | "descricao_seo";
export type Reprovacao = { regra: string; motivo: string };

/** As duas primeiras frases — o que o Google mostra. */
export function aberturaDe(texto: string): string {
  // Um ponto entre dígitos é separador de milhar — `toLocaleString("pt-BR")`
  // formata preço e km assim no dossiê — e não pode contar como fim de frase.
  // Sem a exceção `(?<=\d)\.(?=\d)`, "R$ 89.900,00." quebrava em dois
  // fragmentos ali no meio do número, e a segunda frase real da abertura
  // caía fora da contagem: bug medido em 08/09/2026 (abertura real de 158
  // caracteres, que devia reprovar, lida como 34).
  const frases = texto.replace(/\s+/g, " ").trim().match(/(?:[^.!?]|(?<=\d)\.(?=\d))+[.!?]+/g);
  if (!frases || frases.length === 0) return texto.replace(/\s+/g, " ").trim();
  return frases.slice(0, 2).join("").trim();
}

const VOCABULARIO = /\b(premium|luxo|exclusiv[oa]s?|consulte-nos)\b|melhor pre[çc]o/i;
/**
 * Gatilho (laudo/perícia/cautelar) e afirmação de aprovação NA MESMA FRASE —
 * `[^.!?]*`, não uma janela de caracteres.
 *
 * Até 08/09/2026 a janela era `{0,40}`, curta demais: "Perícia cautelar
 * independente feita por empresa credenciada, com resultado aprovado." e
 * "Laudo cautelar realizado por empresa credenciada junto ao Detran:
 * aprovado." passavam direto, afirmando laudo aprovado num carro cuja perícia
 * está "Em análise" — medido em 49 dos 85 veículos à venda naquele dia.
 *
 * O match ainda precisa passar pelo desconto de negação logo abaixo: sozinho,
 * ele reprovaria "O laudo ainda não está aprovado." — a frase que NEGA a
 * aprovação, não que a afirma.
 */
const AFIRMA_PERICIA = /(laudo|per[íi]cia|cautelar)[^.!?]*(aprovad|100%|sem apontament)/i;
const STATUS_INTERNO = /em an[áa]lise|\bpendente\b|aguardando/i;
const ALCANCE = /todo o brasil|\bnacional\b|santa catarina(?!.{0,40}balne[áa]rio)/i;
const MARKDOWN = /\*\*|^#{1,6}\s|\[.+\]\(.+\)|^\s*[-*]\s/m;
const GARANTIA = /garantia de (motor|f[áa]brica)/i;
const DONOS = /[úu]nico dono|[úu]nica dona/i;
const EQUIPAMENTOS = /teto solar|teto panor[âa]mico|banco[s]? em couro|couro|multim[íi]dia|c[âa]mera de r[ée]|sensor de estacionamento|ar-condicionado digital/i;

export function validarDescritivo(
  texto: string,
  dossie: Dossie,
  campo: CampoDeTexto,
): Reprovacao[] {
  const r: Reprovacao[] = [];
  const add = (regra: string, motivo: string) => r.push({ regra, motivo });

  if (campo === "descricao_seo") {
    const ab = aberturaDe(texto).length;
    if (ab > LIMITE_META) {
      add("abertura", `A abertura tem ${ab} caracteres e o Google corta em ${LIMITE_META}.`);
    }
  }

  if (VOCABULARIO.test(texto)) {
    add("vocabulário", 'Usa palavra que o posicionamento da loja barra ("premium", "luxo", "consulte-nos").');
  }

  if (!dossie.periciaAprovada) {
    const gatilho = texto.match(AFIRMA_PERICIA);
    if (gatilho) {
      // "sem apontamentos" É a afirmação (perícia limpa) — descarta essa
      // frase do trecho casado ANTES de perguntar se ele nega aprovação.
      // Sem isto, o "sem" de "sem apontamentos" soa como a mesma negação que
      // NEGA_APROVACAO existe para pegar em "não está aprovado", e o caso
      // real ("Laudo cautelar aprovado sem apontamentos.") deixaria de
      // reprovar — o oposto do que esta regra existe para fazer.
      const semOIdiomaDeAprovacaoLimpa = gatilho[0].toLowerCase().replace(/sem apontament\w*/g, "");
      if (!NEGA_APROVACAO.test(semOIdiomaDeAprovacaoLimpa)) {
        add("perícia", "Afirma laudo aprovado, e a perícia deste veículo não está aprovada.");
      }
    }
  }

  if (STATUS_INTERNO.test(texto)) {
    add("status interno", 'Expõe o andamento do exame ("em análise", "pendente"). Isso é status interno da loja.');
  }

  if (ALCANCE.test(texto)) {
    add("alcance", "Promete alcance maior que Paraná e Santa Catarina até Balneário Camboriú.");
  }

  if (MARKDOWN.test(texto)) {
    add("markdown", "Tem marcação. O texto vai cru para o XML do feed e apareceria com os símbolos.");
  }

  const inventados: string[] = [];
  if (!temRotulo(dossie, ROTULOS.garantia) && GARANTIA.test(texto)) inventados.push("garantia");
  if (!temRotulo(dossie, ROTULOS.donos) && DONOS.test(texto)) inventados.push("número de donos");
  if (dossie.opcionais.length === 0 && EQUIPAMENTOS.test(texto)) inventados.push("equipamento");
  if (inventados.length > 0) {
    add("fato fora do dossiê", `Afirma ${inventados.join(", ")} sem dado que sustente.`);
  }

  return r;
}
