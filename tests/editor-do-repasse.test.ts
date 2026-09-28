// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { linhaDoBancoDeTeste } from "./repasseDeTeste";
import { repasseDoPainelDaLinha } from "../src/lib/repasseDoPainel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
const empurrar = vi.fn();
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: empurrar, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/repasse",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const { ConfirmProvider } = await import("../src/components/admin/ConfirmDialog");
// O editor mudou para /editar em 28/09: abrir o carro mostra a visão (`visao-do-repasse`).
const PaginaDoCarro = (await import("../src/app/admin/repasse/[id]/editar/page")).default;
const PaginaNovo = (await import("../src/app/admin/repasse/novo/page")).default;
const NovoRepasse = (await import("../src/components/admin/repasse/NovoRepasse")).default;
const EditorDeRepasse = (await import("../src/components/admin/repasse/EditorDeRepasse")).default;

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const ISO = "2026-09-24T12:00:00Z";
const LOJISTA = {
  id: "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
  trilha: "lojista",
  nome: "Auto Bom Ltda",
  whatsapp: "41999990000",
  faixa: null,
  carrocerias: [],
  cnpj: "12345678000190",
  loja_cidade: "Auto Bom, Curitiba",
  cnpj_conferido_em: ISO,
  created_at: ISO,
};

function entrarComo(papeis: string[]) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis);
}
beforeEach(() => entrarComo(["comercial"]));

const texto = (el: ReactElement) =>
  renderToStaticMarkup(createElement(ConfirmProvider, null, el)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function abrirCarro(id = ID) {
  return texto(await PaginaDoCarro({ params: Promise.resolve({ id }) }));
}

describe("o editor do carro (/editar)", () => {
  it("id que não é uuid: não encontrado", async () => {
    await expect(PaginaDoCarro({ params: Promise.resolve({ id: "123" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("carro que não existe: não encontrado", async () => {
    banco.leituras.repasses = { data: null, error: null };
    await expect(PaginaDoCarro({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("comercial num carro publicado vê quem avisar", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: ISO }), error: null };
    banco.leituras.repasse_inscritos = { data: [LOJISTA], error: null };
    banco.leituras.repasse_avisos = { data: [], error: null };
    const html = await abrirCarro();
    expect(html).toContain("Quem avisar");
    expect(html).toContain("Auto Bom Ltda");
  });

  it("marketing no mesmo carro não vê a lista, e a página nem a lê", async () => {
    entrarComo(["marketing"]);
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ situacao: "publicado", lojistas_desde: ISO }), error: null };
    banco.leituras.repasse_inscritos = { data: [LOJISTA], error: null };
    const html = await abrirCarro();
    expect(html).not.toContain("Quem avisar");
    expect(html).not.toContain("Auto Bom Ltda");
    expect(banco.lidas).not.toContain("repasse_inscritos");
  });

  it("o checklist aparece com o que falta", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ resumo: null }), error: null };
    const html = await abrirCarro();
    expect(html).toContain("Escreva a linha do card.");
  });

  it("o editor volta para a visão do carro", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste(), error: null };
    const html = renderToStaticMarkup(
      createElement(ConfirmProvider, null, await PaginaDoCarro({ params: Promise.resolve({ id: ID }) })),
    );
    expect(html).toContain(`href="/admin/repasse/${ID}"`);
  });

  it("o rascunho devolvido mostra a nota", async () => {
    banco.leituras.repasses = { data: { ...linhaDoBancoDeTeste(), devolvido_com: "Falta a foto do farol" }, error: null };
    expect(await abrirCarro()).toContain("Falta a foto do farol");
  });

  it("termo proibido no resumo aparece como aviso na hora", async () => {
    banco.leituras.repasses = { data: linhaDoBancoDeTeste({ resumo: "Carro que não girou no pátio" }), error: null };
    // Frase exclusiva do AvisoDeTermo — o Checklist usa "O texto usa..." (sem
    // "Este"), então esta string só aparece se o aviso inline estiver ali.
    expect(await abrirCarro()).toContain("Este texto usa um termo que o repasse não usa");
  });
});

