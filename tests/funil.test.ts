import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { lerCodigo, semComentarios } from "./fonte";
import { MATRIZ_DE_PERMISSOES, podeFazer } from "../src/lib/permissoes";
import { MOTIVO_DA_SUPRESSAO } from "../src/lib/funil";
import {
  ETAPAS_PADRAO,
  TIPOS_DE_DESFECHO,
  agruparPorMotivo,
  ehDescarte,
  ehTipoDeDesfecho,
  ehTipoDeEtapa,
  destinosDoNegocio,
  etapasDoQuadro,
  chaveDaEtapa,
  destinatarioDoAviso,
  emMinutos,
  espera,
  etapasVisiveis,
  formatarPrazo,
  linkDeConversa,
  mensagemDeAlerta,
  mensagemParaCliente,
  minutosParado,
  nivelDeEstagnacao,
  numeroDiscavel,
  ETAPA_DE_ENTRADA,
  ROTULO_DO_DESFECHO,
  decidirDesfecho,
  motivoUtilizavel,
  motivosDepoisDeGravar,
  ordenarEtapas,
  paradoDesde,
  seloDeRodizio,
  separarPrazo,
  taxaDeConversao,
  validarFunil,
  type EtapaDoFunil,
  type LinhaDaFilaDoFunil,
  type MotivoDoFunil,
} from "../src/lib/funil";

/**
 * O funil de vendas — a régua de tempo, o desfecho e o aviso.
 *
 * 2026-08-28, pedido do dono em cinco partes: lead na agenda de pessoas,
 * ganho/perdido com motivo, funil editável, alerta de estagnação no WhatsApp e
 * transferência automática com exceções.
 *
 * O que este arquivo protege são as decisões que, se mudarem sozinhas, mudam
 * o comportamento sem quebrar nada visível:
 *
 *  - o relógio da estagnação (que campo ele lê, e o que o reinicia);
 *  - a exceção nomeada pelo dono (visita e negociação não transferem);
 *  - a validação que impede um funil salvo de virar um funil quebrado;
 *  - a concordância entre a régua do TypeScript e a do Postgres — as duas
 *    calculam a mesma coisa, e se divergirem a tela pinta um card de vermelho
 *    enquanto o motor acha que está tudo bem.
 */

const SQL = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20260828120000_funil_de_vendas.sql"),
  "utf-8",
);

/** O SQL sem comentários — a migração explica o próprio código, e uma
 *  asserção contra o texto cru casaria com a prosa em vez do executável. */
const sqlExecutavel = SQL.split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const AGORA = Date.parse("2026-08-28T15:00:00-03:00");

const etapa = (over: Partial<EtapaDoFunil> = {}): EtapaDoFunil => ({
  chave: "proposta",
  rotulo: "Proposta",
  ordem: 3,
  tipo: "aberta",
  estagnacao_minutos: 2880,
  transferencia_minutos: 7200,
  protegida: false,
  ativa: true,
  ...over,
});

/**
 * Um motivo do funil. `descartado` é o padrão de propósito: é o tipo que
 * este arquivo passou a existir para não deixar ninguém esquecer.
 */
const motivo = (over: Partial<MotivoDoFunil> = {}): MotivoDoFunil => ({
  chave: "spam",
  rotulo: "Spam ou robô",
  tipo: "descartado",
  ordem: 1,
  ativo: true,
  ...over,
});

/** Um motivo ativo de cada tipo — o mínimo para o funil não ter beco. */
const MOTIVOS_DOS_TRES: MotivoDoFunil[] = [
  motivo({ chave: "a_vista", rotulo: "À vista", tipo: "ganho" }),
  motivo({ chave: "preco", rotulo: "Preço", tipo: "perdido" }),
  motivo(),
];

const lead = (horasParado: number, over: Record<string, unknown> = {}) => ({
  id: "1",
  nome: "Ana Souza",
  situacao: "proposta",
  created_at: new Date(AGORA - horasParado * 3600_000).toISOString(),
  ultimo_movimento_em: new Date(AGORA - horasParado * 3600_000).toISOString(),
  ...over,
});

// ---------------------------------------------------------------------------

describe("o relógio da estagnação", () => {
  it("conta do toque mais recente, não da entrada do lead", () => {
    // Um lead que entrou há 30 dias e foi atendido hoje não está parado há 30
    // dias. Contar da entrada encheria a tela de vermelho e ensinaria a
    // equipe a ignorar a cor.
    const l = lead(720, { ultimo_contato_em: new Date(AGORA - 3600_000).toISOString() });
    expect(minutosParado(l, AGORA)).toBe(60);
  });

  it("aguenta lead antigo, de antes de as colunas existirem", () => {
    // Lead gravado antes da migração pode chegar sem `ultimo_movimento_em`
    // numa resposta em cache. Sem a rede de `created_at` daria NaN, e NaN
    // comparado com qualquer prazo é `false` — o card ficaria eternamente
    // verde. Falha muda, do tipo que este projeto persegue.
    const l = { id: "1", nome: "A", situacao: "proposta", created_at: new Date(AGORA - 7200_000).toISOString() };
    expect(minutosParado(l, AGORA)).toBe(120);
    expect(Number.isFinite(paradoDesde(l))).toBe(true);
  });

  it("nunca conta tempo negativo", () => {
    // Relógio do servidor à frente do relógio do navegador é comum. "-3 min
    // parado" na tela é pior que "agora".
    const l = lead(-2);
    expect(minutosParado(l, AGORA)).toBe(0);
  });
});

describe("nivelDeEstagnacao", () => {
  it("avisa ANTES de estourar o prazo", () => {
    // A hora de agir é antes da cobrança. Um sinal que só acende junto com o
    // alerta chega tarde para o que ele deveria evitar.
    expect(nivelDeEstagnacao(lead(1), etapa(), AGORA)).toBe("ok");
    expect(nivelDeEstagnacao(lead(30), etapa(), AGORA)).toBe("atencao");
    expect(nivelDeEstagnacao(lead(48), etapa(), AGORA)).toBe("estagnado");
    expect(nivelDeEstagnacao(lead(121), etapa(), AGORA)).toBe("transferir");
  });

  it("etapa protegida nunca chega em `transferir`", () => {
    // A exceção que o dono nomeou: *"salvo os que já estão em negociação ou
    // com visita agendada"*. A tela não pode prometer uma transferência que o
    // banco não vai fazer.
    expect(nivelDeEstagnacao(lead(500), etapa({ protegida: true }), AGORA)).toBe("estagnado");
  });

  it("negócio encerrado não apodrece", () => {
    // Pintar de vermelho o que já acabou treina a equipe a ignorar cor.
    expect(nivelDeEstagnacao(lead(500, { desfecho: "ganho" }), etapa(), AGORA)).toBe("ok");
    expect(nivelDeEstagnacao(lead(500), etapa({ tipo: "perdido" }), AGORA)).toBe("ok");
  });

  it("etapa sem prazo não cobra ninguém", () => {
    expect(nivelDeEstagnacao(lead(5000), etapa({ estagnacao_minutos: null, transferencia_minutos: null }), AGORA)).toBe("ok");
  });

  it("etapa desconhecida não vira alarme", () => {
    // Lead numa etapa que a tela ainda não carregou (ou que foi apagada num
    // banco de teste): o card aparece calmo em vez de vermelho por engano.
    expect(nivelDeEstagnacao(lead(5000), undefined, AGORA)).toBe("ok");
  });
});

