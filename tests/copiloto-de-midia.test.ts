import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CORRESPONDENCIAS,
  GRAVIDADES,
  GRUPOS_DE_TERMO,
  MAX_PROPOSTAS,
  MIGRACAO_DO_PEDIDO_DE_VERBA,
  PAPEIS_DO_COPILOTO,
  PLATAFORMAS_DO_COPILOTO,
  QUEM_PEDIU_SEM_NOME,
  REGRAS,
  SITUACOES_DA_ACAO,
  TETO_DO_PEDIDO_DE_VERBA,
  TIPOS_DA_PLATAFORMA,
  TIPOS_DE_ACAO,
  acharNoTermo,
  classificarTermo,
  descreverAcao,
  diagnosticar,
  diagnosticoDevido,
  diagnosticoParaBanco,
  normalizarLista,
  validarDecisao,
  validarDiagnostico,
  validarPedidoDeVerba,
  validarRegras,
  validarResultados,
  type DiagnosticoDaConta,
  type LeadsDaJanela,
  type ParametrosDoCopiloto,
} from "../src/lib/copilotoDeMidia";
import { ACAO_COPILOTO_DE_MIDIA, PERFIS, podeFazer } from "../src/lib/permissoes";

/**
 * O Copiloto de Mídia, parte pura: o contrato do retrato que o script manda,
 * as regras que viram achado e proposta, e o vaivém com o script e o painel.
 *
 * O cenário-base é a semana que motivou o pedido (6 a 12/10/2026): gasto sem
 * conversão, termos de concorrente, de outra cidade e de quem só pesquisa.
 */

const MIGRACAO = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261014150000_copiloto_de_midia.sql"), "utf8");
/** A do Meta reescreve o tipo, a regra e `midia_copiloto_descrever`: a forma de hoje é a dela. */
const MIGRACAO_META = readFileSync(join(__dirname, "..", "supabase", "migrations", "20261017150000_copiloto_meta.sql"), "utf8");

const P: ParametrosDoCopiloto = {
  gastoMinimoTermo: 10,
  gastoMinimoGrupo: 50,
  gastoMinimoCampanha: 100,
  ritmoAltoPct: 90,
  ritmoBaixoPct: 50,
  reducaoVerbaPct: 30,
  iqBaixo: 3,
  leadsGclidMinimos: 2,
  cliquesMinimosGclid: 30,
  perdaPorVerbaPct: 10,
  perdaPorRankingPct: 30,
  concorrentes: ["loja rival"],
  cidadesFora: ["são tomé"],
  palavrasInformativas: ["como", "emprego", "ficha técnica"],
  horaDoDiagnostico: 7,
};

const LEADS: LeadsDaJanela = { total: 20, doSite: 14, comGclid: 0, comUtmGoogle: 0 };

const termo = (t: string, custo: number, extra: Partial<DiagnosticoDaConta["termos"][number]> = {}) => ({
  termo: t,
  status: "NONE",
  campanhaId: "111",
  campanha: "Pesquisa",
  grupoId: "222",
  grupo: "Seminovos",
  custo,
  cliques: Math.max(1, Math.round(custo / 3)),
  impressoes: 50,
  conversoes: 0,
  ...extra,
});

