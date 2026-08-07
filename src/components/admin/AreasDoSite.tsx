"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AREAS_DA_HOME,
  CONFIG_PADRAO,
  alternarArea,
  moverArea,
  normalizarAreas,
  type ConfigDasAreas,
} from "../../lib/areasDoSite";

/**
 * Tela A3 do design doc — áreas do site.
 *
 * "Cada seção da home como uma linha: ordem, visibilidade e conteúdo no mesmo
 * lugar", e a regra que o doc grifa: "desligar uma seção a remove do site sem
 * apagar o conteúdo". É o que esta tela faz — ela nunca toca no conteúdo, só
 * na ordem e no interruptor.
 *
 * Duas diferenças deliberadas em relação ao desenho:
 *
 * 1. **Setas em vez de arrastar.** O doc mostra alça de arraste. Arrastar
 *    exige biblioteca ou um `dnd` à mão que quebra no toque e no teclado;
 *    duas setas por linha fazem o mesmo trabalho, funcionam no celular e são
 *    acessíveis de graça. Quando houver motivo para o arraste, ele entra por
 *    cima disto sem mudar o formato salvo.
 * 2. **Sem "editado agora" nem miniatura.** O doc traz data de alteração e um
 *    quadrinho de preview por seção; não guardamos histórico por seção nem
 *    geramos thumb da home, e inventar "editado ontem" seria mentira na tela.
 *
 * O segmentado Home / Catálogo / PDP / Sobre do doc aparece com as três
 * últimas desabilitadas: só a home tem catálogo de áreas hoje.
 */

interface AreasDoSiteProps {
  configInicial: ConfigDasAreas;
}

const CLASSE_DA_TAG: Record<string, string> = {
  DINÂMICO: "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800",
  SISTEMA: "border border-mt-regua text-mt-neutral-700",
  ESTOQUE: "border border-mt-regua-fina text-mt-neutral-800",
  FERRAMENTA: "border border-mt-regua-fina text-mt-neutral-800",
  CURADO: "border border-mt-regua-fina text-mt-neutral-800",
  WIDGET: "border border-mt-regua text-mt-neutral-700",
};