describe("prazos em minutos, escritos em português", () => {
  it("mostra na maior unidade que couber", () => {
    expect(formatarPrazo(15)).toBe("15 min");
    expect(formatarPrazo(90)).toBe("1,5 h");
    expect(formatarPrazo(1440)).toBe("1 dia");
    expect(formatarPrazo(7200)).toBe("5 dias");
    expect(formatarPrazo(null)).toBe("—");
  });

  it("ida e volta do formulário não perde o valor", () => {
    // O banco guarda minutos; o formulário edita valor + unidade. Se a volta
    // não bater, salvar sem tocar em nada mudaria o prazo — o pior tipo de
    // bug de configuração, porque parece que alguém mexeu.
    for (const minutos of [15, 60, 90, 1440, 2880, 7200]) {
      const { valor, unidade } = separarPrazo(minutos);
      expect(emMinutos(valor, unidade)).toBe(minutos);
    }
  });

  it("campo vazio e zero viram `sem prazo`, não zero", () => {
    // Prazo zero cobraria o vendedor no mesmo segundo em que o lead chega.
    expect(emMinutos("", "horas")).toBeNull();
    expect(emMinutos(0, "horas")).toBeNull();
    expect(emMinutos(-3, "dias")).toBeNull();
  });

  it("aceita a vírgula decimal que se digita em português", () => {
    expect(emMinutos("1,5", "horas")).toBe(90);
  });
});

