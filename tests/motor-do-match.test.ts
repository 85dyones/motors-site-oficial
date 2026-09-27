import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapVeiculoDbToVeiculo } from "../src/lib/supabase";
import { disponiveisDe } from "../src/lib/regrasEstoque";
import { divergenciaDeCarroceria, publicavel } from "../src/lib/coerenciaDoCadastro";
import {
  cilindradaDe,
  combustivelDe,
  ehAutomatico,
  ehMoto,
  fichaVazia,
  motorTurbo,
  precoDoCarro,
  tracao4x4,
  modeloBase,
} from "../src/lib/fichaDoMotor";
import {
  CARROCERIAS_DE_CARGA,
  PREFERENCIAS,
  criteriosDasRespostas,
  elegivel,
  faixasDoPatio,
  passaNosFiltros,
  recomendar,
  semFiltro,
  criteriosDoPerfil,
  quantosNaFaixa,
  ITENS_QUE_NAO_PODEM_FALTAR,
  type Criterios,
  type Recomendacao,
  type PerfilDoQuiz,
  type Jeito,
  type ItemQueNaoPodeFaltar,
} from "../src/lib/motorDoMatch";
import type { Veiculo } from "../src/types";

/**
 * O motor do Garagem Profiler contra o estoque REAL de 25/09/2026.
 *
 * O fixture são as 37 linhas publicadas naquele dia (`estoque_motors` à venda,
 * no último sync e com 4 fotos ou mais), lidas do banco de produção e passadas
 * aqui pelo mapper de verdade. Colunas, na ordem:
 *
 *   id, marca, modelo, versao, modelo_override, versao_override, ano,
 *   quilometragem, cambio, combustivel, tipo, perfis_uso, preco_original,
 *   preco_promocional, portas, motor, opcionais
 *
 * O motor anterior, rodado nas mesmas combinações, dava: 41% de manuais para
 * quem pedia automático, 56% de outra carroceria para quem pedia SUV, 25% dos
 * cards abaixo do piso, a moto em 74 combinações e o X4 de R$ 318.900 para
 * quem tinha R$ 130 mil. Cada `it` abaixo trava um desses números em zero.
 */

type Linha = [
  number, string, string, string, string | null, string | null, number, number, string, string,
  string, string[] | null, number, number, number | null, string | null, string | null,
];

const LINHAS: Linha[] = JSON.parse(readFileSync(join(__dirname, "fixtures", "estoque-2026-09-25.json"), "utf8"));

const ESTOQUE: Veiculo[] = disponiveisDe(
  LINHAS.map(([id, marca, modelo, versao, mo, vo, ano, km, cambio, combustivel, tipo, perfis, po, pp, portas, motor, opcionais]) =>
    mapVeiculoDbToVeiculo({
      id, marca, modelo, versao, modelo_override: mo, versao_override: vo, ano, quilometragem: km,
      cambio, combustivel, tipo, perfis_uso: perfis, preco_original: po, preco_promocional: pp,
      portas, motor, opcionais, vendido: false,
      // Quatro fotos: o fixture já é só o que estava publicado.
      whatsapp_images: ["a", "b", "c", "d"],
    }),
  ).filter((v) => publicavel(v)),
);

const porId = (id: number) => ESTOQUE.find((v) => v.id === String(id))!;

const OBJETIVOS = ["family", "status", "efficiency", "offroad"];
const EXPERIENCIAS = ["performance", "comfort", "tech", "economy"];
const ESTILOS = ["suv", "sedan", "hatch", "sport", "pickup", "open"];
// Como a tela: a régua do motor (`carrosDoPatio` no CarMatch usa `elegivel`).
const FAIXAS = faixasDoPatio(ESTOQUE.filter(elegivel).map(precoDoCarro));

interface Rodada {
  chave: string;
  criterios: Criterios;
  r: Recomendacao;
}

const RODADAS: Rodada[] = FAIXAS.flatMap((f) =>
  OBJETIVOS.flatMap((objetivo) =>
    EXPERIENCIAS.flatMap((experiencia) =>
      ESTILOS.map((estilo) => {
        const criterios = criteriosDasRespostas({ orcamento: { min: f.min, max: f.max }, objetivo, experiencia, estilo });
        return { chave: `${f.titulo} · ${objetivo} · ${experiencia} · ${estilo}`, criterios, r: recomendar(ESTOQUE, criterios) };
      }),
    ),
  ),
);

