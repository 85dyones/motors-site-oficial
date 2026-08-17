import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  somenteDigitos,
  cepValido,
  formatarCep,
  enderecoEmLinha,
} from "../src/lib/ciclo/cep";

/**
 * A19 sem digitação — o veículo vem do estoque, o CEP vem da consulta.
 *
 * O que este arquivo trava:
 *
 *   1. Chassi e placa são documentação INTERNA. A rota que os serve é
 *      autenticada, e o mapper público nunca os conhece.
 *   2. Só o CEP é gravado. Logradouro/bairro/cidade não viram coluna — o §2.1
 *      não os prevê, e ampliar dado pessoal é decisão do dono.
 *   3. A função de fechamento é a original com três linhas a mais. A régua do
 *      financiamento do §3.1 tem que continuar de pé.
 */

const raiz = join(__dirname, "..");
const ler = (...p: string[]) => readFileSync(join(raiz, ...p), "utf-8");

const migracao = ler("supabase", "migrations", "20260817140000_documento_do_estoque_e_cep.sql");
const original = ler("supabase", "migrations", "20260814120000_fechar_venda_ciclo.sql");
const rotaEstoque = ler("src", "app", "api", "ciclo", "vendas", "estoque", "route.ts");
const formulario = ler("src", "components", "admin", "FechamentoDeVenda.tsx");
const supabaseLib = ler("src", "lib", "supabase.ts");

describe("o veículo vem do estoque", () => {
  it("as colunas do feed existem, com a nota de uso interno", () => {
    expect(migracao).toContain("add column if not exists chassi");
    expect(migracao).toContain("add column if not exists valor_fipe");
    expect(migracao).toContain("add column if not exists codigo_fipe");
    expect(migracao).toContain("uso interno");
  });

  it("a rota que serve chassi e placa exige staff com a permissão da venda", () => {
    expect(rotaEstoque).toContain("ehStaff(profile?.role)");
    expect(rotaEstoque).toContain('podeFazer(normalizarPerfil(profile?.role), "Fechar venda do Ciclo")');
    expect(rotaEstoque).toContain("status: 401");
    expect(rotaEstoque).toContain("status: 403");
  });

  it("o mapper público não conhece chassi — e não espalha a linha", () => {
    // Se alguém trocar o mapper por um spread, chassi e placa vazam para a
    // vitrine na mesma hora. Foi por isso que a coluna pôde ser criada.
    const mapper = supabaseLib.slice(
      supabaseLib.indexOf("export function mapVeiculoDbToVeiculo"),
      supabaseLib.indexOf("export async function getEstoque"),
    );
    // Spread é o que transformaria toda coluna nova em vazamento.
    expect(mapper).not.toContain("...dbItem");
    // Nenhuma LEITURA de dbItem.chassi (a palavra "chassis" aparece numa lista
    // de termos de descrição, e não tem nada a ver com o documento).
    expect(mapper).not.toMatch(/dbItem\.chassi\b/);
    expect(mapper).not.toMatch(/dbItem\.placa\b/);
  });

  it("o formulário preenche do estoque mas deixa tudo editável", () => {
    expect(formulario).toContain("usarVeiculo");
    expect(formulario).toContain("estoque_id: v.id");
    // KM e valor mudam entre anunciar e entregar — entram como ponto de
    // partida, e a tela avisa.
    expect(formulario).toContain("Confira o KM de saída e o");
  });

  it("estoque indisponível não trava a venda", () => {
    expect(formulario).toContain("Estoque indisponível; preencha à mão");
    expect(formulario).toContain("preencha os campos abaixo");
  });

  it("carro sem chassi no feed é sinalizado, não escondido", () => {
    expect(formulario).toContain("sem chassi no feed");
  });
});

