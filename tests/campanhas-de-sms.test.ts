import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerRespostaDoSms, enviarSms, lerOperadora, APIBRASIL_ENVIO_DE_SMS } from "../src/lib/apiBrasilSms";
import { familiaDoModelo, familiasNoTexto, marcaCanonica } from "../src/lib/familiaDoModelo";
import { PERFIS, podeFazer } from "../src/lib/permissoes";
import { PISO_DA_BANDA, TETO_DA_BANDA } from "../src/lib/similares";
import {
  ACAO_CAMPANHAS_DE_SMS,
  ALFABETO_DO_CODIGO,
  CRITERIOS_DE_PUBLICO,
  JANELAS_DE_INTERESSE,
  DATA_DESCONHECIDA,
  DESCANSO_PADRAO,
  MENSAGEM_PADRAO,
  MENSAGEM_PADRAO_DE_TROCA,
  MENSAGEM_PADRAO_SEM_CARRO,
  PAPEIS_DAS_CAMPANHAS_DE_SMS,
  PISO_DO_PRECO_PARECIDO,
  RODAPE_DE_SAIDA,
  SITUACOES_DA_CAMPANHA,
  SITUACOES_DO_ENVIO,
  TETO_DO_PRECO_PARECIDO,
  destinoDoClique,
  ehCodigoDeSms,
  ehPedidoDeSaida,
  lerPedidoDeCampanha,
  lerRetornoDoSms,
  mascararTelefoneDoSms,
  montarMensagem,
  montarPublico,
  percentualDeMatch,
  sinaisDeAfinidade,
  SINAIS_DE_AFINIDADE,
  paraOAlfabetoDoSms,
  precoNoSms,
  primeiroNome,
  resumoDaCampanha,
  semNumeroLongo,
  tamanhoDoSms,
  telefoneParaSms,
  type CarroDoPublico,
  type InteresseRegistrado,
  type LeadDoPublico,
} from "../src/lib/smsCampanhas";

/**
 * Campanhas de SMS — a parte pura e o cliente do fornecedor (07/10/2026).
 *
 * Três coisas aqui custam caro quando erram, e é nelas que os testes moram:
 * QUEM recebe (mandar para quem já comprou, para quem pediu para sair, ou
 * duas vezes para o mesmo número), QUANTO custa (um acento dobra o preço), e
 * o que se faz com uma resposta que NÃO chegou (nunca mandar de novo).
 */

const raiz = join(__dirname, "..");
const ler = (caminho: string) => readFileSync(join(raiz, caminho), "utf8");

describe("o tamanho da mensagem", () => {
  it("160 caracteres do alfabeto padrão são um SMS; 161 já são dois", () => {
    expect(tamanhoDoSms("a".repeat(160))).toEqual({ caracteres: 160, partes: 1, unicode: false });
    expect(tamanhoDoSms("a".repeat(161)).partes).toBe(2);
    expect(tamanhoDoSms("a".repeat(306)).partes).toBe(2);
    expect(tamanhoDoSms("a".repeat(307)).partes).toBe(3);
    expect(tamanhoDoSms("").partes).toBe(0);
  });

  it("um caractere fora do alfabeto derruba o SMS para 70", () => {
    // "ã" e "õ" não estão no GSM-7; "é" e "ç" maiúsculo estão.
    expect(tamanhoDoSms("promoção").unicode).toBe(true);
    expect(tamanhoDoSms("x".repeat(69) + "ã").partes).toBe(1);
    expect(tamanhoDoSms("x".repeat(70) + "ã").partes).toBe(2);
    // O espaço inseparável que o Intl põe depois de "R$" também derruba.
    expect(tamanhoDoSms((89900).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })).unicode).toBe(true);
    expect(tamanhoDoSms(precoNoSms(89900)).unicode).toBe(false);
  });

  it("a mensagem montada nunca sai do alfabeto padrão", () => {
    // Colado de um editor de texto: aspas curvas, travessão, reticências, ordinal e emoji.
    const texto = montarMensagem("{nome}, promoção do “{carro}” só até amanhã — {preco}… 1ª parcela em 30 dias 🚗 Veja: {link}", {
      nome: "JOÃO PAULO",
      carro: "Citroën C4 Cactus 2022",
      preco: precoNoSms(89900),
      link: "exemplo.com.br/s/abc2345",
    });
    expect(tamanhoDoSms(texto).unicode).toBe(false);
    expect(texto).toContain('Joao, promocao do "Citroen C4 Cactus 2022" so ate amanha - R$ 89.900... 1a parcela em 30 dias Veja:');
    // E o nome que o NFD não resolve não leva emoji para dentro da mensagem.
    expect(tamanhoDoSms(montarMensagem(MENSAGEM_PADRAO, { nome: "Lu🌸 Souza", carro: "Fiat Uno", preco: "R$ 30.000", link: "x.com/s/abc2345" })).unicode).toBe(false);
    expect(paraOAlfabetoDoSms("“aspas” – traço… nº 1 ß ø")).toBe('"aspas" - traco... no 1 ß ø');
  });
});

