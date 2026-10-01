"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { OBRIGATORIOS_PARA_CRIAR } from "../../../lib/edicaoDoRepasse";
import {
  avisoDasFotos,
  MINIMO_DA_BUSCA,
  NOME_DA_SITUACAO_NO_ESTOQUE,
  resumoDaCopia,
  type CarroDoEstoqueParaORepasse,
  type RespostaDaCopia,
} from "../../../lib/estoqueParaORepasse";
import { caminhoDoEditorNoPainel } from "../../../lib/painelDoRepasse";
import { CARROCERIAS_DO_REPASSE } from "../../../lib/repasse";

const CAMPOS = [
  { nome: "marca", rotulo: "Marca", tipo: "text" },
  { nome: "modelo", rotulo: "Modelo", tipo: "text" },
  { nome: "versao", rotulo: "Versão", tipo: "text" },
  { nome: "ano_modelo", rotulo: "Ano do modelo", tipo: "number" },
  { nome: "quilometragem", rotulo: "Quilometragem", tipo: "number" },
  { nome: "preco", rotulo: "Preço à vista (R$)", tipo: "number" },
] as const;

/** O que só aparece quando o carro vem do estoque — o resto se preenche no editor. */
const CAMPOS_DO_ESTOQUE = [
  { nome: "ano_fabricacao", rotulo: "Ano de fabricação", tipo: "number" },
  { nome: "cambio", rotulo: "Câmbio", tipo: "text" },
  { nome: "combustivel", rotulo: "Combustível", tipo: "text" },
  { nome: "cor", rotulo: "Cor", tipo: "text" },
  { nome: "fipe_codigo", rotulo: "Código FIPE", tipo: "text" },
] as const;

type NomeDoCampo = (typeof CAMPOS)[number]["nome"] | (typeof CAMPOS_DO_ESTOQUE)[number]["nome"] | "carroceria";
type Valores = Record<NomeDoCampo, string>;

const VAZIO: Valores = {
  marca: "",
  modelo: "",
  versao: "",
  ano_modelo: "",
  quilometragem: "",
  preco: "",
  ano_fabricacao: "",
  cambio: "",
  combustivel: "",
  cor: "",
  carroceria: "",
  fipe_codigo: "",
};

const ROTULO_DA_CARROCERIA: Record<(typeof CARROCERIAS_DO_REPASSE)[number], string> = {
  hatch: "Hatch",
  seda: "Sedã",
  suv: "SUV",
  picape: "Picape",
  outro: "Outro",
};

const rotulo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const numero = (n: number | null) => (n === null ? "" : String(n));

/**
 * O corpo do POST. Os seis campos de sempre vão sempre, como antes; os que só
 * o estoque traz vão quando têm valor. O preço nunca vem do estoque (dono,
 * 01/10): o do repasse é outro, e é a pessoa que o digita.
 */
function corpoDoRascunho(v: Valores): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    marca: v.marca,
    modelo: v.modelo,
    versao: v.versao || null,
    ano_modelo: Number(v.ano_modelo),
    quilometragem: Number(v.quilometragem),
    preco: Number(v.preco),
  };
  if (v.ano_fabricacao.trim()) corpo.ano_fabricacao = Number(v.ano_fabricacao);
  for (const c of ["cambio", "combustivel", "cor", "carroceria", "fipe_codigo"] as const) {
    if (v[c].trim()) corpo[c] = v[c];
  }
  return corpo;
}

/**
 * Traz as fotos do carro escolhido para o rascunho recém-criado — copiadas do
 * nosso bucket ou baixadas do carro57 da loja, pelo servidor. Devolve o resumo
 * para a tela quando alguma não veio; `null` quando tudo veio.
 */
async function copiarFotos(id: string, estoqueId: number): Promise<string | null> {
  const semFotos = "Rascunho criado, mas as fotos do estoque não vieram. Envie as fotos pelo editor.";
  try {
    const res = await fetch(`/api/repasses/${id}/fotos-do-estoque`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estoqueId }),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<RespostaDaCopia> & { error?: string };
    if (!res.ok) return data.error ? `${semFotos} (${data.error})` : semFotos;
    const falharam = data.falharam ?? 0;
    if (falharam === 0) return null;
    return resumoDaCopia({ copiadas: data.copiadas ?? 0, baixadas: data.baixadas ?? 0, falharam });
  } catch {
    return semFotos;
  }
}

