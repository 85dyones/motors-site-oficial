"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  DURACAO_ATENDIMENTO_MS,
  TETO_VOLUME,
  faixaVigente,
  horaDeMinutos,
  limitarVolume,
  minutosDeHora,
  type DiasDaFaixa,
  type FaixaHoraria,
  type GradeMusica,
} from "../../lib/musicaGrade";
import { VOLUME_ATENDIMENTO, type EstadoMusica } from "../../lib/musicaShowroom";

/**
 * Tela A18 do design doc do admin — música do showroom.
 *
 * O que esta tela é: a grade por horário (qual playlist e qual volume valem em
 * cada faixa do dia), o estado da conexão e a lista de dispositivos.
 *
 * ── Onde ela diverge do desenho, e por quê ──────────────────────────────────
 *
 * O doc traz quatro "regras fixas". Três viraram código; uma não pode.
 *
 * 1. **Teto de volume 70%** — implementada. A trava está em `limitarVolume`,
 *    aplicada no servidor (`executar`) e na normalização do que vem do banco,
 *    não só neste formulário.
 * 2. **Abaixa para 20% na chamada, volta em 90 s** — implementada, com a volta
 *    verificada a cada leitura de estado em vez de `setTimeout` (ver
 *    `encerrarAtendimentoVencido`).
 * 3. **Conteúdo explícito bloqueado** — é uma trava da CONTA do Spotify, não
 *    do site. A API deixa ler (`GET /me`, campo `explicit_content`), nunca
 *    escrever. Aparece aqui como leitura, com o caminho para mudar; um
 *    interruptor nesta tela prometeria um controle que não existe.
 * 4. **Queda de internet: playlist local** — NÃO implementável. O Web Playback
 *    SDK não toca offline: download de faixa é recurso do app nativo do
 *    Spotify, e um player de navegador precisa de rede. A linha está na tabela
 *    marcada como indisponível em vez de sumir — quem desenhou a regra
 *    merece ver por que ela não subiu.
 *
 * O segmentado Conexão / Grade / Dispositivos do doc está aqui como âncoras da
 * mesma página: são três blocos curtos, e três telas para eles custariam mais
 * clique do que informação.
 */

const DIAS_ROTULO: Record<DiasDaFaixa, string> = {
  semana: "Seg a sex",
  sabado: "Sábado",
  todos: "Qualquer dia",
};

type Props = {
  gradeInicial: GradeMusica;
};

function novaFaixa(): FaixaHoraria {
  return {
    id: `faixa-${Date.now()}`,
    inicioMin: 9 * 60,
    fimMin: 12 * 60,
    dias: "semana",
    playlistUri: "",
    playlistNome: "",
    volume: 55,
    sobDemanda: false,
  };
}

