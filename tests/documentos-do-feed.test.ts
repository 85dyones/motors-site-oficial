import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ler } from "./fonte";

/**
 * Documentos do feed: placa, chassi, motor e FIPE chegam ao cadastro interno.
 *
 * Queixa do dono em 2026-09-29: "dados que constam no revenda como placa,
 * chassis e outros campos do veículo chegam em branco". Medido no mesmo dia:
 * 23 dos 44 carros do feed estavam sem placa e sem chassi no banco, com os dois
 * no RevendaMais.
 *
 * O dado morria em DOIS lugares, e cada bloco abaixo trava um:
 *   1. o corpo do "Upsert Veículo (HTTP)" não nomeava os campos que o nó de
 *      classificação já montava;
 *   2. a trava do sync (allowlist por construção) descartava documento no carro
 *      já importado — então o conserto do n8n sozinho só valeria para carro novo.
 *
 * Placa e motor o feed PREENCHE no vazio, nunca troca (o painel os edita); o
 * chassi válido e a FIPE seguem o feed; chassi com I/O/Q e motor 0.0 nunca
 * entram — ver as migrações `20260929120000_documentos_do_feed_preenchem_o_vazio`
 * e `20260929170000_chassi_valido_segue_o_feed`.
 */

const WORKFLOW = "Antigravity - Sincronizador de Estoque (estoque_motors).json";
const DOCUMENTOS = ["placa", "chassi", "motor", "valor_fipe", "codigo_fipe"] as const;

type No = { name: string; parameters: { body?: string; jsCode?: string } };
const exportado = JSON.parse(ler(WORKFLOW)) as { nodes: No[]; activeVersion?: { nodes: No[] } };
const nos = exportado.nodes;
const no = (nome: RegExp): No => {
  const achado = nos.find((n) => nome.test(n.name));
  expect(achado, `nó ${nome} sumiu do workflow`).toBeDefined();
  return achado!;
};

/** Roda o nó de classificação de verdade, com o `$input` que o n8n entrega. */
function classificar(anuncio: Record<string, unknown>): Record<string, unknown> {
  const codigo = no(/^Classifica..o e Regras de Neg.cio$/u).parameters.jsCode!;
  const $input = { all: () => [{ json: anuncio }] };
  const saida = new Function("$input", codigo)($input) as Array<{ json: Record<string, unknown> }>;
  return saida[0].json;
}

/** Avalia o corpo do upsert como o n8n avalia: `={{ JSON.stringify({...}) }}`. */
function corpoDoUpsert($json: Record<string, unknown>): Record<string, unknown> {
  const body = no(/^Upsert Ve.culo/u).parameters.body!;
  const expressao = body.replace(/^=\{\{\s*/, "").replace(/\s*\}\}$/, "");
  return JSON.parse(new Function("$json", `return ${expressao}`)($json) as string);
}

/** Um anúncio do XML com a forma que o feed real manda (medida em 29/09). */
const ANUNCIO = {
  ID: "8497421",
  MAKE: "FIAT",
  BASE_MODEL: "ARGO",
  MODEL: "ARGO DRIVE 1.0",
  YEAR: "2025",
  FABRIC_YEAR: "2024",
  PRICE: "79900.00",
  PROMOTION_PRICE: "0",
  MILEAGE: "9000",
  DOORS: "4",
  LOCATION_CITY: "Curitiba",
  LOCATION_STATE: "PR",
  // O feed manda a placa em MINÚSCULAS — 45 de 45 em 29/09.
  PLATE: "abc1d23",
  CHASSI: " 9bw-zzz377vt004251 ",
  MOTOR: "1.0",
  VALOR_FIPE: "81234.00",
  FIPE: "001234-5",
};

