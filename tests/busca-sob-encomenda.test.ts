import { describe, it, expect } from "vitest";
import {
  CANAL_BUSCA_ENCOMENDA,
  colunasDoPedido,
  mensagemDoPedido,
  normalizarPedido,
  textoDaBusca,
  type PedidoDeBusca,
} from "../src/lib/buscaSobEncomenda";
import { ACOES, ACOES_DE_LEADS } from "../src/lib/turnstile";
import { ler } from "./fonte";

/**
 * A Busca sob encomenda é o que responde a metade dos hubs que está sem carro
 * e continua recebendo busca (/carros/citroen: 67 impressões em 18 dias, e
 * nenhum Citroën no pátio).
 *
 * O que este arquivo trava:
 *
 *   1. **Perícia e laudo são complementares, não sinônimos** (direção do dono,
 *      2026-09-06): perícia é o processo de aquisição do laudo. Toda citação ao
 *      documento diz "laudo cautelar independente", por extenso. Um teste que
 *      só proibisse "laudo cautelar" sozinho reprovaria a grafia certa, porque
 *      ela CONTÉM a errada — por isso a asserção afirma a condição inteira.
 *   2. **Gênero.** Quatro dos 42 alvos são de moto. Sem concordância,
 *      /motos/suzuki diz "A gente busca o seu" para uma moto.
 *   3. **As promessas que o dono recusou.** Canal de busca não se anuncia.
 */

const pedido = (extra: Partial<PedidoDeBusca> = {}): PedidoDeBusca => ({
  marca: "Citroën",
  modelo_desejado: "C3",
  investimento: "ate-60-mil",
  pagina_origem: "/carros/citroen",
  ...extra,
});

describe("colunasDoPedido", () => {
  it("monta modelo_interesse legível a partir de marca e modelo", () => {
    expect(colunasDoPedido(pedido()).modelo_interesse).toBe("Citroën C3");
  });

  it("não repete a marca quando quem preencheu já a digitou", () => {
    // Na página de MARCA o campo vem vazio e a pessoa escreve o carro inteiro.
    // Sem isto a coluna guardaria "Citroën Citroën C3".
    expect(colunasDoPedido(pedido({ modelo_desejado: "Citroen C3" })).modelo_interesse)
      .toBe("Citroen C3");
  });

  it("não repete a marca quando a diferença é só a CAIXA", () => {
    // O teste acima varia só o acento — as duas grafias usam "C" maiúsculo, e
    // por isso fica verde mesmo sem o `.toLowerCase()` de `semAcento`. Este
    // varia a caixa e nada mais, e morre se o `.toLowerCase()` for removido
    // (provado por mutação).
    expect(
      colunasDoPedido(pedido({ marca: "Citroën", modelo_desejado: "citroen c3" }))
        .modelo_interesse,
    ).toBe("citroen c3");
  });

  it("marca disponivel_estoque como false — é o que o pedido significa", () => {
    expect(colunasDoPedido(pedido()).disponivel_estoque).toBe(false);
  });

  it("guarda os campos opcionais como null, nunca como undefined", () => {
    // `undefined` num insert do PostgREST some da linha; `null` grava o vazio.
    const { respostas_raw } = colunasDoPedido(pedido());
    expect(respostas_raw.ano_min).toBeNull();
    expect(respostas_raw.tem_troca).toBeNull();
    expect(respostas_raw.prazo).toBeNull();
    expect(respostas_raw.observacao).toBeNull();
  });

  it("preserva a página de origem — é o que liga o lead ao hub que o gerou", () => {
    expect(colunasDoPedido(pedido()).respostas_raw.pagina_origem).toBe("/carros/citroen");
  });

  it("guarda tem_troca false sem confundir com não respondido", () => {
    expect(colunasDoPedido(pedido({ tem_troca: false })).respostas_raw.tem_troca).toBe(false);
    expect(colunasDoPedido(pedido({ tem_troca: true })).respostas_raw.tem_troca).toBe(true);
  });
});