describe("novo carro", () => {
  it("a página abre para qualquer perfil da equipe", async () => {
    entrarComo(["financeiro"]);
    expect(texto(await PaginaNovo())).toContain("Criar rascunho");
  });

  it("quem não é da equipe volta para a home", async () => {
    entrarComo(["cliente"]);
    await expect(PaginaNovo()).rejects.toThrow("NEXT_REDIRECT:/");
  });

  describe("o formulário", () => {
    let container: HTMLDivElement;
    let root: Root;
    afterEach(async () => {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    });

    function mudar(el: HTMLInputElement, valor: string) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, valor);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    it("cria o rascunho com números e vai para o editor", async () => {
      const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ id: ID, slug: "x" }), { status: 201 }));
      vi.stubGlobal("fetch", fetchFalso);
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => root.render(createElement(NovoRepasse)));
      const campo = (nome: string) => container.querySelector(`input[name="${nome}"]`) as HTMLInputElement;
      await act(async () => {
        mudar(campo("marca"), "Renault");
        mudar(campo("modelo"), "Kwid");
        mudar(campo("versao"), "Zen 1.0");
        mudar(campo("ano_modelo"), "2021");
        mudar(campo("quilometragem"), "71200");
        mudar(campo("preco"), "36900");
      });
      await act(async () => {
        container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(fetchFalso).toHaveBeenCalledWith(
        "/api/repasses",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ marca: "Renault", modelo: "Kwid", versao: "Zen 1.0", ano_modelo: 2021, quilometragem: 71200, preco: 36900 }),
        }),
      );
      // Quem acabou de cadastrar vai preencher o resto: o editor, não a visão.
      expect(empurrar).toHaveBeenCalledWith(`/admin/repasse/${ID}/editar`);
    });
  });
});

describe("o editor: salvar não perde o que foi digitado durante o PATCH", () => {
  let container: HTMLDivElement;
  let root: Root;
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function setValor(el: HTMLInputElement | HTMLTextAreaElement, valor: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Deixa os microtasks da cadeia fetch → json → setState assentarem. */
  const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

  it("o motivo digitado enquanto o PATCH está no ar não desaparece", async () => {
    const linha = linhaDoBancoDeTeste();
    const repasse = repasseDoPainelDaLinha(linha)!;

    let resolverPatch: (r: Response) => void = () => {};
    const pendente = new Promise<Response>((resolve) => {
      resolverPatch = resolve;
    });
    const fetchFalso = vi.fn((url: RequestInfo | URL) => {
      const alvo = String(url);
      // O PATCH do editor fica pendente até o teste resolver; qualquer outra
      // chamada (a cascata de marcas da FIPE) responde na hora.
      return alvo.startsWith(`/api/repasses/${repasse.id}`) ? pendente : Promise.resolve(new Response("[]"));
    });
    vi.stubGlobal("fetch", fetchFalso);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          ConfirmProvider,
          null,
          createElement(EditorDeRepasse, {
            repasse,
            perfis: ["comercial"],
            inscritos: null,
            avisados: [],
            urlDaFicha: "https://x/repasse/y",
          }),
        ),
      );
    });

    const resumo = container.querySelector('input[maxlength="140"]') as HTMLInputElement;
    const motivo = Array.from(container.querySelectorAll("textarea")).find((t) =>
      t.closest("label")?.textContent?.includes("Por que está no repasse"),
    ) as HTMLTextAreaElement;
    const botaoSalvar = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Salvar",
    ) as HTMLButtonElement;

    await act(async () => {
      setValor(resumo, "Novo resumo salvo");
    });
    await act(async () => {
      botaoSalvar.click();
    });
    await act(async () => {
      setValor(motivo, "Digitado durante o salvar");
    });

    const repasseSalvo = repasseDoPainelDaLinha({ ...linha, resumo: "Novo resumo salvo" })!;
    resolverPatch(new Response(JSON.stringify({ repasse: repasseSalvo }), { status: 200 }));
    await flush();

    expect(motivo.value).toBe("Digitado durante o salvar");
    expect(botaoSalvar.disabled).toBe(false);
  });
});
