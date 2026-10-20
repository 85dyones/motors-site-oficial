import { describe, expect, it } from "vitest";
import {
  FOTOS_POR_PEDIDO_AO_MODELO,
  TETO_DE_FOTOS_POR_CARRO,
  correcaoValida,
  descricaoValida,
  fotosNaTela,
  fraseDoResultado,
  linhaDasCamadas,
  situacaoDasFotos,
  escolherFotos,
  fotosDaGaleria,
  fotosDoCarro,
  fotosNoHistorico,
  lerClassificacao,
  linhaDasFotosNoEstado,
  montarPedidoDeClassificacao,
  ofertaDepoisDasFotos,
  pedidoDeFotosValido,
  resumoDasFotos,
  semFotoDaCamada,
  type CamadaDaFoto,
  type FotoClassificada,
} from "../src/lib/fotosDoAtendimento";

/**
 * As fotos do carro em camadas (2026-10-20): de fora primeiro, o interior se
 * o cliente quiser, os detalhes um de cada vez.
 */

const f = (posicao: number, camada: FotoClassificada["camada"], extra: Partial<FotoClassificada> = {}): FotoClassificada => ({
  url: `https://f.teste/${posicao}.jpg`,
  posicao,
  camada,
  angulo: null,
  descricao: null,
  aproveitavel: true,
  ...extra,
});

const ONIX: FotoClassificada[] = [
  f(0, "externa", { angulo: "tres_quartos_frente", descricao: "Frente" }),
  f(1, "externa", { angulo: "frente" }),
  f(2, "externa", { angulo: "frente" }),
  f(3, "externa", { angulo: "lateral" }),
  f(4, "externa", { angulo: "traseira" }),
  f(5, "interior", { descricao: "Painel" }),
  f(6, "detalhes", { descricao: "Teto solar panorâmico" }),
  f(7, "detalhes", { descricao: "Faróis de LED" }),
  f(8, "detalhes", { descricao: "teto solar panorâmico" }),
  f(9, "rodas", { descricao: "Roda aro 17" }),
  f(10, "motor"),
  f(11, "outra", { aproveitavel: false }),
  f(12, "interior", { aproveitavel: false, descricao: "Tremida" }),
];

describe("a galeria que vai ao modelo e ao cliente", () => {
  it("só http(s), sem repetir, até o teto — o /logo.png do carro sem foto fica fora", () => {
    expect(fotosDoCarro(["/logo.png", "https://a/1.jpg", "https://a/1.jpg", "", null, "http://a/2.jpg"])).toEqual(["https://a/1.jpg", "http://a/2.jpg"]);
    expect(fotosDoCarro(Array.from({ length: 40 }, (_, i) => `https://a/${i}.jpg`))).toHaveLength(TETO_DE_FOTOS_POR_CARRO);
    expect(fotosDoCarro(null)).toEqual([]);
  });

  it("o pedido do agente: id só com dígitos, camada que existe; sem camada é a de fora", () => {
    expect(pedidoDeFotosValido({ veiculo: "#7950008", camada: "interior" })).toEqual({ veiculo: "7950008", camada: "interior" });
    // Zero à esquerda não é do id; id maior que 15 dígitos não é um anúncio.
    expect(pedidoDeFotosValido({ veiculo: "007950008" })).toEqual({ veiculo: "7950008", camada: "externa" });
    expect(pedidoDeFotosValido({ veiculo: "1234567890123456" })).toBeNull();
    expect(pedidoDeFotosValido({ veiculo: 7950008 })).toEqual({ veiculo: "7950008", camada: "externa" });
    expect(pedidoDeFotosValido({ veiculo: "abc", camada: "externa" })).toBeNull();
    expect(pedidoDeFotosValido({ veiculo: "1", camada: "outra" })).toBeNull();
    expect(pedidoDeFotosValido(null)).toBeNull();
  });
});