describe("a mensagem", () => {
  const valores = { nome: "maria da silva", carro: "VW T-Cross 2022", preco: "R$ 122.180", link: "exemplo.com.br/s/abc2345" };

  it("troca as variáveis, usa só o primeiro nome e põe o rodapé de saída", () => {
    expect(montarMensagem(MENSAGEM_PADRAO, valores)).toBe(
      `Maria, o VW T-Cross 2022 que voce viu na Motors Store esta por R$ 122.180: exemplo.com.br/s/abc2345 ${RODAPE_DE_SAIDA}`,
    );
  });

  it("sem nome, a vírgula some junto e a frase começa em maiúscula", () => {
    for (const nome of [null, "", "  ", "5541999990000", "a@b.com", "J"]) {
      expect(montarMensagem(MENSAGEM_PADRAO, { ...valores, nome }), String(nome)).toMatch(/^O VW T-Cross 2022 que voce viu/);
    }
  });

  it("o rodapé de saída não é opcional, e não entra duas vezes", () => {
    expect(montarMensagem("{carro}: {link}", valores)).toMatch(/SAIR$/);
    const comRodape = montarMensagem("{carro}: {link}. Para parar, responda SAIR", valores);
    expect(comRodape.match(/SAIR/g)).toHaveLength(1);
    // A palavra solta no texto não dispensa a instrução.
    expect(montarMensagem("{nome}, nao deixe o {carro} SAIR do estoque: {link}", valores)).toMatch(/Sair: responda SAIR$/);
  });

  it("primeiro nome", () => {
    expect(primeiroNome("MARIA DA SILVA")).toBe("Maria");
    expect(primeiroNome("  josé ")).toBe("José");
    expect(primeiroNome(null)).toBe("");
    // Só letras, até 20: nada de sobrenome colado, emoji, ou nome-lixo que estoura a mensagem.
    for (const lixo of ["Lu🌸", "Maria.Silva.Santos", "a".repeat(21), "Dr.", "41999990000"]) expect(primeiroNome(lixo), lixo).toBe("");
    expect(primeiroNome("ana-clara d'ávila")).toBe("Ana-clara");
  });
});

describe("o pedido de campanha", () => {
  const bom = { nome: "T-Cross", veiculoId: 123, criterio: "mesmo_modelo", janelaDias: 180, mensagem: MENSAGEM_PADRAO };

  it("aceita o pedido completo, e o período sem limite", () => {
    expect(lerPedidoDeCampanha(bom)).toEqual({ ok: true, pedido: { ...bom, canais: [], descansoDias: DESCANSO_PADRAO, compraHaMeses: null, destino: "estoque" } });
    expect(lerPedidoDeCampanha({ ...bom, criterio: "clientes", veiculoId: null, compraHaMeses: 24, destino: "avaliacao", mensagem: MENSAGEM_PADRAO_DE_TROCA })).toMatchObject({ ok: true, pedido: { compraHaMeses: 24, destino: "avaliacao" } });
    // A data de compra só filtra quem é cliente; destino fora da lista não passa.
    for (const torto of [{ ...bom, compraHaMeses: 24 }, { ...bom, criterio: "clientes", compraHaMeses: 6 }, { ...bom, destino: "https://outro.site" }]) expect(lerPedidoDeCampanha(torto).ok, JSON.stringify(torto)).toBe(false);
    expect(lerPedidoDeCampanha({ ...bom, canais: ["OLX", " OLX ", "", 7, "WebMotors"], descansoDias: 0 })).toMatchObject({ ok: true, pedido: { canais: ["OLX", "WebMotors"], descansoDias: 0 } });
    expect(lerPedidoDeCampanha({ ...bom, janelaDias: null })).toMatchObject({ ok: true, pedido: { janelaDias: null } });
  });

  it("recusa o que falta, e a mensagem sem link", () => {
    for (const torto of [null, {}, { ...bom, nome: " " }, { ...bom, nome: "x".repeat(81) }, { ...bom, veiculoId: "abc" }, { ...bom, criterio: "ninguem" }, { ...bom, descansoDias: 3 }, { ...bom, veiculoId: null }, { ...bom, janelaDias: 45 }, { ...bom, mensagem: "" }]) {
      expect(lerPedidoDeCampanha(torto).ok, JSON.stringify(torto)).toBe(false);
    }
    // Por perfil o carro é opcional; sem ele, a mensagem não fala de carro.
    expect(lerPedidoDeCampanha({ ...bom, criterio: "clientes", veiculoId: null, mensagem: MENSAGEM_PADRAO_SEM_CARRO })).toMatchObject({ ok: true, pedido: { veiculoId: null, criterio: "clientes" } });
    expect(lerPedidoDeCampanha({ ...bom, criterio: "todos", veiculoId: null })).toMatchObject({ ok: false });
    const semLink = lerPedidoDeCampanha({ ...bom, mensagem: "Oi {nome}" });
    expect(semLink).toMatchObject({ ok: false });
    expect(!semLink.ok && semLink.motivo).toContain("{link}");
  });
});

describe("o telefone", () => {
  it("só celular brasileiro, com 55", () => {
    expect(telefoneParaSms("(41) 99999-0000")).toBe("5541999990000");
    expect(telefoneParaSms("5541999990000")).toBe("5541999990000");
    expect(telefoneParaSms("+55 41 99999-0000")).toBe("5541999990000");
  });

  it("fixo, número curto e lixo não recebem SMS", () => {
    for (const ruim of ["4133330000", "554133330000", "999990000", "", null, "41899990000", "0599999000011"]) {
      expect(telefoneParaSms(ruim), String(ruim)).toBeNull();
    }
  });

  it("a máscara esconde o meio do número", () => {
    const mascarado = mascararTelefoneDoSms("5541999990000");
    expect(mascarado).toBe("(41) 9••••-0000");
    expect(mascarado).not.toMatch(/\d{5}/);
  });
});

