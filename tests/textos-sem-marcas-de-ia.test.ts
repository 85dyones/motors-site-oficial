import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { marcasFortes, marcasFracas } from "./marcasDeIA";
import {
  PERGUNTAS_POR_CAMINHO,
  perguntasDeCategoria,
  textoDeCarroceria,
  textoDeCambio,
  textoDeFaixaDePreco,
  textoDeMarca,
  textoDeModelo,
  textoDePerfil,
} from "../src/lib/textoDosHubs";
import { PAGINAS_GEO } from "../src/lib/paginasGeo";
import {
  PERGUNTAS_DE_FINANCIAMENTO,
  PERGUNTAS_DE_GARANTIA,
  SECOES_DE_GARANTIA,
  TEXTO_DE_FINANCIAMENTO,
  TEXTO_DE_GARANTIA,
  RESUMO_DA_GARANTIA,
} from "../src/lib/paginasInstitucionais";
import { TEXTO_LAUDO_PENDENTE, TEXTO_PONTE_DO_GUIA } from "../src/lib/textoDoLaudo";
import { PERFIS_DE_USO } from "../src/lib/perfisDeUso";
import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { todoOTextoDoRepasse } from "./textoDoRepasse";

/**
 * Os textos dos hubs e dos guias passam pelo humanizer (decisão do dono,
 * 2026-09-21) — os existentes foram revisados nessa data, e esta trava é o que
 * mantém os NOVOS no mesmo padrão.
 *
 * A régua é `tests/marcasDeIA.ts`: as marcas FORTES reprovam (travessão,
 * "não é X, é Y", abertura encenada, frase de efeito, vocabulário de IA,
 * resíduo de chat). As fracas só aparecem no relatório de cada peça, porque às
 * vezes "X, não Y" é exatamente o que a frase precisa.
 *
 * O que ela varre:
 *   · todo lote de guia em `conteudo-seo/` (`guias-*.json` e `guia-*.json`) —
 *     é por onde guia novo entra no banco;
 *   · o lote de textos de hub editados (`textos-de-hub-humanizados.json`);
 *   · o texto que o código gera para os hubs de marca, modelo, carroceria,
 *     faixa e perfil, com estoque e sem estoque;
 *   · as páginas geográficas, `/financiamento`, `/garantia` e o texto do laudo.
 *
 * O que ela NÃO alcança: texto escrito direto no painel (guia ou hub). Esse
 * passa pela revisão de quem publica — a skill está instalada para isso.
 */

const CONTEUDO = join(__dirname, "..", "conteudo-seo");

interface GuiaJson {
  slug: string;
  descricao: string;
  corpo: { titulo: string; paragrafos: string[] }[];
  faq: { pergunta: string; resposta: string }[];
  saida?: { apoio?: string };
}

function guiasDoLote(arquivo: string): GuiaJson[] {
  const d = JSON.parse(readFileSync(join(CONTEUDO, arquivo), "utf8"));
  if (Array.isArray(d.guias)) return d.guias;
  return [d as GuiaJson];
}

function textoDoGuia(g: GuiaJson): string {
  return [
    g.descricao,
    ...g.corpo.flatMap((s) => [s.titulo, ...s.paragrafos]),
    ...g.faq.flatMap((f) => [f.pergunta, f.resposta]),
    g.saida?.apoio ?? "",
  ].join("\n");
}

const LOTES_DE_GUIA = readdirSync(CONTEUDO).filter((a) => /^guias?-.*\.json$/.test(a));

function semMarcas(texto: string, onde: string) {
  const achadas = marcasFortes(texto);
  expect(achadas.map((m) => `${m.regra}: …${m.trecho}…`), onde).toEqual([]);
}

describe("guias: nenhum lote carrega marca forte de IA", () => {
  it("a varredura acha os lotes", () => {
    expect(LOTES_DE_GUIA.length).toBeGreaterThanOrEqual(5);
  });

  for (const arquivo of LOTES_DE_GUIA) {
    for (const guia of guiasDoLote(arquivo)) {
      it(`${arquivo} · ${guia.slug}`, () => semMarcas(textoDoGuia(guia), guia.slug));
    }
  }
});

describe("hubs editados: nenhum texto carrega marca forte de IA", () => {
  const { textos } = JSON.parse(readFileSync(join(CONTEUDO, "textos-de-hub-humanizados.json"), "utf8")) as {
    textos: { caminho: string; paragrafos: string[] }[];
  };

  it("são os 31 caminhos do banco", () => {
    expect(textos).toHaveLength(31);
  });

  it.each(textos.map((t) => [t.caminho, t] as const))("%s", (caminho, t) => {
    semMarcas(t.paragrafos.join("\n"), caminho);
  });
});

