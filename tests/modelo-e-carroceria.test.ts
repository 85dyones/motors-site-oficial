import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import { CAMPOS_NOSSOS } from "../src/lib/estoqueEscrita";
import { ACAO_DO_CAMPO_DE_VEICULO } from "../src/lib/permissoes";
import { CARROCERIAS } from "../src/lib/classificacaoVeiculo";
import {
  CARROCERIAS_COM_PLURAL,
  generoDeCarroceria,
  pluralDeCarroceria,
} from "../src/lib/generoDoVeiculo";

/**
 * O nome do veículo e a carroceria — o que o feed erra e o painel corrige.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * O plano de mídia de 2026-08-26 relatou uma URL quebrada e uma carroceria
 * errada. Conferido contra o sitemap e o feed servidos naquele dia, eram
 * quatro e nove:
 *
 *   /carros/ford/ka-sedan-10-se-flex-4p
 *   /carros/honda/hr-v-ex-18-flexone-16v-5p-aut
 *   /carros/mercedes-benz/c-180-cgi-classic-18-16v-156cv-aut-2012-gasolina
 *   /carros/volkswagen/novo-voyage-10
 *
 * A causa é a mesma nos quatro: a coluna `modelo` recebeu a VERSÃO inteira.
 * Como `getVeiculoPdpUrl` monta `/{marca}/{modelo}/{versao}/{slug}`, o mesmo
 * pedaço aparece três vezes — e, pior, o modelo ganha um hub próprio que
 * disputa com o hub limpo do mesmo carro.
 *
 * A correção mora em duas colunas paralelas, e é isso que este arquivo
 * protege: **`modelo` e `versao` são colunas do feed**. Corrigi-las direto
 * seria desfeito no próximo ciclo do n8n, sem erro e sem log. O que faz a
 * correção durar é `modelo_override`/`versao_override` estarem em
 * `CAMPOS_NOSSOS` — a lista que o sincronizador não conhece.
 *
 * Some essa linha num refactor e nada quebra hoje: quebra no dia do próximo
 * sync, longe daqui.
 */

describe("1 · os overrides sobrevivem ao sync", () => {
  it("estão em CAMPOS_NOSSOS — é o que o sincronizador não toca", () => {
    expect(CAMPOS_NOSSOS).toContain("modelo_override");
    expect(CAMPOS_NOSSOS).toContain("versao_override");
  });

  it("as colunas do feed continuam FORA da lista", () => {
    // Se `modelo` ou `versao` entrarem aqui, o painel passa a escrever numa
    // coluna que o sync reescreve — que é exatamente o que os overrides
    // existem para evitar. O sintoma seria "salvei e voltou sozinho".
    expect(CAMPOS_NOSSOS).not.toContain("modelo");
    expect(CAMPOS_NOSSOS).not.toContain("versao");
  });

  it("têm dono na matriz de permissão", () => {
    // Campo sem linha na matriz é NEGADO a todo perfil — o editor não o
    // desenha e o PATCH devolve 403. Falha silenciosa do ponto de vista de
    // quem escreveu o campo e nunca viu ele aparecer.
    for (const campo of ["modelo_override", "versao_override"]) {
      expect(ACAO_DO_CAMPO_DE_VEICULO[campo], campo).toBeTruthy();
    }
  });

  it("a migração avisa para não pôr os dois no payload do n8n", () => {
    const sql = ler("supabase/migrations/20260826150000_modelo_e_versao_override.sql");
    expect(sql).toMatch(/N[AÃ]O acrescentar/i);
    // Sem DEFAULT: `NULL` tem de significar "o feed manda", senão a migração
    // carimbaria os 34 veículos certos com um override igual ao feed.
    expect(sql).not.toMatch(/modelo_override text[^;]*DEFAULT/i);
  });
});

describe("2 · a leitura resolve o override, num lugar só", () => {
  const supabase = lerCodigo("src/lib/supabase.ts");

  it("`modelo` e `versao` saem do override quando ele existe", () => {
    expect(supabase).toContain("comOverride(");
    expect(supabase).toContain("dbItem.modelo_override");
    expect(supabase).toContain("dbItem.versao_override");
  });

  it("o gerador de URL NÃO conhece o override", () => {
    // O ponto de resolver na leitura é que ninguém acima precise saber. Se
    // `veiculoUrl.ts` passar a ler a coluna, passam a existir duas regras
    // sobre qual nome vale — e elas divergem no primeiro caso de borda.
    const url = lerCodigo("src/lib/veiculoUrl.ts");
    expect(url).not.toContain("override");
  });
});

