import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";
import { EstoqueIndisponivelError } from "../src/lib/supabase";

/**
 * Leitura de estoque que falha PARA a página, em vez de fingir que o pátio
 * está vazio.
 *
 * ---------------------------------------------------------------------------
 * O que estava errado
 * ---------------------------------------------------------------------------
 * `getEstoque()` engolia toda falha e devolvia `[]`. Para o Next isso é um
 * render bem-sucedido — só que sem carro —, e ele **guarda no ISR por até uma
 * hora**. Uma leitura que falhasse na hora errada virava sessenta minutos de
 * vitrine vazia servida a todo mundo, clique pago inclusive.
 *
 * Não é hipótese: aconteceu duas vezes em 02 e 03/09, nos logs de produção. A
 * ocorrência de 17:02 saiu com `200` e `cache=BYPASS` — render fresco, vitrine
 * vazia, ninguém avisado.
 *
 * E o ramo mais provável era MUDO: dos quatro caminhos para a contingência,
 * três registravam um aviso próprio e o quarto — consulta que volta sem erro e
 * sem linha — não registrava nada. O log dizia "vitrine vazia" sem dizer por
 * quê, que foi o que me fez perder tempo procurando RLS.
 *
 * ---------------------------------------------------------------------------
 * A distinção que este arquivo protege
 * ---------------------------------------------------------------------------
 * **Falha** (não sei o que tem no pátio) estoura e avisa.
 * **Ausência legítima** (este id não existe) segue em silêncio, virando 404.
 *
 * Confundir as duas nas duas direções custa caro: estourar num 404 transforma
 * link velho em erro de servidor; devolver vazio numa falha transforma pane em
 * anúncio de loja sem carro.
 */

const supa = lerCodigo("src/lib/supabase.ts");

describe("falha de leitura para a página", () => {
  it("os QUATRO caminhos da lista estouram — nenhum devolve vazio calado", () => {
    /* Cobrir três e esquecer um deixa exatamente o buraco de antes. A contagem
       é a trava: cada ramo novo que alguém acrescentar tem de escolher
       explicitamente entre falhar e seguir. */
    const chamadas = supa.split("await estoqueIndisponivel(").length - 1;
    expect(chamadas, "um dos caminhos de falha voltou a engolir").toBe(4);

    // E os motivos são distintos: log que não diz qual dos quatro foi manda
    // quem investiga procurar nos outros três.
    for (const motivo of [
      "o banco recusou a consulta",
      "conexão caiu",
      "cliente do Supabase não configurado",
      "a consulta voltou",
    ]) {
      expect(supa, `motivo ausente: ${motivo}`).toContain(motivo);
    }
  });

  it("o ramo que era mudo agora diz O QUE viu", () => {
    // "nula" e "zero linhas" são falhas diferentes: transporte contra tabela.
    // Sem essa distinção o log manda investigar RLS quando o problema é rede.
    expect(supa).toContain("a consulta voltou nula, sem erro");
    expect(supa).toContain("linhas, sem erro");
  });

  it("veículo NÃO ENCONTRADO continua sem estourar — 404 não é falha", () => {
    /* A regra que impede a correção de virar um problema pior. `getVeiculoById`
       usa a contingência ANTIGA de propósito: id que não existe é 404, e
       transformá-lo em 500 quebraria todo link velho que ainda circula. */
    const i = supa.indexOf("if (!car) {");
    expect(i, "o caminho de veículo não encontrado sumiu").toBeGreaterThan(-1);
    const bloco = supa.slice(i, i + 300);
    expect(bloco).toContain("estoqueDeContingencia()");
    expect(bloco, "o 404 passou a estourar").not.toContain("estoqueIndisponivel");
  });

  it("a falha AVISA, não só registra", () => {
    // Log que ninguém lê foi como a CAPI ficou um mês parada. Aqui o mesmo
    // erro seria pior: some a vitrine inteira.
    const i = supa.indexOf("async function estoqueIndisponivel");
    const corpo = supa.slice(i, i + 700);
    expect(corpo).toContain('alertarFalha("estoque-indisponivel"');
    expect(corpo).toContain("console.error");
    expect(corpo).toContain("throw new EstoqueIndisponivelError");
  });

  it("em desenvolvimento serve os mocks, e SÓ em desenvolvimento", () => {
    // Sem banco local o dev precisa de catálogo. Em produção, carro fictício
    // com CTA de WhatsApp funcional é negociação de veículo inexistente.
    const i = supa.indexOf("async function estoqueIndisponivel");
    const corpo = supa.slice(i, i + 400);
    expect(corpo).toContain('process.env.NODE_ENV !== "production"');
    expect(corpo).toContain("return MOCK_ESTOQUE");
  });

  it("a falha tratada não vira duas mensagens", () => {
    // O `catch` externo envolve o ramo que já estourou. Sem relançar, a mesma
    // falha viraria um segundo aviso, com motivo errado ("conexão caiu").
    expect(supa).toContain("if (err instanceof EstoqueIndisponivelError) throw err");
  });

  it("o erro tem tipo próprio — quem trata precisa distinguir", () => {
    const erro = new EstoqueIndisponivelError("sonda");
    expect(erro).toBeInstanceOf(Error);
    expect(erro.name).toBe("EstoqueIndisponivelError");
    expect(erro.message).toContain("sonda");
  });
});
