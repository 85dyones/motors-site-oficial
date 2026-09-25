// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmProvider } from "../src/components/admin/ConfirmDialog";
import AcoesDoRepasse from "../src/components/admin/repasse/AcoesDoRepasse";
import ConsultaFipeDoRepasse from "../src/components/admin/repasse/ConsultaFipeDoRepasse";
import FichaDeEstadoNoEditor from "../src/components/admin/repasse/FichaDeEstadoNoEditor";
import { FIPE_BASE, type Buscar } from "../src/lib/consultaFipe";
import { ITEM_VAZIO, comItem, semItem } from "../src/lib/fichaDeEstado";
import type { Perfil } from "../src/lib/permissoes";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * As três peças do editor do repasse, no molde de
 * `tests/curadoria-de-destaques.test.ts` (createRoot + act, DOM cru).
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function montar(elemento: ReturnType<typeof createElement>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(ConfirmProvider, null, elemento)));
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

const botoes = () => [...container.querySelectorAll("button")].map((b) => b.textContent?.trim() ?? "");
const botao = (texto: string) => {
  const b = [...container.querySelectorAll("button")].find((x) => x.textContent?.trim() === texto);
  expect(b, `a tela precisa ter o botão "${texto}"`).toBeDefined();
  return b as HTMLButtonElement;
};

function mudar(el: HTMLInputElement | HTMLSelectElement, valor: string, evento: "input" | "change") {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
  el.dispatchEvent(new Event(evento, { bubbles: true }));
}

describe("fichaDeEstado", () => {
  it("troca e tira um item sem mexer nos outros", () => {
    const itens = [ITEM_VAZIO, { ...ITEM_VAZIO, descricao: "Farol" }];
    expect(comItem(itens, 0, { descricao: "Risco" })[0].descricao).toBe("Risco");
    expect(comItem(itens, 0, { descricao: "Risco" })[1]).toBe(itens[1]);
    expect(semItem(itens, 0)).toEqual([itens[1]]);
  });
});