function retrato(mudar: (d: DiagnosticoDaConta) => void = () => {}): DiagnosticoDaConta {
  const d: DiagnosticoDaConta = {
    conta: { id: "123-456-7890", moeda: "BRL", fuso: "America/Sao_Paulo", autoTagging: true },
    janela: { de: "2026-10-06", ate: "2026-10-12" },
    previa: false,
    termos: [
      termo("loja rival seminovos", 40),
      termo("Loja Rival carros usados", 25),
      termo("carros usados são tomé das letras", 30),
      termo("carros usados sao tome", 12),
      termo("como financiar carro usado", 8),
      termo("emprego vendedor de carros", 5),
      termo("comprar suv usado", 60),
      termo("carro barato", 4),
      termo("ja negativado", 20, { status: "EXCLUDED" }),
      termo("seminovos", 35, { status: "ADDED" }),
      termo("carro que converteu", 50, { conversoes: 1 }),
    ],
    palavras: [
      {
        id: "9001",
        texto: "carros usados",
        correspondencia: "BROAD",
        campanhaId: "111",
        campanha: "Pesquisa",
        grupoId: "222",
        grupo: "Seminovos",
        iq: 2,
        iqAnuncio: "BELOW_AVERAGE",
        iqPagina: "AVERAGE",
        iqCtr: "BELOW_AVERAGE",
        custo: 120,
        cliques: 40,
        conversoes: 0,
      },
    ],
    anuncios: [
      { id: "1", campanhaId: "111", campanha: "Pesquisa", grupoId: "222", grupo: "Seminovos", aprovacao: "APPROVED", revisao: "REVIEWED", motivos: [] },
      { id: "2", campanhaId: "111", campanha: "Pesquisa", grupoId: "333", grupo: "SUVs", aprovacao: "DISAPPROVED", revisao: "REVIEWED", motivos: ["DESTINATION_NOT_WORKING"] },
    ],
    recursos: [],
    conversoes: [
      { id: "77", nome: "Lead do site", situacao: "ENABLED", tipo: "WEBPAGE", categoria: "SUBMIT_LEAD_FORM", primaria: true, ultimos7: 0, ultimos30: 2, ultimoDia: "2026-09-30" },
    ],
    campanhas: [
      {
        id: "111",
        nome: "Pesquisa",
        tipo: "SEARCH",
        situacao: "ENABLED",
        verba: 50,
        verbaCompartilhada: false,
        motivos: [],
        custo7: 340,
        cliques7: 110,
        impressoes7: 2000,
        conversoes7: 0,
        custoMes: 600,
        perdaPorVerba: 0.2,
        perdaPorRanking: 0.1,
      },
      {
        id: "444",
        nome: "Parada",
        tipo: "SEARCH",
        situacao: "ENABLED",
        verba: 20,
        verbaCompartilhada: false,
        motivos: ["HAS_ADS_DISAPPROVED"],
        custo7: 0,
        cliques7: 0,
        impressoes7: 0,
        conversoes7: 0,
        custoMes: 0,
        perdaPorVerba: null,
        perdaPorRanking: null,
      },
    ],
    grupos: [
      { id: "222", nome: "Seminovos", campanhaId: "111", campanha: "Pesquisa", custo7: 280, cliques7: 90, conversoes7: 0 },
      { id: "333", nome: "SUVs", campanhaId: "111", campanha: "Pesquisa", custo7: 60, cliques7: 20, conversoes7: 0 },
      { id: "555", nome: "Sem anúncio", campanhaId: "111", campanha: "Pesquisa", custo7: 0, cliques7: 0, conversoes7: 0 },
    ],
    erros: {},
  };
  mudar(d);
  return d;
}

/** O retrato em JSON, como o script manda. */
const comoOScriptManda = (d: DiagnosticoDaConta) => ({
  conta: d.conta,
  de: d.janela.de,
  ate: d.janela.ate,
  previa: d.previa,
  termos: d.termos,
  palavras: d.palavras,
  anuncios: d.anuncios,
  recursos: d.recursos,
  conversoes: d.conversoes,
  campanhas: d.campanhas,
  grupos: d.grupos,
  erros: d.erros,
});

describe("validarDiagnostico", () => {
  it("aceita o retrato do script e devolve o mesmo retrato", () => {
    const r = validarDiagnostico(comoOScriptManda(retrato()));
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
    if (r.ok) expect(r.valor).toEqual(retrato());
  });

  it("recusa o retrato inteiro por um defeito de forma", () => {
    const torto = comoOScriptManda(retrato());
    (torto.termos[3] as { campanhaId: string }).campanhaId = "abc";
    const r = validarDiagnostico(torto);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/termos\[3\]\.campanhaId/);
    expect(validarDiagnostico({ ...comoOScriptManda(retrato()), de: "2026-10-12", ate: "2026-10-06" }).ok).toBe(false);
    expect(validarDiagnostico({ ...comoOScriptManda(retrato()), conta: { id: "x" } }).ok).toBe(false);
  });

  it("guarda a seção que o Google não deixou ler, e fuso inválido vira nulo", () => {
    const r = validarDiagnostico({ ...comoOScriptManda(retrato()), termos: [], erros: { termos: "campo inválido", outra: "ignorada" }, conta: { id: "1", fuso: "Lua/Base" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.erros).toEqual({ termos: "campo inválido" });
      expect(r.valor.conta.fuso).toBeNull();
    }
  });

  it("recusa índice de qualidade e parcela de impressão fora da escala", () => {
    const iq = comoOScriptManda(retrato());
    iq.palavras[0].iq = 11;
    expect(validarDiagnostico(iq).ok).toBe(false);
    const perda = comoOScriptManda(retrato());
    perda.campanhas[0].perdaPorVerba = 20;
    expect(validarDiagnostico(perda).ok).toBe(false);
  });
});

