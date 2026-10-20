"use client";

import { useEffect, useState } from "react";
import {
  ESCOLHAS_DA_TELA,
  ROTULO_DA_ESCOLHA,
  fraseDoResultado,
  linhaDasCamadas,
  type CamadaClassificada,
  type FotoNaTela,
  type ResultadoNaTela,
  type SituacaoDasFotos,
} from "../../../lib/fotosDoAtendimento";
import { Segmentado } from "../SegmentadoDoPainel";

/**
 * Leads → Atendimento IA → Fotos (2026-10-20).
 *
 * O modelo de visão separa as fotos de cada carro em camadas — fora,
 * interior, detalhes da versão, rodas, motor, porta-malas — e o assistente
 * mostra ao cliente uma camada de cada vez. Aqui o dono e o gestor veem como
 * ficou, corrigem a foto que caiu na camada errada (ou que não deve ir ao
 * cliente) e mandam classificar agora, sem esperar a rodada.
 *
 * A correção à mão fica com o nome de quem fez, e o modelo não a desfaz.
 */

interface CarroNaLista {
  id: string;
  nome: string;
  situacao: SituacaoDasFotos;
}

interface RespostaDaLista {
  carros: CarroNaLista[];
  resumo?: { carros: number; separados: number; semFoto: number; fotosNaFila: number };
  visao?: boolean;
  migracaoPendente?: boolean;
  aviso?: string;
}

interface RespostaDoCarro {
  carro: { id: string; nome: string };
  fotos: FotoNaTela[];
  situacao: SituacaoDasFotos;
}

type Filtro = "fila" | "todos";

const FAIXA_DE_ERRO = "border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800";
const FAIXA_DE_AVISO = "border-l-[3px] border-mt-regua bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800";
const CAMPO = "mt-foco border border-mt-regua bg-mt-surface px-2 py-1.5 text-[12px] text-mt-ink";

async function lerJson<T>(resposta: Response): Promise<T & { error?: string }> {
  return (await resposta.json().catch(() => ({}))) as T & { error?: string };
}

