import { describe, it, expect } from "vitest";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import { decidirInteracao, diaNaLoja, instanteNoFusoDaLoja } from "../src/lib/gestaoDoLead";
import {
  AVISO_DE_LEAD_FECHADO,
  AVISO_DE_LEAD_QUE_SAIU,
  FORM_DO_REGISTRO_VAZIO,
  HORA_PADRAO_DO_PASSO,
  PERGUNTA_DO_DESCARTE,
  aoVoltarOuAvancar,
  diaNoCalendarioDaLoja,
  filtrarParados,
  registroEmAndamento,
  textoDoVazioDaLista,
  PLACEHOLDER_DO_REGISTRO,
  aoMudarAUrl,
  aoMudarOEstado,
  comDia,
  comSugestao,
  comTipo,
  contarChips,
  contarEscopos,
  corpoDoRegistro,
  dataDoHistorico,
  diaEHoraNaLoja,
  estadoDoRegistro,
  filtrarPorChip,
  filtrarPorEscopo,
  formAoConcluir,
  formAoRemarcar,
  formatarTelefone,
  iniciarSincronia,
  lerEstadoDaUrl,
  linhaDaBusca,
  linhaDoVeiculo,
  linhaDosSemPasso,
  mensagemDeQuemChegou,
  origemDoLead,
  padroesDoFunil,
  queryDoEstado,
  rotuloDaUltimaInteracao,
  seloCurtoDeTransferencias,
  textoDoVazio,
  urlDoFunil,
  urlDoLead,
  type FormDoRegistro,
} from "../src/lib/filaDoFunil";

/**
 * As regras de tela da gestão do lead (`lib/filaDoFunil`), executadas.
 *
 * O relógio é fixo: sábado, 03/10/2026, 14:00 em São Paulo (17:00 UTC).
 */
const AGORA = Date.parse("2026-10-03T17:00:00.000Z");
const iso = (deslocamentoEmHoras: number) => new Date(AGORA + deslocamentoEmHoras * 3_600_000).toISOString();
/** O `proximo_passo_definido_em` como o PostgREST devolve: com microssegundos. */
const CARIMBO_DO_PASSO = "2026-10-03T14:00:00.123456+00:00";

describe("o escopo e a vista padrão, por papel", () => {
  it("o Comercial puro abre na Lista do dia e não tem escopo para alternar", () => {
    // A rota devolve `escopo: "meus"` a quem só é Comercial: ele só recebe os dele.
    expect(padroesDoFunil("meus", "Rodrigo")).toEqual({ temEscopo: false, escopo: "minha", vista: "lista" });
  });

  it("Administrador, Gestor e SDR abrem no Quadro, em Equipe, com Minha fila para escolher", () => {
    for (const escopoDoServidor of ["todos", "designados"]) {
      expect(padroesDoFunil(escopoDoServidor, "Dyones Oliveira"), escopoDoServidor).toEqual({
        temEscopo: true,
        escopo: "equipe",
        vista: "quadro",
      });
    }
  });

  it("sem nome no perfil não há como dizer quais são 'meus': o controle some", () => {
    expect(padroesDoFunil("todos", null).temEscopo).toBe(false);
    expect(padroesDoFunil("todos", "   ").temEscopo).toBe(false);
    // E a tela continua na equipe, e não numa fila vazia.
    expect(padroesDoFunil("todos", null).escopo).toBe("equipe");
  });
});

