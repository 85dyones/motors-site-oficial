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
  prontoParaPublicar,
  reclassificarLinha,
  resumoDaFilaDeRascunhos,
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
import { ESTADOS_DO_CADASTRO } from "../src/lib/estadoDoCadastro";

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
 *
 * ---------------------------------------------------------------------------
 * O que mudou com a F0-q (30/08, mesma tarde)
 * ---------------------------------------------------------------------------
 * `estado_cadastro` virou a fonte primária. Os testes de `fora_do_feed` saíram
 * com o estado: ele era derivado da janela de sync, que a importação MANUAL
 * transforma em ruído — importar um carro só mandaria o estoque inteiro para
 * "fora do feed" no painel enquanto o site continuava mostrando todo mundo. O
 * que o substitui é `arquivado`, que é decisão de gente e o site lê igual.
 */

/** N fotos de verdade, no formato em que a coluna guarda. */
const comFotos = (n: number) => Array.from({ length: n }, (_, i) => `https://s3/foto-${i}.jpg`);

/** Um veículo que passa em tudo — o ponto de partida para negar um item por vez. */
const publicavelDeVerdade = {
  estado_cadastro: "publicado",
  vendido: false,
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
    estadoCadastro: "publicado",
    vendido: false,
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
  it("publicado, não vendido e com as fotos, é publicado", () => {
    expect(classificarEstado(publicavelDeVerdade)).toBe("publicado");
  });

  it("vendido nulo é tratado como não vendido", () => {
    expect(classificarEstado({ ...publicavelDeVerdade, vendido: null })).toBe("publicado");
  });

  // -------------------------------------------------------------------------
  // A decisão da loja é a fonte primária (F0-q)
  // -------------------------------------------------------------------------

  it("rascunho é rascunho, mesmo com as oito fotos e o laudo", () => {
    // O carro pode estar impecável: enquanto ninguém publicar, ele não está no
    // ar. Cair em "publicado" aqui seria a tela contando que o site mostra um
    // carro que `getEstoque` não serve.
    expect(classificarEstado({ ...publicavelDeVerdade, estado_cadastro: "rascunho" })).toBe(
      "rascunho",
    );
  });

  it("rascunho vence o bloqueio de fotos — são tarefas diferentes", () => {
    // Chamar todo rascunho de "fora da vitrine" apagaria a decisão pendente e
    // mandaria quem importou procurar fotógrafo em vez de revisar cadastro.
    const rascunhoSemFoto = { estado_cadastro: "rascunho", vendido: false, whatsapp_images: [] };
    expect(classificarEstado(rascunhoSemFoto)).toBe("rascunho");
  });

  it("arquivado vence tudo, inclusive a venda", () => {
    // `getSinaisDeEstoque` responde "saiu do estoque" para qualquer coisa que
    // não seja `publicado`. Deixar "Vendido" por cima diria que o carro está no
    // ar com o selo — e ele não está em lugar nenhum.
    expect(
      classificarEstado({ ...publicavelDeVerdade, estado_cadastro: "arquivado", vendido: true }),
    ).toBe("arquivado");
    expect(classificarEstado({ ...publicavelDeVerdade, estado_cadastro: "arquivado" })).toBe(
      "arquivado",
    );
  });

  it("vendido vence rascunho — venda encerra a fila de preparação", () => {
    // O repasse vendido antes de o anúncio subir não pode ficar em "falta
    // finalizar" para sempre.
    const rascunhoVendido = { estado_cadastro: "rascunho", vendido: true, whatsapp_images: [] };
    expect(classificarEstado(rascunhoVendido)).toBe("vendido");
  });

  it("estado desconhecido ou ausente cai em rascunho, nunca em publicado", () => {
    // O piso de `normalizarEstadoCadastro`: rascunho é o único dos três que não
    // afirma nada sobre o site. É também o que acontece num banco sem a
    // migração — barulhento de propósito, e a tela A6 explica.
    expect(classificarEstado({ ...publicavelDeVerdade, estado_cadastro: "no_ar" })).toBe("rascunho");
    expect(classificarEstado({ ...publicavelDeVerdade, estado_cadastro: null })).toBe("rascunho");
    expect(classificarEstado({ vendido: false, whatsapp_images: comFotos(12) })).toBe("rascunho");
  });

  // -------------------------------------------------------------------------
  // O bug anterior: cadastrado ≠ publicado
  // -------------------------------------------------------------------------

  it("publicado com ZERO foto NÃO é publicado — é fora da vitrine", () => {
    // O caso literal do achado, agora sobre um carro que a loja JÁ liberou:
    // decisão tomada, material faltando.
    const liberadoSemFoto = { estado_cadastro: "publicado", vendido: false, whatsapp_images: [], origem: "painel" };
    expect(classificarEstado(liberadoSemFoto)).toBe("fora_da_vitrine");
  });

  it("uma foto abaixo do mínimo ainda é fora da vitrine", () => {
    const quaseLa = { ...publicavelDeVerdade, whatsapp_images: comFotos(MINIMO_DE_FOTOS - 1) };
    expect(classificarEstado(quaseLa)).toBe("fora_da_vitrine");
  });

  it("no mínimo exato já é publicado — a borda é `>=`, não `>`", () => {
    const noMinimo = { ...publicavelDeVerdade, whatsapp_images: comFotos(MINIMO_DE_FOTOS) };
    expect(classificarEstado(noMinimo)).toBe("publicado");
  });

  it("publicado sem `whatsapp_images` conta como zero foto, não como publicado", () => {
    // Cair para "publicado" por falta de dado é a mentira de origem. E é o que
    // `getEstoque` faz com essa mesma linha: corta.
    expect(classificarEstado({ estado_cadastro: "publicado", vendido: false })).toBe(
      "fora_da_vitrine",
    );
  });

  it("sem laudo NÃO tira do ar hoje — pendência não é bloqueio", () => {
    // 38 das 39 fichas de 27/08 estão sem laudo. Se a falta virasse estado, a
    // tabela declararia a loja inteira fora da vitrine e o alarme viraria ruído.
    // Quem decide isso é `LAUDO_BLOQUEIA_PUBLICACAO`, não esta função.
    const semLaudo = { ...publicavelDeVerdade, laudo_pericia: "" };
    expect(classificarEstado(semLaudo)).toBe("publicado");
  });

  it("vendido vence o bloqueio — a venda explica melhor que a foto", () => {
    const vendidoSemFoto = { estado_cadastro: "publicado", vendido: true, whatsapp_images: [] };
    expect(classificarEstado(vendidoSemFoto)).toBe("vendido");
  });

  it('"publicado" na tabela é exatamente o que a vitrine serve', () => {
    // A invariante que fecha o buraco: enquanto esta comparação valer, o painel
    // e o site não têm como discordar sobre o mesmo carro. Do lado do site são
    // DUAS condições desde a F0-q — `estado_cadastro = 'publicado'` e
    // `publicavel` —, e é isso que a comparação abaixo replica.
    const casos = [
      publicavelDeVerdade,
      { ...publicavelDeVerdade, whatsapp_images: comFotos(1) },
      { ...publicavelDeVerdade, whatsapp_images: comFotos(MINIMO_DE_FOTOS - 1) },
      { ...publicavelDeVerdade, laudo_pericia: "" },
      { ...publicavelDeVerdade, estado_cadastro: "rascunho" },
      { ...publicavelDeVerdade, estado_cadastro: "arquivado" },
      { estado_cadastro: "publicado", vendido: false, whatsapp_images: [], origem: "painel" },
    ];
    for (const v of casos) {
      const noSite = v.estado_cadastro === "publicado" && publicavel(v);
      expect(classificarEstado(v) === "publicado", JSON.stringify(v)).toBe(noSite);
    }
  });
});