describe("o público", () => {
  const carros: CarroDoPublico[] = [
    { id: 1, marca: "Volkswagen", modelo: "T-Cross", preco: 120000 },
    { id: 2, marca: "Volkswagen", modelo: "T-Cross", preco: 110000 },
    { id: 3, marca: "Volkswagen", modelo: "Nivus", preco: 115000 },
    { id: 4, marca: "Fiat", modelo: "Pulse", preco: 95000 },
    { id: 5, marca: "Fiat", modelo: "Uno", preco: 30000 },
  ];
  const alvo = carros[0];
  const AGORA = new Date("2026-10-07T12:00:00Z");
  const ha = (dias: number) => new Date(AGORA.getTime() - dias * 86400000).toISOString();
  const lead = (id: string, extra: Partial<LeadDoPublico> = {}): LeadDoPublico => ({
    id,
    nome: `Pessoa ${id}`,
    telefone: `55419999900${id.padStart(2, "0")}`,
    veiculoId: null,
    desfecho: null,
    criadoEm: ha(10),
    ...extra,
  });
  const interesse = (leadId: string, veiculoId: number, extra: Partial<InteresseRegistrado> = {}): InteresseRegistrado => ({
    leadId,
    veiculoId,
    rotulo: null,
    preco: null,
    motivoDescarte: null,
    criadoEm: ha(10),
    ...extra,
  });
  const montar = (criterio: (typeof CRITERIOS_DE_PUBLICO)[number], leads: LeadDoPublico[], interesses: InteresseRegistrado[], extra: { janelaDias?: number | null; saiu?: string[] } = {}) =>
    montarPublico({ alvo, criterio, janelaDias: (extra.janelaDias ?? null) as never, agora: AGORA, interesses, leads, carros, saiuDaLista: new Set(extra.saiu ?? []) });
  const ids = (p: ReturnType<typeof montar>) => p.destinatarios.map((d) => d.leadId).sort();

  const leads = ["1", "2", "3", "4", "5"].map((id) => lead(id));
  const interesses = [interesse("1", 1), interesse("2", 2), interesse("3", 3), interesse("4", 4), interesse("5", 5)];

  it("cada critério abre um pouco mais", () => {
    expect(ids(montar("mesmo_veiculo", leads, interesses))).toEqual(["1"]);
    expect(ids(montar("mesmo_modelo", leads, interesses))).toEqual(["1", "2"]);
    expect(ids(montar("mesma_marca", leads, interesses))).toEqual(["1", "2", "3"]);
    // Preço parecido: o alvo (120 mil) cabe na banda de quem olhou carro de 86 a 171 mil.
    expect(ids(montar("faixa_de_preco", leads, interesses))).toEqual(["1", "2", "3", "4"]);
  });

  it("a banda de preço é a mesma dos parecidos da ficha", () => {
    expect([PISO_DO_PRECO_PARECIDO, TETO_DO_PRECO_PARECIDO]).toEqual([PISO_DA_BANDA, TETO_DA_BANDA]);
  });

  it("carro que já saiu do estoque é reconhecido pelo rótulo guardado", () => {
    const antigos = [interesse("1", 900, { rotulo: "Volkswagen T-Cross Highline 2021" }), interesse("2", 901, { rotulo: "Volkswagen Polo 2020" }), interesse("3", 902, { rotulo: "Fiat Cross 2019" })];
    expect(ids(montar("mesmo_modelo", leads, antigos))).toEqual(["1"]);
    expect(ids(montar("mesma_marca", leads, antigos))).toEqual(["1", "2"]);
  });

  it("o carro principal do lead antigo conta, sem dobrar com a linha de interesse", () => {
    const antigos = [lead("1", { veiculoId: 1 }), lead("2", { veiculoId: 1 })];
    const p = montar("mesmo_veiculo", antigos, [interesse("2", 1)]);
    expect(ids(p)).toEqual(["1", "2"]);
    expect(p.fora.repetido).toBe(0);
  });

  it("fora: quem já comprou, quem desistiu, quem não tem celular, quem pediu para sair", () => {
    const p = montar(
      "mesmo_veiculo",
      [lead("1", { desfecho: "ganho" }), lead("2"), lead("3", { telefone: "4133330000" }), lead("4"), lead("5"), lead("6", { desfecho: "perdido" })],
      [interesse("1", 1), interesse("2", 1, { motivoDescarte: "comprou_fora" }), interesse("3", 1), interesse("4", 1), interesse("5", 1, { motivoDescarte: "preco" }), interesse("6", 1)],
      { saiu: ["5541999990004"] },
    );
    // Descartou por PREÇO continua no público (é para ele que a promoção serve); perdido também.
    expect(ids(p)).toEqual(["5", "6"]);
    expect(p.fora).toEqual({ semCelular: 1, saiuDaLista: 1, jaComprou: 2, desistiu: 0, descartado: 0, semInteresse: 0, descanso: 0, repetido: 0 });
  });

  it("quem já comprou é a PESSOA (o telefone), em qualquer lead e qualquer carro", () => {
    const mesmo = "41999990000";
    // Lead A ganhou o Uno; lead B, antigo, do mesmo número, olhou o T-Cross.
    const ganhoEmOutro = montar("mesmo_veiculo", [lead("a", { telefone: mesmo, desfecho: "ganho" }), lead("b", { telefone: mesmo })], [interesse("a", 5), interesse("b", 1)]);
    expect(ids(ganhoEmOutro)).toEqual([]);
    expect(ganhoEmOutro.fora.jaComprou).toBe(1);
    // "Comprou fora" num lead tira o outro lead do mesmo número.
    const fora = montar("mesmo_veiculo", [lead("a", { telefone: mesmo }), lead("b", { telefone: mesmo })], [interesse("a", 4, { motivoDescarte: "comprou_fora" }), interesse("b", 1)]);
    expect(ids(fora)).toEqual([]);
  });

  it("lead descartado pela equipe (spam, teste) não é público; desistir de um interesse tira só aquele", () => {
    const p = montar("mesmo_veiculo", [lead("1", { desfecho: "descartado" }), lead("2"), lead("3")], [interesse("1", 1), interesse("2", 1, { motivoDescarte: "desistiu" }), interesse("3", 1)]);
    expect(ids(p)).toEqual(["3"]);
    expect(p.fora).toMatchObject({ descartado: 1, desistiu: 1 });
  });

  it("o interesse de um lead descartado não vale, nem com outro cadastro bom do mesmo número", () => {
    const mesmo = "41999990000";
    const p = montar("mesmo_veiculo", [lead("spam", { telefone: mesmo, desfecho: "descartado" }), lead("bom", { telefone: mesmo })], [interesse("spam", 1)]);
    expect(p.destinatarios).toEqual([]);
    expect(p.fora.descartado).toBe(1);
    // Com interesse próprio, o cadastro bom entra, e é ele que representa a pessoa.
    const comInteresse = montar("mesmo_veiculo", [lead("spam", { telefone: mesmo, desfecho: "descartado" }), lead("bom", { telefone: mesmo })], [interesse("spam", 1), interesse("bom", 1)]);
    expect(comInteresse.destinatarios.map((d) => d.leadId)).toEqual(["bom"]);
  });

  it("o ano no rótulo não vira modelo", () => {
    const peugeot: CarroDoPublico = { id: 50, marca: "Peugeot", modelo: "2008", preco: 90000 };
    const p = montarPublico({ alvo: peugeot, criterio: "mesmo_modelo", janelaDias: null, agora: AGORA, leads: [lead("1"), lead("2")], carros: [peugeot], saiuDaLista: new Set(), interesses: [interesse("1", 900, { rotulo: "Peugeot 208 Griffe 1.6 2008" }), interesse("2", 901, { rotulo: "Peugeot 2008 Griffe 2021" })] });
    expect(p.destinatarios.map((d) => d.leadId)).toEqual(["2"]);
  });

  it("desistiu de um carro mas segue olhando outro do mesmo modelo: continua no público", () => {
    const p = montar("mesmo_modelo", [lead("1")], [interesse("1", 1, { motivoDescarte: "desistiu" }), interesse("1", 2)]);
    expect(ids(p)).toEqual(["1"]);
  });

  it("o mesmo número em dois leads recebe uma vez só, pelo lead mais recente", () => {
    const p = montar("mesmo_veiculo", [lead("1", { telefone: "41999990000" }), lead("2", { telefone: "(41) 99999-0000" })], [interesse("1", 1, { criadoEm: ha(40) }), interesse("2", 1, { criadoEm: ha(5) })]);
    expect(ids(p)).toEqual(["2"]);
    expect(p.fora.repetido).toBe(1);
  });

  it("a janela corta o interesse antigo", () => {
    const antigos = [interesse("1", 1, { criadoEm: ha(20) }), interesse("2", 1, { criadoEm: ha(100) })];
    expect(ids(montar("mesmo_veiculo", leads, antigos, { janelaDias: 30 }))).toEqual(["1"]);
    expect(ids(montar("mesmo_veiculo", leads, antigos, { janelaDias: 180 }))).toEqual(["1", "2"]);
    expect(ids(montar("mesmo_veiculo", leads, antigos))).toEqual(["1", "2"]);
  });
});