describe("editar o funil sem quebrá-lo", () => {
  it("o rótulo vira chave estável, sem acento nem espaço", () => {
    expect(chaveDaEtapa("Test Drive")).toBe("test_drive");
    expect(chaveDaEtapa("Negociação Avançada")).toBe("negociacao_avancada");
    expect(chaveDaEtapa("  Pós-venda  ")).toBe("pos_venda");
  });

  it("recusa funil sem etapa de ganho ou de perdido", () => {
    // Sem elas o motivo do desfecho deixa de ser coletado — e o relatório
    // seca sem nada dar erro.
    const erros = validarFunil([etapa()], MOTIVOS_DOS_TRES);
    expect(erros.some((e) => e.includes("GANHO"))).toBe(true);
    expect(erros.some((e) => e.includes("PERDIDO"))).toBe(true);
  });

  it("recusa transferir antes de avisar", () => {
    // O lead trocaria de dono antes de o vendedor saber que estava parado.
    const erros = validarFunil([
      ...ETAPAS_PADRAO.filter((e) => e.tipo !== "aberta"),
      etapa({ estagnacao_minutos: 2880, transferencia_minutos: 60 }),
    ], MOTIVOS_DOS_TRES);
    expect(erros.some((e) => e.includes("menor que o de alerta"))).toBe(true);
  });

  it("recusa transferir sem nunca avisar", () => {
    const erros = validarFunil([
      ...ETAPAS_PADRAO.filter((e) => e.tipo !== "aberta"),
      etapa({ estagnacao_minutos: null, transferencia_minutos: 1440 }),
    ], MOTIVOS_DOS_TRES);
    expect(erros.some((e) => e.includes("sem nunca avisar"))).toBe(true);
  });

  it("recusa etapa terminal ativa sem nenhum motivo daquele tipo", () => {
    // O beco sem saída que a revisão de 05/09 encontrou, e que este branch
    // acabou de criar: a caixa de desfecho não fecha sem motivo, então uma
    // etapa terminal ATIVA cujo tipo não tem NENHUM motivo ativo vira um
    // botão que o card entra e não sai. Antes do branch o descarte passava
    // reto (perdendo o motivo); agora ele para, e parar em silêncio é pior.
    //
    // Cobrado aqui, na configuração, porque é o único lugar onde quem pode
    // consertar está presente: o Comercial que encontra o beco no card não
    // tem permissão de abrir Configurar funil (`permissoes.ts`).
    for (const tipo of TIPOS_DE_DESFECHO) {
      const erros = validarFunil(
        ETAPAS_PADRAO,
        MOTIVOS_DOS_TRES.filter((m) => m.tipo !== tipo),
      );
      expect(erros.length, `${tipo} sem motivo passou batido`).toBeGreaterThan(0);
      expect(erros.join(" ")).toContain(
        ETAPAS_PADRAO.find((e) => e.tipo === tipo)!.rotulo,
      );
    }
  });

  it("motivo INATIVO não conta — ele não aparece na caixa", () => {
    // `ModalDeDesfecho` filtra por `m.ativo`, e o GET da rota também. Um
    // motivo desativado é invisível para quem precisa escolher, então contá-lo
    // aqui daria por resolvido um beco que continua de pé.
    const erros = validarFunil(
      ETAPAS_PADRAO,
      MOTIVOS_DOS_TRES.map((m) => (m.tipo === "descartado" ? { ...m, ativo: false } : m)),
    );
    expect(erros.join(" ")).toContain("Não é oportunidade");
  });

  it("etapa terminal INATIVA sem motivo não é problema", () => {
    // Ela não vira botão no card (`destinosDoNegocio` só devolve as ativas),
    // então não há beco. Cobrar aqui obrigaria o dono a manter motivo vivo
    // para um destino que ele desligou de propósito.
    const erros = validarFunil(
      ETAPAS_PADRAO.map((e) => (e.tipo === "descartado" ? { ...e, ativa: false } : e)),
      MOTIVOS_DOS_TRES.filter((m) => m.tipo !== "descartado"),
    );
    expect(erros).toEqual([]);
  });

  it("um PUT que só mexe nas etapas não é acusado de ficar sem motivo", () => {
    // A rota trata `motivos: []` como *não toque nos motivos*: o upsert e a
    // desativação estão os dois atrás de `motivos.length > 0`. Validar contra
    // a lista vazia recusaria, com três erros, um PUT que nunca encostou em
    // motivo nenhum — regressão que a regra acima criaria sozinha.
    //
    // O que a validação precisa ver é o estado DEPOIS de gravar.
    expect(motivosDepoisDeGravar(MOTIVOS_DOS_TRES, [])).toEqual(MOTIVOS_DOS_TRES);
    expect(validarFunil(ETAPAS_PADRAO, motivosDepoisDeGravar(MOTIVOS_DOS_TRES, []))).toEqual([]);
  });

  it("o motivo que sumiu do corpo conta como desativado, que é o que a rota faz", () => {
    // "O que sumiu da tela é DESATIVADO, nunca apagado" — a rota grava isso
    // logo depois de validar. Se a validação não enxergar a desativação, o
    // dono consegue salvar um funil que ele mesmo acabou de deixar sem saída.
    const semDescarte = MOTIVOS_DOS_TRES.filter((m) => m.tipo !== "descartado");
    const depois = motivosDepoisDeGravar(MOTIVOS_DOS_TRES, semDescarte);

    expect(depois.find((m) => m.tipo === "descartado")?.ativo).toBe(false);
    expect(validarFunil(ETAPAS_PADRAO, depois).join(" ")).toContain("Não é oportunidade");
  });

  it("a etapa em que o lead nasce não pode virar terminal", () => {
    // O caminho de perda total que a revisão de 06/09 encontrou. O `<select>`
    // de tipo do FunilEditor não abre exceção para a etapa de entrada, e
    // `leads.situacao` tem `default 'novo'`: as duas rotas públicas do site
    // (/api/leads e /api/avaliacao) não mandam situação nenhuma.
    //
    // Com a etapa de entrada marcada como terminal, todo lead do site nasce
    // numa etapa que exige motivo, o banco recusa, e as duas rotas tratam a
    // falha como NÃO BLOQUEANTE (`console.warn` e seguem). O visitante vê o
    // WhatsApp abrir normalmente e o lead não existe em lugar nenhum.
    for (const tipo of TIPOS_DE_DESFECHO) {
      const erros = validarFunil(
        ETAPAS_PADRAO.map((e) => (e.chave === ETAPA_DE_ENTRADA ? { ...e, tipo } : e)),
        MOTIVOS_DOS_TRES,
      );
      expect(erros.join(" "), `entrada como ${tipo} passou`).toContain(ETAPA_DE_ENTRADA);
    }
  });

  it("a etapa de entrada também não pode ser desativada nem sumir", () => {
    // Desativar não perde o lead do mesmo jeito — perde pela FK: `situacao`
    // referencia `funil_etapas(chave)`, e o default continua apontando para
    // uma etapa que a tela mandou desativar. Mesma perda, outro erro.
    const desativada = validarFunil(
      ETAPAS_PADRAO.map((e) => (e.chave === ETAPA_DE_ENTRADA ? { ...e, ativa: false } : e)),
      MOTIVOS_DOS_TRES,
    );
    expect(desativada.join(" ")).toContain(ETAPA_DE_ENTRADA);

    const ausente = validarFunil(
      ETAPAS_PADRAO.filter((e) => e.chave !== ETAPA_DE_ENTRADA),
      MOTIVOS_DOS_TRES,
    );
    expect(ausente.join(" ")).toContain(ETAPA_DE_ENTRADA);
  });

  it("motivo sem rótulo não conta como saída — a rota vai descartá-lo", () => {
    // A divergência que a revisão mediu: o `+ motivo` do FunilEditor nasce com
    // `rotulo: ""` e `ativo: true`. A tela contava esse motivo e apagava o
    // erro do beco; a rota FILTRA por rótulo antes de gravar e respondia 422
    // com exatamente a frase que a tela tinha acabado de apagar.
    //
    // O dono desmarcava tudo, via o erro, clicava `+ motivo`, o erro sumia,
    // Salvar habilitava, e o servidor recusava. Erro que o operador não
    // entende porque as duas camadas contavam coisas diferentes.
    const vazio = motivo({ chave: "motivo_novo", rotulo: "   ", tipo: "descartado" });
    expect(motivoUtilizavel(vazio)).toBe(false);

    const erros = validarFunil(ETAPAS_PADRAO, [
      ...MOTIVOS_DOS_TRES.filter((m) => m.tipo !== "descartado"),
      vazio,
    ]);
    expect(erros.join(" ")).toContain("Não é oportunidade");
  });

  it("motivo sem chave não conta — ele não teria como ser gravado", () => {
    // `chaveDaEtapa("???")` devolve string vazia, e a rota monta a chave com
    // `m.chave || chaveDaEtapa(m.rotulo)`. Um motivo assim vira botão na caixa
    // e estoura na hora de fechar, dos dois lados.
    expect(chaveDaEtapa("???")).toBe("");
    expect(motivoUtilizavel(motivo({ chave: "", rotulo: "???" }))).toBe(false);
  });

  it("dois motivos com a mesma chave são recusados antes de virar 500", () => {
    // `upsert(..., { onConflict: "chave" })` com duas linhas da mesma chave
    // devolve `21000 ON CONFLICT DO UPDATE command cannot affect row a second
    // time` — em inglês, cru, num 500. A validação já cobrava isso das etapas
    // e não cobrava dos motivos.
    const erros = validarFunil(ETAPAS_PADRAO, [
      ...MOTIVOS_DOS_TRES,
      motivo({ chave: "spam", rotulo: "Spam de novo", tipo: "descartado", ordem: 9 }),
    ]);
    expect(erros.some((e) => e.includes("spam"))).toBe(true);
  });

  it("motivo desconhecido não vira acusação de beco", () => {
    // `null` não é lista vazia. A RLS deste projeto bloqueia devolvendo 200,
    // `[]` e `error` nulo — tratar isso como "não há motivo nenhum" acusaria
    // o dono de deixar o funil sem saída num PUT em que ele só mexeu num
    // prazo, e ainda desabilitaria o botão de salvar.
    expect(validarFunil(ETAPAS_PADRAO, null)).toEqual([]);
  });

  it("aceita o funil que a migração semeia", () => {
    // A semente do banco precisa passar na validação da tela. Se não passar, o
    // dono abre a configuração e encontra erro sem ter mexido em nada.
    expect(validarFunil(ETAPAS_PADRAO, MOTIVOS_DOS_TRES)).toEqual([]);
  });

  it("o quadro não desenha ganho nem perdido — eles são botão", () => {
    // 2026-08-28, segunda rodada com o dono: *"não precisa de uma aba de ganho
    // ou perdido, só um botão para destinar"*. As etapas continuam no banco
    // (é o que `leads.situacao` grava, e a FK exige que existam); o que sumiu
    // foi o lugar delas na tela.
    const quadro = etapasDoQuadro(ETAPAS_PADRAO, []);
    expect(quadro.every((e) => e.tipo === "aberta")).toBe(true);
    expect(quadro.map((e) => e.chave)).not.toContain("fechado");
    expect(quadro.map((e) => e.chave)).not.toContain("perdido");

    const destinos = destinosDoNegocio(ETAPAS_PADRAO);
    expect(destinos.map((e) => e.chave)).toEqual(["fechado", "perdido", "descartado"]);
  });

  it("destino desativado some do botão", () => {
    // Diferente da coluna, aqui não há card preso para proteger: quem
    // desativou "Perdido" não quer o botão. Os leads que já estão nele
    // continuam na lista de fechados.
    const semPerda = ETAPAS_PADRAO.map((e) =>
      e.tipo === "perdido" ? { ...e, ativa: false } : e,
    );
    expect(destinosDoNegocio(semPerda).map((e) => e.chave)).toEqual(["fechado", "descartado"]);
  });

  it("etapa arquivada com lead dentro continua visível", () => {
    // Desativar uma coluna que ainda tem card faria os cards sumirem da tela
    // sem erro nenhum.
    const etapas = [etapa({ chave: "antiga", ativa: false }), ...ETAPAS_PADRAO];
    const visiveis = etapasVisiveis(etapas, [{ situacao: "antiga" }]);
    expect(visiveis.map((e) => e.chave)).toContain("antiga");
    expect(etapasVisiveis(etapas, [{ situacao: "novo" }]).map((e) => e.chave)).not.toContain("antiga");
  });

  it("ordena pela ordem, com o rótulo como desempate estável", () => {
    const fora = [etapa({ chave: "b", rotulo: "B", ordem: 2 }), etapa({ chave: "a", rotulo: "A", ordem: 1 })];
    expect(ordenarEtapas(fora).map((e) => e.chave)).toEqual(["a", "b"]);
  });
});

describe("falar com o cliente", () => {
  it("normaliza o número para o formato que o wa.me aceita", () => {
    expect(numeroDiscavel("(41) 99737-2165")).toBe("5541997372165");
    expect(numeroDiscavel("+5541997372165")).toBe("5541997372165");
    expect(numeroDiscavel("4133334444")).toBe("554133334444");
    expect(numeroDiscavel(null)).toBe("");
  });

  it("sem número, sem link — e não um link quebrado", () => {
    // `wa.me/` sem número abre o WhatsApp numa tela de erro, e o vendedor
    // conclui que o sistema está quebrado. Quem chama esconde o botão.
    expect(linkDeConversa(null)).toBe("");
    expect(linkDeConversa("")).toBe("");
  });

  it("a mensagem cita o carro quando existe interesse", () => {
    // É a diferença entre "oi, tudo bem?" e uma retomada que o cliente
    // reconhece.
    const com = mensagemParaCliente({ nome: "joão da silva", interesse: "Onix 2020" }, { loja: "Motors", vendedor: "Ana Paula" });
    expect(com).toContain("João");
    expect(com).toContain("Ana");
    expect(com).toContain("Onix 2020");
    expect(com).not.toContain("  ");

    const sem = mensagemParaCliente({ nome: "João", interesse: null }, { loja: "Motors" });
    expect(sem).toContain("seu contato pelo nosso site");
  });

  it("o texto viaja codificado dentro do link", () => {
    const link = linkDeConversa("5541997372165", "Olá, João!");
    expect(link.startsWith("https://wa.me/5541997372165?text=")).toBe(true);
    expect(link).not.toContain(" ");
  });
});