describe("escopo, busca e chips contam a mesma lista", () => {
  const leads = [
    { id: "a", responsavel: "Ana", desfecho: null, proximo_passo: "Ligar", proximo_passo_vence_em: iso(-30) },
    { id: "b", responsavel: "Ana", desfecho: null, proximo_passo: "Enviar proposta", proximo_passo_vence_em: iso(2) },
    { id: "c", responsavel: "Bruno", desfecho: null, proximo_passo: "Cobrar", proximo_passo_vence_em: iso(-50) },
    { id: "d", responsavel: "Bruno", desfecho: null, proximo_passo: "Visita", proximo_passo_vence_em: iso(48) },
    { id: "e", responsavel: null, desfecho: null, proximo_passo: null, proximo_passo_vence_em: null },
    // Fechado com passo vencido: negócio encerrado não tem fila.
    { id: "f", responsavel: "Ana", desfecho: "perdido", proximo_passo: "Ligar", proximo_passo_vence_em: iso(-30) },
  ];
  const escopo = (qual: "minha" | "equipe", buscando = false) =>
    filtrarPorEscopo(leads, { temEscopo: true, escopo: qual, meuNome: "Ana", buscando });

  it("Minha fila são os leads com o nome de quem está logado", () => {
    expect(escopo("minha").map((l) => l.id)).toEqual(["a", "b", "f"]);
    expect(escopo("equipe")).toHaveLength(6);
    // O nome vem aparado do perfil, como o rodízio o grava.
    expect(filtrarPorEscopo(leads, { temEscopo: true, escopo: "minha", meuNome: " Ana ", buscando: false })).toHaveLength(3);
  });

  it("buscando, o escopo é ignorado", () => {
    expect(escopo("minha", true)).toHaveLength(6);
  });

  it("quem não tem escopo para alternar vê o que o servidor entregou", () => {
    expect(filtrarPorEscopo(leads, { temEscopo: false, escopo: "minha", meuNome: null, buscando: false })).toHaveLength(6);
  });

  it("o segmentado conta só os abertos", () => {
    expect(contarEscopos(leads, "Ana")).toEqual({ minha: 2, equipe: 5 });
  });

  it("os chips contam sobre o escopo, nunca sobre o total", () => {
    expect(contarChips(escopo("equipe"), AGORA)).toEqual({ atrasados: 2, hoje: 1 });
    expect(contarChips(escopo("minha"), AGORA)).toEqual({ atrasados: 1, hoje: 1 });
  });

  it("e sobre a busca: o que a busca devolveu é o que se conta", () => {
    const achados = leads.filter((l) => l.responsavel === "Bruno");
    expect(contarChips(achados, AGORA)).toEqual({ atrasados: 1, hoje: 0 });
  });

  it("o chip filtra pela mesma régua com que conta", () => {
    expect(filtrarPorChip(escopo("equipe"), "atrasados", AGORA).map((l) => l.id)).toEqual(["a", "c"]);
    expect(filtrarPorChip(escopo("equipe"), "hoje", AGORA).map((l) => l.id)).toEqual(["b"]);
    expect(filtrarPorChip(escopo("equipe"), null, AGORA)).toHaveLength(6);
  });

  it("passo que acabou de vencer é de hoje, e não atraso (a folga do 'Agora')", () => {
    const chegou = [{ desfecho: null, proximo_passo: "Atender na loja", proximo_passo_vence_em: new Date(AGORA - 60_000).toISOString() }];
    expect(contarChips(chegou, AGORA)).toEqual({ atrasados: 0, hoje: 1 });
  });
});

describe("os textos da tela, no singular e no plural", () => {
  it("a linha da busca", () => {
    expect(linhaDaBusca(1, true)).toBe("1 encontrado na equipe inteira");
    expect(linhaDaBusca(3, true)).toBe("3 encontrados na equipe inteira");
    expect(linhaDaBusca(0, true)).toBe("Nenhum encontrado na equipe inteira");
    // "Na equipe inteira" vale só para quem vê a equipe.
    expect(linhaDaBusca(1, false)).toBe("1 encontrado");
    expect(linhaDaBusca(4, false)).toBe("4 encontrados");
  });

  it("a caixa do vazio só manda trocar para Equipe quem tem Equipe", () => {
    expect(textoDoVazio(true)).toBe("Nada por aqui. Limpe a busca ou troque para Equipe.");
    expect(textoDoVazio(false)).toBe("Nada por aqui. Limpe a busca.");
  });

  it("a linha dos leads sem próximo passo", () => {
    expect(linhaDosSemPasso(1)).toBe("1 lead sem próximo passo");
    expect(linhaDosSemPasso(7)).toBe("7 leads sem próximo passo");
  });

  it("nenhum texto usa o plural entre parênteses", () => {
    for (const texto of [linhaDaBusca(2, true), linhaDosSemPasso(2), textoDoVazio(true)]) {
      expect(texto).not.toMatch(/\(s\)/);
    }
  });
});

