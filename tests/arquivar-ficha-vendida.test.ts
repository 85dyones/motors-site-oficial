import { describe, it, expect } from "vitest";
import type { Veiculo } from "../src/types";
import { decidirPublicacao, CARENCIA_VENDIDO_DIAS } from "../src/lib/publicacao";
import { destinoDoVeiculoArquivado } from "../src/lib/hubsDeEstoque";
import { lerCodigo } from "./fonte";

/**
 * O fim do ciclo de uma URL de veículo.
 *
 * Até 2026-08-25 a ficha vendida ficava para sempre no ar com `noindex`, e todo
 * o sinal que ela acumulou — link de portal, compartilhamento de WhatsApp, link
 * interno — era descartado. Com giro de ~45 dias sobre 39 vagas, são da ordem
 * de 300 URLs por ano indo para o lixo. Não havia o que fazer diferente: o hub
 * do modelo não existia.
 */

const AGORA = new Date("2026-08-25T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;
const haDias = (n: number) => new Date(AGORA.getTime() - n * DIA).toISOString();

function veiculo(parcial: Partial<Veiculo> & Pick<Veiculo, "id" | "marca" | "modelo">): Veiculo {
  return {
    versao: "",
    ano: 2022,
    quilometragem: 0,
    cambio: "",
    combustivel: "",
    cor: "",
    fipe: "",
    preco_original: 100000,
    preco_promocional: 0,
    pericia: "",
    whatsapp_images: [],
    web_full_images: [],
    opcionais: "",
    laudo_pericia: "",
    ...parcial,
  } as Veiculo;
}

const RENEGADE = veiculo({ id: "1", marca: "Jeep", modelo: "Renegade", versao: "S T270", vendido: true });

describe("quando a URL é arquivada", () => {
  it("só depois da carência, e só para venda consumada", () => {
    const recente = decidirPublicacao({ vendido: true, foraDoFeed: false, dataVenda: haDias(10) }, AGORA);
    const antigo = decidirPublicacao(
      { vendido: true, foraDoFeed: false, dataVenda: haDias(CARENCIA_VENDIDO_DIAS + 1) },
      AGORA,
    );

    // Nos primeiros 90 dias a página ainda converte: selo VENDIDO, similares e
    // quem procura aquele perfil de carro chegando por busca.
    expect(recente.arquivar).toBe(false);
    expect(antigo.arquivar).toBe(true);
    expect(antigo.noindex).toBe(true);
  });

  it("fora do feed NUNCA arquiva", () => {
    // O motivo da saída é desconhecido — repasse, reserva, anúncio expirado — e
    // o carro pode voltar. Redirecionar apagaria uma página que talvez volte a
    // valer. Sai do índice na hora, mas continua de pé.
    const fora = decidirPublicacao({ vendido: false, foraDoFeed: true }, AGORA);

    expect(fora.noindex).toBe(true);
    expect(fora.arquivar).toBe(false);
  });

  it("sem data utilizável, não arquiva", () => {
    // Mesma escolha do `noindex`: erra para o lado de MANTER.
    const semData = decidirPublicacao({ vendido: true, foraDoFeed: false }, AGORA);
    expect(semData.arquivar).toBe(false);
  });
});

describe("para onde a URL arquivada vai", () => {
  it("hub do modelo, quando ele existe", () => {
    expect(destinoDoVeiculoArquivado(RENEGADE, [RENEGADE], [])).toBe("/carros/jeep/renegade");
  });

  it("desce para a marca quando o modelo saiu do histórico", () => {
    const compass = veiculo({ id: "2", marca: "Jeep", modelo: "Compass" });
    expect(destinoDoVeiculoArquivado(RENEGADE, [compass], [compass])).toBe("/carros/jeep");
  });

  it("desce para /estoque quando a marca também saiu", () => {
    const onix = veiculo({ id: "3", marca: "Chevrolet", modelo: "Onix" });
    expect(destinoDoVeiculoArquivado(RENEGADE, [onix], [onix])).toBe("/estoque");
  });

  it("NUNCA manda para a home", () => {
    // 301 de ficha para a raiz é o padrão que o Google trata como soft-404: ele
    // descarta o sinal em vez de transferir, que é o oposto do motivo de o
    // redirecionamento existir.
    for (const historico of [[RENEGADE], [], [veiculo({ id: "9", marca: "Fiat", modelo: "Uno" })]]) {
      expect(destinoDoVeiculoArquivado(RENEGADE, historico, [])).not.toBe("/");
    }
  });

  it("moto vai para o hub de moto, não para o de carro", () => {
    const harley = veiculo({ id: "4", marca: "Harley-Davidson", modelo: "Iron 883", tipo: "Motocicleta", vendido: true });
    expect(destinoDoVeiculoArquivado(harley, [harley], [])).toBe("/motos/harley-davidson/iron-883");
  });
});

describe("a ficha aplica a decisão", () => {
  it("redireciona com 301 e não com 302", () => {
    const fonte = lerCodigo(
      "src/app/[categoria]/[marca]/[modelo]/[versao]/[slug_completo_com_id]/page.tsx",
    );

    expect(fonte).toMatch(/if \(publicacao\.arquivar\)/);
    expect(fonte).toMatch(/permanentRedirect\(destinoDoVeiculoArquivado\(/);
    // `redirect` comum é 307: o Google não transfere sinal por redirecionamento
    // temporário, que é justamente o que este bloco existe para fazer.
    expect(fonte).not.toMatch(/[^t]redirect\(destinoDoVeiculoArquivado/);
  });
});