describe("mensagemDoPedido", () => {
  it("descreve o pedido em uma linha, para o WhatsApp e para o campo interesse", () => {
    const msg = mensagemDoPedido(pedido({ ano_min: 2018 }));
    expect(msg).toContain("Citroën C3");
    expect(msg).toContain("2018");
  });

  it("não inventa o que não foi preenchido", () => {
    expect(mensagemDoPedido(pedido())).not.toContain("undefined");
    expect(mensagemDoPedido(pedido())).not.toContain("null");
  });
});

describe("textoDaBusca — variante de marca", () => {
  const carro = textoDaBusca({ marca: "Citroën", genero: "m" });
  const moto = textoDaBusca({ marca: "Suzuki", genero: "f" });

  it("concorda no masculino para carro", () => {
    expect(carro.titulo).toBe("Sem Citroën hoje. A gente busca o seu.");
  });

  it("concorda no feminino para moto", () => {
    expect(moto.titulo).toBe("Sem Suzuki hoje. A gente busca a sua.");
  });

  it("cita o processo e o documento pelos nomes inteiros", () => {
    // Afirma a condição inteira: "laudo cautelar" CONTÉM a grafia curta, então
    // proibir a substring reprovaria a grafia certa.
    expect(carro.paragrafo).toContain("perícia cautelar independente");
    expect(carro.paragrafo).toContain("laudo cautelar independente");
  });

  it("nunca cita o documento sem qualificar", () => {
    const semQualificar = carro.paragrafo.replace(/laudo cautelar independente/g, "");
    expect(semQualificar).not.toContain("laudo");
  });

  it("não crava prazo de resposta nenhum", () => {
    // `tests/promessa-publica.test.ts` (04/09) proíbe afirmar tempo de retorno
    // que nada mede, e "hora útil" não é calculada em lugar nenhum. O funil
    // mede tempo até o primeiro contato, mas em relógio, não em hora comercial.
    expect(carro.selo).toBe("Sem taxa, sem compromisso.");
    expect(carro.selo).not.toMatch(/\d+\s*(h|hora|min)/i);
    expect(carro.selo.toLowerCase()).not.toContain("entrega");
  });
});

describe("textoDaBusca — variante de modelo", () => {
  const carro = textoDaBusca({ marca: "Volkswagen", modelo: "Tiguan", genero: "m" });
  const moto = textoDaBusca({ marca: "Honda", modelo: "CB", genero: "f" });

  it("concorda o pronome com o segmento", () => {
    expect(carro.titulo).toBe("Nenhum Volkswagen Tiguan no estoque agora. Quer que a gente ache?");
    expect(moto.titulo).toBe("Nenhuma Honda CB no estoque agora. Quer que a gente ache?");
  });

  it("põe o modelo pedido no botão", () => {
    expect(carro.rotuloPrimario).toContain("TIGUAN");
  });
});

describe("as promessas que a copy NÃO faz", () => {
  const todos = [
    textoDaBusca({ marca: "Citroën", genero: "m" }),
    textoDaBusca({ marca: "Volkswagen", modelo: "Tiguan", genero: "m" }),
    textoDaBusca({ marca: "Suzuki", genero: "f" }),
  ];

  it("não anuncia por onde a loja compra (decisão do dono, 06/09)", () => {
    for (const t of todos) {
      const texto = `${t.titulo} ${t.paragrafo} ${t.selo}`.toLowerCase();
      expect(texto).not.toContain("repasse");
      expect(texto).not.toContain("frota");
      expect(texto).not.toContain("leilão");
    }
  });

  it("não promete achar, nem preço", () => {
    for (const t of todos) {
      const texto = `${t.titulo} ${t.paragrafo} ${t.selo}`.toLowerCase();
      expect(texto).not.toContain("garantimos");
      expect(texto).not.toContain("fipe");
      expect(texto).not.toContain("desconto");
      expect(texto).not.toContain("preço fechado");
    }
  });

  it("atribui a busca ao consultor, não a um sistema", () => {
    for (const t of todos) expect(t.paragrafo).toContain("consultor");
  });
});

describe("a ação do Turnstile", () => {
  it("existe e está na lista que /api/leads aceita", () => {
    // As duas: sem a segunda, o token volta assinado pela Cloudflare e a rota
    // o recusa com `action-nao-prevista` — falha que parece captcha quebrado.
    expect(ACOES.buscaEncomenda).toBe("busca_encomenda");
    expect(ACOES_DE_LEADS).toContain("busca_encomenda");
  });

  it("respeita o limite da Cloudflare para action", () => {
    expect(ACOES.buscaEncomenda).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
  });
});

