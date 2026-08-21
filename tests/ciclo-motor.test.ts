import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivoDaMigracaoViva, definicaoViva, migracaoViva } from "./migracaoViva";
import {
  GATILHOS,
  GATILHOS_ATIVOS,
  MOTIVOS_DE_SUPRESSAO,
  mensagemDoGatilho,
  mensagemDaFilaDeVerificacao,
  identificacaoDoVeiculo,
  primeiroNome,
  dataCurta,
  km,
  type Gatilho,
  type LinhaDaFila,
} from "../src/lib/ciclo/motor";

/**
 * O motor de gatilhos — manual v1.1 §4, §7.2 e §7.3.
 *
 * A divisão de trabalho que este teste protege: a régua de QUEM recebe vive no
 * SQL (Pacote 3: "as regras de frequência aplicadas no servidor, não no
 * workflow"), e o que a mensagem DIZ vive no TypeScript. As duas metades
 * precisam concordar sobre prioridade, cadência e isenções — por isso boa
 * parte do que está aqui lê a migração e compara.
 *
 * O que um workflow do n8n reconfigurado por engano não pode causar está
 * provado na autoconferência da própria migração, contra o banco real.
 */

const raiz = join(__dirname, "..");

/**
 * A régua de QUEM recebe é lida da DEFINIÇÃO VIVA, não do arquivo homônimo.
 *
 * Este arquivo lia `20260814180000_motor_de_gatilhos.sql` pelo nome. A função
 * foi redefinida duas vezes desde então — em 2026-08-18 (advisory lock e os
 * guardas de `falha_envio`) e em 2026-08-20 (o guarda de `saiu_em`) — e o
 * teste seguia verde medindo a versão de 14/08. Era a mesma armadilha que
 * `ciclo-venda-fechamento` já tinha caído uma vez.
 */
const migracao = migracaoViva("montar_fila_de_gatilhos");
const estimativa = migracaoViva("km_estimado");
const carimbo = migracaoViva("carimbar_revisao");
const conformidade = definicaoViva("calcular_conformidade_diaria");

/**
 * A migração do MOTOR, lida por nome de propósito.
 *
 * O que se cobra dela não é o que o banco faz hoje: é o que ela PROVOU no dia
 * em que rodou (a autoconferência) e o backfill que rodou uma vez só. Esse
 * texto é histórico e não muda mais — trocá-lo por `migracaoViva` faria o
 * bloco perseguir o `create or replace` mais recente e cobrar dele uma
 * autoconferência que ele não tem.
 */
const migracaoDoMotor = readFileSync(
  join(raiz, "supabase", "migrations", "20260814180000_motor_de_gatilhos.sql"),
  "utf-8",
);
const migracaoDesfecho = readFileSync(
  join(raiz, "supabase", "migrations", "20260818140000_desfecho_nao_regride.sql"),
  "utf-8",
);
const rotaFilaMotor = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "motor", "fila", "route.ts"),
  "utf-8",
);
const rotaDesfecho = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "motor", "desfecho", "route.ts"),
  "utf-8",
);
const rotaVerificacao = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "motor", "verificacao", "route.ts"),
  "utf-8",
);
const autorizacao = readFileSync(
  join(raiz, "src", "lib", "ciclo", "autorizacaoDoMotor.ts"),
  "utf-8",
);
const rotaRevisoes = readFileSync(
  join(raiz, "src", "app", "api", "ciclo", "revisoes", "route.ts"),
  "utf-8",
);

// ---------------------------------------------------------------------------

const linhaBase: LinhaDaFila = {
  evento_id: "evt-1",
  veiculo_vendido_id: "vv-1",
  cliente_id: "cli-1",
  nome: "José Carlos da Silva",
  telefone_e164: "+5541999990001",
  email: "jose@exemplo.invalido",
  placa: "ABC1D23",
  marca: "Chevrolet",
  modelo: "Onix",
  ano_modelo: 2021,
  gatilho: "revisao_programada",
  prioridade: 60,
  passo: 1,
  canal: "whatsapp",
  contexto: {},
  suprimido_por: null,
};