describe("classificar termo", () => {
  it("acha a expressão como palavra inteira, ignorando acento, na grafia do termo", () => {
    expect(acharNoTermo("carros usados são tomé das letras", "sao tome")).toBe("são tomé");
    expect(acharNoTermo("carros usados sao tome", "são tomé")).toBe("sao tome");
    expect(acharNoTermo("comoda usada", "como")).toBeNull();
    expect(acharNoTermo("Loja-Rival, seminovos!", "loja rival")).toBe("loja rival");
  });

  it("concorrente vence cidade, que vence informativo", () => {
    expect(classificarTermo("como chegar na loja rival em são tomé", P)).toEqual({ grupo: "concorrente", expressao: "loja rival" });
    expect(classificarTermo("emprego em são tomé", P)).toEqual({ grupo: "cidade", expressao: "são tomé" });
    expect(classificarTermo("ficha tecnica civic", P).grupo).toBe("informativo");
    expect(classificarTermo("comprar suv usado", P).grupo).toBe("outros");
  });
});

describe("diagnosticar", () => {
  it("a semana sem conversão: negativa por concorrente e por cidade (frase), por termo no resto (exata)", () => {
    const r = diagnosticar(retrato(), LEADS, P);
    const negativas = r.propostas.filter((p) => p.tipo === "negativar").map((p) => `${p.correspondencia}:${p.texto}`);
    expect(negativas).toContain("frase:loja rival");
    expect(negativas).toContain("frase:são tomé");
    expect(negativas).toContain("frase:sao tome");
    expect(negativas).toContain("exata:comprar suv usado");
    // Informativo vira proposta mesmo abaixo do mínimo: intenção errada não depende do valor.
    expect(negativas).toContain("exata:emprego vendedor de carros");
    expect(negativas).toContain("exata:como financiar carro usado");
    // "outros" abaixo do mínimo fica só no achado.
    expect(negativas).not.toContain("exata:carro barato");
    // Já negativado, palavra-chave e termo que converteu nunca viram negativa.
    expect(negativas.join("|")).not.toMatch(/ja negativado|seminovos|converteu/);
    // A negativa do concorrente cobre os dois termos dele.
    const rival = r.propostas.find((p) => p.texto === "loja rival")!;
    expect(rival.economia7d).toBe(65);
    expect(rival.chave).toBe("negativar:111:frase:loja rival");
  });

  it("palavra-chave que gasta sem converter é achado, nunca negativa", () => {
    const r = diagnosticar(retrato(), LEADS, P);
    expect(r.achados.some((a) => a.titulo.includes("palavra-chave gastou"))).toBe(true);
  });

  it("com a medição confiável, propõe cortar a verba e pausar os grupos que gastaram sem converter", () => {
    const r = diagnosticar(retrato(), LEADS, P);
    expect(r.resumo.medicaoConfiavel).toBe(true);
    const verba = r.propostas.find((p) => p.tipo === "mudar_verba")!;
    expect(verba).toMatchObject({ campanhaId: "111", verbaAtual: 50, verbaNova: 35, chave: "verba:111" });
    const pausas = r.propostas.filter((p) => p.tipo === "pausar_grupo").map((p) => p.grupoId).sort();
    expect(pausas).toEqual(["222", "333"]);
    // Os dois grupos da campanha propostos: o motivo avisa que aprovar tudo desliga a campanha.
    expect(r.propostas.find((p) => p.grupoId === "222")!.motivo).toMatch(/desliga a campanha/);
  });

  it("verba compartilhada não vira proposta: o achado manda mudar pelo Google Ads", () => {
    const r = diagnosticar(retrato((d) => (d.campanhas[0].verbaCompartilhada = true)), LEADS, P);
    expect(r.propostas.some((p) => p.tipo === "mudar_verba")).toBe(false);
    expect(r.achados.some((a) => a.detalhe.includes("compartilhada"))).toBe(true);
  });

  it("marcação automática desligada: medição com problema, e nada de pausa nem corte", () => {
    const r = diagnosticar(retrato((d) => (d.conta.autoTagging = false)), LEADS, P);
    expect(r.resumo.medicaoConfiavel).toBe(false);
    expect(r.achados[0]).toMatchObject({ regra: "medicao", gravidade: "alta" });
    expect(r.propostas.some((p) => p.tipo === "mudar_verba" || p.tipo === "pausar_grupo")).toBe(false);
    // As negativas de intenção errada continuam.
    expect(r.propostas.some((p) => p.texto === "loja rival")).toBe(true);
  });

  it("conversões ilegíveis contam como medição com problema, nunca como 'sem problema'", () => {
    const r = diagnosticar(retrato((d) => ((d.conversoes = []), (d.erros.conversoes = "PERMISSION_DENIED"))), LEADS, P);
    expect(r.resumo.medicaoConfiavel).toBe(false);
    expect(r.resumo.secoesComErro).toEqual(["conversoes"]);
  });

  it("dois leads com gclid e zero conversão no Google é medição quebrada; um só não prova nada", () => {
    const dois = diagnosticar(retrato(), { ...LEADS, comGclid: 2 }, P);
    expect(dois.resumo.medicaoConfiavel).toBe(false);
    expect(dois.achados.some((a) => a.regra === "medicao" && a.titulo.includes("nenhuma conversão no Google"))).toBe(true);
    const um = diagnosticar(retrato(), { ...LEADS, comGclid: 1 }, P);
    expect(um.resumo.medicaoConfiavel).toBe(true);
    expect(um.achados.find((a) => a.titulo.includes("Mais leads com gclid"))?.gravidade).toBe("baixa");
  });

  it("cruzamento cliques × leads: sem gclid com 110 cliques, e utm sem identificador nenhum (nem o gbraid do iPhone)", () => {
    const sem = diagnosticar(retrato(), LEADS, P).achados.find((a) => a.regra === "cliques_e_leads")!;
    expect(sem.titulo).toBe("110 cliques → 0 leads com gclid");
    expect(sem.gravidade).toBe("media");
    const perdido = diagnosticar(retrato(), { ...LEADS, comUtmGoogle: 3 }, P).achados.find((a) => a.regra === "cliques_e_leads")!;
    expect(perdido.detalhe).toMatch(/gbraid/);
  });

  it("os limiares da medição e da impressão perdida vêm das regras da loja, não do código", () => {
    const exigente = { ...P, leadsGclidMinimos: 3, cliquesMinimosGclid: 200 };
    expect(diagnosticar(retrato(), { ...LEADS, comGclid: 2 }, exigente).resumo.medicaoConfiavel).toBe(true);
    expect(diagnosticar(retrato(), LEADS, exigente).achados.find((a) => a.regra === "cliques_e_leads")?.gravidade).toBe("baixa");

    const convertendo = retrato((d) => (d.campanhas[0].conversoes7 = 3));
    const limitada = (perdaPorVerbaPct: number) =>
      diagnosticar(convertendo, LEADS, { ...P, perdaPorVerbaPct }).achados.some((a) => a.titulo.includes("limitada pela verba"));
    expect(limitada(20)).toBe(true); // perdeu 20%
    expect(limitada(25)).toBe(false);

    const sobrando = retrato((d) => ((d.campanhas[0].custo7 = 50), (d.campanhas[0].perdaPorRanking = 0.4)));
    const culpaORanking = (perdaPorRankingPct: number) =>
      diagnosticar(sobrando, LEADS, { ...P, perdaPorRankingPct }).achados.find((a) => a.titulo.includes("da verba"))!.detalhe.includes("classificação");
    expect(culpaORanking(30)).toBe(true);
    expect(culpaORanking(50)).toBe(false);
  });

  it("anúncios parados: campanha ativa sem impressão, grupo só com reprovado e grupo sem anúncio", () => {
    const r = diagnosticar(retrato(), LEADS, P);
    const parados = r.achados.filter((a) => a.regra === "anuncios_parados");
    expect(parados.find((a) => a.titulo.includes("sem impressão"))?.gravidade).toBe("alta");
    const grupos = parados.find((a) => a.titulo.includes("sem anúncio rodando"))!;
    expect(grupos.titulo).toMatch(/^2 grupos/);
    expect(JSON.stringify(grupos.evidencias)).toMatch(/DESTINATION_NOT_WORKING/);
  });

  it("índice de qualidade baixo com gasto é achado", () => {
    const r = diagnosticar(retrato(), LEADS, P);
    expect(r.achados.find((a) => a.regra === "qualidade")?.titulo).toMatch(/1 palavra-chave com índice de qualidade até 3/);
  });

  it("os achados saem por gravidade e toda proposta aponta para o achado da regra dela", () => {
    const r = diagnosticar(retrato(), LEADS, P);
    const ordem = { alta: 0, media: 1, baixa: 2 } as const;
    for (let i = 1; i < r.achados.length; i++) {
      expect(ordem[r.achados[i - 1].gravidade]).toBeLessThanOrEqual(ordem[r.achados[i].gravidade]);
    }
    for (const p of r.propostas) {
      const a = r.achados[p.achado];
      expect(a, p.chave).toBeDefined();
      expect(p.tipo === "negativar" ? a.regra === "termos_sem_conversao" : a.regra === "ritmo_de_verba", p.chave).toBe(true);
    }
    expect(new Set(r.propostas.map((p) => p.chave)).size).toBe(r.propostas.length);
    expect(r.resumo.achados.alta + r.resumo.achados.media + r.resumo.achados.baixa).toBe(r.achados.length);
  });

  it("o teto de propostas fica com as de maior economia", () => {
    const muitos = retrato((d) => {
      d.termos = Array.from({ length: MAX_PROPOSTAS + 20 }, (_, i) => termo(`termo numero ${i}`, 11 + i));
    });
    const r = diagnosticar(muitos, LEADS, P);
    const negativas = r.propostas.filter((p) => p.tipo === "negativar");
    expect(r.propostas.length).toBe(MAX_PROPOSTAS);
    expect(negativas.some((p) => p.texto === "termo numero 0")).toBe(false);
    expect(negativas.some((p) => p.texto === `termo numero ${MAX_PROPOSTAS + 19}`)).toBe(true);
  });

  it("termo que não cabe numa negativa (11 palavras) não vira proposta", () => {
    const r = diagnosticar(retrato((d) => (d.termos = [termo("um dois tres quatro cinco seis sete oito nove dez onze", 90)])), LEADS, P);
    expect(r.propostas.filter((p) => p.tipo === "negativar")).toEqual([]);
  });

  it("vai ao banco em snake_case, com o retrato inteiro", () => {
    const d = retrato();
    const banco = diagnosticoParaBanco(d, diagnosticar(d, LEADS, P));
    expect(banco).toMatchObject({ conta: "123-456-7890", de: "2026-10-06", ate: "2026-10-12", previa: false });
    expect(banco.dados).toBe(d);
    expect(Object.keys(banco.propostas[0]).sort()).toEqual(
      [
        "achado", "campanha_id_externo", "campanha_nome", "chave", "correspondencia", "economia_7d", "evidencias",
        "grupo_id_externo", "grupo_nome", "motivo", "texto", "tipo", "verba_atual", "verba_nova",
      ].sort(),
    );
  });
});

