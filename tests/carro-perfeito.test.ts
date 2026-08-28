import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import {
  TAGS_DA_RESPOSTA,
  comEtiquetasOuTodos,
  getVehicleTags,
  tagsDeConsulta,
  calculateMatchScore,
} from "../src/lib/car-match";
import { SLUGS_DE_PERFIL } from "../src/lib/perfisDeUso";
import { CARROCERIAS } from "../src/lib/classificacaoVeiculo";
import { slugificar } from "../src/lib/veiculoUrl";
import type { Veiculo } from "../src/types";

/**
 * `/carro-perfeito` — o quiz e o estoque falando a mesma língua.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * Havia TRÊS vocabulários que não se cruzavam: os ids das respostas
 * (`family`, `comfort`, `tech`, `immediate`), as etiquetas que o motor
 * inventava a partir de pedaços de nome (`luxury`, `premium`, `popular`, com
 * `defender`, `x5` e `911` cravados — os carros do catálogo FICTÍCIO), e os
 * campos que o cadastro real passou a ter: `perfis_uso` e `tipo`.
 *
 * Medido contra os 35 veículos servidos em 2026-08-28, ANTES:
 *
 *   OBJETIVO 1 de 4 · ESTILO 2 de 5 · EXPERIÊNCIA 0 de 4 · PRAZO 0 de 3
 *   → 108 das 240 combinações de respostas devolviam ZERO carro.
 *
 * DEPOIS: OBJETIVO 4/4, EXPERIÊNCIA 4/4, e nenhuma combinação termina sem
 * sugestão.
 */

const RESPOSTAS_DO_QUIZ = {
  objetivo: ["family", "status", "efficiency", "offroad"],
  estilo: ["suv", "sedan", "sport", "pickup", "open"],
  experiencia: ["performance", "comfort", "tech", "economy"],
  prazo: ["immediate", "researching", "future"],
} as const;

const carro = (over: Partial<Veiculo> = {}): Veiculo =>
  ({
    id: "1",
    marca: "Chevrolet",
    modelo: "Onix",
    versao: "1.0",
    ano: 2020,
    quilometragem: 50000,
    cambio: "Manual",
    combustivel: "Flex",
    preco_original: 70000,
    preco_promocional: 0,
    tipo: "Hatch",
    perfis_uso: ["urbano", "economico"],
    opcionais: "",
    ...over,
  }) as Veiculo;

describe("1 · toda resposta do quiz é traduzível", () => {
  it("nenhuma cai como etiqueta crua por esquecimento", () => {
    // O que não está na tabela passa direto — é o que mantém
    // `/api/match?tags=suv` funcionando. Mas uma RESPOSTA do quiz passando
    // direto é o defeito antigo voltando: `comfort` virava a etiqueta
    // "comfort", que veículo nenhum tem.
    for (const grupo of Object.values(RESPOSTAS_DO_QUIZ)) {
      for (const resposta of grupo) {
        expect(TAGS_DA_RESPOSTA, resposta).toHaveProperty(resposta);
      }
    }
  });

  it("as respostas do quiz batem com as opções da tela", () => {
    // A tabela e a tela envelhecem separadas: acrescentar uma alternativa no
    // componente sem traduzi-la aqui devolve o quiz ao estado anterior, e
    // nada avisa.
    const fonte = ler("src/components/CarMatch.tsx");
    for (const grupo of Object.values(RESPOSTAS_DO_QUIZ)) {
      for (const resposta of grupo) {
        expect(fonte, `${resposta} sumiu da tela`).toContain(`id: "${resposta}"`);
      }
    }
  });

  it("PRAZO não filtra carro nenhum", () => {
    // Prazo é qualificação de lead para o consultor. Entrava no filtro só
    // porque a chamada juntava as quatro respostas num array só — e quem tem
    // pressa não quer outro carro, quer o mesmo mais rápido.
    for (const resposta of RESPOSTAS_DO_QUIZ.prazo) {
      expect(tagsDeConsulta([resposta]), resposta).toEqual([]);
    }
  });

  it("cada tradução aponta para vocabulário que existe no cadastro", () => {
    // Traduzir para um valor que ninguém marca é a mesma categoria vazia, com
    // outro nome.
    const validos = new Set<string>([
      ...SLUGS_DE_PERFIL,
      ...CARROCERIAS.map((c) => slugificar(c)),
      "automatico",
      "manual",
      "flex",
      "diesel",
      "eletrico",
      "hibrido",
    ]);
    for (const [resposta, tags] of Object.entries(TAGS_DA_RESPOSTA)) {
      for (const t of tags) {
        expect(validos, `${resposta} → ${t}`).toContain(t);
      }
    }
  });
});

