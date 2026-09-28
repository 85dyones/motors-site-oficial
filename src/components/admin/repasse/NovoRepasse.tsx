"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { caminhoDoEditorNoPainel } from "../../../lib/painelDoRepasse";

const CAMPOS = [
  { nome: "marca", rotulo: "Marca", tipo: "text" },
  { nome: "modelo", rotulo: "Modelo", tipo: "text" },
  { nome: "versao", rotulo: "Versão", tipo: "text" },
  { nome: "ano_modelo", rotulo: "Ano do modelo", tipo: "number" },
  { nome: "quilometragem", rotulo: "Quilometragem", tipo: "number" },
  { nome: "preco", rotulo: "Preço à vista (R$)", tipo: "number" },
] as const;
type NomeDoCampo = (typeof CAMPOS)[number]["nome"];

/**
 * O primeiro passo do cadastro: os cinco campos que o banco exige, para o
 * carro ganhar id — e com ele a pasta das fotos. O resto vem no editor.
 */
export default function NovoRepasse() {
  const router = useRouter();
  const [valores, setValores] = useState<Record<NomeDoCampo, string>>({
    marca: "",
    modelo: "",
    versao: "",
    ano_modelo: "",
    quilometragem: "",
    preco: "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/repasses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marca: valores.marca,
          modelo: valores.modelo,
          versao: valores.versao || null,
          ano_modelo: Number(valores.ano_modelo),
          quilometragem: Number(valores.quilometragem),
          preco: Number(valores.preco),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setErro(data.error || "Não deu para criar o rascunho.");
        return;
      }
      // Direto ao editor, e não à visão: o rascunho acabou de nascer com o
      // básico, e o resto (fotos, FIPE, ficha) se preenche lá.
      router.push(caminhoDoEditorNoPainel(data.id));
    } catch {
      setErro("Não deu para criar o rascunho. Confira a conexão.");
    } finally {
      setEnviando(false);
    }
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
      <div className="grid gap-4 md:grid-cols-3">
        {CAMPOS.map((c) => (
          <label key={c.nome} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">{c.rotulo}</span>
            <input
              name={c.nome}
              type={c.tipo}
              className="mt-campo-caixa mt-foco"
              value={valores[c.nome]}
              onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      {erro && <p role="alert" className="text-xs text-mt-accent-800">{erro}</p>}
      <button type="submit" disabled={enviando} className="mt-btn mt-btn-primario mt-foco self-start px-5 py-2.5 text-[11px]">
        {enviando ? "Criando…" : "Criar rascunho"}
      </button>
    </form>
  );
}