describe("o fixture é o pátio de 25/09", () => {
  it("37 publicados: 36 carros e uma moto", () => {
    expect(ehMoto(porId(6170299))).toBe(true);
    // Trava que não lê nada passa verde. Se o fixture ou o mapper mudarem, o
    // resto deste arquivo deixa de medir o que diz medir.
    expect(ESTOQUE).toHaveLength(37);
    expect(ESTOQUE.filter((v) => v.tipo === "Motocicleta")).toHaveLength(1);
  });

  it("as faixas têm teto: a de cima não vai mais ao infinito", () => {
    expect(FAIXAS.map((f) => f.titulo)).toEqual([
      "Até R$ 50mil",
      "R$ 50mil a R$ 75mil",
      "R$ 75mil a R$ 115mil",
      "R$ 115mil a R$ 175mil",
      "Acima de R$ 175mil",
    ]);
    // A única faixa sem teto tem um carro só, e ele é o X4.
    const semTeto = FAIXAS.filter((f) => f.max === null);
    expect(semTeto).toHaveLength(1);
    expect(semTeto[0].quantos).toBe(1);
  });

  it("só a F-250 fica fora por cadastro divergente", () => {
    // A F-250 2008 está como Hatch. O Corolla Cross, SUV, era acusado de sedã
    // pela regra de "corolla" até 25/09 — e sumiria do Profiler.
    const divergentes = ESTOQUE.filter((v) => divergenciaDeCarroceria(v) !== null).map((v) => v.id);
    expect(divergentes).toEqual(["8491439"]);
    expect(elegivel(porId(8449150))).toBe(true);
  });
});

describe("a ficha do motor lê o que o carro é", () => {
  it("tração: o nome confirma, o nome nega, e o silêncio fica em aberto", () => {
    expect(tracao4x4(porId(8475062))).toBe("atende"); // Tiguan 2.0 TSI 4Motion
    expect(tracao4x4(porId(8171616))).toBe("atende"); // Titano 4x4
    expect(tracao4x4(porId(8471948))).toBe("nao-atende"); // Toro 1.3 T270 4x2
    expect(tracao4x4(porId(8252284))).toBe("nao-atende"); // Outlander: "Tração 4x2" na ficha
    expect(tracao4x4(porId(8464513))).toBe("nao-consta"); // Toro D4: nada escrito
  });

  it("turbo pelo nome ou pela ficha, e nunca negado", () => {
    expect(motorTurbo(porId(8402155))).toBe("atende"); // Virtus 200 TSI
    expect(motorTurbo(porId(8464513))).toBe("atende"); // Toro D4: "Motor turbo" na ficha
    expect(motorTurbo(porId(8443691))).toBe("nao-consta"); // Kwid
  });

  it("cilindrada ignora o `motor` inválido do feed", () => {
    expect(cilindradaDe(porId(8335204))).toBe(1.6); // Saveiro Robust: motor "0.0", nome "1.6"
    expect(cilindradaDe(porId(7947766))).toBe(3); // X4 M40i 3.0
    expect(cilindradaDe(porId(8443691))).toBeNull(); // Kwid Zen 2: o nome não diz
  });

  it("ficha vazia é lacuna, não defeito", () => {
    // O Polo 2025 chegou sem opcional nenhum. "Bem equipado" fica em aberto
    // para ele — e nunca vira "não atende".
    const polo = porId(8407873);
    expect(fichaVazia(polo)).toBe(true);
    expect(PREFERENCIAS.equipado.avaliar(polo)).toBe("nao-consta");
    expect(PREFERENCIAS.couro.avaliar(polo)).toBe("nao-consta");
    expect(PREFERENCIAS.multimidia.avaliar(polo)).toBe("nao-consta");
  });

  it("os três Ka são um modelo só", () => {
    expect(new Set([porId(7416830), porId(8335025), porId(8059102)].map(modeloBase))).toEqual(new Set(["ford ka"]));
  });
});

