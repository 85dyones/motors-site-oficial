import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";

/**
 * Avaliação Express — um CTA principal por tela.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * O painel escuro da direita tinha um "RECEBER PROPOSTA REAL" que, no passo
 * 03, aparecia ao lado do "SOLICITAR PROPOSTA" do formulário. Foi assim que o
 * defeito apareceu — dois botões prometendo a mesma coisa —, mas o custo era
 * maior que o da confusão visual, porque os dois não faziam a mesma coisa:
 *
 *   SOLICITAR PROPOSTA   → POST /api/avaliacao, com quilometragem, estado
 *                          mecânico, conservação e observações
 *   RECEBER PROPOSTA REAL → POST /api/leads, com marca, modelo, ano e FIPE
 *
 * A causa: o botão do painel chamava `handleWhatsappAvaliacaoClick`, que é o
 * botão do PASSO 04, e o `<aside>` renderiza em todos os passos. Quem
 * clicasse antes de enviar deixava o consultor sem os campos que decidem o
 * preço, mandava no WhatsApp uma frase que dizia ter enviado uma avaliação
 * inexistente, e era contado como `contato` em vez de `avaliacao`.
 *
 * As asserções abaixo protegem o conserto pelos dois lados: o painel sem
 * botão, e o handler alcançável só onde a frase dele é verdadeira.
 */

const fonte = ler("src/components/AutoAvaliacao.tsx");
const codigo = lerCodigo("src/components/AutoAvaliacao.tsx");

/** O `<aside>` da prévia, sem comentários — só o que renderiza. */
function painel(): string {
  const inicio = codigo.indexOf("<aside");
  const fim = codigo.indexOf("</aside>");
  expect(inicio, "o <aside> da prévia sumiu").toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return codigo.slice(inicio, fim);
}

describe("1 · o painel escuro não disputa com o formulário", () => {
  it("não tem botão nenhum", () => {
    // A regra é sobre o painel inteiro, não sobre um rótulo. Proibir só o
    // texto "RECEBER PROPOSTA REAL" deixaria o mesmo botão voltar com outro
    // nome — que é exatamente como ele apareceria de novo.
    expect(painel()).not.toContain("<button");
  });

  it("continua sendo a prévia que o nome dele promete", () => {
    // Tirar o botão não pode levar junto o conteúdo: a FIPE, o aviso de que
    // aquilo não é a proposta, e o "como a proposta é feita" são a razão de a
    // coluna existir.
    const p = painel();
    expect(p).toContain('aria-label="Prévia do resultado"');
    expect(p).toContain("COMO A PROPOSTA É FEITA");
    expect(fonte).toContain("não a nossa proposta");
  });

  it("mantém a frase que explica quem envia a avaliação", () => {
    // Ela fechava o bloco do botão. Sem esse cuidado, a remoção levaria junto
    // a única linha que diz ao cliente que quem responde é uma pessoa, e que
    // a proposta final depende de vistoria.
    //
    // Espaço normalizado: o JSX quebra a frase em três linhas indentadas, e
    // procurar o texto corrido acusaria ausência de algo que está lá.
    const p = painel().replace(/\s+/g, " ");
    expect(p).toContain("Quem envia a avaliação é o consultor");
    expect(p).toContain("vistoria presencial em Curitiba");
  });
});

describe("2 · o atalho de WhatsApp só onde a frase dele é verdadeira", () => {
  it("`handleWhatsappAvaliacaoClick` tem um chamador só", () => {
    // A mensagem que ele monta é "Enviei a avaliação do meu carro X no site".
    // Fora do passo 04 isso é falso — e nos passos 01 e 02 sai com a marca
    // vazia no meio, porque `step1.marca` ainda não foi escolhida.
    const chamadas = [...codigo.matchAll(/onClick=\{handleWhatsappAvaliacaoClick\}/g)];
    expect(chamadas).toHaveLength(1);
  });

  it("e esse chamador está dentro do passo 04", () => {
    const passo4 = codigo.indexOf("{step === 4 && (");
    expect(passo4).toBeGreaterThan(-1);
    // A partir do passo 04, e não do começo do arquivo: `{step < 4 && (`
    // aparece duas vezes, e a primeira fica bem antes deste bloco.
    const depoisDoPasso4 = codigo.indexOf("{step < 4 && (", passo4);
    expect(depoisDoPasso4).toBeGreaterThan(passo4);

    const chamada = codigo.indexOf("onClick={handleWhatsappAvaliacaoClick}");
    expect(chamada).toBeGreaterThan(passo4);
    expect(chamada).toBeLessThan(depoisDoPasso4);
  });

  it("a classificação `contato` do modal continua com premissa válida", () => {
    // O modal é marcado como `contato` porque o lead de avaliação já teria
    // sido contado no `trackAppraisalSubmit`. Isso só vale se o modal for
    // alcançável apenas depois do envio — que é o que as duas asserções
    // acima garantem. Aqui a premissa fica escrita ao lado do valor.
    expect(codigo).toContain('tipoDeLead: "contato"');
    expect(fonte).toMatch(/trackAppraisalSubmit[\s\S]{0,400}?tipoDeLead: "contato"/);
  });
});

describe("3 · um envio só, e ele leva os dados que decidem o preço", () => {
  it("existe um único `type=\"submit\"` na tela", () => {
    const submits = [...codigo.matchAll(/type="submit"/g)];
    expect(submits).toHaveLength(1);
  });

  it("o envio manda quilometragem e estado — o atalho não tem como", () => {
    // `isStep2Valid` torna a quilometragem obrigatória porque a faixa de 30%
    // depende do limite de 150.000 km. É o campo que separa um pedido de
    // avaliação de um "oi".
    // A partir do `fetch`, e não do começo: `trackAppraisalSubmit` aparece
    // antes, no import — fatiar até a primeira ocorrência devolvia string
    // vazia, e um `toContain` sobre string vazia falha por motivo errado.
    const inicio = codigo.indexOf('fetch("/api/avaliacao"');
    expect(inicio).toBeGreaterThan(-1);
    const envio = codigo.slice(inicio, codigo.indexOf("trackAppraisalSubmit", inicio));
    for (const campo of ["quilometragem", "estado_mecanico", "estado_conservacao", "observacoes"]) {
      expect(envio, campo).toContain(campo);
    }
  });

  it("nenhum atributo de veículo é inventado no payload do canal", () => {
    // `tipo_badge: "BAIXA KM"` era fixo no código e ia para o CRM em toda
    // avaliação, inclusive nas de carro com 200.000 km — afirmação inventada
    // num campo que o consultor lê como dado.
    expect(codigo).not.toContain("BAIXA KM");
    expect(codigo).not.toContain("veiculo_contexto");
  });
});
