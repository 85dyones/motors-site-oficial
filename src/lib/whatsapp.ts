import type { CompanySettings } from "../types";

/**
 * O número de WhatsApp da loja — um só, resolvido num lugar só.
 *
 * Antes disto havia dois caminhos. Sete telas montavam o link a partir de
 * `companySettings.whatsappRaw`, cada uma com sua variação de fallback e de
 * limpeza; o pop-up de lead tinha campo próprio no painel e escolhia o número
 * comparando contra dois valores mágicos ("554198089550" e "5511999999999")
 * para decidir se o que estava salvo era "de verdade" ou default.
 *
 * O resultado era um segundo número possível: bastava alguém digitar qualquer
 * coisa no campo do pop-up para a loja passar a atender em dois lugares, sem
 * nada na tela avisando. Decisão do dono em 2026-08-10: um número só.
 *
 * Trocar de número agora é editar um campo — "Dados da concessionária" →
 * WhatsApp — e vale para o site inteiro.
 */

/** Só dígitos, como o wa.me e o Evolution esperam. */
export function normalizarNumero(bruto: string | null | undefined): string {
  return (bruto ?? "").replace(/\D/g, "");
}

/**
 * O número da loja em formato discável, ou "" se não houver.
 *
 * `whatsapp` é o campo formatado para leitura ("(41) 99842-6127") e serve de
 * rede de segurança para instalações antigas, anteriores ao `whatsappRaw`.
 */
export function numeroDaLoja(
  company: Pick<CompanySettings, "whatsappRaw" | "whatsapp"> | null | undefined
): string {
  return normalizarNumero(company?.whatsappRaw) || normalizarNumero(company?.whatsapp);
}

/**
 * Link de conversa com a loja, com mensagem opcional já codificada.
 *
 * Devolve "" quando não há número: link `wa.me/` sem número abre o WhatsApp
 * numa tela de erro, o que é pior do que não oferecer o botão. Quem chama
 * decide se esconde o botão — como o resto do site já faz com campo vazio.
 */
export function linkWhatsApp(
  company: Pick<CompanySettings, "whatsappRaw" | "whatsapp"> | null | undefined,
  mensagem?: string
): string {
  const numero = numeroDaLoja(company);
  if (!numero) return "";
  const texto = mensagem?.trim() ? `?text=${encodeURIComponent(mensagem)}` : "";
  return `https://wa.me/${numero}${texto}`;
}
