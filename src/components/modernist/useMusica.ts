"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ESTADO_MUSICA_VAZIO,
  type AcaoMusica,
  type EstadoMusica,
} from "../../lib/musicaShowroom";

/**
 * Estado da música do showroom, compartilhado pela TV (08 A) e pelo painel do
 * balcão (08 C).
 *
 * ── Por que 5s de poll e 500ms de relógio ───────────────────────────────────
 *
 * O ponteiro de progresso precisa andar de segundo em segundo, mas perguntar
 * ao Spotify de segundo em segundo com duas ou três telas abertas encosta no
 * rate limit deles (janela móvel de 30s) — e o servidor já cacheia 2s, então
 * perguntar mais rápido nem traria dado novo.
 *
 * A saída é separar as duas coisas: o poll traz a verdade a cada 5s, e entre
 * um poll e outro o progresso é contado no relógio local a partir do último
 * valor conhecido. O erro máximo acumulado é os 5s do intervalo, e ele zera
 * sozinho no poll seguinte.
 */

const POLL_MS = 5000;
const RELOGIO_MS = 500;

export type Musica = {
  estado: EstadoMusica;
  /** Progresso interpolado — anda entre os polls. */
  progressoMs: number;
  /** `true` enquanto um comando está em voo, para travar o botão. */
  enviando: boolean;
  /** Chave do último erro de comando, ou `null`. */
  erro: string | null;
  comandar: (acao: AcaoMusica) => Promise<void>;
};

export function useMusica({ ativo = true }: { ativo?: boolean } = {}): Musica {
  const [estado, setEstado] = useState<EstadoMusica>(ESTADO_MUSICA_VAZIO);
  const [progressoMs, setProgressoMs] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Âncora do relógio local: progresso do último poll e o instante em que ele
  // chegou. `useRef` e não estado — mexer nisto não deve re-renderizar.
  //
  // `em: 0` e não `Date.now()`: ler o relógio na renderização é chamada impura
  // e o lint barra, com razão. O valor não é usado antes do primeiro poll —
  // com `tocando: false` o efeito do relógio sai na primeira linha.
  const ancora = useRef({ progresso: 0, em: 0, tocando: false });

  const aplicar = useCallback((novo: EstadoMusica) => {
    setEstado(novo);
    ancora.current = {
      progresso: novo.progressoMs,
      em: Date.now(),
      tocando: novo.tocando,
    };
    setProgressoMs(novo.progressoMs);
  }, []);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;

    const buscar = async () => {
      try {
        const r = await fetch("/api/musica", { cache: "no-store" });
        if (!r.ok || !vivo) return;
        aplicar((await r.json()) as EstadoMusica);
      } catch {
        // Rede caiu ou o deploy reiniciou. Mantém o último estado na tela: a
        // TV do showroom não pode piscar para vazio por um poll perdido.
      }
    };

    void buscar();
    const t = setInterval(buscar, POLL_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [ativo, aplicar]);

  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => {
      const a = ancora.current;
      if (!a.tocando) return;
      setProgressoMs(a.progresso + (Date.now() - a.em));
    }, RELOGIO_MS);
    return () => clearInterval(t);
  }, [ativo]);

  const comandar = useCallback(
    async (acao: AcaoMusica) => {
      setEnviando(true);
      setErro(null);
      try {
        const r = await fetch("/api/musica", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(acao),
        });
        const corpo = await r.json();
        if (!r.ok) {
          setErro(typeof corpo?.erro === "string" ? corpo.erro : "falhou");
          return;
        }
        aplicar(corpo as EstadoMusica);
      } catch {
        setErro("falhou");
      } finally {
        setEnviando(false);
      }
    },
    [aplicar],
  );

  const limitado = estado.faixa
    ? Math.min(progressoMs, estado.faixa.duracaoMs)
    : progressoMs;

  return { estado, progressoMs: limitado, enviando, erro, comandar };
}