/** Uma linha de cada gatilho, em cada passo — o universo do que o cliente lê. */
function todasAsMensagens(): { gatilho: Gatilho; passo: number; texto: string }[] {
  const contextos: Record<Gatilho, Record<string, unknown>> = {
    boas_vindas: {
      data_venda: "2026-08-14",
      km_na_venda: 47000,
      plano: "essencial",
      garantia_meses: 12,
      primeira_revisao: {
        numero: 1,
        janela_inicio: "2027-07-15",
        janela_fim: "2027-09-13",
        km_previsto: 57000,
      },
    },
    revisao_programada: {
      numero_revisao: 1,
      janela_inicio: "2027-07-15",
      janela_fim: "2027-09-13",
      prevista: "2027-08-14",
      km_previsto: 57000,
      km_estimado: 56350,
      dias_para_o_fim: 12,
      antecipado_por_km: true,
    },
    elegibilidade_em_risco: {
      numero_revisao: 1,
      janela_fim: "2027-09-13",
      km_previsto: 57000,
      dias_de_atraso: 8,
      marca_em_risco: false,
    },
    revisao_verificada: {
      manutencao_id: "mnt-1",
      numero_revisao: 1,
      data_servico: "2027-08-20",
      km_registrado: 56800,
      dentro_da_janela: true,
    },
  };

  const saida: { gatilho: Gatilho; passo: number; texto: string }[] = [];
  for (const gatilho of GATILHOS_ATIVOS) {
    for (let passo = 1; passo <= GATILHOS[gatilho].passos; passo++) {
      saida.push({
        gatilho,
        passo,
        texto: mensagemDoGatilho({
          ...linhaBase,
          gatilho,
          passo,
          prioridade: GATILHOS[gatilho].prioridade,
          contexto: contextos[gatilho],
        }),
      });
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------

describe("os princípios de mensagem — §7.2", () => {
  it("toda mensagem carrega dado específico do carro", () => {
    // "seu Onix branco, placa ABC-1234, está em 47 mil km" — nunca genérico.
    for (const { gatilho, passo, texto } of todasAsMensagens()) {
      expect(texto, `${gatilho} passo ${passo} sem placa`).toContain("ABC1D23");
      expect(texto, `${gatilho} passo ${passo} sem modelo`).toContain("Onix");
      expect(texto, `${gatilho} passo ${passo} não chama o cliente pelo nome`).toContain("José");
    }
  });

  it("uma pergunta por mensagem", () => {
    for (const { gatilho, passo, texto } of todasAsMensagens()) {
      const perguntas = (texto.match(/\?/g) ?? []).length;
      expect(perguntas, `${gatilho} passo ${passo} tem ${perguntas} perguntas`).toBeLessThanOrEqual(1);
    }
  });

  it("toda mensagem oferece saída explícita", () => {
    for (const { gatilho, passo, texto } of todasAsMensagens()) {
      expect(texto.toLowerCase(), `${gatilho} passo ${passo} sem saída`).toContain(
        "não receber estes avisos",
      );
    }
  });

  it("não promete palavra-chave que ninguém processa", () => {
    // Não existe handler de opt-out automático. "Responda SAIR" seria uma
    // promessa que o sistema não cumpre — a saída é humana, e o texto diz isso.
    for (const { gatilho, texto } of todasAsMensagens()) {
      expect(texto, `${gatilho} promete palavra-chave`).not.toMatch(/responda\s+(sair|stop|parar)/i);
    }
  });
});

describe("o que a mensagem não pode dizer", () => {
  it("nunca menciona recompra — o gatilho do §1.4 não abriu (regra 5)", () => {
    for (const { gatilho, passo, texto } of todasAsMensagens()) {
      expect(texto.toLowerCase(), `${gatilho} passo ${passo} fala de recompra`).not.toContain(
        "recompra",
      );
    }
  });

  it("usa o vocabulário vigente: diário de bordo e procedência, nunca caderneta", () => {
    const tudo = todasAsMensagens()
      .map((m) => m.texto)
      .join("\n");
    expect(tudo.toLowerCase()).not.toContain("caderneta");
    expect(tudo.toLowerCase()).toContain("diário de bordo");
    expect(tudo.toLowerCase()).toContain("procedência");
  });

  it("não trata o KM estimado como fato — ele é estimativa e só antecipa aviso", () => {
    const antecipada = mensagemDoGatilho({
      ...linhaBase,
      passo: 1,
      contexto: {
        numero_revisao: 1,
        janela_inicio: "2027-07-15",
        janela_fim: "2027-09-13",
        km_previsto: 57000,
        km_estimado: 56350,
        antecipado_por_km: true,
      },
    });
    expect(antecipada).toContain("estimativa");
  });

  it("a promessa de que 'em risco' tem volta está implementada no banco", () => {
    // A mensagem do 3º passo do gatilho 7 diz que o status volta. Se o SQL não
    // devolver, o texto vira promessa falsa.
    const texto = mensagemDoGatilho({
      ...linhaBase,
      gatilho: "elegibilidade_em_risco",
      passo: 3,
      contexto: { numero_revisao: 1, janela_fim: "2027-09-13", dias_de_atraso: 21 },
    });
    expect(texto).toContain("tem volta");
    // Quem devolve o status é `carimbar_revisao`, não a montagem da fila.
    expect(carimbo).toContain("set status_elegibilidade = 'elegivel'");
  });
});

describe("a mensagem de revisão verificada — os três estados da janela", () => {
  // Achado da revisão da Task 5 (ronda 1): esta mensagem vai para o CLIENTE, e
  // colapsava a tricotomia em binário (`=== false ? … : "Dentro da janela…"`).
  // Antes das Tasks 1-3, null nunca chegava aqui. Agora chega — revisão sem
  // janela nenhuma para casar — e o cliente recebia "Dentro da janela do
  // programa.", que é falso. Espelho do defeito que a própria Task 5 consertou
  // no selo: em vez de acusar quem não devia, elogiava o que não aconteceu.
  const contexto = (dentro_da_janela: boolean | null) => ({
    numero_revisao: 1,
    data_servico: "2027-08-20",
    km_registrado: 56800,
    dentro_da_janela,
  });

  it("true diz que está dentro da janela do programa", () => {
    const texto = mensagemDoGatilho({
      ...linhaBase,
      gatilho: "revisao_verificada",
      passo: 1,
      contexto: contexto(true),
    });
    expect(texto).toContain("Dentro da janela do programa.");
  });

  it("false diz que ficou fora da janela contratada", () => {
    const texto = mensagemDoGatilho({
      ...linhaBase,
      gatilho: "revisao_verificada",
      passo: 1,
      contexto: contexto(false),
    });
    expect(texto).toContain("Ela ficou fora da janela contratada");
    expect(texto).not.toContain("Dentro da janela do programa.");
  });

  it("null não diz 'dentro da janela' — não havia janela para casar com o serviço", () => {
    const texto = mensagemDoGatilho({
      ...linhaBase,
      gatilho: "revisao_verificada",
      passo: 1,
      contexto: contexto(null),
    });
    expect(texto).toContain("Não havia janela programada para casar com ela");
    expect(texto).not.toContain("Dentro da janela do programa.");
    // Nem no ramo do atraso — null não é "fora", é outra coisa.
    expect(texto).not.toContain("Ela ficou fora da janela contratada");
  });

  it("os três estados produzem três textos distintos, nenhum se repete", () => {
    const textos = [true, false, null].map((v) =>
      mensagemDoGatilho({
        ...linhaBase,
        gatilho: "revisao_verificada",
        passo: 1,
        contexto: contexto(v),
      }),
    );
    expect(new Set(textos).size).toBe(3);
  });
});

describe("prioridade e cadência — o TS e o SQL contam a mesma história", () => {
  it("a prioridade do §4.4 é a mesma nas duas camadas", () => {
    // Ordem do manual: 7 → 6 → 5 → 2 → 3 → 1 → 4. Risco antes de oportunidade.
    expect(GATILHOS.elegibilidade_em_risco.prioridade).toBeLessThan(
      GATILHOS.revisao_programada.prioridade,
    );
    for (const gatilho of GATILHOS_ATIVOS) {
      const { prioridade } = GATILHOS[gatilho];
      const noSql = new RegExp(`'${gatilho}'::text[^,]*,\\s*${prioridade}\\b`);
      expect(migracao, `${gatilho} com prioridade diferente no SQL`).toMatch(noSql);
    }
  });

  it("a cadência do §7.3 está no SQL, como datas e como intervalos", () => {
    // Revisão: D−15 · D−3 · D+7. Risco: imediato · D+7 · D+21.
    expect(migracao).toContain("case r.passo when 1 then 15 when 2 then 3 else -7 end");
    expect(migracao).toContain("case r.passo when 1 then 0 when 2 then 7 else 21 end");
    // E os intervalos entre passos — sem eles, quem entra atrasado recebe os
    // três avisos em três dias seguidos (o ensaio da migração pegou isso).
    expect(migracao).toContain("case r.passo when 2 then 12 else 10 end");
    expect(migracao).toContain("case r.passo when 2 then 7 else 14 end");
    expect(migracao).toContain("r.passo <= 3");
  });

  it("as regras de frequência do §4.3 estão no banco, não no workflow", () => {
    expect(migracao).toContain("interval '21 days'");
    expect(migracao).toContain("interval '90 days'");
    expect(migracao).toContain("count(*) filter (where tres.desfecho = 'sem_resposta') = 3");
    // Horário: nada entre 20h e 8h, nada aos domingos.
    expect(migracao).toContain("extract(dow from v_local) = 0");
    expect(migracao).toContain("extract(hour from v_local) < 8 or extract(hour from v_local) >= 20");
  });

  it("a isenção da janela de 21 dias é a mesma nos dois lados", () => {
    const isentos = GATILHOS_ATIVOS.filter((g) => GATILHOS[g].isentoDaJanela).sort();
    expect(isentos).toEqual(["boas_vindas", "elegibilidade_em_risco", "revisao_verificada"]);
    for (const gatilho of isentos) {
      // `[^)]` já atravessa quebra de linha — a lista do SQL é multilinha.
      expect(migracao, `${gatilho} não consta na isenção do SQL`).toMatch(
        new RegExp(`not in \\([^)]*'${gatilho}'`),
      );
    }
    // E o que NÃO é isento não pode aparecer na lista.
    expect(migracao).not.toMatch(/not in \([^)]*'revisao_programada'/);
  });

  it("todo motivo de supressão que o SQL produz tem nome conhecido aqui", () => {
    for (const motivo of MOTIVOS_DE_SUPRESSAO) {
      expect(migracao, `motivo ausente no SQL: ${motivo}`).toContain(`'${motivo}'`);
    }
  });
});

describe("a estimativa de KM nunca penaliza", () => {
  it("km_estimado não entra em conformidade nem em índice", () => {
    // Regra 2 do CLAUDE.md, aplicada ao registro de KM: não registrar não pode
    // custar nada ao cliente. A estimativa só ANTECIPA lembrete.
    // Recorte da FUNÇÃO, não do arquivo: a conformidade viva mora hoje no
    // mesmo arquivo que `montar_fila_de_gatilhos`, que cita `km_estimado`.
    expect(conformidade).not.toContain("km_estimado");
    expect(estimativa).toContain("Serve só para ANTECIPAR o lembrete");
    // Ela aparece só no ramo do lembrete, e só no primeiro passo.
    expect(migracao).toContain("r.passo = 1 and r.km_previsto is not null");
  });

  it("sem leitura suficiente, não há projeção inventada", () => {
    expect(estimativa).toContain("when dia_fim <= dia_ini            then km_fim");
    expect(estimativa).toContain("when km_fim  <= km_ini             then km_fim");
  });
});

describe("as rotas que o n8n consome", () => {
  it("as três exigem o Bearer, e falham fechadas sem token", () => {
    for (const rota of [rotaFilaMotor, rotaDesfecho, rotaVerificacao]) {
      expect(rota).toContain("autorizarMotor");
    }
    // 503 quando não há token configurado (problema nosso), 401 quando o token
    // veio errado (problema de quem chamou).
    expect(autorizacao).toContain("status: 503");
    expect(autorizacao).toContain("status: 401");
  });

  it("o token do motor é próprio, e não o compartilhado de margens", () => {
    // Achado #9 (corrigido em 2026-08-18): com N8N_SECRET_TOKEN aceito aqui,
    // quem tivesse a credencial de margens puxava nome, telefone e placa da
    // base do Ciclo. Segredo mede acesso — e fallback para o token antigo
    // manteria a brecha em silêncio, por isso as negações abaixo.
    expect(autorizacao).toContain("CICLO_MOTOR_TOKEN");
    expect(autorizacao).not.toContain("N8N_SECRET_TOKEN");
    expect(autorizacao).not.toContain("apiSecretToken");
  });

  it("a comparação do Bearer é em tempo constante", () => {
    // `!==` desiste no primeiro caractere diferente — oráculo de timing.
    expect(autorizacao).toContain("tokenConfere");
    expect(autorizacao).not.toContain("!== `Bearer");
  });

  it("a fila devolve o suprimido junto com o motivo", () => {
    expect(rotaFilaMotor).toContain("suprimidos");
    expect(rotaFilaMotor).toContain("suprimido_por");
  });

  it("mensagem impossível de montar devolve a vez ao cliente", () => {
    // Reserva feita + texto quebrado não pode gastar a janela de 21 dias de
    // alguém que nunca recebeu nada.
    expect(rotaFilaMotor).toContain("registrar_desfecho_ciclo");
    expect(rotaFilaMotor).toContain('p_desfecho: "falha_envio"');
    expect(migracao).toContain("coalesce(e.desfecho, '') <> 'falha_envio'");
  });

  it("um retry não rebaixa desfecho já gravado", () => {
    // Achado #10: a gravação era incondicional — retry do n8n virava
    // `convertido` em `sem_resposta`, apagando a conversão e alimentando a
    // quarentena com um "sem resposta" falso. A régua vive numa função pura
    // (autoconferida caso a caso na própria migração) e a recusa responde
    // `sobrescrita_ignorada`, nunca erro: retry é operação normal.
    expect(migracaoDesfecho).toContain("desfecho_pode_gravar");
    expect(migracaoDesfecho).toContain("sobrescrita_ignorada");
    // Ler-e-gravar sem lock reabriria a corrida que a régua fecha.
    expect(migracaoDesfecho).toContain("for update");
    // O par da regra 2 é incomunicável nos dois sentidos: falha_envio nunca
    // vira contato por retry, e contato não vira falha.
    expect(migracaoDesfecho).toContain("('falha_envio',   'sem_resposta', false)");
    expect(migracaoDesfecho).toContain("('sem_resposta',  'falha_envio',  false)");
  });

  it("devolução de vez que não gravou não passa em silêncio", () => {
    // Achado #8: o RPC da devolução era chamado sem conferir o `error` —
    // se falhasse, o evento ficava com desfecho nulo, que conta como
    // contato, e a janela queimava sem ninguém saber. Agora a falha é
    // conferida e sai na resposta, gravada na execução do n8n.
    expect(rotaFilaMotor).toContain("erroDesfecho");
    expect(rotaFilaMotor).toContain("desfechos_nao_registrados");
  });

  it("gatilho desconhecido estoura em vez de mandar mensagem vazia", () => {
    expect(() =>
      mensagemDoGatilho({ ...linhaBase, gatilho: "seguro_vencendo" as Gatilho }),
    ).toThrow(/Gatilho sem mensagem/);
    // E a rota recusa o nome errado antes de chegar ao banco.
    expect(rotaFilaMotor).toContain("Gatilho desconhecido");
  });
});

describe("o aviso de verificação — o lado da loja", () => {
  const pendente = (dias: number, etiqueta = true) => ({
    id: `m-${dias}`,
    placa: "ABC1D23",
    cliente: "José Carlos da Silva",
    data_servico: "2027-08-20",
    km_registrado: 56800,
    origem_registro: "cliente",
    tem_etiqueta: etiqueta,
    dias_na_fila: dias,
  });

  it("fila vazia não gera mensagem", () => {
    // Bot que avisa "nada a fazer" todo dia é bot que a equipe silencia — e aí
    // o dia em que importa também passa batido.
    expect(mensagemDaFilaDeVerificacao([], "https://exemplo.invalido/fila")).toBeNull();
  });

  it("diz quantas, há quanto tempo e o que falta", () => {
    const texto = mensagemDaFilaDeVerificacao(
      [pendente(3), pendente(9, false)],
      "https://exemplo.invalido/fila",
    )!;
    expect(texto).toContain("2 lançamentos");
    expect(texto).toContain("9 dias");
    expect(texto).toContain("ABC1D23");
    expect(texto).toContain("1 está sem a foto da etiqueta");
    expect(texto).toContain("https://exemplo.invalido/fila");
    // O porquê de a fila importar: sem carimbo não há conformidade (§5.7).
    expect(texto.toLowerCase()).toContain("conformidade");
  });

  it("recusado não é pendente — nem na fila da loja, nem no aviso", () => {
    expect(rotaVerificacao).toContain('.is("recusada_em", null)');
    expect(rotaRevisoes).toContain('.is("recusada_em", null)');
    // E a recusa continua visível: some da fila, aparece nas últimas.
    expect(rotaRevisoes).toContain('.or("confirmada_em.not.is.null,recusada_em.not.is.null")');
    expect(carimbo).toContain("recusada_em      = now()");
  });
});

describe("formatação", () => {
  it("KM em pt-BR, nulo não vira 'null km'", () => {
    expect(km(47000)).toBe("47.000 km");
    expect(km(null)).toBe("");
    expect(km(undefined)).toBe("");
  });

  it("data curta esconde o ano corrente e mostra o de fora", () => {
    const hoje = new Date("2027-08-14T12:00:00Z");
    expect(dataCurta("2027-09-13", hoje)).toBe("13/09");
    expect(dataCurta("2028-01-05", hoje)).toBe("05/01/2028");
    expect(dataCurta(null, hoje)).toBe("");
  });

  it("primeiro nome e identificação do veículo", () => {
    expect(primeiroNome("José Carlos da Silva")).toBe("José");
    expect(primeiroNome(null)).toBe("");
    expect(identificacaoDoVeiculo(linhaBase)).toBe("Chevrolet Onix 2021 (placa ABC1D23)");
  });
});

describe("a autoconferência da migração", () => {
  it("cobre o aceite do Pacote 3 e as regras que definem o motor", () => {
    for (const cenario of [
      "a fila entregou alguém num domingo",
      "a fila entregou alguém antes das 8h",
      "com vários gatilhos, saíram % linhas (deveria ser 1)",
      "a prioridade do §4.4 escolheu",
      "o gatilho 7 repetiu antes do D+7 da cadência",
      "falha de envio gastou a janela de 21 dias do cliente",
      "mandou mensagem para quem não consentiu canal nenhum",
      "registro recusado continua na fila de pendentes",
      "revisão verificada não devolveu a elegibilidade ao normal",
    ]) {
      expect(migracaoDoMotor, `cenário ausente: ${cenario}`).toContain(cenario);
    }
  });

  it("a base anterior ao motor não é cumprimentada", () => {
    // Ligar o motor sobre a base histórica do §3.3 dispararia boas-vindas para
    // venda de 2023. O que existe antes entra já marcado como suprimido.
    // Backfill de uma vez só: histórico, lido pelo nome do arquivo.
    expect(migracaoDoMotor).toContain("'suprimido_base_anterior'");
  });

  it("a régua da janela do §1.5 sobreviveu à recriação de carimbar_revisao", () => {
    expect(carimbo).toContain("m.data_servico <= janela.janela_fim");
    expect(carimbo).toContain("m.km_registrado <= janela.km_previsto + 1000");
    expect(carimbo).toContain("CARIMBO_SEM_ETIQUETA");
    expect(carimbo).toContain("RECUSA_SEM_MOTIVO");
    expect(carimbo).toContain("REVISAO_JA_CARIMBADA");
  });
});

describe("a busca pela definição viva", () => {
  it("acha `CREATE OR REPLACE` maiúsculo — o caso que a motivou", () => {
    // `20260818120000_falha_envio_nao_penaliza.sql` extraiu a função do banco
    // com `pg_get_functiondef` e por isso veio em caixa alta; a correção de
    // 2026-08-20 copiou esse texto para dentro da migração vitalícia. Com a
    // busca sensível a maiúsculas, os dois arquivos ficam invisíveis e o
    // "vivo" devolvido é o de 14/08 — quatro dias e três correções atrás.
    expect(arquivoDaMigracaoViva("montar_fila_de_gatilhos")).toBe(
      "20260820120000_plano_de_revisoes_vitalicio.sql",
    );
    expect(migracao).toContain("CREATE OR REPLACE FUNCTION public.montar_fila_de_gatilhos");
    // E o que a busca ingênua devolveria não é a definição viva.
    expect(migracaoDoMotor).not.toContain("pg_advisory_xact_lock");
  });

  it("o recorte da função para na própria função", () => {
    // `definicaoViva` existe para a asserção NEGATIVA: o arquivo vivo da
    // conformidade hospeda também o motor de gatilhos, que cita km_estimado.
    expect(migracaoViva("calcular_conformidade_diaria")).toContain("km_estimado");
    expect(conformidade).not.toContain("km_estimado");
    expect(conformidade).toContain("calcular_conformidade_diaria");
    expect(conformidade).not.toContain("montar_fila_de_gatilhos");
  });
});
