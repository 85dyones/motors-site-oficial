"use client";

import { useEffect, useState } from "react";
import { rastreamentoRecusado } from "../lib/telemetry";

/**
 * O liga-desliga do rastreamento, na página de privacidade.
 *
 * ---------------------------------------------------------------------------
 * Por que aqui, e não no aviso da home
 * ---------------------------------------------------------------------------
 * Até 2026-08-31 o aviso de cookies trazia "Não quero ser rastreado" ao lado
 * de "Entendi". O dono olhou a tela e apontou: *"esta frase induz a recusa"*.
 * Está certo — duas opções lado a lado, uma delas nomeando o medo, é um
 * formulário perguntando à pessoa se ela quer ser vigiada, no meio da visita
 * dela a um carro.
 *
 * A saída não foi apagar a escolha. Foi tirá-la do caminho de quem não a
 * procurou: o aviso informa e some, e quem quiser desligar chega aqui pelo
 * "Ajustar detalhes". A capacidade continua inteira — o que sumiu foi o
 * convite.
 *
 * Isto importa por dois motivos, e o segundo é o que sustenta o primeiro:
 * um botão que não funcionasse seria pior que botão nenhum, porque prometeria
 * um controle inexistente; e a base declarada para o rastreamento é o legítimo
 * interesse (LGPD art. 7º, IX), que pressupõe oposição possível. Este
 * componente é onde essa possibilidade mora.
 *
 * ---------------------------------------------------------------------------
 * Sem servidor, e é o correto
 * ---------------------------------------------------------------------------
 * A escolha vive no `localStorage` do próprio dispositivo, junto com o mesmo
 * `ag_cookie_consent` que o `IntegrationsTracker` lê. Não há conta, não há
 * identificação: guardar essa preferência no servidor exigiria justamente o
 * identificador que quem desliga não quer deixar.
 *
 * O efeito é imediato — `ag-cookie-consent-updated` faz o tracker reavaliar
 * sem recarregar — e vale para as próximas visitas neste navegador.
 */
export default function ControleDeRastreamento() {
  const [estado, setEstado] = useState<"carregando" | "ativo" | "desligado">("carregando");

  useEffect(() => {
    try {
      setEstado(rastreamentoRecusado() ? "desligado" : "ativo");
    } catch {
      // Navegador com armazenamento bloqueado: mostra "ativo", que é a verdade
      // do que o tracker faz quando não consegue ler a preferência.
      setEstado("ativo");
    }
  }, []);

  const aplicar = (desligar: boolean) => {
    try {
      if (desligar) {
        localStorage.setItem("ag_cookie_consent", "rejected");
        // Os identificadores de campanha saem na hora, e não só daqui para a
        // frente: `persistirParametrosDeCampanha` os apaga ao ver a recusa, e
        // o `_fbc` é removido aqui porque é cookie, não chave do storage.
        document.cookie = "_fbc=; path=/; max-age=0";
        document.cookie = "_fbp=; path=/; max-age=0";
      } else {
        localStorage.removeItem("ag_cookie_consent");
      }
      setEstado(desligar ? "desligado" : "ativo");
      window.dispatchEvent(new Event("ag-cookie-consent-updated"));
    } catch {
      // Sem storage não há o que gravar; a tela não finge que gravou.
    }
  };

  if (estado === "carregando") return null;

  const desligado = estado === "desligado";

  return (
    <div className="mt-4 border border-mt-regua-fina bg-mt-surface p-4">
      <p className="m-0 text-[12px] leading-relaxed text-mt-neutral-800">
        <strong className="text-mt-ink">Neste navegador, o rastreamento está{" "}
          {desligado ? "desligado" : "ativo"}.</strong>{" "}
        {desligado
          ? "Nenhuma ferramenta de análise ou publicidade é carregada, e os identificadores de campanha foram apagados. O site continua funcionando igual."
          : "Usamos essas ferramentas para medir o desempenho dos nossos anúncios e entender como o site é usado. Você pode desligar agora, e a escolha vale para as próximas visitas neste navegador."}
      </p>
      <button
        onClick={() => aplicar(!desligado)}
        className={`mt-3 mt-foco cursor-pointer px-4 py-2.5 text-[11px] ${
          desligado ? "mt-btn mt-btn-primario" : "mt-btn mt-btn-contorno"
        }`}
      >
        {desligado ? "Ligar novamente" : "Desligar o rastreamento neste navegador"}
      </button>
    </div>
  );
}
