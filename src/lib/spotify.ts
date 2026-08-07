/**
 * Spotify Connect — o som do showroom, controlado pelo tablet do balcão.
 *
 * SÓ SERVIDOR. Este arquivo lê `SPOTIFY_CLIENT_SECRET` e
 * `SPOTIFY_REFRESH_TOKEN`; importá-lo de um componente de cliente manda os dois
 * para o bundle. Quem precisa dos tipos importa `musicaShowroom.ts`.
 *
 * ── Por que Connect e não o embed ────────────────────────────────────────────
 *
 * O caminho barato seria o iframe de `open.spotify.com/embed/…`: não pede
 * credencial nenhuma. Ele não serve aqui, e não é preferência:
 *
 *  · toca **30 segundos** por faixa para quem não estiver logado com Premium
 *    naquele navegador — numa TV de showroom, ninguém está;
 *  · **não dá autoplay**. Navegador bloqueia áudio sem gesto do usuário, e a TV
 *    da loja é justamente a tela em que ninguém toca;
 *  · é cross-origin: a página não consegue pausar, pular nem mexer no volume
 *    dele. O "abaixa para 20% no CHAMAR CONSULTOR" do design é impossível;
 *  · não expõe o que está tocando, então a faixa do topo da TV (08 A) ficaria
 *    sem fonte de dado.
 *
 * O design desenha um **controle remoto** (08 C) e um **mostrador** (08 A) em
 * dois aparelhos diferentes, olhando o mesmo player. Isso é estado de conta, e
 * quem tem estado de conta é a Web API. O áudio sai de onde a loja já ouve
 * música — a caixa de som, o celular do balcão —, não do alto-falante da TV.
 *
 * ── O que a loja precisa ter ─────────────────────────────────────────────────
 *
 *  · **Spotify Premium.** A API de playback recusa conta free, sem exceção.
 *  · Um app registrado em developer.spotify.com e um refresh token gerado uma
 *    vez, com os escopos `user-read-playback-state`,
 *    `user-modify-playback-state` e `playlist-read-private`.
 *  · Um dispositivo Spotify ligado e ativo na conta.
 *
 * Passo a passo em `docs/MUSICA_SHOWROOM.md`.
 *
 * ── Licenciamento ───────────────────────────────────────────────────────────
 *
 * Isto é implementação técnica, não parecer jurídico: o plano pessoal do
 * Spotify proíbe uso em estabelecimento comercial (o produto deles para isso é
 * o Soundtrack Your Brand), e no Brasil tocar música em loja gera cobrança do
 * ECAD independente da origem do som. Vale resolver antes de ligar na TV.
 */

import {
  ESTADO_MUSICA_VAZIO,
  VOLUME_ATENDIMENTO,
  type AcaoMusica,
  type DispositivoMusica,
  type EstadoMusica,
  type FaixaMusical,
  type PlaylistShowroom,
} from "./musicaShowroom";
import { DURACAO_ATENDIMENTO_MS, limitarVolume } from "./musicaGrade";
import {
  atendimentoEhConfiavel,
  gravarAtendimento,
  lerAtendimento,
  limparAtendimento,
  type Atendimento,
} from "./musicaAtendimento";

const CONTAS = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

