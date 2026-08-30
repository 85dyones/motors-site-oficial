import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classificarEstado,
  contarPorEstado,
  filtrarLinhas,
  idDoCaminhoDaPagina,
  mapaDeVisitas,
  contarLeadsPorVeiculo,
  normalizarBusca,
  reclassificarLinha,
  versaoParaExibir,
  modeloEVersaoParaExibir,
  ROTULO_DO_ESTADO,
  type EstadoDoVeiculo,
  type LinhaDeEstoque,
} from "../src/lib/estoqueTabela";
import {
  bloqueiosDePublicacao,
  publicavel,
  MINIMO_DE_FOTOS,
} from "../src/lib/coerenciaDoCadastro";

/**
 * Testes da tabela de estoque (tela A6).
 *
 * O que esta camada decide é o que o operador vê como "publicado" — e é sobre
 * essa leitura que ele marca carro como vendido. Errar o estado aqui faz o
 * painel mentir sobre a vitrine.
 *
 * ---------------------------------------------------------------------------
 * A regressão que este arquivo passou a impedir (qa-guardian, 2026-08-30)
 * ---------------------------------------------------------------------------
 * `classificarEstado` olhava só `vendido` e o carimbo de sync. Um veículo
 * cadastrado no painel com ZERO foto aparecia como **Publicado** — enquanto
 * `getEstoque` o cortava da vitrine por `publicavel` e a tela de cadastro
 * dizia, na mesma sessão, "Ainda fora da vitrine". Duas telas do mesmo painel
 * discordando sobre o mesmo carro.
 *
 * Daí o teste-âncora: **carro com 0 fotos não é "publicado"**, e o que a tabela
 * chama de publicado é exatamente o que a vitrine serve.
 */

/** N fotos de verdade, no formato em que a coluna guarda. */
const comFotos = (n: number) => Array.from({ length: n }, (_, i) => `https://s3/foto-${i}.jpg`);

/** Um veículo que passa em tudo — o ponto de partida para negar um item por vez. */
const publicavelDeVerdade = {
  vendido: false,
  laudo_pericia: "Laudo cautelar aprovado — Grupo Fiscal, 2026-08-14",
  whatsapp_images: comFotos(MINIMO_DE_FOTOS),
  origem: "sync",
};

function linha(parcial: Partial<LinhaDeEstoque> = {}): LinhaDeEstoque {
  return {
    id: "4821",
    marca: "Land Rover",
    modelo: "Range Rover Evoque",
    versao: "R-Dynamic SE",
    ano: 2022,
    quilometragem: 38400,
    preco: 289900,
    foto: null,
    fotos: 12,
    estado: "publicado",
    noUltimoSync: true,
    bloqueios: [],
    diasEmEstoque: null,
    tipo: "SUV",
    perfisUso: [],
    placa: "",
    destacado: false,
    visitas: null,
    leads: 0,
    divergente: false,
    quickTags: [],
    ...parcial,
  };
}

