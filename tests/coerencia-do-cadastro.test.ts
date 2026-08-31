import { describe, it, expect } from "vitest";
import { ler, lerCodigo } from "./fonte";
import {
  MINIMO_DE_FOTOS,
  REGRAS_DE_COERENCIA,
  bloqueiosDePublicacao,
  divergenciaDeCarroceria,
  publicavel,
} from "../src/lib/coerenciaDoCadastro";
import { CARROCERIAS } from "../src/lib/classificacaoVeiculo";

/**
 * Coerência de cadastro, bloqueio de publicação e a auditoria em lote.
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo trava
 * ---------------------------------------------------------------------------
 * O handoff de 2026-08-27 auditou as fichas públicas antes do SDR entrar no ar
 * e achou dez carrocerias erradas — nove delas em `Hatch`. Nenhuma tela
 * acusava, porque o checklist de publicação valida PRESENÇA e não correção: o
 * campo estava preenchido, só que com o valor errado.
 *
 * Detector de contradição tem dois modos de falhar, e o segundo é o que mata:
 * calar quando deveria falar (e aí não serve para nada) ou falar quando
 * deveria calar (e aí é desligado na primeira semana). As asserções abaixo
 * cobrem os dois lados com casos REAIS do pátio — inclusive os dois que já me
 * enganaram uma vez cada: o Ford Ka "SE Plus 1.0 HA" e o Honda HR-V.
 */

/** Um veículo do pátio, reduzido ao que o detector lê. */
const veiculo = (marca: string, modelo: string, versao: string, tipo: string) => ({
  marca,
  modelo,
  versao,
  tipo,
});