describe("o canal", () => {
  it("é o rótulo que o consultor vê no kanban", () => {
    expect(CANAL_BUSCA_ENCOMENDA).toBe("Busca sob encomenda");
  });
});

/**
 * A rota é testada pela FONTE, e não por importação, porque `POST` depende de
 * `next/server` e de `cookies()` — montar isso no vitest testaria o mock, não a
 * rota. O que precisa ser verdade aqui é estrutural: as colunas novas são
 * escritas SOB CONDIÇÃO, e a condição é o bloco no corpo.
 */
describe("a rota /api/leads", () => {
  const fonte = ler("src/app/api/leads/route.ts");

  it("grava as três colunas do pedido", () => {
    expect(fonte).toContain("colunasDoPedido");
  });

  it("condiciona a gravação ao bloco no corpo — PDP e pop-up não regridem", () => {
    // A regra 7 do CLAUDE.md: o que já está em produção não muda de forma.
    // Um spread incondicional mandaria `modelo_interesse` e
    // `disponivel_estoque: false` em TODO lead, inclusive os da ficha.
    //
    // Substring exata, e não regex de espaçamento: uma expressão que tolera
    // `\s*` fica verde para qualquer formatação e vermelha quando o prettier
    // quebra a linha — o oposto do que se quer de uma trava.
    expect(fonte).toContain("...(pedidoDeBusca ? colunasDoPedido(pedidoDeBusca) : {})");
  });

  it("manda content_category para o CAPI sem tocar no evento da ficha", () => {
    expect(fonte).toContain("content_category");
    expect(fonte).toContain("busca-encomenda");
    // O evento da ficha continua mandando o id e o preço do veículo.
    expect(fonte).toContain("content_ids");
    expect(fonte).toContain("value: veiculo?.preco");
  });
});

describe("o envio do formulário", () => {
  const fonte = ler("src/components/BuscaSobEncomenda.tsx");

  it("posta no funil que já existe, não num endpoint próprio", () => {
    expect(fonte).toContain('fetch("/api/leads"');
    expect(fonte).not.toContain("/api/busca-encomenda");
  });

  it("manda o bloco que a rota lê e o canal que o kanban mostra", () => {
    expect(fonte).toContain("busca_encomenda: pedido");
    expect(fonte).toContain("canal: CANAL_BUSCA_ENCOMENDA");
  });

  it("compartilha o event_id com o Pixel, para o CAPI deduplicar", () => {
    expect(fonte).toContain("trackLeadSubmission");
    expect(fonte).toContain("eventId,");
  });

  it("reseta o Turnstile quando o envio falha", () => {
    // Token do Turnstile é de uso único. Sem o reset, o segundo clique manda o
    // mesmo token queimado, leva 403, e o visitante fica preso até recarregar.
    expect(fonte).toContain("turnstileRef.current?.reset()");
  });

  it("oferece o wa.me quando o endpoint falha — nunca se perde o contato", () => {
    // A guarda vem ANTES da fatia. Com `indexOf` em -1, `slice(-1, 499)`
    // devolve o último caractere do arquivo — uma string que não contém
    // "avisarHref" e faz o teste falhar pelo motivo errado, escondendo que o
    // bloco de erro nem existe.
    const inicio = fonte.indexOf("{erro &&");
    expect(inicio).toBeGreaterThan(-1);
    expect(fonte.slice(inicio, inicio + 500)).toContain("avisarHref");
  });

  it("some em silêncio quando o honeypot vem preenchido", () => {
    // Dizer "recusado" ensina o robô a tentar de novo sem o campo.
    expect(fonte).toContain("apelido.trim() !== \"\"");
  });
});

/**
 * `normalizarPedido` — a rota `/api/leads` é pública, e `busca_encomenda` vem
 * do corpo do POST, escrito pelo cliente. Dois buracos reais motivam este
 * bloco: `{}` bastava para gravar `disponivel_estoque: false` em qualquer
 * lead (o corte que a migração `20260906120000` chama de "demanda atendida vs.
 * demanda perdida"), e `{ marca: 1 }` estourava dentro de `juntarMarcaEModelo`
 * — dentro do `try/catch` da persistência, que é não-bloqueante de propósito,
 * então o lead INTEIRO se perdia em silêncio.
 */