describe("a classificação", () => {
  const lote = [
    { url: "https://f.teste/a.jpg", posicao: 0 },
    { url: "https://f.teste/b.jpg", posicao: 1 },
    { url: "https://f.teste/c.jpg", posicao: 2 },
  ];

  it("as fotos vão numa mensagem de usuário, numeradas, em baixa resolução", () => {
    const [sistema, usuario] = montarPedidoDeClassificacao({ nome: "Onix LT 2020" }, lote);
    expect(sistema.role).toBe("system");
    expect(sistema.content).toContain('"porta_malas"');
    expect(usuario.role).toBe("user");
    expect(usuario.content).toEqual([
      { type: "text", text: "Carro: Onix LT 2020. 3 foto(s), na ordem:" },
      { type: "text", text: "Foto 1:" },
      { type: "image_url", image_url: { url: "https://f.teste/a.jpg", detail: "low" } },
      { type: "text", text: "Foto 2:" },
      { type: "image_url", image_url: { url: "https://f.teste/b.jpg", detail: "low" } },
      { type: "text", text: "Foto 3:" },
      { type: "image_url", image_url: { url: "https://f.teste/c.jpg", detail: "low" } },
    ]);
    expect(FOTOS_POR_PEDIDO_AO_MODELO).toBe(12);
  });

  it("lê a resposta pelo número da foto, inclusive dentro de cerca de código", () => {
    const r = lerClassificacao(
      '```json\n{"fotos":[{"n":2,"camada":"interior","angulo":"frente","descricao":"painel digital","aproveitavel":true},{"n":1,"camada":"externa","angulo":"lateral","descricao":"Lateral\\ncom link https://x.y/z","aproveitavel":true}]}\n```',
      lote,
    );
    expect(r).toEqual([
      // Descrição com link é descartada inteira; a foto vale.
      { url: "https://f.teste/a.jpg", posicao: 0, camada: "externa", angulo: "lateral", descricao: null, aproveitavel: true },
      // Ângulo só vale para a foto de fora; a descrição começa maiúscula.
      { url: "https://f.teste/b.jpg", posicao: 1, camada: "interior", angulo: null, descricao: "Painel digital", aproveitavel: true },
      // A foto que o modelo pulou fica de fora — e na fila, para um pedido menor depois.
    ]);
  });

  it("camada inventada vira 'outra'; sem classificar nenhuma foto, é nula (o lote fica na fila)", () => {
    expect(lerClassificacao('{"fotos":[{"n":1,"camada":"teto"}]}', lote.slice(0, 1))![0]).toMatchObject({ camada: "outra", aproveitavel: false });
    expect(lerClassificacao("não consegui ver", lote)).toBeNull();
    expect(lerClassificacao('{"outra":"coisa"}', lote)).toBeNull();
    expect(lerClassificacao('{"fotos":[]}', lote)).toBeNull();
    expect(lerClassificacao('{"fotos":[{"n":7,"camada":"externa"}]}', lote)).toBeNull();
  });

  it("numeração a partir de zero é reconhecida", () => {
    const r = lerClassificacao('{"fotos":[{"n":0,"camada":"externa"},{"n":1,"camada":"interior"},{"n":2,"camada":"motor"}]}', lote);
    expect(r!.map((x) => [x.url, x.camada])).toEqual([
      ["https://f.teste/a.jpg", "externa"],
      ["https://f.teste/b.jpg", "interior"],
      ["https://f.teste/c.jpg", "motor"],
    ]);
  });

  it("a descrição vira legenda: uma linha, curta — e descartada inteira com link, dinheiro, placa ou contato", () => {
    expect(descricaoValida("  roda   de liga\nleve  ")).toBe("Roda de liga leve");
    expect(descricaoValida("a".repeat(30) + " " + "b".repeat(40))!.length).toBeLessThanOrEqual(60);
    expect(descricaoValida(42)).toBeNull();
    // O modelo de visão LÊ o que está escrito na foto.
    for (const ruim of [
      "veja www.golpe.com agora",
      "visite golpe.com.br",
      "Etiqueta R$ 79.900 no vidro",
      "etiqueta 79.900",
      "por 79 mil",
      "Placa ABC1D23",
      "placa abc-0123",
      "chama no 41 99999-0000",
      "contato@loja.com",
    ]) {
      expect(descricaoValida(ruim), ruim).toBeNull();
    }
    // O que é do carro passa: aro, motor, ano e quilometragem.
    expect(descricaoValida("Roda aro 17")).toBe("Roda aro 17");
    expect(descricaoValida("Motor 1.0 turbo")).toBe("Motor 1.0 turbo");
    expect(descricaoValida("Emblema 2021")).toBe("Emblema 2021");
    expect(descricaoValida("Painel com 48.000 km")).toBe("Painel com 48.000 km");
  });

  it("descrição antiga, gravada antes da regra, também não escapa pela oferta nem pelo catálogo", () => {
    const comPreco = [f(0, "externa"), f(1, "interior"), f(2, "detalhes", { descricao: "Etiqueta R$ 79.900 no vidro" }), f(3, "detalhes", { descricao: "Teto solar" })];
    expect(ofertaDepoisDasFotos(comPreco, new Set<CamadaDaFoto>(["externa", "interior"]))).toBe("Tenho também fotos dos detalhes da versão (teto solar). Quer ver alguma?");
    expect(resumoDasFotos(comPreco, 4)).not.toContain("79");
  });
});