describe("classificarEstado", () => {
  it("no último sync, não vendido e com as fotos, é publicado", () => {
    expect(classificarEstado(publicavelDeVerdade, true)).toBe("publicado");
  });

  it("fora do último sync é fora do feed", () => {
    expect(classificarEstado(publicavelDeVerdade, false)).toBe("fora_do_feed");
  });

  it("vendido vence fora do feed — o motivo real é a venda", () => {
    // O carro vendido some do feed no ciclo seguinte. Se "fora do feed"
    // ganhasse, a tela esconderia por que ele saiu.
    expect(classificarEstado({ ...publicavelDeVerdade, vendido: true }, false)).toBe("vendido");
  });

  it("vendido nulo é tratado como não vendido", () => {
    expect(classificarEstado({ ...publicavelDeVerdade, vendido: null }, true)).toBe("publicado");
  });

  // -------------------------------------------------------------------------
  // O bug: cadastrado ≠ publicado
  // -------------------------------------------------------------------------

  it("carro com ZERO foto NÃO é publicado — é fora da vitrine", () => {
    // O caso literal do achado: cadastro nativo, que nasce sem foto nenhuma.
    // Antes desta linha, a tabela escrevia "Publicado" sobre um carro que o
    // site nunca mostrou.
    const recemCadastrado = { vendido: false, whatsapp_images: [], origem: "painel" };
    expect(classificarEstado(recemCadastrado, true)).toBe("fora_da_vitrine");
  });

  it("uma foto abaixo do mínimo ainda é fora da vitrine", () => {
    const quaseLa = { ...publicavelDeVerdade, whatsapp_images: comFotos(MINIMO_DE_FOTOS - 1) };
    expect(classificarEstado(quaseLa, true)).toBe("fora_da_vitrine");
  });

  it("no mínimo exato já é publicado — a borda é `>=`, não `>`", () => {
    const noMinimo = { ...publicavelDeVerdade, whatsapp_images: comFotos(MINIMO_DE_FOTOS) };
    expect(classificarEstado(noMinimo, true)).toBe("publicado");
  });

  it("objeto sem `whatsapp_images` conta como zero foto, não como publicado", () => {
    // Cair para "publicado" por falta de dado é a mentira de origem. E é o que
    // `getEstoque` faz com essa mesma linha: corta.
    expect(classificarEstado({ vendido: false }, true)).toBe("fora_da_vitrine");
  });

  it("sem laudo NÃO tira do ar hoje — pendência não é bloqueio", () => {
    // 38 das 39 fichas de 27/08 estão sem laudo. Se a falta virasse estado, a
    // tabela declararia a loja inteira fora da vitrine e o alarme viraria ruído.
    // Quem decide isso é `LAUDO_BLOQUEIA_PUBLICACAO`, não esta função.
    const semLaudo = { ...publicavelDeVerdade, laudo_pericia: "" };
    expect(classificarEstado(semLaudo, true)).toBe("publicado");
  });

  it("vendido vence o bloqueio — a venda explica melhor que a foto", () => {
    const vendidoSemFoto = { vendido: true, whatsapp_images: [] };
    expect(classificarEstado(vendidoSemFoto, true)).toBe("vendido");
  });

  it("fora do feed vence o bloqueio — subir foto não traz o carro de volta", () => {
    const sumiuSemFoto = { vendido: false, whatsapp_images: comFotos(2) };
    expect(classificarEstado(sumiuSemFoto, false)).toBe("fora_do_feed");
  });

  it('"publicado" na tabela é exatamente o que a vitrine serve', () => {
    // A invariante que fecha o buraco: enquanto esta comparação valer, o painel
    // e o site não têm como discordar sobre o mesmo carro.
    const casos = [
      publicavelDeVerdade,
      { ...publicavelDeVerdade, whatsapp_images: comFotos(1) },
      { ...publicavelDeVerdade, whatsapp_images: comFotos(MINIMO_DE_FOTOS - 1) },
      { ...publicavelDeVerdade, laudo_pericia: "" },
      { vendido: false, whatsapp_images: [], origem: "painel" },
    ];
    for (const v of casos) {
      expect(classificarEstado(v, true) === "publicado", JSON.stringify(v)).toBe(publicavel(v));
    }
  });
});

describe("reclassificarLinha", () => {
  // A tela muda `vendido` em lote e atualiza a linha sem recarregar. Escrever
  // "publicado" à mão nesse ponto devolvia a mentira pela porta dos fundos.
  const semFotos = linha({
    estado: "fora_da_vitrine",
    bloqueios: bloqueiosDePublicacao({ whatsapp_images: [], origem: "painel" }),
  });

  it("devolver a disponível NÃO publica carro sem fotos", () => {
    expect(reclassificarLinha(semFotos, false)).toBe("fora_da_vitrine");
  });

  it("devolver a disponível publica quem tem as fotos", () => {
    const completo = linha({
      bloqueios: bloqueiosDePublicacao({
        laudo_pericia: "aprovado",
        whatsapp_images: comFotos(MINIMO_DE_FOTOS),
      }),
    });
    expect(reclassificarLinha(completo, false)).toBe("publicado");
  });

  it("devolver a disponível não inventa feed para quem está fora dele", () => {
    const foraDoFeed = linha({ estado: "fora_do_feed", noUltimoSync: false });
    expect(reclassificarLinha(foraDoFeed, false)).toBe("fora_do_feed");
  });

  it("marcar como vendido vence tudo", () => {
    expect(reclassificarLinha(semFotos, true)).toBe("vendido");
    expect(reclassificarLinha(linha({ noUltimoSync: false }), true)).toBe("vendido");
  });

  it("a pendência que não bloqueia não muda o estado", () => {
    const soSemLaudo = linha({
      bloqueios: bloqueiosDePublicacao({
        laudo_pericia: "",
        whatsapp_images: comFotos(MINIMO_DE_FOTOS),
      }),
    });
    expect(soSemLaudo.bloqueios).toHaveLength(1);
    expect(reclassificarLinha(soSemLaudo, false)).toBe("publicado");
  });
});