describe("as respostas de hoje viram fatos", () => {
  it("o que a opção promete com todas as letras vira filtro", () => {
    expect(criteriosDasRespostas({ orcamento: { min: 0, max: null }, objetivo: "family" }).portas4).toBe(true);
    expect(criteriosDasRespostas({ orcamento: { min: 0, max: null }, experiencia: "tech" }).automatico).toBe(true);
    expect(criteriosDasRespostas({ orcamento: { min: 0, max: null }, estilo: "pickup" }).carrocerias).toEqual(CARROCERIAS_DE_CARGA);
  });

  it("gosto só ordena", () => {
    const c = criteriosDasRespostas({ orcamento: { min: 0, max: null }, objetivo: "status", experiencia: "comfort", estilo: "open" });
    expect(c.portas4 || c.automatico || c.carrocerias !== null).toBe(false);
    // "automático" aparece nas duas respostas e conta uma vez.
    expect(c.preferencias.filter((p) => p === "automatico")).toHaveLength(1);
  });

  it("esportivo avisa que não há, em vez de trocar por sedã calado", () => {
    // E fica no carro de passeio: com o pátio de 25/09, sem esta linha, a Toro
    // diesel era a primeira sugestão para quem marcava esportivo.
    const c = criteriosDasRespostas({ orcamento: { min: 0, max: null }, estilo: "sport" });
    expect(c.carrocerias).toEqual(["Hatch", "Sedan", "SUV"]);
    expect(c.preferencias).toContain("turbo");
    expect(c.avisos.join(" ")).toMatch(/não temos/);
  });
});