describe("o aviso que chega no WhatsApp do vendedor", () => {
  const base: LinhaDaFilaDoFunil = {
    lead_id: "1",
    nome: "Ana Souza",
    telefone: "5541997372165",
    interesse: "Onix 2020",
    canal: "site",
    situacao: "proposta",
    etapa: "Proposta",
    minutos_parado: 2880,
    aviso: "estagnacao",
    responsavel: "Bruno",
    responsavel_whatsapp: "+5541999990001",
    novo_responsavel: null,
    novo_whatsapp: null,
    suprimido_por: null,
  };

  it("diz o que fazer e traz o link junto", () => {
    // Alerta que obriga a abrir o painel para achar o telefone é alerta que
    // espera o vendedor chegar na loja.
    const texto = mensagemDeAlerta(base, { loja: "Motors" });
    expect(texto).toContain("Ana Souza");
    expect(texto).toContain("2 dias");
    expect(texto).toContain("https://wa.me/5541997372165");
  });

  it("nunca leva valor de negócio nem documento", () => {
    // A mensagem trafega por WhatsApp: o mínimo necessário é nome, carro e
    // link.
    const texto = mensagemDeAlerta({ ...base, aviso: "transferencia", novo_responsavel: "Carla", novo_whatsapp: "+5541999990002" });
    expect(texto).not.toMatch(/R\$|CPF|CNPJ/);
  });

  it("a transferência diz de quem o lead veio", () => {
    // Sem isso o vendedor novo recebe um nome sem contexto e liga sem saber o
    // que já foi conversado.
    const texto = mensagemDeAlerta({ ...base, aviso: "transferencia", novo_responsavel: "Carla", novo_whatsapp: "+5541999990002" });
    expect(texto).toContain("Bruno");
    expect(texto).toContain("transferido");
  });

  it("entrega no dono atual quando é cobrança, e no novo quando é troca", () => {
    // Mandar a cobrança para quem acabou de perder o lead — ou o aviso de
    // chegada para quem o perdeu — é o erro que faz a equipe desconfiar do
    // sistema inteiro.
    expect(destinatarioDoAviso(base)).toBe("5541999990001");
    expect(
      destinatarioDoAviso({ ...base, aviso: "transferencia", novo_whatsapp: "+5541999990002" }),
    ).toBe("5541999990002");
    expect(
      destinatarioDoAviso({ ...base, aviso: "atribuicao", novo_whatsapp: "+5541999990003" }),
    ).toBe("5541999990003");
  });

  it("sem número não inventa destinatário", () => {
    expect(destinatarioDoAviso({ ...base, responsavel_whatsapp: null })).toBeNull();
  });
});

describe("o relatório", () => {
  const motivos: MotivoDoFunil[] = [
    { chave: "preco", rotulo: "Preço", tipo: "perdido", ordem: 1, ativo: true },
    { chave: "sem_estoque", rotulo: "Sem estoque", tipo: "perdido", ordem: 2, ativo: true },
    { chave: "a_vista", rotulo: "À vista", tipo: "ganho", ordem: 1, ativo: true },
  ];

  const fechados = [
    { desfecho: "perdido" as const, desfecho_motivo: "preco", desfecho_valor: null },
    { desfecho: "perdido" as const, desfecho_motivo: "preco", desfecho_valor: null },
    { desfecho: "perdido" as const, desfecho_motivo: null, desfecho_valor: null },
    { desfecho: "ganho" as const, desfecho_motivo: "a_vista", desfecho_valor: 60000 },
  ];

  it("agrupa por motivo, do maior para o menor", () => {
    const linhas = agruparPorMotivo(fechados, motivos, "perdido");
    expect(linhas[0].chave).toBe("preco");
    expect(linhas[0].quantidade).toBe(2);
    expect(Math.round(linhas[0].percentual)).toBe(67);
  });

  it("mostra o `sem motivo` em vez de escondê-lo", () => {
    // É o termômetro de confiança do relatório: se for a maior fatia, nenhuma
    // das outras vale nada — e é melhor ver isso no gráfico que na reunião.
    const linhas = agruparPorMotivo(fechados, motivos, "perdido");
    const semMotivo = linhas.find((l) => l.chave === "sem_motivo");
    expect(semMotivo?.rotulo).toBe("Sem motivo informado");
    expect(semMotivo?.quantidade).toBe(1);
  });

  it("soma o valor só do que foi ganho", () => {
    const linhas = agruparPorMotivo(fechados, motivos, "ganho");
    expect(linhas[0].valor).toBe(60000);
  });

  it("a conversão é sobre negócios ENCERRADOS", () => {
    // Sobre o total, a taxa pioraria no começo do mês e melhoraria sozinha no
    // fim, sem ninguém ter vendido nada a mais.
    expect(taxaDeConversao(1, 3)).toBe(25);
    expect(taxaDeConversao(0, 0)).toBe(0);
  });
});

describe("a tela e o banco calculam a mesma coisa", () => {
  it("as duas leem `ultimo_movimento_em` e `ultimo_contato_em`", () => {
    // Se divergirem, a tela pinta o card de vermelho enquanto o motor acha
    // que está tudo bem — ou o contrário, que é pior: o lead troca de dono
    // sem nenhum aviso visual antes.
    const fonte = readFileSync(join(__dirname, "..", "src", "lib", "funil.ts"), "utf-8");
    expect(fonte).toContain("ultimo_movimento_em");
    expect(fonte).toContain("ultimo_contato_em");
    expect(sqlExecutavel).toContain("greatest(l.ultimo_movimento_em, l.ultimo_contato_em)");
  });

  it("as sete chaves do funil antigo continuam sendo as da semente", () => {
    // `leads.situacao` já grava essas chaves em 100% das linhas, e agora há
    // uma FK para elas. Trocar uma chave aqui migraria — ou perderia — os
    // leads existentes.
    //
    // A lista é EXPLÍCITA, e não `ETAPAS_PADRAO`: a semente cresceu em
    // 2026-08-28 com `descartado`, que nasce na migração seguinte. Varrer o
    // padrão faria este teste cobrar da migração antiga uma etapa que ela não
    // tem — foi exatamente o que aconteceu, e o alvo aqui são as SETE do
    // `check` original.
    const DO_CHECK_ANTIGO = [
      "novo", "em_contato", "proposta", "visita", "negociacao", "fechado", "perdido",
    ];
    for (const chave of DO_CHECK_ANTIGO) {
      expect(sqlExecutavel, `semente sem ${chave}`).toContain(`'${chave}'`);
    }
    // E todas elas continuam no padrão da tela.
    for (const chave of DO_CHECK_ANTIGO) {
      expect(ETAPAS_PADRAO.map((e) => e.chave)).toContain(chave);
    }
  });

  it("visita e negociação nascem protegidas nos dois lados", () => {
    expect(ETAPAS_PADRAO.find((e) => e.chave === "visita")?.protegida).toBe(true);
    expect(ETAPAS_PADRAO.find((e) => e.chave === "negociacao")?.protegida).toBe(true);
    expect(sqlExecutavel).toMatch(/'visita',\s+'Visita agendada',\s+4,\s+'aberta',\s+2880,\s+null,\s+true/);
    expect(sqlExecutavel).toMatch(/'negociacao',\s+'Negociação',\s+5,\s+'aberta',\s+2880,\s+null,\s+true/);
  });

  it("a fila é do papel de serviço, nunca do usuário logado", () => {
    // Ela carrega nome e telefone de lead e o WhatsApp da equipe. Mesma régua
    // do motor do Ciclo.
    expect(sqlExecutavel).toMatch(
      /revoke all on function public\.montar_fila_do_funil[\s\S]{0,120}from public, anon, authenticated/,
    );
    expect(sqlExecutavel).toMatch(
      /grant execute on function public\.montar_fila_do_funil[\s\S]{0,120}to service_role/,
    );
  });

  it("a leitura de leads deixou de ser de qualquer authenticated", () => {
    // A policy antiga (`using (true)`) era de quando `authenticated` queria
    // dizer "gente do painel" — antes de o papel `cliente` existir. Este
    // arquivo leva `leads` para dentro de uma view compartilhada, então a
    // porta precisa estar fechada.
    expect(sqlExecutavel).toContain("public.is_staff(auth.uid())");
    expect(sqlExecutavel).not.toMatch(/create policy leads_leitura[\s\S]{0,120}using \(true\)/);
  });

  it("o rastro cascateia na exclusão do lead (LGPD art. 18, VI)", () => {
    // Um rastro que sobrevivesse ao pedido de exclusão guardaria o nome de
    // quem pediu para ser esquecido.
    expect(sqlExecutavel).toMatch(
      /lead_id\s+uuid not null references public\.leads\(id\) on delete cascade/,
    );
  });
});