describe("contarPorEstado", () => {
  it("soma cada estado e o total", () => {
    const contagem = contarPorEstado([
      linha({ estado: "publicado" }),
      linha({ estado: "publicado" }),
      linha({ estado: "fora_da_vitrine" }),
      linha({ estado: "vendido" }),
      linha({ estado: "fora_do_feed" }),
    ]);
    expect(contagem).toEqual({
      todos: 5,
      publicado: 2,
      fora_da_vitrine: 1,
      vendido: 1,
      fora_do_feed: 1,
    });
  });

  it("o contador de publicados não conta o bloqueado", () => {
    // É o número do cabeçalho da régua de filtros — "quantos carros o site
    // está mostrando". Somar o bloqueado ali infla a vitrine no relatório.
    const contagem = contarPorEstado([
      linha({ estado: "publicado" }),
      linha({ estado: "fora_da_vitrine" }),
      linha({ estado: "fora_da_vitrine" }),
    ]);
    expect(contagem.publicado).toBe(1);
    expect(contagem.fora_da_vitrine).toBe(2);
  });

  it("lista vazia zera tudo em vez de quebrar", () => {
    expect(contarPorEstado([])).toEqual({
      todos: 0,
      publicado: 0,
      fora_da_vitrine: 0,
      vendido: 0,
      fora_do_feed: 0,
    });
  });
});

describe("normalizarBusca", () => {
  it("tira acento e caixa", () => {
    expect(normalizarBusca("  Citroën C4  ")).toBe("citroen c4");
  });
});

describe("filtrarLinhas", () => {
  const linhas = [
    linha({ id: "4821", marca: "Land Rover", modelo: "Evoque", estado: "publicado", placa: "ABC1D23" }),
    linha({ id: "4830", marca: "Toyota", modelo: "SW4", estado: "vendido" }),
    linha({ id: "4907", marca: "Citroën", modelo: "C4 Cactus", estado: "fora_do_feed" }),
    linha({ id: "900000001", marca: "Fiat", modelo: "Strada", estado: "fora_da_vitrine" }),
  ];

  it("sem filtro devolve tudo", () => {
    expect(filtrarLinhas(linhas)).toHaveLength(4);
  });

  it("filtra por estado", () => {
    expect(filtrarLinhas(linhas, { estado: "vendido" }).map((l) => l.id)).toEqual(["4830"]);
  });

  it("o filtro de publicados não devolve o bloqueado", () => {
    expect(filtrarLinhas(linhas, { estado: "publicado" }).map((l) => l.id)).toEqual(["4821"]);
  });

  it("o filtro novo isola quem falta pôr no ar", () => {
    // A lista de trabalho: quem está no pátio e o site não mostra.
    expect(filtrarLinhas(linhas, { estado: "fora_da_vitrine" }).map((l) => l.id)).toEqual([
      "900000001",
    ]);
  });

  it("acha por modelo sem acento", () => {
    expect(filtrarLinhas(linhas, { busca: "citroen" }).map((l) => l.id)).toEqual(["4907"]);
  });

  it("acha pelo código do veículo", () => {
    expect(filtrarLinhas(linhas, { busca: "4830" }).map((l) => l.id)).toEqual(["4830"]);
  });

  it("acha pela placa — a busca por placa nunca funcionou no painel antigo", () => {
    expect(filtrarLinhas(linhas, { busca: "abc1d23" }).map((l) => l.id)).toEqual(["4821"]);
  });

  it("combina estado e busca", () => {
    expect(filtrarLinhas(linhas, { estado: "publicado", busca: "toyota" })).toEqual([]);
  });
});

