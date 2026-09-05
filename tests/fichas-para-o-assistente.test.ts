import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

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
  it("os campos de ficha técnica estão todos lá", () => {
    // `\s*` depois do parêntese: a linha da quilometragem é escrita em várias
    // linhas porque o valor é formatado, e uma âncora colada acusaria ausência
    // de um campo que está lá.
    for (const campo of ["Marca", "Modelo", "Versão", "Ano", "Quilometragem", "Câmbio", "Combustível", "Cor", "Carroceria", "Motor", "Opcionais"]) {
      expect(fonte, campo).toMatch(new RegExp(`linha\\(\\s*"${campo}"`));
    }
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
    expect(fonte).toMatch(/todo carro passa por ela antes de entrar na vitrine/);
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
