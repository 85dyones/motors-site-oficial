import type { Repasse } from "../src/lib/repasse";

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
      { descricao: "Embreagem patinando nas arrancadas", local: "Câmbio", foto: "https://x.supabase.co/f/1.webp", orcamento: 1400, estetico: false },
      { descricao: "Pneus dianteiros no fim da vida útil", local: "Rodas dianteiras", foto: "https://x.supabase.co/f/2.webp", orcamento: 620, estetico: false },
      { descricao: "Risco de 12 cm na lataria", local: "Porta traseira direita", foto: "https://x.supabase.co/f/3.webp", orcamento: null, estetico: true },
    ],
    sem_defeitos_conhecidos: false,
    oficina_do_orcamento: "Oficina Exemplo",
    orcamento_em: "2026-09-22",
    web_full_images: ["w1", "w2", "w3", "w4"],
    whatsapp_images: ["z1", "z2", "z3", "z4"],
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
