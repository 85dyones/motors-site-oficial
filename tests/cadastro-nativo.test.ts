import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANO_MINIMO,
  CAMPOS_DE_DOCUMENTO,
  CAMPOS_DE_NASCIMENTO,
  CAMPOS_OBRIGATORIOS_DO_CADASTRO,
  CAMPOS_QUE_A_ROTA_NUNCA_ESCREVE,
  anoMaximo,
  chassiEhPlausivel,
  decidirCadastro,
  montarLinhaDoCadastro,
  normalizarCadastro,
  placaEhValida,
  validarCadastroDeVeiculo,
} from "../src/lib/cadastroDeVeiculo";
import { CAMPOS_NOSSOS } from "../src/lib/estoqueEscrita";
import { ACAO_DO_CAMPO_DE_VEICULO, PERFIS, podeFazer } from "../src/lib/permissoes";

/**
 * Cadastro nativo de veículo (2026-08-29) — o carro que não veio do feed.
 *
 * A metade de banco já está em produção: `origem`, a sequence própria a partir
 * de 900.000.001 e os dois triggers da migração
 * `20260829130000_f0k_cadastro_nativo_e_trava_do_sync`. O que estes testes
 * travam é a metade de cima, e o ponto mais frágil dela é o que a rota NÃO faz.
 *
 * ---------------------------------------------------------------------------
 * A regressão que este arquivo existe para impedir
 * ---------------------------------------------------------------------------
 * A trava do sync reconhece o RevendaMais por UMA assinatura: escrever em
 * `last_seen_at`. O trigger ignora, em silêncio, qualquer UPDATE que mexa
 * nessa coluna de um veículo `origem = 'painel'`. Isso funciona enquanto
 * nenhuma rota do painel a escrever — no dia em que uma escrever, ela passa a
 * parecer o sync, e a proteção some sem erro nenhum, em nenhum log.
 *
 * O mesmo vale para `id` e `origem`: os dois são INFERIDOS pela faixa do id.
 * Mandar qualquer um dos dois da aplicação devolve a decisão para quem
 * esquece — que foi exatamente o cenário que a migração escreveu para evitar.
 */

const RAIZ = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf-8");

/** Comentário pode citar o campo pelo nome; o código, não. */
const semComentarios = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const rotaEstoque = ler("src", "app", "api", "estoque", "route.ts");
const telaNova = ler("src", "app", "admin", "estoque", "novo", "page.tsx");
const formulario = ler("src", "components", "admin", "CadastroDeVeiculo.tsx");
const tabelaA6 = ler("src", "components", "admin", "TabelaDeEstoque.tsx");
const paginaA6 = ler("src", "app", "admin", "estoque", "page.tsx");
const migracao = ler(
  "supabase",
  "migrations",
  "20260829130000_f0k_cadastro_nativo_e_trava_do_sync.sql",
);

// ---------------------------------------------------------------------------
// 1. O que nunca vai ao banco
// ---------------------------------------------------------------------------