describe("o público por perfil, com a base importada", () => {
  const AGORA = new Date("2026-10-07T12:00:00Z");
  const ha = (dias: number) => new Date(AGORA.getTime() - dias * 86400000).toISOString();
  const tcross: CarroDoPublico = { id: 1, marca: "volkswagen", modelo: "t cross highline 250 tsi aut", preco: 120000 };
  const pessoa = (id: string, extra: Partial<LeadDoPublico> = {}): LeadDoPublico => ({ id, origem: id.startsWith("c:") ? "base" : "lead", nome: `Pessoa ${id}`, telefone: `554199999${id.replace(/\D/g, "").padStart(4, "0")}`, veiculoId: null, desfecho: null, criadoEm: ha(20), ...extra });
  const registro = (leadId: string, extra: Partial<InteresseRegistrado> = {}): InteresseRegistrado => ({ leadId, veiculoId: null, rotulo: null, preco: null, motivoDescarte: null, criadoEm: ha(20), ...extra });
  const montar = (extra: Partial<Parameters<typeof montarPublico>[0]>) => montarPublico({ alvo: tcross, criterio: "mesmo_modelo", janelaDias: null, agora: AGORA, interesses: [], leads: [], carros: [tcross], saiuDaLista: new Set(), ...extra });

  it("o texto do RevendaMais casa com o estoque pela marca e pela família do modelo", () => {
    const p = montar({
      leads: [pessoa("c:1"), pessoa("c:2"), pessoa("c:3"), pessoa("c:4")],
      interesses: [
        registro("c:1", { marca: "VOLKSWAGEN", modelo: "T CROSS COMFORTLINE 200 TSI" }),
        registro("c:2", { marca: "VOLKSWAGEN", modelo: "GOL 1.0" }),
        registro("c:3", { marca: "FIAT", modelo: "T CROSS" }),
        registro("c:4", { rotulo: "Volkswagen T-Cross Highline 2022" }),
      ],
    });
    expect(p.destinatarios.map((d) => d.contatoId ?? d.leadId).sort()).toEqual(["1", "4"]);
    expect(p.destinatarios.find((d) => d.contatoId === "1")).toMatchObject({ leadId: null, contatoId: "1" });
    expect(montar({ criterio: "mesma_marca", leads: [pessoa("c:1"), pessoa("c:2"), pessoa("c:3")], interesses: [registro("c:1", { marca: "VW", modelo: "GOL" }), registro("c:2", { marca: "Volkswagen", modelo: "UP" }), registro("c:3", { marca: "FIAT", modelo: "UNO" })] }).destinatarios).toHaveLength(2);
  });

  it("família do modelo e marca canônica", () => {
    for (const [texto, familia] of [["T CROSS HIGHLINE 250 TSI", "tcross"], ["t cross highline 250 tsi aut", "tcross"], ["HR-V EX CVT", "hrv"], ["UP! TAKE 1.0", "up"], ["208 LIKE 1.0", "208"], ["novo voyage 1.0", "voyage"], ["GRAN CARAVAN LX", "caravan"], ["C-180 CGI", "c180"], ["", ""]]) {
      expect(familiaDoModelo(texto), texto).toBe(familia);
    }
    expect(marcaCanonica("VW")).toBe(marcaCanonica("Volkswagen"));
    expect(marcaCanonica("MERCEDES-BENZ")).toBe(marcaCanonica("mercedes benz"));
    expect([...familiasNoTexto("Peugeot 208 Griffe 1.6 2008")]).not.toContain("2008");
    expect([...familiasNoTexto("Volkswagen T-Cross Highline 2022")]).toContain("tcross");
  });

  it("a mesma pessoa no site e na base é uma só, e o que um sabe vale para o outro", () => {
    const mesmo = "41999990001";
    // No site ela olhou o T-Cross; a base diz que ela já comprou.
    const p = montar({ criterio: "mesmo_veiculo", leads: [pessoa("l1", { telefone: mesmo, veiculoId: 1 }), pessoa("c:9", { telefone: mesmo, cliente: true })] });
    expect(p.destinatarios).toEqual([]);
    expect(p.fora.jaComprou).toBe(1);
    // A compra registrada na base também faz o cliente.
    const comCompra = montar({ criterio: "mesmo_veiculo", leads: [pessoa("l1", { telefone: mesmo, veiculoId: 1 }), pessoa("c:9", { telefone: mesmo })], interesses: [registro("c:9", { tipo: "compra", marca: "FIAT", modelo: "UNO" })] });
    expect(comCompra.fora.jaComprou).toBe(1);
    // E a compra não conta como interesse no carro comprado.
    expect(montar({ leads: [pessoa("c:1")], interesses: [registro("c:1", { tipo: "compra", marca: "Volkswagen", modelo: "T CROSS" })] }).destinatarios).toEqual([]);
  });

  it("interessados, clientes e todos", () => {
    const leads = [pessoa("c:1"), pessoa("c:2", { cliente: true }), pessoa("l3"), pessoa("l4", { desfecho: "ganho" }), pessoa("c:5", { semInteresse: true }), pessoa("l6", { desfecho: "descartado" })];
    const interesses = [registro("c:1", { marca: "FIAT", modelo: "UNO" })];
    const quem = (criterio: "interessados" | "clientes" | "todos") => montar({ alvo: null, criterio, leads, interesses }).destinatarios.map((d) => d.contatoId ?? d.leadId).sort();
    // Interessado é quem não comprou, com ou sem carro identificado.
    expect(quem("interessados")).toEqual(["1", "l3"]);
    expect(quem("clientes")).toEqual(["2", "l4"]);
    expect(quem("todos")).toEqual(["1", "2", "l3", "l4"]);
    const fora = montar({ alvo: null, criterio: "todos", leads, interesses }).fora;
    expect(fora).toMatchObject({ semInteresse: 1, descartado: 1, jaComprou: 0 });
    expect(montar({ alvo: null, criterio: "interessados", leads, interesses }).fora.jaComprou).toBe(2);
  });

  it("o período, por perfil, olha o último contato", () => {
    const leads = [pessoa("c:1", { criadoEm: ha(400), ultimoContatoEm: ha(10) }), pessoa("c:2", { criadoEm: ha(400), ultimoContatoEm: ha(300) }), pessoa("l3", { criadoEm: ha(50) })];
    const quem = (janelaDias: 30 | 90 | null) => montar({ alvo: null, criterio: "todos", janelaDias, leads }).destinatarios.map((d) => d.contatoId ?? d.leadId).sort();
    expect(quem(30)).toEqual(["1"]);
    expect(quem(90)).toEqual(["1", "l3"]);
    expect(quem(null)).toEqual(["1", "2", "l3"]);
  });

  it("o que não tem data conhecida só entra em 'sempre', não é recente e não vale como compra", () => {
    const semData = pessoa("c:1", { criadoEm: DATA_DESCONHECIDA, ultimoContatoEm: null });
    expect(montar({ alvo: null, criterio: "todos", janelaDias: 30, leads: [semData] }).destinatarios).toEqual([]);
    expect(montar({ alvo: null, criterio: "todos", janelaDias: null, leads: [semData] }).destinatarios[0]).toMatchObject({ contatoId: "1", quando: null });
    // Carro olhado não se sabe quando: fora da janela, e sem o sinal de recente.
    const carro = registro("c:1", { marca: "Volkswagen", modelo: "T CROSS", criadoEm: DATA_DESCONHECIDA });
    expect(montar({ janelaDias: 30, leads: [semData], interesses: [carro] }).destinatarios).toEqual([]);
    expect(montar({ janelaDias: null, leads: [semData], interesses: [carro] }).destinatarios[0]).toMatchObject({ match: 40 });
    // Compra sem data não passa em "comprou há pelo menos um ano".
    const compra = registro("c:1", { tipo: "compra", marca: "FIAT", modelo: "UNO", criadoEm: DATA_DESCONHECIDA });
    expect(montar({ alvo: null, criterio: "clientes", compraHaMeses: 12, leads: [semData], interesses: [compra] }).destinatarios).toEqual([]);
    expect(montar({ alvo: null, criterio: "clientes", leads: [semData], interesses: [compra] }).destinatarios).toHaveLength(1);
  });

  it("planilha comum sem marca: o modelo decide sozinho em 'este modelo'", () => {
    const p = montar({ leads: [pessoa("c:1"), pessoa("c:2")], interesses: [registro("c:1", { marca: null, modelo: "T-Cross Highline" }), registro("c:2", { marca: null, modelo: "Gol 1.0" })] });
    expect(p.destinatarios.map((d) => d.contatoId)).toEqual(["1"]);
    expect(montar({ criterio: "mesma_marca", leads: [pessoa("c:1")], interesses: [registro("c:1", { marca: null, modelo: "T-Cross Highline" })] }).destinatarios).toEqual([]);
  });

  it("o filtro de canal define o público, sem acento nem caixa", () => {
    const leads = [pessoa("c:1", { canais: ["OLX", "WhatsApp"] }), pessoa("c:2", { canais: ["SóCarrão"] }), pessoa("l3", { canais: ["Site da loja"] }), pessoa("c:4")];
    const quem = (canais: string[]) => montar({ alvo: null, criterio: "todos", canais, leads }).destinatarios.map((d) => d.contatoId ?? d.leadId).sort();
    expect(quem(["olx"])).toEqual(["1"]);
    expect(quem(["socarrao", "Site da Loja"])).toEqual(["2", "l3"]);
    expect(quem([])).toEqual(["1", "2", "4", "l3"]);
  });

  it("quem recebeu campanha há pouco descansa, e aparece na conta", () => {
    const p = montar({ alvo: null, criterio: "todos", leads: [pessoa("c:1"), pessoa("c:2")], recebeuHaPouco: new Set(["5541999990001"]) });
    expect(p.destinatarios.map((d) => d.contatoId)).toEqual(["2"]);
    expect(p.fora.descanso).toBe(1);
  });
});