describe("hubs gerados pelo código", () => {
  const carro = (id: number, marca: string, modelo: string, tipo: string, preco: number, ano: number, cambio: string) =>
    mapVeiculoDbToVeiculo({ id, marca, modelo, versao: "1.0", tipo, preco, ano, quilometragem: 40000, cambio } as never);
  const COM = [
    carro(1, "volkswagen", "saveiro", "Picape", 69900, 2021, "Manual"),
    carro(2, "volkswagen", "polo", "Hatch", 89900, 2022, "Automático"),
  ];

  const gerados: [string, string[]][] = [
    ["marca com estoque", textoDeMarca("Volkswagen", COM, ["Saveiro", "Polo"])],
    ["marca sem estoque", textoDeMarca("Kia", [], ["Picanto"], "f")],
    ["modelo com estoque", textoDeModelo("Volkswagen", "Saveiro", COM.slice(0, 1), "f")],
    ["modelo sem estoque", textoDeModelo("Volkswagen", "Taos", [], "m")],
    ["carroceria com estoque", textoDeCarroceria("Picape", COM.slice(0, 1), "Picapes", "f")],
    ["carroceria sem estoque", textoDeCarroceria("Van", [], "Vans", "f")],
    ["faixa com estoque", textoDeFaixaDePreco("de R$ 60 a 100 mil", COM)],
    ["faixa sem estoque", textoDeFaixaDePreco("acima de R$ 100 mil", [])],
    ["câmbio com estoque", textoDeCambio("automático", "automáticos", COM.slice(1))],
    ["câmbio sem estoque", textoDeCambio("automático", "automáticos", [])],
    ...PERFIS_DE_USO.slice(0, 3).map((p) => [`perfil ${p.nome}`, textoDePerfil(p, COM)] as [string, string[]]),
    ["perfil sem estoque", textoDePerfil(PERFIS_DE_USO[0], [])],
  ];

  it.each(gerados)("%s", (onde, paragrafos) => semMarcas(paragrafos.join("\n"), onde));

  it("as perguntas frequentes por caminho e as gerais", () => {
    const todas = [
      ...Object.values(PERGUNTAS_POR_CAMINHO).flat(),
      ...perguntasDeCategoria("Volkswagen Saveiro", "f", "/carros/volkswagen/saveiro"),
      ...perguntasDeCategoria("SUVs", "m", "/estoque/suv"),
    ];
    semMarcas(todas.map((f) => `${f.pergunta}\n${f.resposta}`).join("\n"), "FAQ dos hubs");
  });
});

describe("páginas geográficas, /financiamento, /garantia e o texto do laudo", () => {
  it.each(PAGINAS_GEO.map((p) => [p.slug, p] as const))("%s", (slug, p) => {
    semMarcas([p.descricao, p.titulo, ...p.paragrafos, ...p.faq.flatMap((f) => [f.pergunta, f.resposta])].join("\n"), slug);
  });

  it("/financiamento", () => {
    semMarcas(["Depois da simulação", ...TEXTO_DE_FINANCIAMENTO, ...PERGUNTAS_DE_FINANCIAMENTO.flatMap((f) => [f.pergunta, f.resposta])].join("\n"), "/financiamento");
  });

  it("/garantia", () => {
    semMarcas(
      [
        ...RESUMO_DA_GARANTIA.flatMap((r) => [r.rotulo, r.texto]),
        ...TEXTO_DE_GARANTIA,
        ...SECOES_DE_GARANTIA.flatMap((s) => [s.titulo, ...s.paragrafos]),
        ...PERGUNTAS_DE_GARANTIA.flatMap((f) => [f.pergunta, f.resposta]),
      ].join("\n"),
      "/garantia",
    );
  });

  it("o texto do laudo", () => {
    semMarcas(`${TEXTO_LAUDO_PENDENTE}\n${TEXTO_PONTE_DO_GUIA}`, "textoDoLaudo");
  });
});

describe("a seção de repasse", () => {
  it("todo o texto de paginaDoRepasse.ts, o fixo e o montado", () => {
    semMarcas(todoOTextoDoRepasse().join("\n"), "paginaDoRepasse");
  });
});

describe("a régua pega o que diz pegar", () => {
  it.each([
    ["O laudo — que é da loja — sai a pedido.", "§8 travessão"],
    ["A diferença não é o modelo, é o histórico.", "§1 não é X, é Y"],
    ["A pergunta útil não é qual é melhor, e sim qual erra menos.", "§1 não X, e sim Y"],
    ["Isso não é falha do exame. É o exame fazendo o que deve.", "§1 contraste em duas frases"],
    ["Carro bom. A verdade é que ninguém olha.", "§4 abertura encenada"],
    ["No fim do dia, é procedência.", "§3 frase de efeito"],
    ["Vale ressaltar que a perícia é independente.", "§12 vocabulário de IA"],
    ["É a pergunta certa, e nem sempre o vendedor conta.", "§22 resíduo de chat"],
  ])("%s → %s", (texto, regra) => {
    expect(marcasFortes(texto).map((m) => m.regra)).toContain(regra);
  });

  it("hífen de palavra composta não é travessão", () => {
    expect(marcasFortes("O T-Cross tem ar-condicionado e pós-venda.")).toEqual([]);
  });

  it("\"X, não Y\" é fraca: aparece no relatório, não reprova", () => {
    const texto = "Troque a correia pelo prazo, não pela aparência.";
    expect(marcasFortes(texto)).toEqual([]);
    expect(marcasFracas(texto).map((m) => m.regra)).toContain("§1 X, não Y (cauda)");
  });
});