export default function AreasDoSite({ configInicial }: AreasDoSiteProps) {
  const [config, setConfig] = useState<ConfigDasAreas>(configInicial);
  const [salvo, setSalvo] = useState<ConfigDasAreas>(configInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const sujo = JSON.stringify(config) !== JSON.stringify(salvo);

  // Avisa antes de sair com alteração não publicada — o doc põe "alteração
  // não publicada" na barra de topo, e perder a reordenação por um clique no
  // menu seria irritante de repetir.
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);

  const porId = new Map(AREAS_DA_HOME.map((a) => [a.id, a]));
  const linhas = config.ordem.map((id) => porId.get(id)).filter(Boolean) as typeof AREAS_DA_HOME;

  const publicar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areasHome: config }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao publicar as áreas");
      setSalvo(config);
      setAviso("Publicado — a home já reflete a nova ordem.");
      setTimeout(() => setAviso(""), 4000);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const ocultas = config.ocultas.length;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Site</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">
            Home — {linhas.length} seções
          </h1>
          <p className="mt-1 max-w-[620px] text-sm text-mt-neutral-800">
            Use as setas para reordenar. Desligar uma seção a remove do site sem apagar o
            conteúdo — o texto e as fotos continuam salvos, prontos para voltar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="mt-seg">
            <label className="mt-seg-opt">
              <input type="radio" name="pagina-areas" defaultChecked readOnly />
              <span>Home</span>
            </label>
            {["Catálogo", "PDP", "Sobre"].map((p) => (
              <span
                key={p}
                className="mt-seg-opt cursor-not-allowed opacity-45"
                title="Ainda sem catálogo de áreas — só a home é editável por aqui"
              >
                {p}
              </span>
            ))}
          </div>
          {sujo && (
            <span className="text-[11px] font-semibold text-mt-accent-800">
              Alteração não publicada
            </span>
          )}
          <button
            onClick={() => setConfig(salvo)}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:opacity-45"
          >
            Descartar
          </button>
          <button
            onClick={publicar}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[11px] disabled:opacity-45"
          >
            {salvando ? "Publicando…" : "Publicar alterações"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          {aviso}
        </div>
      )}

      {/* Lista de seções */}
      <div className="border-t-2 border-mt-regua">
        {linhas.map((area, i) => {
          const oculta = config.ocultas.includes(area.id);
          return (
            <div
              key={area.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-mt-regua-fina py-3.5"
            >
              {/* Reordenar */}
              <div className="flex flex-none flex-col">
                <button
                  onClick={() => setConfig(moverArea(config, area.id, "cima"))}
                  disabled={i === 0}
                  aria-label={`Mover ${area.nome} para cima`}
                  className="mt-foco cursor-pointer px-1 text-mt-neutral-600 hover:text-mt-accent disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => setConfig(moverArea(config, area.id, "baixo"))}
                  disabled={i === linhas.length - 1}
                  aria-label={`Mover ${area.nome} para baixo`}
                  className="mt-foco cursor-pointer px-1 text-mt-neutral-600 hover:text-mt-accent disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              <span className="w-6 flex-none text-[11px] font-extrabold tabular-nums text-mt-neutral-600">
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="min-w-[220px] flex-1">
                <div
                  className={`text-[15px] font-extrabold tracking-[-.01em] ${
                    oculta ? "text-mt-neutral-500" : "text-mt-ink"
                  }`}
                >
                  {area.nome}
                </div>
                <div className="mt-0.5 text-xs text-mt-neutral-700">{area.descricao}</div>
              </div>

              <span
                className={`flex-none px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  CLASSE_DA_TAG[area.tipo] ?? "border border-mt-regua-fina text-mt-neutral-700"
                }`}
              >
                {area.tipo}
              </span>

              <div className="flex flex-none items-center gap-4">
                {area.editarEm ? (
                  <Link
                    href={area.editarEm}
                    className="mt-foco text-[11px] font-extrabold tracking-[.1em] text-mt-ink hover:text-mt-accent"
                  >
                    EDITAR
                  </Link>
                ) : (
                  <span
                    className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-500"
                    title="Seção montada a partir do estoque — não tem conteúdo próprio"
                  >
                    AUTOMÁTICA
                  </span>
                )}

                {/* Interruptor quadrado, como no doc */}
                <div className="flex w-[104px] items-center justify-end gap-2">
                  <span
                    className={`text-[10px] font-semibold tracking-[.1em] ${
                      oculta ? "text-mt-neutral-600" : "text-mt-accent-800"
                    }`}
                  >
                    {area.fixa ? "FIXA" : oculta ? "OCULTA" : "ATIVA"}
                  </span>
                  <button
                    onClick={() => setConfig(alternarArea(config, area.id))}
                    disabled={area.fixa}
                    aria-pressed={!oculta}
                    aria-label={`${oculta ? "Mostrar" : "Ocultar"} ${area.nome}`}
                    title={
                      area.fixa
                        ? "Seção fixa: sem ela o visitante não chega a veículo nenhum"
                        : undefined
                    }
                    className={`mt-foco flex h-5 w-10 flex-none items-center border-2 px-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      oculta
                        ? "justify-start border-mt-regua bg-transparent"
                        : "justify-end border-mt-accent bg-mt-accent"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 ${
                        oculta ? "bg-mt-neutral-500" : "bg-mt-inverso"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-baseline gap-3 text-[11px] text-mt-neutral-700">
        <span>
          {ocultas === 0
            ? "Nenhuma seção desligada."
            : `${ocultas} seção(ões) desligada(s) — o conteúdo continua salvo.`}
        </span>
        <button
          onClick={() => setConfig(CONFIG_PADRAO)}
          className="mt-foco ml-auto cursor-pointer font-semibold text-mt-accent underline underline-offset-2"
        >
          Restaurar ordem de fábrica
        </button>
      </div>

      {/* Nota de escopo — o doc desenha um editor de slides embutido nesta
          tela; o conteúdo continua em suas telas próprias por ora. */}
      <div className="max-w-[720px] border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
        <div className="mt-rotulo mb-2">Onde fica o conteúdo</div>
        <p className="text-xs leading-relaxed text-mt-neutral-800">
          Esta tela controla <strong>ordem e visibilidade</strong>. O conteúdo de cada seção
          abre pelo link EDITAR ao lado dela — os destaques do hero, a curadoria do
          Instagram e os dados de contato seguem nas telas onde já eram editados, agora
          alcançáveis a partir daqui.
        </p>
      </div>
    </div>
  );
}
