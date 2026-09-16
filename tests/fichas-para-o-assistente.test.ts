import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import type { Veiculo } from "../src/types";
import { montarFichas } from "../src/app/api/ney/route";

/**
 * A fonte que o assistente do WhatsApp lê.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo guarda, e por quê
 * ---------------------------------------------------------------------------
 * Pedido do dono em 05/09/2026: o Ney precisa conhecer o pátio para aquecer o
 * lead antes do consultor. O Captain do Chatwoot não tem chamada de função —
 * `/captain/assistants/1/tools` responde 404 —, então a única forma é DOCUMENTO
 * INGERIDO, que é uma fotografia congelada até a próxima ingestão.
 *
 * Isso torna o preço a coisa mais perigosa que poderia entrar: um valor velho,
 * repetido no privado para quem já decidiu comprar, é a pior forma de errar. E
 * a regra da casa já proíbe o Ney de cotar preço — mas proibir na diretriz e
 * entregar o número na fonte é convite.
 *
 * Medido no mesmo dia: dos 25 documentos que o Captain já tinha ingerido, **21
 * carregavam preço congelado** de páginas de hub, um deles com 43 ocorrências.
 * O defeito não é hipótese; é o estado em que a conta estava.
 *
 * O teste lê a FONTE porque a rota depende do Supabase e não roda aqui. O que
 * ele prende é a decisão: nenhum caminho para preço, nenhuma afirmação de
 * disponibilidade, e o aviso explícito ao assistente.
 */

const ROTA = "src/app/api/ney/route.ts";
const fonte = lerCodigo(ROTA);

