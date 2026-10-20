"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lerConversaDaApi, type ConversaDaApi } from "../../../lib/atendimentoNaTela";

const RELEITURA_MS = 15_000;

export interface ConversaDoLead {
  dados: ConversaDaApi | null;
  /**
   * A leitura que falhou: aviso discreto, e não alerta. É uma releitura em
   * segundo plano; gritar a cada 15 s por ela tomaria o lugar dos avisos que
   * pedem ação, e o resto do detalhe segue de pé.
   */
  erroDeLeitura: string | null;
  /** Quando a última leitura chegou — o "há 3 min" das telas conta daqui. */
  agora: number;
  /** Relê na hora (depois de enviar ou de mudar o assistente). */
  ler: () => Promise<void>;
}

/** A última leitura e o lead dela. Falhou: a anterior fica, com o erro ao lado. */
interface Leitura {
  leadId: string;
  dados: ConversaDaApi | null;
  erro: string | null;
}

/**
 * A conversa do lead pelo WhatsApp da loja, lida uma vez e relida a cada 15 s
 * enquanto a aba do navegador está visível — a forma simples de ver a resposta
 * do cliente chegar sem um canal em tempo real.
 *
 * Uma leitura serve a dois blocos do detalhe (2026-10-20): o atendimento (a),
 * com a conversa e o resumo, e o aquecimento (q), que fica sempre à vista na
 * coluna da direita. Sem `leadId` (o lead ainda não foi lido), não busca nada.
 * O que foi lido guarda o lead de origem: na gaveta, ao trocar de card, o
 * aquecimento do lead anterior não aparece no novo enquanto a leitura chega.
 */
export function useConversaDoLead(leadId: string | null): ConversaDoLead {
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const vivo = useRef(true);

  /** Só busca: quem muda o estado é quem chama, quando a resposta chega. */
  const buscar = useCallback(async (): Promise<Leitura | null> => {
    if (!leadId) return null;
    try {
      const r = await fetch(`/api/leads/${encodeURIComponent(leadId)}/conversa`, { cache: "no-store" });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) return { leadId, dados: null, erro: (corpo as { error?: string } | null)?.error ?? "Não deu para ler a conversa." };
      return { leadId, dados: lerConversaDaApi(corpo), erro: null };
    } catch {
      return { leadId, dados: null, erro: "Não deu para ler a conversa." };
    }
  }, [leadId]);

  const aplicar = useCallback((r: Leitura | null) => {
    if (!vivo.current || !r) return;
    if (r.erro) {
      // A leitura anterior fica na tela: o aviso diz que ela pode estar velha.
      setLeitura((anterior) => (anterior?.leadId === r.leadId ? { ...anterior, erro: r.erro } : r));
      return;
    }
    setLeitura(r);
    setAgora(Date.now());
  }, []);

  const ler = useCallback(async () => aplicar(await buscar()), [aplicar, buscar]);

  useEffect(() => {
    vivo.current = true;
    void buscar().then(aplicar);
    const relogio = window.setInterval(() => {
      if (document.visibilityState === "visible") void buscar().then(aplicar);
    }, RELEITURA_MS);
    return () => {
      vivo.current = false;
      window.clearInterval(relogio);
    };
  }, [buscar, aplicar]);

  const doLead = leitura?.leadId === leadId ? leitura : null;
  return { dados: doLead?.dados ?? null, erroDeLeitura: doLead?.erro ?? null, agora, ler };
}