describe("o cadastro não escreve o que o banco infere", () => {
  it("`id`, `origem` e o carimbo do sync não passam por normalizarCadastro", () => {
    const linha = normalizarCadastro({
      id: 7000001,
      origem: "sync",
      last_seen_at: "2026-08-29T10:00:00Z",
      first_seen_at: "2026-08-29T10:00:00Z",
      marca: "Volkswagen",
      modelo: "Nivus",
      ano: 2023,
      preco: 118900,
      quilometragem: 38400,
    });

    for (const proibido of CAMPOS_QUE_A_ROTA_NUNCA_ESCREVE) {
      expect(linha, `${proibido} viajou no INSERT`).not.toHaveProperty(proibido);
    }
    expect(linha.marca).toBe("Volkswagen");
  });

  it("montarLinhaDoCadastro apaga o proibido mesmo quando alguém o injeta", () => {
    // A porta de trás plausível: copiar a linha de um veículo para "duplicar
    // cadastro" traria junto o carimbo do sync.
    const linha = montarLinhaDoCadastro(
      { marca: "Fiat", modelo: "Argo" },
      { last_seen_at: "2026-08-29T10:00:00Z", origem: "sync", id: 42, first_seen_at: "x" },
    );
    expect(Object.keys(linha)).toEqual(["marca", "modelo"]);
  });

  it("decimal do campo `type=number` NÃO infla o valor — o bug de 100x", () => {
    // Achado da revisão de 2026-08-29, e o mais caro que a entrega tinha: o
    // parser fazia `replace(/\./g, "")` para aceitar o teclado pt-BR, mas os
    // campos da tela são `type="number"` e o DOM devolve a forma CANÔNICA. O
    // ponto decimal virava separador de milhar e `118900.50` chegava ao banco
    // como 11.890.050. A validação não pegava: ela roda sobre a linha já
    // normalizada, e onze milhões é um inteiro positivo perfeitamente válido —
    // preço e KM não têm teto (o `ano` tem, e foi por isso que escapou).
    const comCentavos = normalizarCadastro({
      marca: "VW", modelo: "Nivus", ano: 2023,
      preco: "118900.50",
      quilometragem: "38400.7",
    });
    expect(comCentavos.preco, "o preço inflou").toBe(118900.5);
    expect(comCentavos.preco_original).toBe(118900.5);
    // KM é coluna inteira: trunca, nunca multiplica.
    expect(comCentavos.quilometragem, "o KM inflou").toBe(38400);

    // Sem decimal, nada muda.
    const inteiro = normalizarCadastro({
      marca: "VW", modelo: "Nivus", ano: 2023, preco: "118900", quilometragem: "38400",
    });
    expect(inteiro.preco).toBe(118900);
    expect(inteiro.quilometragem).toBe(38400);
  });

  it("quem colar `89.900,00` de uma planilha continua sendo entendido", () => {
    // A vírgula é quem manda: com ela, é pt-BR e o ponto é milhar. Sem ela, o
    // número vem como está. É o que reconcilia `type="number"` com o hábito de
    // colar valor formatado.
    const colado = normalizarCadastro({
      marca: "VW", modelo: "Gol", ano: 2020,
      preco: "89.900,00",
      quilometragem: "12.500",
    });
    expect(colado.preco).toBe(89900);
    // `12.500` sem vírgula é lido como 12,5 e truncado — o campo da tela é
    // numérico e nunca produz essa forma; quem colar assim vê o resultado na
    // hora, no próprio campo. O que importa é que NÃO vire 125.000.
    expect(colado.quilometragem).toBe(12);
  });

  it("corpo hostil não vira linha: a decisão apaga o que o banco infere", () => {
    // O mutante que sobrevivia à suíte antiga: trocar a montagem por um
    // `Object.assign({}, body, ...)`. Aqui isso morre — o corpo inteiro entra
    // e a linha sai limpa.
    const d = decidirCadastro(
      {
        id: 7000001,
        origem: "sync",
        last_seen_at: "2026-08-29T10:00:00Z",
        first_seen_at: "2020-01-01",
        marca: "VW", modelo: "Nivus", ano: 2023, preco: 118900, quilometragem: 38400,
      chassi: "9BWZZZ377VT004251",
      },
      { papeis: ["comercial"] },
    );
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    for (const proibido of CAMPOS_QUE_A_ROTA_NUNCA_ESCREVE) {
      expect(d.linha, `${proibido} chegaria ao INSERT`).not.toHaveProperty(proibido);
    }
    expect(d.linha.marca).toBe("VW");
  });

  it("a decisão barra quem não é da equipe — e nem diz o que existe do outro lado", () => {
    // Os mutantes "desarmar ehStaff" e "desarmar podeFazer" morrem aqui.
    const corpoValido = {
      marca: "VW", modelo: "Nivus", ano: 2023, preco: 118900, quilometragem: 38400,
      chassi: "9BWZZZ377VT004251",
    };

    for (const foraDoPainel of [{ papeis: ["cliente"] }, { papeis: ["investidor"] }, null]) {
      const d = decidirCadastro(corpoValido, foraDoPainel);
      expect(d.ok, `${JSON.stringify(foraDoPainel)} cadastrou veículo`).toBe(false);
      if (d.ok) continue;
      expect(d.status).toBe(403);
      expect(d.erro).toBe("Acesso restrito à equipe");
    }
  });

  it("quem publica cadastra; Marketing, Gestor e Financeiro não", () => {
    const corpoValido = {
      marca: "VW", modelo: "Nivus", ano: 2023, preco: 118900, quilometragem: 38400,
      chassi: "9BWZZZ377VT004251",
    };

    for (const perfil of ["admin", "comercial"] as const) {
      const d = decidirCadastro(corpoValido, { papeis: [perfil] });
      expect(d.ok, `${perfil} deveria cadastrar`).toBe(true);
    }

    // Marketing é `revisao` na linha de publicar: trata o que já existe, não
    // decide que carro a loja tem. Gestor e Financeiro são `nao_ve`.
    for (const perfil of ["marketing", "gestor", "financeiro"] as const) {
      const d = decidirCadastro(corpoValido, { papeis: [perfil] });
      expect(d.ok, `${perfil} cadastrou veículo`).toBe(false);
      if (d.ok) continue;
      expect(d.status).toBe(403);
      expect(d.erro).toBe("Seu perfil não cadastra veículo");
    }
  });

  it("o filtro campo a campo continua valendo dentro do cadastro", () => {
    // O mutante "desarmar campoNegadoAoPerfil" morre aqui: o Comercial passa
    // no gate da rota (publica) e mesmo assim não lança custo de aquisição.
    const d = decidirCadastro(
      {
        marca: "VW", modelo: "Nivus", ano: 2023, preco: 118900, quilometragem: 38400,
      chassi: "9BWZZZ377VT004251",
        preco_compra: 95000,
      },
      { papeis: ["comercial"] },
    );
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.status).toBe(403);
    expect(d.erro).toContain("preco_compra");

    // O mesmo corpo, pelo Admin, passa.
    const doAdmin = decidirCadastro(
      {
        marca: "VW", modelo: "Nivus", ano: 2023, preco: 118900, quilometragem: 38400,
      chassi: "9BWZZZ377VT004251",
        preco_compra: 95000,
      },
      { papeis: ["admin"] },
    );
    expect(doAdmin.ok).toBe(true);
  });

  it("corpo inválido é 400, e falta de dado é 422 com a lista", () => {
    const semCorpo = decidirCadastro(null, { papeis: ["admin"] });
    expect(semCorpo.ok).toBe(false);
    if (!semCorpo.ok) expect(semCorpo.status).toBe(400);

    const incompleto = decidirCadastro({ marca: "VW" }, { papeis: ["admin"] });
    expect(incompleto.ok).toBe(false);
    if (incompleto.ok) return;
    expect(incompleto.status).toBe(422);
    expect(incompleto.problemas?.length).toBeGreaterThan(0);
    // A recusa por papel vem ANTES da de dados: quem não pode cadastrar não
    // descobre quais campos existem tentando um corpo vazio.
    const naoPodeENemTemDados = decidirCadastro({}, { papeis: ["marketing"] });
    expect(naoPodeENemTemDados.ok).toBe(false);
    if (naoPodeENemTemDados.ok) return;
    expect(naoPodeENemTemDados.status).toBe(403);
  });

  it("a lista de proibidos cobre as cinco colunas que os triggers decidem", () => {
    // `estado_cadastro` entrou em 2026-08-30 (migração F0-q): o trigger de
    // INSERT o força a `rascunho`, importado ou cadastrado, e a rota não tenta
    // negociar. Ver `tests/rascunho-e-publicacao.test.ts`, trava 1.
    expect([...CAMPOS_QUE_A_ROTA_NUNCA_ESCREVE].sort()).toEqual([
      "estado_cadastro",
      "first_seen_at",
      "id",
      "last_seen_at",
      "origem",
    ]);
  });

  it("a rota não ESCREVE `last_seen_at` nem `origem`", () => {
    // A trava do banco reconhece o sync pela escrita em `last_seen_at`. Rota do
    // painel que a escrevesse viraria "o sync" aos olhos do trigger.
    const codigo = semComentarios(rotaEstoque);
    expect(codigo).not.toContain("last_seen_at");

    // `origem` PODE ser citada — desde 2026-08-29 a rota a LÊ de volta no
    // `.select` da tela de sucesso (para o texto da pendência de fotos saber
    // se manda subir pelo painel ou esperar o feed). O que não pode é entrar
    // em escrita: quem decide a origem é o trigger, pela faixa do id.
    expect(codigo).not.toMatch(/origem\s*:/);
    expect(codigo).not.toMatch(/update\([\s\S]{0,120}origem/);
  });

  it("o formulário não cita `last_seen_at` nem `origem` — nenhum dos dois é dele", () => {
    const codigo = semComentarios(formulario);
    expect(codigo).not.toContain("last_seen_at");
    // A régua ficou mais simples em 01/09. Antes, `origem: "painel"` era uma
    // menção legítima: ela ia para `bloqueiosDePublicacao` escolher o texto da
    // pendência de fotos. Com a galeria aberta a toda origem, a pendência tem
    // uma frase só e o parâmetro saiu da assinatura — então o formulário não
    // tem mais nenhum motivo para falar de origem.
    //
    // O que este teste sempre protegeu continua de pé: quem decide a origem é
    // o trigger, pela faixa do id. Formulário que a escrevesse mentiria para o
    // banco, e a linha nasceria como "painel" sem ser.
    expect(codigo).not.toMatch(/origem/);
  });

  it("o contrato do banco continua o que este teste pressupõe", () => {
    // Se a migração mudar de ideia (passar a exigir `origem` do chamador, por
    // exemplo), estas asserções caem junto — em vez de a rota seguir calada.
    expect(migracao).toContain("start with 900000001");
    expect(migracao).toContain("new.origem := 'painel'");
    expect(migracao).toContain("new.last_seen_at := null");
    expect(migracao).toContain("before insert on public.estoque_motors");
  });
});

