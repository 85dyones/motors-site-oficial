"use client";

import { useEffect, useRef, useState } from "react";
import { TETO_DA_GRAVACAO_S, arquivoDaGravacao, duracaoDaGravacao, erroDoMicrofone, formatoDaGravacao } from "../../../lib/gravacaoDeAudio";

/**
 * O botão de gravar áudio da caixa de resposta do lead (2026-10-21).
 *
 * Grava pelo microfone do navegador e entrega o arquivo à caixa (`aoGravar`),
 * que o trata como qualquer anexo de áudio: o vendedor ouve antes, envia ou
 * tira. O microfone só abre no clique e fecha ao parar, cancelar ou sair da
 * tela; a gravação para sozinha no teto (`TETO_DA_GRAVACAO_S`).
 *
 * O suporte do navegador é conferido no clique, e não ao montar: o botão
 * existe igual no servidor e no navegador, e quem não grava recebe o motivo.
 */

const NAVEGADOR_SEM_GRAVACAO =
  "Este navegador não grava áudio. Use o Chrome, o Edge, o Firefox ou o Safari atualizados — ou anexe um áudio pelo clipe.";

export default function GravadorDeAudio({
  desligado,
  aoGravar,
  aoFalhar,
  className,
}: {
  desligado: boolean;
  aoGravar: (arquivo: File) => void;
  aoFalhar: (erro: string) => void;
  className: string;
}) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const microfone = useRef<MediaStream | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const descartar = useRef(false);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  function fecharMicrofone() {
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = null;
    microfone.current?.getTracks().forEach((faixa) => faixa.stop());
    microfone.current = null;
    gravador.current = null;
  }

  // Saiu da tela gravando: descarta e devolve o microfone.
  useEffect(() => {
    const refs = { gravador, microfone, relogio, descartar };
    return () => {
      refs.descartar.current = true;
      if (refs.gravador.current && refs.gravador.current.state !== "inactive") refs.gravador.current.stop();
      if (refs.relogio.current) clearInterval(refs.relogio.current);
      refs.microfone.current?.getTracks().forEach((faixa) => faixa.stop());
    };
  }, []);

  function parar() {
    if (gravador.current && gravador.current.state !== "inactive") gravador.current.stop();
  }

  function cancelar() {
    descartar.current = true;
    parar();
  }

  async function gravar() {
    const Gravador = typeof window !== "undefined" ? window.MediaRecorder : undefined;
    const formato =
      Gravador && typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function"
        ? formatoDaGravacao((tipo) => Gravador.isTypeSupported(tipo))
        : null;
    if (!Gravador || !formato) {
      aoFalhar(NAVEGADOR_SEM_GRAVACAO);
      return;
    }
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (erro) {
      aoFalhar(erroDoMicrofone(erro));
      return;
    }

    microfone.current = fluxo;
    pedacos.current = [];
    descartar.current = false;
    const rec = new Gravador(fluxo, { mimeType: formato });
    rec.ondataavailable = (evento) => {
      if (evento.data && evento.data.size > 0) pedacos.current.push(evento.data);
    };
    rec.onstop = () => {
      const descartada = descartar.current;
      fecharMicrofone();
      setGravando(false);
      if (descartada) return;
      const gravado = arquivoDaGravacao(pedacos.current, formato, new Date());
      if (gravado.ok) aoGravar(gravado.arquivo);
      else aoFalhar(gravado.erro);
    };
    gravador.current = rec;
    rec.start();

    const inicio = Date.now();
    setSegundos(0);
    setGravando(true);
    relogio.current = setInterval(() => {
      const passados = Math.floor((Date.now() - inicio) / 1000);
      setSegundos(passados);
      if (passados >= TETO_DA_GRAVACAO_S) parar();
    }, 250);
  }

  if (!gravando) {
    return (
      <button type="button" onClick={() => void gravar()} disabled={desligado} className={className}>
        🎙️ Gravar áudio
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span role="status" aria-live="polite" data-gravando="" className="text-[11px] font-semibold text-mt-accent-800 tabular-nums">
        <span aria-hidden="true">● </span>
        Gravando {duracaoDaGravacao(segundos)} / {duracaoDaGravacao(TETO_DA_GRAVACAO_S)}
      </span>
      <button type="button" onClick={parar} className={className}>
        ■ Parar
      </button>
      <button type="button" onClick={cancelar} className={className}>
        Cancelar
      </button>
    </span>
  );
}
