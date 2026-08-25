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

/**
 * O número da loja escrito para o cliente LER — "(41) 99737-2165".
 *
 * Existe porque rótulo e link estavam saindo de campos diferentes. No rodapé,
 * o texto vinha de `companySettings.whatsapp` (o campo digitado à mão) e o
 * `href` de `linkWhatsApp()`, que usa `whatsappRaw`. Enquanto os dois campos
 * concordam ninguém percebe; quando divergem — e divergiram: em 2026-08-25 o
 * HTML servido da home exibia "(41) 99842-6127" ao lado de um `wa.me` para
 * outro número — o visitante que anota o número da tela liga para uma linha e
 * o botão abre outra. É a divergência de NAP que o §0.5.6 do plano de
 * aquisição encontrou, vista de dentro do site.
 *
 * Formatando a partir de `whatsappRaw` (a mesma fonte do link), rótulo e
 * destino não têm mais como discordar. Número em formato inesperado volta como
 * o campo de leitura já traz — apresentação nunca deve engolir o dado.
 */
export function telefoneVisivel(
  company: Pick<CompanySettings, "whatsappRaw" | "whatsapp"> | null | undefined
): string {
  const numero = numeroDaLoja(company);

  // DDD brasileiro: dois dígitos, nenhum deles zero. A restrição não é
  // preciosismo — sem ela um 0800 (11 dígitos, como um celular com DDD) sai
  // formatado como "(08) 00000-0000", que é um número que não existe.
  const comDdi = numero.match(/^55([1-9][1-9])(\d{4,5})(\d{4})$/);
  if (comDdi) return `(${comDdi[1]}) ${comDdi[2]}-${comDdi[3]}`;

  // Sem DDI, como às vezes o painel grava.
  const semDdi = numero.match(/^([1-9][1-9])(\d{4,5})(\d{4})$/);
  if (semDdi) return `(${semDdi[1]}) ${semDdi[2]}-${semDdi[3]}`;

  return (company?.whatsapp ?? "").trim() || numero;
}