describe(`em todas as ${RODADAS.length} combinações do quiz`, () => {
  it("nenhum cartão contradiz um filtro", () => {
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of RODADAS) {
      for (const { veiculo: v } of r.cartoes) {
        if (c.teto !== null && precoDoCarro(v) > c.teto) erros.push(`${chave}: ${v.modelo} acima do teto`);
        if (c.portas4 && (v.portas ?? 0) < 4) erros.push(`${chave}: ${v.modelo} com ${v.portas} portas`);
        if (c.automatico && ehAutomatico(v) !== true) erros.push(`${chave}: ${v.modelo} manual`);
        if (c.carrocerias && !c.carrocerias.includes(v.tipo ?? "")) erros.push(`${chave}: ${v.modelo} é ${v.tipo}`);
      }
    }
    expect(erros).toEqual([]);
  });

  it("nem moto, nem cadastro divergente", () => {
    const vistos = new Set(RODADAS.flatMap(({ r }) => [...r.cartoes.map((c) => c.veiculo), ...r.outros].map((v) => v.id)));
    expect(vistos.has("6170299")).toBe(false); // Honda ADV
    expect(vistos.has("8491439")).toBe(false); // F-250 como Hatch
  });

  it("abaixo do piso só para completar, e sempre rotulado", () => {
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of RODADAS) {
      for (const cartao of r.cartoes) {
        const abaixo = precoDoCarro(cartao.veiculo) < c.piso;
        if (abaixo && cartao.lugar !== "abaixo-da-faixa") erros.push(`${chave}: ${cartao.veiculo.modelo} sem rótulo`);
        if (abaixo && r.naFaixa >= 3) erros.push(`${chave}: completou uma faixa que já tinha três`);
        if (cartao.lugar === "abaixo-da-faixa" && !cartao.rotuloDoLugar.startsWith("ABAIXO DA SUA FAIXA")) {
          erros.push(`${chave}: rótulo errado`);
        }
      }
    }
    expect(erros).toEqual([]);
  });

  it("nenhum carro é o primeiro de todo mundo", () => {
    // O X1 era o primeiro em 19% das combinações, e o Ka aparecia em 42%.
    const primeiros = new Map<string, number>();
    for (const { r } of RODADAS) {
      const id = r.cartoes[0]?.veiculo.id;
      if (id) primeiros.set(id, (primeiros.get(id) ?? 0) + 1);
    }
    const maior = Math.max(...primeiros.values());
    expect(maior / RODADAS.length).toBeLessThanOrEqual(0.2);
  });

  it("os três são modelos diferentes sempre que a faixa tem três modelos", () => {
    const erros: string[] = [];
    for (const { chave, r } of RODADAS) {
      const naFaixa = [...r.cartoes.filter((c) => c.lugar !== "abaixo-da-faixa").map((c) => c.veiculo), ...r.outros];
      const modelosDisponiveis = new Set(naFaixa.map(modeloBase));
      const escolhidos = r.cartoes.filter((c) => c.lugar !== "abaixo-da-faixa").map((c) => modeloBase(c.veiculo));
      if (modelosDisponiveis.size >= 3 && new Set(escolhidos).size < escolhidos.length) erros.push(chave);
    }
    expect(erros).toEqual([]);
  });

  it("superlativo da manchete é vencedor único", () => {
    const erros: string[] = [];
    for (const { chave, r } of RODADAS) {
      const carros = r.cartoes.map((c) => c.veiculo);
      for (const { veiculo: v, manchete } of r.cartoes) {
        const outros = carros.filter((x) => x !== v);
        if (manchete.includes("o mais novo") || manchete.startsWith("O mais novo")) {
          if (!outros.every((x) => x.ano < v.ano)) erros.push(`${chave}: "mais novo" empatado`);
        }
        if (/o de menor km/i.test(manchete) && !outros.every((x) => x.quilometragem > v.quilometragem)) {
          erros.push(`${chave}: "menor km" empatado`);
        }
        if (/o mais barato/i.test(manchete) && !outros.every((x) => precoDoCarro(x) > precoDoCarro(v))) {
          erros.push(`${chave}: "mais barato" empatado`);
        }
      }
    }
    expect(erros).toEqual([]);
  });

  it("nenhum número inventado: o cartão não fala em porcentagem", () => {
    for (const { r } of RODADAS) {
      for (const c of r.cartoes) {
        expect(`${c.rotuloDoLugar} ${c.manchete} ${c.pesaContra ?? ""}`).not.toMatch(/%/);
      }
    }
  });

  it("faixa curta sempre vem com saída: \"e se\" ou nada a afrouxar", () => {
    // Pela FAIXA, e não pelo número de cartões: o complemento abaixo do piso
    // pode encher a tela com zero carro na faixa (revisão de 25/09).
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of RODADAS) {
      const temFiltro = c.portas4 || c.automatico || c.carrocerias !== null;
      if (r.naFaixa < 3 && temFiltro && r.eSe.length === 0) {
        // Afrouxar não traz ninguém: aceitável, mas só se de fato não traz.
        const soTeto = recomendar(ESTOQUE, { ...c, portas4: false, automatico: false, carrocerias: null });
        if (soTeto.naFaixa > r.naFaixa) erros.push(chave);
      }
    }
    expect(erros).toEqual([]);
  });

  it("o \"e se\" entrega exatamente o que promete", () => {
    // A primeira versão contava também os carros abaixo do piso: o chip dizia
    // "+12 carros" e a tela, depois do clique, mostrava cinco a mais.
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of RODADAS) {
      for (const s of r.eSe) {
        const depois = recomendar(ESTOQUE, semFiltro(c, s.filtro));
        if (depois.naFaixa - r.naFaixa !== s.entram) erros.push(`${chave}: ${s.filtro} prometeu ${s.entram}`);
        const vistos = [...depois.cartoes.map((x) => x.veiculo.id), ...depois.outros.map((v) => v.id)];
        if (s.melhor && !vistos.includes(s.melhor.id)) erros.push(`${chave}: ${s.melhor.nome} não aparece`);
      }
    }
    expect(erros).toEqual([]);
  });

  it("o complemento é o mais perto abaixo do piso (decisão 2 do dono)", () => {
    // Ordenar pela pontuação completava 115–175 mil com um Soul de R$ 76.900
    // e pulava um X1 R$ 100 abaixo do piso.
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of RODADAS) {
      const completos = r.cartoes.filter((x) => x.lugar === "abaixo-da-faixa").map((x) => x.veiculo);
      if (completos.length === 0) continue;
      const maisBaratoUsado = Math.min(...completos.map(precoDoCarro));
      const pulados = ESTOQUE.filter(
        (v) =>
          elegivel(v) &&
          passaNosFiltros(v, c) &&
          precoDoCarro(v) < c.piso &&
          precoDoCarro(v) > maisBaratoUsado &&
          !completos.includes(v),
      );
      if (pulados.length > 0) erros.push(`${chave}: pulou ${pulados.map((v) => v.modelo).join(", ")}`);
    }
    expect(erros).toEqual([]);
  });

  it("o cartão abaixo da faixa nunca diz que passa em tudo", () => {
    for (const { r } of RODADAS) {
      for (const c of r.cartoes.filter((x) => x.lugar === "abaixo-da-faixa")) {
        expect(c.manchete).not.toMatch(/Passa em todos|O único do pátio/);
      }
    }
  });

  it("carroceria no texto é a que se fala: sedã, SUV — nunca \"é suv\" nem \"é sedan\"", () => {
    for (const { r } of RODADAS) {
      for (const c of r.cartoes) {
        expect(`${c.manchete} ${c.pesaContra ?? ""}`).not.toMatch(/é suv\b|é sedan\b|único\s+dos/);
      }
    }
  });
});