describe("os rótulos do card e do detalhe", () => {
  it("a última interação: TIPO · HÁ X", () => {
    expect(rotuloDaUltimaInteracao({ tipo: "whatsapp", quando: iso(-6 * 24) }, AGORA)).toBe("WHATSAPP · HÁ 6 D");
    expect(rotuloDaUltimaInteracao({ tipo: "ligacao", quando: iso(-3) }, AGORA)).toBe("LIGAÇÃO · HÁ 3 H");
    expect(rotuloDaUltimaInteracao({ tipo: "visita", quando: new Date(AGORA - 20_000).toISOString() }, AGORA)).toBe(
      "VISITA À LOJA · AGORA",
    );
    // Tipo que o banco venha a aceitar depois não quebra o card.
    expect(rotuloDaUltimaInteracao({ tipo: "email", quando: iso(-1) }, AGORA)).toBe("EMAIL · HÁ 1 H");
  });

  it("as transferências só contam a partir da segunda", () => {
    expect(seloCurtoDeTransferencias(13)).toBe("13ª transf.");
    expect(seloCurtoDeTransferencias(2)).toBe("2ª transf.");
    expect(seloCurtoDeTransferencias(1)).toBeNull();
    expect(seloCurtoDeTransferencias(null)).toBeNull();
  });

  it("a data do histórico é a do relógio da loja, e não a do aparelho", () => {
    // 01:30 UTC de 04/10 ainda é 22:30 de 03/10 em São Paulo.
    expect(dataDoHistorico("2026-10-04T01:30:00.000Z")).toBe("03/10/26 22:30");
    expect(dataDoHistorico(null)).toBe("");
    expect(dataDoHistorico("não é data")).toBe("");
  });

  it("o telefone, a linha do carro e a origem", () => {
    expect(formatarTelefone("5541991176299")).toBe("(41) 99117-6299");
    expect(formatarTelefone(null)).toBe("");
    expect(linhaDoVeiculo({ km: 45000, preco: 62900, vendido: false })).toBe("Estoque · 45.000 km · R$ 62.900");
    expect(linhaDoVeiculo({ km: null, preco: null, vendido: true })).toBe("Vendido");
    expect(origemDoLead({ canal: "WhatsApp Proposta", utm_source: "meta", utm_campaign: "seminovos" })).toBe(
      "WhatsApp Proposta · meta · seminovos",
    );
    expect(origemDoLead({ canal: null, utm_source: null, utm_campaign: null })).toBe("");
  });
});

describe("a vista, o escopo e o lead aberto na URL", () => {
  it("lê só os valores da lista", () => {
    expect(lerEstadoDaUrl("vista=lista&escopo=minha&lead=abc-123")).toEqual({ vista: "lista", escopo: "minha", lead: "abc-123" });
    expect(lerEstadoDaUrl("vista=grade&escopo=todos&lead=../../x")).toEqual({ vista: null, escopo: null, lead: null });
    expect(lerEstadoDaUrl("")).toEqual({ vista: null, escopo: null, lead: null });
  });

  it("escreve sempre na mesma ordem, e some com o que é padrão", () => {
    expect(queryDoEstado({ vista: "lista", escopo: null, lead: "l1" })).toBe("vista=lista&lead=l1");
    expect(urlDoFunil({ vista: null, escopo: null, lead: null })).toBe("/admin/leads");
    expect(urlDoFunil({ vista: "quadro", escopo: "equipe", lead: null })).toBe("/admin/leads?vista=quadro&escopo=equipe");
    expect(urlDoLead("0dcb1cdc-fb39-4a39-99c9-923f025619f4")).toBe("/admin/leads/0dcb1cdc-fb39-4a39-99c9-923f025619f4");
  });

  it("a tela muda na hora; pedir o que já está não muda nada (nem escreve na URL)", () => {
    const inicio = iniciarSincronia("");
    const aberto = aoMudarOEstado(inicio, { lead: "l1" });
    expect(aberto.estado.lead).toBe("l1");
    expect(aoMudarOEstado(aberto, { lead: "l1" })).toBe(aberto);
    // A lista de pedidos à URL saiu com o `router.replace`: a tela escreve a
    // URL na hora, com `history.replaceState`.
    expect(aberto).not.toHaveProperty("pedidas");
  });

  it("a query que chega atrasada é eco: não desfaz um clique mais novo", () => {
    let s = iniciarSincronia("");
    s = aoMudarOEstado(s, { lead: "l1" });
    s = aoMudarOEstado(s, { lead: "l2" });
    // O roteador entrega a do primeiro clique quando a barra já mostra a do segundo.
    s = aoMudarAUrl(s, "lead=l1", "?lead=l2");
    expect(s.estado.lead).toBe("l2");
    s = aoMudarAUrl(s, "lead=l2", "?lead=l2");
    expect(s.estado.lead).toBe("l2");
    expect(s.ultimaQuery).toBe("lead=l2");
  });

  it("a URL que muda por fora é adotada: o link do alerta, um link do painel", () => {
    let s = iniciarSincronia("vista=lista");
    s = aoMudarAUrl(s, "vista=quadro&lead=l9", "?vista=quadro&lead=l9");
    expect(s.estado).toEqual({ vista: "quadro", escopo: null, lead: "l9" });
    s = aoMudarAUrl(s, "", "");
    expect(s.estado).toEqual({ vista: null, escopo: null, lead: null });
  });

  it("voltar e avançar do navegador: vale o que a barra de endereços mostra", () => {
    let s = aoMudarOEstado(iniciarSincronia(""), { lead: "l1", vista: "lista" });
    s = aoVoltarOuAvancar(s, "?vista=quadro");
    expect(s.estado).toEqual({ vista: "quadro", escopo: null, lead: null });
    // Igual ao que já está: o mesmo objeto, sem repintar.
    expect(aoVoltarOuAvancar(s, "?vista=quadro")).toBe(s);
  });
});

