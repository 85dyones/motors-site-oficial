import { nomeDoVeiculo } from "./nomeDoVeiculo";

/**
 * O `interesse` que `/api/leads` grava na linha do lead.
 *
 * É o que a pessoa quer, na melhor forma disponível, nesta ordem: o veículo da
 * ficha, senão o que ela escreveu (`mensagem`, de onde a campanha e a encomenda
 * derivam a frase), senão a busca que ela fazia.
 *
 * ---------------------------------------------------------------------------
 * Por que o veículo passa por `nomeDoVeiculo`
 * ---------------------------------------------------------------------------
 * Até 17/09/2026 a rota montava `[marca, modelo, versao].join(" ")` à mão. O
 * RevendaMais embute a versão no `modelo` na maior parte do cadastro, e 106 das
 * 110 linhas medidas em 08/09 gravavam a versão duas vezes:
 *
 *   Honda Fit 1.5 Ex 16v Flex 4p Automatico 1.5 ex 16v flex 4p automatico
 *
 * É o texto que o consultor lê no card do kanban, no modal de desfecho e no
 * alerta do funil, e o que vai na mensagem do funil para o cliente.
 * `nomeDoVeiculo` é a régua da ficha: acrescenta a versão só quando o modelo
 * não a traz. O ano continua de fora, como sempre esteve neste campo.
 *
 * Fora da rota para poder ser testado pelo comportamento. Dentro do handler, o
 * único teste possível era procurar a expressão no arquivo.
 */
export function interesseDoLead(entrada: {
  veiculo?: { marca?: unknown; modelo?: unknown; versao?: unknown } | null;
  mensagem?: unknown;
  intencaoBusca?: Record<string, unknown> | null;
}): string | null {
  const { veiculo, mensagem, intencaoBusca } = entrada;

  // `trim` no fim: com marca e modelo vazios, `nomeDoVeiculo` devolveria a
  // versão com um espaço na frente.
  const doVeiculo = veiculo
    ? nomeDoVeiculo({
        marca: texto(veiculo.marca),
        modelo: texto(veiculo.modelo),
        versao: texto(veiculo.versao),
      }).trim()
    : "";

  const daBusca =
    intencaoBusca && typeof intencaoBusca === "object"
      ? Object.values(intencaoBusca).filter(Boolean).join(" · ")
      : "";

  return doVeiculo || texto(mensagem) || daBusca || null;
}

/** Campo do corpo como texto: o que não é string vira vazio, sem lançar. */
function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}