/**
 * O primeiro passo do cadastro: os cinco campos que o banco exige, para o
 * carro ganhar id — e com ele a pasta das fotos. O resto vem no editor.
 *
 * "Buscar no estoque" (dono, 28/09 e 01/10): o carro que já está cadastrado
 * no site empresta os dados — tudo editável, menos o preço, que não vem. As
 * fotos são COPIADAS para a pasta do repasse depois de o rascunho nascer
 * (`/api/repasses/[id]/fotos-do-estoque`), as do carro57 da loja inclusive,
 * que o servidor baixa; nada liga o repasse ao carro de origem. A busca é no
 * servidor (`?q=`), que casa a placa inteira sem devolvê-la.
 */
export default function NovoRepasse() {
  const router = useRouter();
  const [valores, setValores] = useState<Valores>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultado, setResultado] = useState<{ termo: string; veiculos: CarroDoEstoqueParaORepasse[]; falhou: boolean } | null>(null);
  const [escolhido, setEscolhido] = useState<CarroDoEstoqueParaORepasse | null>(null);
  const [criado, setCriado] = useState<{ editor: string; aviso: string } | null>(null);

  const termo = busca.trim();
  useEffect(() => {
    if (termo.length < MINIMO_DA_BUSCA) return;
    let vivo = true;
    // Espera a pessoa parar de digitar: uma ida ao banco por termo, não por tecla.
    const espera = setTimeout(() => {
      fetch(`/api/repasses/estoque?q=${encodeURIComponent(termo)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { veiculos?: CarroDoEstoqueParaORepasse[] } | null) => {
          if (vivo) setResultado({ termo, veiculos: Array.isArray(j?.veiculos) ? j.veiculos : [], falhou: j === null });
        })
        .catch(() => {
          if (vivo) setResultado({ termo, veiculos: [], falhou: true });
        });
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [termo]);
  const respondido = termo.length >= MINIMO_DA_BUSCA && resultado?.termo === termo ? resultado : null;

  function usarCarro(c: CarroDoEstoqueParaORepasse) {
    setEscolhido(c);
    setBusca("");
    // O preço fica como está: ele não vem do estoque.
    setValores((v) => ({
      ...v,
      marca: c.marca ?? "",
      modelo: c.modelo ?? "",
      versao: c.versao ?? "",
      ano_modelo: numero(c.ano),
      quilometragem: numero(c.quilometragem),
      ano_fabricacao: numero(c.ano_fabricacao),
      cambio: c.cambio ?? "",
      combustivel: c.combustivel ?? "",
      cor: c.cor ?? "",
      carroceria: c.carroceria ?? "",
      fipe_codigo: c.codigo_fipe ?? "",
    }));
  }

  function limpar() {
    setEscolhido(null);
    setBusca("");
    setValores(VAZIO);
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/repasses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoDoRascunho(valores)),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setErro(data.error || "Não deu para criar o rascunho.");
        return;
      }
      // Direto ao editor, e não à visão: o rascunho acabou de nascer com o
      // básico, e o resto (fotos, FIPE, ficha) se preenche lá.
      const editor = caminhoDoEditorNoPainel(data.id);
      if (escolhido && escolhido.fotosCopiaveis > 0) {
        const aviso = await copiarFotos(data.id, escolhido.id);
        // O rascunho já existe: a tela diz o que faltou e leva ao editor, sem
        // o botão de criar — clicar de novo faria um segundo rascunho.
        if (aviso) {
          setCriado({ editor, aviso });
          return;
        }
      }
      router.push(editor);
    } catch {
      setErro("Não deu para criar o rascunho. Confira a conexão.");
    } finally {
      setEnviando(false);
    }
  }

  if (criado) {
    return (
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <h1 className="mt-titulo text-2xl md:text-3xl">Novo carro de repasse</h1>
        <p role="status" className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2 text-xs text-mt-accent-800">
          {criado.aviso}
        </p>
        <Link href={criado.editor} className="mt-btn mt-btn-primario mt-foco self-start px-5 py-2.5 text-[11px] no-underline">
          Abrir o rascunho
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={criar} className="flex w-full max-w-3xl flex-col gap-6">
      <div className="border-b-2 border-mt-regua pb-5">
        <Link href="/admin/repasse" className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 no-underline hover:text-mt-accent">
          ← REPASSE
        </Link>
        <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">Novo carro de repasse</h1>
        <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-mt-neutral-800">
          Comece pelo básico. Fotos, FIPE, laudo, histórico e a ficha de estado vêm na tela seguinte.
        </p>
      </div>

      <div className="border border-mt-regua-fina bg-mt-bg p-4">
        <label className="flex flex-col gap-1.5">
          <span className={rotulo}>Buscar no estoque</span>
          <input
            type="search"
            className="mt-campo-caixa mt-foco"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            // A busca mora dentro do formulário, e Enter num campo envia o
            // formulário (revisão de 01/10): com um carro já escolhido e o
            // preço digitado, buscar outro e teclar Enter criava o rascunho do
            // carro ANTERIOR e copiava as fotos dele. Aqui Enter só busca.
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="Marca, modelo, código ou placa inteira"
            autoComplete="off"
          />
        </label>
        {respondido && respondido.veiculos.length > 0 && (
          <ul className="mt-2 flex list-none flex-col border border-mt-regua-fina bg-mt-surface p-0">
            {respondido.veiculos.map((c) => (
              <li key={c.id} className="border-b border-mt-regua-fina last:border-0">
                <button
                  type="button"
                  onClick={() => usarCarro(c)}
                  className="mt-foco flex w-full items-center gap-3 p-2.5 text-left text-[12px] hover:bg-mt-bg"
                >
                  {c.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura de lista do painel; a foto pode ser do carro57
                    <img src={c.foto} alt="" width={64} height={43} loading="lazy" className="h-[43px] w-16 shrink-0 object-cover" />
                  ) : (
                    <span className="h-[43px] w-16 shrink-0 bg-mt-regua-fina" aria-hidden />
                  )}
                  <span className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="font-semibold text-mt-ink">{[c.marca, c.modelo, c.versao].filter(Boolean).join(" ")}</span>
                    <span className="text-mt-neutral-700">{c.ano ?? "—"}</span>
                    <span className="text-mt-neutral-700">#{c.id}</span>
                    <span className="text-mt-neutral-600">{c.quilometragem?.toLocaleString("pt-BR") ?? "—"} km</span>
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700">
                      {NOME_DA_SITUACAO_NO_ESTOQUE[c.situacao]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {respondido && respondido.veiculos.length === 0 && (
          <p className="mt-2 text-[12px] text-mt-neutral-700">
            {respondido.falhou ? "Não deu para buscar no estoque. Preencha à mão." : "Nenhum carro do estoque com isso. Preencha à mão."}
          </p>
        )}
        {escolhido && (
          <div className="mt-3 flex flex-col gap-1 text-[12px] text-mt-neutral-800">
            <p>
              Do estoque: <strong>#{escolhido.id}</strong> · {NOME_DA_SITUACAO_NO_ESTOQUE[escolhido.situacao]}
            </p>
            <p>{avisoDasFotos(escolhido)}</p>
            <p>O preço não vem do estoque: informe o do repasse.</p>
            <button type="button" onClick={limpar} className="mt-btn mt-btn-contorno mt-foco mt-1 self-start px-3 py-1.5 text-[11px]">
              Limpar
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {CAMPOS.map((c) => (
          <label key={c.nome} className="flex flex-col gap-1.5">
            <span className={rotulo}>{c.rotulo}</span>
            <input
              name={c.nome}
              type={c.tipo}
              required={(OBRIGATORIOS_PARA_CRIAR as readonly string[]).includes(c.nome)}
              className="mt-campo-caixa mt-foco"
              value={valores[c.nome]}
              onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
            />
          </label>
        ))}
        {escolhido && (
          <>
            {CAMPOS_DO_ESTOQUE.map((c) => (
              <label key={c.nome} className="flex flex-col gap-1.5">
                <span className={rotulo}>{c.rotulo}</span>
                <input
                  name={c.nome}
                  type={c.tipo}
                  className="mt-campo-caixa mt-foco"
                  value={valores[c.nome]}
                  onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
                />
              </label>
            ))}
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Carroceria</span>
              <select
                name="carroceria"
                className="mt-campo-caixa mt-foco"
                value={valores.carroceria}
                onChange={(e) => setValores((v) => ({ ...v, carroceria: e.target.value }))}
              >
                <option value="">Escolha</option>
                {CARROCERIAS_DO_REPASSE.map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_DA_CARROCERIA[c]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {erro && <p role="alert" className="text-xs text-mt-accent-800">{erro}</p>}
      <button type="submit" disabled={enviando} className="mt-btn mt-btn-primario mt-foco self-start px-5 py-2.5 text-[11px]">
        {enviando ? "Criando…" : "Criar rascunho"}
      </button>
    </form>
  );
}