describe("as cinco pessoas do painel, no estoque de 25/09", () => {
  const ids = (r: Recomendacao) => r.cartoes.map((c) => c.veiculo.id);

  it("Rafael — até R$ 50 mil, automático: a Spin, e o \"e se\" do manual", () => {
    const r = recomendar(ESTOQUE, criteriosDasRespostas({ orcamento: { min: 0, max: 50000 }, objetivo: "efficiency", experiencia: "tech", estilo: "open" }));
    // Antes: a moto em 1º com "100%", e a Spin fora dos seis.
    expect(ids(r)).toEqual(["8446229"]);
    const manual = r.eSe.find((s) => s.filtro === "automatico");
    expect(manual?.entram).toBeGreaterThanOrEqual(5);
  });

  it("Diego — R$ 91 a 130 mil: nada acima do teto, e o X4 some", () => {
    const r = recomendar(ESTOQUE, criteriosDasRespostas({ orcamento: { min: 91000, max: 130000 }, objetivo: "status", experiencia: "performance", estilo: "open" }));
    expect(ids(r)).not.toContain("7947766");
    for (const c of r.cartoes) expect(precoDoCarro(c.veiculo)).toBeLessThanOrEqual(130000);
  });

  it("Seu Jorge — carga, diesel, 4x4: a Toro diesel na frente da flex 4x2, e a Saveiro rotulada", () => {
    const r = recomendar(ESTOQUE, criteriosDasRespostas({ orcamento: { min: 91000, max: 130000 }, objetivo: "offroad", estilo: "pickup" }));
    expect(ids(r)).toEqual(["8464513", "8471948", "8335204"]);
    expect(r.cartoes[1].pesaContra).toMatch(/diesel/);
    expect(r.cartoes[2].lugar).toBe("abaixo-da-faixa");
    expect(r.cartoes[2].rotuloDoLugar).toBe("ABAIXO DA SUA FAIXA · SOBRAM R$ 67.100");
  });

  it("Carla — família e SUV até R$ 75 mil: só o que tem 4 portas e é SUV", () => {
    const r = recomendar(ESTOQUE, criteriosDasRespostas({ orcamento: { min: 50000, max: 75000 }, objetivo: "family", experiencia: "comfort", estilo: "suv" }));
    for (const c of r.cartoes) {
      expect(c.veiculo.tipo).toBe("SUV");
      expect(c.veiculo.portas).toBeGreaterThanOrEqual(4);
    }
    // Menos de três SUVs na faixa: a tela oferece as outras carrocerias.
    expect(r.cartoes.length).toBeLessThan(3);
    expect(r.eSe.map((s) => s.filtro)).toContain("carroceria");
  });

  it("Marina — R$ 75 a 115 mil, aberta: três caminhos diferentes", () => {
    const r = recomendar(ESTOQUE, criteriosDasRespostas({ orcamento: { min: 75000, max: 115000 }, estilo: "open" }));
    expect(r.cartoes).toHaveLength(3);
    expect(new Set(r.cartoes.map((c) => modeloBase(c.veiculo))).size).toBe(3);
    expect(ids(r)).not.toContain("6170299");
  });
});

// ---------------------------------------------------------------------------
// Fase 2 (25/09): as perguntas-fato
// ---------------------------------------------------------------------------

const JEITOS: Jeito[][] = [[], ["Hatch"], ["Sedan"], ["SUV"], ["Perua"], ["Hatch", "Sedan", "SUV"]];
const CAMBIOS = ["so_automatico", "prefiro_automatico", "tanto_faz", "prefiro_manual"] as const;
const ITENS: ItemQueNaoPodeFaltar[][] = [
  [],
  ...ITENS_QUE_NAO_PODEM_FALTAR.map((i) => [i.id]),
  ["2020-ou-mais-novo", "camera"],
  ["ate-80-mil-km", "seguranca", "turbo"],
];

interface RodadaDoPerfil {
  chave: string;
  perfil: PerfilDoQuiz;
  criterios: Criterios;
  r: Recomendacao;
}

const PERFIS: RodadaDoPerfil[] = FAIXAS.flatMap((f) =>
  (["eu", "familia", "carga"] as const).flatMap((leva) =>
    (leva === "carga" ? [[] as Jeito[]] : JEITOS).flatMap((jeitos) =>
      CAMBIOS.flatMap((cambio) =>
        ITENS.map((naoPodeFaltar) => {
          const perfil: PerfilDoQuiz = { orcamento: { min: f.min, max: f.max }, leva, jeitos, cambio, naoPodeFaltar };
          const criterios = criteriosDoPerfil(perfil);
          return {
            chave: `${f.titulo} · ${leva} · ${jeitos.join("/") || "tanto faz"} · ${cambio} · ${naoPodeFaltar.join("+") || "nada"}`,
            perfil,
            criterios,
            r: recomendar(ESTOQUE, criterios),
          };
        }),
      ),
    ),
  ),
);

