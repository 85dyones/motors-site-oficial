import { tokenConfere } from "./comparacaoConstante";

/**
 * Por que um token recusado não conferiu — sem nunca dizer qual é.
 *
 * Nasceu em 2026-10-09, no meio do incidente do 401 do Chatwoot: o dono
 * trocou o token três vezes, na Vercel e na URL do webhook, e a porta seguiu
 * recusando. O log dizia só "401". Sem ler o segredo (o que ninguém deve
 * precisar fazer), não havia como saber se os dois valores eram diferentes de
 * verdade ou se eram o MESMO valor estragado no caminho: um `Bearer ` colado
 * na variável, um espaço sobrando, o `+` que a URL transforma em espaço, o `&`
 * ou o `#` que cortam o token no meio.
 *
 * Esta função testa cada um desses estragos contra o valor esperado e devolve
 * o NOME do que encontrou. O que sai daqui vai para o log:
 *
 *   - o diagnóstico, um rótulo fixo desta lista, nunca texto do chamador;
 *   - o tamanho do recebido e do esperado (tamanho não é pedaço do valor);
 *   - se o esperado tem caractere que estraga em URL (`+ / = & # % ?` ou
 *     espaço), que é a pista para o caso "diferente" vindo do Chatwoot.
 *
 * O que nunca sai: o valor, prefixo, sufixo ou hash de nenhum dos dois.
 *
 * O diagnóstico não serve de oráculo para quem tenta adivinhar o segredo: ele
 * só vai para o log, e a resposta continua sendo o mesmo 401 para qualquer
 * rótulo. As comparações passam por `tokenConfere`, em tempo constante. Os
 * rótulos de estrago exigem um valor que, consertado, confere com o segredo;
 * quem não o conhece cai em "diferente" ou "sem_token".
 */
export type DiagnosticoDoToken =
  | "sem_token"
  | "esperado_com_bearer"
  | "recebido_com_bearer"
  | "espacos_nas_pontas"
  | "mais_virou_espaco"
  | "codificado_duas_vezes"
  | "cortado_no_caminho"
  | "diferente";

export interface PistaDoToken {
  diagnostico: DiagnosticoDoToken;
  recebido_tamanho: number;
  esperado_tamanho: number;
  esperado_tem_caractere_de_url: boolean;
}

const BEARER = /^bearer\s+/i;
const CARACTERE_DE_URL = /[+/=&#%?\s]/;

function decodificado(valor: string): string | null {
  try {
    const d = decodeURIComponent(valor);
    return d === valor ? null : d;
  } catch {
    return null;
  }
}

/**
 * @param recebido O token como a rota o leu (`?token=` já decodificado pela
 *                 URL, ou o Bearer sem a palavra "Bearer").
 * @param esperado O valor da variável de ambiente, já aparado.
 */
export function diagnosticarToken(recebido: string | null | undefined, esperado: string): PistaDoToken {
  const r = recebido ?? "";
  const pista = (diagnostico: DiagnosticoDoToken): PistaDoToken => ({
    diagnostico,
    recebido_tamanho: r.length,
    esperado_tamanho: esperado.length,
    esperado_tem_caractere_de_url: CARACTERE_DE_URL.test(esperado),
  });

  if (!r) return pista("sem_token");

  // A variável da Vercel foi preenchida com "Bearer <token>". A URL do
  // Chatwoot leva só o token e nunca vai conferir.
  if (BEARER.test(esperado) && tokenConfere(r, esperado.replace(BEARER, ""))) {
    return pista("esperado_com_bearer");
  }
  // O contrário: a URL do Chatwoot ganhou "Bearer " na frente do token.
  if (BEARER.test(r) && tokenConfere(r.replace(BEARER, ""), esperado)) {
    return pista("recebido_com_bearer");
  }
  if (r.trim() !== r && tokenConfere(r.trim(), esperado)) return pista("espacos_nas_pontas");
  // `?token=a+b` chega como "a b": em query string o `+` é espaço.
  if (r.includes(" ") && tokenConfere(r.replace(/ /g, "+"), esperado)) return pista("mais_virou_espaco");
  // O token foi colado já codificado (`%2B` no lugar de `+`) e a URL o
  // codificou de novo, ou o contrário.
  const d = decodificado(r);
  if (d !== null && tokenConfere(d, esperado)) return pista("codificado_duas_vezes");
  // Um `&` ou `#` no meio do token corta a query ali: chega só o começo. Abaixo
  // de 8 caracteres o acaso casaria o começo de qualquer segredo com um
  // `?token=a` de robô, e o rótulo mentiria.
  if (r.length >= 8 && r.length < esperado.length && tokenConfere(r, esperado.slice(0, r.length))) {
    return pista("cortado_no_caminho");
  }
  return pista("diferente");
}
