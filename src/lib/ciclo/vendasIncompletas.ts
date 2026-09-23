/**
 * O texto da rotina noturna de vendas incompletas (manual §3.2).
 *
 * Vive fora de `app/api/ciclo/vendas-incompletas/route.ts` porque um arquivo
 * de rota do App Router só pode exportar handlers e configuração — e o texto
 * precisa ser importável pelos testes.
 */

/** Como cada pendência se chama para um humano. */
const NOME_DA_PENDENCIA: Record<string, string> = {
  vendedor: "vendedor da venda",
  versao: "versão do veículo",
  cep: "CEP do cliente",
  data_nascimento: "data de nascimento",
  consentimento_canais: "consentimento de canal",
};

/** O primeiro nome, que é como a loja fala com a equipe. */
function primeiroNome(nome: string): string {
  return (nome || "").trim().split(/\s+/)[0] || nome;
}

function listar(itens: string[]): string {
  if (itens.length === 1) return itens[0];
  return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
}

/**
 * O texto que o vendedor recebe.
 *
 * Cutucar não é cobrar: a mensagem diz o que falta e por quê, sem ranking e
 * sem comparação com colega. O ranking existe para a gestão ver o conjunto, e
 * mandá-lo por WhatsApp transformaria um indicador de registro numa exposição
 * pública — que é como um indicador honesto vira número maquiado.
 */
export function mensagemDoVendedor(
  nome: string,
  vendas: { cliente_nome: string; placa: string | null; pendencias: string[] }[],
): string {
  const linhas = vendas.map((v) => {
    const faltando = v.pendencias.map((p) => NOME_DA_PENDENCIA[p] ?? p);
    const carro = v.placa ? ` (${v.placa})` : "";
    return `• ${v.cliente_nome}${carro}: falta ${listar(faltando)}`;
  });

  const abertura =
    vendas.length === 1
      ? `Oi, ${primeiroNome(nome)}. Ficou um registro de venda pela metade:`
      : `Oi, ${primeiroNome(nome)}. Ficaram ${vendas.length} registros de venda pela metade:`;

  return [
    abertura,
    "",
    ...linhas,
    "",
    "Dá para completar no painel, em Vendas do Ciclo. O que falta aí muda o " +
      "que o cliente recebe: sem canal consentido, ele não recebe nada do " +
      "programa — nem a boas-vindas.",
  ].join("\n");
}