describe("diagnosticoDevido", () => {
  const fuso = "America/Sao_Paulo";
  // 14/10/2026 às 9h em São Paulo = 12h UTC.
  const nove = new Date("2026-10-14T12:00:00Z");

  it("antes da hora marcada, não", () => {
    expect(diagnosticoDevido(null, new Date("2026-10-14T09:00:00Z"), fuso, 7)).toBe(false);
  });
  it("depois da hora, sem diagnóstico hoje, sim; com o de hoje, não", () => {
    expect(diagnosticoDevido(null, nove, fuso, 7)).toBe(true);
    expect(diagnosticoDevido("2026-10-13T23:00:00Z", nove, fuso, 7)).toBe(true); // 20h de ontem no fuso
    expect(diagnosticoDevido("2026-10-14T10:30:00Z", nove, fuso, 7)).toBe(false); // 7h30 de hoje
  });
  it("o dia é o do fuso da conta, não o do servidor", () => {
    // 02h UTC de 14/10 ainda é 13/10 em São Paulo.
    expect(diagnosticoDevido("2026-10-14T02:00:00Z", nove, fuso, 7)).toBe(true);
  });
});

describe("o vaivém com o script e o painel", () => {
  const id = "0c7f3b8e-1d2a-4f5b-9c6d-7e8f9a0b1c2d";

  it("resultado: aceita os três desfechos e exige motivo na falha", () => {
    expect(validarResultados({ resultados: [{ id, situacao: "aplicada", lido: { negativa: true } }] }).ok).toBe(true);
    expect(validarResultados({ resultados: [{ id, situacao: "falhou", lido: {} }] }).ok).toBe(false);
    expect(validarResultados({ resultados: [{ id, situacao: "aprovada", lido: {} }] }).ok).toBe(false);
    expect(validarResultados({ resultados: [{ id: "1", situacao: "aplicada" }] }).ok).toBe(false);
  });

  it("decisão: aprovar ou recusar, de 1 a 200 uuids, sem repetir", () => {
    const r = validarDecisao({ ids: [id, id], decisao: "aprovar" });
    expect(r.ok && r.valor.ids).toEqual([id]);
    expect(validarDecisao({ ids: [], decisao: "aprovar" }).ok).toBe(false);
    expect(validarDecisao({ ids: [id], decisao: "aplicar" }).ok).toBe(false);
  });

  it("regras: listas normalizadas e os mesmos limites do banco", () => {
    expect(normalizarLista(" Loja Rival \nloja rival, Outra ;")).toEqual(["loja rival", "outra"]);
    const base = { ...P, concorrentes: "Loja Rival", cidadesFora: [], palavrasInformativas: ["Como"] };
    const ok = validarRegras(base);
    expect(ok.ok && ok.valor.concorrentes).toEqual(["loja rival"]);
    expect(validarRegras({ ...base, ritmoBaixoPct: 95 }).ok).toBe(false);
    expect(validarRegras({ ...base, reducaoVerbaPct: 95 }).ok).toBe(false);
    expect(validarRegras({ ...base, horaDoDiagnostico: 24 }).ok).toBe(false);
    expect(validarRegras({ ...base, concorrentes: ["x"] }).ok).toBe(false);
  });

  it("a frase da tela é a da trilha no banco (`midia_copiloto_descrever`)", () => {
    expect(descreverAcao({ tipo: "negativar", campanhaNome: "Pesquisa", texto: "loja rival", correspondencia: "frase" })).toBe(
      'Negativar "loja rival" na campanha Pesquisa',
    );
    expect(descreverAcao({ tipo: "remover_negativa", campanhaNome: "Pesquisa", texto: "x", correspondencia: "exata" })).toBe(
      "Remover a negativa [x] da campanha Pesquisa",
    );
    expect(descreverAcao({ tipo: "pausar_grupo", campanhaNome: "Pesquisa", grupoNome: "SUVs" })).toBe("Pausar o grupo SUVs (Pesquisa)");
    expect(MIGRACAO).toContain("format('Negativar %s na campanha %s'");
    expect(MIGRACAO).toContain("format('Remover a negativa %s da campanha %s'");
    expect(MIGRACAO).toContain("format('Pausar o grupo %s (%s)'");
    expect(MIGRACAO).toContain("format('Reativar o grupo %s (%s)'");
    expect(MIGRACAO).toContain("format('Verba de %s: R$ %s → R$ %s por dia'");
  });

  it("as frases do Meta são as da trilha no banco, e a função reescrita guarda as do Google", () => {
    const base = { campanhaNome: "01 Leads", grupoNome: "Broad", anuncioNome: "Carrossel SUV" };
    expect(descreverAcao({ ...base, tipo: "pausar_conjunto" })).toBe("Pausar o conjunto Broad (01 Leads)");
    expect(descreverAcao({ ...base, tipo: "reativar_conjunto" })).toBe("Reativar o conjunto Broad (01 Leads)");
    expect(descreverAcao({ ...base, tipo: "pausar_anuncio" })).toBe("Pausar o anúncio Carrossel SUV (Broad · 01 Leads)");
    expect(descreverAcao({ ...base, tipo: "reativar_anuncio" })).toBe("Reativar o anúncio Carrossel SUV (Broad · 01 Leads)");
    expect(MIGRACAO_META).toContain("format('Pausar o conjunto %s (%s)', a.grupo_nome, a.campanha_nome)");
    expect(MIGRACAO_META).toContain("format('Reativar o conjunto %s (%s)', a.grupo_nome, a.campanha_nome)");
    expect(MIGRACAO_META).toContain("format('Pausar o anúncio %s (%s · %s)', a.anuncio_nome, a.grupo_nome, a.campanha_nome)");
    expect(MIGRACAO_META).toContain("format('Reativar o anúncio %s (%s · %s)', a.anuncio_nome, a.grupo_nome, a.campanha_nome)");
    for (const frase of [
      "format('Negativar %s na campanha %s'",
      "format('Remover a negativa %s da campanha %s'",
      "format('Pausar o grupo %s (%s)'",
      "format('Reativar o grupo %s (%s)'",
      "format('Verba de %s: R$ %s → R$ %s por dia'",
    ]) {
      expect(MIGRACAO_META, frase).toContain(frase);
    }
  });
});