describe("normalizarPedido", () => {
  const bruto = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    marca: "Citroën",
    modelo_desejado: "C3",
    investimento: "ate-60-mil",
    pagina_origem: "/carros/citroen",
    ...extra,
  });

  it("devolve null para objeto vazio", () => {
    // O primeiro buraco: sem isto, `{}` sozinho já gravava as três colunas.
    expect(normalizarPedido({})).toBeNull();
  });

  it("devolve null quando marca não é string", () => {
    // O segundo buraco: isto chegava vivo até `juntarMarcaEModelo` e estourava.
    expect(normalizarPedido(bruto({ marca: 1 }))).toBeNull();
  });

  it("devolve null para array", () => {
    expect(normalizarPedido([])).toBeNull();
    expect(normalizarPedido(["marca", "modelo"])).toBeNull();
  });

  it("devolve null para null e para undefined", () => {
    expect(normalizarPedido(null)).toBeNull();
    expect(normalizarPedido(undefined)).toBeNull();
  });

  it("devolve null quando modelo_desejado ou pagina_origem faltam ou vêm vazios", () => {
    expect(normalizarPedido(bruto({ modelo_desejado: "" }))).toBeNull();
    expect(normalizarPedido(bruto({ modelo_desejado: "   " }))).toBeNull();
    expect(normalizarPedido(bruto({ pagina_origem: undefined }))).toBeNull();
  });

  it("devolve null quando investimento não casa nenhuma faixa — campo obrigatório", () => {
    expect(normalizarPedido(bruto({ investimento: "faixa-inventada" }))).toBeNull();
  });

  it("prazo inventado não invalida o pedido — campo opcional, só ele vira null", () => {
    const pedido = normalizarPedido(bruto({ prazo: "depois-de-amanha" }));
    expect(pedido).not.toBeNull();
    expect(pedido?.prazo).toBeNull();
  });

  it("tem_troca fora de true/false vira null no campo, sem invalidar o pedido", () => {
    const pedido = normalizarPedido(bruto({ tem_troca: "talvez" }));
    expect(pedido).not.toBeNull();
    expect(pedido?.tem_troca).toBeNull();
  });

  it("ano_min fora da faixa 1950–ano que vem vira null no campo, não no pedido", () => {
    const antigo = normalizarPedido(bruto({ ano_min: 1900 }));
    expect(antigo).not.toBeNull();
    expect(antigo?.ano_min).toBeNull();

    const futuro = normalizarPedido(bruto({ ano_min: new Date().getFullYear() + 5 }));
    expect(futuro?.ano_min).toBeNull();

    // Tipo errado tem a mesma régua de "fora da faixa": vira null no campo.
    const tipoErrado = normalizarPedido(bruto({ ano_min: "2018" }));
    expect(tipoErrado?.ano_min).toBeNull();
  });

  it("observação de 400 caracteres sai cortada em 300", () => {
    const longa = "a".repeat(400);
    const pedido = normalizarPedido(bruto({ observacao: longa }));
    expect(pedido?.observacao).toHaveLength(300);
  });

  it("campos opcionais ausentes viram null, nunca undefined", () => {
    const pedido = normalizarPedido(bruto());
    expect(pedido?.ano_min).toBeNull();
    expect(pedido?.tem_troca).toBeNull();
    expect(pedido?.prazo).toBeNull();
    expect(pedido?.observacao).toBeNull();
  });

  it("um pedido bom passa inteiro, sem perder nenhum campo", () => {
    const completo = bruto({
      ano_min: 2018,
      tem_troca: true,
      prazo: "ate-15-dias",
      observacao: "Prefiro cor escura.",
    });

    expect(normalizarPedido(completo)).toEqual({
      marca: "Citroën",
      modelo_desejado: "C3",
      investimento: "ate-60-mil",
      pagina_origem: "/carros/citroen",
      ano_min: 2018,
      tem_troca: true,
      prazo: "ate-15-dias",
      observacao: "Prefiro cor escura.",
    });
  });
});
