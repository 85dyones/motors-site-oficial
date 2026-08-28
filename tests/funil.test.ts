import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MATRIZ_DE_PERMISSOES, podeFazer } from "../src/lib/permissoes";
import { MOTIVO_DA_SUPRESSAO } from "../src/lib/funil";
import {
  ETAPAS_PADRAO,
  agruparPorMotivo,
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
    const erros = validarFunil([etapa()]);
    expect(erros.some((e) => e.includes("GANHO"))).toBe(true);
    expect(erros.some((e) => e.includes("PERDIDO"))).toBe(true);
  });

  it("recusa transferir antes de avisar", () => {
    // O lead trocaria de dono antes de o vendedor saber que estava parado.
    const erros = validarFunil([
      ...ETAPAS_PADRAO.filter((e) => e.tipo !== "aberta"),
      etapa({ estagnacao_minutos: 2880, transferencia_minutos: 60 }),
    ]);
    expect(erros.some((e) => e.includes("menor que o de alerta"))).toBe(true);
  });

  it("recusa transferir sem nunca avisar", () => {
    const erros = validarFunil([
      ...ETAPAS_PADRAO.filter((e) => e.tipo !== "aberta"),
      etapa({ estagnacao_minutos: null, transferencia_minutos: 1440 }),
    ]);
    expect(erros.some((e) => e.includes("sem nunca avisar"))).toBe(true);
  });

  it("aceita o funil que a migração semeia", () => {
    // A semente do banco precisa passar na validação da tela. Se não passar, o
    // dono abre a configuração e encontra erro sem ter mexido em nada.
    expect(validarFunil(ETAPAS_PADRAO)).toEqual([]);
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
    expect(destinos.map((e) => e.chave)).toEqual(["fechado", "perdido"]);
  });

  it("destino desativado some do botão", () => {
    // Diferente da coluna, aqui não há card preso para proteger: quem
    // desativou "Perdido" não quer o botão. Os leads que já estão nele
    // continuam na lista de fechados.
    const semPerda = ETAPAS_PADRAO.map((e) =>
      e.tipo === "perdido" ? { ...e, ativa: false } : e,
    );
    expect(destinosDoNegocio(semPerda).map((e) => e.chave)).toEqual(["fechado"]);
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
    for (const e of ETAPAS_PADRAO) {
      expect(sqlExecutavel).toContain(`'${e.chave}'`);
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
    expect(rota).toMatch(/motivoBanco\.tipo !== etapa\.tipo/);
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
