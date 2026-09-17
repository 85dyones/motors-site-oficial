"use client";

import { useEffect, useState } from "react";
import { descartarCookiesDeAnuncio, rastreamentoRecusado } from "../lib/telemetry";

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
 *
 * ---------------------------------------------------------------------------
 * O destaque é de quem mantém ligada (16/09/2026)
 * ---------------------------------------------------------------------------
 * Até esta data o controle dizia "Você pode desligar agora", o botão de
 * desligar era o único botão da caixa, e o estado desligado terminava em "O
 * site continua funcionando igual". Nada disso era falso; tudo empurrava para
 * desligar. Decisão do dono: *"não quero que o texto induza a pessoa a clicar
 * em não permitir, tem que ser o contrário"*.
 *
 * Agora, ligada, a caixa tem a régua de cartão ativo, o rótulo "Recomendado"
 * e o benefício; desligar é a ação secundária, em link. Desligada, o destaque
 * vai para "Ligar a medição", com o mesmo benefício.
 *
 * O que não muda, e é o que a LGPD cobra de quem usa legítimo interesse: a
 * oposição continua a um clique, com o nome escrito ("Desligar neste
 * navegador", o mesmo que a política cita), sem culpa e sem medo, e o clique
 * faz exatamente o que fazia — `aplicar` não mudou. O benefício só promete o
 * que a medição entrega: anúncios que PODEM mostrar carros ligados ao que a
 * pessoa viu, e visitas que nos ensinam a melhorar o site e o atendimento.
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
        // frente: `persistirParametrosDeCampanha` os apaga ao ver a recusa, a
        // cada carga. Os cookies `_fbp`/`_fbc` saem também aqui, no próprio
        // clique, sem esperar o tracker. Em todos os domínios: o Meta Pixel os
        // grava com `domain=`, e a escrita sem domínio que ficava aqui não
        // alcançava essa cópia.
        descartarCookiesDeAnuncio();
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

  // Um `<button>` só, nos dois estados: trocar de elemento no clique tiraria o
  // foco de quem navega pelo teclado.
  return (
    <div className={desligado ? "mt-4 mt-cartao" : "mt-4 mt-cartao mt-cartao-ativo"}>
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <strong className="text-[13px] text-mt-ink">
          {desligado ? "Medição desligada neste navegador" : "Medição ligada neste navegador"}
        </strong>
        {!desligado && <span className="mt-rotulo mt-rotulo-accent">Recomendado</span>}
      </p>
      <p className="m-0 mt-2 text-[12px] leading-relaxed text-mt-neutral-800">
        {desligado
          ? "As ferramentas de análise e de publicidade não são carregadas, e os identificadores de campanha guardados aqui foram apagados. Com a medição ligada, os anúncios podem mostrar carros do seu perfil, e as suas visitas nos ajudam a melhorar o site e o atendimento."
          : "Com ela, os anúncios podem mostrar carros do seu perfil, parecidos com os que você viu aqui, e as suas visitas nos ajudam a melhorar o site e o atendimento."}
      </p>
      <button
        onClick={() => aplicar(!desligado)}
        className={
          desligado
            ? "mt-3 mt-btn mt-btn-primario mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
            : "mt-3 mt-foco cursor-pointer text-[11px] font-normal text-mt-neutral-700 underline underline-offset-2 hover:text-mt-ink"
        }
      >
        {desligado ? "Ligar a medição" : "Desligar neste navegador"}
      </button>
    </div>
  );
}