describe("2b · a URL que o override conserta", () => {
  it("modelo = versao triplica o segmento; o override desfaz", async () => {
    // A forma real do defeito, lida da produção: o feed manda `versao` igual
    // a `modelo`, as duas com a versão inteira. A limpeza de versão esvazia e
    // cai de volta no texto original — daí o segmento três vezes.
    //
    // As duas URLs "do feed" abaixo são idênticas, caractere por caractere,
    // às que o sitemap servia em 2026-08-26.
    const { getVeiculoPdpUrl } = await import("../src/lib/supabase");

    const sujo = "Ka Sedan 1.0 Se Flex 4p";
    expect(
      getVeiculoPdpUrl({ id: "8059102", marca: "Ford", modelo: sujo, versao: sujo, tipo: "Sedan" }),
    ).toBe(
      "/carros/ford/ka-sedan-10-se-flex-4p/ka-sedan-10-se-flex-4p" +
        "/ford-ka-sedan-10-se-flex-4p-ka-sedan-10-se-flex-4p-8059102",
    );

    expect(
      getVeiculoPdpUrl({
        id: "8059102",
        marca: "Ford",
        modelo: "Ka",
        versao: "Sedan 1.0 SE Flex 4p",
        tipo: "Sedan",
      }),
    ).toBe("/carros/ford/ka/sedan-10-se-flex-4p/ford-ka-sedan-10-se-flex-4p-8059102");
  });
});

describe("3 · o sitemap não lista quem se canonicaliza embora", () => {
  it("hub com canonicalDe fica de fora", () => {
    const hubs = lerCodigo("src/lib/hubsDeEstoque.ts");
    expect(hubs).toMatch(/if\s*\(\s*modelo\.canonicalDe\s*\)\s*continue;/);
  });
});

describe("4 · o vocabulário de carroceria está completo", () => {
  it("Perua, Van e Utilitário existem", () => {
    // Sem eles, Kombi e Parati caem em Hatch e o Bongo também — foi o estado
    // medido em produção, com 20 dos 36 veículos em Hatch.
    for (const nova of ["Perua", "Van", "Utilitário"]) {
      expect(CARROCERIAS, nova).toContain(nova);
    }
  });

  it("toda carroceria tem plural escrito e gênero decidido", () => {
    // A asserção do plural já existia em `genero-e-concordancia`; aqui ela
    // vale para o par completo, porque acrescentar valor sem plural produz
    // "Vans" por sorte e "Utilitárioes" por descuido.
    for (const nome of CARROCERIAS) {
      expect(CARROCERIAS_COM_PLURAL, `plural de ${nome}`).toContain(nome);
      expect(["m", "f"]).toContain(generoDeCarroceria(nome));
    }
  });

  it("os plurais novos são os escritos, não `+ s`", () => {
    expect(pluralDeCarroceria("Perua")).toBe("Peruas");
    expect(pluralDeCarroceria("Van")).toBe("Vans");
    expect(pluralDeCarroceria("Utilitário")).toBe("Utilitários");
  });

  it("Perua, Van e Motocicleta são femininas", () => {
    // Motocicleta faltava e a função devolvia masculino — "o motocicleta".
    // Estava mascarado pela regra do segmento `motos`, que vem antes; e
    // mascarado não é corrigido.
    expect(generoDeCarroceria("Perua")).toBe("f");
    expect(generoDeCarroceria("Van")).toBe("f");
    expect(generoDeCarroceria("Motocicleta")).toBe("f");
    expect(generoDeCarroceria("Utilitário")).toBe("m");
  });

  it("Wagon continua na lista", () => {
    // Sem uso ativo hoje, e fica: dois veículos podem tê-lo gravado à mão, e
    // remover o valor do dropdown tira do dono a chance de reescolher.
    expect(CARROCERIAS).toContain("Wagon");
  });
});

describe("5 · a carroceria é lista fechada nas duas telas", () => {
  it("o editor da ficha usa CARROCERIAS, não texto livre", () => {
    // Era `<input>`, e texto livre já provou o que vira: uma carroceria
    // digitada "Perúa" não casa com nenhum hub e some da navegação.
    const editor = lerCodigo("src/components/admin/EditorDeVeiculo.tsx");
    expect(editor).toContain("CARROCERIAS.map");
    expect(editor).toMatch(/<select[\s\S]{0,200}id="f-tipo"/);
  });

  it("a tabela em lote continua usando a mesma lista", () => {
    expect(lerCodigo("src/components/admin/TabelaDeEstoque.tsx")).toContain("CARROCERIAS.map");
  });
});