describe("o n8n: o upsert manda os documentos que o nó de classificação monta", () => {
  it("os cinco campos saem do nó de classificação", () => {
    const linha = classificar(ANUNCIO);
    expect(linha.placa).toBe("ABC1D23");
    expect(linha.chassi).toBe("9BWZZZ377VT004251");
    expect(linha.motor).toBe("1.0");
    expect(linha.valor_fipe).toBe(81234);
    expect(linha.codigo_fipe).toBe("001234-5");
  });

  it("e chegam ao corpo do upsert — era aqui que morriam", () => {
    const corpo = corpoDoUpsert(classificar(ANUNCIO));
    for (const campo of DOCUMENTOS) {
      expect(corpo, `o upsert não manda ${campo}`).toHaveProperty(campo);
    }
    expect(corpo.placa).toBe("ABC1D23");
    expect(corpo.chassi).toBe("9BWZZZ377VT004251");
  });

  it("placa e chassi saem na forma canônica dos índices únicos", () => {
    // Caixa alta, sem hífen nem espaço — `estoque_motors_placa_unica` e
    // `cadastrar_veiculo_nativo` falam essa forma. Sem ela, `abc1d23` e
    // `ABC1D23` seriam dois carros para o resto do sistema.
    const linha = classificar({ ...ANUNCIO, PLATE: "abc-1d23", CHASSI: "9BW ZZZ377VT004251" });
    expect(linha.placa).toBe("ABC1D23");
    expect(linha.chassi).toBe("9BWZZZ377VT004251");
  });

  it("vazio, zero e 0.0 viram nulo — nunca texto vazio nem cilindrada zero", () => {
    // `0.0` é como o feed diz que não sabe o motor (2 de 45 em 29/09), e
    // `VALOR_FIPE` zero é "sem FIPE" (10 de 45). Gravar isso preencheria o vazio
    // com uma afirmação falsa — e a trava nunca mais deixaria o valor certo entrar.
    const linha = classificar({ ...ANUNCIO, PLATE: "", CHASSI: "", MOTOR: "0.0", VALOR_FIPE: "0", FIPE: "" });
    for (const campo of DOCUMENTOS) {
      expect(linha[campo], campo).toBeNull();
    }
    expect(classificar({ ...ANUNCIO, MOTOR: undefined }).motor).toBeNull();
    expect(classificar({ ...ANUNCIO, MOTOR: "150.0" }).motor).toBe("150.0");
  });

  it("chassi com I, O ou Q não é VIN — vai nulo; o chassi antigo sem elas passa", () => {
    // O erro real do RevendaMais em 29/09: a Spin 8446229 e o Logan 8506571 com
    // a letra O no lugar de zero. VIN (ISO 3779) não usa I, O nem Q.
    expect(classificar({ ...ANUNCIO, CHASSI: "9BGJR75ZOEB278512" }).chassi).toBeNull();
    expect(classificar({ ...ANUNCIO, CHASSI: "9bwzzz377vt00425i" }).chassi).toBeNull();
    // O Fusca 1976: chassi de 8 posições, anterior ao VIN, sem nenhuma das três.
    expect(classificar({ ...ANUNCIO, CHASSI: "bj438840" }).chassi).toBe("BJ438840");
  });

  it("motor em texto passa como veio — só o zero é 'não sei'", () => {
    // A primeira versão usava `parseFloat(...) > 0` e jogava fora "V8 5.0".
    expect(classificar({ ...ANUNCIO, MOTOR: "V8 5.0" }).motor).toBe("V8 5.0");
    expect(classificar({ ...ANUNCIO, MOTOR: " 1.3 Turbo " }).motor).toBe("1.3 Turbo");
    expect(classificar({ ...ANUNCIO, MOTOR: "0" }).motor).toBeNull();
    expect(classificar({ ...ANUNCIO, MOTOR: "0,0" }).motor).toBeNull();
  });

  it("a versão publicada do workflow é a mesma que a de edição", () => {
    // O export do n8n traz duas cópias dos nós: `nodes` (a de edição) e
    // `activeVersion.nodes` (a publicada, que o agendamento roda). A revisão
    // pegou a primeira versão desta entrega editando só uma — importado assim,
    // o cron seguiria com o upsert antigo e todo teste daqui passaria verde.
    expect(exportado.activeVersion, "o export perdeu a versão publicada").toBeDefined();
    const publicada = new Map(exportado.activeVersion!.nodes.map((n) => [n.name, n.parameters]));
    expect([...publicada.keys()].sort()).toEqual(nos.map((n) => n.name).sort());
    for (const n of nos) {
      expect(publicada.get(n.name), `nó "${n.name}" difere entre as duas cópias`).toEqual(n.parameters);
    }
  });

  it("o upsert continua sem as colunas que o sync não pode escrever", () => {
    const corpo = corpoDoUpsert(classificar(ANUNCIO));
    for (const proibido of ["vendido", "estado_cadastro", "origem", "renavam", "first_seen_at"]) {
      expect(corpo, proibido).not.toHaveProperty(proibido);
    }
    // A assinatura do sync, que a trava lê.
    expect(corpo).toHaveProperty("last_seen_at");
  });
});

