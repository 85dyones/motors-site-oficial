/**
 * Consulta de CEP — para conferir, não para colecionar.
 *
 * O manual prevê `cep` em `clientes` (§2.1) e **não** prevê logradouro,
 * bairro ou cidade. Então o endereço resolvido aparece na tela para o
 * vendedor confirmar que digitou o CEP certo, e só o CEP é gravado. Ampliar o
 * que se guarda sobre o cliente é decisão do dono, não efeito colateral de uma
 * facilidade de digitação.
 *
 * A fonte é a BrasilAPI, que é pública, gratuita e sem chave — e cai na
 * ViaCEP quando não responde. Nenhuma das duas recebe dado do cliente: vai só
 * o CEP, que não identifica ninguém sozinho.
 */

export interface EnderecoDoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/** Deixa só os dígitos. "80010-010" → "80010010". */
export function somenteDigitos(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/** CEP brasileiro tem 8 dígitos. Nem mais, nem menos. */
export function cepValido(valor: string | null | undefined): boolean {
  return somenteDigitos(valor).length === 8;
}

/** "80010010" → "80010-010". Incompleto sai como está, para não atrapalhar quem digita. */
export function formatarCep(valor: string | null | undefined): string {
  const d = somenteDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function enderecoEmLinha(e: EnderecoDoCep): string {
  const rua = [e.logradouro, e.bairro].filter(Boolean).join(", ");
  const cidade = [e.cidade, e.uf].filter(Boolean).join("/");
  return [rua, cidade].filter(Boolean).join(" — ");
}

/**
 * Devolve o endereço, ou `null` quando o CEP não existe.
 *
 * Falha de rede também devolve `null`: a consulta é conveniência, e não pode
 * impedir o fechamento de uma venda. O vendedor segue com o CEP digitado.
 */
export async function consultarCep(valor: string): Promise<EnderecoDoCep | null> {
  const cep = somenteDigitos(valor);
  if (cep.length !== 8) return null;

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
    if (r.ok) {
      const j = await r.json();
      return {
        cep,
        logradouro: j.street ?? "",
        bairro: j.neighborhood ?? "",
        cidade: j.city ?? "",
        uf: j.state ?? "",
      };
    }
    // 404 é CEP inexistente — resposta legítima, não vale tentar a segunda fonte.
    if (r.status === 404) return null;
  } catch {
    // rede fora: cai para a ViaCEP abaixo
  }

  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j.erro) return null;
    return {
      cep,
      logradouro: j.logradouro ?? "",
      bairro: j.bairro ?? "",
      cidade: j.localidade ?? "",
      uf: j.uf ?? "",
    };
  } catch {
    return null;
  }
}
