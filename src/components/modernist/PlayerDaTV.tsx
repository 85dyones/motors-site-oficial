"use client";

import { useEffect, useRef, useState } from "react";

/**
 * O player que roda dentro da TV — tela A18 do design doc do admin.
 *
 * "Com a conta Premium autorizada no navegador da TV, o player roda dentro da
 * própria vitrine — não é o embed público de prévia de 30 s. O tablet do
 * balcão só manda comandos: quem reproduz é a TV."
 *
 * É isto que este componente faz: carrega o Web Playback SDK, registra a aba
 * como um dispositivo Spotify Connect chamado "TV Showroom" e sai do caminho.
 * Ele não desenha nada — quem mostra a faixa é `FaixaMusica`, e quem comanda é
 * o painel do balcão, pelo Connect.
 *
 * ── Duas coisas que precisam ser ditas ──────────────────────────────────────
 *
 * 1. **Autoplay.** O passo 04 do doc diz "a TV abre a vitrine em tela cheia e
 *    dá play na grade do horário. Sem clique de ninguém". Navegador nenhum faz
 *    isso por padrão: áudio sem gesto do usuário é bloqueado. O Chrome em modo
 *    quiosque com `--autoplay-policy=no-user-gesture-required` faz — e o doc
 *    justamente especifica "Chrome kiosk". Fora dessa flag, alguém toca na
 *    tela uma vez por dia. Está em `docs/MUSICA_SHOWROOM.md`.
 *
 * 2. **O token vai para o cliente, e tem que ser o de curta duração.** O SDK
 *    roda no navegador e precisa de um access token. Ele é buscado em
 *    `/api/musica/token`, vale ~1h e o SDK pede outro quando expira. O
 *    refresh token e o client secret nunca saem do servidor.
 */

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (opts: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
  }
}

type SpotifyPlayer = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (evento: string, cb: (payload: unknown) => void) => void;
};

const NOME_DO_DISPOSITIVO = "TV Showroom";
const SDK_URL = "https://sdk.scdn.co/spotify-player.js";

async function buscarToken(): Promise<string | null> {
  try {
    const r = await fetch("/api/musica/token", { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { token?: string };
    return j.token ?? null;
  } catch {
    return null;
  }
}

export default function PlayerDaTV({ ativo }: { ativo: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const player = useRef<SpotifyPlayer | null>(null);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;

    const iniciar = () => {
      if (!vivo || !window.Spotify || player.current) return;

      const p = new window.Spotify.Player({
        name: NOME_DO_DISPOSITIVO,
        // O SDK chama isto na conexão e de novo a cada expiração. Buscar do
        // servidor toda vez é de propósito: guardar o token num `useState`
        // deixaria a TV parada quando ele vencesse depois de horas ligada.
        getOAuthToken: (cb) => {
          void buscarToken().then((t) => {
            if (t) cb(t);
          });
        },
        volume: 0.5,
      });

      // `account_error` é conta não-Premium; `authentication_error`, token
      // ruim. Os dois vão para o console e não para a tela: a TV do showroom
      // não pode exibir mensagem de erro técnico na frente do cliente.
      for (const e of ["initialization_error", "authentication_error", "account_error", "playback_error"]) {
        p.addListener(e, (payload) => {
          console.warn(`[PlayerDaTV] ${e}:`, payload);
          if (vivo) setErro(e);
        });
      }

      p.addListener("ready", (payload) => {
        console.info("[PlayerDaTV] registrado no Connect:", payload);
      });

      void p.connect();
      player.current = p;
    };

    // O SDK avisa por um global. Se o script já tiver carregado numa
    // navegação anterior, `window.Spotify` já existe e o callback não dispara
    // de novo — daí a checagem antes de esperar.
    if (window.Spotify) {
      iniciar();
    } else {
      window.onSpotifyWebPlaybackSDKReady = iniciar;
      if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
        const s = document.createElement("script");
        s.src = SDK_URL;
        s.async = true;
        document.body.appendChild(s);
      }
    }

    return () => {
      vivo = false;
      player.current?.disconnect();
      player.current = null;
    };
  }, [ativo]);

  // Não desenha nada. O erro fica no console — ver o comentário acima.
  void erro;
  return null;
}
