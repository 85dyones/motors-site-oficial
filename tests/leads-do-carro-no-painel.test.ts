import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";
import { ETAPAS_PADRAO, NAO_E_OPORTUNIDADE, ROTULO_DO_DESFECHO, type EtapaDoFunil, type MotivoDoFunil } from "../src/lib/funil";
import {
  CANAL_DO_CONTATO_PELO_WHATSAPP,
  CANAL_DO_PEDIDO_DE_EXAME,
  COLUNAS_DOS_LEADS_DO_CARRO,
  leadDoCarroDaLinha,
  leadsDoCarroNaTela,
  situacaoDoLead,
  type LeadDoCarro,
} from "../src/lib/pedidosDeExame";

/**
 * O desfecho do lead do carro de repasse, como a visão do carro no painel o
 * mostra (pedido do dono em 28/09): "sinalizar na lista de pedidos de exame no
 * pátio o desfecho, se foi ganho, perdido ou se não é oportunidade (teste)".
 *
 * As etapas e os motivos aqui são os de um funil EDITADO, e não o padrão: o
 * rótulo que a tela mostra tem de vir do banco, não de uma cópia no código.
 */

const etapa = (chave: string, rotulo: string, tipo: EtapaDoFunil["tipo"], ordem: number): EtapaDoFunil => ({
  chave,
  rotulo,
  ordem,
  tipo,
  estagnacao_minutos: null,
  transferencia_minutos: null,
  protegida: false,
  ativa: true,
});

const ETAPAS: EtapaDoFunil[] = [
  etapa("novo", "Novo", "aberta", 1),
  etapa("proposta", "Proposta enviada", "aberta", 2),
  etapa("fechado", "Ganho", "ganho", 3),
  etapa("perdido", "Perdido", "perdido", 4),
  etapa("descartado", "Não é oportunidade", "descartado", 5),
];

const motivo = (chave: string, rotulo: string, tipo: MotivoDoFunil["tipo"]): MotivoDoFunil => ({
  chave,
  rotulo,
  tipo,
  ordem: 1,
  ativo: true,
});

const MOTIVOS: MotivoDoFunil[] = [
  motivo("preco", "Achou caro", "perdido"),
  motivo("teste", "Teste", "descartado"),
  motivo("a_vista", "Fechou à vista", "ganho"),
];

function lead(parcial: Partial<LeadDoCarro> = {}): LeadDoCarro {
  return {
    id: "l-1",
    nome: "Ana Souza",
    telefone: "5541997372165",
    interesse: null,
    created_at: "2026-09-24T15:00:00Z",
    canal: "repasse-exame",
    situacao: "novo",
    desfecho: null,
    desfecho_motivo: null,
    responsavel: "Carla Vendas",
    ...parcial,
  };
}

describe("situacaoDoLead", () => {
  it("em aberto: a etapa com o rótulo do funil configurado", () => {
    const s = situacaoDoLead(lead({ situacao: "proposta" }), ETAPAS, MOTIVOS);
    expect(s.tipo).toBe("aberta");
    expect(s.texto).toBe("Em aberto · Proposta enviada");
    expect(s.motivo).toBeNull();
  });

  it("ganho sem motivo: só \"Ganho\"", () => {
    const s = situacaoDoLead(lead({ situacao: "fechado", desfecho: "ganho" }), ETAPAS, MOTIVOS);
    expect(s.tipo).toBe("ganho");
    expect(s.texto).toBe("Ganho");
  });

  it("ganho com motivo: o motivo vem junto", () => {
    const s = situacaoDoLead(lead({ situacao: "fechado", desfecho: "ganho", desfecho_motivo: "a_vista" }), ETAPAS, MOTIVOS);
    expect(s.texto).toBe("Ganho · Fechou à vista");
    expect(s.motivo).toBe("Fechou à vista");
  });

  it("perdido com motivo: o rótulo do motivo, não a chave", () => {
    const s = situacaoDoLead(lead({ situacao: "perdido", desfecho: "perdido", desfecho_motivo: "preco" }), ETAPAS, MOTIVOS);
    expect(s.tipo).toBe("perdido");
    expect(s.texto).toBe("Perdido · Achou caro");
    expect(s.motivo).toBe("Achou caro");
  });

  // O terceiro desfecho existe para SAIR da conta (lib/funil.ts). Mostrado
  // como "Perdido", o teste do vendedor voltaria a parecer negócio perdido.
  it("descartado com \"Teste\": não é oportunidade, e nunca perdido", () => {
    const s = situacaoDoLead(lead({ situacao: "descartado", desfecho: "descartado", desfecho_motivo: "teste" }), ETAPAS, MOTIVOS);
    expect(s.tipo).toBe("descartado");
    expect(s.texto).toBe("Não é oportunidade · Teste");
    expect(s.texto).not.toContain(ROTULO_DO_DESFECHO.perdido);
  });

  it("o desfecho manda, e não a etapa: a mesma régua do Kanban", () => {
    // O Kanban separa aberto de fechado por `desfecho` (LeadsKanban, `emAberto`).
    const s = situacaoDoLead(lead({ situacao: "novo", desfecho: "perdido", desfecho_motivo: "preco" }), ETAPAS, MOTIVOS);
    expect(s.texto).toBe("Perdido · Achou caro");
  });

  it("etapa que o funil não tem mais: a chave, como o Kanban faz com o motivo", () => {
    const s = situacaoDoLead(lead({ situacao: "etapa_apagada" }), ETAPAS, MOTIVOS);
    expect(s.tipo).toBe("aberta");
    expect(s.texto).toBe("Em aberto · etapa_apagada");
  });

  it("motivo que o funil não tem mais: a chave", () => {
    const s = situacaoDoLead(lead({ desfecho: "perdido", desfecho_motivo: "motivo_antigo" }), ETAPAS, MOTIVOS);
    expect(s.texto).toBe("Perdido · motivo_antigo");
  });

  it("fechado antes de a caixa pedir motivo: só o desfecho", () => {
    const s = situacaoDoLead(lead({ desfecho: "descartado" }), ETAPAS, MOTIVOS);
    expect(s.texto).toBe(NAO_E_OPORTUNIDADE);
  });

  it("quem atende: o nome gravado no lead; vazio ou em branco é sem responsável", () => {
    expect(situacaoDoLead(lead(), ETAPAS, MOTIVOS).responsavel).toBe("Carla Vendas");
    expect(situacaoDoLead(lead({ responsavel: null }), ETAPAS, MOTIVOS).responsavel).toBeNull();
    expect(situacaoDoLead(lead({ responsavel: "   " }), ETAPAS, MOTIVOS).responsavel).toBeNull();
  });

  it("sem etapa gravada: só \"Em aberto\"", () => {
    expect(situacaoDoLead(lead({ situacao: null }), ETAPAS, MOTIVOS).texto).toBe("Em aberto");
  });
});

