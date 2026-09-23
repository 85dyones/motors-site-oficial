import { CAMPO_DA_PROMOCAO, CAMPOS_DE_FOTO } from "./estoqueEscrita";

/**
 * O que NÃO se faz em lote — a decisão, separada da rota para poder ser testada.
 *
 * Recebe o objeto que já passou por `extrairCamposNossos` (nunca o corpo cru:
 * a pergunta é sobre o que a escrita gravaria, não sobre o que alguém mandou) e
 * devolve o motivo da recusa, ou `null` quando o lote é legítimo.
 *
 * ---------------------------------------------------------------------------
 * Por que isto virou função, em 2026-09-02
 * ---------------------------------------------------------------------------
 * As duas primeiras barreiras viviam soltas no handler, e o teste que as cobria
 * mirava `CAMPOS_NOSSOS` — a lista errada. Esta rota não usa `CAMPOS_NOSSOS`;
 * usa `camposGravaveis(undefined)`, e as duas divergiram quando a F0.5 abriu as
 * fotos: elas entraram na lista da rota sem entrar na do teste, que continuou
 * verde guardando uma propriedade que não era a que protegia nada.
 *
 * Com a decisão aqui, o teste exercita a MESMA função que o handler chama.
 */
export function recusaDoLote(atualizacao: Record<string, unknown>): string | null {
  // Custo de aquisição: o valor é de um carro só. Barrado em vez de
  // silenciosamente ignorado — mesma linha da matriz A17 que o editor aplica.
  if ("preco_compra" in atualizacao) {
    return "Custo de aquisição se altera no editor do veículo, um a um";
  }

  // Promoção, pelo motivo mais concreto: o desconto é medido contra o preço de
  // CADA carro. Um valor único em dez veículos de preços diferentes vira dez
  // descontos que ninguém escolheu — e num deles, um preço acima do de tabela.
  if (CAMPO_DA_PROMOCAO in atualizacao) {
    return "Preço promocional se define no editor do veículo, um a um";
  }

  // Foto — e esta barreira nasceu de um furo REAL, aberto pela F0.5.
  //
  // Enquanto as fotos exigiam `origem = 'painel'`, esta rota as descartava
  // sozinha: ela chama `extrairCamposNossos` SEM origem. Ao abrir a galeria
  // para qualquer origem, elas passaram a estar na lista que a rota usa, e a
  // escrita em massa abriu junto, sem ninguém pedir. Medido: um POST com 200
  // ids e `{whatsapp_images: []}` zerava a foto dos 200.
  //
  // O estrago seria silencioso. A régua de publicação só é conferida quando
  // `estado_cadastro` vem no corpo, então os carros continuariam `publicado` no
  // banco e sumiriam da vitrine na leitura seguinte, sem erro em lugar nenhum —
  // o mesmo modo de falha que a condição por origem existia para evitar,
  // trocando o sync pelo lote como autor.
  //
  // E há a razão de sempre: a galeria é tela de UM carro, com ordem e capa. O
  // mesmo array em N veículos não é operação que alguém queira.
  if (CAMPOS_DE_FOTO.some((c) => c in atualizacao)) {
    return "Foto se envia e se ordena no editor do veículo, um a um";
  }

  return null;
}