describe("reclassificarLinha", () => {
  // A tela muda `vendido`, publica e arquiva em lote, e atualiza a linha sem
  // recarregar. Escrever "publicado" à mão nesse ponto devolvia a mentira pela
  // porta dos fundos.
  const semFotos = linha({
    estado: "fora_da_vitrine",
    bloqueios: bloqueiosDePublicacao({ whatsapp_images: [] }),
  });

  it("devolver a disponível NÃO publica carro sem fotos", () => {
    expect(reclassificarLinha(semFotos, { vendido: false })).toBe("fora_da_vitrine");
  });

  it("devolver a disponível publica quem tem as fotos", () => {
    const completo = linha({
      bloqueios: bloqueiosDePublicacao({
        whatsapp_images: comFotos(MINIMO_DE_FOTOS),
      }),
    });
    expect(reclassificarLinha(completo, { vendido: false })).toBe("publicado");
  });

  it("devolver a disponível não desarquiva ninguém", () => {
    // O sucessor do antigo "não inventa feed para quem está fora dele": o
    // arquivado só volta por ato de quem publica.
    const arquivado = linha({ estado: "arquivado", estadoCadastro: "arquivado" });
    expect(reclassificarLinha(arquivado, { vendido: false })).toBe("arquivado");
    expect(reclassificarLinha(arquivado, { vendido: true })).toBe("arquivado");
  });

  it("devolver a disponível não publica rascunho", () => {
    const rascunho = linha({ estado: "rascunho", estadoCadastro: "rascunho" });
    expect(reclassificarLinha(rascunho, { vendido: false })).toBe("rascunho");
  });

  it("marcar como vendido vence o rascunho e o bloqueio", () => {
    expect(reclassificarLinha(semFotos, { vendido: true })).toBe("vendido");
    expect(
      reclassificarLinha(linha({ estadoCadastro: "rascunho" }), { vendido: true }),
    ).toBe("vendido");
  });

  it("publicar leva a linha a publicado — e a arquivar, a arquivado", () => {
    const rascunhoPronto = linha({
      estado: "rascunho",
      estadoCadastro: "rascunho",
      bloqueios: bloqueiosDePublicacao({
        whatsapp_images: comFotos(MINIMO_DE_FOTOS),
      }),
    });
    expect(reclassificarLinha(rascunhoPronto, { estadoCadastro: "publicado" })).toBe("publicado");
    expect(reclassificarLinha(rascunhoPronto, { estadoCadastro: "arquivado" })).toBe("arquivado");
  });

  it("publicar um bloqueado deixa a linha em fora da vitrine, não em publicado", () => {
    // A tela e a rota impedem esse clique; se um dia passar, a etiqueta continua
    // dizendo a verdade em vez de anunciar um carro que a vitrine corta.
    expect(reclassificarLinha(semFotos, { estadoCadastro: "publicado" })).toBe("fora_da_vitrine");
  });

  it("sem mudança nenhuma, a linha se reclassifica igual", () => {
    expect(reclassificarLinha(semFotos)).toBe("fora_da_vitrine");
  });

  it("a pendência que não bloqueia não muda o estado", () => {
    // Este teste já montou o motivo À MÃO, num período em que nenhum motivo com
    // `bloqueia: false` existia — o laudo, que era o único, saiu da régua em
    // 29/08. Voltou ao caso real em 01/09: cinco fotos passa da porta (4) e não
    // chega na ficha completa (8).
    //
    // Vale mais assim. Objeto montado à mão sobrevive à regra sumir; construído
    // pela função, o teste cai junto com ela.
    const soPendencia = linha({
      bloqueios: bloqueiosDePublicacao({ whatsapp_images: comFotos(5) }),
    });
    expect(soPendencia.bloqueios.map((b) => b.id)).toEqual(["fotos-incompletas"]);
    expect(reclassificarLinha(soPendencia, { vendido: false })).toBe("publicado");
  });
});