describe("os filtros que voltaram: parados", () => {
  const etapas = ETAPAS_PADRAO.map((e) => (e.chave === "novo" ? { ...e, estagnacao_minutos: 60, transferencia_minutos: 600 } : e));
  const lead = (id: string, minutos: number, extra: Record<string, unknown> = {}) => ({
    id,
    nome: id,
    situacao: "novo",
    created_at: new Date(AGORA - minutos * 60_000).toISOString(),
    ...extra,
  });

  it("parado é o que a régua já cobra ou vai passar adiante; esfriando ainda não", () => {
    const leads = [lead("fresco", 5), lead("esfriando", 40), lead("parado", 90), lead("transferir", 700)];
    expect(filtrarParados(leads, etapas, AGORA).map((l) => l.id)).toEqual(["parado", "transferir"]);
  });

  it("negócio fechado e etapa sem régua nunca estão parados", () => {
    const leads = [lead("fechado", 900, { desfecho: "perdido" }), lead("sem-regua", 900, { situacao: "proposta" })];
    expect(filtrarParados(leads, etapas, AGORA)).toEqual([]);
  });
});

describe("o registro começado, que não pode se perder", () => {
  it("vazio não é rascunho; o tipo sozinho também não (LIGAR só pré-seleciona)", () => {
    expect(registroEmAndamento(FORM_DO_REGISTRO_VAZIO)).toBe(false);
    expect(registroEmAndamento({ ...FORM_DO_REGISTRO_VAZIO, tipo: "ligacao" })).toBe(false);
  });

  it("qualquer coisa escrita ou escolhida é", () => {
    for (const campos of [{ texto: "a" }, { passo: "Ligar" }, { dia: "2026-10-04" }, { hora: "10:00" }, { resultado: "atendeu" as const }]) {
      expect(registroEmAndamento({ ...FORM_DO_REGISTRO_VAZIO, ...campos }), JSON.stringify(campos)).toBe(true);
    }
    expect(registroEmAndamento(formAoConcluir("Ligar", CARIMBO_DO_PASSO))).toBe(true);
    // O CONCLUIR continua começado mesmo com o "Feito: ..." apagado: ele ainda tira o passo do lead.
    expect(registroEmAndamento({ ...FORM_DO_REGISTRO_VAZIO, passoConcluido: CARIMBO_DO_PASSO })).toBe(true);
  });

  it("a pergunta e o aviso do lead que saiu são frases simples", () => {
    expect(PERGUNTA_DO_DESCARTE).toBe("Há um registro não salvo. Descartar?");
    expect(AVISO_DE_LEAD_QUE_SAIU).toBe("Este lead saiu da sua fila.");
  });
});