describe("a linha do banco", () => {
  it("o select pede tudo o que a lista mostra", () => {
    for (const coluna of ["id", "nome", "created_at", "canal", "situacao", "desfecho", "desfecho_motivo", "responsavel"]) {
      expect(COLUNAS_DOS_LEADS_DO_CARRO.split(", ")).toContain(coluna);
    }
  });

  it("desfecho fora dos três tipos não vira desfecho", () => {
    const l = leadDoCarroDaLinha({ id: "l-1", nome: "Ana", created_at: "2026-09-24T15:00:00Z", desfecho: "sumiu" });
    expect(l?.desfecho).toBeNull();
  });

  it("linha sem nome não vira lead", () => {
    expect(leadDoCarroDaLinha({ id: "l-2", nome: "", created_at: "2026-09-24T15:00:00Z" })).toBeNull();
  });
});

describe("leadsDoCarroNaTela", () => {
  const LINHAS = [
    { ...lead({ id: "e-1", nome: "Ana Exame", canal: "repasse-exame", desfecho: "perdido", desfecho_motivo: "preco" }) },
    { ...lead({ id: "w-1", nome: "Bruno Zap", canal: "repasse-whatsapp", desfecho: "descartado", desfecho_motivo: "teste" }) },
    // Um lead de outro canal com o mesmo carro não é nem pedido nem contato.
    { ...lead({ id: "x-1", nome: "Carlos Lista", canal: "repasse" }) },
  ];

  it("separa exame de WhatsApp pelo canal, e larga o resto", () => {
    const { pedidos, contatos } = leadsDoCarroNaTela({ linhas: LINHAS, etapas: ETAPAS, motivos: MOTIVOS });
    expect(pedidos.map((l) => l.nome)).toEqual(["Ana Exame"]);
    expect(contatos.map((l) => l.nome)).toEqual(["Bruno Zap"]);
    expect(pedidos[0].situacaoNaTela.texto).toBe("Perdido · Achou caro");
    expect(contatos[0].situacaoNaTela.texto).toBe("Não é oportunidade · Teste");
  });

  it("os dois canais são os que a leitura pede", () => {
    expect([CANAL_DO_PEDIDO_DE_EXAME, CANAL_DO_CONTATO_PELO_WHATSAPP]).toEqual(["repasse-exame", "repasse-whatsapp"]);
  });

  it("sem funil no banco, o funil de sempre (a queda do Kanban)", () => {
    const { pedidos } = leadsDoCarroNaTela({ linhas: [{ ...lead({ situacao: "em_contato" }) }], etapas: null, motivos: null });
    expect(pedidos[0].situacaoNaTela.texto).toBe(`Em aberto · ${ETAPAS_PADRAO.find((e) => e.chave === "em_contato")!.rotulo}`);
  });
});

describe("\"Não é oportunidade\" tem uma fonte só", () => {
  it("a caixa de desfecho do Kanban lê a mesma constante da lista do carro", () => {
    const caixa = lerCodigo("src/components/admin/ModalDeDesfecho.tsx");
    expect(caixa).toContain("chapeu: NAO_E_OPORTUNIDADE");
    expect(caixa).not.toContain("\"Não é oportunidade\"");
  });
});