describe("o rodízio não tem teto", () => {
  it("o selo só aparece a partir da segunda transferência", () => {
    // Decisão do dono em 2026-08-28: *"quantas se fizerem necessárias até o
    // atendimento"*. A primeira versão travava na terceira troca; travar
    // escondia o problema, contar o expõe. A primeira troca é o rodízio
    // funcionando, não uma anomalia — marcar tudo é o mesmo que não marcar.
    expect(seloDeRodizio(0)).toBeNull();
    expect(seloDeRodizio(1)).toBeNull();
    expect(seloDeRodizio(2)).toBe("2ª transferência");
    expect(seloDeRodizio(7)).toBe("7ª transferência");
    expect(seloDeRodizio(null)).toBeNull();
  });

  it("a fila do banco não suprime mais por número de trocas", () => {
    // Se um teto voltar, ele volta aqui — e volta calado, porque um lead
    // travado simplesmente para de aparecer na fila.
    expect(sqlExecutavel).not.toContain("rodizio_esgotado");
    expect(sqlExecutavel).not.toMatch(/transferencias\s*>=\s*\d/);
    // E o motivo que sobrou no vocabulário da tela é o que o banco produz.
    expect(MOTIVO_DA_SUPRESSAO).not.toHaveProperty("rodizio_esgotado");
  });

  it("quem para a roda é o atendimento", () => {
    // É a outra metade da decisão: sem teto, o único freio é alguém falar com
    // o cliente. A função que o botão de WhatsApp chama existe para isso.
    expect(sqlExecutavel).toContain("registrar_contato_do_lead");
    expect(sqlExecutavel).toMatch(/set\s+ultimo_contato_em = v_agora/);
  });
});

describe("o terceiro desfecho: não é uma oportunidade de negócio", () => {
  // 2026-08-28, pedido do dono: *"precisamos ter a opção de encerrar como
  // 'não é uma oportunidade de negócio', para os casos de spam, testes,
  // contato equivocado"*.
  //
  // O ponto não é ter mais um rótulo. É que a taxa de conversão é
  // `ganhos / (ganhos + perdidos)`: enquanto spam entrava como perda, cada
  // robô que preenchia o formulário baixava o número da loja — e a decisão
  // que sai de um número desses é sobre a equipe comercial, quando o problema
  // era o captcha.

  const SQL_DESCARTE = readFileSync(
    join(__dirname, "..", "supabase", "migrations",
         "20260828160000_desfecho_sem_oportunidade.sql"),
    "utf-8",
  );
  /** Só o que o Postgres executa — a migração cita a regra ANTIGA para
   *  explicar por que a trocou, e uma asserção contra o texto cru reprovaria
   *  a própria explicação. Foi o vício que já apareceu duas vezes hoje. */
  const descarteExecutavel = SQL_DESCARTE.split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("o descarte fica FORA da taxa de conversão", () => {
    // A asserção que dá razão ao tipo inteiro. 1 ganho, 1 perda e 98 spams
    // não podem virar 1%.
    expect(taxaDeConversao(1, 1)).toBe(50);
    // `taxaDeConversao` recebe dois números justamente para não haver onde
    // enfiar o descarte — quem tentasse passaria o total e o tipo reclamaria.
    const fechados = [
      { desfecho: "ganho" as const, desfecho_motivo: "a_vista", desfecho_valor: null },
      { desfecho: "perdido" as const, desfecho_motivo: "preco", desfecho_valor: null },
      ...Array.from({ length: 98 }, () => ({
        desfecho: "descartado" as const, desfecho_motivo: "spam", desfecho_valor: null,
      })),
    ];
    const g = fechados.filter((l) => l.desfecho === "ganho").length;
    const p = fechados.filter((l) => l.desfecho === "perdido").length;
    expect(taxaDeConversao(g, p)).toBe(50);
  });

  it("a rota do relatório conta os três separados e não deixa o descarte cair no else", () => {
    const rota = readFileSync(
      join(__dirname, "..", "src", "app", "api", "funil", "relatorio", "route.ts"),
      "utf-8",
    );
    expect(rota).toContain('l.desfecho === "descartado"');
    expect(rota).toContain("descartados: descartados.length");
    expect(rota).toContain("por_motivo_descartado");
    // No recorte por vendedor o `continue` tem que vir ANTES do `else`: um
    // `else` que engole tudo que não é ganho transforma descarte em perda de
    // novo, e cobra o vendedor por um robô.
    const bloco = rota.slice(rota.indexOf("const porVendedor"), rota.indexOf("resposta.por_vendedor"));
    expect(bloco.indexOf('desfecho === "descartado") continue'))
      .toBeLessThan(bloco.indexOf("atual.perdidos += 1"));
  });

  it("o vocabulário é lista, não ternário", () => {
    // O defeito que este teste tranca: `m.tipo === "ganho" ? "ganho" :
    // "perdido"` estava certo com dois desfechos e, com o terceiro,
    // converteria TODO motivo de descarte em motivo de perda — sem erro,
    // desfazendo em silêncio a separação inteira. O mesmo ternário na etapa
    // faria a etapa terminal virar `aberta`, e ela viraria coluna do quadro.
    expect(TIPOS_DE_DESFECHO).toEqual(["ganho", "perdido", "descartado"]);
    expect(ehTipoDeDesfecho("descartado")).toBe(true);
    expect(ehTipoDeDesfecho("inventado")).toBe(false);
    expect(ehTipoDeEtapa("descartado")).toBe(true);
    expect(ehTipoDeEtapa("")).toBe(false);

    const rota = readFileSync(
      join(__dirname, "..", "src", "app", "api", "funil", "config", "route.ts"),
      "utf-8",
    );
    expect(rota).toContain("ehTipoDeEtapa");
    expect(rota).toContain("ehTipoDeDesfecho");
    expect(rota).not.toMatch(/\? "ganho" : "perdido"/);
    expect(rota).not.toMatch(/includes\(e\.tipo\) \? e\.tipo : "aberta"/);
  });

  it("o descarte não vira coluna do quadro nem cobra prazo", () => {
    const descarte = ETAPAS_PADRAO.find((e) => e.chave === "descartado");
    expect(descarte).toBeTruthy();
    expect(descarte!.protegida).toBe(true);
    expect(descarte!.estagnacao_minutos).toBeNull();
    expect(etapasDoQuadro(ETAPAS_PADRAO, []).map((e) => e.chave)).not.toContain("descartado");
    expect(destinosDoNegocio(ETAPAS_PADRAO).map((e) => e.chave)).toContain("descartado");
    expect(ehDescarte(descarte!.tipo)).toBe(true);
    // E lead descartado não apodrece, como qualquer negócio encerrado.
    expect(nivelDeEstagnacao(lead(5000, { desfecho: "descartado" }), etapa(), AGORA)).toBe("ok");
  });

  it("contato_invalido deixou de ser motivo de perda", () => {
    // Ele já existia como perda com o comentário certo — "não é motivo de
    // venda perdida" — e mesmo assim contava como uma. A chave fica para o
    // histórico não quebrar; o que muda é o lado.
    expect(SQL_DESCARTE).toMatch(/set tipo = 'descartado'[\s\S]{0,200}where chave = 'contato_invalido'/);
    // E quem já tinha sido fechado com ele muda de desfecho junto: perdido
    // apontando para motivo de descarte é um estado que a própria rota recusa
    // ao gravar.
    expect(SQL_DESCARTE).toContain("set desfecho = 'descartado'");
  });

  it("a agenda escreve a regra pelo lado positivo", () => {
    // `desfecho is distinct from 'perdido'` deixaria o spam de volta na lista
    // de contatos ativos. Escrita como "ativo é quem está em aberto ou
    // ganhou", um quarto tipo que apareça um dia nasce inativo — o lado
    // seguro de errar numa lista de contatos.
    expect(descarteExecutavel).toContain("(l.desfecho is null or l.desfecho = 'ganho')");
    expect(descarteExecutavel).not.toContain("desfecho is distinct from 'perdido'");
  });

  it("o gatilho carimba os três tipos", () => {
    // Sem o terceiro na lista, o lead cai na etapa de descarte, não recebe
    // desfecho e volta para a fila de estagnação — o vendedor cobrado por não
    // atender um robô.
    expect(SQL_DESCARTE).toContain("in ('ganho', 'perdido', 'descartado')");
  });
});

