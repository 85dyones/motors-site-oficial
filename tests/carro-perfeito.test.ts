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
import {
  faixasDoPatio,
  CORTES_DE_RESERVA,
  criteriosDoPerfil,
  ITENS_QUE_NAO_PODEM_FALTAR,
  type PerfilDoQuiz,
} from "../src/lib/motorDoMatch";
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

/**
 * Os ids das respostas da fase 1. A tela deixou de perguntá-los em 25/09
 * (fase 2, perguntas-fato), mas `/api/match` ainda aceita o formato — uma
 * aba aberta antes do deploy manda `respostas` — e os leads antigos os
 * guardam. O prazo continua na tela, agora no resultado.
 */
const RESPOSTAS_DO_QUIZ = {
  objetivo: ["family", "status", "efficiency", "offroad"],
  estilo: ["suv", "sedan", "hatch", "sport", "pickup", "open"],
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

  it("as opções da tela são as que o motor sabe ler", () => {
    // A tela e o motor envelhecem separados: uma opção na tela que o motor
    // não conhece chega a `/api/match`, é descartada pela validação da rota e
    // não filtra nada — a pessoa responde e o resultado a ignora, calado.
    const fonte = ler("src/components/CarMatch.tsx");
    const daTela = [
      ...["eu", "familia", "carga"],
      ...["Hatch", "Sedan", "SUV", "Perua"],
      ...["so_automatico", "prefiro_automatico", "tanto_faz", "prefiro_manual"],
      ...RESPOSTAS_DO_QUIZ.prazo,
    ];
    for (const id of daTela) {
      expect(fonte, `${id} sumiu da tela`).toContain(`id: "${id}"`);
    }
    // A 05 não tem lista própria: sai da do motor.
    expect(fonte).toContain("ITENS_QUE_NAO_PODEM_FALTAR.map(");
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

describe("4 · o quiz pergunta as cinco — e só o que separa carro", () => {
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
    // E o que o texto não diz fica em branco — nada de "status" por padrão.
    expect(bloco).toContain('let leva: AnswerState["leva"] = "";');
    expect(bloco).toContain('let cambio: AnswerState["cambio"] = "";');
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
    for (const fn of ["formatLeva", "formatJeitos", "formatCambio", "formatNaoPodeFaltar", "formatTimeline"]) {
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
    const bloco = fonte.slice(fonte.indexOf("const OPCOES_LEVA"), fonte.indexOf("const OPCOES_PRAZO"));
    for (const morto of ["Status, Exclusividade", "Tecnologia, Inovação", "Força, Aventura", "Performance & Potência"]) {
      expect(bloco, morto).not.toContain(`titulo: "${morto}`);
    }
    expect(bloco).toContain('titulo: "Família, criança na cadeirinha"');
    expect(bloco).toContain('titulo: "Só automático"');
  });

  it("as perguntas de desejo saíram; cada resposta diz o que faz com o pátio", () => {
    // "Qual o principal objetivo?" e "O que mais pesa na sua escolha?" eram a
    // mesma pergunta com palavras diferentes, e nenhuma separava carro: a
    // resposta virava preferência que só reordenava. É a causa nº 1 do
    // resultado genérico medida em 25/09.
    const fonte = ler("src/components/CarMatch.tsx");
    expect(fonte).not.toContain('titulo="O que mais pesa na sua escolha?"');
    expect(fonte).not.toContain('titulo="Qual o principal objetivo na sua próxima compra?"');
    expect(fonte).toContain('titulo="O que o carro vai levar?"');
    expect(fonte).toContain('titulo="Trocar marcha no trânsito?"');
  });

  it("toda opção que não é 'tanto faz' muda o que o motor faz", () => {
    // Pela régua da spec: resposta que não muda filtro nem ordem é enfeite.
    // As neutras ("Eu e mais um", "Tanto faz") são as únicas que não mudam —
    // e é o que elas dizem.
    const base: PerfilDoQuiz = { orcamento: { min: 0, max: null } };
    const igualABase = (p: PerfilDoQuiz) => JSON.stringify(criteriosDoPerfil(p)) === JSON.stringify(criteriosDoPerfil(base));

    expect(igualABase({ ...base, leva: "eu" })).toBe(true);
    expect(igualABase({ ...base, cambio: "tanto_faz" })).toBe(true);
    for (const leva of ["familia", "carga"] as const) expect(igualABase({ ...base, leva }), leva).toBe(false);
    for (const jeito of ["Hatch", "Sedan", "SUV", "Perua"] as const) {
      expect(igualABase({ ...base, jeitos: [jeito] }), jeito).toBe(false);
    }
    for (const cambio of ["so_automatico", "prefiro_automatico", "prefiro_manual"] as const) {
      expect(igualABase({ ...base, cambio }), cambio).toBe(false);
    }
    for (const item of ITENS_QUE_NAO_PODEM_FALTAR) {
      // Diesel só vale com carga: a comparação é contra quem já leva carga.
      const semItem: PerfilDoQuiz = { ...base, leva: item.soComCarga ? "carga" : undefined };
      expect(JSON.stringify(criteriosDoPerfil({ ...semItem, naoPodeFaltar: [item.id] })), item.id).not.toBe(
        JSON.stringify(criteriosDoPerfil(semItem)),
      );
    }
  });

  it("o número de cada opção sai da transição que o toque grava", () => {
    // A primeira versão contava com `{ ...perfilAtual, ...mudanca }` — o perfil
    // de ANTES do toque, com as regras de pulo do caminho antigo — e 367
    // opções prometiam um número e entregavam outro (revisão de 25/09). As
    // transições e a conta moram em `lib/perguntasDoProfiler`, testadas lá;
    // aqui se trava que a tela as usa.
    const codigo = lerCodigo("src/components/CarMatch.tsx");
    expect(codigo).not.toMatch(/\.\.\.perfilAtual,\s*\.\.\.mudanca/);
    expect(codigo).toContain("sobramCom(comLeva(answers, o.id))");
    expect(codigo).toContain("sobramCom(comCambio(answers, o.id))");
    expect(codigo).toContain("sobramCom(comItemAlternado(answers, o.id))");
    expect(codigo).toContain("const novas = comLeva(answers, leva);");
    expect(codigo).toContain("const novas = comCambio(answers, cambio);");
    expect(codigo).toContain("comJeitoAlternado(prev, jeito)");
    expect(codigo).toContain("comItemAlternado(prev, item)");
  });

  it("o lead e a busca saem das funções testadas", () => {
    // `carrosDoLead` decide se a carta "Já pensou neste?" vai no lead;
    // `idsDasRespostas` decide o que vai ao GA4, ao Pixel e à CAPI.
    const codigo = lerCodigo("src/components/CarMatch.tsx");
    expect(codigo).toContain("carrosDoLead(recomendacao, escolhidos, modoDoLead)");
    expect(codigo).toContain("const ids = idsDasRespostas(perfilAtual);");
    expect(codigo).toMatch(/trackCarMatch\(ids, /);
    expect(codigo).not.toMatch(/trackCarMatch\((?!ids, )/);
  });

  it("POR MÊS: a aba responde a 01 pela parcela, e a busca e o lead levam a parcela", () => {
    // Decisões do dono em 25/09: taxas estimadas pela média de mercado; a
    // entrada é a estimativa do cliente (dinheiro e o que ele espera da
    // troca); a FIPE da troca nunca entra na conta.
    const codigo = lerCodigo("src/components/CarMatch.tsx");
    expect(codigo).toContain('{ id: "porMes", rotulo: "POR MÊS" }');
    expect(codigo).toContain("orcamento: { ...perfilAtual.orcamento, parcela: perfilAtual.parcela ?? null }");
    expect(codigo).toMatch(/por_mes: answers\.porMes/);
    expect(codigo).toContain("parcela: c.parcela,");
    // A troca é só um aviso ao consultor e o link da avaliação — nada de FIPE.
    const resultado = lerCodigo("src/components/ResultadoDoProfiler.tsx");
    for (const [nome, fonte] of [["CarMatch", codigo], ["ResultadoDoProfiler", resultado]]) {
      expect(fonte, nome).not.toMatch(/fipe/i);
    }
    expect(resultado).toContain('href="/avaliacao"');
    // Parcela zero não vai ao consultor como "48× R$ 0".
    expect(codigo).toContain("!(c.parcela > 0)");
  });

  it("parcela só aparece pelo texto único de crédito (CDC, art. 54-B)", () => {
    // Revisão de 27/09: a lista "outros" mostrava parcela sem CET nem total,
    // e o "total" da ficha e dos cartões era só a soma das parcelas. O texto
    // mora em `lib/textoDaParcela` e é testado lá; aqui se trava que as telas
    // não formatam parcela por conta própria.
    const resultado = lerCodigo("src/components/ResultadoDoProfiler.tsx");
    expect(resultado).not.toContain("parcela_mensal");
    expect(resultado).toContain("textoDaParcela(parcela)");
    expect(resultado).toContain("textoDaParcela(parcelaDoPedido(v, parcelaPedida)).compacto");
    const ficha = lerCodigo("src/components/CalculadoraFinanciamento.tsx");
    expect(ficha).toContain("textoDaParcela({");
    expect(ficha).not.toMatch(/total_pago_ao_final\.toLocaleString/);
    expect(ficha).toContain("AVISO_DA_SIMULACAO");
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
    // O cálculo tem retorno próprio para menos de 4 preços. Sem ele, o fallback
    // seria de novo uma lista vazia — o mesmo defeito com outro nome. Desde
    // 25/09 ele mora em `faixasDoPatio` (lib/motorDoMatch), e a trava passou
    // de leitura do código a comportamento.
    for (const precos of [[], [30000, 60000]]) {
      const faixas = faixasDoPatio(precos);
      expect(faixas.length).toBeGreaterThan(0);
      expect(faixas.slice(1, 1 + CORTES_DE_RESERVA.length).map((f) => f.min)).toEqual([...CORTES_DE_RESERVA]);
    }
    // E o CarMatch usa o cálculo do motor, não uma cópia.
    const codigo = lerCodigo("src/components/CarMatch.tsx");
    expect(codigo).toContain("faixasDoPatio(precos)");
  });

  it("as faixas saem de QUANTIL, não de fatia do intervalo", () => {
    // Com um carro de R$ 318.900 esticando a ponta, cortar o intervalo em
    // 15/35/60/80% punha 24 dos 35 carros numa faixa só (50–125 mil) e
    // deixava outra vazia. Era o "difícil demais fazer um match acima dos
    // 50 mil". Por quantil cada faixa leva um quarto do pátio.
    const precos = [
      ...Array.from({ length: 8 }, (_, i) => 26000 + i * 3000),
      ...Array.from({ length: 10 }, (_, i) => 52000 + i * 2000),
      ...Array.from({ length: 9 }, (_, i) => 76000 + i * 4000),
      ...Array.from({ length: 8 }, (_, i) => 118000 + i * 6000),
      318900,
    ];
    const comTeto = faixasDoPatio(precos).filter((f) => f.max !== null);
    const maior = Math.max(...comTeto.map((f) => f.quantos));
    expect(maior / precos.length).toBeLessThan(0.4);
    // O carro de R$ 318.900 não estica a faixa de cima: ele fica sozinho numa
    // opção "acima de", separada.
    const semTeto = faixasDoPatio(precos).find((f) => f.max === null);
    expect(semTeto?.quantos).toBe(1);
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
