import type { Repasse } from "../src/lib/repasse";

const PASTA_DE_TESTE =
  "https://x.supabase.co/storage/v1/object/public/veiculos/repasse/3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";

/** URL de foto do NOSSO bucket — é o único formato que passa no checklist (M9). */
export function fotoDeTeste(lote: string, variante: "web" | "zap" = "web"): string {
  return `${PASTA_DE_TESTE}/${lote}-${variante}.${variante === "web" ? "webp" : "jpg"}`;
}

/**
 * Um repasse COMPLETO e válido — o Kwid Zen das pranchas do Design. Cada teste
 * quebra só o campo que interessa, e o resto continua passando no checklist.
 */
export function repasseDeTeste(parcial: Partial<Repasse> = {}): Repasse {
  return {
    id: "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f",
    slug: "renault-kwid-zen-1-0-2021-3f9a1c",
    marca: "Renault",
    modelo: "Kwid",
    versao: "Zen 1.0",
    ano_modelo: 2021,
    ano_fabricacao: 2020,
    quilometragem: 71200,
    cambio: "Manual",
    combustivel: "Flex",
    cor: "Prata",
    carroceria: "hatch",
    preco: 36900,
    fipe_valor: 42100,
    fipe_codigo: "025258-0",
    fipe_mes_referencia: "setembro de 2026",
    laudo: "aprovado",
    laudo_apontamento: null,
    leilao_consta: false,
    leilao_detalhe: null,
    sinistro_consta: false,
    sinistro_detalhe: null,
    historico_consultado_em: "2026-09-22",
    resumo: "Embreagem patinando e pneus dianteiros no fim. Preferimos repassar com o orçamento na mão.",
    motivo: "Entrou na troca de um SUV em setembro.",
    itens_de_estado: [
      { descricao: "Embreagem patinando nas arrancadas", local: "Câmbio", foto: fotoDeTeste("d1"), orcamento: 1400, estetico: false },
      { descricao: "Pneus dianteiros no fim da vida útil", local: "Rodas dianteiras", foto: fotoDeTeste("d2"), orcamento: 620, estetico: false },
      { descricao: "Risco de 12 cm na lataria", local: "Porta traseira direita", foto: fotoDeTeste("d3"), orcamento: null, estetico: true },
    ],
    sem_defeitos_conhecidos: false,
    oficina_do_orcamento: "Oficina Exemplo",
    orcamento_em: "2026-09-22",
    web_full_images: ["l1", "l2", "l3", "l4"].map((l) => fotoDeTeste(l)),
    whatsapp_images: ["l1", "l2", "l3", "l4"].map((l) => fotoDeTeste(l, "zap")),
    situacao: "rascunho",
    lojistas_desde: null,
    aberto_ao_publico_em: null,
    reservado_em: null,
    vendido_em: null,
    arquivado_em: null,
    created_at: "2026-09-24T12:00:00Z",
    ...parcial,
  };
}

/** A linha como o banco devolve: o repasse de teste + as colunas internas. */
export function linhaDoBancoDeTeste(parcial: Partial<Repasse> = {}): Record<string, unknown> {
  return {
    criado_por: "u-0",
    enviado_em: null,
    validado_por: null,
    validado_em: null,
    devolvido_com: null,
    updated_at: "2026-09-24T12:00:00Z",
    ...repasseDeTeste(parcial),
  };
}
