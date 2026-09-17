import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { semComentarios } from "./fonte";
import { MATRIZ_DE_PERMISSOES, podeFazer } from "../src/lib/permissoes";
import { comOAssistente, MOTIVO_DA_SUPRESSAO } from "../src/lib/funil";
import { lerCodigo } from "./fonte";
import {
  ETAPAS_PADRAO,
  ETAPA_DE_ENTRADA,
  ESCOPOS_DE_MOTIVO,
  MOTIVO_DO_DESFECHO,
  motivoUtilizavel,
  motivosDepoisDeGravar,
  TIPOS_DE_DESFECHO,
  agruparPorMotivo,
  decidirDesfecho,
  valorDoDesfecho,
  ehDescarte,
  ehTipoDeDesfecho,
  ehTipoDeEtapa,
  destinosDoNegocio,
  etapasDoQuadro,
  chaveDaEtapa,
  destinatarioDoAviso,
  ehEscopoDeMotivo,
  emMinutos,
  escopoDoLead,
  espera,
  etapasVisiveis,
  formatarPrazo,
  linkDeConversa,
  mensagemDeAlerta,
  mensagemParaCliente,
  minutosParado,
  motivosVisiveis,
  nivelDeEstagnacao,
  numeroDiscavel,
  ordenarEtapas,
  paradoDesde,
  seloDeRodizio,
  separarPrazo,
  taxaDeConversao,
  validarFunil,
  type EtapaDoFunil,
  type FontesDoDesfecho,
  type LeadDoDesfecho,
  type LinhaDaFilaDoFunil,
  type MotivoDoFunil,
  type TipoDeDesfecho,
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
 * Um motivo do funil. `descartado` é o padrão de propósito: é o tipo que a
 * lista de dois esqueceu, e o que a regra do beco existe para não esquecer.
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
    const erros = validarFunil(
      [
        ...ETAPAS_PADRAO.filter((e) => e.tipo !== "aberta"),
        etapa({ estagnacao_minutos: 2880, transferencia_minutos: 60 }),
      ],
      MOTIVOS_DOS_TRES,
    );
    expect(erros.some((e) => e.includes("menor que o de alerta"))).toBe(true);
  });

  it("recusa transferir sem nunca avisar", () => {
    const erros = validarFunil(
      [
        ...ETAPAS_PADRAO.filter((e) => e.tipo !== "aberta"),
        etapa({ estagnacao_minutos: null, transferencia_minutos: 1440 }),
      ],
      MOTIVOS_DOS_TRES,
    );
    expect(erros.some((e) => e.includes("sem nunca avisar"))).toBe(true);
  });

  it("recusa etapa terminal ativa sem nenhum motivo daquele tipo — o beco", () => {
    // A caixa de desfecho não fecha sem motivo, e desde 16/09 a rota também
    // não. Uma etapa terminal ATIVA cujo tipo não tem NENHUM motivo ativo vira
    // um botão que o card entra e não sai. Antes da exigência o descarte
    // passava reto (perdendo o motivo); agora ele para, e parar em silêncio é
    // pior.
    //
    // Cobrado aqui, na configuração, porque é o único lugar onde quem pode
    // consertar está presente: o Comercial que encontra o beco no card não
    // abre Configurar funil (`permissoes.ts`).
    for (const tipo of TIPOS_DE_DESFECHO) {
      const erros = validarFunil(
        ETAPAS_PADRAO,
        MOTIVOS_DOS_TRES.filter((m) => m.tipo !== tipo),
      );
      expect(erros.length, `${tipo} sem motivo passou batido`).toBeGreaterThan(0);
      expect(erros.join(" ")).toContain(ETAPAS_PADRAO.find((e) => e.tipo === tipo)!.rotulo);
      expect(erros.join(" ")).toContain(`motivo de ${MOTIVO_DO_DESFECHO[tipo]}`);
    }
  });

  it("motivo INATIVO não conta — ele não aparece na caixa", () => {
    // `ModalDeDesfecho` filtra por `m.ativo`, e o GET do kanban também. Um
    // motivo desativado é invisível para quem precisa escolher, então contá-lo
    // daria por resolvido um beco que continua de pé.
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
    // motivo nenhum.
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

  it("motivos desconhecidos (`null`) pulam as regras de motivo em vez de acusar beco", () => {
    // `null` não é lista vazia. A RLS deste projeto bloqueia devolvendo 200,
    // `[]` e `error` nulo — tratar isso como "não há motivo nenhum" acusaria o
    // dono de deixar o funil sem saída num PUT em que ele só mexeu num prazo,
    // e ainda desabilitaria o botão de salvar.
    expect(validarFunil(ETAPAS_PADRAO, null)).toEqual([]);
    // E lista vazia, essa sim, é "não há motivo": três becos.
    expect(validarFunil(ETAPAS_PADRAO, []).length).toBe(TIPOS_DE_DESFECHO.length);
  });

  it("a etapa em que o lead nasce não pode virar desfecho", () => {
    // `leads.situacao` tem `default 'novo'`, as duas rotas públicas do site não
    // mandam situação nenhuma, e o Chatwoot escreve `novo`. O `<select>` de
    // tipo do FunilEditor não abre exceção para ela.
    //
    // Como desfecho, todo lead novo nasceria numa etapa que não é coluna do
    // quadro e sem carimbo de desfecho — fora do quadro e fora da lista de
    // fechados. A captura gravaria normalmente, e ninguém veria o lead.
    expect(ETAPA_DE_ENTRADA).toBe("novo");
    for (const tipo of TIPOS_DE_DESFECHO) {
      const erros = validarFunil(
        ETAPAS_PADRAO.map((e) => (e.chave === ETAPA_DE_ENTRADA ? { ...e, tipo } : e)),
        MOTIVOS_DOS_TRES,
      );
      expect(erros.join(" "), `entrada como ${tipo} passou`).toContain(`"${ETAPA_DE_ENTRADA}"`);
    }
  });

  it("a etapa de entrada também não pode ser desativada nem sair do funil", () => {
    // Tirar da tela é desativar — a rota nunca apaga etapa. Os dois levam todo
    // lead novo para uma coluna arquivada.
    const desativada = validarFunil(
      ETAPAS_PADRAO.map((e) => (e.chave === ETAPA_DE_ENTRADA ? { ...e, ativa: false } : e)),
      MOTIVOS_DOS_TRES,
    );
    expect(desativada.join(" ")).toContain(`"${ETAPA_DE_ENTRADA}"`);

    const ausente = validarFunil(
      ETAPAS_PADRAO.filter((e) => e.chave !== ETAPA_DE_ENTRADA),
      MOTIVOS_DOS_TRES,
    );
    expect(ausente.join(" ")).toContain(`"${ETAPA_DE_ENTRADA}"`);
  });

  it("o funil precisa de uma etapa EM ANDAMENTO ativa — senão o quadro não tem coluna", () => {
    const soDesfechos = ETAPAS_PADRAO.map((e) =>
      e.tipo === "aberta" && e.chave !== ETAPA_DE_ENTRADA ? { ...e, ativa: false } : e,
    ).map((e) => (e.chave === ETAPA_DE_ENTRADA ? { ...e, ativa: false } : e));
    expect(validarFunil(soDesfechos, MOTIVOS_DOS_TRES).join(" ")).toContain("EM ANDAMENTO");
    expect(validarFunil(ETAPAS_PADRAO, MOTIVOS_DOS_TRES).join(" ")).not.toContain("EM ANDAMENTO");
  });

  it("motivo sem rótulo não conta como saída — a rota vai descartá-lo", () => {
    // O `+ motivo` do FunilEditor nasce com `rotulo: ""` e `ativo: true`. Se a
    // tela contasse esse motivo, o erro do beco sumiria ao clicar `+ motivo`,
    // Salvar habilitaria, e a rota — que FILTRA por rótulo antes de gravar —
    // responderia 422 com exatamente a frase que a tela tinha apagado.
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
    // e estoura na hora de fechar.
    expect(chaveDaEtapa("???")).toBe("");
    expect(motivoUtilizavel(motivo({ chave: "", rotulo: "???" }))).toBe(false);
    expect(motivoUtilizavel(motivo())).toBe(true);
  });

  it("dois motivos com a mesma chave são recusados antes de virar 500", () => {
    // `upsert(..., { onConflict: "chave" })` com duas linhas da mesma chave
    // devolve `21000 ON CONFLICT DO UPDATE command cannot affect row a second
    // time` — em inglês, cru, num 500.
    const erros = validarFunil(ETAPAS_PADRAO, [
      ...MOTIVOS_DOS_TRES,
      motivo({ chave: "spam", rotulo: "Spam de novo", tipo: "descartado", ordem: 9 }),
    ]);
    expect(erros.some((e) => e.includes('"spam"'))).toBe(true);
  });

  it("aceita o funil que a migração semeia", () => {
    // A semente do banco precisa passar na validação da tela. Se não passar, o
    // dono abre a configuração e encontra erro sem ter mexido em nada.
    expect(validarFunil(ETAPAS_PADRAO, MOTIVOS_DOS_TRES)).toEqual([]);
  });

  it("a tela Configurar funil valida com os motivos, na mesma conta do PUT", () => {
    // Asserção de fonte, e só da delegação: a REGRA é executada acima e em
    // `tests/funil-config-rota.test.ts`. O que ela impede é a tela voltar a
    // validar só as etapas — o dono salvaria, e o servidor recusaria com uma
    // frase que a tela nunca mostrou.
    const editor = semComentarios(
      readFileSync(join(__dirname, "..", "src", "components", "admin", "FunilEditor.tsx"), "utf8"),
    );
    expect(editor).toContain(
      "validarFunil(etapas.map(paraBanco), motivos.length > 0 ? motivos : null)",
    );
  });

  it("o vocabulário do motivo mora em funil.ts, e a caixa de desfecho o usa", () => {
    // "de perda", e não "de Perdido": `ROTULO_DO_DESFECHO` qualifica o
    // negócio, `MOTIVO_DO_DESFECHO` qualifica o motivo. Duas cópias do mesmo
    // vocabulário é como `descartado` foi esquecido da primeira vez.
    expect(MOTIVO_DO_DESFECHO).toEqual({ ganho: "ganho", perdido: "perda", descartado: "descarte" });
    const caixa = semComentarios(
      readFileSync(join(__dirname, "..", "src", "components", "admin", "ModalDeDesfecho.tsx"), "utf8"),
    );
    expect(caixa).not.toMatch(/vazio:\s*["']/);
    for (const tipo of TIPOS_DE_DESFECHO) {
      expect(caixa).toContain(`MOTIVO_DO_DESFECHO.${tipo}`);
    }
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
    // A âncora tolera as chaves: `if (...) { continue; }` é o mesmo código, e
    // com âncora literal a guarda abaixo reprovaria essa reescrita de estilo.
    const iDescarte = bloco.search(/desfecho === "descartado"\)\s*\{?\s*continue/);
    const iPerda = bloco.indexOf("atual.perdidos += 1");
    // As duas linhas abaixo não são zelo: `indexOf` devolve -1 quando não
    // acha, e -1 é MENOR que qualquer índice válido. Sem elas, a comparação de
    // ordem passa justamente no caso em que devia gritar — o `continue` some
    // do recorte e o descarte volta a ser cobrado do vendedor como perda.
    expect(iDescarte, "o `continue` do descarte sumiu do recorte por vendedor")
      .toBeGreaterThanOrEqual(0);
    expect(iPerda, "a contagem de perdidos sumiu do recorte por vendedor")
      .toBeGreaterThanOrEqual(0);
    expect(iDescarte).toBeLessThan(iPerda);
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
    //
    // Até 16/09 este teste lia a rota atrás de `status: 422` e de
    // `motivoBanco.tipo !== etapa.tipo`. A regra saiu da rota para
    // `decidirDesfecho`, onde ela é EXECUTADA — ver "fechar o negócio exige
    // motivo", mais abaixo, e `tests/leads-gerenciar-desfecho.test.ts`, que
    // roda o PATCH. Aqui sobra o que só a fonte diz: a rota ainda repassa à
    // tela o sinal de que falta escolher.
    const rota = readFileSync(
      join(__dirname, "..", "src", "app", "api", "leads", "gerenciar", "route.ts"),
      "utf-8",
    );
    expect(rota).toContain("decidirDesfecho(");
    expect(rota).toContain("motivo_obrigatorio: decisao.motivoObrigatorio");
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

describe("o relógio só começa quando o assistente sai do circuito", () => {
  /**
   * Decisão do dono em 2026-09-05, depois que o Ney ganhou cenários e passou a
   * conversar antes do consultor: **o SLA só conta depois que o Ney transfere,
   * e toda métrica de controle só conta depois que ele sai do circuito.**
   *
   * Cobrar o vendedor pelo tempo em que o assistente estava atendendo é cobrar
   * por trabalho que não era dele — e, pior, cutucá-lo aos 15 minutos e
   * transferir o lead aos 60 no meio de um pré-atendimento que está indo bem.
   *
   * ---------------------------------------------------------------------------
   * O padrão é o relógio RODANDO
   * ---------------------------------------------------------------------------
   * `com_assistente` é `false` por omissão, de propósito. Hoje o Ney não está
   * ligado a caixa nenhuma: uma regra que pausasse por AUSÊNCIA de informação
   * desligaria o SLA dos catorze leads em produção, em silêncio, e ninguém
   * descobriria até o primeiro cliente reclamar de não ter sido atendido.
   */
  const etapa = {
    chave: "proposta",
    rotulo: "Proposta",
    ordem: 3,
    tipo: "aberta" as const,
    estagnacao_minutos: 15,
    transferencia_minutos: 60,
    protegida: false,
    ativa: true,
  };

  it("lead sem informação de assistente conta como sempre contou", () => {
    // A garantia de que esta entrega não muda nada hoje.
    expect(minutosParado(lead(3), AGORA)).toBe(180);
    expect(nivelDeEstagnacao(lead(3), etapa, AGORA)).toBe("transferir");
  });

  it("com o assistente na conversa, o lead não está parado", () => {
    const comNey = lead(3, { com_assistente: true });

    expect(minutosParado(comNey, AGORA)).toBe(0);
    expect(nivelDeEstagnacao(comNey, etapa, AGORA)).toBe("ok");
  });

  it("nem mesmo com prazo zero na etapa", () => {
    // `estagnacao_minutos: 0` é configurável no painel, e `minutos >= 0` é
    // sempre verdade. Sem a saída explícita, um prazo zero marcaria como
    // estagnado justamente o lead que o motor não vai cutucar.
    const agressiva = { ...etapa, estagnacao_minutos: 0, transferencia_minutos: 0 };

    expect(nivelDeEstagnacao(lead(3, { com_assistente: true }), agressiva, AGORA)).toBe("ok");
    // E continua valendo para quem já está com o humano.
    expect(nivelDeEstagnacao(lead(3), agressiva, AGORA)).toBe("transferir");
  });

  it("depois da transferência, o relógio começa DALI — não da entrada do lead", () => {
    /**
     * O caso que a decisão existe para resolver: o cliente escreveu às 9h, o
     * Ney conversou até as 9h50, o consultor assumiu às 9h50. Às 10h o
     * vendedor está devendo 10 minutos, não 60.
     */
    const transferido = lead(1, {
      humano_assumiu_em: new Date(AGORA - 10 * 60_000).toISOString(),
      com_assistente: false,
    });

    expect(minutosParado(transferido, AGORA)).toBe(10);
    // 10 de 15 já é a faixa de atenção — 60% do prazo, a hora de agir ANTES do
    // alerta. O que importa é que não é "transferir", que é onde ele estaria
    // se o relógio tivesse contado a conversa do assistente junto.
    expect(nivelDeEstagnacao(transferido, etapa, AGORA)).toBe("atencao");
    expect(nivelDeEstagnacao(lead(1), etapa, AGORA)).toBe("transferir");
  });

  it("a transferência não RETROCEDE o relógio de quem já foi atendido depois", () => {
    // `paradoDesde` é o mais recente de todos os toques. Um humano que
    // respondeu depois da transferência é o marco que vale — senão uma
    // transferência antiga reabriria o prazo de um lead recém-atendido.
    const atendidoDepois = lead(5, {
      humano_assumiu_em: new Date(AGORA - 300 * 60_000).toISOString(),
      ultimo_contato_em: new Date(AGORA - 5 * 60_000).toISOString(),
    });

    expect(minutosParado(atendidoDepois, AGORA)).toBe(5);
  });

  it("`comOAssistente` só é verdade com o booleano explícito", () => {
    // Nulo e indefinido são "não sei", e não sei significa relógio rodando.
    expect(comOAssistente(lead(1))).toBe(false);
    expect(comOAssistente(lead(1, { com_assistente: null }))).toBe(false);
    expect(comOAssistente(lead(1, { com_assistente: false }))).toBe(false);
    expect(comOAssistente(lead(1, { com_assistente: true }))).toBe(true);
  });
});

describe("a rota entrega ao painel o que o motor usa para decidir", () => {
  /**
   * O motor (`montar_fila_do_funil`) e a tela (`nivelDeEstagnacao`) precisam
   * responder a mesma coisa sobre o mesmo lead. O db-architect achou a
   * divergência antes de ela existir: a rota selecionava só
   * `chatwoot_conversation_id`, então `com_assistente` nunca chegaria ao
   * `LeadDoFunil` — e no dia em que o Ney entrasse, o banco tiraria o lead da
   * fila enquanto o card continuaria pintando "3 dias parado".
   */
  const rota = lerCodigo("src/app/api/leads/gerenciar/route.ts");

  it("seleciona as colunas do assistente, não só a da conversa", () => {
    expect(rota).toMatch(/com_assistente/);
    expect(rota).toMatch(/humano_assumiu_em/);
  });

  it("e as anexa ao lead que a tela recebe", () => {
    expect(rota).toMatch(/l\.com_assistente = a\?\.comAssistente \?\? false/);
    expect(rota).toMatch(/l\.humano_assumiu_em = a\?\.humanoAssumiuEm \?\? null/);
  });

  it("coluna ausente vira relógio RODANDO, não pausado", () => {
    // A mesma direção segura do `default false` no banco: num ambiente sem a
    // migração, `com_assistente` volta `undefined`, e `undefined` não pode
    // desligar o SLA em silêncio.
    expect(rota).toMatch(/comAssistente: a\.com_assistente === true/);
    expect(rota).toMatch(/l\.com_assistente = a\?\.comAssistente \?\? false/);
  });

  it("usa a MESMA régua de «mais recente» que o banco", () => {
    // `coalesce(iniciado_em, created_at)` decrescente, dos dois lados. Duas
    // réguas seria o motor escolhendo uma conversa e a tela outra.
    expect(rota).toMatch(/b\.iniciado_em \?\? b\.created_at/);
  });

  it("o atendimento sem id de conversa ainda conta para o relógio", () => {
    // O `not is null` no `chatwoot_conversation_id` saiu do filtro: um
    // atendimento pode existir com o assistente conversando antes de a
    // conversa ter id espelhado, e filtrá-lo apagaria o único sinal que pausa.
    expect(rota).not.toMatch(/\.not\("chatwoot_conversation_id", "is", null\)/);
  });
});

describe("escopo do motivo — quem quer vender não perde pelos motivos de quem quer comprar", () => {
  /**
   * Os canais que o site REALMENTE escreve hoje, colhidos um a um do código:
   *
   *   api/avaliacao/route.ts ....... "Avaliação"
   *   AutoAvaliacao.tsx ............ "Appraisal Chat"
   *   ContatoClientWrapper.tsx ..... "Formulário Contato"
   *   LeadPopup.tsx ................ "Lead Popup"
   *   CarMatch.tsx ................. "Garagem Match Profiler"
   *   app/test/page.tsx ............ "CarMatch Recommendations"
   *   PDPClientWrapper.tsx ......... as cinco de `setActiveChannel`
   *   api/leads/route.ts ........... "N/A" e "site", os dois fallbacks
   *
   * É este teste que pega colisão de substring. "WhatsApp Usado na Troca" é o
   * quase-acerto que justifica a lista existir: é sobre avaliar um usado, mas
   * o lead quer COMPRAR — e para ele o motivo certo é `avaliacao_do_usado`,
   * que vive no escopo de compra.
   */
  const CANAIS_DE_COMPRA = [
    "Formulário Contato",
    "Lead Popup",
    "Garagem Match Profiler",
    "CarMatch Recommendations",
    "WhatsApp Proposta",
    "WhatsApp Dúvidas",
    "WhatsApp Usado na Troca",
    "Agendamento Test-Drive",
    "Simulação de Financiamento",
    "N/A",
    "site",
  ];

  const CANAIS_DE_AVALIACAO = ["Avaliação", "Appraisal Chat"];

  it.each(CANAIS_DE_COMPRA)("o canal %s é negócio de compra", (canal) => {
    expect(escopoDoLead(canal)).toBe("compra");
  });

  it.each(CANAIS_DE_AVALIACAO)("o canal %s é negócio de avaliação", (canal) => {
    expect(escopoDoLead(canal)).toBe("avaliacao");
  });

  it("canal ausente ou vazio cai no funil padrão, nunca em exceção", () => {
    expect(escopoDoLead(null)).toBe("compra");
    expect(escopoDoLead(undefined)).toBe("compra");
    expect(escopoDoLead("")).toBe("compra");
    expect(escopoDoLead("   ")).toBe("compra");
    expect(escopoDoLead("canal que ninguém escreveu ainda")).toBe("compra");
  });

  it("reconhece a avaliação escrita de qualquer jeito", () => {
    // O canal é texto livre no corpo do POST. Acento e caixa não podem
    // decidir qual lista o vendedor vê.
    for (const canal of [
      "AVALIAÇÃO",
      "avaliacao",
      "Avaliacao",
      "  Avaliação  ",
      "Avaliação WhatsApp",
      "appraisal chat",
    ]) {
      expect(escopoDoLead(canal)).toBe("avaliacao");
    }
  });

  it("ehEscopoDeMotivo recusa o desconhecido em vez de converter", () => {
    expect(ehEscopoDeMotivo("compra")).toBe(true);
    expect(ehEscopoDeMotivo("avaliacao")).toBe(true);
    expect(ehEscopoDeMotivo("ambos")).toBe(true);
    for (const lixo of ["venda", "COMPRA", "Avaliação", "", null, undefined, 1, {}]) {
      expect(ehEscopoDeMotivo(lixo)).toBe(false);
    }
  });

  it("a rota de configuração recusa escopo desconhecido, não converte", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "src", "app", "api", "funil", "config", "route.ts"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    // O guarda tem que ser chamado, e o escopo tem que chegar ao upsert.
    expect(fonte).toContain("ehEscopoDeMotivo");
    expect(fonte).toMatch(/escopo:/);

    // E não pode existir ternário de fallback sobre escopo. É exatamente o
    // defeito que o `funil.ts` já documenta: o `m.tipo === "ganho" ? … : …`
    // que, no dia em que entrou o terceiro desfecho, converteria todo motivo
    // de descarte em motivo de perda, sem erro e sem aviso.
    expect(fonte).not.toMatch(/escopo\s*===\s*["'][a-z]+["']\s*\?/);
  });

  describe("motivosVisiveis", () => {
    const m = (
      chave: string,
      escopo: "compra" | "avaliacao" | "ambos" | undefined,
      extra: Partial<MotivoDoFunil> = {},
    ): MotivoDoFunil => ({
      chave,
      rotulo: chave,
      tipo: "perdido",
      ordem: 1,
      ativo: true,
      ...(escopo ? { escopo } : {}),
      ...extra,
    });

    const LISTA: MotivoDoFunil[] = [
      m("credito_reprovado", "compra"),
      m("recusou_consignacao", "avaliacao"),
      m("sem_resposta", "ambos"),
      m("a_vista", "ambos", { tipo: "ganho" }),
    ];

    it("esconde de cada lado o que é do outro", () => {
      const naAvaliacao = motivosVisiveis(LISTA, "perdido", "avaliacao").map((x) => x.chave);
      expect(naAvaliacao).toEqual(["recusou_consignacao", "sem_resposta"]);

      const naCompra = motivosVisiveis(LISTA, "perdido", "compra").map((x) => x.chave);
      expect(naCompra).toEqual(["credito_reprovado", "sem_resposta"]);
    });

    it("continua respeitando o tipo do desfecho", () => {
      expect(motivosVisiveis(LISTA, "ganho", "avaliacao").map((x) => x.chave)).toEqual(["a_vista"]);
    });

    it("motivo desativado não volta por causa do escopo", () => {
      const lista = [m("recusou_consignacao", "avaliacao", { ativo: false })];
      expect(motivosVisiveis(lista, "perdido", "avaliacao")).toEqual([]);
    });

    it("ordena por ordem, como a caixa desenha", () => {
      const lista = [
        m("segundo", "avaliacao", { ordem: 2 }),
        m("primeiro", "avaliacao", { ordem: 1 }),
      ];
      expect(motivosVisiveis(lista, "perdido", "avaliacao").map((x) => x.chave)).toEqual([
        "primeiro",
        "segundo",
      ]);
    });

    it("motivo sem escopo vale para os dois — banco não migrado não esvazia a caixa", () => {
      const lista = [m("legado", undefined)];
      expect(motivosVisiveis(lista, "perdido", "compra").map((x) => x.chave)).toEqual(["legado"]);
      expect(motivosVisiveis(lista, "perdido", "avaliacao").map((x) => x.chave)).toEqual(["legado"]);
    });

    it("lista escopada vazia devolve a lista cheia do tipo, nunca vazia", () => {
      // Card preso é pior que motivo fora de contexto: a caixa é o único
      // caminho para tirar o lead do quadro.
      const soDeCompra = [m("credito_reprovado", "compra"), m("preco", "compra", { ordem: 2 })];
      expect(motivosVisiveis(soDeCompra, "perdido", "avaliacao").map((x) => x.chave)).toEqual([
        "credito_reprovado",
        "preco",
      ]);
    });

    it("a queda de segurança não ressuscita desativado nem troca de tipo", () => {
      const lista = [
        m("credito_reprovado", "compra"),
        m("desativado", "compra", { ativo: false }),
        m("a_vista", "compra", { tipo: "ganho" }),
      ];
      expect(motivosVisiveis(lista, "perdido", "avaliacao").map((x) => x.chave)).toEqual([
        "credito_reprovado",
      ]);
    });
  });

  /**
   * Asserção de FONTE, no padrão de `turnstile-estabilidade` e
   * `nomenclatura-estoque`.
   *
   * Testar `motivosVisiveis` isolada não prova que a CAIXA a chama — mutar a
   * função e ver o teste vermelho só prova a função. O ponto de chamada é o
   * que apodrece: basta alguém reescrever o `useMemo` e o escopo deixa de
   * valer, sem teste nenhum ficar vermelho.
   *
   * O repositório não tem jsdom nem plugin React (`vitest.config.ts` roda em
   * `environment: "node"` e o `include` nem pega `.tsx`), então montar o
   * componente exigiria infraestrutura nova. Esta é a prova disponível hoje —
   * e o dia em que o render existir, este teste vira teste de render.
   */
  it("a caixa de desfecho pede a lista a motivosVisiveis, e não filtra por conta própria", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "src", "components", "admin", "ModalDeDesfecho.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    expect(fonte).toContain("motivosVisiveis(");
    // Não basta chamar `escopoDoLead` — tem que ler `lead.canal`. Uma
    // asserção que só procurasse "escopoDoLead(" ficaria verde mesmo se o
    // campo lido virasse `lead.interesse` por engano: a função ainda seria
    // chamada, só que com o dado errado, e todo lead voltaria a cair em
    // `compra` sem nenhum teste acusar.
    expect(fonte).toContain("escopoDoLead(lead.canal)");

    // O filtro velho não pode ter sobrevivido ao lado do novo: dois caminhos
    // para a mesma lista é como o escopo volta a ser ignorado em silêncio.
    expect(fonte).not.toMatch(/m\.tipo\s*===\s*etapa\.tipo/);
  });

  it("a tela Configurar funil deixa escolher o escopo, e só na coluna Perdido", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "src", "components", "admin", "FunilEditor.tsx"),
      "utf8",
    ).replace(/\r\n/g, "\n");

    // As três opções escritas como quem opera lê, não como o banco guarda.
    expect(fonte).toContain("Quem quer comprar");
    expect(fonte).toContain("Quem quer vender");

    // O seletor é condicional: descarte é todo `ambos` por decisão do dono, e
    // um seletor com um valor válido só é ruído na tela. O ganho ganhou escopo
    // em 20260916170000 (pagamento para compra, "Compramos o carro do cliente"
    // para avaliação), mas por migração: esta tela ainda não edita escopo de
    // ganho, e motivo de ganho criado aqui nasce `ambos`.
    //
    // `toContain` de string LITERAL, não regex: `/tipo\s*===\s*"perdido"/`
    // também casa com `e.tipo === "perdido"` de `comoFunciona()`, um trecho
    // pré-existente e sem relação com o seletor — a regex ficava verde mesmo
    // com o `<select>` renderizando nas três colunas, a regressão que esta
    // asserção existe para travar. Âncora na forma exata do guard novo.
    expect(fonte).toContain('{tipo === "perdido" && (');

    // Motivo novo nasce em `ambos` — a mesma posição segura do default da
    // coluna. Nascer em `compra` esconderia do funil de avaliação um motivo
    // que a pessoa acabou de criar.
    expect(fonte).toMatch(/escopo:\s*"ambos"/);

    // Cada valor de `ESCOPOS_DE_MOTIVO` precisa virar uma <option> na tela —
    // varrendo a CONSTANTE, e não os três rótulos escritos à mão, porque é
    // isso que faz a asserção crescer sozinha se o vocabulário crescer. Uma
    // lista fixa ("compra", "avaliacao", "ambos") continuaria verde no dia em
    // que um quarto escopo entrasse em `ESCOPOS_DE_MOTIVO` e no CHECK do
    // banco sem opção nenhuma aqui — o operador veria um valor que o sistema
    // aceita e a tela não oferece.
    for (const escopo of ESCOPOS_DE_MOTIVO) {
      expect(fonte, `falta <option value="${escopo}"> no seletor de escopo`).toContain(
        `value="${escopo}"`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Fechar o negócio exige motivo — na tela e na API (decisão do dono, 16/09)
// ---------------------------------------------------------------------------

/**
 * A regra da porta de trás, CHAMADA com dublês do banco.
 *
 * A versão que morava no PATCH perguntava `tipo === "ganho" || tipo ===
 * "perdido"`: o descarte nunca pediu motivo, na tela nem na rota, e a única
 * prova possível ali era ler a condição de um `if` — que um desvio logo
 * abaixo do trecho lido fura com a suíte verde. `decidirDesfecho` junta a
 * regra num lugar executável; `tests/leads-gerenciar-desfecho.test.ts` roda o
 * PATCH de verdade para provar que a rota obedece a ela.
 */
describe("fechar o negócio exige motivo — a regra, executada", () => {
  const TERMINAIS = ETAPAS_PADRAO.filter((e) => ehTipoDeDesfecho(e.tipo));
  const ABERTAS = ETAPAS_PADRAO.filter((e) => !ehTipoDeDesfecho(e.tipo));
  const etapaDe = (tipo: TipoDeDesfecho) => TERMINAIS.find((e) => e.tipo === tipo)!;

  const m = (
    chave: string,
    tipo: MotivoDoFunil["tipo"],
    extra: Partial<MotivoDoFunil> = {},
  ): MotivoDoFunil => ({ chave, rotulo: chave, tipo, ordem: 1, ativo: true, ...extra });

  /** Um motivo de cada situação que a regra distingue. */
  const MOTIVOS: MotivoDoFunil[] = [
    m("a_vista", "ganho", { rotulo: "À vista" }),
    m("preco", "perdido", { rotulo: "Preço acima do que o cliente queria pagar", escopo: "compra" }),
    m("recusou_consignacao", "perdido", {
      rotulo: "Não aceitou deixar em consignação",
      escopo: "avaliacao",
    }),
    m("sem_resposta", "perdido", { rotulo: "Sem retorno do cliente", escopo: "ambos" }),
    m("motivo_aposentado", "perdido", { rotulo: "Motivo aposentado", ativo: false }),
    m("spam", "descartado", { rotulo: "Spam ou robô" }),
  ];

  const DE_COMPRA: LeadDoDesfecho = { situacao: "proposta", canal: "Formulário Contato" };
  const DE_AVALIACAO: LeadDoDesfecho = { situacao: "novo", canal: "Avaliação" };

  /** Dublês do banco. Contam o que foi lido. */
  function banco(lead: LeadDoDesfecho | null, motivos: MotivoDoFunil[] | null = MOTIVOS) {
    const lidos: string[] = [];
    const fontes: FontesDoDesfecho = {
      lerLead: async () => {
        lidos.push("lead");
        return lead;
      },
      lerMotivos: async () => {
        lidos.push("motivos");
        return motivos;
      },
    };
    return { fontes, lidos };
  }

  it("exige motivo nos TRÊS desfechos, com 400 e a frase pronta para a tela", async () => {
    // A semente tem os três. Se um sumir dela, o laço deixa de prová-lo calado.
    expect(TERMINAIS.map((e) => e.tipo)).toEqual([...TIPOS_DE_DESFECHO]);

    for (const etapa of TERMINAIS) {
      for (const corpo of [{}, { desfecho_motivo: "   " }, { desfecho_motivo: 42 }]) {
        const d = await decidirDesfecho(etapa, corpo, banco(DE_COMPRA).fontes);
        expect(d.ok, `${etapa.chave} passou com ${JSON.stringify(corpo)}`).toBe(false);
        if (!d.ok) {
          expect(d.status).toBe(400);
          expect(d.motivoObrigatorio).toBe(true);
          expect(d.erro).toContain(etapa.rotulo);
        }
      }
    }
  });

  it("etapa em andamento não cobra nada — e nem vai ao banco", async () => {
    for (const etapa of ABERTAS) {
      const { fontes, lidos } = banco(DE_COMPRA);
      expect(await decidirDesfecho(etapa, { desfecho_motivo: "spam" }, fontes)).toEqual({
        ok: true,
        campos: {},
      });
      expect(lidos, `${etapa.chave} leu o banco à toa`).toEqual([]);
    }
    // Etapa desconhecida (migração pendente) segue o comportamento antigo.
    expect(await decidirDesfecho(null, {}, banco(null).fontes)).toEqual({ ok: true, campos: {} });
  });

  it("recusa motivo de outro TIPO — descarte com motivo de perda", async () => {
    // A chave estrangeira garante que a chave existe, nunca que o tipo casa.
    const d = await decidirDesfecho(
      etapaDe("descartado"),
      { desfecho_motivo: "preco" },
      banco(DE_COMPRA).fontes,
    );
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.status).toBe(400);
      expect(d.motivoObrigatorio).toBe(false);
      expect(d.erro).toContain(`é de ${MOTIVO_DO_DESFECHO.perdido}`);
      expect(d.erro).toContain(`motivo de ${MOTIVO_DO_DESFECHO.descartado}`);
    }
  });

  it("recusa motivo inexistente e motivo desativado", async () => {
    const perdido = etapaDe("perdido");

    const inventado = await decidirDesfecho(
      perdido,
      { desfecho_motivo: "inventado" },
      banco(DE_COMPRA).fontes,
    );
    expect(inventado.ok).toBe(false);
    if (!inventado.ok) {
      expect(inventado.status).toBe(400);
      expect(inventado.erro).toContain("inventado");
    }

    // A caixa não oferece desativado; a rota não pode aceitar o que a tela esconde.
    const aposentado = await decidirDesfecho(
      perdido,
      { desfecho_motivo: "motivo_aposentado" },
      banco(DE_COMPRA).fontes,
    );
    expect(aposentado.ok).toBe(false);
    if (!aposentado.ok) {
      expect(aposentado.status).toBe(400);
      expect(aposentado.erro).toContain("desativado");
    }
  });

  it("recusa motivo cujo ESCOPO não vale para o lead, e aceita o certo e o `ambos`", async () => {
    const perdido = etapaDe("perdido");

    const deCompraNaAvaliacao = await decidirDesfecho(
      perdido,
      { desfecho_motivo: "preco" },
      banco(DE_AVALIACAO).fontes,
    );
    expect(deCompraNaAvaliacao.ok).toBe(false);
    if (!deCompraNaAvaliacao.ok) {
      expect(deCompraNaAvaliacao.status).toBe(400);
      expect(deCompraNaAvaliacao.erro).toContain("comprar");
      expect(deCompraNaAvaliacao.erro).toContain('"Avaliação"');
    }

    const deAvaliacaoNaCompra = await decidirDesfecho(
      perdido,
      { desfecho_motivo: "recusou_consignacao" },
      banco(DE_COMPRA).fontes,
    );
    expect(deAvaliacaoNaCompra.ok).toBe(false);

    const certo = (motivo: string, lead: LeadDoDesfecho) =>
      decidirDesfecho(perdido, { desfecho_motivo: motivo }, banco(lead).fontes);
    expect((await certo("recusou_consignacao", DE_AVALIACAO)).ok).toBe(true);
    expect((await certo("preco", DE_COMPRA)).ok).toBe(true);
    // `ambos` é o motivo que vale para todo mundo (#94) — nos dois lados.
    expect((await certo("sem_resposta", DE_AVALIACAO)).ok).toBe(true);
    expect((await certo("sem_resposta", DE_COMPRA)).ok).toBe(true);
  });

  it("a API aceita EXATAMENTE o que a caixa oferece — canal a canal, desfecho a desfecho", async () => {
    // A régua do escopo é a do #94, e não uma segunda escrita: o lead é
    // `escopoDoLead(canal)`, e o que vale para ele é `motivosVisiveis` —
    // inclusive a queda para a lista cheia quando o escopo não tem motivo
    // ativo. Se a API tivesse régua própria, a caixa ofereceria um motivo que
    // o servidor recusa, e o card ficaria preso; ou o servidor aceitaria o
    // que a caixa esconde, e o escopo valeria só para quem usa a tela.
    //
    // A segunda lista não tem motivo de perda para quem vende: é a queda.
    const listas: MotivoDoFunil[][] = [
      MOTIVOS,
      MOTIVOS.filter((x) => !(x.tipo === "perdido" && x.escopo !== "compra")),
    ];
    const canais = ["Formulário Contato", "Avaliação", "Appraisal Chat", null];

    let comparados = 0;
    for (const motivos of listas) {
      for (const canal of canais) {
        for (const etapa of TERMINAIS) {
          const tipo = etapa.tipo as TipoDeDesfecho;
          const oferecidos = motivosVisiveis(motivos, tipo, escopoDoLead(canal)).map((x) => x.chave);
          for (const x of motivos) {
            const d = await decidirDesfecho(
              etapa,
              { desfecho_motivo: x.chave },
              banco({ situacao: "novo", canal }, motivos).fontes,
            );
            expect(d.ok, `${canal ?? "sem canal"} · ${etapa.chave} · ${x.chave}`).toBe(
              oferecidos.includes(x.chave),
            );
            comparados++;
          }
        }
      }
    }
    // A queda precisa ter sido exercitada: lead de avaliação, só motivo de compra.
    expect(
      motivosVisiveis(listas[1], "perdido", "avaliacao").map((x) => x.chave),
    ).toEqual(["preco"]);
    expect(comparados).toBeGreaterThan(100);
  });

  it("só na TRANSIÇÃO: o lead que já está fechado não é cobrado de novo", async () => {
    // Produção tem descartes fechados antes de a caixa perguntar o motivo.
    // Cobrar do passado travaria a edição do card sem ninguém ter errado.
    const descartado = etapaDe("descartado");
    const legado: LeadDoDesfecho = { situacao: "descartado", canal: null };

    expect(await decidirDesfecho(descartado, {}, banco(legado).fontes)).toEqual({
      ok: true,
      campos: {},
    });

    // Motivo informado é conferido sempre — dado ruim não entra por esta porta.
    const ruim = await decidirDesfecho(descartado, { desfecho_motivo: "preco" }, banco(legado).fontes);
    expect(ruim.ok).toBe(false);

    // E trocar de um desfecho para OUTRO é transição.
    const perdidoViraDescarte = await decidirDesfecho(
      descartado,
      {},
      banco({ situacao: "perdido", canal: null }).fontes,
    );
    expect(perdidoViraDescarte.ok).toBe(false);
  });

  it("lead ilegível: cobra o motivo como transição, e não inventa escopo", async () => {
    const perdido = etapaDe("perdido");
    expect((await decidirDesfecho(perdido, {}, banco(null).fontes)).ok).toBe(false);
    // Sem o canal, recusar o motivo de avaliação seria presumir "compra".
    const semCanal = await decidirDesfecho(
      perdido,
      { desfecho_motivo: "recusou_consignacao" },
      banco(null).fontes,
    );
    expect(semCanal.ok).toBe(true);
  });

  it("motivos ilegíveis: não grava, e a frase culpa a leitura, não a escolha", async () => {
    const d = await decidirDesfecho(
      etapaDe("perdido"),
      { desfecho_motivo: "preco" },
      banco(DE_COMPRA, null).fontes,
    );
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.status).toBe(500);
      expect(d.erro).not.toContain("desconhecido");
    }
  });

  it("com o motivo certo devolve os campos, com valor e nota normalizados", async () => {
    const d = await decidirDesfecho(
      etapaDe("ganho"),
      { desfecho_motivo: " a_vista ", desfecho_valor: "72.500,50", desfecho_nota: "  " },
      banco(DE_COMPRA).fontes,
    );
    expect(d).toEqual({
      ok: true,
      campos: { desfecho_motivo: "a_vista", desfecho_valor: 72500.5, desfecho_nota: null },
    });
    // Vazio e zero são nulo: zero seria uma venda de R$ 0.
    expect(valorDoDesfecho("")).toBeNull();
    expect(valorDoDesfecho(0)).toBeNull();
    expect(valorDoDesfecho("1.000")).toBe(1000);
  });
});

/**
 * `src/lib/funil.ts` já escreveu esta lição em prosa, antes de ela custar
 * alguma coisa: um `m.tipo === "ganho" ? "ganho" : "perdido"` estava certo
 * enquanto havia dois desfechos e passaria a converter em silêncio no dia em
 * que entrasse o terceiro.
 *
 * O defeito aconteceu assim mesmo, em outra forma — não o ternário, a
 * disjunção. `mover` no kanban e o PATCH de `/api/leads/gerenciar`
 * perguntavam `tipo === "ganho" || tipo === "perdido"`, uma pergunta que
 * nasceu certa com dois desfechos e ficou errada em 2026-08-28, quando
 * `descartado` entrou. Nenhum erro, nenhum aviso: o card ia direto para a
 * etapa de descarte, o gatilho carimbava `desfecho = 'descartado'` e o MOTIVO
 * ficava nulo — os seis motivos de descarte nunca eram coletados.
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

  it("a rota delega a decisão em vez de reimplementá-la", () => {
    // A regra é provada executando `decidirDesfecho` (acima) e o PATCH
    // (`tests/leads-gerenciar-desfecho.test.ts`). O que esta asserção de
    // fonte ainda vale: impedir que alguém traga a regra de volta para dentro
    // do PATCH, onde ela volta a ser testável só por leitura.
    const rota = semComentarios(
      readFileSync(
        join(__dirname, "..", "src", "app", "api", "leads", "gerenciar", "route.ts"),
        "utf8",
      ),
    );
    const patch = trecho(rota, "export async function PATCH", "export async function DELETE");

    expect(patch).toContain("decidirDesfecho(");
    expect(
      patch,
      "a decisão do desfecho voltou para dentro do PATCH — lá ela só se prova lendo",
    ).not.toMatch(/[!=]==\s*"(ganho|perdido|descartado|aberta)"/);
  });

  it("nenhum arquivo de `src/` pergunta pelo desfecho com uma lista de dois", () => {
    // A trava de classe. As de cima e a de `leads-kanban.test.ts` seguram os
    // dois pontos conhecidos; esta segura o próximo, que pelo histórico deste
    // arquivo vai existir.
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
    // A distinção separa a pergunta errada da conta certa. Decidir se uma
    // ETAPA é terminal com dois nomes é o defeito: `funil.ts` tem o predicado,
    // e a lista escrita à mão esquece o tipo que chegar depois. Já contar
    // quantos LEADS têm `desfecho` ganho ou perdido é a definição da taxa de
    // conversão — ali a dupla é obrigatória, e o descarte precisa ficar fora.
    //
    // Espaço em branco normalizado: uma condição um pouco mais longa o
    // prettier quebra, e a busca não pode depender disso.
    const PARES = [
      /\.tipo\s*===\s*"ganho"\s*\|\|[^;{}]{0,60}\.tipo\s*===\s*"perdido"/,
      /\.tipo\s*===\s*"perdido"\s*\|\|[^;{}]{0,60}\.tipo\s*===\s*"ganho"/,
    ];

    // Junta todos antes de cobrar: um `expect` dentro do laço estoura no
    // primeiro e esconde os outros.
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

/**
 * Diretriz do dono (16/09): a máquina de conversão vem primeiro, e nenhuma
 * captura de lead do site pode ser recusada ou atrasada por esta regra.
 *
 * Sem trava no banco, a regra só existe em duas funções — `decidirDesfecho`
 * (o PATCH do painel) e `criarMover` (o kanban). A captura fica intocada
 * enquanto nenhum caminho que ELA percorre chega a uma das duas, nem escolhe
 * etapa para o lead: quem decide onde o lead nasce é o `default` de
 * `leads.situacao`. O Chatwoot é o único que escreve a etapa, e escreve a de
 * entrada.
 *
 * Asserção de fonte, e barata, de propósito: o que se afirma aqui é um grafo
 * de import e um campo ausente, não a condição de um `if`.
 */
describe("a captura do site não passa pela regra do desfecho", () => {
  const RAIZ = join(__dirname, "..");
  const CAPTURAS = [
    join("src", "app", "api", "leads", "route.ts"),
    join("src", "app", "api", "avaliacao", "route.ts"),
    join("src", "app", "api", "chatwoot", "eventos", "route.ts"),
  ];

  /** Os módulos do repositório que um arquivo alcança por import, ele incluído. */
  function alcancados(inicio: string): string[] {
    const vistos = new Set<string>();
    const fila = [join(RAIZ, inicio)];
    while (fila.length > 0) {
      const arquivo = fila.pop()!;
      if (vistos.has(arquivo)) continue;
      vistos.add(arquivo);
      const fonte = semComentarios(readFileSync(arquivo, "utf8"));
      const alvos = fonte.matchAll(
        /(?:\bfrom\s*|\bimport\s*\(?\s*)["']((?:\.{1,2}|@)\/[^"']+)["']/g,
      );
      for (const [, alvo] of alvos) {
        const base = alvo.startsWith("@/")
          ? join(RAIZ, "src", alvo.slice(2))
          : join(dirname(arquivo), alvo);
        const achado = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), base].find(
          (c) => existsSync(c) && statSync(c).isFile(),
        );
        if (achado) fila.push(achado);
      }
    }
    return [...vistos];
  }

  it("nenhum módulo que a captura alcança chama a regra do desfecho", () => {
    for (const rota of CAPTURAS) {
      const modulos = alcancados(rota);
      // Sem isto, um erro de caminho deixaria o grafo vazio e o teste verde.
      expect(modulos.length, `${rota} não alcançou nenhum módulo`).toBeGreaterThan(2);

      const infratores = modulos.filter((arquivo) => {
        const codigo = semComentarios(readFileSync(arquivo, "utf8"));
        return (
          /(?<!function\s)\b(decidirDesfecho|criarMover)\s*\(/.test(codigo) ||
          /funil_motivos|motivo_obrigatorio/.test(codigo)
        );
      });
      expect(
        infratores.map((a) => relative(RAIZ, a).split(sep).join("/")),
        `${rota} passa pela regra do desfecho — a captura não pode ser recusada por ela`,
      ).toEqual([]);
    }
  });

  it("o formulário e a avaliação não escolhem etapa; o Chatwoot escolhe a de entrada", () => {
    for (const rota of CAPTURAS.slice(0, 2)) {
      const codigo = semComentarios(readFileSync(join(RAIZ, rota), "utf8"));
      expect(codigo, `${rota} passou a gravar etapa`).not.toMatch(/\bsituacao\b/);
      expect(codigo, `${rota} passou a gravar desfecho`).not.toMatch(/\bdesfecho/);
    }

    const chatwoot = semComentarios(readFileSync(join(RAIZ, CAPTURAS[2]), "utf8"));
    const etapas = [...chatwoot.matchAll(/\bsituacao:\s*("[^"]*")/g)].map((x) => x[1]);
    expect(etapas).toEqual(['"novo"']);
    expect(ETAPAS_PADRAO.find((e) => e.chave === "novo")?.tipo).toBe("aberta");
  });
});

/**
 * Motivos de ganho por escopo — decisão do dono em 16/09, migração
 * `20260916170000`.
 *
 * O #94 dividiu só a perda ("o ganho segue compartilhado"). Os quatro motivos
 * de ganho são forma de pagamento de quem COMPRA; num lead de avaliação o
 * ganho é a loja comprar o carro da pessoa. A migração põe os quatro em
 * `compra` e cria `compramos_o_carro` em `avaliacao`.
 *
 * O banco não roda aqui. O que se prova: que a migração escreve o que o dono
 * decidiu — e só dados —, e que o estado que ela deixa passa pela regra do
 * beco e pela régua de escopo da API sem prender card nenhum.
 */
describe("motivos de ganho por escopo — o estado que 20260916170000 deixa", () => {
  const SQL_GANHO = readFileSync(
    join(__dirname, "..", "supabase", "migrations", "20260916170000_motivos_de_ganho_por_escopo.sql"),
    "utf8",
  );
  const ganhoExecutavel = SQL_GANHO.split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  const g = (
    chave: string,
    rotulo: string,
    ordem: number,
    escopo: "compra" | "avaliacao",
  ): MotivoDoFunil => ({ chave, rotulo, tipo: "ganho", ordem, ativo: true, escopo });

  /** Os motivos de ganho como a migração os deixa em produção. */
  const GANHO_DEPOIS: MotivoDoFunil[] = [
    g("a_vista", "À vista", 1, "compra"),
    g("financiado", "Financiado", 2, "compra"),
    g("com_troca", "Com carro na troca", 3, "compra"),
    g("consorcio", "Consórcio ou carta contemplada", 4, "compra"),
    g("compramos_o_carro", "Compramos o carro do cliente", 5, "avaliacao"),
  ];
  const DE_PAGAMENTO = ["a_vista", "financiado", "com_troca", "consorcio"];
  const MOTIVOS_DEPOIS = [...GANHO_DEPOIS, ...MOTIVOS_DOS_TRES.filter((m) => m.tipo !== "ganho")];
  const GANHO = ETAPAS_PADRAO.find((e) => e.tipo === "ganho")!;

  const fontes = (canal: string, motivos: MotivoDoFunil[] = MOTIVOS_DEPOIS): FontesDoDesfecho => ({
    lerLead: async () => ({ situacao: "novo", canal }),
    lerMotivos: async () => motivos,
  });

  it("a migração escreve o que o dono decidiu, com os escopos do CHECK, e só dados", () => {
    expect(ESCOPOS_DE_MOTIVO).toContain("compra");
    expect(ESCOPOS_DE_MOTIVO).toContain("avaliacao");

    expect(ganhoExecutavel).toMatch(
      /update public\.funil_motivos\s+set escopo = 'compra'\s+where tipo = 'ganho'\s+and chave in \('a_vista', 'financiado', 'com_troca', 'consorcio'\);/,
    );
    expect(ganhoExecutavel).toContain(
      "select 'compramos_o_carro', 'Compramos o carro do cliente', 'ganho', 5, true, 'avaliacao'",
    );
    // Idempotente: reexecutar não duplica nem sobrescreve.
    expect(ganhoExecutavel).toMatch(
      /where not exists \(\s*select 1 from public\.funil_motivos where chave = 'compramos_o_carro'\s*\)/,
    );

    // Sem trava no banco, por decisão do dono: nada de gatilho, função ou
    // constraint — só `update` e `insert` em `funil_motivos`.
    expect(ganhoExecutavel).not.toMatch(
      /create\s+(or\s+replace\s+)?(function|trigger)|alter\s+table|constraint|delete\s+from/i,
    );

    // A autoconferência existe e fala, e o rodapé do livro-razão é a última coisa.
    expect(ganhoExecutavel).toContain("ACEITE FALHOU");
    expect(ganhoExecutavel).toContain("Aceite verificado");
    expect(ganhoExecutavel.trimEnd()).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s+values \('20260916170000', 'motivos_de_ganho_por_escopo'\)\s+on conflict \(version\) do nothing;$/,
    );

    // E o que esta suíte usa como "depois" é o que a migração escreve.
    for (const chave of DE_PAGAMENTO) expect(ganhoExecutavel).toContain(`'${chave}'`);
  });

  it("o funil com o ganho dividido não tem beco", () => {
    expect(validarFunil(ETAPAS_PADRAO, MOTIVOS_DEPOIS)).toEqual([]);
  });

  it("quem vende vê só 'Compramos o carro do cliente', e a API recusa forma de pagamento", async () => {
    for (const canal of ["Avaliação", "Appraisal Chat"]) {
      expect(motivosVisiveis(MOTIVOS_DEPOIS, "ganho", escopoDoLead(canal)).map((m) => m.chave)).toEqual([
        "compramos_o_carro",
      ]);
      const certo = await decidirDesfecho(GANHO, { desfecho_motivo: "compramos_o_carro" }, fontes(canal));
      expect(certo.ok, `${canal} não fechou com compramos_o_carro`).toBe(true);
      for (const chave of DE_PAGAMENTO) {
        const d = await decidirDesfecho(GANHO, { desfecho_motivo: chave }, fontes(canal));
        expect(d.ok, `${canal} fechou com ${chave}`).toBe(false);
      }
    }
  });

  it("quem compra vê as quatro formas de pagamento, em ordem, e a API recusa o de avaliação", async () => {
    for (const canal of ["Formulário Contato", "WhatsApp Usado na Troca"]) {
      expect(motivosVisiveis(MOTIVOS_DEPOIS, "ganho", escopoDoLead(canal)).map((m) => m.chave)).toEqual(
        DE_PAGAMENTO,
      );
      for (const chave of DE_PAGAMENTO) {
        const d = await decidirDesfecho(GANHO, { desfecho_motivo: chave }, fontes(canal));
        expect(d.ok, `${canal} não fechou com ${chave}`).toBe(true);
      }
      const deAvaliacao = await decidirDesfecho(
        GANHO,
        { desfecho_motivo: "compramos_o_carro" },
        fontes(canal),
      );
      expect(deAvaliacao.ok, `${canal} fechou com compramos_o_carro`).toBe(false);
    }
  });

  it("desativado o motivo de avaliação, o card não prende: a caixa cai na lista cheia e a API aceita", async () => {
    const semOdeAvaliacao = MOTIVOS_DEPOIS.map((m) =>
      m.chave === "compramos_o_carro" ? { ...m, ativo: false } : m,
    );
    expect(validarFunil(ETAPAS_PADRAO, semOdeAvaliacao)).toEqual([]);
    expect(motivosVisiveis(semOdeAvaliacao, "ganho", "avaliacao").map((m) => m.chave)).toEqual(
      DE_PAGAMENTO,
    );
    const d = await decidirDesfecho(
      GANHO,
      { desfecho_motivo: "a_vista" },
      fontes("Avaliação", semOdeAvaliacao),
    );
    expect(d.ok).toBe(true);
  });
});