describe("AcoesDoRepasse", () => {
  const RASCUNHO = repasseDeTeste();

  it("marketing no rascunho vê só o envio", async () => {
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["marketing"], alterado: false, aoMudar: () => {} }));
    expect(botoes()).toEqual(["Enviar para validação"]);
  });

  it("enviar chama a rota com o ato e entrega o carro novo", async () => {
    const novo = { ...RASCUNHO, situacao: "em_validacao" };
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ ok: true, repasse: novo }), { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    const aoMudar = vi.fn();
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["marketing"], alterado: false, aoMudar }));
    await act(async () => botao("Enviar para validação").click());
    expect(fetchFalso).toHaveBeenCalledWith(
      `/api/repasses/${RASCUNHO.id}/transicao`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ato: "enviar" }) }),
    );
    expect(aoMudar).toHaveBeenCalledWith(novo);
  });

  it("422 mostra o que falta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "O carro ainda não está completo.", problemas: ["Escreva a linha do card."] }), { status: 422 })));
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["marketing"], alterado: false, aoMudar: () => {} }));
    await act(async () => botao("Enviar para validação").click());
    expect(container.textContent).toContain("Escreva a linha do card.");
  });

  it("com alteração não salva, os atos ficam travados", async () => {
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["marketing"], alterado: true, aoMudar: () => {} }));
    expect(botao("Enviar para validação").disabled).toBe(true);
    expect(container.textContent).toContain("Salve as alterações antes de mudar a situação.");
  });

  it("arquivar pede confirmação antes de chamar a rota", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    await montar(createElement(AcoesDoRepasse, { repasse: RASCUNHO, perfis: ["comercial"], alterado: false, aoMudar: () => {} }));
    await act(async () => botao("Arquivar").click());
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("devolver abre o campo da nota", async () => {
    const emValidacao = repasseDeTeste({ situacao: "em_validacao" });
    await montar(createElement(AcoesDoRepasse, { repasse: emValidacao, perfis: ["gestor"], alterado: false, aoMudar: () => {} }));
    await act(async () => botao("Devolver para rascunho").click());
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  it("editar outro campo com a nota aberta trava o botão de devolver", async () => {
    const emValidacao = repasseDeTeste({ situacao: "em_validacao" });
    const props = { repasse: emValidacao, perfis: ["gestor"] as Perfil[], alterado: false, aoMudar: () => {} };
    await montar(createElement(AcoesDoRepasse, props));
    await act(async () => botao("Devolver para rascunho").click());
    expect(botao("Devolver").disabled).toBe(false);

    await act(async () =>
      root.render(createElement(ConfirmProvider, null, createElement(AcoesDoRepasse, { ...props, alterado: true }))),
    );

    expect(botao("Devolver").disabled).toBe(true);
  });
});

describe("ConsultaFipeDoRepasse", () => {
  const RESPOSTAS: Record<string, unknown> = {
    [`${FIPE_BASE}/carros/marcas`]: [{ codigo: "48", nome: "Renault" }],
    [`${FIPE_BASE}/carros/marcas/48/modelos`]: { modelos: [{ codigo: 9000, nome: "Kwid Zen 1.0" }] },
    [`${FIPE_BASE}/carros/marcas/48/modelos/9000/anos`]: [{ codigo: "2021-1", nome: "2021 Gasolina" }],
    [`${FIPE_BASE}/carros/marcas/48/modelos/9000/anos/2021-1`]: {
      Valor: "R$ 42.100,00",
      CodigoFipe: "025258-0",
      MesReferencia: "setembro de 2026 ",
    },
  };
  const buscar: Buscar = async (url) => ({ ok: url in RESPOSTAS, json: async () => RESPOSTAS[url] });

  it("a cascata marca → modelo → ano entrega valor, código e mês", async () => {
    const aoEscolher = vi.fn();
    await montar(createElement(ConsultaFipeDoRepasse, { podeEditar: true, aoEscolher, buscar }));
    const [marca, modelo, ano] = [...container.querySelectorAll("select")];
    await act(async () => mudar(marca, "48", "change"));
    await act(async () => mudar(modelo, "9000", "change"));
    await act(async () => mudar(ano, "2021-1", "change"));
    expect(aoEscolher).toHaveBeenCalledWith({ valor: 42100, codigo: "025258-0", mesReferencia: "setembro de 2026" });
  });

  it("sem edição, não consulta", async () => {
    const buscarEspiao = vi.fn(buscar);
    await montar(createElement(ConsultaFipeDoRepasse, { podeEditar: false, aoEscolher: () => {}, buscar: buscarEspiao }));
    expect(buscarEspiao).not.toHaveBeenCalled();
    expect(container.querySelectorAll("select").length).toBe(0);
  });
});

describe("FichaDeEstadoNoEditor", () => {
  const r = repasseDeTeste();
  const desenhar = (podeEditar: boolean, parcial: Partial<typeof r> = {}) =>
    renderToStaticMarkup(
      createElement(FichaDeEstadoNoEditor, {
        repasseId: r.id,
        itens: parcial.itens_de_estado ?? r.itens_de_estado,
        semDefeitos: parcial.sem_defeitos_conhecidos ?? r.sem_defeitos_conhecidos,
        oficina: r.oficina_do_orcamento,
        orcamentoEm: r.orcamento_em,
        podeEditar,
        aoMudar: () => {},
        aoMudarItem: () => {},
      }),
    );

  it("diz que é a lista que o comprador assina, e soma o reparo", () => {
    const html = desenhar(true);
    expect(html).toContain("é a lista que o comprador assina");
    expect(html).toContain("2.020"); // 1.400 + 620
    expect(html).toContain("Adicionar defeito");
  });

  it("sem edição, não há botão de adicionar nem de enviar foto", () => {
    const html = desenhar(false);
    expect(html).not.toContain("Adicionar defeito");
    expect(html).not.toContain('type="file"');
  });

  it("nenhum defeito conhecido esconde a lista", () => {
    const html = desenhar(true, { itens_de_estado: [], sem_defeitos_conhecidos: true });
    expect(html).not.toContain("Adicionar defeito");
  });
});