describe("as listas fechadas do banco são as do código", () => {
  /** Os valores entre aspas de um CHECK nomeado da migração (a última que o define). */
  function valoresDoCheck(nome: string, migracao = MIGRACAO): string[] {
    const i = migracao.indexOf(`add constraint ${nome}`);
    expect(i, nome).toBeGreaterThan(0);
    const corpo = migracao.slice(i, migracao.indexOf("),\n", i) + 1);
    return [...corpo.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }

  it("tipo, situação, regra, grupo e gravidade", () => {
    // Tipo e regra: os da migração do Meta, que os trocou.
    expect(valoresDoCheck("midia_copiloto_acoes_tipo_valido", MIGRACAO_META)).toEqual([...TIPOS_DE_ACAO]);
    expect(valoresDoCheck("midia_copiloto_acoes_situacao_valida")).toEqual([...SITUACOES_DA_ACAO]);
    expect(valoresDoCheck("midia_copiloto_achados_regra_valida", MIGRACAO_META)).toEqual([...REGRAS]);
    expect(valoresDoCheck("midia_copiloto_achados_grupo_valido")).toEqual([...GRUPOS_DE_TERMO]);
    expect(valoresDoCheck("midia_copiloto_achados_gravidade_valida")).toEqual([...GRAVIDADES]);
    expect(MIGRACAO).toContain(`correspondencia in (${CORRESPONDENCIAS.map((c) => `'${c}'`).join(", ")})`);
  });

  it("plataforma, e os verbos de cada uma (o banco escreve pela exclusão)", () => {
    const lista = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");
    expect(valoresDoCheck("midia_copiloto_acoes_plataforma_valida", MIGRACAO_META)).toEqual([...PLATAFORMAS_DO_COPILOTO]);
    expect(MIGRACAO_META).toContain(
      `add constraint midia_copiloto_diagnosticos_plataforma_valida check (\n    plataforma in (${lista(PLATAFORMAS_DO_COPILOTO)}));`,
    );
    // O que uma plataforma NÃO faz é o que só a outra faz.
    const so = (p: "google" | "meta", outra: "google" | "meta") => TIPOS_DA_PLATAFORMA[outra].filter((t) => !TIPOS_DA_PLATAFORMA[p].includes(t));
    expect(MIGRACAO_META).toContain(`when 'google' then tipo not in (${lista(so("google", "meta"))})`);
    expect(MIGRACAO_META).toContain(`when 'meta'   then tipo not in (${lista(so("meta", "google"))})`);
    expect(new Set([...TIPOS_DA_PLATAFORMA.google, ...TIPOS_DA_PLATAFORMA.meta])).toEqual(new Set(TIPOS_DE_ACAO));
  });

  it("quem aprova: a matriz, a RLS e as funções dizem os mesmos papéis", () => {
    const fazem = PERFIS.filter((p) => podeFazer(p, ACAO_COPILOTO_DE_MIDIA) === "faz");
    expect([...fazem].sort()).toEqual([...PAPEIS_DO_COPILOTO].sort());
    const policies = MIGRACAO.match(/create policy midia_copiloto_\w+_leitura[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(4);
    for (const p of policies) {
      for (const papel of PAPEIS_DO_COPILOTO) expect(p).toContain(`tem_papel(auth.uid(), '${papel}')`);
    }
    // As três portas do painel conferem o papel de novo.
    expect(MIGRACAO.match(/public\.tem_papel\(v_quem, 'admin'\) or public\.tem_papel\(v_quem, 'marketing'\)/g)).toHaveLength(3);
  });

  it("a única exclusão que o banco deixa nascer é o desfazer de uma negativa", () => {
    expect(MIGRACAO).toMatch(/diagnostico_id is not null and tipo not in \('remover_negativa', 'reativar_grupo'\)/);
  });

  it("verba vinda do diagnóstico só diminui", () => {
    expect(MIGRACAO).toMatch(/midia_copiloto_acoes_proposta_so_corta check \(\s*desfaz_acao_id is not null or verba_nova is null or verba_nova < verba_atual\)/);
  });

  it("os números das regras são colunas da tabela de parâmetros, uma por limiar do código", () => {
    for (const coluna of [
      "gasto_minimo_termo", "gasto_minimo_grupo", "gasto_minimo_campanha", "ritmo_alto_pct", "ritmo_baixo_pct",
      "reducao_verba_pct", "iq_baixo", "leads_gclid_minimos", "cliques_minimos_gclid", "perda_por_verba_pct",
      "perda_por_ranking_pct", "hora_do_diagnostico",
    ]) {
      expect(MIGRACAO, coluna).toMatch(new RegExp(`\\n  ${coluna}\\s+(numeric|smallint|integer)`));
    }
    expect(Object.keys(P)).toHaveLength(15);
  });
});

describe("pedido de verba", () => {
  it("só campanha numérica, verba de centavo em centavo até o teto, e motivo aparado", () => {
    expect(validarPedidoDeVerba({ campanhaId: "1234567890", verbaNova: 10, motivo: "  converte  " })).toEqual({
      ok: true,
      valor: { campanhaId: "1234567890", verbaNova: 10, motivo: "converte" },
    });
    expect(validarPedidoDeVerba({ campanhaId: "1", verbaNova: 0.1 + 0.2 })).toMatchObject({ ok: true, valor: { verbaNova: 0.3, motivo: null } });
    for (const ruim of [
      null,
      { campanhaId: 111, verbaNova: 10 },
      { campanhaId: "1e3", verbaNova: 10 },
      { campanhaId: "111", verbaNova: -1 },
      { campanhaId: "111", verbaNova: Number.NaN },
      { campanhaId: "111", verbaNova: 12.345 },
      { campanhaId: "111", verbaNova: 100_000.01 },
      { campanhaId: "111", verbaNova: 10, motivo: 5 },
    ]) {
      expect(validarPedidoDeVerba(ruim).ok, JSON.stringify(ruim)).toBe(false);
    }
  });

  const PEDIDO = readFileSync(join(__dirname, "..", "supabase", "migrations", `${MIGRACAO_DO_PEDIDO_DE_VERBA}.sql`), "utf8");

  it("o teto do pedido é um só: o do código, o do script e o do banco", () => {
    const script = readFileSync(join(__dirname, "..", "scripts", "google-ads-script.js"), "utf8");
    expect(script).toContain(`nova > esperada * ${TETO_DO_PEDIDO_DE_VERBA}`);
    expect(PEDIDO).toMatch(new RegExp(`pedida_por is null or verba_nova <= verba_atual \\* ${TETO_DO_PEDIDO_DE_VERBA}\\)`));
    expect(PEDIDO).toContain(`p_verba_nova > v_atual * ${TETO_DO_PEDIDO_DE_VERBA}`);
  });

  it("o pedido divide a chave de verba com o diagnóstico, e o banco fala a mesma frase de quem pediu sem nome", () => {
    const fonte = readFileSync(join(__dirname, "..", "src", "lib", "copilotoDeMidia.ts"), "utf8");
    expect(fonte).toContain("chave: `verba:${c.id}`");
    expect(PEDIDO).toContain("v_chave := 'verba:' || p_campanha;");
    expect(PEDIDO).toContain(`coalesce(v_nome, '${QUEM_PEDIU_SEM_NOME}')`);
  });

  it("a porta do pedido confere o papel de novo, como as outras do painel", () => {
    expect(PEDIDO).toMatch(/public\.tem_papel\(v_quem, 'admin'\) or public\.tem_papel\(v_quem, 'marketing'\)/);
    expect(PEDIDO).toContain("grant execute on function public.midia_copiloto_pedir_verba(text, numeric, text) to authenticated;");
    expect(PEDIDO).toMatch(/revoke all on function public\.midia_copiloto_pedir_verba\(text, numeric, text\) from public, anon;/);
  });
});