describe("a ficha do assistente não carrega preço", () => {
  it("nenhum campo de preço é lido do veículo", () => {
    // `preco_original`, `preco_promocional` e `precoVigente` são os três
    // caminhos que existem no projeto. Nenhum pode aparecer.
    expect(fonte).not.toMatch(/preco_original|preco_promocional|precoVigente|formatarPreco|formatPrice/);
  });

  it("nem a palavra, nem o símbolo, nem o formatador", () => {
    expect(fonte).not.toMatch(/R\$/);
    // "preço" aparece no texto do cabeçalho explicando que ele NÃO está aqui —
    // o que a regra proíbe é imprimir um. A distinção é o `linha("Preço"…)`.
    expect(fonte).not.toMatch(/linha\("Pre[çc]o"/);
  });

  it("o cabeçalho AVISA o assistente de que não há preço", () => {
    // Sem o aviso, um modelo que não acha o preço no documento inventa um a
    // partir do carro vizinho. Dizer que a ausência é deliberada é o que
    // impede a dedução.
    expect(fonte).toMatch(/Não há preço neste arquivo, de propósito/);
    expect(fonte).toMatch(/Nunca estime, nunca deduza um/);
  });
});

describe("a ficha não afirma disponibilidade", () => {
  it("nenhuma linha diz que o carro está disponível", () => {
    expect(fonte).not.toMatch(/linha\("Disponib|Dispon[íi]vel: |em estoque agora/i);
  });

  it("o cabeçalho diz que a lista é uma fotografia, com data", () => {
    // É o que separa "a loja tem 41 carros" de "a loja tinha 41 carros quando
    // este arquivo foi gerado". O assistente precisa da segunda frase.
    expect(fonte).toMatch(/Esta lista é uma fotografia/);
    expect(fonte).toMatch(/Gerada em: \$\{geradoEm\}/);
    expect(fonte).toMatch(/NÃO afirme que um carro está disponível/);
  });

  it("e avisa que a ausência de um carro não prova nada", () => {
    // O erro simétrico, e o mais fácil de cometer: o cliente pergunta por um
    // Corolla, não tem no arquivo, e o assistente diz "não trabalhamos com
    // Corolla". Pode ter entrado depois da fotografia.
    expect(fonte).toMatch(/pode ter entrado depois/);
  });
});

describe("a ficha traz o que envelhece bem", () => {
  it("os campos de ficha técnica estão todos no texto gerado", () => {
    // Este teste lia a FONTE atrás de `linha("Câmbio")` etc. Deixou de valer
    // quando a ficha foi compactada numa linha só — e um teste que só sabia
    // procurar rótulos teria acusado ausência de campos que estão lá.
    //
    // Medir o texto GERADO é mais forte e sobrevive à formatação: o que
    // importa é o dado chegar ao assistente, não o rótulo existir no código.
    const texto = montarFichas(
      [
        {
          id: "1", marca: "Ford", modelo: "Ka", versao: "Sedan 1.0 SE Flex 4p", ano: 2020,
          quilometragem: 100740, cambio: "Manual", combustivel: "Flex", cor: "Prata",
          tipo: "Sedan", motor: "1.0", opcionais: "Ar-condicionado, Alarme",
          pericia: "PERÍCIA APROVADA", preco_original: 1, preco_promocional: 0,
          whatsapp_images: [], web_full_images: [], fipe: "", laudo_pericia: "",
        } as unknown as Veiculo,
      ],
      "05/09/2026, 12:00:00",
    );

    expect(texto).toMatch(/## Ford Ka Sedan 1\.0 SE Flex 4p 2020/);
    for (const dado of ["100.740 km", "Manual", "Flex", "Sedan", "motor 1.0", "Prata", "Ar-condicionado"]) {
      expect(texto, dado).toContain(dado);
    }
    expect(texto).toMatch(/- Ficha no site: https?:\/\/[^\s]+\/carros\/ford\/ka\//);
  });

  it("o combustível passa pelo mesmo normalizador do site", () => {
    // `resolveTipoCombustivel` é o que alimenta o filtro da vitrine. Se o
    // assistente ler o campo cru e o site ler o normalizado, os dois discordam
    // sobre o mesmo carro.
    expect(fonte).toMatch(/resolveTipoCombustivel\(veiculo\)/);
  });

  it("a perícia distingue APROVADA de em análise, sem inventar uma terceira", () => {
    // A régua é a mesma do laudo na ficha: só `PERÍCIA APROVADA` autoriza
    // falar em laudo publicado. E "em análise" NÃO é "sem perícia" — o carro
    // passou; o laudo é que não está no ar.
    expect(fonte).toMatch(/veiculo\.pericia === "PERÍCIA APROVADA"/);
    expect(fonte).toMatch(/todo carro passa antes da vitrine/);
  });

  it("as duas frases da perícia carregam a ressalva DEPOIS de «na ficha»", () => {
    // `tests/coerencia-da-pericia.test.ts` varre o repo atrás de
    // "laudo … na ficha" sem "aprovad" nos 60 caracteres seguintes, e pegou a
    // primeira versão desta rota — a palavra estava lá, mas antes. Este teste
    // é o lembrete local: a trava global existe e esta rota está no alcance
    // dela.
    for (const trecho of String(fonte).match(/laudo[^.]{0,90}?(?:na ficha|ficha do)[^.]{0,60}/gi) ?? []) {
      expect(trecho, trecho).toMatch(/aprovad/i);
    }
  });

  it("a garantia vem da constante, não escrita à mão", () => {
    expect(fonte).toMatch(/\$\{GARANTIA_MESES\} meses de motor e câmbio/);
    expect(fonte).not.toMatch(/três meses de motor|3 meses de motor/);
  });

  it("cada bloco se identifica sozinho", () => {
    // O Captain fatia o documento e recupera o pedaço. Um bloco que dependa do
    // cabeçalho para dizer de que carro fala chega ao modelo anônimo.
    expect(fonte).toMatch(/## \$\{nomeComAno\(veiculo\)\}/);
    expect(fonte).toMatch(/linha\("Ficha no site"/);
  });

  it("e o título não repete a versão que já está no modelo", () => {
    // O feed do RevendaMais embute a versão dentro do modelo. Concatenar
    // produz "BMW X4 M40i 3.0 M Sport Edit V6 Turbo Aut 2020 — m40i 3.0 m
    // sport edit v6 turbo aut" — medido na primeira versão desta rota.
    // `nomeComAno` é a fonte única do projeto para isso, e o mesmo defeito já
    // tem teste no JSON-LD e no feed de anúncios.
    expect(fonte).toMatch(/nomeComAno\(veiculo\)/);
    expect(fonte).not.toMatch(/\[veiculo\.marca, veiculo\.modelo\]/);
  });
});

describe("as duas rotas para assistente têm públicos opostos", () => {
  /**
   * `llms-full.txt` serve buscadores, que recarregam a página a cada visita:
   * lá o preço é o dado mais útil que existe. Esta rota serve um assistente,
   * que decora: lá o preço é o dado mais perigoso. São necessidades opostas, e
   * é por isso que são duas rotas.
   *
   * Este teste existe para a próxima pessoa não "unificar" as duas.
   */
  it("o `llms-full.txt` continua publicando preço — ele serve outro público", () => {
    expect(lerCodigo("src/app/api/llms-full.txt/route.ts")).toMatch(/Preço/);
  });

  it("e a rota do assistente diz, por escrito, por que ela é separada", () => {
    expect(ler(ROTA)).toMatch(/serve a buscadores, que recarregam/);
    expect(ler(ROTA)).toMatch(/públicos diferentes com necessidades opostas/);
  });
});

describe("a rota lê o mesmo pátio que a vitrine", () => {
  it("usa `recortesDoEstoque`, não uma consulta própria", () => {
    // Duas definições de "à venda" no mesmo site é como o assistente passa a
    // conhecer um carro que a vitrine já não mostra.
    expect(fonte).toMatch(/const \{ disponiveis \} = await recortesDoEstoque\(\)/);
    expect(fonte).not.toMatch(/\.filter\(\([^)]*\) => ![^)]*vendido/);
  });

  it("e o link da ficha sai do mesmo resolvedor de URL", () => {
    expect(fonte).toMatch(/getVeiculoPdpUrl\(veiculo\)/);
  });
});

describe("o arquivo cabe no teto do Captain, com todo carro dentro", () => {
  /**
   * Medido em 05/09/2026, depois da primeira ingestão: o Chatwoot guardou
   * **exatamente 15000 bytes** de um arquivo de 25.854 e cortou o resto. Vinte
   * e um dos 36 carros entraram; o vigésimo primeiro parou no meio do título.
   *
   * E nada avisa. O documento fica com `status: available`, a API não reclama,
   * e o assistente simplesmente não conhece metade do pátio — o defeito só
   * apareceu porque fui contar os `##` do conteúdo guardado.
   *
   * A decisão: **todo carro entra**. Ficha curta para os 36 vale mais que
   * ficha completa para 21 e nada para 15. O que se corta é o campo mais
   * comprido e menos estrutural — os opcionais.
   */
  it("o teto e a margem estão declarados, não escondidos num número solto", () => {
    expect(fonte).toMatch(/const TETO_DO_CAPTAIN = 15000/);
    expect(fonte).toMatch(/const MARGEM = 1000/);
  });

  it("o orçamento sai do que SOBRA depois da ficha incompressível", () => {
    // Medir a ficha com opcionais e depois cortar daria um resultado que
    // depende da ordem dos carros. O piso é a ficha sem eles — `ficha(v, 0)`.
    expect(fonte).toMatch(/const bases = todos\.map\(\(v\) => ficha\(v, 0\)\.length\)/);
    expect(fonte).toMatch(/const minimo = dentro\.map\(\(v\) => ficha\(v, 0\)\)\.join\(""\)/);
    expect(fonte).toMatch(/Math\.floor\(sobra \/ dentro\.length\)/);
  });

  it("o corte de CARRO vem depois do corte de opcional, não antes", () => {
    // A ordem importa: encurtar opcional é barato, perder carro é caro. A
    // primeira versão só encurtava opcional e devolvia 20.998 bytes — o
    // Captain então cortava carro, calado e no meio de um título.
    expect(fonte).toMatch(/while \(cabem < todos\.length && acumulado \+ bases\[cabem\] <= teto\)/);
    expect(fonte).toMatch(/const dentro = todos\.slice\(0, cabem\)/);
  });

  it("o corte dos opcionais cai numa vírgula, nunca no meio da palavra", () => {
    // Cortar "Ar-condicion" faria o assistente ler um opcional inexistente.
    expect(fonte).toMatch(/lastIndexOf\(","\)/);
    expect(fonte).toMatch(/lista abreviada/);
    // E se nem o primeiro item couber, omite em vez de publicar meia palavra.
    expect(fonte).toMatch(/if \(ultimaVirgula < 0\) return "";/);
  });

  it("o cabeçalho avisa que a lista de opcionais pode estar abreviada", () => {
    // Sem isto, o assistente lê a lista curta como completa e responde "esse
    // carro não tem ar-condicionado" para um carro que tem.
    expect(fonte).toMatch(/lista de opcionais pode estar \*\*abreviada\*\*/);
    expect(fonte).toMatch(/não diga que o carro não/);
  });

  it("a garantia saiu da ficha e foi para o cabeçalho", () => {
    // Ela é igual para todo carro. Repetida 36 vezes custava 2 KB de um
    // orçamento de 15 — e o que se paga com esse desperdício é carro cortado.
    expect(fonte).toMatch(/Garantia de todos: \$\{GARANTIA_MESES\} meses/);
    expect(fonte).not.toMatch(/linha\("Garantia"/);
  });
});


describe("medindo o arquivo de verdade, com pátio sintético", () => {
  /**
   * Os testes acima leem a FONTE. Este monta o arquivo e mede — é a diferença
   * entre "o código diz que corta" e "o resultado cabe". `montarFichas` é pura
   * justamente para isto: a rota depende do Supabase e não roda aqui, mas a
   * montagem sim.
   *
   * A primeira versão deste bloco pegou dois defeitos que as asserções de
   * fonte não pegavam: o arquivo saía com **20.998 bytes** para 36 carros, e
   * depois de compactar ainda saía com **15.051** — porque o orçamento media
   * só o texto dos opcionais e ignorava os 32 bytes de rótulo e sufixo por
   * carro.
   *
   * ---------------------------------------------------------------------------
   * Duas amostras, porque a capacidade depende do nome
   * ---------------------------------------------------------------------------
   * Nome e versão entram no título e na URL, então um pátio de "Modelo
   * Comprido Numero 12 — 1.4 Turbo Flex 16v Automatico 5p" cabe menos que um
   * de "Onix — 1.0". Uma amostra só esconderia isso: a realista provaria
   * capacidade que a adversarial não tem, e a adversarial acusaria perda que
   * o pátio de verdade não sofre.
   */
  function monta(quantos: number, nome: (i: number) => { modelo: string; versao: string }): Veiculo[] {
    return Array.from({ length: quantos }, (_, i) => {
      const { modelo, versao } = nome(i);
      return {
        id: String(9000000 + i),
        marca: ["Volkswagen", "Fiat", "Ford", "Chevrolet"][i % 4],
        modelo,
        versao,
        ano: 2018 + (i % 7),
        quilometragem: 30000 + i * 977,
        cambio: "Automático",
        combustivel: "Flex",
        cor: "Prata",
        tipo: "SUV",
        motor: "1.0 Turbo",
        // Lista longa e realista: é o campo que estoura o teto.
        opcionais: Array.from({ length: 16 }, (_, k) => `Opcional numero ${k}`).join(", "),
        pericia: i % 2 ? "PERÍCIA APROVADA" : "EM ANÁLISE",
        preco_original: 100000,
        preco_promocional: 0,
        whatsapp_images: [],
        web_full_images: [],
        fipe: "",
        laudo_pericia: "",
      } as unknown as Veiculo;
    });
  }

  /** Como o pátio da Motors é de verdade: nomes curtos. */
  const patioReal = (n: number) =>
    monta(n, (i) => ({ modelo: ["Onix", "Polo", "Ka", "Argo"][i % 4], versao: "1.0 Flex 5p" }));

  /** O pior caso plausível: nome e versão compridos, como o feed às vezes traz. */
  const patioComprido = (n: number) =>
    monta(n, (i) => ({
      modelo: `Modelo Comprido Numero ${i}`,
      versao: `1.${i % 9} Turbo Flex 16v Automatico 5p`,
    }));

  // Conta pelo campo que existe uma vez por carro. Contar `## ` pegaria o
  // "## Como usar" do cabeçalho junto — foi o que deu 11 para 10 carros.
  const blocos = (texto: string) => (texto.match(/- Ficha no site: /g) ?? []).length;

  it.each([1, 10, 36, 45, 200, 500])("nunca passa do teto — %i carros", (quantos) => {
    // O invariante duro, e o único que vale para QUALQUER pátio.
    expect(montarFichas(patioReal(quantos), "05/09/2026").length, `real ${quantos}`).toBeLessThanOrEqual(15000);
    expect(montarFichas(patioComprido(quantos), "05/09/2026").length, `comprido ${quantos}`).toBeLessThanOrEqual(15000);
  });

  it.each([1, 10, 36, 45])("o pátio de verdade cabe inteiro — %i carros", (quantos) => {
    // 36 é o pátio de hoje. 45 é margem para ele crescer sem ninguém mexer aqui.
    const texto = montarFichas(patioReal(quantos), "05/09/2026");

    expect(blocos(texto), `${quantos} carros`).toBe(quantos);
    expect(texto).not.toMatch(/Este arquivo tem \d+ dos/);
  });

  it.each([60, 200, 500])("pátio grande demais: corta, e DIZ quanto — %i carros", (quantos) => {
    // Acima da capacidade a ficha mínima estoura sozinha, e nenhum
    // encurtamento de opcional resolve. O corte então é deliberado e
    // declarado: perder os últimos e dizer quantos é honesto; perder metade
    // calado, que é o que o Captain fazia, não é.
    const texto = montarFichas(patioReal(quantos), "05/09/2026");

    expect(texto).toContain(`Veículos no pátio: ${quantos}`);
    expect(texto).toMatch(/Este arquivo tem \d+ dos \d+ veículos do pátio/);
    expect(texto).toMatch(/Nunca diga que a loja não tem um carro só porque/);
    expect(blocos(texto)).toBeGreaterThan(0);
    expect(blocos(texto)).toBeLessThan(quantos);
  });

  it("encurta o opcional ANTES de derrubar carro", () => {
    /**
     * A ordem da degradação, que é a decisão inteira desta rota: encurtar
     * opcional é barato, perder carro é caro.
     *
     * O teste mede a ORDEM, não um valor: com 30 e com 45 carros ninguém é
     * perdido, e o gasto médio com opcionais cai no pátio maior. Uma asserção
     * de valor fixo ("tem `Opcional numero 0`") quebraria no dia em que o
     * orçamento zerasse — e zerar é o comportamento certo, não o defeito.
     */
    const trinta = montarFichas(patioReal(30), "05/09/2026");
    const quarentaCinco = montarFichas(patioReal(45), "05/09/2026");

    expect(blocos(trinta)).toBe(30);
    expect(blocos(quarentaCinco)).toBe(45);

    const gastoPorCarro = (texto: string) =>
      (texto.match(/- Opcionais: [^\n]+/g) ?? []).join("").length / Math.max(1, blocos(texto));

    expect(gastoPorCarro(trinta)).toBeGreaterThan(0);
    expect(gastoPorCarro(quarentaCinco)).toBeLessThan(gastoPorCarro(trinta));
  });

  it("com o pátio de hoje, o opcional cabe inteiro", () => {
    // Não basta caber: se o orçamento zerar, todo carro fica sem opcionais e a
    // entrega perde o que o dono pediu — "sanar dúvidas do anúncio".
    const texto = montarFichas(patioReal(36), "05/09/2026");

    expect(texto).toMatch(/- Opcionais: Opcional numero 0/);
    expect(texto.length).toBeGreaterThan(9000);
  });

  it("o que entra, entra INTEIRO — nenhum bloco cortado no meio", () => {
    // O defeito do Captain era exatamente este: o último carro parava no meio
    // do título.
    const texto = montarFichas(patioComprido(200), "05/09/2026");
    const titulos = (texto.match(/\n## /g) ?? []).length - 1; // menos o "## Como usar"

    expect(titulos).toBe(blocos(texto));
    expect(texto.endsWith("---\n\n")).toBe(true);
  });

  it("nenhuma lista de opcionais termina no meio de uma palavra", () => {
    for (const linha of montarFichas(patioReal(45), "05/09/2026").match(/- Opcionais: [^\n]+/g) ?? []) {
      expect(linha, linha).toMatch(/(Opcional numero \d+|\(lista abreviada\))$/);
    }
  });

  it("pátio vazio devolve só o cabeçalho, sem quebrar", () => {
    const vazio = montarFichas([], "05/09/2026");

    expect(blocos(vazio)).toBe(0);
    expect(vazio).toMatch(/Veículos no pátio: 0/);
  });

  it("e continua sem preço, com qualquer tamanho de pátio", () => {
    for (const n of [1, 36, 200, 500]) {
      expect(montarFichas(patioReal(n), "x"), `${n} carros`).not.toMatch(/R\$/);
    }
  });
});