describe("contarPorEstado", () => {
  it("soma cada estado e o total", () => {
    const contagem = contarPorEstado([
      linha({ estado: "publicado" }),
      linha({ estado: "publicado" }),
      linha({ estado: "fora_da_vitrine" }),
      linha({ estado: "vendido" }),
      linha({ estado: "rascunho" }),
      linha({ estado: "arquivado" }),
    ]);
    expect(contagem).toEqual({
      todos: 6,
      rascunho: 1,
      publicado: 2,
      fora_da_vitrine: 1,
      vendido: 1,
      arquivado: 1,
    });
  });

  it("o contador de publicados não conta o bloqueado nem o rascunho", () => {
    // É o número do cabeçalho da régua de filtros — "quantos carros o site
    // está mostrando". Somar o bloqueado ali infla a vitrine no relatório; somar
    // o rascunho infla mais ainda, porque ele nem foi liberado.
    const contagem = contarPorEstado([
      linha({ estado: "publicado" }),
      linha({ estado: "fora_da_vitrine" }),
      linha({ estado: "fora_da_vitrine" }),
      linha({ estado: "rascunho" }),
    ]);
    expect(contagem.publicado).toBe(1);
    expect(contagem.fora_da_vitrine).toBe(2);
    expect(contagem.rascunho).toBe(1);
  });

  it("lista vazia zera tudo em vez de quebrar", () => {
    expect(contarPorEstado([])).toEqual({
      todos: 0,
      rascunho: 0,
      publicado: 0,
      fora_da_vitrine: 0,
      vendido: 0,
      arquivado: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// A fila de trabalho de quem importou
// ---------------------------------------------------------------------------

describe("resumoDaFilaDeRascunhos", () => {
  const prontoDeVerdade = bloqueiosDePublicacao({
    whatsapp_images: comFotos(MINIMO_DE_FOTOS),
  });
  const semFoto = bloqueiosDePublicacao({ whatsapp_images: comFotos(2) });

  it("separa o que vai ao ar com um clique do que espera material", () => {
    // O contador do chip responde "quantos rascunhos"; esta função responde a
    // pergunta que decide o que fazer agora.
    const resumo = resumoDaFilaDeRascunhos([
      linha({ estado: "rascunho", bloqueios: prontoDeVerdade }),
      linha({ estado: "rascunho", bloqueios: prontoDeVerdade }),
      linha({ estado: "rascunho", bloqueios: semFoto }),
      linha({ estado: "publicado", bloqueios: prontoDeVerdade }),
      linha({ estado: "arquivado", bloqueios: semFoto }),
    ]);
    expect(resumo).toEqual({ total: 3, prontos: 2, bloqueados: 1 });
  });

  it("o rascunho vendido não é trabalho de ninguém", () => {
    // Ele aparece em "Vendidos", e a fila tem de concordar com o chip.
    const resumo = resumoDaFilaDeRascunhos([linha({ estado: "vendido", bloqueios: semFoto })]);
    expect(resumo.total).toBe(0);
  });

  it("a pendência que não bloqueia não segura ninguém na fila", () => {
    // Mesma história do teste acima, e a mesma volta ao caso real em 01/09.
    //
    // A razão original vale igual: se pendência contasse como bloqueio, a fila
    // diria que nenhum rascunho pode ser publicado, e o número que a tela mostra
    // deixaria de significar "quantos posso pôr no ar agora". Um carro de cinco
    // fotos ESTÁ pronto para publicar — falta material, não permissão.
    const soPendencia = bloqueiosDePublicacao({ whatsapp_images: comFotos(5) });
    expect(soPendencia.map((b) => b.id)).toEqual(["fotos-incompletas"]);
    const resumo = resumoDaFilaDeRascunhos([linha({ estado: "rascunho", bloqueios: soPendencia })]);
    expect(resumo).toEqual({ total: 1, prontos: 1, bloqueados: 0 });
  });

  it("estoque sem rascunho devolve zeros em vez de quebrar", () => {
    expect(resumoDaFilaDeRascunhos([])).toEqual({ total: 0, prontos: 0, bloqueados: 0 });
  });
});

describe("prontoParaPublicar", () => {
  it("é falso enquanto houver bloqueio, verdadeiro quando não houver", () => {
    expect(
      prontoParaPublicar(linha({ bloqueios: bloqueiosDePublicacao({ whatsapp_images: [] }) })),
    ).toBe(false);
    expect(
      prontoParaPublicar(
        linha({
          bloqueios: bloqueiosDePublicacao({ whatsapp_images: comFotos(MINIMO_DE_FOTOS) }),
        }),
      ),
    ).toBe(true);
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
    linha({ id: "4907", marca: "Citroën", modelo: "C4 Cactus", estado: "arquivado" }),
    linha({ id: "900000001", marca: "Fiat", modelo: "Strada", estado: "fora_da_vitrine" }),
    linha({ id: "900000002", marca: "Renault", modelo: "Duster", estado: "rascunho" }),
  ];

  it("sem filtro devolve tudo", () => {
    expect(filtrarLinhas(linhas)).toHaveLength(5);
  });

  it("filtra por estado", () => {
    expect(filtrarLinhas(linhas, { estado: "vendido" }).map((l) => l.id)).toEqual(["4830"]);
  });

  it("o filtro de publicados não devolve o bloqueado", () => {
    expect(filtrarLinhas(linhas, { estado: "publicado" }).map((l) => l.id)).toEqual(["4821"]);
  });

  it("o filtro de fora da vitrine isola o publicado que falta material", () => {
    expect(filtrarLinhas(linhas, { estado: "fora_da_vitrine" }).map((l) => l.id)).toEqual([
      "900000001",
    ]);
  });

  it("o filtro de rascunhos é a fila de trabalho — e não traz o bloqueado junto", () => {
    // Os dois são "não está no ar", e são tarefas diferentes: um espera
    // decisão, o outro espera foto. Misturá-los no mesmo chip faria a fila de
    // quem importou virar a fila de quem fotografa.
    expect(filtrarLinhas(linhas, { estado: "rascunho" }).map((l) => l.id)).toEqual(["900000002"]);
  });

  it("o filtro de arquivados isola quem saiu do estoque", () => {
    expect(filtrarLinhas(linhas, { estado: "arquivado" }).map((l) => l.id)).toEqual(["4907"]);
  });

  it("acha por modelo sem acento — inclusive o arquivado", () => {
    // Buscar não filtra por estado: quem procura o código de um carro que saiu
    // do pátio precisa achá-lo, senão a busca vira "só o que está no ar".
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
    const estados: EstadoDoVeiculo[] = [
      "rascunho",
      "publicado",
      "fora_da_vitrine",
      "vendido",
      "arquivado",
    ];
    for (const e of estados) expect(ROTULO_DO_ESTADO[e], e).toBeTruthy();
  });

  it("todo estado do BANCO tem etiqueta na tabela", () => {
    // A ponte entre o CHECK do SQL e a tela: um valor novo no vocabulário do
    // banco que não tivesse etiqueta apareceria como linha sem estado.
    for (const e of ESTADOS_DO_CADASTRO) {
      expect(ROTULO_DO_ESTADO[e as EstadoDoVeiculo], e).toBeTruthy();
    }
  });

  it("o filtro da régua superior oferece os cinco estados", () => {
    // Sem o chip, o rascunho só apareceria misturado em "Todos" e a fila de
    // trabalho de quem importou não existiria na tela.
    for (const id of ["rascunho", "publicado", "fora_da_vitrine", "vendido", "arquivado"]) {
      expect(tabela, id).toContain(`id: "${id}"`);
    }
    expect(tabela).toContain("Fora da vitrine");
    expect(tabela).toContain("Rascunhos");
  });

  it("decisão da loja e pendência de material não caem no mesmo balde", () => {
    // O risco desta rodada em uma linha: chamar rascunho de "fora da vitrine"
    // (ou o contrário) manda o operador para a tarefa errada. Os dois têm chip
    // próprio, e `decidirEstado` decide um antes do outro — a ordem está travada
    // nos testes de `classificarEstado` acima.
    expect(ROTULO_DO_ESTADO.rascunho).not.toBe(ROTULO_DO_ESTADO.fora_da_vitrine);
    expect(ROTULO_DO_ESTADO.arquivado).not.toBe(ROTULO_DO_ESTADO.fora_da_vitrine);
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

  it("a página monta a linha com os sinais que a régua precisa", () => {
    expect(pagina).toContain("bloqueiosDePublicacao(bruto)");
    expect(pagina).toContain("normalizarEstadoCadastro(bruto.estado_cadastro)");
  });

  it("a página NÃO volta a inferir o estado do relógio do sync", () => {
    // `apenasDoUltimoSync` continua existindo e testada (`ultimo-sync.test.ts`)
    // — ela é a régua da linha antiga. O que não pode voltar é ela decidir a
    // etiqueta desta tela: com importação manual, um ciclo parcial mandaria o
    // estoque inteiro para "fora do feed" enquanto o site mostrava todo mundo.
    expect(semComentarios(pagina)).not.toContain("apenasDoUltimoSync");
  });

  it("a contagem de fotos da linha sai da mesma coluna que a régua conta", () => {
    // O mapper inventa uma foto quando o array está vazio. Contando dali, a
    // coluna diria "1/8" ao lado de um bloqueio escrito "0 de 8 fotos".
    expect(semComentarios(pagina)).toContain("bruto.whatsapp_images");
  });
});