describe("2 · as etiquetas saem do cadastro, não do nome", () => {
  it("`perfis_uso` e carroceria viram etiqueta", () => {
    const tags = getVehicleTags(carro({ tipo: "SUV", perfis_uso: ["familia", "estrada"] }));
    expect(tags).toContain("suv");
    expect(tags).toContain("familia");
    expect(tags).toContain("estrada");
  });

  it("os nomes de modelo cravados saíram do código", () => {
    // `defender`, `x5`, `911`, `dolphin`, `renegade` eram os carros do
    // MOCK_ESTOQUE. O motor descrevia um pátio que não existe.
    const fonte = lerCodigo("src/lib/car-match.ts");
    for (const nome of ["defender", "x5", "911", "dolphin", "renegade", "duster", "taos", "burmester"]) {
      expect(fonte.toLowerCase(), `nome cravado: ${nome}`).not.toContain(`"${nome}`);
    }
  });

  it("o campo antigo entra só quando a lista nova está vazia", () => {
    // Somar os dois enchia o conjunto de lixo: "Família / Conforto" slugifica
    // para `familia--conforto`, que resposta nenhuma alcança.
    const comLista = getVehicleTags(carro({ perfis_uso: ["urbano"], perfil_uso: "Família / Conforto" }));
    expect(comLista).toContain("urbano");
    expect(comLista.join(" ")).not.toContain("familia--conforto");

    const semLista = getVehicleTags(carro({ perfis_uso: [], perfil_uso: "Urbano" }));
    expect(semLista).toContain("urbano");
  });

  it("carroceria usa a MESMA slugificação de `/estoque/{recorte}`", () => {
    // Se as duas divergissem, "SUV" no quiz e `/estoque/suv` deixariam de
    // querer dizer a mesma coisa — e ninguém notaria pela tela.
    for (const nome of CARROCERIAS) {
      expect(getVehicleTags(carro({ tipo: nome }))).toContain(slugificar(nome));
    }
  });
});

