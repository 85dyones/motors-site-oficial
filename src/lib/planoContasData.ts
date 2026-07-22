export interface ContaPlano {
  codigo: string;
  nome: string;
  nivel: number;
  tipo: "ENTRADA" | "DEBITO" | "RECEITA" | "CUSTO" | "DESPESA" | "OUTROS";
  permiteLancamento: boolean;
  contaPai?: string;
}

export const PLANO_DE_CONTAS_REVENDA: ContaPlano[] = [
  // 001 - ENTRADAS E MOVIMENTAÇÕES CRÉDITO
  { codigo: "001", nome: "ENTRADAS E MOVIMENTAÇÕES CRÉDITO", nivel: 1, tipo: "ENTRADA", permiteLancamento: false },
  { codigo: "001.001", nome: "ENTRADAS DIVERSAS", nivel: 2, tipo: "ENTRADA", permiteLancamento: false, contaPai: "001" },
  { codigo: "001.001.005", nome: "MOVIMENTAÇÕES DE ENTRADA", nivel: 3, tipo: "ENTRADA", permiteLancamento: false, contaPai: "001.001" },
  { codigo: "001.001.005.002", nome: "MOVIMENTAÇÃO - TRANSFERÊNCIA FINANCEIRA - ENTRADA", nivel: 4, tipo: "ENTRADA", permiteLancamento: true, contaPai: "001.001.005" },
  { codigo: "001.001.005.005", nome: "VEÍCULOS - IPVA/LICENC/SEG OBRIG/MULTA ENTRADA", nivel: 4, tipo: "ENTRADA", permiteLancamento: true, contaPai: "001.001.005" },
  { codigo: "001.001.005.010", nome: "REEMBOLSO / DEVOLUÇÕES (ENTRADA)", nivel: 4, tipo: "ENTRADA", permiteLancamento: true, contaPai: "001.001.005" },
  { codigo: "001.001.005.012", nome: "ACERTO DE SALDO CRÉDITO", nivel: 4, tipo: "ENTRADA", permiteLancamento: true, contaPai: "001.001.005" },
  { codigo: "001.001.005.022", nome: "REEMBOLSO / DEVOLUÇÕES DIVERSAS", nivel: 4, tipo: "ENTRADA", permiteLancamento: true, contaPai: "001.001.005" },

  // 002 - DÉBITOS E AJUSTES OPERACIONAIS
  { codigo: "002", nome: "DÉBITOS E AJUSTES OPERACIONAIS", nivel: 1, tipo: "DEBITO", permiteLancamento: false },
  { codigo: "002.001", nome: "DÉBITOS DIVERSOS", nivel: 2, tipo: "DEBITO", permiteLancamento: false, contaPai: "002" },
  { codigo: "002.001.001", nome: "OPERAÇÕES DE DÉBITO / LAVACAR", nivel: 3, tipo: "DEBITO", permiteLancamento: false, contaPai: "002.001" },
  { codigo: "002.001.001.002", nome: "CONTA - ACERTO DE SALDO DÉBITO", nivel: 4, tipo: "DEBITO", permiteLancamento: true, contaPai: "002.001.001" },
  { codigo: "002.001.001.003", nome: "PRODUTOS LAVACAR", nivel: 4, tipo: "DEBITO", permiteLancamento: true, contaPai: "002.001.001" },
  { codigo: "002.001.001.005", nome: "JUROS CARTÃO DE CRÉDITO / DÉBITO", nivel: 4, tipo: "DEBITO", permiteLancamento: true, contaPai: "002.001.001" },
  { codigo: "002.001.001.008", nome: "CORTESIAS - BONIFICAÇÕES", nivel: 4, tipo: "DEBITO", permiteLancamento: true, contaPai: "002.001.001" },
  { codigo: "002.001.001.012", nome: "DESPESA COM PEÇAS (DÉBITO DIRETO)", nivel: 4, tipo: "DEBITO", permiteLancamento: true, contaPai: "002.001.001" },
  { codigo: "002.001.001.013", nome: "MANUTENÇÃO - PREDIAL", nivel: 4, tipo: "DEBITO", permiteLancamento: true, contaPai: "002.001.001" },

  // 003 - DRE / RESULTADO OPERACIONAL
  { codigo: "003", nome: "DRE / RESULTADO OPERACIONAL", nivel: 1, tipo: "OUTROS", permiteLancamento: false },

  // 003.001 - RECEITAS OPERACIONAIS
  { codigo: "003.001", nome: "RECEITAS OPERACIONAIS", nivel: 2, tipo: "RECEITA", permiteLancamento: false, contaPai: "003" },
  { codigo: "003.001.001", nome: "RECEITAS DE VENDAS E SEGUROS", nivel: 3, tipo: "RECEITA", permiteLancamento: false, contaPai: "003.001" },
  { codigo: "003.001.001.001", nome: "VENDA DE VEICULO", nivel: 4, tipo: "RECEITA", permiteLancamento: true, contaPai: "003.001.001" },
  { codigo: "003.001.001.003", nome: "RECEITA SOBRE VENDA DE SEGUROS", nivel: 4, tipo: "RECEITA", permiteLancamento: true, contaPai: "003.001.001" },
  { codigo: "003.001.002", nome: "RECEITAS DE SERVIÇOS E DOCUMENTAÇÃO", nivel: 3, tipo: "RECEITA", permiteLancamento: false, contaPai: "003.001" },
  { codigo: "003.001.002.006", nome: "RECEITA SOBRE INTERMEDIAÇÕES", nivel: 4, tipo: "RECEITA", permiteLancamento: true, contaPai: "003.001.002" },
  { codigo: "003.001.002.012", nome: "RECEITA SOBRE TRANSFERÊNCIA DE DOCUMENTOS", nivel: 4, tipo: "RECEITA", permiteLancamento: true, contaPai: "003.001.002" },
  { codigo: "003.001.003", nome: "RECEITAS FINANCEIRAS E APLICAÇÕES", nivel: 3, tipo: "RECEITA", permiteLancamento: false, contaPai: "003.001" },
  { codigo: "003.001.003.001", nome: "RECEITA SOBRE FINANCIAMENTO CLIENTE", nivel: 4, tipo: "RECEITA", permiteLancamento: true, contaPai: "003.001.003" },
  { codigo: "003.001.003.002", nome: "RETORNO SOBRE FINANCIAMENTO", nivel: 4, tipo: "RECEITA", permiteLancamento: true, contaPai: "003.001.003" },
  { codigo: "003.001.003.004", nome: "RECEITA PLUS SOBRE FINANCIAMENTOS", nivel: 4, tipo: "RECEITA", permiteLancamento: true, contaPai: "003.001.003" },
  { codigo: "003.001.003.007", nome: "RECEITA SOBRE APLICAÇÕES FINANCEIRAS", nivel: 4, tipo: "RECEITA", permiteLancamento: true, contaPai: "003.001.003" },
  { codigo: "003.001.003.008", nome: "VENDA DE REFINANCIAMENTO", nivel: 4, tipo: "RECEITA", permiteLancamento: true, contaPai: "003.001.003" },

  // 003.003 - CUSTOS DOS VEÍCULOS E SERVIÇOS (CMV/CSV)
  { codigo: "003.003", nome: "CUSTOS DOS VEÍCULOS E SERVIÇOS (CMV/CSV)", nivel: 2, tipo: "CUSTO", permiteLancamento: false, contaPai: "003" },
  { codigo: "003.003.001", nome: "COMPRA DE VEÍCULOS E PEÇAS", nivel: 3, tipo: "CUSTO", permiteLancamento: false, contaPai: "003.003" },
  { codigo: "003.003.001.001", nome: "VEÍCULOS - COMPRA ENTRADA", nivel: 4, tipo: "CUSTO", permiteLancamento: true, contaPai: "003.003.001" },
  { codigo: "003.003.001.005", nome: "CUSTO SOBRE VENDA DE PEÇAS E ACESSORIOS", nivel: 4, tipo: "CUSTO", permiteLancamento: true, contaPai: "003.003.001" },
  { codigo: "003.003.002", nome: "PREPARAÇÃO DE ESTOQUE", nivel: 3, tipo: "CUSTO", permiteLancamento: false, contaPai: "003.003" },
  { codigo: "003.003.002.002", nome: "CUSTO SOBRE PREPARAÇÃO DE VEÍCULOS", nivel: 4, tipo: "CUSTO", permiteLancamento: true, contaPai: "003.003.002" },

  // 003.004 - CUSTOS DE VENDAS E COMISSÕES
  { codigo: "003.004", nome: "CUSTOS DE VENDAS E COMISSÕES", nivel: 2, tipo: "DESPESA", permiteLancamento: false, contaPai: "003" },
  { codigo: "003.004.001", nome: "COMISSÕES DIVERSAS", nivel: 3, tipo: "DESPESA", permiteLancamento: false, contaPai: "003.004" },
  { codigo: "003.004.001.001", nome: "COMISSÕES SOBRE VENDAS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.004.001" },
  { codigo: "003.004.001.004", nome: "COMISSÕES SOBRE REFINANCIAMENTO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.004.001" },
  { codigo: "003.004.001.005", nome: "COMISSÕES OUTRAS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.004.001" },

  // 003.005 - DESPESAS OPERACIONAIS
  { codigo: "003.005", nome: "DESPESAS OPERACIONAIS E ADMINISTRATIVAS", nivel: 2, tipo: "DESPESA", permiteLancamento: false, contaPai: "003" },

  // 003.005.001 - ADMINISTRATIVAS
  { codigo: "003.005.001", nome: "ADMINISTRATIVAS", nivel: 3, tipo: "DESPESA", permiteLancamento: false, contaPai: "003.005" },
  { codigo: "003.005.001.002", nome: "ADMINISTRATIVAS - CARTÓRIO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.004", nome: "ADMINISTRATIVAS - CONTADOR", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.005", nome: "ADMINISTRATIVAS - CORREIOS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.015", nome: "ADMINISTRATIVAS - MATERIAL DE ESCRITÓRIO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.016", nome: "ADMINISTRATIVAS - MATERIAL DE LIMPEZA E CANTINA", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.018", nome: "ADMINISTRATIVAS - OUTRAS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.019", nome: "ADMINISTRATIVAS - PAG. CARTÃO DE CRÉDITO LOJA", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.021", nome: "ADMINISTRATIVAS - PGTO CARNETS/CONSÓRCIOS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.024", nome: "ADMINISTRATIVAS - SEGUROS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.026", nome: "ADMINISTRATIVAS - UNIFORMES E EPI", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.027", nome: "ADMINISTRATIVAS - VIAGEM", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.028", nome: "ADMINISTRATIVAS - UBER/TAXI", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },
  { codigo: "003.005.001.029", nome: "ADMINISTRATIVAS - COMBUSTÍVEIS E LUBRIFICANTES", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.001" },

  // 003.005.002 - FUNCIONÁRIOS / PESSOAL
  { codigo: "003.005.002", nome: "FUNCIONÁRIOS / PESSOAL", nivel: 3, tipo: "DESPESA", permiteLancamento: false, contaPai: "003.005" },
  { codigo: "003.005.002.015", nome: "FUNCIONÁRIOS - SALÁRIOS COMERCIAL", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.002" },
  { codigo: "003.005.002.016", nome: "FUNCIONÁRIOS - SALÁRIOS MANUTENCAO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.002" },
  { codigo: "003.005.002.017", nome: "FUNCIONÁRIOS - SALÁRIOS MARKETING", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.002" },

  // 003.005.003 - IMPOSTOS E TRIBUTOS
  { codigo: "003.005.003", nome: "IMPOSTOS E TRIBUTOS", nivel: 3, tipo: "DESPESA", permiteLancamento: false, contaPai: "003.005" },
  { codigo: "003.005.003.001", nome: "IMPOSTOS - COFINS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.003" },
  { codigo: "003.005.003.009", nome: "IMPOSTOS - ICMS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.003" },
  { codigo: "003.005.003.011", nome: "IMPOSTOS - IOF", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.003" },
  { codigo: "003.005.003.012", nome: "IMPOSTOS - IPTU", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.003" },
  { codigo: "003.005.003.014", nome: "IMPOSTOS - IRPJ", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.003" },
  { codigo: "003.005.003.015", nome: "IMPOSTOS - ISS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.003" },
  { codigo: "003.005.003.020", nome: "IMPOSTOS - DARF", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.003" },

  // 003.005.004 - INFRAESTRUTURA
  { codigo: "003.005.004", nome: "INFRAESTRUTURA", nivel: 3, tipo: "DESPESA", permiteLancamento: false, contaPai: "003.005" },
  { codigo: "003.005.004.001", nome: "INFRAESTRUTURA - ÁGUA", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.004" },
  { codigo: "003.005.004.003", nome: "INFRAESTRUTURA - ALUGUÉIS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.004" },
  { codigo: "003.005.004.005", nome: "INFRAESTRUTURA - CONSTRUÇÃO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.004" },
  { codigo: "003.005.004.006", nome: "INFRAESTRUTURA - ENERGIA ELÉTRICA", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.004" },
  { codigo: "003.005.004.007", nome: "INFRAESTRUTURA - INTERNET", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.004" },
  { codigo: "003.005.004.009", nome: "INFRAESTRUTURA - SEGURANÇA", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.004" },
  { codigo: "003.005.004.010", nome: "INFRAESTRUTURA - TELEFONE", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.004" },

  // 003.005.005 - MARKETING E PROPAGANDA
  { codigo: "003.005.005", nome: "MARKETING E PROPAGANDA", nivel: 3, tipo: "DESPESA", permiteLancamento: false, contaPai: "003.005" },
  { codigo: "003.005.005.006", nome: "MARKETING - PORTAL INTERNET", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.005" },

  // 003.005.006 - DESPESAS COM VEÍCULOS (ESTOQUE/MANUTENÇÃO)
  { codigo: "003.005.006", nome: "DESPESAS COM VEÍCULOS (ESTOQUE/MANUTENÇÃO)", nivel: 3, tipo: "DESPESA", permiteLancamento: false, contaPai: "003.005" },
  { codigo: "003.005.006.002", nome: "VEÍCULOS - CARTÓRIO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.004", nome: "VEÍCULOS - COMBUSTÍVEIS E LUBRIFICANTES", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.005", nome: "VEÍCULOS - COMPRA SAÍDA", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.006", nome: "VEÍCULOS - DESPACHANTE", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.008", nome: "VEÍCULOS - DESPESAS DE VEÍCULOS VENDIDOS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.010", nome: "VEÍCULOS - GARANTIA", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.012", nome: "VEÍCULOS - IPVA/LICENC/SEG OBRIG/MULTA SAIDA", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.015", nome: "VEÍCULOS - PAGAMENTO CONSIGNADO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.016", nome: "VEÍCULOS - PEÇAS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.017", nome: "VEÍCULOS - PINTURA/POLIMENTO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.018", nome: "VEÍCULOS - PLACAS/TARJETAS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.019", nome: "VEÍCULOS - PNEUS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.020", nome: "VEÍCULOS - PREPARAÇÃO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.021", nome: "VEÍCULOS - QUITAÇÕES", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.022", nome: "VEÍCULOS - REEMBOLSO/DEVOLUÇÕES", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.026", nome: "VEÍCULOS - VISTORIA", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.028", nome: "MANUTENÇÃO - VEICULOS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },
  { codigo: "003.005.006.029", nome: "PEDÁGIO", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.006" },

  // 003.005.007 - DESPESAS BANCÁRIAS
  { codigo: "003.005.007", nome: "DESPESAS BANCÁRIAS", nivel: 3, tipo: "DESPESA", permiteLancamento: false, contaPai: "003.005" },
  { codigo: "003.005.007.001", nome: "BANCOS - TAXAS/TARIFAS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.005.007" },

  // 003.006 - MOVIMENTAÇÕES DIVERSAS E PRÓ-LABORE
  { codigo: "003.006", nome: "DESPESAS FINANCEIRAS E DIVERSAS", nivel: 2, tipo: "DESPESA", permiteLancamento: false, contaPai: "003" },
  { codigo: "003.006.001", nome: "MOVIMENTAÇÕES DIVERSAS", nivel: 3, tipo: "DESPESA", permiteLancamento: false, contaPai: "003.006" },
  { codigo: "003.006.001.001", nome: "DESPESAS REEMBOLSAVEIS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.006.001" },
  { codigo: "003.006.001.006", nome: "MOVIMENTAÇÃO - DESPESAS FINANCEIRAS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.006.001" },
  { codigo: "003.006.001.007", nome: "MOVIMENTAÇÃO - DEVOLUÇÃO FINANCIAMENTO CLIENTE", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.006.001" },
  { codigo: "003.006.001.010", nome: "MOVIMENTAÇÃO - PRÓ-LABORE", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.006.001" },
  { codigo: "003.006.001.012", nome: "MOVIMENTAÇÃO - TRANSFERÊNCIA FINANCEIRA - SAIDAS", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.006.001" },
  { codigo: "003.006.001.016", nome: "LUCRO INVESTIDOR", nivel: 4, tipo: "DESPESA", permiteLancamento: true, contaPai: "003.006.001" }
];

export function findContaByCodigo(codigo: string): ContaPlano | undefined {
  return PLANO_DE_CONTAS_REVENDA.find(c => c.codigo === codigo);
}

export function searchPlanoDeContas(query: string, tipoFiltro?: "RECEITA" | "DESPESA" | "CUSTO" | "ENTRADA" | "DEBITO"): ContaPlano[] {
  const q = query.toLowerCase().trim();
  let list = PLANO_DE_CONTAS_REVENDA.filter(c => c.permiteLancamento);

  if (tipoFiltro) {
    if (tipoFiltro === "RECEITA" || tipoFiltro === "ENTRADA") {
      list = list.filter(c => c.tipo === "RECEITA" || c.tipo === "ENTRADA");
    } else if (tipoFiltro === "DESPESA" || tipoFiltro === "CUSTO" || tipoFiltro === "DEBITO") {
      list = list.filter(c => c.tipo === "DESPESA" || c.tipo === "CUSTO" || c.tipo === "DEBITO");
    }
  }

  if (!q) return list;
  return list.filter(
    c => c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q)
  );
}
