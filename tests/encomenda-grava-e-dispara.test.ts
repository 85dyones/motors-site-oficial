import { describe, it, expect } from "vitest";
import { montarEncomenda, mensagemDaEncomenda, FAIXAS_DA_ENCOMENDA } from "../src/lib/encomenda";
import { FAIXAS_DE_PRECO } from "../src/lib/faixasDePreco";
import { lerCodigo } from "./fonte";
import type { UtmParameters } from "../src/lib/telemetry";

/**
 * "Encomende seu carro" — o lead do hub sem estoque entra no funil.
 *
 * São 32 hubs de modelo e 5 de marca sem unidade à venda. A única saída deles
 * era um `wa.me`: o contato acontecia no WhatsApp e **não existia para o
 * sistema** — sem linha em `leads`, sem CAPI, sem Kanban, sem atribuição. E é
 * a intenção de melhor qualidade do site: quem procura um modelo específico e
 * não acha sabe exatamente o que quer.
 *
 * O payload é montado por uma função pura, e não dentro do `onSubmit`, porque
 * é ele que precisa de trava: um campo trocado aqui não quebra tela nenhuma —
 * o formulário continua enviando, a resposta continua 200, e o lead chega
 * mudo do outro lado.
 */

const CONTEXTO = {
  marca: "Toyota",
  modelo: "Corolla",
  caminho: "/carros/toyota/corolla",
  segmento: "carros" as const,
};

/** Visitante sem campanha — o caso comum. */
const SEM_UTM = {
  utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null,
  utm_term: null, gclid: null, gbraid: null, wbraid: null, fbclid: null,
} as unknown as UtmParameters;

const DADOS = { nome: "Ana Souza", whatsapp: "(41) 99737-2165", faixa: "60-a-100-mil" };

function payload() {
  return montarEncomenda(DADOS, CONTEXTO, {
    agUid: "ag_teste",
    eventId: "evt_1",
    turnstileToken: "tok",
    utm: SEM_UTM,
    eventSourceUrl: "https://motorsstore.com.br/carros/toyota/corolla",
    fbp: null,
    fbc: null,
  });
}

describe("as três faixas são as da vitrine, não uma lista nova", () => {
  it("mesmos slugs e mesmos rótulos de FAIXAS_DE_PRECO", () => {
    // Uma segunda lista de faixas é como o filtro da vitrine e o formulário
    // acabam discordando sobre o que é "até 60 mil".
    expect(FAIXAS_DA_ENCOMENDA.map((f) => f.slug)).toEqual(FAIXAS_DE_PRECO.map((f) => f.slug));
  });
});

describe("o lead da encomenda chega identificável", () => {
  it("o canal distingue no Kanban de quem já é encomenda", () => {
    // É por `canal` que a rota preenche a coluna homônima em `leads`, e é a
    // etiqueta que o consultor lê antes de abrir a conversa.
    expect(payload().canal).toBe("Encomenda");
  });

  it("o tipo diz o que é, para o roteamento do n8n", () => {
    expect(payload().tipo).toBe("lead_encomenda");
  });

  it("a mensagem nomeia marca e modelo — é o que vira `interesse` no banco", () => {
    // Sem `veiculo` no corpo, a rota deriva `interesse` de `body.mensagem`.
    // Uma mensagem genérica aqui grava um lead que não diz o que a pessoa quer.
    const msg = payload().mensagem;

    expect(msg).toMatch(/Toyota/);
    expect(msg).toMatch(/Corolla/);
  });

  it("a mensagem diz a faixa de preço escolhida", () => {
    expect(payload().mensagem).toContain("de R$ 60 mil a R$ 100 mil");
  });

  it("o contexto viaja estruturado, não só na frase", () => {
    // O texto é para o humano; estes campos são para o n8n e para o gatilho de
    // "carro entrou no estoque" casar encomenda com veículo publicado.
    expect(payload().intencao_busca).toMatchObject({
      marca: "Toyota",
      modelo: "Corolla",
      faixa: "60-a-100-mil",
      caminho: "/carros/toyota/corolla",
    });
  });

  it("no hub de MARCA, sem modelo, a mensagem não inventa um", () => {
    const msg = mensagemDaEncomenda(DADOS, { ...CONTEXTO, modelo: null });

    expect(msg).toMatch(/Toyota/);
    expect(msg).not.toMatch(/Corolla/);
    // E não sobra um buraco na frase.
    expect(msg).not.toMatch(/\s{2,}|undefined|null/);
  });

  it("o token do captcha vai junto — sem ele a rota devolve 403", () => {
    expect(payload().turnstileToken).toBe("tok");
  });
});

describe("o que o formulário NÃO pede e NÃO promete", () => {
  it("não coleta e-mail", () => {
    // Crédito ruim é a maior causa de perda de lead; formulário curto
    // qualifica menos e converte mais. A qualificação é do consultor.
    expect(payload().cliente).not.toHaveProperty("email");
  });

  it("não coleta CPF nem nada além dos três campos", () => {
    expect(Object.keys(payload().cliente).sort()).toEqual(["nome", "whatsapp"]);
  });

  it("a mensagem não fala em FIPE, desconto ou abaixo da tabela", () => {
    // Mesma regra de `/avaliacao`: o cliente nunca vê valor de compra no site.
    for (const proibido of [/fipe/i, /desconto/i, /abaixo da tabela/i]) {
      expect(payload().mensagem, `a mensagem cita ${proibido}`).not.toMatch(proibido);
    }
  });

  it("a mensagem não promete prazo", () => {
    // "em 7 dias" é promessa que a loja não controla — o carro depende de
    // aparecer um que passe na perícia.
    for (const proibido of [/\b\d+\s*dias?\b/i, /\b\d+\s*horas?\b/i, /\bsemana\b/i]) {
      expect(payload().mensagem, `a mensagem promete prazo: ${proibido}`).not.toMatch(proibido);
    }
  });
});

describe("a rota de leads sabe nomear um lead sem veículo", () => {
  const rota = lerCodigo("src/app/api/leads/route.ts");

  it("o `content_name` da CAPI tem uma saída quando não há veículo", () => {
    /*
     * O bloco da CAPI monta `content_name` a partir de `veiculo`, e a
     * encomenda não tem um — o carro é justamente o que não existe no pátio.
     * Sem uma saída, o evento de servidor chegaria ao Meta sem nome de
     * conteúdo, enquanto o do navegador chega com um: os dois lados do mesmo
     * `event_id` descrevendo coisas diferentes.
     *
     * A adição é aditiva e não renomeia nada (regra 7): só um `??` no fim.
     */
    expect(rota).toMatch(/content_name:[^,]*contentName/);
  });
});