describe("3 · nenhuma combinação de respostas fica sem resposta", () => {
  /** Amostra que reproduz a distribuição real medida no pátio. */
  const patio: Veiculo[] = [
    carro({ id: "a", tipo: "SUV", perfis_uso: ["familia", "estrada"], preco_original: 180000, cambio: "Automático" }),
    carro({ id: "b", tipo: "Hatch", perfis_uso: ["urbano", "economico"], preco_original: 62900 }),
    carro({ id: "c", tipo: "Sedan", perfis_uso: ["familia", "urbano"], preco_original: 89900 }),
    carro({ id: "d", tipo: "Picape", perfis_uso: ["trabalho"], preco_original: 120000 }),
    carro({ id: "e", tipo: "Hatch", perfis_uso: ["economico"], preco_original: 23900 }),
    // O pátio real tem 3 de 35 em `performance`. Sem um aqui, a amostra
    // descreveria uma loja que não existe — e o teste passaria a medir a
    // amostra em vez do motor.
    carro({ id: "f", tipo: "Esportivo", perfis_uso: ["performance"], preco_original: 318900, cambio: "Automático" }),
  ];

  it("toda combinação das quatro perguntas casa com alguém", () => {
    // A asserção que descreve o defeito relatado: cinco perguntas respondidas
    // e "nenhum carro" era o desfecho de 45% das combinações.
    const semCasar: string[] = [];
    for (const o of RESPOSTAS_DO_QUIZ.objetivo)
      for (const e of RESPOSTAS_DO_QUIZ.estilo)
        for (const x of RESPOSTAS_DO_QUIZ.experiencia)
          for (const p of RESPOSTAS_DO_QUIZ.prazo) {
            const alvo = tagsDeConsulta([o, e, x, p]);
            const casando = patio.filter((v) => {
              const vt = getVehicleTags(v);
              return alvo.some((t) => vt.includes(t));
            });
            if (casando.length === 0) semCasar.push([o, e, x, p].join(" + "));
          }
    expect(semCasar).toEqual([]);
  });

  it("e o motor tem rede para o pátio de amanhã", () => {
    // O teste acima cobre o estoque de hoje. Um pátio só de picapes, ou o dia
    // em que o último carro `performance` for vendido, volta a produzir
    // combinação sem casamento — e aí a rede é o que impede o quiz de terminar
    // sem sugestão.
    const soPicapes = [carro({ tipo: "Picape", perfis_uso: ["trabalho"] })];
    const alvo = tagsDeConsulta(["status", "sport", "performance", "immediate"]);
    expect(alvo.length).toBeGreaterThan(0);
    expect(comEtiquetasOuTodos(soPicapes, alvo)).toHaveLength(1);
  });

  it("mas a rede não vira peneira: quem casa exclui quem não casa", () => {
    // Se `comEtiquetasOuTodos` devolvesse sempre tudo, o quiz nunca ficaria
    // vazio e também nunca recomendaria nada — as cinco perguntas viravam
    // enfeite.
    const misto = [
      carro({ id: "x", tipo: "SUV", perfis_uso: ["familia"] }),
      carro({ id: "y", tipo: "Hatch", perfis_uso: ["economico"] }),
    ];
    const so = comEtiquetasOuTodos(misto, tagsDeConsulta(["family"]));
    expect(so.map((v) => v.id)).toEqual(["x"]);
  });

  it("sem nada que restrinja, todo carro vale 100", () => {
    // Só orçamento, ou só PRAZO: não há critério para dar nota, e inventar uma
    // faria o quiz ordenar por acaso.
    expect(calculateMatchScore(carro(), ["immediate"])).toBe(100);
    expect(calculateMatchScore(carro(), [])).toBe(100);
  });

  it("a nota cresce com quantas etiquetas casam", () => {
    const v = carro({ tipo: "SUV", perfis_uso: ["familia"] });
    const uma = calculateMatchScore(v, ["family", "sedan"]);
    const duas = calculateMatchScore(v, ["family", "suv"]);
    expect(duas).toBeGreaterThan(uma);
  });
});

describe("4 · o quiz pergunta as cinco", () => {
  const fonte = ler("src/components/CarMatch.tsx");

  it("a aba DESCREVER responde a pergunta 01 e segue para a 02", () => {
    // Era o que travava o dono: a aba vive sob "Qual a faixa de investimento",
    // ao lado de FAIXA e VALOR EXATO, e pulava direto para o resultado.
    const bloco = fonte.slice(fonte.indexOf("const confirmAiCuratorQuery"), fonte.indexOf("const selectBudget"));
    expect(bloco).toContain('setGameState("q2")');
    expect(bloco).not.toContain('setGameState("loading")');
  });

  it("não inventa resposta que ninguém deu", () => {
    // `experience: "tech"` e `timeline: "researching"` eram cravados, e o
    // perfil chegava ao consultor como se fossem escolha do cliente.
    const bloco = fonte.slice(fonte.indexOf("const parseFreeTextQuery"), fonte.indexOf("const selectBudget"));
    expect(bloco).not.toContain('experience: "tech"');
    expect(bloco).not.toContain('timeline: "researching"');
    // E o objetivo, quando o texto não diz, fica em branco em vez de "status".
    expect(bloco).toContain('let obj: AnswerState["objective"] = "";');
  });

  it("o slider de valor exato cabe no pátio", () => {
    // `min={100000}` era mais que o dobro do carro mediano (R$ 62.900): quem
    // usasse a aba não conseguia descrever dois terços da vitrine.
    const codigo = lerCodigo("src/components/CarMatch.tsx");
    expect(codigo).not.toContain("min={100000}");
    expect(codigo).toContain("min={faixaDoSlider.min}");
    expect(codigo).toContain("budgetMax: orcamentoDoSlider");
  });
});