describe("a Lista do dia vazia e a data dos fechados", () => {
  it("sem busca, diz que falta marcar o próximo passo; com busca, manda limpar", () => {
    const semBusca = "Nenhum próximo passo marcado. Abra um lead no Quadro e registre o primeiro.";
    expect(textoDoVazioDaLista(false, true)).toBe(semBusca);
    expect(textoDoVazioDaLista(false, false)).toBe(semBusca);
    expect(textoDoVazioDaLista(true, false)).toBe("Nada por aqui. Limpe a busca.");
    expect(textoDoVazioDaLista(true, true)).toBe("Nada por aqui. Limpe a busca ou troque para Equipe.");
  });

  it("a data do desfecho é a do calendário da loja, e não a do aparelho", () => {
    // 01:30 UTC de 04/10 ainda é 03/10 em São Paulo.
    expect(diaNoCalendarioDaLoja("2026-10-04T01:30:00.000Z")).toBe("03/10/2026");
    expect(diaNoCalendarioDaLoja("2026-10-04T03:30:00.000Z")).toBe("04/10/2026");
    expect(diaNoCalendarioDaLoja(null)).toBe("");
  });
});

describe("o registro de interação: o botão REGISTRAR e a dica", () => {
  const form = (campos: Partial<FormDoRegistro>): FormDoRegistro => ({ ...FORM_DO_REGISTRO_VAZIO, ...campos });
  const AMANHA = diaNaLoja(AGORA, 1);

  it("vazio: desabilitado, pede o que aconteceu", () => {
    expect(estadoDoRegistro(form({}), AGORA)).toMatchObject({ pode: false, dica: "Escreva o que aconteceu." });
  });

  it("ligação sem resultado nem texto: pede para marcar se atendeu", () => {
    expect(estadoDoRegistro(form({ tipo: "ligacao" }), AGORA)).toMatchObject({
      pode: false,
      dica: "Marque se atendeu.",
    });
  });

  /**
   * O pedido do dono em 2026-10-09: o comercial não conseguia anotar um
   * atendimento sem ter um próximo passo combinado, e isso afastava a equipe
   * do sistema. O passo é opcional: a nota de atendimento registra sozinha.
   */
  it("com o que aconteceu e sem próximo passo: habilita, porque o passo é opcional", () => {
    const estado = estadoDoRegistro(form({ texto: "Cliente pediu um tempo para pensar." }), AGORA);
    expect(estado).toMatchObject({ pode: true, dica: "Pronto para registrar." });
    expect(estado.corpo).not.toHaveProperty("proximo_passo_vence_em");
    expect(estado.corpo).not.toHaveProperty("passo_concluido");
    // Ligação com resultado dispensa o texto, e também registra sem passo.
    expect(estadoDoRegistro(form({ tipo: "ligacao", resultado: "nao_atendeu" }), AGORA)).toMatchObject({
      pode: true,
      dica: "Pronto para registrar.",
    });
  });

  it("passo escrito sem dia e hora: desabilitado, pede a data ou que apague o passo", () => {
    const estado = estadoDoRegistro(form({ texto: "Falei com ela.", passo: "Enviar proposta" }), AGORA);
    expect(estado).toMatchObject({ pode: false, dica: "Falta o dia e a hora do próximo passo, ou apague o passo." });
    // Só o dia, sem hora, também não vale.
    expect(estadoDoRegistro(form({ texto: "x", passo: "Enviar proposta", dia: AMANHA }), AGORA).pode).toBe(false);
  });

  it("completo: habilita, e a dica diz o que o card passa a mostrar", () => {
    const estado = estadoDoRegistro(
      form({ texto: "Falei com ela.", passo: "Enviar proposta", dia: AMANHA, hora: "10:00" }),
      AGORA,
    );
    expect(estado.pode).toBe(true);
    expect(estado.dica).toBe("O card passa a mostrar “Enviar proposta” · Amanhã 10:00.");
    // A data sai no relógio da loja, com fuso: é o que a rota exige.
    expect(estado.corpo.proximo_passo_vence_em).toBe(instanteNoFusoDaLoja(AMANHA, "10:00"));
    expect(estado.corpo.proximo_passo_vence_em).toBe("2026-10-04T13:00:00.000Z");
  });

  it("o botão habilita exatamente quando `decidirInteracao` aceita: tela e rota não discordam", () => {
    const casos: FormDoRegistro[] = [
      form({}),
      form({ texto: "só o texto" }),
      form({ tipo: "ligacao", resultado: "atendeu" }),
      form({ tipo: "ligacao", resultado: "caixa_postal", passo: "Ligar de novo", dia: AMANHA, hora: "09:00" }),
      form({ texto: "ok", passo: "Fechar pedido", dia: AMANHA, hora: "10:00" }),
      form({ texto: "ok", passo: "Fechar pedido", dia: "2026-02-31", hora: "10:00" }),
      form({ tipo: "visita", texto: "Veio e fez test drive", passo: "Enviar proposta", dia: AMANHA, hora: "25:00" }),
      form({ texto: "Feito: Ligar. ", passoConcluido: CARIMBO_DO_PASSO }),
      form({ texto: "Feito: Ligar. ", passoConcluido: CARIMBO_DO_PASSO, passo: "Enviar proposta", dia: AMANHA, hora: "10:00" }),
      form({ texto: "Feito: Ligar. ", passoConcluido: CARIMBO_DO_PASSO, passo: "Enviar proposta" }),
      form({ texto: "Feito: Ligar. ", passoConcluido: "ontem" }),
    ];
    for (const caso of casos) {
      const estado = estadoDoRegistro(caso, AGORA);
      expect(estado.pode, JSON.stringify(caso)).toBe(decidirInteracao(estado.corpo).ok);
    }
  });

  it("meio passo continua recusado, com a dica de cada metade", () => {
    expect(estadoDoRegistro(form({ texto: "x", passo: "Ligar" }), AGORA)).toMatchObject({
      pode: false,
      dica: "Falta o dia e a hora do próximo passo, ou apague o passo.",
    });
    expect(estadoDoRegistro(form({ texto: "x", dia: AMANHA, hora: "10:00" }), AGORA)).toMatchObject({
      pode: false,
      dica: "Falta escrever o próximo passo, ou tire a data.",
    });
  });

  it("o resultado só viaja em ligação", () => {
    expect(corpoDoRegistro(form({ tipo: "ligacao", resultado: "atendeu" })).resultado).toBe("atendeu");
    // Trocar o tipo limpa o resultado: mandá-lo numa anotação seria recusado.
    const trocado = comTipo(form({ tipo: "ligacao", resultado: "atendeu" }), "nota");
    expect(trocado.resultado).toBeNull();
    expect(corpoDoRegistro(trocado)).not.toHaveProperty("resultado");
    expect(comTipo(form({ tipo: "ligacao", resultado: "atendeu" }), "ligacao").resultado).toBe("atendeu");
  });

  it("a sugestão preenche o passo, o dia e a hora no relógio da loja", () => {
    // "amanhã 10:00" em São Paulo é 13:00 UTC.
    const preenchido = comSugestao(form({ texto: "x" }), { texto: "Enviar proposta", vence_em: "2026-10-04T13:00:00.000Z" });
    expect(preenchido).toMatchObject({ passo: "Enviar proposta", dia: "2026-10-04", hora: "10:00", texto: "x" });
    // "hoje +15 min" às 23:50 de São Paulo cai no dia seguinte da loja, e não no do UTC.
    expect(diaEHoraNaLoja("2026-10-04T03:05:00.000Z")).toEqual({ dia: "2026-10-04", hora: "00:05" });
    expect(diaEHoraNaLoja("2026-10-04T02:55:00.000Z")).toEqual({ dia: "2026-10-03", hora: "23:55" });
    expect(diaEHoraNaLoja("nada")).toBeNull();
  });

  it("escolher o dia antes da hora assume a hora padrão, e não troca a já escolhida", () => {
    expect(comDia(form({}), AMANHA)).toMatchObject({ dia: AMANHA, hora: HORA_PADRAO_DO_PASSO });
    expect(comDia(form({ hora: "16:30" }), AMANHA)).toMatchObject({ dia: AMANHA, hora: "16:30" });
  });

  it("CONCLUIR abre com 'Feito: ...' e o passo vazio; Remarcar, com o mesmo passo e sem data", () => {
    expect(formAoConcluir("Cobrar retorno da proposta", CARIMBO_DO_PASSO)).toEqual({
      ...FORM_DO_REGISTRO_VAZIO,
      texto: "Feito: Cobrar retorno da proposta. ",
      passoConcluido: CARIMBO_DO_PASSO,
    });
    // Passo sem carimbo (nenhum em produção em 09/10): conclui como nota comum.
    expect(formAoConcluir("Ligar", null).passoConcluido).toBeNull();
    expect(formAoRemarcar("Cobrar retorno da proposta")).toEqual({
      ...FORM_DO_REGISTRO_VAZIO,
      texto: "Remarcado: ",
      passo: "Cobrar retorno da proposta",
    });
    // Remarcar não habilita sozinho: falta a data nova.
    expect(estadoDoRegistro(formAoRemarcar("Ligar"), AGORA).pode).toBe(false);
  });

  /**
   * O CONCLUIR com o passo opcional (2026-10-09). Sem passo novo, o registro
   * tem de TIRAR o passo feito do lead; a nota comum sem passo, não. Sem esta
   * distinção, o card seguiria mostrando — e a Lista do dia cobrando como
   * atrasado — um passo que acabou de ser feito.
   */
  it("CONCLUIR sem passo novo habilita e manda o carimbo do passo feito; com passo novo, o novo basta", () => {
    const concluido = estadoDoRegistro(formAoConcluir("Ligar", CARIMBO_DO_PASSO), AGORA);
    expect(concluido).toMatchObject({ pode: true, dica: "Pronto para registrar. O passo concluído sai do card." });
    expect(concluido.corpo.passo_concluido).toBe(CARIMBO_DO_PASSO);
    const sem = decidirInteracao(concluido.corpo);
    // Os microssegundos chegam inteiros: o banco compara o carimbo exato.
    expect(sem.ok && sem.args.p_passo_concluido).toBe(CARIMBO_DO_PASSO);

    const comNovo = estadoDoRegistro(
      { ...formAoConcluir("Ligar", CARIMBO_DO_PASSO), passo: "Enviar proposta", dia: AMANHA, hora: "10:00" },
      AGORA,
    );
    expect(comNovo.pode).toBe(true);
    const com = decidirInteracao(comNovo.corpo);
    expect(com.ok && com.args).not.toHaveProperty("p_passo_concluido");

    // A nota comum sem passo não manda limpar nada: o lead mantém o passo.
    const nota = decidirInteracao(estadoDoRegistro(form({ texto: "Mandei as fotos." }), AGORA).corpo);
    expect(nota.ok && nota.args).not.toHaveProperty("p_passo_concluido");
  });

  it("os placeholders são os do desenho, sem travessão", () => {
    expect(PLACEHOLDER_DO_REGISTRO).toEqual({
      nota: "O que foi combinado…",
      ligacao: "Opcional: o que ficou combinado?",
      whatsapp: "Resumo da conversa no WhatsApp…",
      visita: "Veio à loja? Viu qual carro? Fez test drive?",
    });
  });
});

describe("'Chegou na loja' não promete o aviso que ainda não existe", () => {
  it("diz o que foi gravado, e não que alguém foi avisado", () => {
    const moveu = mensagemDeQuemChegou({ movido: true }, "Visita agendada");
    const ficou = mensagemDeQuemChegou({ movido: false }, "Visita agendada");
    expect(moveu).toContain("O lead foi para Visita agendada");
    expect(ficou).toContain("continua onde está");
    for (const frase of [moveu, ficou, AVISO_DE_LEAD_FECHADO]) {
      expect(frase).not.toMatch(/avis(ad|ou|amos)|notific|WhatsApp/i);
    }
  });

  it("lead fechado: a frase diz o que fazer", () => {
    expect(AVISO_DE_LEAD_FECHADO).toContain("já foi fechado");
    expect(AVISO_DE_LEAD_FECHADO).toContain("reabra");
  });
});