describe("o percentual de match", () => {
  const AGORA = new Date("2026-10-07T12:00:00Z");
  const ha = (dias: number) => new Date(AGORA.getTime() - dias * 86400000).toISOString();
  const alvo: CarroDoPublico = { id: 1, marca: "volkswagen", modelo: "t cross highline 250 tsi aut", preco: 120000 };
  const i = (extra: object) => ({ veiculoId: null as number | null, rotulo: null, marca: null as string | null, modelo: null as string | null, preco: null as number | null, criadoEm: ha(200), ...extra });

  it("são cinco sinais, um quinto cada, e este carro já traz quatro", () => {
    expect(SINAIS_DE_AFINIDADE).toHaveLength(5);
    expect(sinaisDeAfinidade(i({ veiculoId: 1, criadoEm: ha(10) }), alvo, alvo, AGORA)).toEqual(["mesma_marca", "mesmo_modelo", "este_carro", "preco_parecido", "recente"]);
    expect(percentualDeMatch(sinaisDeAfinidade(i({ veiculoId: 1 }), alvo, alvo, AGORA))).toBe(80);
    // Outro T-Cross, de preço parecido, há pouco: tudo menos "este carro".
    expect(percentualDeMatch(sinaisDeAfinidade(i({ marca: "VOLKSWAGEN", modelo: "T CROSS COMFORTLINE", preco: 110000, criadoEm: ha(30) }), alvo, undefined, AGORA))).toBe(80);
    // Mesma marca, outro modelo, sem preço conhecido, há muito tempo.
    expect(sinaisDeAfinidade(i({ marca: "VW", modelo: "GOL 1.0" }), alvo, undefined, AGORA)).toEqual(["mesma_marca"]);
    // Outra marca, preço parecido: o "perfil de carro" sem ser a marca.
    expect(sinaisDeAfinidade(i({ marca: "JEEP", modelo: "RENEGADE", preco: 115000 }), alvo, undefined, AGORA)).toEqual(["preco_parecido"]);
    expect(percentualDeMatch([])).toBe(0);
  });

  it("o público por carro sai com o match de cada pessoa, o maior primeiro", () => {
    const pessoa = (id: string): LeadDoPublico => ({ id, nome: id, telefone: `5541999990${id.padStart(3, "0")}`, veiculoId: null, desfecho: null, criadoEm: ha(300) });
    const p = montarPublico({
      alvo,
      criterio: "mesma_marca",
      janelaDias: null,
      agora: AGORA,
      leads: [pessoa("1"), pessoa("2"), pessoa("3")],
      carros: [alvo],
      saiuDaLista: new Set(),
      interesses: [
        { leadId: "1", veiculoId: null, rotulo: null, marca: "VW", modelo: "GOL", preco: null, motivoDescarte: null, criadoEm: ha(300) },
        { leadId: "2", veiculoId: 1, rotulo: null, preco: null, motivoDescarte: null, criadoEm: ha(5) },
        // A mesma pessoa olhou um Gol e um T-Cross: vale o que mais se parece.
        { leadId: "3", veiculoId: null, rotulo: null, marca: "VW", modelo: "GOL", preco: null, motivoDescarte: null, criadoEm: ha(5) },
        { leadId: "3", veiculoId: null, rotulo: null, marca: "VW", modelo: "T CROSS", preco: 118000, motivoDescarte: null, criadoEm: ha(5) },
      ],
    });
    expect(p.destinatarios.map((d) => [d.leadId, d.match, d.olhou])).toEqual([["2", 100, "Volkswagen T Cross Highline 250 Tsi Aut"], ["3", 80, "Vw T Cross"], ["1", 20, "Vw Gol"]]);
    // Por perfil não há carro de referência: sem match.
    expect(montarPublico({ alvo: null, criterio: "todos", janelaDias: null, agora: AGORA, leads: [pessoa("1")], carros: [], saiuDaLista: new Set(), interesses: [] }).destinatarios[0]).toMatchObject({ match: null, olhou: null });
  });
});