describe("fase 2 · as respostas viram fatos", () => {
  it("família corta em 4 portas; carga, na carroceria de carga; só automático corta", () => {
    const base = { orcamento: { min: 0, max: null } };
    expect(criteriosDoPerfil({ ...base, leva: "familia" }).portas4).toBe(true);
    expect(criteriosDoPerfil({ ...base, leva: "carga" }).carrocerias).toEqual(CARROCERIAS_DE_CARGA);
    expect(criteriosDoPerfil({ ...base, cambio: "so_automatico" }).automatico).toBe(true);
    expect(criteriosDoPerfil({ ...base, cambio: "prefiro_automatico" }).automatico).toBe(false);
  });

  it("com carga, o jeito marcado não vale — a pergunta nem aparece", () => {
    const c = criteriosDoPerfil({ orcamento: { min: 0, max: null }, leva: "carga", jeitos: ["Hatch"] });
    expect(c.carrocerias).toEqual(CARROCERIAS_DE_CARGA);
  });

  it("ano, km e diesel cortam; item de ficha só ordena", () => {
    const c = criteriosDoPerfil({
      orcamento: { min: 0, max: null },
      leva: "carga",
      naoPodeFaltar: ["2020-ou-mais-novo", "ate-80-mil-km", "diesel"],
    });
    expect([c.anoMin, c.kmMax, c.diesel]).toEqual([2020, 80000, true]);
    const d = criteriosDoPerfil({ orcamento: { min: 0, max: null }, naoPodeFaltar: ["camera", "seguranca"] });
    expect(d.preferencias).toEqual(["camera", "seguranca"]);
    expect([d.anoMin, d.kmMax, d.diesel]).toEqual([null, null, false]);
  });

  it("diesel sem carga não vale, e mais de três itens não passam", () => {
    const c = criteriosDoPerfil({ orcamento: { min: 0, max: null }, leva: "eu", naoPodeFaltar: ["diesel"] });
    expect(c.diesel).toBe(false);
    const d = criteriosDoPerfil({
      orcamento: { min: 0, max: null },
      naoPodeFaltar: ["camera", "sensor", "turbo", "multimidia"],
    });
    expect(d.preferencias).toHaveLength(3);
  });
});

describe(`fase 2 · em ${PERFIS.length} combinações das perguntas novas`, () => {
  it("a contagem antes do toque é a mesma do resultado", () => {
    // "Só automático (1)" na opção tem de dar 1 carro na tela.
    const erros = PERFIS.filter(({ criterios, r }) => quantosNaFaixa(ESTOQUE, criterios) !== r.naFaixa).map((x) => x.chave);
    expect(erros).toEqual([]);
  });

  it("nenhum cartão contradiz um filtro, nem o ano, o km ou o diesel", () => {
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of PERFIS) {
      for (const { veiculo: v } of r.cartoes) {
        if (!passaNosFiltros(v, c)) erros.push(`${chave}: ${v.modelo}`);
        if (c.anoMin !== null && v.ano < c.anoMin) erros.push(`${chave}: ${v.modelo} é ${v.ano}`);
        if (c.kmMax !== null && v.quilometragem > c.kmMax) erros.push(`${chave}: ${v.modelo} tem ${v.quilometragem} km`);
        if (c.diesel && !/diesel/i.test(v.combustivel)) erros.push(`${chave}: ${v.modelo} não é diesel`);
        if (ehMoto(v) || !elegivel(v)) erros.push(`${chave}: ${v.modelo} inelegível`);
      }
    }
    expect(erros).toEqual([]);
  });

  it("\"Já pensou neste?\" cumpre as próprias regras", () => {
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of PERFIS) {
      const k = r.coringa;
      if (!k) continue;
      const v = k.veiculo;
      const primeiro = r.cartoes[0].veiculo;
      if (!passaNosFiltros(v, c)) erros.push(`${chave}: coringa fura filtro ou teto`);
      if (r.cartoes.some((x) => modeloBase(x.veiculo) === modeloBase(v))) erros.push(`${chave}: coringa repete modelo`);
      if (k.vantagens.length < 2) erros.push(`${chave}: coringa com menos de 2 vantagens`);
      // Revisão de 25/09: sem estas regras a carta virava "o mais barato que
      // passa" (um Kwid contra um X4) e escondia o que perdia.
      if (precoDoCarro(v) < precoDoCarro(primeiro) * 0.6) erros.push(`${chave}: coringa abaixo de 60% do 1º`);
      if (k.vantagens.filter((x) => !/ a menos$/.test(x)).length < 2) {
        erros.push(`${chave}: coringa que só ganha no preço`);
      }
      if (k.abaixoDaFaixa !== precoDoCarro(v) < c.piso) erros.push(`${chave}: abaixoDaFaixa errado`);
      if (r.outros.includes(v)) erros.push(`${chave}: coringa repetido em "outros"`);
      const muda = k.oQueMuda.join(" · ");
      if (tracao4x4(primeiro) === "atende" && tracao4x4(v) !== "atende" && !muda.includes("4x4")) {
        erros.push(`${chave}: perde o 4x4 e não diz`);
      }
      if (motorTurbo(primeiro) === "atende" && motorTurbo(v) !== "atende" && !muda.includes("turbo")) {
        erros.push(`${chave}: perde o turbo e não diz`);
      }
      if ((v.portas ?? 0) > 0 && (v.portas ?? 0) < (primeiro.portas ?? 0) && !muda.includes("portas")) {
        erros.push(`${chave}: tem menos portas e não diz`);
      }
      if (combustivelDe(primeiro).includes("diesel") && !combustivelDe(v).includes("diesel") && !muda.includes("diesel")) {
        erros.push(`${chave}: perde o diesel e não diz`);
      }
      for (const p of c.preferencias) {
        if (PREFERENCIAS[p].avaliar(primeiro) === "atende" && PREFERENCIAS[p].avaliar(v) !== "atende") {
          erros.push(`${chave}: coringa não atende ${p}, que o 1º atende`);
        }
      }
    }
    expect(erros).toEqual([]);
    // E a carta aparece em algum lugar — uma regra que nunca dispara não protege nada.
    expect(PERFIS.filter((x) => x.r.coringa).length).toBeGreaterThan(0);
  });

  it("o \"e se\" dos filtros novos entrega o que promete", () => {
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of PERFIS) {
      for (const s of r.eSe.filter((x) => ["ano", "km", "diesel"].includes(x.filtro))) {
        const depois = recomendar(ESTOQUE, semFiltro(c, s.filtro));
        if (depois.naFaixa - r.naFaixa !== s.entram) erros.push(`${chave}: ${s.filtro}`);
      }
    }
    expect(erros).toEqual([]);
  });
});

