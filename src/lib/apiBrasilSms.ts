/**
 * O envio de UM SMS pela APIBrasil — só servidor.
 *
 * O contrato vem do guia do fornecedor (conferido em 07/10/2026; a chamada
 * real ainda não foi feita daqui, e por isso a tela tem "Enviar teste"):
 *
 *   POST https://gateway.apibrasil.io/api/v2/sms/send/credits
 *   Authorization: Bearer <APIBRASIL_TOKEN>
 *   { tipo, number, message, user_reply, webhook_url, homolog }
 *
 * `tipo` é o produto. O guia mostra "sms-otp" (código de confirmação) e manda
 * usar o de marketing para campanha, sem escrever o identificador: ele vem de
 * `APIBRASIL_SMS_TIPO`, com o palpite "sms-marketing" de padrão. Se o
 * fornecedor recusar o tipo, a recusa aparece na tela com o texto dele.
 *
 * As convenções são as de `apiBrasil.ts`: `fetch` injetável, união `{ ok }`,
 * e NENHUMA nova tentativa — um SMS que pode ter saído não é mandado de novo.
 */
import { numeroDoFornecedor } from "./consultaDePlaca";

export const APIBRASIL_ENVIO_DE_SMS = "https://gateway.apibrasil.io/api/v2/sms/send/credits";
export const TIPO_DE_SMS_PADRAO = "sms-marketing";
/** Quanto se espera cada SMS. Curto: o lote inteiro tem de caber na função. */
export const ESPERA_DO_SMS_MS = 12000;

export type BuscarNoSms = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

export type RespostaDoSms =
  | { ok: true; id: string | null; custo: number | null }
  | {
      ok: false;
      motivo: string;
      /** O problema é da conta (saldo, token, tipo), e não deste número: o lote para. */
      paraOLote: boolean;
      /** A resposta não chegou: o SMS pode ter saído mesmo assim. */
      podeTerSaido: boolean;
    };

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** A resposta do fornecedor, lida. Separada da rede para ser testada com corpo de mentira. */
export function lerRespostaDoSms(status: number, corpo: unknown): RespostaDoSms {
  const c = objeto(corpo);
  const mensagem = typeof c?.message === "string" && c.message.trim() !== "" ? c.message.trim().slice(0, 200) : null;
  if (status === 402) return { ok: false, motivo: "A APIBrasil está sem saldo. Ponha crédito no painel deles e continue o envio.", paraOLote: true, podeTerSaido: false };
  if (status === 401 || status === 403) return { ok: false, motivo: "A APIBrasil recusou o token (APIBRASIL_TOKEN).", paraOLote: true, podeTerSaido: false };
  // Limite de chamadas: é da conta, o SMS não saiu, e insistir só piora.
  if (status === 429) return { ok: false, motivo: "A APIBrasil pediu para ir mais devagar (limite de chamadas). Espere um minuto e continue o envio.", paraOLote: true, podeTerSaido: false };
  if (status >= 500) return { ok: false, motivo: `A APIBrasil está fora do ar (HTTP ${status}).`, paraOLote: true, podeTerSaido: true };
  if (c === null) return { ok: false, motivo: "A APIBrasil respondeu algo ilegível.", paraOLote: true, podeTerSaido: true };
  // Como nas consultas: erro pode vir com HTTP 200 e `error` diferente de false.
  const erro = c.error;
  if (status >= 400 || erro === true || (typeof erro === "string" && erro !== "")) {
    // 400 e 422 com texto são quase sempre "tipo desconhecido" ou "número inválido".
    // Não dá para saber qual: o lote segue, e a recusa fica escrita em cada envio.
    return { ok: false, motivo: mensagem ?? (typeof erro === "string" ? erro.slice(0, 200) : `A APIBrasil recusou o envio (HTTP ${status}).`), paraOLote: false, podeTerSaido: false };
  }
  const dados = objeto(c.response) ?? objeto(c.data) ?? c;
  const id = dados.id ?? dados.message_id ?? c.id;
  return {
    ok: true,
    id: typeof id === "string" || typeof id === "number" ? String(id) : null,
    custo: numeroDoFornecedor(c.tax ?? dados.tax ?? dados.cost),
  };
}

export async function enviarSms(sms: {
  numero: string;
  mensagem: string;
  token: string;
  tipo: string;
  homologacao: boolean;
  /** Para onde o fornecedor avisa entrega e resposta. Sem ela, só se sabe que o SMS foi aceito. */
  retorno: string | null;
  buscar?: BuscarNoSms;
}): Promise<RespostaDoSms> {
  const buscar = sms.buscar ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }));
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_DO_SMS_MS);
  try {
    const r = await buscar(APIBRASIL_ENVIO_DE_SMS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sms.token}` },
      body: JSON.stringify({
        tipo: sms.tipo,
        number: sms.numero,
        message: sms.mensagem,
        user_reply: true,
        ...(sms.retorno ? { webhook_url: sms.retorno } : {}),
        homolog: sms.homologacao,
      }),
      signal: controle.signal,
    });
    return lerRespostaDoSms(r.status, await r.json().catch(() => null));
  } catch (erro) {
    const estourou = (erro as Error)?.name === "AbortError";
    return {
      ok: false,
      motivo: estourou ? "A APIBrasil não respondeu a tempo; o SMS pode ter saído." : "Sem conexão com a APIBrasil; o SMS pode ter saído.",
      paraOLote: !estourou,
      podeTerSaido: true,
    };
  } finally {
    clearTimeout(relogio);
  }
}
