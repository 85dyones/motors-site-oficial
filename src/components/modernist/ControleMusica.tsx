"use client";

import { useRef } from "react";
import { VOLUME_ATENDIMENTO, formatarDuracao } from "../../lib/musicaShowroom";
import { Equalizador } from "./FaixaMusica";
import { useMusica } from "./useMusica";

/**
 * Painel de controle da música — tela 08 C do design doc.
 *
 * 480×768, fica no tablet do balcão. Controla o Spotify da loja por Connect: o
 * som sai do aparelho que a loja já usa (a caixa, o celular do balcão), não
 * deste navegador. Por isso é um controle remoto e não um player — e por isso
 * a TV (08 A) consegue mostrar a mesma faixa.
 *
 * A largura de 480px é do desenho; a altura acompanha a tela, porque o tablet
 * do balcão não é necessariamente 768.
 */

const ICONE_PAUSA = "M7 5h3.4v14H7zM13.6 5H17v14h-3.4z";
const ICONE_PLAY = "M7 4l13 8-13 8z";

/** Mensagens dos erros que o player devolve. Cada uma tem uma saída concreta. */
const MENSAGEM_ERRO: Record<string, string> = {
  "sem-dispositivo":
    "Nenhum aparelho Spotify ativo. Abra o Spotify na caixa de som ou no celular da loja e toque play uma vez.",
  "premium-necessario":
    "A conta conectada não é Premium. O controle de playback do Spotify só funciona em conta Premium.",
  "nao-configurado":
    "Spotify não configurado neste ambiente. Ver docs/MUSICA_SHOWROOM.md.",
  falhou: "Não deu para falar com o Spotify. Tente de novo.",
};