describe("o link curto", () => {
  it("o código tem forma fixa, e o destino leva a marca da campanha", () => {
    expect(ehCodigoDeSms("abc2345")).toBe(true);
    for (const ruim of ["abc234", "abc23456", "abc234O", "abc2340", "../etc/"]) expect(ehCodigoDeSms(ruim), ruim).toBe(false);
    expect(destinoDoClique("/carros/vw/t-cross/highline-123", "xyz2345")).toBe("/carros/vw/t-cross/highline-123?utm_source=sms&utm_medium=sms&utm_campaign=sms-xyz2345");
  });
});

describe("o retorno do fornecedor", () => {
  it("lê a lista de avisos, e o aviso solto", () => {
    const avisos = lerRetornoDoSms([
      { id: "a1", status: "inserted_for_processing" },
      { id: 77, status: "SENT_TO_CARRIER" },
      { id: "a1", status: "reply", message: "  SAIR  " },
      { id: "a1", status: "delivered_whatever" },
      { status: "valid" },
      null,
    ]);
    expect(avisos.map((a) => [a.id, a.status, a.texto])).toEqual([
      ["a1", "inserted_for_processing", null],
      ["77", "sent_to_carrier", null],
      ["a1", "reply", "SAIR"],
      ["a1", "outro", null],
    ]);
    expect(lerRetornoDoSms({ id: "x", status: "valid" })).toHaveLength(1);
    expect(lerRetornoDoSms("lixo")).toEqual([]);
  });

  it("reconhece o pedido de saída, e não confunde com resposta comum", () => {
    for (const sim of ["SAIR", "sair", " Sair. ", "PARE", "PARA", "stop", "Cancelar", "não quero mais", "nao envie", "Remover", "quero sair", "Quero sair da lista de voces por favor", "Para de mandar mensagem", "me tira dessa lista", "nao me mande mais", "remove", "sair?"]) {
      expect(ehPedidoDeSaida(sim), sim).toBe(true);
    }
    for (const nao of ["Quero ver o carro", "posso sair hoje pra ver?", "Qual o valor?", "Vou sair do trabalho as 18h e passo ai para ver o carro", "é para financiar", "Para quando tem?", "", null]) {
      expect(ehPedidoDeSaida(nao), String(nao)).toBe(false);
    }
  });

  it("número comprido em texto livre vira máscara", () => {
    expect(semNumeroLongo("me liga 41 98888-7777 ou 5541999990000")).toBe("me liga •••• ou ••••");
    expect(semNumeroLongo("tenho 2 carros, ano 2022")).toBe("tenho 2 carros, ano 2022");
    expect(semNumeroLongo(null)).toBeNull();
  });
});