describe("fase 2 · o entusiasta acha a Tiguan", () => {
  it("Diego, R$ 91–130 mil, turbo: \"Já pensou neste?\" é a Tiguan 2.0 TSI 4Motion", () => {
    const r = recomendar(
      ESTOQUE,
      criteriosDoPerfil({
        orcamento: { min: 91000, max: 130000 },
        leva: "eu",
        jeitos: ["Hatch", "Sedan", "SUV"],
        cambio: "prefiro_automatico",
        naoPodeFaltar: ["turbo"],
      }),
    );
    expect(r.coringa?.veiculo.id).toBe("8475062");
    expect(r.coringa?.vantagens.join(" ")).toMatch(/a menos/);
    expect(r.coringa?.oQueMuda.join(" ")).toMatch(/2014/);
  });
});

describe("fase 2 · POR MÊS: a faixa é a parcela", () => {
  // A mesma conta do simulador da ficha (`calculateFinancing`), sobre o pátio
  // de 25/09. A pessoa diz a parcela, a entrada que ela estima e o prazo.
  // Entrada de R$ 150 mil zera a parcela de muita coisa — é onde moravam o
  // "48× R$ 0" e o desempate errado do complemento (revisão de 27/09). E as
  // cinco ocupações, porque cada uma muda a taxa.
  const PEDIDOS = [800, 1200, 1500, 2500, 5000].flatMap((max) =>
    [0, 20000, 40000, 150000].flatMap((entrada) =>
      [24, 48, 60].flatMap((prazo) =>
        (["clt", "publico", "autonomo"] as const).flatMap((ocupacao) =>
          ([null, "familia", "carga"] as const).map((leva) => ({ max, entrada, prazo, ocupacao, leva })),
        ),
      ),
    ),
  );
  const RODADAS_POR_MES = PEDIDOS.map((p) => {
    const criterios = criteriosDoPerfil({
      orcamento: { min: 0, max: null },
      leva: p.leva,
      parcela: { max: p.max, entrada: p.entrada, prazo: p.prazo, ocupacao: p.ocupacao },
    });
    return {
      chave: `${p.max}/mês · ${p.entrada} · ${p.prazo}× · ${p.ocupacao} · ${p.leva ?? "-"}`,
      criterios,
      r: recomendar(ESTOQUE, criterios),
    };
  });

  it("nenhum cartão da faixa passa da parcela; o abaixo da faixa diz quanto sobra", () => {
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of RODADAS_POR_MES) {
      for (const cartao of r.cartoes) {
        const p = cartao.parcela;
        if (!p) {
          erros.push(`${chave}: cartão sem parcela`);
          continue;
        }
        if (p.valor > c.parcela!.max + 0.005) erros.push(`${chave}: ${cartao.veiculo.id} passa da parcela`);
        const abaixo = p.valor < c.parcela!.min;
        if (abaixo !== (cartao.lugar === "abaixo-da-faixa")) erros.push(`${chave}: ${cartao.veiculo.id} fora do lugar`);
        if (abaixo && !/SOBRAM R\$ [\d.]+ POR MÊS/.test(cartao.rotuloDoLugar)) erros.push(`${chave}: rótulo sem a sobra`);
        // A regra de crédito: parcela com CET e total, e o CET acima dos juros.
        const jurosAoAno = (Math.pow(1 + p.taxaMes / 100, 12) - 1) * 100;
        if (p.valor > 0 && !(p.cetAno > jurosAoAno)) erros.push(`${chave}: CET abaixo dos juros`);
        // O preço à vista que vai ao lado do total a prazo é o do carro.
        if (p.aVista !== precoDoCarro(cartao.veiculo)) erros.push(`${chave}: à vista errado`);
        if (p.entrada > p.aVista) erros.push(`${chave}: entrada maior que o carro`);
      }
      if (r.coringa?.parcela && r.coringa.parcela.valor > c.parcela!.max + 0.005) erros.push(`${chave}: coringa passa da parcela`);
      // O complemento abaixo da faixa vem do mais perto para o mais longe:
      // parcela maior primeiro e, no empate (duas em zero), o preço maior.
      const abaixo = r.cartoes.filter((x) => x.lugar === "abaixo-da-faixa");
      for (let i = 1; i < abaixo.length; i++) {
        const [a, b] = [abaixo[i - 1], abaixo[i]];
        const pa = a.parcela!.valor;
        const pb = b.parcela!.valor;
        if (pa < pb - 0.005 || (Math.abs(pa - pb) < 0.005 && precoDoCarro(a.veiculo) < precoDoCarro(b.veiculo))) {
          erros.push(`${chave}: complemento fora de ordem`);
        }
      }
      // O preço não é filtro no POR MÊS: nada de teto de preço escondido.
      if (c.teto !== null || c.piso !== 0) erros.push(`${chave}: POR MÊS com faixa de preço`);
    }
    expect(erros).toEqual([]);
  });

  it("o \"e se\" nunca afrouxa a parcela", () => {
    const erros: string[] = [];
    for (const { chave, criterios: c, r } of RODADAS_POR_MES) {
      for (const s of r.eSe) {
        const depois = recomendar(ESTOQUE, semFiltro(c, s.filtro));
        for (const cartao of depois.cartoes) {
          if (cartao.parcela!.valor > c.parcela!.max + 0.005) erros.push(`${chave}: ${s.filtro} furou a parcela`);
        }
        if (depois.naFaixa - r.naFaixa !== s.entram) erros.push(`${chave}: ${s.filtro} promete ${s.entram}`);
      }
    }
    expect(erros).toEqual([]);
  });

  it("a contagem antes do toque é a do resultado", () => {
    for (const { chave, criterios: c, r } of RODADAS_POR_MES) {
      expect(quantosNaFaixa(ESTOQUE, c), chave).toBe(r.naFaixa);
    }
  });

  it("Carla: R$ 1.500 por mês, R$ 20 mil de entrada, família — o caso da spec", () => {
    const r = recomendar(
      ESTOQUE,
      criteriosDoPerfil({
        orcamento: { min: 0, max: null },
        leva: "familia",
        parcela: { max: 1500, entrada: 20000, prazo: 48, ocupacao: "clt" },
      }),
    );
    expect(r.filtros[0]).toBe("parcela até R$ 1.500/mês em 48×, com R$ 20 mil de entrada");
    // Kwid 2025 e 208 2023, os dois a R$ 58.900: a mesma parcela.
    const [kwid, p208] = r.cartoes;
    expect(kwid.veiculo.modelo).toMatch(/Kwid/);
    expect(p208.veiculo.modelo).toMatch(/208/);
    expect(Math.round(kwid.parcela!.valor)).toBe(Math.round(p208.parcela!.valor));
    expect(r.parcelaPedida?.max).toBe(1500);
  });
});
