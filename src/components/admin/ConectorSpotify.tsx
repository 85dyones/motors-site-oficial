"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EstadoMusica } from "../../lib/musicaShowroom";

/**
 * Linha do Spotify na lista de conectores — tela A5 do design doc do admin.
 *
 * O princípio 04 do doc: "widgets de terceiro aparecem como conectores com
 * estado, não como campo de texto solto". Esta linha segue isso — e ela não
 * tem campo nenhum de propósito: o `client secret` e o `refresh token` do
 * Spotify moram no ambiente, nunca num formulário que os traria de volta ao
 * navegador para serem exibidos.
 *
 * O que a tela mostra é o estado real, lido de `/api/musica`: se as
 * credenciais existem, se há aparelho ativo e o que está tocando. A
 * configuração da escala fica em `/admin/site/musica` (A18).
 */

type Situacao = {
  rotulo: string;
  detalhe: string;
  /** Vermelho é reservado a estado que exige ação — é a regra do sistema. */
  alerta: boolean;
};

function situacaoDe(estado: EstadoMusica | null, carregando: boolean): Situacao {
  if (carregando) return { rotulo: "VERIFICANDO", detalhe: "lendo o estado do player…", alerta: false };
  if (!estado?.configurado) {
    return {
      rotulo: "PENDENTE",
      detalhe:
        "faltam SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET e SPOTIFY_REFRESH_TOKEN no ambiente",
      alerta: true,
    };
  }
  if (!estado.dispositivo) {
    return {
      rotulo: "SEM APARELHO",
      detalhe: "conta conectada, mas nenhum dispositivo Spotify ativo agora",
      alerta: true,
    };
  }
  return {
    rotulo: "CONECTADO",
    detalhe: estado.tocando
      ? `tocando em ${estado.dispositivo}`
      : `pausado em ${estado.dispositivo}`,
    alerta: false,
  };
}

export default function ConectorSpotify() {
  const [estado, setEstado] = useState<EstadoMusica | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/musica", { cache: "no-store" });
        if (!r.ok || !vivo) return;
        setEstado((await r.json()) as EstadoMusica);
      } catch {
        // Sem resposta, cai no estado "pendente", que é o seguro.
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const s = situacaoDe(estado, carregando);

  return (
    <div className="border border-mt-regua-fina bg-mt-surface p-6">
      <span className="mt-rotulo mt-rotulo-accent">CONECTOR</span>
      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <h2 className="m-0 text-[17px] font-extrabold tracking-[-.015em] text-mt-ink">
          SPOTIFY PREMIUM
        </h2>
        <span
          className={`mt-etiqueta text-[9px] ${
            s.alerta ? "bg-mt-accent text-mt-inverso" : "border border-mt-regua text-mt-neutral-700"
          }`}
        >
          {s.rotulo}
        </span>
      </div>

      <p className="mb-4 mt-2 text-xs font-normal leading-relaxed text-mt-neutral-700">
        Música do showroom na TV e no tablet do balcão. O tablet manda os
        comandos, a TV reproduz. {s.detalhe}.
      </p>

      <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-mt-regua-fina pt-4 text-xs">
        <div>
          <div className="mt-rotulo">ONDE</div>
          <div className="mt-1 font-semibold text-mt-ink">Vitrine TV · tablet do balcão</div>
        </div>
        <div>
          <div className="mt-rotulo">TOCANDO</div>
          <div className="mt-1 font-semibold text-mt-ink">
            {estado?.faixa ? `${estado.faixa.nome} — ${estado.faixa.artista}` : "—"}
          </div>
        </div>
        <div>
          <div className="mt-rotulo">CREDENCIAIS</div>
          {/* Sem máscara de chave: o valor não vem para o cliente, então não
              há o que mascarar. Dizer onde ele mora é mais útil do que
              imprimir "spot-•••• 8f42" de um segredo que esta tela não lê. */}
          <div className="mt-1 font-semibold text-mt-ink">variáveis de ambiente</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 border-t border-mt-regua-fina pt-4">
        <Link href="/admin/site/musica" className="mt-btn mt-btn-contorno mt-foco h-10 px-4 text-[11px]">
          CONFIGURAR GRADE
        </Link>
        <Link
          href="/vitrine/musica"
          target="_blank"
          className="mt-btn mt-btn-contorno mt-foco h-10 px-4 text-[11px]"
        >
          ABRIR PAINEL DO BALCÃO
        </Link>
      </div>
    </div>
  );
}