describe("versaoParaExibir", () => {
  it("some quando o modelo já traz a versão — o caso do feed", () => {
    // "camaro ss 6.2 v-8 2p" no modelo, "ss 6.2 v-8 2p" na versão: a segunda
    // linha era um eco em caixa baixa da primeira.
    expect(versaoParaExibir("Camaro Ss 6.2 V-8 2p", "ss 6.2 v-8 2p")).toBe("");
  });

  it("aparece quando diz algo que o modelo não diz", () => {
    expect(versaoParaExibir("Range Rover Evoque", "R-Dynamic SE")).toBe("R-Dynamic SE");
  });

  it("versão vazia não vira texto", () => {
    expect(versaoParaExibir("Onix", "")).toBe("");
    expect(versaoParaExibir("Onix", "   ")).toBe("");
  });

  it("ignora acento na comparação", () => {
    expect(versaoParaExibir("Citroën C4 Cactus Feel", "feel")).toBe("");
  });
});

describe("modeloEVersaoParaExibir", () => {
  it("a versão na cauda do modelo migra do título para a linha de baixo", () => {
    // O caso da ficha da BMW: título em três linhas repetindo a versão inteira.
    expect(
      modeloEVersaoParaExibir("X4 M40i 3.0 M Sport Edit V6 Turbo Aut", "m40i 3.0 m sport edit v6 turbo aut"),
    ).toEqual({ modelo: "X4", versao: "m40i 3.0 m sport edit v6 turbo aut" });
    expect(modeloEVersaoParaExibir("Camaro Ss 6.2 V-8 2p", "ss 6.2 v-8 2p")).toEqual({
      modelo: "Camaro",
      versao: "ss 6.2 v-8 2p",
    });
  });

  it("sem sobreposição, o par passa intacto", () => {
    expect(modeloEVersaoParaExibir("Range Rover Evoque", "R-Dynamic SE")).toEqual({
      modelo: "Range Rover Evoque",
      versao: "R-Dynamic SE",
    });
  });

  it("modelo igual à versão não zera o título", () => {
    expect(modeloEVersaoParaExibir("208", "208")).toEqual({ modelo: "208", versao: "" });
  });

  it("versão vazia não vira linha", () => {
    expect(modeloEVersaoParaExibir("Onix", "")).toEqual({ modelo: "Onix", versao: "" });
  });

  it("compara a cauda sem acento e sem caixa", () => {
    expect(modeloEVersaoParaExibir("Citroën C4 Cactus Feel", "feel")).toEqual({
      modelo: "Citroën C4 Cactus",
      versao: "feel",
    });
  });

  it("eco fora da cauda continua só sumindo, como em versaoParaExibir", () => {
    expect(modeloEVersaoParaExibir("Feel C4 Cactus", "feel")).toEqual({
      modelo: "Feel C4 Cactus",
      versao: "",
    });
  });
});

describe("idDoCaminhoDaPagina", () => {
  it("extrai o id do fim do slug da PDP", () => {
    expect(
      idDoCaminhoDaPagina("/carros/land-rover/evoque/r-dynamic/land-rover-evoque-r-dynamic-4821"),
    ).toBe("4821");
  });

  it("ignora a query string e a barra final", () => {
    expect(idDoCaminhoDaPagina("/carros/fiat/argo/drive/fiat-argo-drive-77/?utm_source=meta")).toBe("77");
  });

  it("pega o ÚLTIMO número, não o do nome do modelo", () => {
    // "208" e "500" são modelos; o id é o que vem depois do último hífen.
    expect(idDoCaminhoDaPagina("/carros/peugeot/208/griffe/peugeot-208-griffe-6512")).toBe("6512");
    expect(idDoCaminhoDaPagina("/carros/fiat/500/cult/fiat-500-cult-33")).toBe("33");
  });

  it("caminho que não é de veículo devolve null", () => {
    expect(idDoCaminhoDaPagina("/estoque")).toBeNull();
    expect(idDoCaminhoDaPagina("")).toBeNull();
  });
});