// ---------------------------------------------------------------------------
// O banco
// ---------------------------------------------------------------------------

const PASTA = "supabase/migrations";
const MIGRACAO = "20260929120000_documentos_do_feed_preenchem_o_vazio.sql";
/** A emenda do mesmo dia: é ela que define as duas funções vigentes. */
const EMENDA = "20260929170000_chassi_valido_segue_o_feed.sql";
/** Desde a 20260929200000 a trava vigente é a da ficha técnica — que conserva
 *  as regras dos documentos inteiras. `marcar_origem` segue sendo a da emenda. */
const FICHA = "20260929210000_ficha_tecnica_so_no_carro_do_feed.sql";

/** SQL sem as linhas de comentário — a explicação cita o código que proíbe. */
const executavel = (arquivo: string) =>
  ler(`${PASTA}/${arquivo}`)
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

/** O corpo da ÚLTIMA definição de uma função — é a que vale no banco. */
function vigente(funcao: string): { arquivo: string; corpo: string } {
  const cria = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${funcao}\\(`, "i");
  const arquivos = readdirSync(join(__dirname, "..", PASTA))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => cria.test(executavel(f)));
  expect(arquivos.length, `nenhuma migração define ${funcao}`).toBeGreaterThan(0);
  const arquivo = arquivos[arquivos.length - 1];
  const sql = executavel(arquivo);
  const inicio = sql.search(cria);
  const fim = sql.indexOf("$$;", sql.indexOf("$$", inicio) + 2);
  expect(fim, `não achei o fim de ${funcao} em ${arquivo}`).toBeGreaterThan(inicio);
  return { arquivo, corpo: sql.slice(inicio, fim) };
}

/**
 * Os ramos de um `if … then … else … end if;` do plpgsql, contando os `if`
 * aninhados — e não o primeiro `else` ou o primeiro `end if` que aparecer.
 *
 * A revisão provou por que isso importa: cortar no primeiro `else` jogava para
 * o "ramo do feed" tudo que viesse depois do `end if;`, e mover a canonização
 * para fora do `if` (valendo também para o cadastro nativo) passava verde.
 */
function ramosDoIf(corpo: string, abertura: RegExp) {
  const m = abertura.exec(corpo);
  expect(m, `não achei ${abertura}`).not.toBeNull();
  const dentro = m!.index + m![0].length;
  const token = /\bend\s+if\s*;|\bif\b|\belse\b/g;
  token.lastIndex = dentro;
  let profundidade = 1;
  let senao: { de: number; ate: number } | null = null;
  for (let t = token.exec(corpo); t; t = token.exec(corpo)) {
    if (t[0].startsWith("end")) {
      profundidade -= 1;
      if (profundidade === 0) {
        return {
          antes: corpo.slice(0, m!.index),
          entao: corpo.slice(dentro, senao ? senao.de : t.index),
          senao: senao ? corpo.slice(senao.ate, t.index) : "",
          depois: corpo.slice(t.index + t[0].length),
        };
      }
    } else if (t[0] === "if") {
      profundidade += 1;
    } else if (profundidade === 1) {
      senao = { de: t.index, ate: t.index + t[0].length };
    }
  }
  throw new Error(`o if ${abertura} não fecha`);
}

const contar = (texto: string, re: RegExp) => (texto.match(new RegExp(re, "g")) ?? []).length;

describe("a trava do sync: a allowlist exata, cada coluna com a sua regra", () => {
  const { arquivo, corpo } = vigente("estoque_motors_trava_do_sync");
  const sync = ramosDoIf(
    corpo,
    /if current_user = 'service_role'\s+or new\.last_seen_at is distinct from old\.last_seen_at then/,
  );

  it("a versão vigente é a da ficha técnica, que herda a da emenda", () => {
    expect(arquivo).toBe(FICHA);
  });

  it("a allowlist é exatamente esta — uma escrita por coluna, nenhuma a mais", () => {
    // Lista, e não conjunto: uma segunda `old.placa :=` sem guarda (o feed
    // voltando a sobrescrever) é justamente a regressão a pegar.
    const escritas = [...corpo.matchAll(/\bold\.(\w+)\s*:=/g)].map((m) => m[1]).sort();
    expect(escritas).toEqual(
      [
        "ano",
        "ano_fabricacao",
        "cambio",
        "chassi",
        "codigo_fipe",
        "combustivel",
        "conteudo_atualizado_em",
        "cor",
        "last_seen_at",
        "motor",
        "opcionais",
        "placa",
        "portas",
        "preco",
        "preco_original",
        "preco_promocional",
        "quilometragem",
        "valor_fipe",
      ].sort(),
    );
  });

  it("nenhuma atribuição por `=` — o plpgsql aceita, e ela escaparia da contagem", () => {
    // `old.vendido = new.vendido;` é atribuição válida em plpgsql. A revisão
    // pôs `vendido` e `estado_cadastro` assim na trava e o teste ficou verde.
    expect(corpo).not.toMatch(/\bold\.\w+\s*=/);
  });

  it("toda escrita mora no ramo do sync; fora dele só a origem se protege", () => {
    expect(contar(sync.entao, /\bold\.\w+\s*:=/)).toBe(18);
    expect(sync.depois).not.toMatch(/\bold\.\w+\s*:=/);
    expect(sync.entao).toMatch(/return old;\s*$/);
    expect(sync.depois).toMatch(
      /^\s*if new\.origem is distinct from old\.origem then\s+new\.origem := old\.origem;\s+end if;\s+return new;\s+end;\s*$/,
    );
  });

  /** A busca de documento alheio, com o predicado do índice parcial. */
  const outroCarroCom = (doc: string) =>
    `not exists \\(\\s+select 1 from public\\.estoque_motors o\\s+` +
    `where o\\.${doc} is not null and btrim\\(o\\.${doc}\\) <> ''\\s+` +
    `and o\\.id <> old\\.id\\s+` +
    `and upper\\(replace\\(replace\\(btrim\\(o\\.${doc}\\), '-', ''\\), ' ', ''\\)\\) = ${doc}_do_feed\\s+\\)`;

  it("placa: só no vazio, e nunca a de outro carro", () => {
    expect(contar(corpo, /\bold\.placa\s*:=/)).toBe(1);
    expect(corpo).toMatch(
      new RegExp(
        `if nullif\\(btrim\\(old\\.placa\\), ''\\) is null\\s+and placa_do_feed is not null\\s+` +
          `and ${outroCarroCom("placa")} then\\s+old\\.placa := placa_do_feed;\\s+end if;`,
      ),
    );
  });

  it("chassi: o válido segue o feed, sem I/O/Q e nunca o de outro carro", () => {
    // Congelado no primeiro valor, um chassi errado só sairia por SQL — o
    // painel não edita chassi de carro do feed. A revisão pegou o caso real.
    expect(contar(corpo, /\bold\.chassi\s*:=/)).toBe(1);
    expect(corpo).toMatch(/if chassi_do_feed ~ '\[IOQ\]' then\s+chassi_do_feed := null;\s+end if;/);
    expect(corpo).toMatch(
      new RegExp(
        `if chassi_do_feed is not null\\s+and chassi_do_feed is distinct from\\s+` +
          `nullif\\(upper\\(replace\\(replace\\(btrim\\(old\\.chassi\\), '-', ''\\), ' ', ''\\)\\), ''\\)\\s+` +
          `and ${outroCarroCom("chassi")} then\\s+old\\.chassi := chassi_do_feed;\\s+end if;`,
      ),
    );
  });

  it("motor: só no vazio, 0.0 é 'não sei' — e preencher move o lastmod", () => {
    expect(contar(corpo, /\bold\.motor\s*:=/)).toBe(1);
    expect(corpo).toMatch(
      /if motor_do_feed ~ '\^0\+\(\[\.,\]0\+\)\?\$' then\s+motor_do_feed := null;\s+end if;/,
    );
    expect(corpo).toMatch(
      /if nullif\(btrim\(old\.motor\), ''\) is null and motor_do_feed is not null then\s+old\.motor := motor_do_feed;\s+motor_preenchido := true;\s+end if;/,
    );
  });

  it("FIPE: segue o feed quando ele tem valor; zero e vazio não apagam", () => {
    expect(contar(corpo, /\bold\.valor_fipe\s*:=/)).toBe(1);
    expect(contar(corpo, /\bold\.codigo_fipe\s*:=/)).toBe(1);
    expect(corpo).toMatch(/if new\.valor_fipe > 0 then\s+old\.valor_fipe := new\.valor_fipe;\s+end if;/);
    expect(corpo).toMatch(
      /if nullif\(btrim\(new\.codigo_fipe\), ''\) is not null then\s+old\.codigo_fipe := btrim\(new\.codigo_fipe\);\s+end if;/,
    );
  });

  it("o lastmod: um carimbo só, por preço, opcional, ficha técnica ou motor — nunca por documento", () => {
    expect(contar(corpo, /\bold\.conteudo_atualizado_em\s*:=/)).toBe(1);
    expect(corpo).toMatch(
      /if preco_mudou or opcionais_mudou or ficha_mudou or motor_preenchido then\s+old\.conteudo_atualizado_em := now\(\);\s+end if;/,
    );
    expect(contar(corpo, /\bmotor_preenchido\s*:=\s*true/)).toBe(1);
  });
});

describe("o INSERT do feed: forma canônica, e colisão vira vazio", () => {
  const { arquivo, corpo } = vigente("estoque_motors_marcar_origem");
  // O limiar fica na abertura: trocar 900000001 faz o `if` não ser achado.
  const faixa = ramosDoIf(corpo, /if new\.id >= 900000001 then/);

  it("a versão vigente é a da emenda, e decide pela faixa antes de tudo", () => {
    expect(arquivo).toBe(EMENDA);
    expect(faixa.antes).toMatch(/\bbegin\s*$/);
    expect(faixa.senao, "o ramo do feed sumiu").not.toBe("");
  });

  it("o ramo do nativo ficou intacto — lá a duplicidade TEM de estourar", () => {
    expect(faixa.entao).toMatch(
      /^\s*new\.origem := 'painel';\s+new\.last_seen_at := null;\s+if new\.first_seen_at is null then\s+new\.first_seen_at := now\(\);\s+end if;\s*$/,
    );
  });

  it("placa e chassi só são tocados no ramo do feed", () => {
    expect(faixa.entao).not.toMatch(/\bnew\.(placa|chassi)\b/);
    expect(faixa.depois).not.toMatch(/\bnew\.(placa|chassi)\b/);
    expect(faixa.depois).toMatch(/^\s*new\.estado_cadastro := 'rascunho';\s+return new;\s+end;\s*$/);
    expect(corpo).not.toMatch(/\bnew\.\w+\s*=/);
  });

  it("o ramo do feed canoniza e zera o documento alheio, sem colidir consigo mesmo", () => {
    // No upsert do PostgREST este gatilho roda também para o carro que já
    // existe, antes do conflito. Sem `is distinct from new.id`, reimportar o
    // dono da placa apagaria a placa dele.
    for (const doc of ["placa", "chassi"]) {
      expect(faixa.senao, doc).toMatch(
        new RegExp(`new\\.${doc}\\s+:= nullif\\(upper\\(replace\\(replace\\(btrim\\(new\\.${doc}\\),\\s+'-', ''\\), ' ', ''\\)\\), ''\\);`),
      );
      expect(faixa.senao, doc).toMatch(
        new RegExp(
          `if new\\.${doc} is not null and exists \\(\\s+select 1 from public\\.estoque_motors o\\s+` +
            `where o\\.${doc} is not null and btrim\\(o\\.${doc}\\) <> ''\\s+` +
            `and o\\.id is distinct from new\\.id\\s+` +
            `and upper\\(replace\\(replace\\(btrim\\(o\\.${doc}\\), '-', ''\\), ' ', ''\\)\\) = new\\.${doc}\\s+` +
            `\\) then[\\s\\S]{0,200}?new\\.${doc} := null;\\s+end if;`,
        ),
      );
    }
  });
});

describe("o INSERT do feed recusa o que a trava recusa", () => {
  const { corpo } = vigente("estoque_motors_marcar_origem");
  const faixa = ramosDoIf(corpo, /if new\.id >= 900000001 then/);

  it("chassi com I/O/Q e motor 0.0 não entram nem no carro novo", () => {
    expect(faixa.senao).toMatch(/if new\.chassi ~ '\[IOQ\]' then[\s\S]{0,160}?new\.chassi := null;\s+end if;/);
    expect(faixa.senao).toMatch(
      /if btrim\(new\.motor\) ~ '\^0\+\(\[\.,\]0\+\)\?\$' then\s+new\.motor := null;\s+end if;/,
    );
    expect(faixa.entao).not.toMatch(/\bnew\.motor\b/);
  });
});

describe("a emenda se prova antes de gravar", () => {
  const sql = executavel(EMENDA);

  it("ensaia a guarda da própria trava por UPDATE direto como service_role", () => {
    // No upsert o marcar_origem zera o documento alheio antes; só o UPDATE
    // direto chega ao `not exists` da trava — e o preenchimento de 29/09 foi
    // um UPDATE direto.
    expect(sql).toMatch(
      /set local role service_role;\s+update public\.estoque_motors set placa = 'zzb-9z32', chassi = '9ZZZZZZZZZZ000032' where id = id_d;\s+reset role;/,
    );
  });

  it("o lastmod de ensaio nasce ontem, e o fim apaga as linhas de ensaio", () => {
    expect(sql).toMatch(/ontem\s+timestamptz := now\(\) - interval '1 day';/);
    expect(sql).toMatch(/delete from public\.estoque_motors where id in \(id_a, id_b, id_c, id_d\);/);
    expect(sql).toMatch(/raise exception 'Autoconferência falhou em % ponto\(s\)\.'/);
  });

  it("termina com o rodapé do livro-razão", () => {
    expect(sql).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s+values \('20260929170000', 'chassi_valido_segue_o_feed'\)\s+on conflict \(version\) do nothing;\s*$/,
    );
  });
});

describe("a migração se prova antes de gravar", () => {
  const sql = executavel(MIGRACAO);

  it("ensaia o upsert real do PostgREST, e não um UPDATE solto", () => {
    // É o `on conflict … excluded` que põe os dois gatilhos juntos, na ordem em
    // que o banco os roda — o ponto onde a colisão consigo mesmo aparece.
    expect(contar(sql, /on conflict \(id\) do update set/)).toBeGreaterThanOrEqual(7);
    expect(sql).toMatch(/raise exception 'Autoconferência falhou em % ponto\(s\)\.'/);
    expect(sql).toMatch(/delete from public\.estoque_motors where id in \(id_a, id_b, id_c, id_d\);/);
  });

  it("o lastmod de ensaio nasce ontem — senão a checagem de carimbo é cega", () => {
    // `now()` é constante na transação: com o default, "moveu" e "não moveu"
    // dariam o mesmo valor. A revisão pegou a primeira versão assim.
    expect(sql).toMatch(/ontem\s+timestamptz := now\(\) - interval '1 day';/);
    expect(contar(sql, /conteudo_atualizado_em\)\s+values \([^;]*\bontem\);/)).toBe(2);
    expect(sql).toMatch(/if depois\.conteudo_atualizado_em is not distinct from ontem then/);
  });

  it("termina com o rodapé do livro-razão", () => {
    expect(sql).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s+values \('20260929120000', 'documentos_do_feed_preenchem_o_vazio'\)\s+on conflict \(version\) do nothing;\s*$/,
    );
  });
});
