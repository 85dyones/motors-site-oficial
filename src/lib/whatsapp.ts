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
 * A máscara de leitura de um telefone brasileiro — "(41) 99737-2165" para
 * celular, "(41) 3333-4444" para fixo.
 *
 * Estava escrita à mão dentro de `AutoAvaliacao`; passou para cá quando o
 * `LeadCaptureModal` ganhou campo de telefone, para as duas telas não
 * divergirem no formato. Só apresentação: quem consome o valor normaliza.
 *
 * ⚠️ A versão que veio da avaliação cortava sempre em 5+4 e transformava todo
 * fixo em "(41) 33334-444" — um número que não existe. Passava despercebido lá
 * porque o campo se chamava WHATSAPP e ninguém digitava fixo; no modal o
 * telefone virou obrigatório, e fixo passa a aparecer. O dado seguia certo
 * (`telefoneDoLead` só lê dígitos), mas a tela mentia.
 */
export function mascararTelefone(valor: string): string {
  const digitos = normalizarNumero(valor).slice(0, 11);
  if (digitos.length <= 2) return digitos;

  const ddd = `(${digitos.slice(0, 2)}) `;
  if (digitos.length <= 6) return ddd + digitos.slice(2);

  // 11 dígitos é celular (5+4); até 10, fixo (4+4). Enquanto o celular está
  // sendo digitado ele passa por 10 e aparece como fixo — é assim que toda
  // máscara brasileira se comporta, e o 11º dígito reposiciona o hífen.
  const corte = digitos.length === 11 ? 7 : 6;
  return `${ddd}${digitos.slice(2, corte)}-${digitos.slice(corte)}`;
}

/**
 * O telefone de um lead nos três formatos que os consumidores pedem.
 *
 * ---------------------------------------------------------------------------
 * O defeito que isto corrige
 * ---------------------------------------------------------------------------
 * Os quatro fluxos de lead — ficha, CarMatch, pop-up e avaliação — repetiam a
 * mesma linha, com um nome que mentia:
 *
 *     const cleanPhone = leadData.whatsapp;   // nada limpava
 *     const formattedPhone =
 *       cleanPhone.length === 10 || cleanPhone.length === 11
 *         ? "55" + cleanPhone
 *         : cleanPhone;
 *
 * A avaliação é o único fluxo que já capturava telefone, e passava o valor
 * **mascarado**. Com 15 caracteres, o teste de comprimento falhava e o número
 * seguia inteiro, com parênteses e hífen:
 *
 *     remoteJid  "(41) 99737-2165@s.whatsapp.net"
 *     phoneE164  "+(41) 99737-2165"
 *
 * O Evolution não conversa com esse `remoteJid`, e o Ads não casa esse E.164.
 * Medido em 2026-08-26, antes de o `LeadCaptureModal` ganhar o campo — que
 * teria estendido o mesmo estrago aos outros três fluxos.
 *
 * ⚠️ Fora da faixa de 10–11 dígitos (fixo com DDD ou celular), devolve tudo
 * `null`: número incompleto vira lead sem telefone, não lead com telefone
 * errado. O CRM sabe lidar com campo vazio; com `remoteJid` inválido, não.
 */
export interface TelefoneDeLead {
  /** Só os dígitos digitados, sem DDI. `null` se não for um número válido. */
  digitos: string | null;
  /** Com o 55 na frente — o que o CRM chama de `telefone`. */
  comDDI: string | null;
  /** O endereço que o Evolution usa. */
  remoteJid: string;
  /** E.164 com o "+", para as conversões otimizadas do Ads. */
  e164: string | null;
}

export function telefoneDoLead(bruto: string | null | undefined): TelefoneDeLead {
  const digitos = normalizarNumero(bruto);
  if (digitos.length !== 10 && digitos.length !== 11) {
    return { digitos: null, comDDI: null, remoteJid: "", e164: null };
  }
  const comDDI = `55${digitos}`;
  return { digitos, comDDI, remoteJid: `${comDDI}@s.whatsapp.net`, e164: `+${comDDI}` };
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