describe("o CEP", () => {
  it("normaliza, valida e formata", () => {
    expect(somenteDigitos("80010-010")).toBe("80010010");
    expect(cepValido("80010-010")).toBe(true);
    expect(cepValido("8001001")).toBe(false);
    expect(cepValido(null)).toBe(false);
    expect(formatarCep("80010010")).toBe("80010-010");
    expect(formatarCep("800")).toBe("800");
  });

  it("monta a linha de conferência", () => {
    expect(
      enderecoEmLinha({
        cep: "80010010",
        logradouro: "Rua XV de Novembro",
        bairro: "Centro",
        cidade: "Curitiba",
        uf: "PR",
      }),
    ).toBe("Rua XV de Novembro, Centro — Curitiba/PR");
  });

  it("o banco grava só dígitos, e venda sem CEP não apaga o anterior", () => {
    expect(migracao).toContain("regexp_replace(coalesce(dados->>'cep', ''), '\\D', '', 'g')");
    expect(migracao).toContain("cep                   = coalesce(excluded.cep, public.clientes.cep)");
  });

  it("o endereço completo NÃO é gravado — é dado que o §2.1 não prevê", () => {
    for (const campo of ["logradouro", "bairro", "cidade", "uf"]) {
      expect(migracao, `${campo} virou coluna`).not.toMatch(
        new RegExp(`add column if not exists ${campo}`),
      );
    }
    // A consulta serve para conferir; quem grava é só o CEP.
    expect(ler("src", "lib", "ciclo", "cep.ts")).toContain("para conferir, não para colecionar");
  });

  it("a consulta é conveniência: falha não impede fechar a venda", () => {
    // Normalizado sem o `*` de continuação do comentário, que quebra a frase.
    const cep = ler("src", "lib", "ciclo", "cep.ts").replace(/\s*\*\s*|\s+/g, " ");
    expect(cep).toContain("impedir o fechamento de uma venda");
    // Toda saída de erro devolve null — nada de exceção subindo para a tela.
    expect(cep).toContain("catch { return null; }");
  });
});

describe("a função de fechamento continua sendo a original", () => {
  it("a régua do financiamento do §3.1 não afrouxou", () => {
    // Reescrever a função de cabeça já quebrou isto uma vez: com a detecção
    // frouxa, valor_financiado sem instituicao passava batido e a venda era
    // gravada sem taxa_mensal — "o campo mais valioso" do §3.1.
    for (const trecho of [
      "tem_fin    boolean := false;",
      "v_fin->>'valor_financiado' is not null or",
      "v_fin->>'taxa_mensal' is not null or",
    ]) {
      expect(migracao, `sumiu da função: ${trecho}`).toContain(trecho);
    }
  });

  it("os nomes dos campos de erro continuam os que a tela destaca", () => {
    // A rota traduz VENDA_INCOMPLETA em problemas por campo, e o formulário
    // procura por `instituicao` — não por `financiamento.instituicao`.
    expect(migracao).toContain("array_append(faltando, 'instituicao')");
    expect(migracao).not.toContain("'financiamento.instituicao'");
  });

  it("é o corpo da original, com as três linhas do CEP e nada mais", () => {
    // ⚠️ Quebra por `/\r?\n/`, não por "\n". Com CRLF — que é o que o checkout
    // entrega nesta máquina — a linha termina em `\r`, e o `.` do regex de
    // comentário NÃO casa `\r`: sem isto, nenhum comentário é removido e a
    // comparação acusa dezenas de diferenças que não existem.
    const corpo = (s: string) => {
      const i = s.indexOf("create or replace function public.fechar_venda_ciclo");
      const j = s.indexOf("$$;", i);
      return s
        .slice(i, j)
        .split(/\r?\n/)
        .map((l) => l.replace(/--.*$/, "").trim())
        .filter(Boolean);
    };
    const velha = corpo(original);
    const nova = corpo(migracao);
    const soNaNova = nova.filter((l) => !velha.includes(l));
    // Exatamente as três linhas do CEP: a coluna, o valor e o on-conflict.
    expect(soNaNova).toHaveLength(3);
    expect(soNaNova.join("\n")).toContain("cep");
  });
});
