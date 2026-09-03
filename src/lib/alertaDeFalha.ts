/**
 * O aviso que sai do próprio código quando uma integração para de funcionar.
 *
 * ---------------------------------------------------------------------------
 * Por que isto existe
 * ---------------------------------------------------------------------------
 * Em 2026-09-02 descobriu-se que a CAPI do Meta estava parada desde 31/08. O
 * log da falha EXISTIA o tempo todo. Ninguém o via, porque log só avisa quem
 * está olhando — e ninguém olha log de rota que devolve 204.
 *
 * A régua nova é: **falha de integração procura a pessoa, não espera por ela.**
 *
 * ---------------------------------------------------------------------------
 * O que este arquivo NÃO cobre, e é importante saber
 * ---------------------------------------------------------------------------
 * Só avisa sobre falha que o código CONSEGUE perceber. Se a função estourar
 * tempo, ficar sem memória, ou o deploy quebrar, não há quem chame daqui — é o
 * ponto cego de todo auto-monitoramento, o vigia dormindo junto.
 *
 * O que cobre esse resto é um log drain da Vercel apontando para o mesmo
 * webhook. Os dois se somam: este pega o que o código entende, o drain pega o
 * que o código não sobrevive para contar.
 *
 * ---------------------------------------------------------------------------
 * A ENXURRADA é o que decide se isto serve
 * ---------------------------------------------------------------------------
 * Um token expirado faz TODO evento falhar. Com a campanha rodando, seria uma
 * mensagem por visita — e alerta que toca sem parar é alerta que a pessoa
 * silencia na primeira hora. Alerta silenciado é pior que alerta nenhum,
 * porque dá a sensação de estar coberto.
 *
 * Daí a carência, e daí a CONTAGEM: a mensagem que sai depois da carência diz
 * quantas falhas foram engolidas no intervalo. Uma mensagem a cada trinta
 * minutos dizendo "412 falhas desde o último aviso" informa mais, e incomoda
 * menos, que 412 mensagens.
 *
 * ⚠️ A carência é por INSTÂNCIA da função, em memória. Instância nova começa
 * com o contador zerado, então em pico de tráfego podem sair alguns avisos em
 * paralelo. É limitação aceita: carência compartilhada exigiria Redis ou uma
 * ida ao banco no caminho da falha — e o caminho da falha é justamente onde
 * não se quer mais uma dependência que pode estar caída junto.
 */

/** Quanto tempo esperar entre dois avisos do mesmo assunto. */
const CARENCIA_MS = 30 * 60 * 1000;

/**
 * Teto da chamada ao webhook. Curto de propósito: isto roda no caminho de uma
 * falha que já aconteceu, e não pode virar a segunda coisa a travar.
 */
const TEMPO_LIMITE_MS = 3000;

/** Último envio e quantas falhas foram engolidas desde ele, POR ASSUNTO. */
const ultimoEnvio = new Map<string, { em: number; suprimidas: number }>();

/**
 * Avisa que algo parou. Nunca lança, nunca bloqueia o fluxo de quem chamou.
 *
 * @param assunto Chave curta e ESTÁVEL — é por ela que a carência agrupa.
 *                "meta-capi" agrupa toda falha da CAPI; incluir o status ali
 *                faria cada código de erro ter carência própria, e um token
 *                expirado alternando 400/401 furaria a contenção.
 * @param detalhe O que aconteceu, para a mensagem. Truncado no envio.
 */
export async function alertarFalha(assunto: string, detalhe: string): Promise<void> {
  const webhook = process.env.N8N_WEBHOOK_ALERTA_URL?.trim();
  // Sem webhook configurado, o aviso simplesmente não existe — o log continua
  // valendo. Mesmo padrão do resto do projeto: falta de configuração degrada,
  // não quebra.
  if (!webhook) return;

  const agora = Date.now();
  const anterior = ultimoEnvio.get(assunto);

  if (anterior && agora - anterior.em < CARENCIA_MS) {
    anterior.suprimidas += 1;
    return;
  }

  const suprimidas = anterior?.suprimidas ?? 0;
  // Marca ANTES de enviar: se o envio demorar, a próxima falha não dispara um
  // segundo aviso concorrente.
  ultimoEnvio.set(assunto, { em: agora, suprimidas: 0 });

  try {
    await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_SECRET_TOKEN
          ? { Authorization: `Bearer ${process.env.N8N_SECRET_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        assunto,
        // Truncado: a resposta de erro do Meta traz o payload de volta, com os
        // hashes de user_data. Hash não é dado em claro, mas mensagem de
        // WhatsApp não é lugar de despejar payload.
        detalhe: detalhe.slice(0, 300),
        suprimidasDesdeOUltimoAviso: suprimidas,
        ambiente: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "desconhecido",
        em: new Date(agora).toISOString(),
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (erro) {
    // O aviso falhou. Não há a quem avisar sobre isso — só o log, que é
    // exatamente o que não bastava. Fica registrado para quem for investigar
    // depois por que o alerta não chegou.
    console.error("[Alerta] Não consegui avisar sobre:", assunto, erro);
  }
}

/** Zera a carência. Existe para o teste, que não pode depender de relógio. */
export function esquecerCarencia(): void {
  ultimoEnvio.clear();
}
