import { describe, it, expect } from "vitest";
import { recortePublicoDeSettings } from "../src/lib/settings";
import { lerCodigo } from "./fonte";

/**
 * A fiação da curadoria da grade da home.
 *
 * Três afirmações que não têm como ser verificadas em tempo de execução sem
 * subir banco: a chave é lida, é gravada, e **não** vaza para o navegador.
 * A última é a que importa mais — ver a memória do `preco_compra` que vazou
 * como prop de client component.
 */

const ROTA = "src/app/api/settings/route.ts";
const LEITURA = "src/lib/settings.ts";

describe("a chave destaquesDaSemana está fiada de ponta a ponta", () => {
  it("a leitura de settings conhece a linha destaques_da_semana", () => {
    const fonte = lerCodigo(LEITURA);

    expect(fonte, "a linha não é procurada em site_settings").toContain(
      '"destaques_da_semana"',
    );
    expect(fonte, "a chave não é devolvida por getCachedSettings").toMatch(
      /destaquesDaSemana,/,
    );
  });

  it("a rota aceita e grava a chave", () => {
    const fonte = lerCodigo(ROTA);

    expect(fonte, "a chave não é aceita no corpo do POST").toMatch(
      /destaquesDaSemana/,
    );
    expect(fonte, "a chave não é gravada na linha certa").toContain(
      'id: "destaques_da_semana"',
    );
  });

  it("a chave NÃO entra no recorte público", () => {
    // O visitante não precisa dela: quem monta a grade é o servidor. Toda
    // chave nova nasce privada — na RLS e aqui — e só sai disso com motivo
    // escrito.
    const publico = recortePublicoDeSettings({
      companySettings: null,
      aboutSettings: null,
      webhooks: null,
      popups: null,
      quickTags: null,
      stockOverrides: null,
      carouselVehicleIds: null,
      bankBalances: null,
      procedencia: null,
      instagramCuradoria: null,
      areasHome: null,
      ga4: null,
      destaquesDaSemana: ["8256747", "8453942"],
    } as unknown as Parameters<typeof recortePublicoDeSettings>[0]);

    expect(Object.keys(publico)).not.toContain("destaquesDaSemana");
    expect(JSON.stringify(publico)).not.toContain("8256747");
  });
});