export default function MusicaShowroom({ gradeInicial }: Props) {
  const [grade, setGrade] = useState<GradeMusica>(gradeInicial);
  const [salvo, setSalvo] = useState<GradeMusica>(gradeInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [estado, setEstado] = useState<EstadoMusica | null>(null);

  const sujo = JSON.stringify(grade) !== JSON.stringify(salvo);

  /**
   * Relógio da tela, em baldes de 30 s.
   *
   * `useSyncExternalStore` e não `useState` + efeito: o horário é estado
   * externo ao React, e ler o relógio na renderização do servidor daria um
   * instante que não é o de quem está olhando. O snapshot é o número do balde
   * — estável entre um tick e outro, que é o que este hook exige — e o
   * servidor devolve `0`, marcando "ainda não sei que horas são".
   */
  const balde = useSyncExternalStore(
    (aoMudar) => {
      const t = setInterval(aoMudar, 30_000);
      return () => clearInterval(t);
    },
    () => Math.floor(Date.now() / 30_000),
    () => 0,
  );
  const agora = balde === 0 ? null : new Date();

  useEffect(() => {
    let vivo = true;
    const buscar = async () => {
      try {
        const r = await fetch("/api/musica", { cache: "no-store" });
        if (!r.ok || !vivo) return;
        setEstado((await r.json()) as EstadoMusica);
      } catch {
        // Painel de configuração: um poll perdido não muda nada na tela.
      }
    };
    void buscar();
    const t = setInterval(buscar, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!sujo) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sujo]);

  const vigente = agora ? faixaVigente(grade, agora) : null;

  const alterar = (id: string, campo: Partial<FaixaHoraria>) =>
    setGrade((g) => ({
      ...g,
      faixas: g.faixas.map((f) => (f.id === id ? { ...f, ...campo } : f)),
    }));

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ musicaGrade: grade }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar a grade");
      setSalvo(grade);
      setAviso("Grade salva — a TV passa a seguir os novos horários.");
      setTimeout(() => setAviso(""), 4000);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const conectado = estado?.configurado === true;

  const cartoes = [
    {
      l: "CONTA",
      v: conectado ? "Spotify Premium" : "não conectada",
      s: conectado
        ? "credenciais presentes neste ambiente"
        : "faltam SPOTIFY_CLIENT_ID, SECRET e REFRESH_TOKEN",
      alerta: !conectado,
    },
    {
      l: "DISPOSITIVO ATIVO",
      v: estado?.dispositivo ?? "nenhum",
      s: estado?.dispositivo
        ? "recebe os comandos do balcão"
        : "abra o Spotify na TV ou na caixa e dê play uma vez",
      alerta: conectado && !estado?.dispositivo,
    },
    {
      l: "TOCANDO",
      v: estado?.faixa?.nome ?? "—",
      s: estado?.faixa ? estado.faixa.artista : "nada em reprodução",
      alerta: false,
    },
    {
      l: "FAIXA DA GRADE",
      v: vigente ? vigente.playlistNome || "sem nome" : grade.ativa ? "fora de horário" : "grade desligada",
      s: vigente
        ? `${horaDeMinutos(vigente.inicioMin)}–${horaDeMinutos(vigente.fimMin)} · ${vigente.volume}%`
        : "nenhuma faixa cobre este instante",
      alerta: false,
    },
  ];

  const regras = [
    {
      t: `Teto de volume ${TETO_VOLUME}%`,
      d: "O painel do balcão não passa disso. A trava está no servidor, não só no formulário.",
      estado: "ativa" as const,
    },
    {
      t: `Abaixa para ${VOLUME_ATENDIMENTO}% na chamada`,
      d:
        estado?.voltaAutomaticaConfiavel === false
          ? `O volume cai quando o cliente toca em CHAMAR CONSULTOR, mas a volta automática em ${
              DURACAO_ATENDIMENTO_MS / 1000
            } s não é confiável neste ambiente: o abaixamento é lembrado na memória do processo, e em serverless o pedido que restauraria cai noutra instância. Configure UPSTASH_REDIS_REST_URL e _TOKEN. Enquanto isso, o botão RESTAURAR do painel do balcão resolve à mão.`
          : `Quando o cliente toca em CHAMAR CONSULTOR o volume cai e volta sozinho em ${
              DURACAO_ATENDIMENTO_MS / 1000
            } s.`,
      estado: (estado?.voltaAutomaticaConfiavel === false ? "parcial" : "ativa") as
        | "ativa"
        | "parcial",
    },
    {
      t: "Conteúdo explícito bloqueado",
      d: "É trava da conta do Spotify, não do site. A API deixa ler, nunca escrever — mude em Configurações → Conteúdo explícito, no app do Spotify.",
      estado: "conta" as const,
    },
    {
      t: "Queda de internet: playlist local",
      d: "Não sobe: o Web Playback SDK não toca offline. Download de faixa é recurso do app nativo do Spotify; um player de navegador precisa de rede. Para ter som sem internet, a saída é uma fonte local fora do Spotify.",
      estado: "indisponivel" as const,
    },
  ];

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* ─── Cabeçalho ─── */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-mt-regua pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="mt-rotulo mt-rotulo-accent">Site</div>
          <h1 className="mt-titulo text-3xl md:text-4xl">Música do showroom</h1>
          <p className="mt-1 max-w-[660px] text-sm text-mt-neutral-800">
            A troca de playlist é por hora do dia, não por veículo na tela —
            amarrar música a carro dá sensação de comercial e o cliente percebe.
            O tablet do balcão manda os comandos; quem reproduz é a TV.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={grade.ativa}
              onChange={(e) => setGrade((g) => ({ ...g, ativa: e.target.checked }))}
            />
            Grade ativa
          </label>
          <button
            type="button"
            onClick={salvar}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-primario mt-foco h-11 px-5 text-xs"
          >
            {salvando ? "SALVANDO…" : "SALVAR GRADE"}
          </button>
        </div>
      </div>

      {aviso && (
        <div role="status" className="border-l-4 border-mt-accent bg-mt-accent-100 px-4 py-3 text-sm">
          {aviso}
        </div>
      )}
      {erro && (
        <div role="alert" className="border-l-4 border-mt-accent bg-mt-accent-100 px-4 py-3 text-sm">
          {erro}
        </div>
      )}

      {/* ─── Estado da conexão ─── */}
      <div className="flex flex-wrap gap-6 border-t-2 border-mt-regua pt-5">
        {cartoes.map((c) => (
          <div
            key={c.l}
            className="min-w-[200px] flex-1 border-r border-mt-neutral-300 pr-5 last:border-r-0"
          >
            <div className="mt-rotulo">{c.l}</div>
            <div
              className={`mt-2 truncate text-2xl font-extrabold tracking-[-.025em] ${
                c.alerta ? "text-mt-accent-800" : "text-mt-ink"
              }`}
            >
              {c.v}
            </div>
            <div className="mt-1.5 text-xs leading-snug text-mt-neutral-700">{c.s}</div>
          </div>
        ))}
      </div>

      {/* ─── Grade por horário ─── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b-2 border-mt-regua pb-2.5">
          <span className="mt-rotulo">GRADE POR HORÁRIO</span>
          <button
            type="button"
            onClick={() => setGrade((g) => ({ ...g, faixas: [...g.faixas, novaFaixa()] }))}
            className="mt-btn mt-btn-contorno mt-foco h-9 px-4 text-[11px]"
          >
            ADICIONAR FAIXA
          </button>
        </div>

        {grade.faixas.length === 0 ? (
          <p className="m-0 py-6 text-sm text-mt-neutral-700">
            Nenhuma faixa na grade. Sem grade, a TV não troca de playlist sozinha
            — o balcão continua comandando à mão.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-tabela w-full min-w-[840px]">
              <thead>
                <tr>
                  <th>Horário</th>
                  <th>Dias</th>
                  <th>Playlist</th>
                  <th>Volume</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grade.faixas.map((f) => {
                  const ativa = vigente?.id === f.id;
                  return (
                    <tr key={f.id} className={ativa ? "bg-mt-accent-100" : undefined}>
                      <td>
                        {f.sobDemanda ? (
                          <span className="text-sm font-extrabold">Sob demanda</span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <input
                              type="time"
                              value={horaDeMinutos(f.inicioMin)}
                              onChange={(e) => {
                                const m = minutosDeHora(e.target.value);
                                if (m !== null) alterar(f.id, { inicioMin: m });
                              }}
                              aria-label="Início"
                              className="mt-campo-caixa w-[104px] text-sm"
                            />
                            <span className="text-mt-neutral-600">–</span>
                            <input
                              type="time"
                              value={horaDeMinutos(f.fimMin)}
                              onChange={(e) => {
                                const m = minutosDeHora(e.target.value);
                                if (m !== null) alterar(f.id, { fimMin: m });
                              }}
                              aria-label="Fim"
                              className="mt-campo-caixa w-[104px] text-sm"
                            />
                          </span>
                        )}
                        {/* Intervalo invertido não some sozinho: a
                            normalização descarta a linha ao recarregar, e
                            descartar em silêncio é pior do que avisar. */}
                        {!f.sobDemanda && f.fimMin <= f.inicioMin && (
                          <div className="mt-1 text-[11px] font-semibold text-mt-accent-800">
                            O fim tem que ser depois do início — esta linha não vale.
                          </div>
                        )}
                      </td>
                      <td>
                        <select
                          value={f.dias}
                          onChange={(e) => alterar(f.id, { dias: e.target.value as DiasDaFaixa })}
                          aria-label="Dias"
                          className="mt-campo-caixa text-sm"
                          disabled={f.sobDemanda}
                        >
                          {(Object.keys(DIAS_ROTULO) as DiasDaFaixa[]).map((d) => (
                            <option key={d} value={d}>
                              {DIAS_ROTULO[d]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={f.playlistUri}
                          onChange={(e) => {
                            const p = estado?.playlists.find((x) => x.uri === e.target.value);
                            alterar(f.id, {
                              playlistUri: e.target.value,
                              playlistNome: p?.nome ?? "",
                            });
                          }}
                          aria-label="Playlist"
                          className="mt-campo-caixa w-full min-w-[180px] text-sm"
                        >
                          <option value="">— sem playlist —</option>
                          {/* A playlist salva pode não estar entre as que a
                              conta devolve agora (renomeada, removida, ou o
                              Spotify simplesmente fora do ar). Ela continua
                              na lista para não ser apagada por um select que
                              não a encontrou. */}
                          {f.playlistUri &&
                            !estado?.playlists.some((p) => p.uri === f.playlistUri) && (
                              <option value={f.playlistUri}>
                                {f.playlistNome || f.playlistUri} (fora da conta)
                              </option>
                            )}
                          {estado?.playlists.map((p) => (
                            <option key={p.uri} value={p.uri}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={TETO_VOLUME}
                            value={f.volume}
                            onChange={(e) =>
                              alterar(f.id, { volume: limitarVolume(Number(e.target.value)) })
                            }
                            aria-label="Volume"
                            className="mt-campo-caixa w-[72px] text-sm"
                          />
                          <span className="text-xs text-mt-neutral-600">%</span>
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            setGrade((g) => ({
                              ...g,
                              faixas: g.faixas.filter((x) => x.id !== f.id),
                            }))
                          }
                          className="mt-foco cursor-pointer text-xs font-extrabold tracking-[.1em] text-mt-accent-800"
                        >
                          REMOVER
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {conectado && estado?.playlists.length === 0 && (
          <p className="m-0 text-xs text-mt-neutral-700">
            A conta conectada não devolveu playlists — sem elas o seletor fica
            vazio. Crie as playlists na conta da loja.
          </p>
        )}
      </div>

      {/* ─── Regras fixas ─── */}
      <div className="flex flex-col gap-3">
        <div className="mt-rotulo border-b-2 border-mt-regua pb-2.5">REGRAS FIXAS</div>
        <div className="grid gap-0 md:grid-cols-2">
          {regras.map((r) => (
            <div key={r.t} className="border-b border-mt-neutral-300 py-3.5 pr-6">
              <div className="flex items-baseline gap-2.5">
                <span className="text-sm font-extrabold tracking-[-.01em]">{r.t}</span>
                <span
                  className={`mt-etiqueta flex-none text-[9px] ${
                    r.estado === "ativa"
                      ? "border border-mt-regua text-mt-neutral-700"
                      : r.estado === "conta"
                        ? "border border-mt-regua-fina text-mt-neutral-700"
                        : "bg-mt-accent text-mt-inverso"
                  }`}
                >
                  {r.estado === "ativa"
                    ? "ATIVA"
                    : r.estado === "conta"
                      ? "NA CONTA"
                      : r.estado === "parcial"
                        ? "PARCIAL"
                        : "NÃO DISPONÍVEL"}
                </span>
              </div>
              <div className="mt-1.5 text-xs leading-relaxed text-mt-neutral-800">{r.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Dispositivos ─── */}
      <div className="flex flex-col gap-3">
        <div className="mt-rotulo border-b-2 border-mt-regua pb-2.5">DISPOSITIVOS</div>
        {/* O doc lista os aparelhos com "última atividade". A Web API devolve
            os aparelhos (`GET /me/player/devices`) mas **não guarda
            histórico** — e não há tabela nossa registrando isso. Em vez de
            imprimir "há 2 min" inventado, a coluna diz o estado de agora. */}
        {estado && estado.dispositivos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="mt-tabela w-full min-w-[560px]">
              <thead>
                <tr>
                  <th>Dispositivo</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {estado.dispositivos.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className="flex items-center gap-2.5 font-extrabold">
                        <span
                          className={`h-[7px] w-[7px] flex-none ${
                            d.ativo && estado.tocando
                              ? "mt-pulso bg-mt-accent"
                              : d.ativo
                                ? "bg-mt-accent"
                                : "bg-mt-neutral-500"
                          }`}
                          aria-hidden="true"
                        />
                        {d.nome}
                      </span>
                    </td>
                    <td className="text-mt-neutral-800">{d.tipo}</td>
                    <td>
                      <span className="mt-etiqueta border border-mt-regua text-[9px] text-mt-neutral-700">
                        {d.restrito
                          ? "RESTRITO"
                          : d.ativo
                            ? estado.tocando
                              ? "TOCANDO"
                              : "ATIVO, PAUSADO"
                            : "DISPONÍVEL"}
                      </span>
                    </td>
                    <td>{d.volume !== null ? `${d.volume}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 py-3 text-sm text-mt-neutral-700">
            Nenhum aparelho visível agora. O Spotify Connect só enxerga
            dispositivos com o app aberto — abra na TV ou na caixa de som da
            loja.
          </p>
        )}
      </div>
    </div>
  );
}