describe("1 · os dez casos do handoff", () => {
  /**
   * A tabela do §1.1, com o id de cada um. Nove entram como divergência; o
   * décimo — a Saveiro Robust — está logo abaixo, separado, porque virou
   * decisão do dono e não erro.
   */
  const casos = [
    { id: 8171616, v: veiculo("Fiat", "Titano", "Volcano 2.2 16V 4x4 TB Die Aut", "SUV"), esperada: "Picape" },
    // `Caminhão` desde 29/08: a lista fechada ganhou o valor, e o Bongo é o
    // caso que o pedia. `Utilitário` segue aceito — o detector não reclama de
    // nenhuma das duas leituras, só de `Hatch`, que era o que o feed mandava.
    { id: 8137195, v: veiculo("Kia", "Bongo", "K-2500 2.5 4x2", "Hatch"), esperada: "Caminhão" },
    { id: 8303260, v: veiculo("Fiat", "Strada", "Ranch T200AT", "Hatch"), esperada: "Picape" },
    { id: 8256747, v: veiculo("BMW", "320i", "2.0 Sport GP Active Flex Aut", "Hatch"), esperada: "Sedan" },
    { id: 8307965, v: veiculo("Chevrolet", "Onix Plus", "Turbo LT Automático", "Hatch"), esperada: "Sedan" },
    { id: 8333811, v: veiculo("Volkswagen", "Kombi", "Standard 1.4 MI", "Hatch"), esperada: "Van" },
    { id: 8392516, v: veiculo("Volkswagen", "Kombi", "Standard 1.4 MI 4p", "Hatch"), esperada: "Van" },
    { id: 8393824, v: veiculo("Volkswagen", "Voyage", "1.6 Trend", "Hatch"), esperada: "Sedan" },
    { id: 8152210, v: veiculo("Volkswagen", "Parati", "CL 1.6 MI 4p", "Hatch"), esperada: "Perua" },
  ];

  it.each(casos)("$id — acusa e sugere $esperada", ({ v, esperada }) => {
    const d = divergenciaDeCarroceria(v);
    expect(d, `${v.marca} ${v.modelo}`).not.toBeNull();
    expect(d!.esperada).toBe(esperada);
    expect(d!.atual).toBe(v.tipo);
  });

  it("a frase do alerta é escrita, e diz por que", () => {
    // O alerta é lido por quem vai discordar dele. "Esperado: Van" não é
    // argumento; "é van de passageiros ou furgão, não hatch" é.
    const d = divergenciaDeCarroceria(veiculo("Volkswagen", "Kombi", "Standard 1.4 MI", "Hatch"));
    expect(d!.porque).toMatch(/van de passageiros|furgão/i);
    expect(d!.porque.length).toBeGreaterThan(15);
    for (const regra of REGRAS_DE_COERENCIA) {
      expect(regra.porque, regra.termos[0]).not.toMatch(/undefined|\$\{/);
    }
  });
});

describe("2 · o silêncio, que é a metade difícil", () => {
  it("o Ford Ka SE Plus 1.0 HA continua hatch, e ninguém reclama", () => {
    // Foi o primeiro falso positivo que descartei à mão: "Plus" só marca sedã
    // na Chevrolet, e "HA" é a sigla de HAtch na nomenclatura da Ford. Se esta
    // asserção cair, o detector está acusando o cadastro CERTO — e detector que
    // erra o caso fácil não sobrevive à primeira semana de uso.
    expect(divergenciaDeCarroceria(veiculo("Ford", "Ka", "SE Plus 1.0 HA C", "Hatch"))).toBeNull();
  });

  it("o Honda HR-V continua SUV — 'hr' não pode casar dentro do nome", () => {
    // O hífen conta como fronteira de palavra, então o termo "hr" da regra de
    // utilitários casava dentro de **HR-V** e mandava um SUV virar caminhão
    // leve. Só apareceu porque li a saída do relatório, não a asserção.
    expect(divergenciaDeCarroceria(veiculo("Honda", "HR-V", "EX 1.8 Flexone 16v", "SUV"))).toBeNull();
  });

  it("as duas Saveiros ficam em paz, em Picape ou em Utilitário", () => {
    // O handoff pedia padronizar as duas como `Picape`. O dono decidiu o
    // contrário em 27/08, e a razão é do lado de fora do banco: a Robust é
    // cabine simples comprada para trabalho, e `Utilitário` descreve melhor o
    // uso. As duas leituras são defensáveis — reclamar da escolha de quem viu
    // o carro é ruído, não achado.
    expect(divergenciaDeCarroceria(veiculo("Volkswagen", "Saveiro", "1.6 MSI Robust CS 8V", "Utilitário"))).toBeNull();
    expect(divergenciaDeCarroceria(veiculo("Volkswagen", "Saveiro", "1.6 MSI Trendline CD", "Picape"))).toBeNull();
    // O erro de verdade — o valor que veio do feed — segue pego.
    expect(divergenciaDeCarroceria(veiculo("Volkswagen", "Saveiro", "1.6 MSI Robust CS 8V", "Hatch"))).not.toBeNull();
  });

  it("cala sobre o que não conhece", () => {
    // Um modelo fora da tabela não é um modelo errado. Silêncio é a resposta
    // certa para o que ela não sabe — o contrário transformaria cada carro novo
    // do pátio num alerta.
    expect(divergenciaDeCarroceria(veiculo("Chevrolet", "Celta", "1.0 Life", "Hatch"))).toBeNull();
    // E o Bongo em `Utilitário` continua em paz: as duas leituras valem.
    expect(divergenciaDeCarroceria(veiculo("Kia", "Bongo", "K-2500 2.5 4x2", "Utilitário"))).toBeNull();
    expect(divergenciaDeCarroceria(veiculo("Honda", "Civic", "2.0 EXL", "Sedan"))).toBeNull();
    expect(divergenciaDeCarroceria({})).toBeNull();
  });

  it("toda carroceria sugerida existe no dropdown do painel", () => {
    // Sugerir `Furgão` num campo que só aceita doze valores fechados produz um
    // alerta que o painel não tem como resolver. A lista de opções é
    // `CARROCERIAS`; o detector não pode inventar fora dela.
    for (const regra of REGRAS_DE_COERENCIA) {
      for (const c of regra.carrocerias) {
        expect(CARROCERIAS as readonly string[], regra.termos[0]).toContain(c);
      }
    }
  });
});

describe("3 · o detector nunca escreve", () => {
  it("não toca no objeto que recebe", () => {
    const v = Object.freeze(veiculo("Volkswagen", "Kombi", "Standard 1.4 MI", "Hatch"));
    expect(() => divergenciaDeCarroceria(v)).not.toThrow();
    expect(v.tipo).toBe("Hatch");
  });

  it("o módulo não importa nada além de tipos", () => {
    // O alerta é desenhado no editor de veículo, que é componente de cliente.
    // Um import de `./supabase` aqui arrasta o cliente do banco para o bundle
    // do navegador — a chave de serviço junto.
    const codigo = lerCodigo("src/lib/coerenciaDoCadastro.ts");
    expect(codigo).not.toMatch(/^\s*import\s+(?!type\b)/m);
  });

  it("preencher sozinho continua fora — inclusive para campo vazio", () => {
    // O handoff sugeria preencher automaticamente "só quando o campo estiver
    // vazio". Medido nos 39 veículos servidos: nenhum tem carroceria vazia — o
    // feed sempre manda algo, e é justamente por isso que o erro é invisível.
    // A regra nunca dispararia; o que ela apagaria é a distinção entre "alguém
    // conferiu" e "a tabela deduziu".
    const semTipo = divergenciaDeCarroceria(veiculo("Volkswagen", "Kombi", "Standard 1.4 MI", ""));
    expect(semTipo).not.toBeNull();
    expect(semTipo!.atual).toBe("— sem carroceria —");
    expect(semTipo!.esperada).toBe("Van");
  });
});

describe("4 · bloqueio de publicação", () => {
  const completo = {
    whatsapp_images: Array.from({ length: MINIMO_DE_FOTOS }, (_, i) => `foto-${i}.jpg`),
  };

  it("aprova quem tem as oito fotos", () => {
    expect(bloqueiosDePublicacao(completo)).toEqual([]);
    expect(publicavel(completo)).toBe(true);
  });

  it("tira do ar com menos de oito fotos, e diz quantas faltam", () => {
    const seisFotos = { whatsapp_images: ["a", "b", "c", "d", "e", "f"] };
    const motivos = bloqueiosDePublicacao(seisFotos);
    expect(motivos.map((m) => m.id)).toEqual(["poucas-fotos"]);
    expect(publicavel(seisFotos)).toBe(false);
    expect(motivos[0].texto).toContain(`6 de ${MINIMO_DE_FOTOS}`);
    // As fotos vêm do RevendaMais, não do painel: sem essa frase, alguém
    // procura o botão de subir foto em `/admin` e não acha.
    expect(motivos[0].texto).toMatch(/RevendaMais/);
  });

  it("`whatsapp_images` sujo não conta como foto", () => {
    // A coluna chega do feed como JSON, e já veio com entrada vazia no meio da
    // lista. A Kombi `8392516` é o caso: uma entrada, nenhuma foto.
    const comBuracos = { whatsapp_images: ["a", null, "", "b", undefined] };
    expect(publicavel(comBuracos)).toBe(false);
  });

  it("laudo vazio NÃO impede publicação", () => {
    // ⚠️ A asserção que registra uma correção de domínio, não de gosto.
    //
    // A versão anterior lia `laudo_pericia` vazio como "carro não periciado" e
    // bloqueava por isso. O dono corrigiu em 29/08: **100% do pátio é
    // periciado**, e o campo guarda APONTAMENTOS pontuais. Vazio quer dizer
    // sem apontamentos — o melhor caso. Bloquear ali era punir o carro
    // impecável, e teria levado a vitrine de 34 para 1.
    //
    // O status da perícia mora em `pericia`, outra coluna.
    const semObservacao = { ...completo, laudo_pericia: "" } as never;
    expect(publicavel(semObservacao)).toBe(true);
    expect(bloqueiosDePublicacao(semObservacao)).toEqual([]);
  });

  it("o motivo `sem-laudo` não existe mais", () => {
    // Contraprova pelo outro lado: se alguém reintroduzir a regra, o carro sem
    // apontamento volta a sair do ar sem ninguém entender por quê.
    const nada = { whatsapp_images: null } as never;
    expect(bloqueiosDePublicacao(nada).map((m) => m.id)).toEqual(["poucas-fotos"]);
    expect(lerCodigo("src/lib/coerenciaDoCadastro.ts")).not.toContain('"sem-laudo"');
  });
});

describe("5 · o gate está ligado no lugar certo", () => {
  const supabase = lerCodigo("src/lib/supabase.ts");

  it("`getEstoque()` sem opção NÃO devolve não publicável", () => {
    // Some esta linha e o site volta a publicar carro sem laudo sem ninguém
    // notar — nenhum teste de página quebra, nenhuma tela muda de cor.
    expect(supabase).toMatch(/opts\.incluirNaoPublicaveis\s*\n?\s*\?\s*noFeed\s*\n?\s*:\s*noFeed\.filter\(\(l: any\) => publicavel\(l\)\)/);
  });

  it("o bloqueio não herda a válvula de escape do carimbo de sync", () => {
    // `apenasDoUltimoSync` tem uma válvula: se zerar a lista, serve o banco
    // inteiro, porque cair no MOCK_ESTOQUE seria pôr cinco carros fictícios em
    // produção. Enquanto os dois filtros dividiam o mesmo `if`, um bloqueio
    // amplo devolvia à vitrine exatamente o que ele tinha acabado de tirar.
    // A válvula é do carimbo, e só dele.
    const valvula = supabase.slice(supabase.indexOf("descartou todas as linhas"));
    expect(valvula).not.toMatch(/list = data\.map\(mapear\)/);
    expect(supabase).toMatch(/noFeed = data;/);
  });

  it("as superfícies públicas chamam sem a opção", () => {
    // O opt-out é para painel, auditoria e histórico de hub. Vitrine, feed,
    // sitemap e ficha nascem protegidos por não pedir nada.
    for (const arquivo of [
      "src/app/estoque/page.tsx",
      "src/app/api/feed/xml/route.ts",
      "src/app/api/llms-full.txt/route.ts",
      "src/app/sitemap.ts",
      "src/app/page.tsx",
    ]) {
      expect(lerCodigo(arquivo), arquivo).not.toContain("incluirNaoPublicaveis");
    }
  });

  it("quem pede o opt-out explica por quê", () => {
    // Três chamadas o usam, e cada uma tem razão diferente. Sem a nota, a
    // próxima pessoa copia a linha para uma página pública achando que é
    // boilerplate.
    for (const arquivo of [
      "src/app/admin/page.tsx",
      "src/app/api/estoque/route.ts",
      "src/lib/hubsDeEstoque.ts",
      "src/components/ConfiguracoesClientWrapper.tsx",
    ]) {
      const fonte = ler(arquivo);
      expect(fonte, arquivo).toContain("incluirNaoPublicaveis");
      // `bloque` cobre bloqueio/bloqueado/bloqueia — a raiz, não uma das
      // flexões. A versão anterior exigia "bloquead" e passou a falhar quando
      // um comentário trocou "bloqueado" por "bloqueio" sem mudar de sentido.
      expect(fonte, arquivo).toMatch(/incluirNaoPublicaveis[\s\S]{0,400}?(bloque|laudo|foto|publica)/i);
    }
  });

  it("a ficha de um bloqueado sai com noindex", () => {
    // O gate tira o carro das listas, mas a URL da ficha continua de pé —
    // resolvida por id, e já indexada. Sem `noindex`, o Google segue servindo a
    // ficha de um carro que o site decidiu não publicar.
    const rota = lerCodigo("src/app/[categoria]/[marca]/[modelo]/[ficha]/page.tsx");
    expect(rota).toContain("bloqueadoParaPublicacao");
    expect(lerCodigo("src/lib/publicacao.ts")).toMatch(/bloqueadoParaPublicacao[\s\S]{0,300}noindex:\s*true/);
  });
});

describe("6 · a auditoria em lote", () => {
  it("`npm run auditoria:estoque` existe e aponta para o script", () => {
    const pkg = JSON.parse(ler("package.json"));
    expect(pkg.scripts["auditoria:estoque"]).toContain("scripts/auditoria-estoque.ts");
  });

  it("sai com código ≠ 0 quando há achado", () => {
    // O valor de um comando de auditoria é caber em CI depois sem mudar nada.
    // Saída bonita com `exit 0` sempre é relatório, não checagem.
    const script = lerCodigo("scripts/auditoria-estoque.ts");
    expect(script).toContain("process.exit(achados === 0 ? 0 : 1)");
    expect(script).toContain("process.exit(2)");
  });

  it("audita o que o site esconde", () => {
    // Auditoria que chama `getEstoque()` sem opção não enxerga justamente os
    // veículos bloqueados — o §4 do relatório sairia sempre vazio, e o carro
    // sem laudo ficaria invisível nas duas pontas.
    expect(ler("scripts/auditoria-estoque.ts")).toContain("incluirNaoPublicaveis: true");
  });

  it("reusa a tabela em vez de repeti-la", () => {
    const script = lerCodigo("scripts/auditoria-estoque.ts");
    expect(script).toContain("divergenciaDeCarroceria");
    expect(script).toContain("bloqueiosDePublicacao");
  });

  it("a seção do laudo saiu do relatório", () => {
    // Ela listava 33 dos 34 publicados como pendência, sobre a premissa de que
    // campo vazio significava carro não periciado. O dono corrigiu: 100% do
    // pátio é periciado, e o campo guarda apontamentos — vazio é o melhor
    // caso. Relatório que acusa 97% do estoque todo dia é relatório que
    // ninguém lê.
    const script = ler("scripts/auditoria-estoque.ts");
    expect(script).not.toContain("LAUDO_BLOQUEIA_PUBLICACAO");
    expect(script).not.toMatch(/sairiam do ar/);
    // A seção 4, que conta de verdade, continua contando.
    const codigo = lerCodigo("scripts/auditoria-estoque.ts");
    const secao4 = codigo.slice(codigo.indexOf("4 · Fora da vitrine"));
    expect(secao4).toMatch(/achados\s*\+=/);
  });
});
