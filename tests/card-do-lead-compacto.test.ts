import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * O card enxuto do quadro (desenho de 23/09/2026, tela em 03/10): o card
 * mostra o que se decide olhando o quadro, e o resto mora no detalhe. O
 * comportamento está em `card-do-lead-compacto-fiacao.test.ts`; aqui, o que só
 * a fonte mostra: em qual arquivo cada peça ficou.
 */
const card = lerCodigo("src/components/admin/CardDoLead.tsx");
const quadro = lerCodigo("src/components/admin/LeadsKanban.tsx");
const cabecalho = lerCodigo("src/components/admin/lead/CabecalhoDoLead.tsx");
const dados = lerCodigo("src/components/admin/lead/DadosDoNegocio.tsx");

describe("o card do lead", () => {
  it("o nome é o botão que abre o detalhe, e diz se está aberto", () => {
    expect(card).toMatch(/data-abre-lead=\{l\.id\}\s*aria-expanded=\{aberto\}/);
    expect(card).toContain("onClick={() => aoAbrir(l.id)}");
  });

  it("traz interesse, aviso de parado, etiquetas, última interação, próximo passo, responsável e espera", () => {
    for (const peca of [
      "{l.interesse}",
      // O aviso de lead parado é o que mais pede ação: fica à vista.
      "{aviso} há {formatarPrazo(minutosParado(l, agora))}",
      "aria-label={`Etiquetas de ${l.nome}, resumo`}",
      "{rotuloDaUltimaInteracao(ultima, agora)}",
      'rotuloDoPasso(l.proximo_passo_vence_em, agora, "card")',
      '{l.responsavel || "Sem responsável"}',
      "{espera(l.created_at, agora)}",
      "seloCurtoDeTransferencias(l.transferencias)",
    ]) {
      expect(card, peca).toContain(peca);
    }
  });

  it("a moldura é a da estagnação, e o card aberto ganha o contorno de tinta", () => {
    expect(card).toContain("${MOLDURA[nivel]}");
    expect(card).toContain('aberto ? "outline-2 -outline-offset-2 outline-mt-ink" : ""');
  });

  it("responsável, anotação, desfecho, etiquetas editáveis e os blocos do site saíram do card", () => {
    for (const peca of ["<select", "<textarea", "<EtiquetasDoLead", "<BlocoDaAvaliacao", "<BlocoDoPerfil", "+ anotação", "destinosDoNegocio", "abertos"]) {
      expect(card, peca).not.toContain(peca);
      expect(quadro, peca).not.toContain(peca);
    }
  });

  it("e estão no detalhe: nada do que existia sumiu", () => {
    expect(cabecalho).toContain("aria-label={`Responsável por ${lead.nome}`}");
    expect(cabecalho).toContain("destinosDoNegocio(etapas)");
    for (const peca of ["<EtiquetasDoLead", "<BlocoDaAvaliacao", "<BlocoDoPerfil perfil={lead.perfil} />"]) {
      expect(dados, peca).toContain(peca);
    }
  });

  it("no toque, o link da conversa e as setas têm 44px", () => {
    // O tablet de balcão é uso real desta tela (ver o cabeçalho do LeadsKanban).
    const alvos = card.match(/pointer-coarse:min-h-11/g) ?? [];
    expect(alvos.length).toBe(3);
    expect(card.match(/pointer-coarse:min-w-11/g) ?? []).toHaveLength(2);
  });
});
