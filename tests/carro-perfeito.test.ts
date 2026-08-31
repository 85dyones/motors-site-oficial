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

  it("o consultor lê exatamente o que o cliente clicou", () => {
    // Os rótulos viviam em DOIS lugares: as opções da tela e um `switch` que
    // montava a mensagem do WhatsApp e o payload do CRM. Copiar não quebra no
    // dia em que se copia — quebra no dia em que só uma das duas muda, e aí o
    // consultor recebe uma resposta que ninguém escolheu.
    //
    // Foi o que quase aconteceu ao reescrever o texto: as opções viraram "Um
    // carro melhor que o meu" e o `switch` seguiria mandando "Status,
    // Exclusividade & Design".
    const codigo = lerCodigo("src/components/CarMatch.tsx");
    for (const fn of ["formatObjective", "formatExperience", "formatStyle", "formatTimeline"]) {
      const linha = codigo.slice(codigo.indexOf(`const ${fn} =`));
      expect(linha.slice(0, 160), fn).toContain("rotuloDaOpcao(");
    }
    expect(codigo).not.toMatch(/case "status": return "Status/);
  });

  it("o texto das opções fala do pátio, não de loja premium", () => {
    // A mediana da loja é R$ 62.900 e o carro mais barato custa R$ 23.900.
    // "Status, Exclusividade & Design" e "Tecnologia, Inovação & Eficiência"
    // descreviam outra vitrine — o dono apontou o passo duas vezes.
    const fonte = ler("src/components/CarMatch.tsx");
    const bloco = fonte.slice(fonte.indexOf("const OPCOES_OBJETIVO"), fonte.indexOf("const OPCOES_ESTILO"));
    for (const morto of ["Status, Exclusividade", "Tecnologia, Inovação", "Força, Aventura", "Performance & Potência"]) {
      expect(bloco, morto).not.toContain(`titulo: "${morto}`);
    }
    expect(bloco).toContain('titulo: "Espaço para a família"');
    expect(bloco).toContain('titulo: "Rodar barato na cidade"');
  });

  it("as perguntas 02 e 03 não perguntam a mesma coisa", () => {
    // "Tecnologia, Inovação & Eficiência" na 02 e "Tecnologia &
    // Conectividade" na 03: quem respondia a primeira não sabia o que a
    // segunda queria de diferente. A 02 pergunta PARA QUE serve; a 03, o que
    // PESA na escolha.
    const fonte = ler("src/components/CarMatch.tsx");
    expect(fonte).toContain('titulo="O que mais pesa na sua escolha?"');
    const objetivo = fonte.slice(fonte.indexOf("const OPCOES_OBJETIVO"), fonte.indexOf("const OPCOES_EXPERIENCIA"));
    const experiencia = fonte.slice(fonte.indexOf("const OPCOES_EXPERIENCIA"), fonte.indexOf("const OPCOES_ESTILO"));
    const titulos = (b: string) => [...b.matchAll(/titulo: "([^"]+)"/g)].map((m) => m[1].toLowerCase());
    for (const t of titulos(objetivo)) {
      expect(titulos(experiencia), `"${t}" repete entre a 02 e a 03`).not.toContain(t);
    }
  });

  it("a pergunta 01 nunca fica sem opção clicável", () => {
    // O defeito que o dono relatou duas vezes, e que reproduzi no navegador:
    // `budgetRanges` nascia `[]` e a tela desenhava, no lugar das faixas,
    // quatro caixas cinza vazias — `aria-hidden`, sem texto e sem clique.
    // Enquanto o estoque não chegava (ou se a consulta falhasse), a primeira
    // pergunta era impossível de responder, e o único botão à vista era
    // VOLTAR.
    const codigo = lerCodigo("src/components/CarMatch.tsx");

    // O esqueleto morto saiu de vez.
    expect(codigo).not.toContain('className="h-[86px] border-2 border-mt-inverso-regua-fina"');
    // E a lista é derivada, não um estado que começa vazio.
    expect(codigo).not.toContain("useState<BudgetRange[]>([])");
    expect(codigo).toContain("const faixasDeOrcamento = useMemo<BudgetRange[]>");
  });

  it("sem estoque, valem as faixas de reserva", () => {
    // O memo tem retorno próprio para menos de 4 preços. Sem ele, o fallback
    // seria de novo uma lista vazia — o mesmo defeito com outro nome.
    const codigo = lerCodigo("src/components/CarMatch.tsx");
    const memo = codigo.slice(
      codigo.indexOf("const faixasDeOrcamento = useMemo"),
      codigo.indexOf("}, [estoque]);"),
    );
    expect(memo).toMatch(/if \(precos\.length < 4\)/);
    expect(memo).toContain("montar([50000, 65000, 90000], precos)");
  });

  it("as faixas saem de QUANTIL, não de fatia do intervalo", () => {
    // Com um carro de R$ 318.900 esticando a ponta, cortar o intervalo em
    // 15/35/60/80% punha 24 dos 35 carros numa faixa só (50–125 mil) e
    // deixava outra vazia. Era o "difícil demais fazer um match acima dos
    // 50 mil". Por quantil cada faixa leva um quarto do pátio: 7/11/9/8.
    const codigo = lerCodigo("src/components/CarMatch.tsx");
    expect(codigo).toContain("quantil(0.25)");
    expect(codigo).toContain("quantil(0.75)");
    expect(codigo).not.toContain("spread * 0.15");
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