describe("o workflow do n8n e a rota falam a mesma língua", () => {
  // `supabase/README.md` registra que a cópia versionada de workflow do n8n já
  // divergiu do que roda ao vivo DUAS vezes neste projeto. A divergência é
  // muda: o workflow lê um campo que a rota deixou de mandar, a expressão vira
  // `undefined`, e a mensagem sai vazia ou não sai — com a execução verde.
  //
  // Este bloco não prova que o n8n está configurado certo (nada aqui alcança o
  // n8n). Prova que o ARQUIVO versionado combina com a rota — que é a metade
  // que o repositório controla.

  const workflow = readFileSync(
    join(__dirname, "..", "Motors Funil — Alertas de Estagnação.json"),
    "utf-8",
  );
  const wf = JSON.parse(workflow);
  const rota = readFileSync(
    join(__dirname, "..", "src", "app", "api", "funil", "alertas", "route.ts"),
    "utf-8",
  );

  it("o JSON é válido e nenhuma conexão aponta para um nó que não existe", () => {
    // Conexão órfã não impede a importação: o n8n só desenha o fluxo partido,
    // e o ramo some sem avisar.
    const nomes = new Set(wf.nodes.map((n: any) => n.name));
    for (const [origem, saidas] of Object.entries<any>(wf.connections)) {
      expect(nomes.has(origem), `origem inexistente: ${origem}`).toBe(true);
      for (const saida of saidas.main) {
        for (const alvo of saida) {
          expect(nomes.has(alvo.node), `destino inexistente: ${alvo.node}`).toBe(true);
        }
      }
    }
  });

  it("chama a rota certa, com reservar ligado", () => {
    expect(workflow).toContain("/api/funil/alertas");
    expect(workflow).toContain('\\"reservar\\": true');
  });

  it("usa o token do funil, nunca o do Ciclo", () => {
    // Segredo mede acesso: a base de leads e a base de clientes do Ciclo são
    // dois conjuntos de dados. Um workflow que reusasse o token vizinho
    // abriria uma escada de privilégio sem ninguém notar.
    //
    // A asserção olha a CREDENCIAL, não o texto do arquivo: a primeira versão
    // deste teste procurava a string "CICLO_MOTOR_TOKEN" no JSON inteiro e
    // reprovou a nota que EXPLICA por que aquele token não é usado aqui. É o
    // mesmo vício da autoconferência da migração — cobrar a palavra em vez da
    // regra.
    const credenciais = wf.nodes
      .map((n: any) => n.credentials?.httpHeaderAuth?.name)
      .filter(Boolean);
    expect(credenciais).toContain("FUNIL_MOTOR_TOKEN");
    expect(credenciais).not.toContain("CICLO_MOTOR_TOKEN");
  });

  it("lê da resposta só campos que a rota realmente manda", () => {
    for (const campo of ["fila", "suprimidos", "sem_destinatario"]) {
      expect(workflow, `workflow lê ${campo}`).toContain(campo);
      expect(rota, `rota manda ${campo}`).toContain(campo);
    }
    // A forma de cada item da fila. `destinatario.whatsapp` é o que decide
    // para quem a mensagem vai — se ele mudar de nome, todo aviso vira
    // "sem número" e o ramo silencioso engole tudo.
    expect(workflow).toContain("a.destinatario?.whatsapp");
    expect(rota).toMatch(/destinatario: \{[\s\S]{0,200}whatsapp:/);
    expect(workflow).toContain("a.mensagem");
    expect(rota).toContain("mensagem: mensagemDeAlerta(linha");
  });

  it("as supressões que ele trata como acionáveis existem no banco", () => {
    // Um nome errado aqui não dá erro: o filtro simplesmente nunca casa, e o
    // aviso de cadastro faltando nunca sai.
    for (const motivo of ["vendedor_sem_whatsapp", "sem_vendedor_disponivel"]) {
      expect(workflow, `workflow cita ${motivo}`).toContain(motivo);
      expect(sqlExecutavel, `SQL produz ${motivo}`).toContain(motivo);
    }
    // E as que ele IGNORA de propósito também são reais — se uma delas mudar
    // de nome, ela passa a virar alarme de gestão todo dia.
    for (const normal of ["fora_do_horario", "alerta_recente"]) {
      expect(sqlExecutavel).toContain(normal);
    }
  });

  it("falha de entrega derruba a execução — o lead já foi transferido", () => {
    // É o único buraco do desenho: a rota transfere no mesmo comando que monta
    // a fila, e a entrega acontece depois, no n8n. Envio que falha em silêncio
    // produz exatamente a transferência sem aviso que o resto do sistema
    // existe para impedir.
    const conferir = wf.nodes.find((n: any) => n.name === "Conferir entregas");
    expect(conferir, "o nó de conferência sumiu").toBeTruthy();
    expect(conferir.parameters.jsCode).toContain("throw new Error");
    expect(conferir.parameters.jsCode).toContain("JÁ foi transferido");
    // E ele precisa receber os DOIS ramos: o que enviou e o que não tinha
    // número. Só um deles e metade das falhas fica invisível.
    expect(wf.connections["Registrar envio"].main[0][0].node).toBe("Conferir entregas");
    expect(wf.connections["Não enviado (sem número)"].main[0][0].node).toBe("Conferir entregas");
  });

  it("nasce desligado", () => {
    // Importar não pode ligar sozinho: a primeira rodada em produção manda
    // mensagem de verdade, e quem decide a hora é o dono.
    expect(wf.active).toBe(false);
  });
});

describe("a autoconferência não pode sujar a base que ela conferiu", () => {
  // 2026-08-28: a migração foi recusada em produção com
  //   "ACEITE FALHOU: o rodízio mandou o lead para Dyones Oliveira".
  // A função estava certa; a asserção é que fora escrita para um banco vazio.
  // E ela escondia um defeito pior, provado depois num banco de ensaio: o
  // bloco chamava `montar_fila_do_funil(..., true)`, que NÃO tem recorte —
  // ela reserva a fila inteira. Num banco com leads de verdade, o aceite
  // teria transferido lead real, carimbado `alertado_em` e escrito no rastro,
  // e a limpeza por DELETE só apagaria as linhas do próprio ensaio.
  //
  // Ou seja: a migração que existe para impedir transferência silenciosa
  // faria uma, na hora de aplicar. Estes três testes trancam a correção.

  it("o ensaio roda dentro de um bloco que desfaz tudo", () => {
    // Sem o sentinela, qualquer escrita do aceite — inclusive sobre dado real
    // — fica comitada junto com a migração.
    const sentinelas = sqlExecutavel.match(/errcode = 'ACE01'/g) ?? [];
    const capturas = sqlExecutavel.match(/when sqlstate 'ACE01' then null/g) ?? [];
    expect(sentinelas.length).toBe(2);
    expect(capturas.length).toBe(2);
  });

  it("a limpeza não depende de o bloco chegar ao fim", () => {
    // `delete` no rodapé só roda se nenhuma asserção falhar antes — e é
    // justamente quando uma falha que o resíduo fica para trás. O rollback
    // não tem esse problema.
    expect(sqlExecutavel).not.toMatch(/delete from public\.leads\s+where nome like/);
    expect(sqlExecutavel).not.toMatch(/delete from auth\.users\s+where id in \(v_vend/);
  });

  it("o rodízio é cobrado pela regra, não pelo nome de quem ele escolhe", () => {
    // Nome só é previsível num banco vazio. A asserção correta é relativa:
    // quem foi escolhido tem a MENOR carteira aberta entre os elegíveis.
    expect(sqlExecutavel).not.toMatch(
      /novo_responsavel is distinct from 'Aceite/,
    );
    expect(sqlExecutavel).toContain("qtd is distinct from v_min");
  });
});

describe("quem mexe na régua", () => {
  it("configurar o funil está na matriz A17, não num `includes` de rota", () => {
    // Em 2026-08-19 o multi-papel mostrou o custo de cada rota inventar o
    // próprio recorte: quem é comercial E gestor precisa valer pelo mais
    // permissivo dos dois, e um `perfis.includes("gestor")` escrito à mão numa
    // rota não sabe disso.
    expect(MATRIZ_DE_PERMISSOES.map((l) => l.acao)).toContain("Configurar o funil de vendas");
    const rota = readFileSync(
      join(__dirname, "..", "src", "app", "api", "funil", "config", "route.ts"),
      "utf-8",
    );
    expect(rota).toContain('podeFazer(perfis, "Configurar o funil de vendas")');
  });

  it("quem é cobrado pelo prazo não é quem o define", () => {
    // O Comercial move lead (linha "Ver e mover leads no kanban") e LÊ a
    // configuração — o kanban precisa das etapas para desenhar as colunas —,
    // mas quem define em quantos minutos ele é cobrado é quem responde pela
    // operação.
    for (const p of ["admin", "gestor"] as const) {
      expect(podeFazer(p, "Configurar o funil de vendas")).toBe("faz");
    }
    for (const p of ["comercial", "marketing", "financeiro"] as const) {
      expect(podeFazer(p, "Configurar o funil de vendas")).toBe("nao_ve");
    }
    // Mas mover lead continua sendo dele.
    expect(podeFazer("comercial", "Ver e mover leads no kanban")).toBe("faz");
  });

  it("a rota do desfecho recusa fechar negócio sem motivo", () => {
    // A validação não pode morar só na tela: uma validação de componente vira
    // opcional no dia em que alguém chamar a rota de outro lugar — e o
    // relatório de perdas nasce vazio sem nada dar erro.
    const rota = readFileSync(
      join(__dirname, "..", "src", "app", "api", "leads", "gerenciar", "route.ts"),
      "utf-8",
    );
    expect(rota).toContain("motivo_obrigatorio");
    expect(rota).toMatch(/status: 422/);
    // E recusa motivo de ganho num negócio perdido: somar peras com maçãs só
    // apareceria no gráfico, meses depois.
    // A recusa por tipo cruzado saiu da rota em 06/09 e virou `decidirDesfecho`
    // em `lib/funil` — onde ela é EXECUTADA por teste em vez de lida. O que se
    // afirma aqui é só que a rota continua delegando.
    expect(rota).toContain("decidirDesfecho(");
  });
});

describe("espera", () => {
  it("escreve curto, como cabe no rodapé do card", () => {
    expect(espera(new Date(AGORA - 30_000).toISOString(), AGORA)).toBe("agora");
    expect(espera(new Date(AGORA - 20 * 60_000).toISOString(), AGORA)).toBe("20 min");
    expect(espera(new Date(AGORA - 5 * 3600_000).toISOString(), AGORA)).toBe("5 h");
    expect(espera(new Date(AGORA - 50 * 3600_000).toISOString(), AGORA)).toBe("2 d");
  });
});

// ---------------------------------------------------------------------------
// O terceiro desfecho e a lista nominal que não o conhece
// ---------------------------------------------------------------------------

/**
 * `src/lib/funil.ts` já escreveu esta lição em prosa, antes de ela custar
 * alguma coisa: um `m.tipo === "ganho" ? "ganho" : "perdido"` estava certo
 * enquanto havia dois desfechos e passaria a converter em silêncio no dia em
 * que entrasse o terceiro. Foi por isso que `TIPOS_DE_DESFECHO`,
 * `ehTipoDeDesfecho` e `ehDescarte` existem.
 *
 * A lição foi escrita e o defeito aconteceu assim mesmo, em outra forma — não
 * o ternário, a disjunção. `mover` no kanban e o PATCH de `/api/leads/gerenciar`
 * perguntavam `tipo === "ganho" || tipo === "perdido"`, uma pergunta que
 * nasceu certa no commit 3cdf5a8 (dois desfechos) e ficou errada em
 * 2026-08-28, quando `descartado` entrou. Nenhum erro, nenhum aviso: o card
 * ia direto para a etapa de descarte, o gatilho do banco carimbava
 * `desfecho = 'descartado'` e o MOTIVO ficava nulo. Os seis motivos de
 * descarte nunca eram coletados, o ramo de descarte de `ModalDeDesfecho` era
 * código morto, e todo descarte caía em "Sem motivo informado" no relatório.
 *
 * A metade da TELA é cobrada em `tests/leads-kanban.test.ts` — que é onde
 * ela morava, e onde a asserção antiga exigia o defeito pela grafia. Aqui
 * ficam a metade do SERVIDOR e a trava de classe, que vale para as duas.
 *
 * Por que a asserção cobra o PREDICADO e não aceita `!== "aberta"`: o segundo
 * também é literal, só que do outro lado. Uma quinta etapa — "pausada", digamos
 * — quebraria a versão negativa exatamente do mesmo jeito. O vocabulário mora
 * em `funil.ts` de propósito; quem decide desfecho pergunta a ele.
 */
describe("o terceiro desfecho não pode ser esquecido pela lista nominal", () => {
  /** O que está entre duas âncoras da fonte. Falha alto se a âncora sumiu. */
  function trecho(fonte: string, de: string, ate: string): string {
    const i = fonte.indexOf(de);
    expect(i, `âncora inicial não encontrada: ${de}`).toBeGreaterThanOrEqual(0);
    const j = fonte.indexOf(ate, i + de.length);
    expect(j, `âncora final não encontrada: ${ate}`).toBeGreaterThan(i);
    return fonte.slice(i, j);
  }

  /**
   */

  it("exige motivo nos TRÊS desfechos, e não cobra de etapa aberta", async () => {
    // Executado, não lido. A versão anterior deste teste afirmava a condição
    // do `if` no fonte da rota, e a revisão de 06/09 a furou inserindo um
    // desvio LOGO ABAIXO do trecho lido: descarte gravava direto, a condição
    // afirmada continuava idêntica, e a suíte inteira ficava verde.
    const nunca = async () => {
      throw new Error("não devia procurar motivo nenhum");
    };

    for (const tipo of TIPOS_DE_DESFECHO) {
      const etapa = { chave: tipo, rotulo: ROTULO_DO_DESFECHO[tipo], tipo };
      const semMotivo = await decidirDesfecho(etapa, {}, nunca);
      expect(semMotivo.ok, `${tipo} passou sem motivo`).toBe(false);
      if (!semMotivo.ok) {
        expect(semMotivo.motivoObrigatorio).toBe(true);
        expect(semMotivo.erro).toContain(ROTULO_DO_DESFECHO[tipo]);
      }
    }

    // Etapa aberta não cobra nada — e nem vai ao banco procurar motivo.
    const aberta = await decidirDesfecho(
      { chave: "proposta", rotulo: "Proposta", tipo: "aberta" },
      { desfecho_motivo: "spam" },
      nunca,
    );
    expect(aberta).toEqual({ ok: true, campos: {} });

    // Etapa desconhecida (migração pendente) segue o comportamento antigo.
    expect(await decidirDesfecho(null, {}, nunca)).toEqual({ ok: true, campos: {} });
  });

  it("recusa motivo de um tipo em etapa de outro", async () => {
    // Somar peras com maçãs só apareceria no gráfico, meses depois. A FK do
    // banco garante que a chave existe, nunca que o tipo casa.
    const decisao = await decidirDesfecho(
      { chave: "descartado", rotulo: "Não é oportunidade", tipo: "descartado" },
      { desfecho_motivo: "preco" },
      async () => ({ chave: "preco", tipo: "perdido" }),
    );
    expect(decisao.ok).toBe(false);
    if (!decisao.ok) expect(decisao.erro).toContain("perdido");
  });

  it("recusa motivo que não existe no banco", async () => {
    const decisao = await decidirDesfecho(
      { chave: "fechado", rotulo: "Ganho", tipo: "ganho" },
      { desfecho_motivo: "inventado" },
      async () => null,
    );
    expect(decisao.ok).toBe(false);
    if (!decisao.ok) expect(decisao.erro).toContain("inventado");
  });

  it("com o motivo certo devolve os campos, e valor só quando faz sentido", async () => {
    const doTipo = async (chave: string) => ({ chave, tipo: "ganho" });
    const decisao = await decidirDesfecho(
      { chave: "fechado", rotulo: "Ganho", tipo: "ganho" },
      { desfecho_motivo: " a_vista ", desfecho_valor: "72.500,50", desfecho_nota: "  " },
      doTipo,
    );
    expect(decisao).toEqual({
      ok: true,
      campos: {
        desfecho_motivo: "a_vista",
        desfecho_valor: 72500.5,
        desfecho_nota: null,
      },
    });
  });

  it("a rota delega a decisão em vez de reimplementá-la", () => {
    // A rota é a segunda metade da mesma trava. Corrigir só a tela deixaria o
    // servidor aceitando descarte sem motivo — que é exatamente o buraco que
    // o comentário da própria rota diz existir para tapar ("uma validação que
    // mora apenas no componente vira opcional no dia em que alguém chamar a
    // rota de outro lugar").
    // O que sobrou de asserção de fonte, e o que ela ainda vale: garantir
    // que ninguém traga a regra de volta para dentro do PATCH, onde ela
    // volta a ser testável só por leitura.
    const rota = lerCodigo(join("src", "app", "api", "leads", "gerenciar", "route.ts"));
    const patch = trecho(rota, "export async function PATCH", "export async function DELETE");

    expect(patch).toContain("decidirDesfecho(");
    expect(
      patch,
      "a decisão do desfecho voltou para dentro do PATCH — lá ela só se prova lendo",
    ).not.toMatch(/===\s*"(ganho|perdido|descartado|aberta)"/);
  });


  it("nenhum arquivo de `src/` pergunta pelo desfecho com uma lista de dois", () => {
    // A trava de classe. As outras duas — a de cima e a de
    // `leads-kanban.test.ts` — seguram os dois pontos conhecidos; esta segura
    // o próximo, que pelo histórico deste arquivo vai existir.
    const raiz = join(__dirname, "..", "src");
    const arquivos: string[] = [];
    (function varrer(dir: string) {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (/\.tsx?$/.test(nome)) arquivos.push(caminho);
      }
    })(raiz);

    // Sem isto, um erro de caminho deixaria a varredura vazia e o teste verde.
    expect(arquivos.length).toBeGreaterThan(100);

    // O par, nas duas ordens, e só sobre `.tipo` — nunca sobre `.desfecho`.
    //
    // A distinção é o que separa a pergunta errada da conta certa. Decidir
    // se uma ETAPA é terminal com dois nomes é o defeito: `funil.ts` tem o
    // predicado, e a lista escrita à mão esquece o tipo que chegar depois.
    // Já contar quantos LEADS têm `desfecho` ganho ou perdido é a definição
    // da taxa de conversão — ali a dupla é obrigatória, e descartado precisa
    // ficar de fora. A revisão de 05/09 provou que a versão anterior desta
    // varredura reprovava exatamente esse denominador, com uma mensagem que
    // dizia o contrário da verdade.
    //
    // Espaço em branco normalizado por precaução: os dois defeitos reais
    // couberam numa linha só, mas uma condição um pouco mais longa o
    // prettier quebra — e a busca não pode depender disso.
    const PARES = [
      /\.tipo\s*===\s*"ganho"\s*\|\|[^;{}]{0,60}\.tipo\s*===\s*"perdido"/,
      /\.tipo\s*===\s*"perdido"\s*\|\|[^;{}]{0,60}\.tipo\s*===\s*"ganho"/,
    ];

    // Junta todos antes de cobrar: um `expect` dentro do laço estoura no
    // primeiro e esconde os outros — foi assim que a rota escondeu o kanban
    // enquanto os dois estavam quebrados.
    const infratores = arquivos.filter((caminho) => {
      const codigo = semComentarios(readFileSync(caminho, "utf8")).replace(/\s+/g, " ");
      return PARES.some((par) => par.test(codigo));
    });

    expect(
      infratores.map((c) => c.slice(raiz.length + 1).split(sep).join("/")),
      '`.tipo === "ganho" || .tipo === "perdido"` é a lista de dois de antes ' +
        "de 2026-08-28 — quem decide se uma etapa é terminal pergunta a " +
        "ehTipoDeDesfecho, que conhece os três",
    ).toEqual([]);
  });
});
