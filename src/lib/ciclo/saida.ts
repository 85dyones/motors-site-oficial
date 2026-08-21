/**
 * A saída do carro da Garagem Motors.
 *
 * O dono definiu em 2026-08-20 que a Garagem é vitalícia **até a próxima venda
 * do carro**. Sem este registro, o motor de gatilhos continuaria lembrando de
 * revisão quem já vendeu — e o gerador continuaria abrindo janela para um carro
 * que não é mais do cliente.
 *
 * O motivo é texto livre: fixar uma lista fechada agora seria inventar o
 * vocabulário do negócio antes de a loja ter visto um caso.
 */
export interface DadosDaSaida {
  saiu_em: string;
  motivo_saida: string;
}

export interface ProblemaDaSaida {
  campo: string;
  mensagem: string;
}

export function validarSaida(dados: DadosDaSaida): ProblemaDaSaida[] {
  const problemas: ProblemaDaSaida[] = [];
  const data = String(dados.saiu_em ?? "").trim();
  const motivo = String(dados.motivo_saida ?? "").trim();

  if (data === "") {
    problemas.push({ campo: "saiu_em", mensagem: "Informe a data em que o carro saiu." });
  } else if (data > new Date().toISOString().slice(0, 10)) {
    problemas.push({ campo: "saiu_em", mensagem: "A data da saída não pode estar no futuro." });
  }

  // O CHECK `veiculos_vendidos_saida_com_motivo` cobra a mesma coisa no banco.
  // Validar aqui é para a tela dizer o que falta, não para substituí-lo.
  if (motivo === "") {
    problemas.push({ campo: "motivo_saida", mensagem: "Diga o motivo da saída." });
  }

  return problemas;
}