describe("mapaDeVisitas", () => {
  it("null do GA4 continua null — nunca vira zero", () => {
    // Zero diria "ninguém viu este carro". Sem credencial, a verdade é "não sei".
    expect(mapaDeVisitas(null)).toBeNull();
  });

  it("soma caminhos diferentes que apontam para o mesmo veículo", () => {
    const mapa = mapaDeVisitas([
      { caminho: "/carros/a/b/c/a-b-c-10", visitas: 30 },
      { caminho: "/carros/a/b/c/a-b-c-10?ref=x", visitas: 12 },
      { caminho: "/estoque", visitas: 900 },
    ]);
    expect(mapa).toEqual({ "10": 42 });
  });
});

describe("contarLeadsPorVeiculo", () => {
  it("conta por veículo e ignora lead sem veículo", () => {
    const mapa = contarLeadsPorVeiculo([
      { veiculo_id: 4821 },
      { veiculo_id: "4821" },
      { veiculo_id: null },
      { veiculo_id: "" },
      {},
      { veiculo_id: 99 },
    ]);
    expect(mapa).toEqual({ "4821": 2, "99": 1 });
  });
});

// ---------------------------------------------------------------------------
// A tela não reescreve a régua
// ---------------------------------------------------------------------------

const RAIZ = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf-8");

/** Comentário pode citar o número pelo nome; o código, não. */
const semComentarios = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("a tabela A6 mostra o estado novo e o motivo dele", () => {
  const tabela = ler("src", "components", "admin", "TabelaDeEstoque.tsx");
  const pagina = ler("src", "app", "admin", "estoque", "page.tsx");

  it("todo estado tem rótulo legível", () => {
    // Estado sem rótulo sai como célula vazia — a tabela deixaria de responder
    // justamente na coluna que motivou esta rodada.
    const estados: EstadoDoVeiculo[] = ["publicado", "fora_da_vitrine", "vendido", "fora_do_feed"];
    for (const e of estados) expect(ROTULO_DO_ESTADO[e], e).toBeTruthy();
  });

  it("o filtro da régua superior oferece o estado novo", () => {
    // Sem o chip, o bloqueado só apareceria misturado em "Todos" e a lista de
    // trabalho ("o que falta pôr no ar") não existiria na tela.
    expect(tabela).toContain('id: "fora_da_vitrine"');
    expect(tabela).toContain("Fora da vitrine");
  });

  it("o motivo é o texto que `bloqueiosDePublicacao` já escreve", () => {
    // Texto solto aqui envelheceria sozinho: o número de fotos pode baixar, e
    // a frase muda conforme a origem ("suba as fotos pelo painel" × "as fotos
    // vêm do RevendaMais"). A tela imprime, não redige.
    const codigo = semComentarios(tabela);
    expect(codigo).toContain("b.texto");
    expect(codigo).toContain("b.bloqueia");
  });

  it("a coluna de fotos cobra `MINIMO_DE_FOTOS`, não um 8 digitado", () => {
    // Estava `l.fotos >= 8` e `/8` no JSX. O número tem nome exatamente porque
    // pode baixar — e no dia em que baixar, a coluna tem de baixar junto.
    const codigo = semComentarios(tabela);
    expect(codigo).toContain("MINIMO_DE_FOTOS");
    expect(codigo).not.toMatch(/l\.fotos\s*[<>]=?\s*8\b/);
  });

  it("a página monta a linha com os dois sinais que faltavam", () => {
    expect(pagina).toContain("bloqueiosDePublicacao(bruto)");
    expect(pagina).toContain("noUltimoSync");
  });

  it("a contagem de fotos da linha sai da mesma coluna que a régua conta", () => {
    // O mapper inventa uma foto quando o array está vazio. Contando dali, a
    // coluna diria "1/8" ao lado de um bloqueio escrito "0 de 8 fotos".
    expect(semComentarios(pagina)).toContain("bruto.whatsapp_images");
  });
});
