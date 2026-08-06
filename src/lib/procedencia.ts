import type { ItemProcedencia } from "../types";

/**
 * Faixa de procedência da página do veículo (tela 03 do design doc).
 *
 * Os quatro blocos são promessa da loja, não dado do carro — por isso não vêm
 * do registro do veículo. Mas também não podem ser fixos no código: dois deles
 * afirmavam mais do que a operação sustenta. "Revisões rastreadas" pressupõe um
 * histórico que boa parte do estoque não tem, e transferência "sem custo
 * adicional" é condição de negociação, não regra da casa. Texto de confiança que
 * o cliente descobre ser falso no balcão custa mais caro do que texto ausente.
 *
 * A lista de ids é fechada: o painel edita título, descrição e visibilidade,
 * não cria nem remove blocos. Quem quiser derrubar um bloco usa `ativo: false`
 * — o texto fica guardado para voltar depois.
 */
export const PROCEDENCIA_PADRAO: ItemProcedencia[] = [
  {
    id: "laudo",
    titulo: "Laudo cautelar completo",
    descricao:
      "Estrutura, chassi e histórico de sinistro auditados por laboratório credenciado.",
    ativo: true,
  },
  {
    id: "manutencao",
    titulo: "Histórico de manutenção",
    descricao:
      "Quando o veículo tem registro de revisões, ele é apresentado com as notas fiscais disponíveis.",
    ativo: true,
  },
  {
    id: "garantia",
    titulo: "Garantia de motor e câmbio",
    descricao: "Cobertura contratada na entrega, sem carência e sem franquia.",
    ativo: true,
  },
  {
    id: "transferencia",
    titulo: "Transferência acompanhada",
    descricao:
      "Cuidamos da documentação e da vistoria. Custos e prazos são informados na negociação.",
    ativo: true,
  },
];

function textoValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}

/**
 * Reconstrói a faixa a partir do que estiver salvo nas settings.
 *
 * O blob vem do banco e pode estar em qualquer estado — ausente, meio gravado,
 * de uma versão anterior com outros ids. A saída é sempre a lista completa na
 * ordem do código: campo em branco ou ilegível cai no padrão, id desconhecido é
 * ignorado. A faixa é conteúdo de confiança da PDP; ela aparecer vazia ou fora
 * de ordem por causa de um salvamento pela metade é pior que ignorar o salvo.
 */
export function normalizarProcedencia(bruto: unknown): ItemProcedencia[] {
  const salvos = Array.isArray(bruto)
    ? bruto
    : Array.isArray((bruto as { itens?: unknown })?.itens)
      ? ((bruto as { itens: unknown[] }).itens)
      : [];

  const porId = new Map<string, Record<string, unknown>>();
  for (const item of salvos) {
    if (item && typeof item === "object") {
      const id = (item as { id?: unknown }).id;
      if (typeof id === "string") porId.set(id, item as Record<string, unknown>);
    }
  }

  return PROCEDENCIA_PADRAO.map((padrao) => {
    const salvo = porId.get(padrao.id);
    if (!salvo) return { ...padrao };
    return {
      id: padrao.id,
      titulo: textoValido(salvo.titulo) ? salvo.titulo.trim() : padrao.titulo,
      descricao: textoValido(salvo.descricao) ? salvo.descricao.trim() : padrao.descricao,
      // Só `false` explícito desliga — valor ausente ou lixo mantém no ar.
      ativo: salvo.ativo !== false,
    };
  });
}