describe("o resumo", () => {
  it("conta cada etapa uma vez por pessoa, e o custo só do que saiu", () => {
    const envio = (extra: Record<string, unknown> = {}) => ({ situacao: "enviado" as const, naOperadoraEm: null, cliques: 0, respondeuEm: null, saiuEm: null, custo: 0.1, partes: 1, ...extra });
    const r = resumoDaCampanha([
      envio({ naOperadoraEm: "x", cliques: 3 }),
      envio({ naOperadoraEm: "x", respondeuEm: "x", saiuEm: "x", partes: 2, custo: 0.2 }),
      envio({ situacao: "falhou", custo: null }),
      envio({ situacao: "na_fila", custo: null }),
      envio({ situacao: "enviando", custo: null }),
    ]);
    expect(r).toEqual({ publico: 5, naFila: 2, enviados: 2, falhas: 1, naOperadora: 2, clicaram: 1, cliques: 3, responderam: 1, sairam: 1, custo: 0.3, partes: 3 });
  });
});

describe("a resposta da APIBrasil a um envio", () => {
  it("aceito: guarda o id e o custo, com vírgula ou ponto", () => {
    expect(lerRespostaDoSms(200, { error: false, response: { id: "sms_1", status: "processed" }, tax: "0,10" })).toMatchObject({ ok: true, id: "sms_1", custo: 0.1 });
    expect(lerRespostaDoSms(200, { id: 55, status: "processed" })).toMatchObject({ ok: true, id: "55", custo: null });
  });

  it("lê a resposta como a doc do SMS Marketing mostra (08/10/2026): id em response.data, mensagem e situação", () => {
    const doc = {
      error: false,
      message: "Dados validos! Voce foi tarifado em R$ 0,08.",
      balance: "250,700",
      tax: "0,080",
      api_limit_for: "credit",
      homolog: false,
      response: { status: "success", message: "Message sent successfully", data: { id: "118011503269e0cff74c375567372441", status: "processed" } },
    };
    expect(lerRespostaDoSms(200, doc)).toEqual({
      ok: true,
      id: "118011503269e0cff74c375567372441",
      custo: 0.08,
      fornecedor: { mensagem: "Dados validos! Voce foi tarifado em R$ 0,08.", situacao: "processed", homologacao: false },
    });
    // O fornecedor tratando como teste, mesmo sem a gente pedir: a tela tem de dizer.
    expect(lerRespostaDoSms(200, { ...doc, homolog: true })).toMatchObject({ ok: true, fornecedor: { homologacao: true } });
    expect(lerRespostaDoSms(200, { ...doc, api_limit_for: "homolog" })).toMatchObject({ ok: true, fornecedor: { homologacao: true } });
  });

  it("sem saldo e token recusado param o lote, e o SMS certamente não saiu", () => {
    expect(lerRespostaDoSms(402, {})).toMatchObject({ ok: false, paraOLote: true, podeTerSaido: false });
    expect(lerRespostaDoSms(401, {})).toMatchObject({ ok: false, paraOLote: true, podeTerSaido: false });
  });

  it("recusa com texto (número ou tipo inválido) é só daquele envio", () => {
    const r = lerRespostaDoSms(200, { error: true, message: "Número inválido" });
    expect(r).toEqual({ ok: false, motivo: "Número inválido", paraOLote: false, podeTerSaido: false });
    expect(lerRespostaDoSms(422, { message: "tipo desconhecido" })).toMatchObject({ ok: false, motivo: "tipo desconhecido", paraOLote: false });
  });

  it("5xx e corpo ilegível: pode ter saído", () => {
    expect(lerRespostaDoSms(503, null)).toMatchObject({ ok: false, paraOLote: true, podeTerSaido: true });
    expect(lerRespostaDoSms(200, null)).toMatchObject({ ok: false, podeTerSaido: true });
  });

  it("a operadora só vai quando escolhida, e só uma das quatro", async () => {
    const corpos: Array<Record<string, unknown>> = [];
    const buscar = async (_u: string, init: { body: string }) => (corpos.push(JSON.parse(init.body)), { status: 200, json: async () => ({ error: false }) });
    const base = { numero: "5541999990000", mensagem: "oi", token: "t", tipo: "sms-marketing", homologacao: false, retorno: null, buscar: buscar as never };
    await enviarSms({ ...base, operadora: "claro" });
    await enviarSms(base);
    expect(corpos[0].operator).toBe("claro");
    expect("operator" in corpos[1]).toBe(false);
    expect(lerOperadora("vivo")).toBe("vivo");
    expect(lerOperadora("nextel")).toBeNull();
  });

  it("o pedido leva número, texto, tipo, resposta ligada e o endereço do retorno", async () => {
    let visto: { url: string; corpo: Record<string, unknown>; auth: string } | null = null;
    const r = await enviarSms({
      numero: "5541999990000",
      mensagem: "oi",
      token: "tok",
      tipo: "sms-marketing",
      homologacao: true,
      retorno: "https://exemplo/retorno?token=x",
      buscar: async (url, init) => {
        visto = { url, corpo: JSON.parse(init.body), auth: init.headers.Authorization };
        return { status: 200, json: async () => ({ error: false, response: { id: "a" } }) };
      },
    });
    expect(r).toMatchObject({ ok: true, id: "a" });
    expect(visto).toEqual({
      url: APIBRASIL_ENVIO_DE_SMS,
      auth: "Bearer tok",
      corpo: { tipo: "sms-marketing", number: "5541999990000", message: "oi", user_reply: true, webhook_url: "https://exemplo/retorno?token=x", homolog: true },
    });
  });

  it("rede caída não vira nova tentativa: uma chamada, e 'pode ter saído'", async () => {
    let chamadas = 0;
    const r = await enviarSms({ numero: "5541999990000", mensagem: "oi", token: "t", tipo: "x", homologacao: false, retorno: null, buscar: async () => { chamadas++; throw new Error("ECONNRESET"); } });
    expect(chamadas).toBe(1);
    expect(r).toMatchObject({ ok: false, podeTerSaido: true });
  });
});