export default function FotosDoEstoque() {
  const [lista, setLista] = useState<RespostaDaLista | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("fila");
  const [aberto, setAberto] = useState<string | null>(null);
  const [classificando, setClassificando] = useState(false);
  const [resultado, setResultado] = useState("");
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch("/api/atendimento/fotos/estoque", { cache: "no-store" })
      .then(async (r) => {
        const corpo = await lerJson<RespostaDaLista>(r);
        if (!vivo) return;
        if (!r.ok) {
          setErro(corpo.error ?? "Não deu para ler as fotos do estoque.");
          return;
        }
        setErro("");
        setLista(corpo);
      })
      .catch(() => {
        if (vivo) setErro("Não deu para ler as fotos do estoque.");
      });
    return () => {
      vivo = false;
    };
  }, [versao]);

  async function classificarFila() {
    setClassificando(true);
    setResultado("");
    try {
      const r = await fetch("/api/atendimento/fotos/estoque", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const corpo = await lerJson<ResultadoNaTela>(r);
      setResultado(corpo.error ? `Não classificou: ${corpo.error}.` : fraseDoResultado(corpo));
      setVersao((v) => v + 1);
    } catch {
      setResultado("Não classificou: sem resposta do servidor.");
    } finally {
      setClassificando(false);
    }
  }

  if (lista?.migracaoPendente) return <div className={FAIXA_DE_AVISO}>{lista.aviso}</div>;

  const carros = (lista?.carros ?? []).filter((c) => filtro === "todos" || c.situacao.pendentes > 0);
  const resumo = lista?.resumo;

  return (
    <div className="flex flex-col gap-5" data-aba="fotos">
      <p className="m-0 max-w-[760px] text-[13px] leading-relaxed text-mt-neutral-800">
        O assistente mostra o carro em camadas: primeiro as fotos de fora, o interior se o cliente quiser, e os detalhes
        um de cada vez. Quem separa as fotos é o modelo de visão, uma vez por foto. Aqui você confere e corrige — a
        correção vale na próxima conversa e o modelo não a desfaz.
      </p>

      {erro && (
        <div role="alert" className={FAIXA_DE_ERRO}>
          {erro}
        </div>
      )}
      {lista && lista.visao === false && (
        <div className={FAIXA_DE_AVISO}>Falta DEEPSEEK_API_KEY na Vercel: sem ela, nada é classificado e o assistente manda a galeria em ordem.</div>
      )}

      {resumo && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-mt-regua-fina bg-mt-surface px-4 py-3">
          <div className="text-[13px] text-mt-ink" data-resumo>
            <strong>{resumo.separados}</strong> de {resumo.carros} carros com as fotos separadas ·{" "}
            <strong>{resumo.fotosNaFila}</strong> foto(s) na fila
            {resumo.semFoto > 0 && <span className="text-mt-neutral-700"> · {resumo.semFoto} sem foto</span>}
          </div>
          <button
            type="button"
            onClick={() => void classificarFila()}
            disabled={classificando || resumo.fotosNaFila === 0}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {classificando ? "Classificando…" : "Classificar a fila agora"}
          </button>
        </div>
      )}
      {resultado && (
        <div className={FAIXA_DE_AVISO} data-resultado>
          {resultado}
        </div>
      )}

      {lista && (
        <Segmentado
          rotulo="Mostrar"
          opcoes={[
            { valor: "fila" as const, rotulo: "Com foto na fila" },
            { valor: "todos" as const, rotulo: "Todos os carros" },
          ]}
          valor={filtro}
          aoEscolher={setFiltro}
        />
      )}

      {lista && carros.length === 0 && (
        <p className="m-0 text-xs text-mt-neutral-700">
          {filtro === "fila" ? "Nenhuma foto na fila: todo o estoque está separado." : "Nenhum carro à venda agora."}
        </p>
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {carros.map((c) => (
          <li key={c.id} data-carro={c.id} className="border border-mt-regua-fina bg-mt-bg">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-mt-ink">
                  {c.nome} <span className="font-normal text-mt-neutral-600">#{c.id}</span>
                </span>
                <span className="text-[11px] text-mt-neutral-700">
                  {linhaDasCamadas(c.situacao)}
                  {c.situacao.pendentes > 0 && ` · ${c.situacao.pendentes} na fila`}
                  {c.situacao.foraDoEnvio > 0 && ` · ${c.situacao.foraDoEnvio} não vão ao cliente`}
                  {c.situacao.corrigidas > 0 && ` · ${c.situacao.corrigidas} corrigida(s) à mão`}
                </span>
              </div>
              <button
                type="button"
                aria-expanded={aberto === c.id}
                onClick={() => setAberto(aberto === c.id ? null : c.id)}
                className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-1.5 text-[11px]"
              >
                {aberto === c.id ? "Fechar" : "Ver fotos"}
              </button>
            </div>
            {aberto === c.id && <GaleriaDoCarro veiculo={c.id} aoMudar={() => setVersao((v) => v + 1)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function GaleriaDoCarro({ veiculo, aoMudar }: { veiculo: string; aoMudar: () => void }) {
  const [dados, setDados] = useState<RespostaDoCarro | null>(null);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/atendimento/fotos/estoque?veiculo=${encodeURIComponent(veiculo)}`, { cache: "no-store" })
      .then(async (r) => {
        const corpo = await lerJson<RespostaDoCarro>(r);
        if (!vivo) return;
        if (!r.ok) {
          setErro(corpo.error ?? "Não deu para ler as fotos do carro.");
          return;
        }
        setErro("");
        setDados(corpo);
      })
      .catch(() => {
        if (vivo) setErro("Não deu para ler as fotos do carro.");
      });
    return () => {
      vivo = false;
    };
  }, [veiculo, versao]);

  async function classificar(refazer: boolean) {
    setOcupado(true);
    setAviso("");
    try {
      const r = await fetch("/api/atendimento/fotos/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiculo, refazer }),
      });
      const corpo = await lerJson<ResultadoNaTela>(r);
      setAviso(corpo.error ? `Não classificou: ${corpo.error}.` : fraseDoResultado(corpo));
      setVersao((v) => v + 1);
      aoMudar();
    } catch {
      setAviso("Não classificou: sem resposta do servidor.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-mt-regua-fina px-4 py-4">
      {erro && (
        <div role="alert" className={FAIXA_DE_ERRO}>
          {erro}
        </div>
      )}
      {!dados && !erro && <p className="m-0 text-xs text-mt-neutral-600">Lendo as fotos…</p>}
      {dados && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={ocupado || dados.situacao.pendentes === 0}
              onClick={() => void classificar(false)}
              className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Classificar o que falta
            </button>
            <button
              type="button"
              disabled={ocupado || dados.fotos.length === 0}
              onClick={() => void classificar(true)}
              className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refazer a classificação
            </button>
            <span className="text-[11px] text-mt-neutral-700">Refazer mantém as fotos corrigidas à mão.</span>
          </div>
          {aviso && <div className={FAIXA_DE_AVISO}>{aviso}</div>}
          {dados.fotos.length === 0 && <p className="m-0 text-xs text-mt-neutral-700">Este carro não tem foto na galeria.</p>}
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {dados.fotos.map((f) => (
              <FotoDaGaleria key={f.url} veiculo={veiculo} foto={f} aoGravar={aoMudar} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FotoDaGaleria({ veiculo, foto, aoGravar }: { veiculo: string; foto: FotoNaTela; aoGravar: () => void }) {
  const [camada, setCamada] = useState<CamadaClassificada | null>(foto.aproveitavel || foto.camada === null ? foto.camada : "outra");
  const [descricao, setDescricao] = useState(foto.descricao ?? "");
  const [descricaoGravada, setDescricaoGravada] = useState(foto.descricao ?? "");
  const [corrigida, setCorrigida] = useState(foto.corrigida);
  const [estado, setEstado] = useState<"" | "gravando" | "gravado">("");
  const [erro, setErro] = useState("");

  async function gravar(proxima: { camada: CamadaClassificada; descricao: string }) {
    setEstado("gravando");
    setErro("");
    try {
      const r = await fetch("/api/atendimento/fotos/estoque", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiculo, url: foto.url, camada: proxima.camada, descricao: proxima.descricao }),
      });
      const corpo = await lerJson<{ ok?: boolean }>(r);
      if (!r.ok) throw new Error(corpo.error ?? "Não deu para gravar.");
      setCorrigida(true);
      setDescricaoGravada(proxima.descricao);
      setEstado("gravado");
      aoGravar();
    } catch (e) {
      setEstado("");
      setErro(e instanceof Error ? e.message : "Não deu para gravar.");
    }
  }

  const rotulo = `Camada da foto ${foto.posicao + 1}`;
  return (
    <li data-foto={foto.posicao} className="flex flex-col gap-2 border border-mt-regua-fina bg-mt-surface p-2">
      <a href={foto.url} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do painel; a foto pode ser do carro57 */}
        <img src={foto.url} alt={descricao || `Foto ${foto.posicao + 1}`} loading="lazy" className="block aspect-[4/3] w-full object-cover" />
      </a>
      <label className="flex flex-col gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-[.12em] text-mt-neutral-600">
          Foto {foto.posicao + 1}
          {camada === null && " · na fila"}
          {corrigida && " · corrigida à mão"}
          {estado === "gravando" && " · gravando…"}
          {estado === "gravado" && " · gravado"}
        </span>
        <select
          aria-label={rotulo}
          value={camada ?? ""}
          onChange={(e) => {
            const valor = e.target.value as CamadaClassificada;
            setCamada(valor);
            void gravar({ camada: valor, descricao });
          }}
          className={CAMPO}
        >
          {camada === null && (
            <option value="" disabled>
              Ainda não classificada
            </option>
          )}
          {ESCOLHAS_DA_TELA.map((c) => (
            <option key={c} value={c}>
              {ROTULO_DA_ESCOLHA[c]}
            </option>
          ))}
        </select>
      </label>
      <input
        aria-label={`Legenda da foto ${foto.posicao + 1}`}
        value={descricao}
        maxLength={60}
        placeholder="Legenda no WhatsApp"
        disabled={camada === null}
        onChange={(e) => setDescricao(e.target.value)}
        onBlur={() => {
          if (camada !== null && descricao.trim() !== descricaoGravada.trim()) void gravar({ camada, descricao });
        }}
        className={`${CAMPO} disabled:opacity-50`}
      />
      {erro && (
        <span role="alert" className="text-[11px] text-mt-accent-800">
          {erro}
        </span>
      )}
    </li>
  );
}