describe("o que vai ao prompt", () => {
  it("o resumo do catálogo conta as aproveitáveis por camada, com os destaques dos detalhes", () => {
    expect(resumoDasFotos(ONIX, 13)).toBe("fotos: fora 5 · interior 1 · detalhes da versão 3 (teto solar panorâmico e faróis de LED) · rodas 1 · motor 1");
    expect(resumoDasFotos([], 18)).toBe("fotos: 18 (ainda não separadas por camada)");
    expect(resumoDasFotos([], 0)).toBeNull();
  });

  it("o estado diz o que já foi e o que ainda dá para oferecer", () => {
    const linha = linhaDasFotosNoEstado({ id: "7950008", nome: "Onix LT 2020" }, ONIX, new Set<CamadaDaFoto>(["externa"]));
    expect(linha).toBe("- #7950008 Onix LT 2020: já enviou fora; ainda pode oferecer: interior, detalhes da versão (teto solar panorâmico e faróis de LED), rodas, motor.");
    expect(linhaDasFotosNoEstado({ id: "1", nome: "X" }, [], new Set())).toBe("- #1 X: já enviou fotos da galeria; ainda pode oferecer: nada — já mostrou tudo.");
  });

  it("o histórico resume o grupo de fotos numa linha", () => {
    expect(fotosNoHistorico(4, "externa", "7950008")).toBe("(enviou 4 fotos de fora do carro #7950008)");
    expect(fotosNoHistorico(1, "motor", "1")).toBe("(enviou 1 foto do motor do carro #1)");
    expect(fotosNoHistorico(4, null, "1")).toBe("(enviou 4 fotos da galeria do carro #1)");
  });
});

describe("a escolha das fotos", () => {
  it("de fora: a capa e um de cada ângulo antes de repetir, na ordem da galeria", () => {
    expect(escolherFotos(ONIX, "externa", new Set()).map((x) => x.posicao)).toEqual([0, 1, 3, 4]);
  });

  it("não repete a que já foi, e respeita o tamanho da camada", () => {
    const ja = new Set(["https://f.teste/0.jpg", "https://f.teste/3.jpg"]);
    expect(escolherFotos(ONIX, "externa", ja).map((x) => x.posicao)).toEqual([1, 2, 4]);
    expect(escolherFotos(ONIX, "detalhes", new Set()).map((x) => x.posicao)).toEqual([6, 7, 8]);
    expect(escolherFotos(ONIX, "rodas", new Set()).map((x) => x.posicao)).toEqual([9]);
  });

  it("foto não aproveitável não vai", () => {
    expect(escolherFotos(ONIX, "interior", new Set()).map((x) => x.posicao)).toEqual([5]);
  });

  it("sem classificação, a galeria em ordem, de quatro em quatro", () => {
    const urls = ["a", "b", "c", "d", "e", "f"];
    expect(fotosDaGaleria(urls, new Set())).toEqual(["a", "b", "c", "d"]);
    expect(fotosDaGaleria(urls, new Set(["a", "b", "c", "d"]))).toEqual(["e", "f"]);
  });
});