function credenciais() {
  const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN ?? "";
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

export function spotifyConfigurado(): boolean {
  return credenciais() !== null;
}

/* ── Token ──────────────────────────────────────────────────────────────────
   O access token vale 1h. Guardar em memória do processo é suficiente: numa
   função serverless a instância morre e o próximo pedido renova, que é uma
   chamada a mais e nenhum problema. A margem de 60s evita usar um token que
   expira no meio do voo. */

let tokenCache: { valor: string; expiraEm: number } | null = null;

async function accessToken(): Promise<string | null> {
  const cred = credenciais();
  if (!cred) return null;

  if (tokenCache && Date.now() < tokenCache.expiraEm - 60_000) {
    return tokenCache.valor;
  }

  const basic = Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString("base64");
  const r = await fetch(CONTAS, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cred.refreshToken,
    }),
    cache: "no-store",
  });

  if (!r.ok) {
    // Refresh token revogado ou app apagado. Não relança: a TV não pode cair
    // por causa da música. O estado volta "não configurado" e o bloco some.
    console.warn("[Spotify] Falha ao renovar o token:", r.status, await r.text());
    tokenCache = null;
    return null;
  }

  const j = (await r.json()) as { access_token: string; expires_in: number };
  tokenCache = { valor: j.access_token, expiraEm: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

/**
 * Access token para o Web Playback SDK, que roda no navegador da TV.
 *
 * É o ÚNICO segredo que sai do servidor, e sai porque não há alternativa: o
 * SDK é código de cliente e precisa dele. Vale ~1h e não dá para derivar dele
 * o refresh token nem o client secret.
 *
 * Ainda assim é uma chave de playback da conta da loja: quem a tiver controla
 * a música de qualquer lugar até ela expirar. Por isso a rota que a entrega
 * exige sessão — e é o mesmo login único no navegador da TV que o passo 01 da
 * A18 já descreve.
 */
export async function tokenParaPlayer(): Promise<string | null> {
  return accessToken();
}

type Resposta = { ok: boolean; status: number; corpo: unknown };

async function chamar(
  caminho: string,
  init?: { method?: string; body?: unknown },
): Promise<Resposta> {
  const token = await accessToken();
  if (!token) return { ok: false, status: 401, corpo: null };

  const r = await fetch(`${API}${caminho}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  // 204 é a resposta normal de vários endpoints daqui: comando aceito, ou
  // "não há nada tocando". Não é erro.
  if (r.status === 204) return { ok: true, status: 204, corpo: null };

  const texto = await r.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }

  if (!r.ok) console.warn(`[Spotify] ${init?.method ?? "GET"} ${caminho} →`, r.status, texto);
  return { ok: r.ok, status: r.status, corpo };
}

/* ── Leitura de estado ─────────────────────────────────────────────────────── */

type ItemSpotify = {
  name?: string;
  duration_ms?: number;
  artists?: Array<{ name?: string }>;
  album?: { images?: Array<{ url?: string }> };
};

function paraFaixa(item: ItemSpotify | null | undefined): FaixaMusical | null {
  if (!item?.name) return null;
  return {
    nome: item.name,
    artista: (item.artists ?? []).map((a) => a.name).filter(Boolean).join(", "),
    duracaoMs: item.duration_ms ?? 0,
  };
}

/* O volume de antes do atendimento vive em `musicaAtendimento.ts` — precisa ser
   compartilhado entre instâncias, ou a volta dos 90 s nunca acontece no Vercel.
   O porquê está no cabeçalho daquele arquivo. */

/**
 * Cache curto do estado.
 *
 * A TV e o tablet perguntam a cada poucos segundos, e nada impede uma terceira
 * tela. Sem isso, cada cliente vira uma chamada ao Spotify e o rate limit
 * (janela móvel de 30s) começa a doer. Dois segundos é abaixo do intervalo de
 * poll das telas, então ninguém vê estado velho.
 */
let estadoCache: { valor: EstadoMusica; em: number } | null = null;
const CACHE_MS = 2000;

/**
 * Devolve o volume ao normal quando os 90 s do atendimento passaram.
 *
 * Não é `setTimeout`: em ambiente serverless o processo pode morrer entre o
 * abaixamento e o disparo, e o volume ficaria em 20% até alguém reparar. Aqui
 * a volta é verificada em toda leitura de estado — e a TV e o tablet lêem a
 * cada 5 s, então o atraso máximo é esse.
 */
async function encerrarAtendimentoVencido(): Promise<Atendimento | null> {
  const atendimento = await lerAtendimento();
  if (!atendimento) return null;
  if (Date.now() - atendimento.em < DURACAO_ATENDIMENTO_MS) return atendimento;

  const alvo = atendimento.volume;
  await limparAtendimento();
  if (alvo === null) return null;
  await chamar(`/me/player/volume?volume_percent=${limitarVolume(alvo)}`, { method: "PUT" });
  return null;
}

export async function lerEstado(forcar = false): Promise<EstadoMusica> {
  if (!spotifyConfigurado()) return ESTADO_MUSICA_VAZIO;

  const atendimento = await encerrarAtendimentoVencido();

  if (!forcar && estadoCache && Date.now() - estadoCache.em < CACHE_MS) {
    return estadoCache.valor;
  }

  const [player, fila, playlists, aparelhos] = await Promise.all([
    chamar("/me/player"),
    chamar("/me/player/queue"),
    chamar("/me/playlists?limit=4"),
    chamar("/me/player/devices"),
  ]);

  // Token morto ou revogado: trata como não configurado. A tela some em vez de
  // mostrar um player vazio.
  if (player.status === 401) return ESTADO_MUSICA_VAZIO;

  const p = (player.corpo ?? {}) as {
    is_playing?: boolean;
    progress_ms?: number;
    item?: ItemSpotify;
    device?: { name?: string; volume_percent?: number };
    context?: { uri?: string };
  };

  const f = (fila.corpo ?? {}) as { queue?: ItemSpotify[] };
  // Duas formas para a contagem de faixas, e a ordem importa. Em 2026-08-07 a
  // API devolve `items.total`; `tracks.total` é o formato antigo, mantido como
  // segunda opção porque o rollout do Spotify não é uniforme e reverter não
  // deve zerar a contagem na tela.
  const l = (playlists.corpo ?? {}) as {
    items?: Array<{
      uri?: string;
      name?: string;
      description?: string;
      items?: { total?: number };
      tracks?: { total?: number };
    }>;
  };

  const a = (aparelhos.corpo ?? {}) as {
    devices?: Array<{
      id?: string;
      name?: string;
      type?: string;
      is_active?: boolean;
      volume_percent?: number | null;
      is_restricted?: boolean;
    }>;
  };

  const listaDeAparelhos: DispositivoMusica[] = (a.devices ?? [])
    .filter((d): d is { id: string; name: string } & typeof d => Boolean(d?.id && d?.name))
    .map((d) => ({
      id: d.id,
      nome: d.name,
      tipo: d.type ?? "Desconhecido",
      ativo: d.is_active === true,
      volume: d.volume_percent ?? null,
      restrito: d.is_restricted === true,
    }));

  const estado: EstadoMusica = {
    configurado: true,
    // `/me/player` só nomeia o aparelho quando há reprodução em curso. Com a
    // TV ligada e pausada ele vem vazio, então a lista de aparelhos preenche
    // a lacuna: o que estiver marcado como ativo é o mesmo aparelho.
    dispositivo:
      p.device?.name ?? listaDeAparelhos.find((d) => d.ativo)?.nome ?? null,
    tocando: p.is_playing === true,
    faixa: paraFaixa(p.item),
    capaUrl: p.item?.album?.images?.[0]?.url ?? null,
    progressoMs: p.progress_ms ?? 0,
    volume: p.device?.volume_percent ?? null,
    volumeAntesDoAtendimento: atendimento?.volume ?? null,
    voltaAutomaticaConfiavel: atendimentoEhConfiavel(),
    // Duas da fila: é o que a célula "NA FILA" do design comporta.
    fila: (f.queue ?? []).slice(0, 2).map(paraFaixa).filter((x): x is FaixaMusical => x !== null),
    playlists: (l.items ?? [])
      .filter(
        (
          x,
        ): x is {
          uri: string;
          name: string;
          description?: string;
          items?: { total?: number };
          tracks?: { total?: number };
        } => Boolean(x?.uri && x?.name),
      )
      .map<PlaylistShowroom>((x) => ({
        uri: x.uri,
        nome: x.name,
        faixas: x.items?.total ?? x.tracks?.total ?? null,
        descricao: x.description?.trim() ? x.description.trim() : null,
      })),
    playlistAtualUri: p.context?.uri ?? null,
    dispositivos: listaDeAparelhos,
  };

  estadoCache = { valor: estado, em: Date.now() };
  return estado;
}

/* ── Comandos ──────────────────────────────────────────────────────────────── */

export type ErroComando =
  | "nao-configurado"
  | "sem-dispositivo"
  | "premium-necessario"
  | "falhou";

export type ResultadoComando =
  | { ok: true; estado: EstadoMusica }
  | { ok: false; erro: ErroComando };

function classificar(r: Resposta): ErroComando {
  // 404 no player é sempre NO_ACTIVE_DEVICE: a conta está viva, mas não há
  // aparelho ligado para receber o comando.
  if (r.status === 404) return "sem-dispositivo";
  // 403 aqui é conta free. É o erro mais provável de quem acabou de configurar.
  if (r.status === 403) return "premium-necessario";
  return "falhou";
}

export async function executar(acao: AcaoMusica): Promise<ResultadoComando> {
  if (!spotifyConfigurado()) return { ok: false, erro: "nao-configurado" };

  let r: Resposta;

  switch (acao.acao) {
    case "tocar":
      r = await chamar("/me/player/play", { method: "PUT" });
      break;
    case "pausar":
      r = await chamar("/me/player/pause", { method: "PUT" });
      break;
    case "proxima":
      r = await chamar("/me/player/next", { method: "POST" });
      break;
    case "anterior":
      r = await chamar("/me/player/previous", { method: "POST" });
      break;
    case "volume": {
      // Teto de 70% da regra A18: o painel não passa disso. A trava fica aqui,
      // no servidor, e não só no componente — a barra do balcão é uma das
      // formas de chegar, não a única.
      const v = limitarVolume(acao.valor);
      r = await chamar(`/me/player/volume?volume_percent=${v}`, { method: "PUT" });
      // Mexer no volume à mão encerra o abaixamento: quem arrastou a barra
      // decidiu o volume, e "restaurar" depois disso devolveria um número que
      // já não é o que a loja quer.
      if (r.ok) await limparAtendimento();
      break;
    }
    case "playlist":
      r = await chamar("/me/player/play", {
        method: "PUT",
        body: { context_uri: acao.uri },
      });
      break;
    case "abaixar": {
      // Só guarda o volume na primeira chamada. Dois toques seguidos em CHAMAR
      // CONSULTOR não podem gravar 20% como "volume de antes" — o segundo
      // toque apagaria o volume real da loja. O relógio, esse sim, reinicia:
      // um segundo cliente chamando o consultor renova os 90 s.
      const emCurso = await lerAtendimento();
      const anterior = emCurso?.volume ?? (await lerEstado(true)).volume ?? null;
      await gravarAtendimento({ volume: anterior, em: Date.now() });
      r = await chamar(`/me/player/volume?volume_percent=${VOLUME_ATENDIMENTO}`, {
        method: "PUT",
      });
      if (!r.ok) await limparAtendimento();
      break;
    }
    case "restaurar": {
      // Volta antes dos 90 s, quando o consultor resolve na hora.
      const emCurso = await lerAtendimento();
      if (emCurso?.volume == null) {
        await limparAtendimento();
        return { ok: true, estado: await lerEstado(true) };
      }
      r = await chamar(`/me/player/volume?volume_percent=${limitarVolume(emCurso.volume)}`, {
        method: "PUT",
      });
      if (r.ok) await limparAtendimento();
      break;
    }
  }

  if (!r.ok) return { ok: false, erro: classificar(r) };

  // O Spotify leva um instante para refletir o comando. Sem essa espera o
  // estado devolvido é o de antes, e o botão pisca de volta para o estado
  // anterior antes do próximo poll corrigir.
  await new Promise((resolve) => setTimeout(resolve, 350));
  estadoCache = null;
  return { ok: true, estado: await lerEstado(true) };
}