// ---------------------------------------------------------------------------
// 2. Quem cadastra
// ---------------------------------------------------------------------------

describe("gate de papel — quem cadastra é quem publica", () => {
  it("Admin e Comercial cadastram; os outros três, não", () => {
    expect(podeFazer("admin", "Publicar ou despublicar veículo")).toBe("faz");
    expect(podeFazer("comercial", "Publicar ou despublicar veículo")).toBe("faz");
    // Marketing é `revisao` nessa linha: trata foto e texto do que existe, não
    // decide que carro a loja tem. Revisão não é "faz" — a rota recusa.
    expect(podeFazer("marketing", "Publicar ou despublicar veículo")).not.toBe("faz");
    expect(podeFazer("gestor", "Publicar ou despublicar veículo")).toBe("nao_ve");
    expect(podeFazer("financeiro", "Publicar ou despublicar veículo")).toBe("nao_ve");
  });

  // A régua saiu do handler e virou `decidirCadastro`, função pura, em
  // 2026-08-29 — a revisão mediu que, com ela dentro da rota, os testes só
  // conseguiam afirmar que o TEXTO do gate estava no arquivo: desarmar
  // `ehStaff` ou `podeFazer` passava pela suíte inteira. Os testes de
  // COMPORTAMENTO do gate estão no bloco "o cadastro não escreve o que o banco
  // infere", acima; o que sobra aqui é o que só o arquivo pode dizer.
  it("a rota delega a régua e não a reimplementa", () => {
    const codigo = semComentarios(rotaEstoque);
    expect(codigo).toContain("decidirCadastro(body, profile)");
    // Régua duplicada no handler volta a divergir da função pura em silêncio.
    expect(codigo).not.toContain("campoNegadoAoPerfil");
    expect(codigo).not.toContain('podeFazer(perfil, "Publicar');
    expect(codigo).not.toContain("normalizarPerfil");
  });

  it("a rota lê o perfil do banco, nunca do corpo", () => {
    const codigo = semComentarios(rotaEstoque);
    // `profile` sai de `profiles` pela sessão; papel vindo do JSON seria a
    // porta dos fundos do gate inteiro.
    expect(codigo).toMatch(/from\("profiles"\)[\s\S]{0,200}eq\("id",\s*user\.id\)/);
    expect(codigo).not.toMatch(/body\s*\.\s*(papeis|role|perfil)/);
  });

  it("a tela repete o gate da rota — o negado some, não fica cinza", () => {
    expect(telaNova).toContain(
      'podeFazer(perfil, "Publicar ou despublicar veículo") !== "faz"',
    );
    expect(telaNova).toContain("redirect");
    expect(telaNova).toContain("perfisDe(");
    expect(semComentarios(telaNova)).not.toContain("normalizarPerfil");
  });

  it("todo campo de documento tem linha declarada na matriz A17", () => {
    // Mesma contraprova de `permissoes.test.ts` para `CAMPOS_NOSSOS`: campo
    // sem linha é negado, e um cadastro que enviasse um deles tomaria 403 sem
    // explicação. `chassi` entrou na linha da placa em 2026-08-29.
    const semLinha = CAMPOS_DE_DOCUMENTO.filter((c) => !ACAO_DO_CAMPO_DE_VEICULO[c]);
    expect(semLinha, "Campo de documento sem linha na A17: " + semLinha.join(", ")).toEqual([]);
    expect(ACAO_DO_CAMPO_DE_VEICULO.chassi).toBe(
      "Preencher documentação do veículo (placa, renavam)",
    );
  });

  it("nenhum campo de nascimento é também campo do editor — dono ambíguo é bug", () => {
    // Se um campo estivesse nas duas listas, ele viajaria duas vezes no corpo
    // e passaria por dois gates diferentes conforme a rota. Marca, modelo, ano
    // e preço são do cadastro; a ficha própria é do editor.
    const nosDois = CAMPOS_DE_NASCIMENTO.filter((c) =>
      (CAMPOS_NOSSOS as readonly string[]).includes(c),
    );
    expect(nosDois).toEqual([]);
  });

  it("a matriz não ganhou perfil novo sem alguém decidir se ele cadastra", () => {
    // Contraprova de vacuidade: se `PERFIS` crescer, o teste de cima passa a
    // não falar do papel novo. Aqui a lista inteira é conferida.
    expect([...PERFIS].sort()).toEqual([
      "admin",
      "comercial",
      "financeiro",
      "gestor",
      "marketing",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. O mínimo que a vitrine precisa ler
// ---------------------------------------------------------------------------

describe("validação do cadastro", () => {
  const completo = {
    marca: "Volkswagen",
    modelo: "Nivus",
    ano: 2023,
    preco: 118900,
    quilometragem: 38400,
    chassi: "9BWZZZ377VT004251",
  };

  it("os obrigatórios são os cinco da vitrine mais o chassi", () => {
    // O chassi entrou em 2026-08-29, quando o cadastro passou a nascer no
    // núcleo (migração 20260829170000): lá ele é a identidade do veículo
    // (`unique (org_id, chassi)`) e uma das três chaves da guarda de
    // duplicidade que o dono pediu. A função do banco recusa sem ele — exigir
    // aqui é dizer isso no formulário, não depois de preencher tudo.
    expect([...CAMPOS_OBRIGATORIOS_DO_CADASTRO]).toEqual([
      "marca",
      "modelo",
      "ano",
      "preco",
      "quilometragem",
      "chassi",
    ]);
  });

  it("cadastro completo não tem problema nenhum", () => {
    expect(validarCadastroDeVeiculo(completo)).toEqual([]);
  });

  it("acusa TODOS os obrigatórios de uma vez, não o primeiro", () => {
    const problemas = validarCadastroDeVeiculo({});
    expect(problemas.map((p) => p.campo).sort()).toEqual([
      "ano",
      "chassi",
      "marca",
      "modelo",
      "preco",
      "quilometragem",
    ]);
  });

  it("zero km é legítimo; km negativo não", () => {
    expect(validarCadastroDeVeiculo({ ...completo, quilometragem: 0 })).toEqual([]);
    expect(
      validarCadastroDeVeiculo({ ...completo, quilometragem: -1 }).map((p) => p.campo),
    ).toContain("quilometragem");
  });

  it("preço zero é recusado — carro anunciado por R$ 0 é erro de digitação", () => {
    expect(validarCadastroDeVeiculo({ ...completo, preco: 0 }).map((p) => p.campo)).toContain(
      "preco",
    );
  });

  it("ano fora da faixa de sanidade cai, e o ano-modelo do ano que vem passa", () => {
    const hoje = new Date("2026-08-29T12:00:00Z");
    expect(
      validarCadastroDeVeiculo({ ...completo, ano: anoMaximo(hoje) }, hoje),
    ).toEqual([]);
    expect(
      validarCadastroDeVeiculo({ ...completo, ano: anoMaximo(hoje) + 1 }, hoje).map(
        (p) => p.campo,
      ),
    ).toContain("ano");
    expect(
      validarCadastroDeVeiculo({ ...completo, ano: ANO_MINIMO - 1 }, hoje).map((p) => p.campo),
    ).toContain("ano");
  });

  it("fabricação depois do ano do modelo é impossível", () => {
    expect(
      validarCadastroDeVeiculo({ ...completo, ano: 2023, ano_fabricacao: 2024 }).map(
        (p) => p.campo,
      ),
    ).toContain("ano_fabricacao");
    // O contrário é o normal do mercado: fabricado em 2022, modelo 2023.
    expect(validarCadastroDeVeiculo({ ...completo, ano: 2023, ano_fabricacao: 2022 })).toEqual(
      [],
    );
  });

  it("placa vazia passa; placa torta não", () => {
    expect(validarCadastroDeVeiculo({ ...completo, placa: "" })).toEqual([]);
    expect(placaEhValida("ABC1D23")).toBe(true); // Mercosul
    expect(placaEhValida("ABC-1234")).toBe(true); // modelo antigo, com traço
    expect(placaEhValida("AB1234")).toBe(false);
    expect(
      validarCadastroDeVeiculo({ ...completo, placa: "ABC12" }).map((p) => p.campo),
    ).toContain("placa");
  });

  it("chassi tem 17 posições e não usa I, O nem Q", () => {
    expect(chassiEhPlausivel("9BWZZZ377VT004251")).toBe(true);
    expect(chassiEhPlausivel("9BWZZZ377VT00425")).toBe(false); // 16
    expect(chassiEhPlausivel("9BWZZZ377VT00425I")).toBe(false); // letra proibida
    expect(
      validarCadastroDeVeiculo({ ...completo, chassi: "123" }).map((p) => p.campo),
    ).toContain("chassi");
  });

  it("o preço nasce nas duas colunas — senão o carro sai a R$ 0 em metade do site", () => {
    // O mapper público lê `preco_original` e só cai em `preco` na falta dele;
    // o seletor de veículo e o `order("preco")` dos similares leem `preco`.
    const linha = normalizarCadastro({ ...completo });
    expect(linha.preco).toBe(118900);
    expect(linha.preco_original).toBe(118900);
  });

  it("texto em branco vira null, não string vazia", () => {
    const linha = normalizarCadastro({ ...completo, versao: "   ", cor: "Cinza" });
    expect(linha.versao).toBeNull();
    expect(linha.cor).toBe("Cinza");
  });

  it("corpo que não é objeto devolve vazio em vez de estourar", () => {
    // Mesma lição de `extrairCamposNossos`: entrada malformada merece 400, e
    // `"campo" in "texto"` é TypeError — o 500 que a rota não deve dar.
    expect(normalizarCadastro("marca")).toEqual({});
    expect(normalizarCadastro(null)).toEqual({});
    expect(normalizarCadastro([1, 2])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 4. A tela existe e pede o que precisa pedir
// ---------------------------------------------------------------------------

describe("a tela /admin/estoque/novo", () => {
  it("a página existe", () => {
    expect(existsSync(join(RAIZ, "src", "app", "admin", "estoque", "novo", "page.tsx"))).toBe(
      true,
    );
  });

  it("a rota que ela chama existe e é POST na coleção", () => {
    expect(formulario).toContain('fetch("/api/estoque"');
    expect(formulario).toContain('method: "POST"');
    expect(rotaEstoque).toContain("export async function POST(");
  });

  it("tem campo para cada um dos cinco obrigatórios", () => {
    const ids: Record<string, string> = {
      marca: 'id="c-marca"',
      modelo: 'id="c-modelo"',
      ano: 'id="c-ano"',
      preco: 'id="c-preco"',
      quilometragem: 'id="c-km"',
    };
    for (const campo of CAMPOS_OBRIGATORIOS_DO_CADASTRO) {
      expect(formulario, `sem campo para ${campo}`).toContain(ids[campo]);
    }
  });

  it("valida com a MESMA régua da rota — as duas não podem divergir", () => {
    // A tela chama a validação direto (para avisar antes de enviar); a rota
    // chega nela por `decidirCadastro`, que é quem decide de verdade. O que
    // não pode é a rota deixar de validar — daí conferir o caminho, e não só
    // o nome da função.
    expect(formulario).toContain("validarCadastroDeVeiculo");
    expect(semComentarios(rotaEstoque)).toContain("decidirCadastro");
    expect(ler("src", "lib", "cadastroDeVeiculo.ts")).toContain(
      "validarCadastroDeVeiculo(linha)",
    );
  });

  it("não sobe foto nesta entrega, e diz isso na tela", () => {
    // A entrega seguinte traz o armazenamento próprio. Simular upload aqui
    // seria a tela prometendo o que o sistema não faz.
    expect(formulario).not.toContain('type="file"');
    expect(formulario).not.toContain("storage.from");
    expect(formulario).toContain("Não há upload de foto nesta tela");
  });

  it("mostra a régua de publicação pela função que a aplica, não por texto solto", () => {
    // 8 fotos é `MINIMO_DE_FOTOS`, e quem decide é `bloqueiosDePublicacao` —
    // a mesma que filtra a vitrine e que o editor A15 desenha. Número
    // digitado à mão aqui viraria mentira no dia em que a régua mudar.
    expect(formulario).toContain("bloqueiosDePublicacao");
    expect(formulario).toContain("MINIMO_DE_FOTOS");
    expect(formulario).not.toMatch(/\b8 fotos\b/);
  });

  it("margem projetada some junto com o custo, por não-renderização", () => {
    // Margem é o custo por subtração: um `hidden` deixaria o valor no HTML de
    // quem não pode vê-lo — foi assim que `preco_compra` vazou no /estoque.
    expect(formulario).toContain('podeGravar("preco_compra") && (');
    expect(formulario).toContain("Margem bruta projetada");
    expect(formulario).toContain("tabular-nums");
  });

  it("tem estado de carregamento e de erro", () => {
    expect(formulario).toContain("Cadastrando…");
    expect(formulario).toContain('role="alert"');
    expect(formulario).toContain("O veículo NÃO foi cadastrado");
  });
});

describe("a porta de entrada na tabela A6", () => {
  it("o botão + Novo veículo aponta para a tela nova", () => {
    expect(tabelaA6).toContain('href="/admin/estoque/novo"');
    expect(tabelaA6).toContain("+ Novo veículo");
  });

  it("o botão some para quem não publica veículo", () => {
    expect(tabelaA6).toContain("podeCriar: boolean");
    expect(tabelaA6).toContain("{podeCriar && (");
    expect(paginaA6).toContain(
      'podeFazer(perfisDe(profile), "Publicar ou despublicar veículo") === "faz"',
    );
  });

  it("o comentário que dizia não haver cadastro foi corrigido", () => {
    // Ele existia e era verdade: "criar carro à mão é outro pacote, junto com
    // o storage próprio de fotos". Deixá-lo agora mandaria o próximo leitor
    // procurar uma tela que existe.
    expect(paginaA6).not.toContain("criar carro à mão é outro pacote");
    expect(paginaA6).toContain("+ Novo veículo");
  });
});