export default function ControleMusica({ nomeLoja }: { nomeLoja: string }) {
  const { estado, progressoMs, enviando, erro, comandar } = useMusica();
  const barraVolume = useRef<HTMLDivElement>(null);

  const duracao = estado.faixa?.duracaoMs ?? 0;
  const progresso = duracao > 0 ? Math.min(100, (progressoMs / duracao) * 100) : 0;
  const abaixado = estado.volumeAntesDoAtendimento !== null;

  const ajustarVolume = (clientX: number) => {
    const el = barraVolume.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const valor = Math.max(0, Math.min(100, Math.round(((clientX - r.left) / r.width) * 100)));
    void comandar({ acao: "volume", valor });
  };

  return (
    <div className="flex min-h-screen justify-center bg-mt-neutral-300 font-modernist">
      <div className="flex h-screen w-full max-w-[480px] flex-col overflow-hidden bg-[#141212] text-mt-inverso">
        {/* ─── Cabeçalho ─── */}
        <div className="flex h-[66px] flex-none items-center gap-3 border-b-2 border-mt-inverso-regua px-6">
          <svg viewBox="0 0 24 24" className="h-5 w-5 flex-none fill-mt-spotify" aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.8.8 0 0 1-1.1.3c-3-1.9-6.9-2.3-11.4-1.2a.8.8 0 1 1-.4-1.5c4.9-1.2 9.2-.7 12.6 1.4.4.2.5.7.3 1Zm1.2-3a1 1 0 0 1-1.3.3c-3.5-2.1-8.7-2.8-12.8-1.5a1 1 0 1 1-.6-1.9c4.7-1.4 10.5-.7 14.5 1.8.4.3.6.9.2 1.3Zm.1-3.1C13.7 7.8 7 7.6 3.9 8.6a1.2 1.2 0 0 1-.7-2.3C6.9 5.1 14.3 5.4 18.9 8a1.2 1.2 0 1 1-1 2.2Z" />
          </svg>
          <span className="text-[13px] font-extrabold tracking-[.14em]">SPOTIFY</span>
          <span className="truncate text-[11px] tracking-[.1em] text-mt-neutral-600">
            {estado.dispositivo ?? nomeLoja}
          </span>
          <span
            className={`ml-auto flex flex-none items-center gap-[7px] text-[10px] font-semibold tracking-[.14em] ${
              estado.dispositivo ? "text-mt-spotify" : "text-mt-neutral-600"
            }`}
          >
            <span
              className={`h-[7px] w-[7px] ${
                estado.dispositivo ? "mt-pulso bg-mt-spotify" : "bg-mt-neutral-600"
              }`}
              aria-hidden="true"
            />
            {estado.dispositivo ? "CONECTADO" : "SEM APARELHO"}
          </span>
        </div>

        {estado.configurado ? (
          <>
            {/* ─── Faixa atual ─── */}
            <div className="flex-none border-b border-mt-inverso-regua-fina p-6">
              <div className="flex gap-[18px]">
                <div className="h-[104px] w-[104px] flex-none bg-mt-inverso-fundo">
                  {estado.capaUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={estado.capaUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="text-[10px] font-semibold tracking-[.18em] text-mt-neutral-600">
                    {estado.tocando ? "TOCANDO AGORA" : "PAUSADO"}
                  </div>
                  <div className="mt-2 text-2xl font-extrabold leading-tight tracking-[-.02em] [text-wrap:pretty]">
                    {estado.faixa?.nome ?? "—"}
                  </div>
                  <div className="mt-[5px] truncate text-sm text-mt-inverso-suave">
                    {estado.faixa?.artista ?? ""}
                  </div>
                  <div className="mt-auto flex justify-between text-[11px] tracking-[.08em] text-mt-neutral-600">
                    <span>{formatarDuracao(progressoMs)}</span>
                    <span>{formatarDuracao(duracao)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 h-1 bg-[rgba(243,242,242,.2)]">
                <div
                  className="h-1 bg-mt-spotify transition-[width] duration-500 ease-linear"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>

            {/* ─── Transporte ─── */}
            <div className="flex h-[84px] flex-none items-stretch border-b border-mt-inverso-regua-fina">
              <button
                type="button"
                onClick={() => void comandar({ acao: "anterior" })}
                disabled={enviando}
                aria-label="Faixa anterior"
                className="mt-foco flex flex-1 cursor-pointer items-center justify-center border-r border-mt-inverso-regua-fina transition-colors hover:bg-[rgba(243,242,242,.08)] disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true">
                  <path d="M6 5h2.4v14H6zM19 5v14l-9.6-7z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => void comandar({ acao: estado.tocando ? "pausar" : "tocar" })}
                disabled={enviando}
                className="mt-foco flex flex-[1.5] cursor-pointer items-center justify-center gap-3 bg-mt-spotify text-[13px] font-extrabold tracking-[.12em] text-[#0d1f14] transition-colors hover:bg-mt-spotify-hover disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true">
                  <path d={estado.tocando ? ICONE_PAUSA : ICONE_PLAY} />
                </svg>
                {estado.tocando ? "PAUSAR" : "TOCAR"}
              </button>
              <button
                type="button"
                onClick={() => void comandar({ acao: "proxima" })}
                disabled={enviando}
                aria-label="Próxima faixa"
                className="mt-foco flex flex-1 cursor-pointer items-center justify-center border-l border-mt-inverso-regua-fina transition-colors hover:bg-[rgba(243,242,242,.08)] disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true">
                  <path d="M15.6 5H18v14h-2.4zM5 5l9.6 7L5 19z" />
                </svg>
              </button>
            </div>

            {/* ─── Volume ─── */}
            <div className="flex h-16 flex-none items-center gap-3.5 border-b-2 border-mt-inverso-regua px-6">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-[18px] w-[18px] flex-none text-mt-inverso-suave"
                aria-hidden="true"
              >
                <path d="M11 5 6 9H2v6h4l5 4z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              </svg>
              {/* Barra de arrastar em `div` com `role="slider"`: o alvo de toque
                  do design tem 26px de altura sobre um trilho de 6px, e um
                  `input[type=range]` não dá esse desenho sem reescrever o
                  thumb. O teclado continua funcionando pelas setas. */}
              <div
                ref={barraVolume}
                role="slider"
                tabIndex={0}
                aria-label="Volume"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={estado.volume ?? 0}
                onClick={(e) => ajustarVolume(e.clientX)}
                onKeyDown={(e) => {
                  const v = estado.volume ?? 0;
                  if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                    e.preventDefault();
                    void comandar({ acao: "volume", valor: Math.min(100, v + 5) });
                  }
                  if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                    e.preventDefault();
                    void comandar({ acao: "volume", valor: Math.max(0, v - 5) });
                  }
                }}
                className="mt-foco flex h-[26px] flex-1 cursor-pointer items-center"
              >
                <div className="h-1.5 w-full bg-[rgba(243,242,242,.2)]">
                  <div
                    className="h-1.5 bg-mt-inverso transition-[width] duration-200"
                    style={{ width: `${estado.volume ?? 0}%` }}
                  />
                </div>
              </div>
              <span className="w-[34px] flex-none text-right text-xs font-extrabold text-mt-inverso-suave">
                {estado.volume ?? 0}%
              </span>
            </div>

            {/* ─── Playlists ─── */}
            <div className="flex-none px-6 pb-3 pt-[18px] text-[10px] font-semibold tracking-[.18em] text-mt-neutral-600">
              PLAYLIST DA LOJA
            </div>
            {estado.playlists.length > 0 ? (
              <div className="grid flex-none grid-cols-2 border-t border-mt-inverso-regua-fina">
                {estado.playlists.map((p) => {
                  const ativa = p.uri === estado.playlistAtualUri;
                  return (
                    <button
                      key={p.uri}
                      type="button"
                      onClick={() => void comandar({ acao: "playlist", uri: p.uri })}
                      disabled={enviando}
                      className={`mt-foco flex h-[66px] cursor-pointer flex-col justify-center gap-[5px] border-b border-r border-mt-inverso-regua-fina px-5 text-left disabled:opacity-60 ${
                        ativa ? "bg-[rgba(29,185,84,.16)]" : "bg-transparent"
                      }`}
                    >
                      <span
                        className={`truncate text-[13px] font-extrabold tracking-[.06em] ${
                          ativa ? "text-mt-spotify" : "text-mt-inverso"
                        }`}
                      >
                        {p.nome}
                      </span>
                      {/* O design escreve "84 faixas · 09h–17h". Duas partes,
                          e cada uma some sozinha quando não há dado:

                          · a contagem, quando a API não informa (ver
                            `faixas` em `musicaShowroom.ts`);
                          · o horário, que é curadoria da loja e o Spotify não
                            tem — vem da descrição da playlist.

                          Sem as duas, a linha inteira sai, em vez de virar um
                          " · " solto embaixo do nome. */}
                      {(p.faixas !== null || p.descricao) && (
                        <span className="truncate text-[11px] text-mt-neutral-600">
                          {[p.faixas !== null ? `${p.faixas} faixas` : null, p.descricao]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex-none border-t border-mt-inverso-regua-fina px-6 py-4 text-[11px] leading-relaxed text-mt-neutral-600">
                Nenhuma playlist na conta conectada.
              </div>
            )}

            {/* ─── Fila ─── */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-3.5">
              <div className="text-[10px] font-semibold tracking-[.18em] text-mt-neutral-600">
                NA FILA
              </div>
              {estado.fila.map((f, i) => (
                <div
                  key={`${f.nome}-${i}`}
                  className="flex items-center gap-3.5 border-b border-[rgba(243,242,242,.14)] py-[9px]"
                >
                  <span className="w-4 flex-none text-xs font-extrabold text-mt-neutral-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold tracking-[-.01em]">
                      {f.nome}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-mt-neutral-600">
                      {f.artista}
                    </div>
                  </div>
                  <span className="flex-none text-[11px] text-mt-neutral-600">
                    {formatarDuracao(f.duracaoMs)}
                  </span>
                </div>
              ))}
            </div>

            {/* ─── Rodapé: atendimento ─── */}
            <div className="flex flex-none items-center gap-2.5 border-t border-mt-inverso-regua-fina bg-mt-inverso-fundo px-6 py-3">
              {abaixado ? (
                <>
                  <Equalizador tocando={false} className="h-3.5 w-3.5 flex-none" />
                  <span className="text-[11px] leading-snug text-mt-inverso-suave">
                    Volume em {VOLUME_ATENDIMENTO}% para o atendimento.
                  </span>
                  <button
                    type="button"
                    onClick={() => void comandar({ acao: "restaurar" })}
                    disabled={enviando}
                    className="mt-foco ml-auto flex-none cursor-pointer border border-mt-inverso-regua px-3 py-2 text-[10px] font-extrabold tracking-[.12em] disabled:opacity-60"
                  >
                    RESTAURAR
                  </button>
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    className="h-3.5 w-3.5 flex-none text-mt-accent"
                    aria-hidden="true"
                  >
                    <path d="M12 8v5" />
                    <path d="M12 16h.01" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                  <span className="text-[11px] leading-snug text-mt-inverso-suave">
                    Abaixa para {VOLUME_ATENDIMENTO}% quando o consultor toca em{" "}
                    <strong className="text-mt-inverso">CHAMAR CONSULTOR</strong>.
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          /* Sem credencial o painel não finge um player: diz o que falta. */
          <div className="flex flex-1 flex-col justify-center gap-4 px-6">
            <div className="mt-rotulo mt-rotulo-accent">SPOTIFY NÃO CONFIGURADO</div>
            <p className="m-0 text-[15px] leading-relaxed text-mt-inverso-suave">
              Faltam as credenciais do Spotify neste ambiente. O passo a passo —
              app no painel de desenvolvedor, conta Premium e o refresh token —
              está em <code className="text-mt-inverso">docs/MUSICA_SHOWROOM.md</code>.
            </p>
          </div>
        )}

        {erro && (
          <div
            role="status"
            className="flex-none border-t-2 border-mt-accent bg-mt-inverso-fundo px-6 py-3 text-[12px] leading-relaxed text-mt-inverso"
          >
            {MENSAGEM_ERRO[erro] ?? MENSAGEM_ERRO.falhou}
          </div>
        )}
      </div>
    </div>
  );
}
