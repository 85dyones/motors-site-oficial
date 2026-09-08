import { ROTULOS, temRotulo, type Dossie } from "./dossie";

/**
 * Reprova texto fora do padrão antes de ele chegar à tela.
 *
 * Toda regra de substring usa `\b`. Sem isso, /pendente/ reprova
 * "perícia independente" e a validação passa a reprovar tudo — defeito medido
 * em 08/09/2026, que fez uma tabela de resultados parecer "cinco modelos
 * ruins" antes de a causa aparecer.
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
  const frases = texto.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+/g);
  if (!frases || frases.length === 0) return texto.replace(/\s+/g, " ").trim();
  return frases.slice(0, 2).join("").trim();
}

const VOCABULARIO = /\b(premium|luxo|exclusiv[oa]s?|consulte-nos)\b|melhor pre[çc]o/i;
const AFIRMA_PERICIA = /(laudo|per[íi]cia|cautelar)[^.!?]{0,40}(aprovad|100%|sem apontament)/i;
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

  if (!dossie.periciaAprovada && AFIRMA_PERICIA.test(texto)) {
    add("perícia", "Afirma laudo aprovado, e a perícia deste veículo não está aprovada.");
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