describe("as três camadas dizem a mesma coisa", () => {
  it("a matriz dá a campanha ao Administrador e ao Marketing, e a mais ninguém", () => {
    const quem = PERFIS.filter((p) => podeFazer(p, ACAO_CAMPANHAS_DE_SMS) === "faz");
    expect([...quem].sort()).toEqual([...PAPEIS_DAS_CAMPANHAS_DE_SMS].sort());
  });

  it("o menu mostra o item para os mesmos papéis", () => {
    const menu = ler("src/components/admin/SidebarNav.tsx");
    const grupo = menu.slice(menu.indexOf('title: "Marketing"'));
    expect(grupo.slice(0, grupo.indexOf("}", grupo.indexOf("Campanhas de SMS")))).toMatch(/roles: \["admin", "marketing"\][\s\S]*Campanhas de SMS/);
  });

  it("o banco deixa ler a campanha os mesmos papéis, e ninguém de sessão lê envio ou descadastro", () => {
    const sql = ler("supabase/migrations/20261007120000_sms_campanhas.sql");
    for (const papel of PAPEIS_DAS_CAMPANHAS_DE_SMS) expect(sql).toContain(`tem_papel(auth.uid(), '${papel}')`);
    expect(sql).toMatch(/grant select on public\.sms_campanhas to authenticated/);
    expect(sql).not.toMatch(/grant[^;]*on public\.sms_envios to authenticated/);
    expect(sql).not.toMatch(/grant[^;]*on public\.sms_descadastros to authenticated/);
    expect(sql).not.toMatch(/create policy[^;]*on public\.sms_envios/);
  });

  it("as listas fechadas do banco são as do código", () => {
    const sql = ler("supabase/migrations/20261007120000_sms_campanhas.sql");
    for (const valor of [...CRITERIOS_DE_PUBLICO, ...SITUACOES_DA_CAMPANHA, ...SITUACOES_DO_ENVIO]) expect(sql, valor).toContain(`'${valor}'`);
    for (const dias of JANELAS_DE_INTERESSE) if (dias !== null) expect(sql).toMatch(new RegExp(`\\b${dias}\\b`));
    expect(sql).toContain(`[${ALFABETO_DO_CODIGO}]{7}`);
  });

  it("toda rota da campanha passa pela porta, menos o retorno (token) e o link curto (público)", () => {
    for (const rota of ["route.ts", "previa/route.ts", "teste/route.ts", "[id]/enviar/route.ts", "[id]/interromper/route.ts"]) {
      expect(ler(`src/app/api/marketing/sms/${rota}`), rota).toContain("await autorizarCampanhasDeSms()");
    }
    expect(ler("src/app/api/marketing/sms/retorno/route.ts")).toContain("tokenConfere(");
    expect(ler("src/app/s/[codigo]/route.ts")).toContain("ehCodigoDeSms(codigo)");
  });

  it("nenhum componente da tela recebe telefone inteiro: só o tipo com máscara", () => {
    const lib = ler("src/lib/smsCampanhas.ts");
    const tipo = lib.slice(lib.indexOf("export interface EnvioNaTela"), lib.indexOf("export interface CampanhaDeSmsDetalhada"));
    expect(tipo).toContain("telefoneMascarado");
    expect(tipo).not.toMatch(/\btelefone:/);
    expect(tipo).not.toMatch(/\bnome:/);
  });
});
