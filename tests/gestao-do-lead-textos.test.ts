import { describe, it, expect } from "vitest";
import { lerCodigo } from "./fonte";

/**
 * Os textos que a revisão de 03/10/2026 pediu para acertar nas telas de lead:
 * frase à vista sem travessão, e o título da aba no nome da loja.
 */

/** Os literais de texto do arquivo (aspas duplas), sem os comentários. */
const literais = (caminho: string) => lerCodigo(caminho).match(/"[^"\n]*"/g) ?? [];

describe("os textos à vista, sem travessão", () => {
  it("a caixa de motivos: o exemplo do perdido e a nota do descarte", () => {
    const textos = literais("src/components/admin/ModalDeDesfecho.tsx");
    expect(textos).toContain('"Ex.: queria prata, só tinha branco; pediu para avisar quando chegar"');
    expect(textos).toContain(
      '"Opcional. O descarte fica fora da taxa de conversão: este lead não entra na conta de ganhos nem de perdas."',
    );
    expect(textos.filter((t) => t.includes("—"))).toEqual([]);
  });

  it("o bloco da avaliação: FIPE não consultada, sem valor e sem sugestão", () => {
    const textos = literais("src/components/admin/BlocoDaAvaliacao.tsx");
    for (const frase of [
      '"não consultada: o cliente digitou o carro"',
      '"sem valor: a FIPE não respondeu no envio"',
      '"sem sugestão: não havia régua legível no envio"',
    ]) {
      expect(textos, frase).toContain(frase);
    }
    expect(textos.filter((t) => /(não consultada|sem valor|sem sugestão) —/.test(t))).toEqual([]);
  });

  it("o título das duas telas de lead leva o nome da loja, sem travessão", () => {
    expect(lerCodigo("src/app/admin/leads/page.tsx")).toContain('title: "Leads | Motors Store",');
    expect(lerCodigo("src/app/admin/leads/[id]/page.tsx")).toContain('title: "Lead | Motors Store",');
  });
});
