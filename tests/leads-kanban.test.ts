import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SEM_DONO,
  filtrarPorResponsavel,
  iniciais,
  opcoesDeResponsavel,
} from "../src/lib/leadsKanban";

/**
 * Kanban de leads — responsável, anotações e arrastar (pacote 1 da tela A8).
 *
 * A tela roda atrás de login, então nada aqui é verificável no navegador sem
 * credencial. O que dá para segurar é o que quebra em silêncio: um lead que
 * some do filtro porque o consultor saiu da empresa, e o arrastar que só
 * "não acontece" quando o link do telefone rouba o gesto.
 */

const kanban = readFileSync(
  join(__dirname, "..", "src", "components", "admin", "LeadsKanban.tsx"),
  "utf-8"
);

/**
 * O mesmo arquivo sem comentários.
 *
 * Necessário porque os comentários deste componente citam o próprio código
 * que eles explicam. Uma asserção contra o texto cru passava mesmo com o
 * atributo apagado do JSX — casava com o comentário. Teste que não pode
 * falhar não é teste.
 */
const codigo = kanban
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/^\s*\/\/.*$/, ""))
  .join("\n");
const rota = readFileSync(
  join(__dirname, "..", "src", "app", "api", "leads", "gerenciar", "route.ts"),
  "utf-8"
);

describe("iniciais", () => {
  it("usa primeira e última palavra", () => {
    // "JP", não "JS": é o que distingue dois consultores de mesmo primeiro
    // nome, que é o caso que importa numa equipe pequena.
    expect(iniciais("João Silva Pereira")).toBe("JP");
  });

  it("aguenta nome de uma palavra só", () => {
    expect(iniciais("Ana")).toBe("A");
  });

  it("não quebra com espaço sobrando nem string vazia", () => {
    expect(iniciais("  Maria   Souza  ")).toBe("MS");
    expect(iniciais("")).toBe("");
    expect(iniciais("   ")).toBe("");
  });
});

describe("filtrarPorResponsavel", () => {
  const leads = [
    { responsavel: "Ana" },
    { responsavel: null },
    { responsavel: "Bruno" },
    { responsavel: null },
  ];

  it("filtro vazio devolve tudo", () => {
    expect(filtrarPorResponsavel(leads, "")).toHaveLength(4);
  });

  it("filtra por nome", () => {
    expect(filtrarPorResponsavel(leads, "Ana")).toEqual([{ responsavel: "Ana" }]);
  });

  it("acha os que ninguém pegou", () => {
    expect(filtrarPorResponsavel(leads, SEM_DONO)).toHaveLength(2);
  });

  it("o sentinela não colide com nome de gente", () => {
    // Começa com espaço de propósito. Se alguém trocar por "sem-dono", um
    // consultor cadastrado com esse nome sequestraria o filtro.
    expect(SEM_DONO.startsWith(" ")).toBe(true);
    expect(filtrarPorResponsavel([{ responsavel: "sem-dono" }], SEM_DONO)).toEqual([]);
  });
});

describe("opcoesDeResponsavel", () => {
  it("junta cadastrados com quem já está gravado nos leads", () => {
    // `responsavel` é texto, não FK: quem sai da empresa some do cadastro mas
    // continua nos leads antigos. Sem a união, esses leads sumiriam do filtro
    // sem explicação nenhuma na tela.
    const opcoes = opcoesDeResponsavel(["Ana", "Bruno"], [{ responsavel: "Carla (ex)" }]);
    expect(opcoes).toEqual(["Ana", "Bruno", "Carla (ex)"]);
  });

  it("não repete nem lista vazio", () => {
    expect(opcoesDeResponsavel(["Ana", ""], [{ responsavel: "Ana" }, { responsavel: null }])).toEqual(["Ana"]);
  });

  it("ordena em português", () => {
    expect(opcoesDeResponsavel(["Ávila", "Bruno", "Ana"], [])).toEqual(["Ana", "Ávila", "Bruno"]);
  });
});

describe("a tela", () => {
  it("mantém as setas ao lado do arrastar", () => {
    // Arrastar nativo não funciona no toque nem no teclado, e esta tela roda
    // no tablet de balcão. Se as setas saírem, o tablet perde a única forma
    // de mover lead — e não dá erro, some a capacidade.
    expect(kanban).toContain("Avançar ${l.nome} uma etapa");
    expect(kanban).toContain("Voltar ${l.nome} uma etapa");
    expect(codigo).toContain("draggable");
    expect(codigo).toContain("onDrop");
  });

  it("impede o link do telefone de roubar o arrasto", () => {
    // Sem `draggable={false}` no <a>, o navegador arrasta o link em vez do
    // card e o drop nunca dispara. Falha muda: o card só não se move.
    expect(codigo).toMatch(/wa\.me[\s\S]{0,400}draggable=\{false\}/);
  });

  it("autoriza o drop com preventDefault no dragOver", () => {
    // Sem isto o navegador recusa o drop, silenciosamente.
    expect(codigo).toMatch(/onDragOver[\s\S]{0,200}preventDefault/);
  });

  it("grava anotação ao sair do campo, não a cada tecla", () => {
    expect(codigo).toContain("onBlur");
    expect(kanban).not.toMatch(/onChange=\{[^}]*observacoes/);
  });

  it("recarrega do servidor quando a gravação falha", () => {
    // Restaurar um retrato local desfaria o trabalho de outro consultor que
    // mexeu na fila no meio do caminho.
    const bloco = codigo.slice(codigo.indexOf("const salvar"), codigo.indexOf("const mover"));
    expect(bloco).toContain("carregar()");
    expect(bloco).not.toContain("setLeads(anterior)");
  });
});

describe("a rota", () => {
  it("devolve os atendentes junto com os leads", () => {
    // `/api/users` exige Admin, e quem atende lead é Comercial — sem isto o
    // seletor de responsável ficaria vazio justamente para quem o usa.
    expect(rota).toContain("atendentes");
    expect(rota).toContain('.in("role", ["admin", "comercial"])');
  });

  it("só devolve atendentes depois da checagem de permissão", () => {
    const posPermissao = rota.indexOf("Ver e mover leads no kanban");
    const posAtendentes = rota.indexOf("let atendentes");
    expect(posPermissao).toBeGreaterThan(-1);
    expect(posAtendentes).toBeGreaterThan(posPermissao);
  });

  it("mantém Marketing no agregado, sem nome de pessoa", () => {
    const agregado = rota.slice(rota.indexOf("if (!podeVer)"), rota.indexOf("let atendentes"));
    expect(agregado).toContain("somenteAgregado");
    expect(agregado).not.toContain("nome");
  });
});
