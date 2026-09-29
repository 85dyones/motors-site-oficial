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
 * A regra é PREENCHER o vazio, nunca TROCAR — ver o cabeçalho da migração
 * `20260929120000_documentos_do_feed_preenchem_o_vazio`.
 */

const WORKFLOW = "Antigravity - Sincronizador de Estoque (estoque_motors).json";
const DOCUMENTOS = ["placa", "chassi", "motor", "valor_fipe", "codigo_fipe"] as const;

type No = { name: string; parameters: { body?: string; jsCode?: string } };
const nos = (JSON.parse(ler(WORKFLOW)) as { nodes: No[] }).nodes;
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

describe("a trava do sync: preenche o vazio, e só", () => {
  const { arquivo, corpo } = vigente("estoque_motors_trava_do_sync");

  it("a versão vigente é a desta entrega", () => {
    expect(arquivo).toBe(MIGRACAO);
  });

  it("a allowlist é exatamente esta — nenhuma coluna a mais", () => {
    // O teste que pega o descuido de amanhã: `vendido`, `estado_cadastro` ou
    // `descricao` entrando aqui devolveria ao robô o que a loja decidiu.
    const escritas = [...corpo.matchAll(/\bold\.(\w+)\s*:=/g)].map((m) => m[1]);
    expect([...new Set(escritas)].sort()).toEqual(
      [
        "chassi",
        "codigo_fipe",
        "conteudo_atualizado_em",
        "last_seen_at",
        "motor",
        "opcionais",
        "placa",
        "portas",
        "preco",
        "preco_original",
        "preco_promocional",
        "valor_fipe",
      ].sort(),
    );
  });

  it("cada documento só é escrito quando o que está lá é vazio", () => {
    for (const campo of DOCUMENTOS) {
      const vazio =
        campo === "valor_fipe"
          ? /if old\.valor_fipe is null and new\.valor_fipe > 0 then\s+old\.valor_fipe := new\.valor_fipe;/
          : new RegExp(`if nullif\\(btrim\\(old\\.${campo}\\), ''\\) is null\\s+and[\\s\\S]{0,400}?then\\s+old\\.${campo} :=`);
      expect(corpo, campo).toMatch(vazio);
    }
  });

  it("documento de outro carro não entra — estouraria o índice e mataria o lote", () => {
    expect(corpo).toMatch(/not exists \([\s\S]{0,200}?o\.id <> old\.id[\s\S]{0,120}?= placa_do_feed/);
    expect(corpo).toMatch(/not exists \([\s\S]{0,200}?o\.id <> old\.id[\s\S]{0,120}?= chassi_do_feed/);
  });

  it("documento não move o lastmod — só preço e opcional movem", () => {
    expect(corpo).toMatch(/if preco_mudou or opcionais_mudou then\s+old\.conteudo_atualizado_em := now\(\);/);
    expect(corpo).not.toMatch(/(placa|chassi|motor|fipe)\w*_mudou/);
  });

  it("os dois sinais do sync continuam, e o que não é sync continua passando", () => {
    expect(corpo).toMatch(
      /if current_user = 'service_role'\s+or new\.last_seen_at is distinct from old\.last_seen_at then/,
    );
    expect(corpo).toMatch(/return old;\s+end if;\s+if new\.origem is distinct from old\.origem then/);
  });
});

describe("o INSERT do feed: forma canônica, e colisão vira vazio", () => {
  const { arquivo, corpo } = vigente("estoque_motors_marcar_origem");
  const [nativo, feed] = corpo.split(/\n\s*else\n/);

  it("a versão vigente é a desta entrega", () => {
    expect(arquivo).toBe(MIGRACAO);
    expect(feed, "o ramo do feed sumiu").toBeDefined();
  });

  it("o ramo do nativo ficou intacto — lá a duplicidade TEM de estourar", () => {
    expect(nativo).toContain("new.origem := 'painel';");
    expect(nativo).toContain("new.last_seen_at := null;");
    expect(nativo).not.toMatch(/new\.(placa|chassi)\s*:=/);
  });

  it("o ramo do feed zera o documento alheio, sem colidir consigo mesmo", () => {
    // No upsert do PostgREST este gatilho roda também para o carro que já
    // existe, antes do conflito. Sem `is distinct from new.id`, reimportar o
    // dono da placa apagaria a placa dele.
    expect(feed).toMatch(/o\.id is distinct from new\.id[\s\S]{0,120}?= new\.placa[\s\S]{0,200}?new\.placa := null;/);
    expect(feed).toMatch(/o\.id is distinct from new\.id[\s\S]{0,120}?= new\.chassi[\s\S]{0,200}?new\.chassi := null;/);
  });

  it("todo carro continua nascendo rascunho", () => {
    expect(corpo).toMatch(/new\.estado_cadastro := 'rascunho';\s+return new;/);
  });
});

describe("a migração se prova antes de gravar", () => {
  const sql = executavel(MIGRACAO);

  it("ensaia o upsert real do PostgREST, e não um UPDATE solto", () => {
    // É o `on conflict … excluded` que põe os dois gatilhos juntos, na ordem em
    // que o banco os roda — o ponto onde a colisão consigo mesmo aparece.
    expect(sql.match(/on conflict \(id\) do update set/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(sql).toMatch(/raise exception 'Autoconferência falhou em % ponto\(s\)\.'/);
    expect(sql).toMatch(/delete from public\.estoque_motors where id in \(id_a, id_b, id_c, id_d\);/);
  });

  it("termina com o rodapé do livro-razão", () => {
    expect(sql).toMatch(
      /insert into supabase_migrations\.schema_migrations \(version, name\)\s+values \('20260929120000', 'documentos_do_feed_preenchem_o_vazio'\)\s+on conflict \(version\) do nothing;\s*$/,
    );
  });
});
