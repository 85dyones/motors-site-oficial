import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O card do lead fechado mostra só o nome, o tempo de espera e o responsável;
 * o resto aparece ao abrir (pedido do dono em 03/10/2026).
 */
const fonte = readFileSync(join(__dirname, "..", "src", "components", "admin", "LeadsKanban.tsx"), "utf8");
const inicio = fonte.indexOf("aria-controls={`lead-${l.id}`}");
const detalhe = fonte.indexOf("<div id={`lead-${l.id}`} hidden={!expandido}");

describe("o card do lead", () => {
  it("o nome é o botão que abre, e diz se está aberto", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(fonte).toMatch(/aria-expanded=\{expandido\}\s*aria-controls=\{`lead-\$\{l\.id\}`\}/);
  });

  it("o resumo traz responsável e espera, antes do detalhe", () => {
    const resumo = fonte.slice(inicio, detalhe);
    expect(detalhe).toBeGreaterThan(inicio);
    expect(resumo).toContain('{l.responsavel || "Sem responsável"}');
    expect(resumo).toContain("{espera(l.created_at, agora)}");
    // O aviso de lead parado é o que mais pede ação: fica à vista, fechado.
    expect(resumo).toContain("{aviso} há {formatarPrazo(minutosParado(l, agora))}");
  });

  it("etiquetas, conversa, troca de responsável, anotação e etapas ficam no detalhe", () => {
    const resto = fonte.slice(detalhe);
    for (const peca of ["<EtiquetasDoLead", "<BlocoDaAvaliacao", "<BlocoDoPerfil", "falarNoWhatsApp(l)", "aria-label={`Responsável por ${l.nome}`}", "+ anotação", "Avançar →"]) {
      expect(resto, peca).toContain(peca);
      expect(fonte.slice(inicio, detalhe), peca).not.toContain(peca);
    }
  });

  it("fechado, o detalhe continua no HTML, e quem está anotando não perde o campo", () => {
    expect(fonte).toContain("hidden={!expandido}");
    expect(fonte).toContain("const expandido = abertos.has(l.id) || anotando === l.id;");
  });
});
