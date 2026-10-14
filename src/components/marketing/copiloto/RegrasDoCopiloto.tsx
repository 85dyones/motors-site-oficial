"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RegrasVigentes } from "../../../lib/copilotoDeMidia-servidor";

/**
 * As regras do diagnóstico, numa vigência nova a cada gravação (a vigente não
 * é editada; o histórico fica no banco, com quem e quando).
 *
 * As três listas são o que a loja sabe e o código não: quem são os
 * concorrentes, que cidades ela não atende, que palavras são de quem pesquisa
 * sem comprar. Uma por linha (ou separadas por vírgula).
 */

type Campos = {
  gastoMinimoTermo: string;
  gastoMinimoGrupo: string;
  gastoMinimoCampanha: string;
  ritmoAltoPct: string;
  ritmoBaixoPct: string;
  reducaoVerbaPct: string;
  iqBaixo: string;
  horaDoDiagnostico: string;
  concorrentes: string;
  cidadesFora: string;
  palavrasInformativas: string;
};

const NUMEROS: Array<{ chave: keyof Campos; rotulo: string; ajuda: string; passo: string }> = [
  { chave: "gastoMinimoTermo", rotulo: "Termo sem classe (R$)", ajuda: "Gasto em 7 dias, sem conversão, para propor negativa de termo que não é concorrente, cidade nem informativo.", passo: "0.01" },
  { chave: "gastoMinimoGrupo", rotulo: "Grupo (R$)", ajuda: "Gasto em 7 dias, sem conversão, para propor pausar o grupo.", passo: "0.01" },
  { chave: "gastoMinimoCampanha", rotulo: "Campanha (R$)", ajuda: "Gasto em 7 dias, sem conversão e com a verba inteira gasta, para propor corte de verba.", passo: "0.01" },
  { chave: "ritmoAltoPct", rotulo: "Ritmo alto (%)", ajuda: "Acima disto da verba de 7 dias, a campanha gasta a verba inteira.", passo: "1" },
  { chave: "ritmoBaixoPct", rotulo: "Ritmo baixo (%)", ajuda: "Abaixo disto, a verba está sobrando.", passo: "1" },
  { chave: "reducaoVerbaPct", rotulo: "Corte proposto (%)", ajuda: "Quanto a proposta tira da verba de quem gasta tudo sem converter.", passo: "1" },
  { chave: "iqBaixo", rotulo: "Índice de qualidade baixo", ajuda: "Palavra-chave com nota igual ou abaixo disto vira achado.", passo: "1" },
  { chave: "horaDoDiagnostico", rotulo: "Hora do diagnóstico", ajuda: "Hora da conta a partir da qual o script lê o dia anterior.", passo: "1" },
];

const LISTAS: Array<{ chave: "concorrentes" | "cidadesFora" | "palavrasInformativas"; rotulo: string; ajuda: string }> = [
  { chave: "concorrentes", rotulo: "Concorrentes", ajuda: "Nome de loja que alguém digita para achar outra loja. Vira negativa de frase." },
  { chave: "cidadesFora", rotulo: "Cidades fora da área", ajuda: "Cidade que a loja não atende. Vira negativa de frase." },
  { chave: "palavrasInformativas", rotulo: "Palavras informativas", ajuda: "Quem pesquisa e não compra (emprego, peça, manual…). Vira negativa do termo exato." },
];

const paraCampos = (r: RegrasVigentes): Campos => ({
  gastoMinimoTermo: String(r.parametros.gastoMinimoTermo),
  gastoMinimoGrupo: String(r.parametros.gastoMinimoGrupo),
  gastoMinimoCampanha: String(r.parametros.gastoMinimoCampanha),
  ritmoAltoPct: String(r.parametros.ritmoAltoPct),
  ritmoBaixoPct: String(r.parametros.ritmoBaixoPct),
  reducaoVerbaPct: String(r.parametros.reducaoVerbaPct),
  iqBaixo: String(r.parametros.iqBaixo),
  horaDoDiagnostico: String(r.parametros.horaDoDiagnostico),
  concorrentes: r.parametros.concorrentes.join("\n"),
  cidadesFora: r.parametros.cidadesFora.join("\n"),
  palavrasInformativas: r.parametros.palavrasInformativas.join("\n"),
});

export default function RegrasDoCopiloto({ regras }: { regras: RegrasVigentes }) {
  const router = useRouter();
  const [campos, setCampos] = useState<Campos>(() => paraCampos(regras));
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setAviso(null);
    setErro(null);
    try {
      const corpo = Object.fromEntries(
        Object.entries(campos).map(([k, v]) => [k, LISTAS.some((l) => l.chave === k) ? v : Number(String(v).replace(",", "."))]),
      );
      const res = await fetch("/api/marketing/copiloto/regras", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const r = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErro(r.error || "As regras não foram gravadas.");
        return;
      }
      setAviso("Regras gravadas. Valem a partir do próximo diagnóstico.");
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor. Nada foi gravado.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={(e) => void salvar(e)} className="flex flex-col gap-5" data-regras-do-copiloto>
      <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-700">
        Vigente desde {regras.vigenciaDesde.split("-").reverse().join("/")}
        {regras.criadoPorNome ? `, por ${regras.criadoPorNome}` : ""}. Gravar abre uma vigência nova; a anterior fica no histórico.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {NUMEROS.map((n) => (
          <label key={n.chave} className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-mt-ink">{n.rotulo}</span>
            <input
              type="number"
              inputMode="decimal"
              step={n.passo}
              min="0"
              required
              value={campos[n.chave]}
              onChange={(e) => setCampos((c) => ({ ...c, [n.chave]: e.target.value }))}
              className="mt-campo-caixa mt-foco tabular-nums"
              name={n.chave}
            />
            <span className="text-[11px] leading-snug text-mt-neutral-700">{n.ajuda}</span>
          </label>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {LISTAS.map((l) => (
          <label key={l.chave} className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-mt-ink">{l.rotulo}</span>
            <textarea
              rows={6}
              value={campos[l.chave]}
              onChange={(e) => setCampos((c) => ({ ...c, [l.chave]: e.target.value }))}
              className="mt-campo-caixa mt-foco"
              name={l.chave}
              placeholder="Uma por linha"
            />
            <span className="text-[11px] leading-snug text-mt-neutral-700">{l.ajuda}</span>
          </label>
        ))}
      </div>
      {(aviso || erro) && (
        <p role={erro ? "alert" : "status"} className="m-0 text-xs text-mt-ink">
          {erro ?? aviso}
        </p>
      )}
      <button type="submit" disabled={salvando} className="mt-btn mt-btn-primario mt-foco cursor-pointer self-start px-5 py-2.5 text-[11px]">
        {salvando ? "Gravando…" : "Gravar regras"}
      </button>
    </form>
  );
}