describe("a oferta depois das fotos, uma camada por vez", () => {
  const vistas = (...c: CamadaDaFoto[]) => new Set<CamadaDaFoto>(c);

  it("de fora → interior → os detalhes → o que sobrou → nada", () => {
    expect(ofertaDepoisDasFotos(ONIX, vistas("externa"))).toBe("Quer ver o interior também?");
    expect(ofertaDepoisDasFotos(ONIX, vistas("externa", "interior"))).toBe(
      "Tenho também fotos dos detalhes da versão (teto solar panorâmico e faróis de LED), das rodas e do motor. Quer ver alguma?",
    );
    expect(ofertaDepoisDasFotos(ONIX, vistas("externa", "interior", "rodas"))).toBe(
      "Se quiser, tenho também fotos dos detalhes da versão (teto solar panorâmico e faróis de LED) e do motor.",
    );
    expect(ofertaDepoisDasFotos(ONIX, vistas("externa", "interior", "detalhes", "rodas", "motor"))).toBeNull();
  });

  it("quem pediu o interior primeiro recebe a oferta das de fora", () => {
    expect(ofertaDepoisDasFotos(ONIX, vistas("interior"))).toBe("Quer ver as fotos de fora também?");
  });

  it("nunca oferece camada que o carro não tem", () => {
    const soFora = ONIX.filter((x) => x.camada === "externa");
    expect(ofertaDepoisDasFotos(soFora, vistas("externa"))).toBeNull();
  });

  it("sem foto da camada: a equipe manda", () => {
    expect(semFotoDaCamada("motor")).toBe("Não tenho foto do motor desse carro aqui, mas a nossa equipe consegue te mandar. 😉");
    expect(semFotoDaCamada("externa")).toBe("Não tenho as fotos desse carro aqui agora, mas a nossa equipe consegue te mandar. 😉");
  });
});

describe("a aba Fotos", () => {
  const urls = ["https://f.teste/0.jpg", "https://f.teste/1.jpg", "https://f.teste/2.jpg", "https://f.teste/3.jpg"];
  const classificadas: FotoClassificada[] = [
    f(0, "externa", { descricao: "Frente" }),
    f(1, "interior", { aproveitavel: false }),
    f(2, "outra", { aproveitavel: false, corrigida: true }),
    // Foto que saiu da galeria: a linha fica, mas não aparece nem conta.
    { ...f(9, "motor"), url: "https://f.teste/velha.jpg" },
  ];

  it("a galeria atual, na ordem do anúncio, com a classificação de cada foto e a fila", () => {
    expect(fotosNaTela(urls, classificadas)).toEqual([
      { url: urls[0], posicao: 0, camada: "externa", descricao: "Frente", aproveitavel: true, corrigida: false },
      { url: urls[1], posicao: 1, camada: "interior", descricao: null, aproveitavel: false, corrigida: false },
      { url: urls[2], posicao: 2, camada: "outra", descricao: null, aproveitavel: false, corrigida: true },
      { url: urls[3], posicao: 3, camada: null, descricao: null, aproveitavel: false, corrigida: false },
    ]);
  });

  it("o andamento do carro: o que vai, o que não vai, a fila e o que foi corrigido", () => {
    const s = situacaoDasFotos(urls, classificadas);
    expect(s).toEqual({ total: 4, classificadas: 3, pendentes: 1, porCamada: { externa: 1 }, foraDoEnvio: 2, corrigidas: 1 });
    expect(linhaDasCamadas(s)).toBe("fora 1");
    expect(linhaDasCamadas(situacaoDasFotos(urls, []))).toBe("nada separado ainda");
  });

  it("a correção que a tela manda, conferida", () => {
    expect(correcaoValida({ veiculo: "#7950008", url: urls[0], camada: "outra", descricao: " banner\nda loja " })).toEqual({
      ok: true,
      veiculo: "7950008",
      url: urls[0],
      camada: "outra",
      descricao: "Banner da loja",
    });
    expect(correcaoValida({ veiculo: "1", url: "/logo.png", camada: "externa" })).toMatchObject({ ok: false });
    expect(correcaoValida({ veiculo: "1", url: urls[0], camada: "teto" })).toMatchObject({ ok: false });
    expect(correcaoValida({ url: urls[0], camada: "externa" })).toMatchObject({ ok: false });
  });

  it("o resultado de classificar agora, numa frase", () => {
    expect(fraseDoResultado({ ok: true, fotos_classificadas: 12, falhas: 0, restantes: 2 })).toBe("12 fotos classificadas. Ficaram 2 carro(s) para a próxima rodada.");
    expect(fraseDoResultado({ ok: true, fotos_classificadas: 1, falhas: 1, motivo: "timeout" })).toBe("1 foto classificada. 1 pedido(s) ao modelo falharam e voltam à fila (timeout).");
    expect(fraseDoResultado({ ok: false, fotos_classificadas: 0, falhas: 0, motivo: "falta DEEPSEEK_API_KEY na Vercel" })).toBe("Não classificou: falta DEEPSEEK_API_KEY na Vercel.");
  });
});
