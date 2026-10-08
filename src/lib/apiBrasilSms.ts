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

export const OPERADORAS = ["claro", "vivo", "tim", "oi"] as const;
export type Operadora = (typeof OPERADORAS)[number];
export const lerOperadora = (v: unknown): Operadora | null => (typeof v === "string" && (OPERADORAS as readonly string[]).includes(v) ? (v as Operadora) : null);

export const APIBRASIL_ENVIO_DE_SMS = "https://gateway.apibrasil.io/api/v2/sms/send/credits";
export const TIPO_DE_SMS_PADRAO = "sms-marketing";
/** Quanto se espera cada SMS. Curto: o lote inteiro tem de caber na função. */
export const ESPERA_DO_SMS_MS = 12000;

export type BuscarNoSms = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

/**
 * O que o fornecedor disse, para a tela e o log (08/10/2026: o primeiro teste
 * real "foi enviado" e não chegou, e não havia como saber o que a APIBrasil
 * respondeu). Sem o número do destinatário: só o que é da conta.
 */
export interface DitoDoFornecedor {
  /** `message` do corpo, ex.: "Dados validos! Voce foi tarifado em R$ 0,08." */
  mensagem: string | null;
  /** `response.data.status` (ex.: "processed") ou `response.status`. */
  situacao: string | null;
  /** O fornecedor tratou como teste: `homolog: true` ou `api_limit_for: "homolog"`. Nada sai, nada é cobrado. */
  homologacao: boolean;
}

export type RespostaDoSms =
  | { ok: true; id: string | null; custo: number | null; fornecedor: DitoDoFornecedor }
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
  // A doc (SMS Marketing, 08/10/2026) põe o id em `response.data.id`; versões antigas, em `response.id`.
  const resposta = objeto(c.response);
  const dados = objeto(resposta?.data) ?? resposta ?? objeto(c.data) ?? c;
  const id = dados.id ?? dados.message_id ?? resposta?.id ?? c.id;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 200) : null);
  return {
    ok: true,
    id: typeof id === "string" || typeof id === "number" ? String(id) : null,
    custo: numeroDoFornecedor(c.tax ?? dados.tax ?? dados.cost),
    fornecedor: {
      mensagem,
      situacao: texto(dados.status) ?? texto(resposta?.status),
      homologacao: c.homolog === true || c.api_limit_for === "homolog",
    },
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
  /**
   * `operator` da doc (o exemplo traz "claro"; a doc não diz se é obrigatório).
   * Só o teste manda, quando a pessoa escolhe: é como se descobre se o
   * "invalid" do primeiro teste real (08/10/2026) vinha da falta dele.
   */
  operadora?: Operadora | null;
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
        ...(sms.operadora ? { operator: sms.operadora } : {}),
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
