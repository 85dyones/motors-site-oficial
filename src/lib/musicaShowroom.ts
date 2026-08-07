/**
 * Tipos e formatação da música do showroom — tela 08 do design doc.
 *
 * Este módulo é o contrato entre o servidor (`src/lib/spotify.ts`, que fala com
 * o Spotify e guarda as credenciais) e as duas telas que exibem o estado: a
 * faixa "tocando agora" da TV (08 A) e o painel de controle do balcão (08 C).
 *
 * Fica separado de `spotify.ts` de propósito: aquele arquivo lê
 * `SPOTIFY_CLIENT_SECRET` e `SPOTIFY_REFRESH_TOKEN` e **não pode** ser
 * importado por componente de cliente. Este aqui não tem segredo nenhum e
 * atravessa a fronteira sem risco.
 */

export type FaixaMusical = {
  nome: string;
  artista: string;
  duracaoMs: number;
};

export type PlaylistShowroom = {
  uri: string;
  nome: string;
  /**
   * Quantas faixas a playlist tem, ou `null` quando a API não informou.
   *
   * `null` e não `0`: verificado contra a API em 2026-08-07, o campo mudou de
   * `tracks.total` para `items.total` em `/me/playlists`, e `tracks` sumiu até
   * do endpoint de playlist individual. Enquanto isso não foi corrigido, toda
   * playlist chegava com `0` — e "0 faixas" impresso ao lado de uma playlist
   * de 51 músicas é número inventado, que é o que o CLAUDE.md proíbe. Sem
   * contagem, a tela não mostra contagem.
   */
  faixas: number | null;
  /**
   * Descrição da playlist no próprio Spotify.
   *
   * O design desenha "84 faixas · 09h–17h" nas células da grade. O horário é
   * curadoria da loja — o Spotify não tem esse campo, e inventá-lo aqui
   * imprimiria um horário que ninguém combinou. A saída é a loja escrever o
   * horário na descrição da playlist, no app do Spotify: o painel exibe o que
   * estiver lá, e exibe nada quando não houver.
   */
  descricao: string | null;
};

export type EstadoMusica = {
  /**
   * `false` quando as credenciais do Spotify não estão configuradas. Nesse
   * caso todo o resto vem vazio e as telas suprimem o bloco de música em vez
   * de mostrar um player quebrado numa TV de showroom.
   */
  configurado: boolean;
  /**
   * Nome do aparelho onde o som está saindo (a caixa da loja, o celular do
   * balcão). `null` quando nenhum dispositivo Spotify está ativo — o controle
   * remoto não tem o que controlar e o painel precisa dizer isso.
   */
  dispositivo: string | null;
  tocando: boolean;
  faixa: FaixaMusical | null;
  capaUrl: string | null;
  progressoMs: number;
  volume: number | null;
  /**
   * Volume anterior guardado quando alguém tocou em CHAMAR CONSULTOR.
   * `null` quando não há abaixamento em curso.
   */
  volumeAntesDoAtendimento: number | null;
  /**
   * `true` quando o abaixamento é lembrado num lugar que todas as instâncias
   * enxergam — ou seja, quando a volta automática dos 90 s da A18 realmente
   * acontece em produção.
   *
   * `false` significa estado em memória de processo: certo em `next dev` e num
   * servidor único, furado em serverless, onde o poll que restauraria cai numa
   * instância que nunca soube do abaixamento. O painel A18 exibe isso; ver
   * `src/lib/musicaAtendimento.ts`.
   */
  voltaAutomaticaConfiavel: boolean;
  fila: FaixaMusical[];
  playlists: PlaylistShowroom[];
  playlistAtualUri: string | null;
  /**
   * Aparelhos que a conta enxerga agora — a tabela "DISPOSITIVOS" da A18.
   *
   * Vem de `/me/player/devices`, e não de `/me/player`, porque os dois
   * respondem coisas diferentes: `/me/player` devolve 204 quando **nada está
   * tocando**, e aí `dispositivo` fica `null` mesmo com a TV da loja ligada e
   * disponível. Sem esta lista, a tela dizia "nenhum aparelho" na cara de
   * quem tinha o aparelho ali, só porque estava pausado.
   */
  dispositivos: DispositivoMusica[];
};

export type DispositivoMusica = {
  id: string;
  nome: string;
  /** `Computer`, `Smartphone`, `TV`, `Speaker`… como o Spotify classifica. */
  tipo: string;
  /** `true` no que está recebendo a reprodução agora. */
  ativo: boolean;
  volume: number | null;
  /**
   * `true` quando o Spotify não aceita comando externo para este aparelho
   * (alguns aparelhos de terceiro). O painel precisa saber para não oferecer
   * um controle que vai falhar.
   */
  restrito: boolean;
};

export const ESTADO_MUSICA_VAZIO: EstadoMusica = {
  configurado: false,
  dispositivo: null,
  tocando: false,
  faixa: null,
  capaUrl: null,
  progressoMs: 0,
  volume: null,
  volumeAntesDoAtendimento: null,
  voltaAutomaticaConfiavel: false,
  fila: [],
  playlists: [],
  playlistAtualUri: null,
  dispositivos: [],
};

/**
 * Volume durante o atendimento, em porcento.
 *
 * Vem do design doc (tela 08 C, rodapé): "Abaixa para 20% quando o consultor
 * toca em CHAMAR CONSULTOR".
 */
export const VOLUME_ATENDIMENTO = 20;

export type AcaoMusica =
  | { acao: "tocar" }
  | { acao: "pausar" }
  | { acao: "proxima" }
  | { acao: "anterior" }
  | { acao: "volume"; valor: number }
  | { acao: "playlist"; uri: string }
  | { acao: "abaixar" }
  | { acao: "restaurar" };

/** `254000` → `"4:14"`. Formato do design, sem hora: playlist de loja não tem faixa de 1h. */
export function formatarDuracao(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = String(total % 60).padStart(2, "0");
  return `${min}:${seg}`;
}
