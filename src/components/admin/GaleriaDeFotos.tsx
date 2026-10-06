"use client";

import { useCallback, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { processarFotoDeVeiculo } from "../../lib/imageProcessor";
import {
  BUCKET_DE_FOTOS,
  caminhoDaFoto,
  caminhoDaUrlPublica,
  colunasDasFotos,
  fotosDoVeiculo,
  moverFoto,
  novoLote,
  validarFoto,
  type FotoDoVeiculo,
} from "../../lib/fotosDoVeiculo";
import {
  FOTOS_DA_FICHA_COMPLETA,
  MINIMO_DE_FOTOS,
  MINIMO_DE_FOTOS_EM_PREPARACAO,
} from "../../lib/coerenciaDoCadastro";
import type { DestinoDasFotos } from "../../lib/destinoDasFotos";
import { resumoDaImportacao, type RespostaDoFeed } from "../../lib/feedParaORepasse";
import BuscaDeCarro from "./lead/BuscaDeCarro";

/**
 * A galeria de fotos do editor A15 — aba "Fotos e mídia".
 *
 * ---------------------------------------------------------------------------
 * Quem abre, quando, e que decisão sai daqui
 * ---------------------------------------------------------------------------
 * **Marketing**, no desktop, depois da sessão de fotos do carro — não no pátio
 * e não no celular: as fotos de vitrine saem de sessão profissional, com
 * arquivo grande vindo do cartão da câmera. (A foto de pátio — avaria, vistoria
 * — é outro fluxo, do PWA, com outro bucket.)
 *
 * A decisão que sai desta tela é uma só: **este carro pode ir ao ar?** A régua
 * é `MINIMO_DE_FOTOS` (quatro desde 01/09), a mesma que o site usa para filtrar
 * a vitrine (`bloqueiosDePublicacao`), e por isso o contador aqui e o site
 * nunca discordam. O operador sobe fotos até a barra fechar, arrasta a melhor
 * para a primeira posição — que é a capa do card, do card do WhatsApp e do
 * anúncio no portal — e o carro entra na vitrine no ciclo seguinte.
 *
 * ---------------------------------------------------------------------------
 * O envio é DIRETO do navegador para o Storage
 * ---------------------------------------------------------------------------
 * Não passa pela rota, e o motivo é o mesmo do diário de bordo: função
 * serverless da Vercel recusa corpo acima de ~4,5 MB, e foto de câmera passa
 * disso com folga. Quem autoriza é a RLS do bucket (`is_staff`), com a sessão
 * do próprio operador — sem chave de serviço na tela.
 *
 * A ROTA só grava o vínculo: as URLs entram nas colunas que o site já lê, por
 * `PATCH /api/estoque/[id]`, atrás do gate da matriz A17.
 *
 * ---------------------------------------------------------------------------
 * Por que a galeria grava sozinha, sem esperar o botão Salvar
 * ---------------------------------------------------------------------------
 * O resto do editor acumula alterações e grava no Salvar, e está certo: são
 * campos de texto, refazer custa segundos. Foto não: são vinte arquivos, minutos
 * de upload e uma sessão que não se repete. Fechar a aba antes de salvar
 * perderia tudo isso — então cada operação (enviar, reordenar, trocar a capa,
 * remover) grava na hora e diz o que fez.
 */

/** A frase de um erro qualquer, sem `any` e sem `[object Object]` na tela. */
function mensagemDoErro(e: unknown, padrao: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return padrao;
}

type Estado =
  | { tipo: "parado" }
  | { tipo: "enviando"; feito: number; total: number; etapa: string }
  | { tipo: "gravando" }
  /**
   * Buscando o anúncio no feed do RevendaMais — em `origem = 'sync'` e, desde
   * 06/10, no repasse (`destino.importacaoDoFeed`), que também baixa as fotos.
   */
  | { tipo: "importando" }
  /** Relendo a lista gravada, depois de uma importação que ficou sem resposta. */
  | { tipo: "conferindo" }
  | { tipo: "erro"; mensagem: string };

/**
 * O que ainda falta ao carro em preparação que já está no ar: "Faltam 3 para o
 * feed de anúncios e 7 para a ficha completa." A parte que já zerou não
 * aparece; com as duas zeradas, nada. O verbo concorda com o primeiro número.
 */
function faltasDoEmPreparacao(fotos: number): string {
  const partes = [
    { n: MINIMO_DE_FOTOS - fotos, para: "o feed de anúncios" },
    { n: FOTOS_DA_FICHA_COMPLETA - fotos, para: "a ficha completa" },
  ].filter((p) => p.n > 0);
  if (partes.length === 0) return "";
  const verbo = partes[0].n === 1 ? "Falta" : "Faltam";
  return `${verbo} ${partes.map((p) => `${p.n} para ${p.para}`).join(" e ")}.`;
}

/**
 * O destino padrão: o estoque. Mora aqui porque é a galeria que o conhece
 * (e `tests/fotos-do-veiculo` lê este arquivo atrás do endpoint do estoque).
 */
function destinoDoEstoque(estoqueId: number | string): DestinoDasFotos {
  return {
    caminho: (lote, variante) => caminhoDaFoto(estoqueId, lote, variante),
    gravarEm: `/api/estoque/${estoqueId}`,
    avisoSemEdicao:
      "Seu perfil vê as fotos e não as altera. Adicionar e reordenar foto é de Marketing, Comercial e Admin (matriz A17).",
    reguaDoEstoque: true,
  };
}

export default function GaleriaDeFotos({
  estoqueId,
  fotos,
  origem,
  podeEditar,
  aoGravar,
  destino,
  emPreparacao = false,
}: {
  estoqueId: number | string;
  fotos: FotoDoVeiculo[];
  /**
   * `painel` (cadastro nativo) ou `sync` (RevendaMais). **Não decide se a
   * galeria edita** — isso é só `podeEditar`, para carro de qualquer origem.
   * Decide uma coisa: se aparece o botão "Importar fotos do feed", que só serve
   * para carro que existe no RevendaMais. A rota `fotos-do-feed` recusa o
   * veículo do painel pelo mesmo critério.
   *
   * No `main`, até 16/09, ela também fechava o envio para carro do feed. O PR
   * #45 abriu a galeria para qualquer origem, e na fusão com o #75 (decisão do
   * dono, 16/09) ficou só este papel.
   */
  origem: string | null | undefined;
  /**
   * Matriz A17, linha "Adicionar e reordenar fotos". **É o único portão de
   * edição daqui** — e o mesmo que libera o botão de importar do feed.
   *
   * Até 2026-09-01 havia um segundo, `origem === "painel"`, e ele fechava a
   * galeria para 100% do estoque — nenhum veículo nativo existe. Caiu na F0.5:
   * a trava do sync tirou do RevendaMais o poder de reescrever foto, e em
   * 31/08 as fotos dos ativos passaram a ser nossas. Ver `estoqueEscrita.ts`,
   * bloco de `CAMPOS_DE_FOTO`.
   */
  podeEditar: boolean;
  /**
   * Chamado depois que a gravação VOLTOU OK, com as três colunas já no formato
   * do banco. O editor usa para atualizar o estado exibido e o estado salvo ao
   * mesmo tempo — senão a tela ficaria marcada como "Não salvo" por uma
   * alteração que já está no banco.
   */
  aoGravar: (colunas: ReturnType<typeof colunasDasFotos>) => void;
  /**
   * Para onde vão os arquivos e a gravação. Sem ele, o estoque. O repasse
   * passa `destinoDoRepasse(id)` (src/lib/destinoDasFotos.ts).
   */
  destino?: DestinoDasFotos;
  /**
   * A exceção do carro "em preparação" vale para este carro
   * (`liberadoEmPreparacao`)? Com ela, a porta é
   * `MINIMO_DE_FOTOS_EM_PREPARACAO` e a régua fala do feed de anúncios e da
   * ficha completa, que continuam pedindo as fotos de sempre.
   *
   * Quem decide é o editor, pelo estado SALVO da caixa: é o que o site e o
   * servidor enxergam. Sem isto, o carro em preparação com uma foto, que está
   * no ar, lia "Faltam 3 de 4 para este veículo aparecer na vitrine, no feed
   * de anúncios e na busca" — falso para vitrine e busca (revisão final,
   * 28/09).
   */
  emPreparacao?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "parado" });
  const [gravadoEm, setGravadoEm] = useState<string | null>(null);
  /** Repasse: a busca do carro do estoque está aberta, à espera da escolha. */
  const [escolhendoOCarro, setEscolhendoOCarro] = useState(false);
  /** Repasse: o que a última importação do feed trouxe, dito na tela. */
  const [avisoDoFeed, setAvisoDoFeed] = useState<string | null>(null);
  /**
   * A lista da tela pode estar velha: uma importação do feed ficou sem
   * resposta (rede caiu, função cortada), e o servidor pode ter gravado. A
   * gravação da galeria manda a lista INTEIRA, então gravar a partir de uma
   * lista velha apagaria as fotos importadas. Enquanto isto for verdade,
   * nenhuma ação grava sem antes reler (`conferirALista`).
   */
  const listaIncerta = useRef(false);
  const entrada = useRef<HTMLInputElement>(null);
  const alvo = destino ?? destinoDoEstoque(estoqueId);

  // Só para o botão de importar — nunca para decidir se a galeria edita.
  const doPainel = origem === "painel";
  const ocupado =
    estado.tipo === "enviando" ||
    estado.tipo === "gravando" ||
    estado.tipo === "importando" ||
    estado.tipo === "conferindo";
  // A porta que vale para ESTE carro — a mesma conta de `bloqueiosDePublicacao`.
  const minimoParaPublicar = emPreparacao ? MINIMO_DE_FOTOS_EM_PREPARACAO : MINIMO_DE_FOTOS;
  const faltam = Math.max(0, minimoParaPublicar - fotos.length);

  /**
   * Grava a lista nas três colunas e, só DEPOIS de a gravação voltar OK,
   * apaga do Storage o que saiu.
   *
   * A ordem não é detalhe. Apagar primeiro deixaria a coluna apontando para um
   * arquivo que não existe mais — e a vitrine mostraria imagem quebrada até
   * alguém perceber. Na ordem certa, o pior caso é um arquivo órfão no bucket,
   * que ninguém vê.
   */
  const gravar = useCallback(
    async (novas: FotoDoVeiculo[], removidas: FotoDoVeiculo[] = []) => {
      setAvisoDoFeed(null);
      setEstado({ tipo: "gravando" });
      const colunas = colunasDasFotos(novas);
      try {
        const res = await fetch(alvo.gravarEm, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(colunas),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Falha ao gravar as fotos.");

        aoGravar(colunas);
        setGravadoEm(
          new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        );
        setEstado({ tipo: "parado" });

        if (removidas.length > 0) {
          const caminhos = removidas
            .flatMap((f) => [caminhoDaUrlPublica(f.zap), caminhoDaUrlPublica(f.web)])
            .filter((c): c is string => Boolean(c));
          if (caminhos.length > 0) {
            const supabase = createBrowserSupabaseClient();
            const { error } = await supabase.storage.from(BUCKET_DE_FOTOS).remove(caminhos);
            // Falha na faxina não é erro de tela: a coluna já não aponta para
            // o arquivo, então o anúncio está correto. Sobra lixo no bucket.
            if (error) console.warn("[Fotos] arquivo órfão no bucket:", error.message);
          }
        }
      } catch (e: unknown) {
        setEstado({
          tipo: "erro",
          mensagem: mensagemDoErro(e, "Não deu para gravar as fotos. Tente de novo."),
        });
      }
    },
    [alvo.gravarEm, aoGravar],
  );

  /**
   * Traz as fotos que o anúncio tem AGORA no RevendaMais — e substitui a
   * galeria por elas, como o rótulo do botão avisa.
   *
   * Nasceu no #75 (15/09) como a saída do impasse que prendeu carro com
   * dezessete fotos no feed em `rascunho` por uma semana: desde 30/08 a trava
   * do banco descarta a foto que o sync manda, e esta galeria ainda recusava o
   * envio por ser carro do feed. Desde a fusão com o #45 (16/09) o envio daqui
   * vale para qualquer origem, e o botão continua como o jeito de trazer de uma
   * vez o que o anúncio já tem lá. Ver `lib/feedRevendaMais.ts`.
   *
   * Quem decide a hora é a pessoa, e é isso que separa este botão de reabrir a
   * coluna para o robô: o ciclo de seis horas passaria por cima da galeria
   * calado, e aqui a importação só acontece no clique.
   *
   * Não manda lista nenhuma no corpo — a rota vai à fonte e lê. O que o botão
   * promete é "o que o anúncio tem agora"; uma lista vinda do navegador trocaria
   * essa promessa pela palavra de quem chamou. Lista escolhida pela pessoa já
   * tem porta própria: o envio e a reordenação desta galeria.
   */
  const importarDoFeed = useCallback(async () => {
    setEstado({ tipo: "importando" });
    try {
      const res = await fetch(`/api/estoque/${estoqueId}/fotos-do-feed`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao importar as fotos do feed.");

      aoGravar({
        whatsapp_images: data.whatsapp_images,
        web_full_images: data.web_full_images,
        url_imagem: data.url_imagem,
      });
      setGravadoEm(
        new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      );
      setEstado({ tipo: "parado" });
    } catch (e: unknown) {
      setEstado({
        tipo: "erro",
        mensagem: mensagemDoErro(e, "Não deu para importar as fotos do feed."),
      });
    }
  }, [estoqueId, aoGravar]);

  /**
   * O mesmo botão, no repasse (dono, 06/10). O carro de repasse não tem
   * anúncio próprio no RevendaMais nem ligação com o estoque, então a pessoa
   * escolhe o carro na busca e a rota do destino traz as fotos do anúncio DELE.
   *
   * Duas diferenças para o estoque, as duas do lado da rota: as fotos são
   * baixadas para o nosso armazenamento (o repasse só publica foto nossa) e
   * SOMAM à galeria, sem repetir a que já veio. A lista continua não saindo
   * daqui: o corpo leva só o carro escolhido.
   */
  const rotaDoFeed = alvo.importacaoDoFeed?.rota;
  const reler = alvo.reler;
  const importarDoCarro = useCallback(
    async (carroId: number) => {
      if (!rotaDoFeed) return;
      setEscolhendoOCarro(false);
      setAvisoDoFeed(null);
      setEstado({ tipo: "importando" });
      // Só a recusa clara do servidor garante que nada foi gravado. Qualquer
      // outra falha (rede, 5xx, resposta pela metade) deixa a lista em dúvida.
      let recusaClara = false;
      try {
        const res = await fetch(rotaDoFeed, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estoqueId: carroId }),
        });
        const data = (await res.json().catch(() => ({}))) as Partial<RespostaDoFeed> & { error?: string };
        // Recusa clara do servidor (4xx com a frase dele): nada foi gravado.
        recusaClara = !res.ok && res.status < 500 && Boolean(data.error);
        if (!res.ok) throw new Error(data.error || "Falha ao importar as fotos do feed.");
        if (!Array.isArray(data.web_full_images) || !Array.isArray(data.whatsapp_images)) {
          throw new Error("A resposta da importação veio incompleta.");
        }

        // A galeria que vale é a que o servidor devolveu, tenha vindo foto ou
        // não: a tela a adota antes de qualquer outra ação.
        aoGravar(colunasDasFotos(fotosDoVeiculo(data.whatsapp_images, data.web_full_images)));
        listaIncerta.current = false;
        const vieram = data.vieram ?? 0;
        const resumo = resumoDaImportacao({
          vieram,
          jaEstavam: data.jaEstavam ?? 0,
          ficaramDeFora: data.ficaramDeFora ?? 0,
          acimaDoLimite: data.acimaDoLimite ?? 0,
          falharam: data.falharam ?? 0,
        });
        if (resumo.tipo === "erro") {
          setEstado({ tipo: "erro", mensagem: resumo.texto });
          return;
        }
        setAvisoDoFeed(resumo.texto);
        setEstado({ tipo: "parado" });
      } catch (e: unknown) {
        // Sem resposta confiável: tenta reler já. Se não der, a dúvida fica
        // marcada e a próxima ação relê antes de gravar.
        if (!recusaClara) listaIncerta.current = true;
        if (listaIncerta.current && reler) {
          try {
            const colunas = await reler();
            aoGravar(colunasDasFotos(fotosDoVeiculo(colunas.whatsapp_images, colunas.web_full_images)));
            listaIncerta.current = false;
          } catch {
            // Fica marcada.
          }
        }
        setEstado({
          tipo: "erro",
          mensagem: mensagemDoErro(e, "Não deu para importar as fotos do feed."),
        });
      }
    },
    [rotaDoFeed, reler, aoGravar],
  );

  /**
   * A lista sobre a qual a próxima ação pode gravar, ou `null` para parar.
   *
   * No caminho normal é a da tela. Com a dúvida marcada, relê a gravada: se
   * não der para ler, nada grava; se ela mudou, a tela a adota e a ação de
   * mover, trocar a capa ou remover NÃO é feita (o número da foto que a pessoa
   * clicou era o da lista velha). O envio segue (`seguirSeMudou`): foto nova
   * entra no fim, qualquer que seja a lista.
   */
  async function conferirALista(seguirSeMudou: boolean): Promise<FotoDoVeiculo[] | null> {
    if (!listaIncerta.current || !reler) return fotos;
    setAvisoDoFeed(null);
    setEstado({ tipo: "conferindo" });
    try {
      const colunas = await reler();
      const gravadas = fotosDoVeiculo(colunas.whatsapp_images, colunas.web_full_images);
      listaIncerta.current = false;
      const mudou =
        gravadas.length !== fotos.length || gravadas.some((g, i) => g.web !== fotos[i].web || g.zap !== fotos[i].zap);
      if (mudou) aoGravar(colunasDasFotos(gravadas));
      setEstado({ tipo: "parado" });
      if (mudou && !seguirSeMudou) {
        setAvisoDoFeed("A galeria foi atualizada com as fotos que já estavam gravadas. Confira e repita a ação.");
        return null;
      }
      return gravadas;
    } catch {
      setEstado({
        tipo: "erro",
        mensagem: "Não deu para conferir as fotos gravadas, então nada foi alterado. Tente de novo.",
      });
      return null;
    }
  }

  /** Mover, trocar a capa e remover passam por aqui: a ação recebe a lista conferida. */
  async function agir(fazer: (atual: FotoDoVeiculo[]) => void) {
    const atual = await conferirALista(false);
    if (atual) fazer(atual);
  }

  /**
   * Sobe os arquivos escolhidos, um a um, e grava a lista no fim.
   *
   * Um a um de propósito: a barra precisa dizer "3 de 12", e um `Promise.all`
   * de vinte uploads em 4G doméstico produz fila de rede sem nenhum retorno na
   * tela. Se um arquivo falhar, os anteriores continuam valendo — a lista é
   * gravada com o que subiu, e o erro nomeia o arquivo que ficou.
   */
  async function enviar(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    const lista = Array.from(arquivos);

    const base = await conferirALista(true);
    if (!base) {
      if (entrada.current) entrada.current.value = "";
      return;
    }
    setAvisoDoFeed(null);
    const supabase = createBrowserSupabaseClient();
    const subidas: FotoDoVeiculo[] = [];
    let falha: string | null = null;

    for (let i = 0; i < lista.length; i += 1) {
      const arquivo = lista[i];
      const problema = validarFoto(arquivo);
      if (problema) {
        falha = problema.mensagem;
        break;
      }

      try {
        setEstado({ tipo: "enviando", feito: i, total: lista.length, etapa: "Preparando" });
        const lote = novoLote();
        const versoes = await processarFotoDeVeiculo(arquivo, lote);

        setEstado({ tipo: "enviando", feito: i, total: lista.length, etapa: "Enviando" });
        const caminhos = {
          web: alvo.caminho(lote, "web"),
          zap: alvo.caminho(lote, "zap"),
        };

        for (const variante of ["zap", "web"] as const) {
          const { error } = await supabase.storage
            .from(BUCKET_DE_FOTOS)
            .upload(caminhos[variante], versoes[variante], {
              contentType: versoes[variante].type,
              upsert: false,
// 1 ano, e não a 1 h que o Storage carimba por padrão.
              //
              // A foto do card sai DIRETO do bucket — o card manda `unoptimized`
              // para foto nossa —, então quem decide o cache dela é este carimbo.
              // Com `max-age=3600`, navegador e borda rebaixam a MESMA foto de
              // hora em hora: egress que o plano free do Supabase (5 GB/mês) não
              // tem para gastar. Medido em 2026-09-09: 137 KB de média por foto de
              // card, ~8 por visita à home.
              //
              // ⚠️ Vale para o que subir DAQUI PARA A FRENTE. Os ~1.050 arquivos
              // que entraram em 31/08 ficaram com o padrão de 1 h e só mudam se
              // forem reescritos de propósito — ver a nota no script de migração.
              //
              // Seguro porque `novoLote()` + `upsert: false` dão caminho novo a
              // cada envio: foto trocada nasce com outra URL.
              cacheControl: "31536000",
            });
          if (error) throw new Error(error.message);
        }

        subidas.push({
          zap: supabase.storage.from(BUCKET_DE_FOTOS).getPublicUrl(caminhos.zap).data.publicUrl,
          web: supabase.storage.from(BUCKET_DE_FOTOS).getPublicUrl(caminhos.web).data.publicUrl,
        });
      } catch (e: unknown) {
        falha = `"${arquivo.name}": ${mensagemDoErro(e, "falha no envio")}.`;
        break;
      }
    }

    if (entrada.current) entrada.current.value = "";

    if (subidas.length > 0) {
      await gravar([...base, ...subidas]);
    }
    if (falha) {
      setEstado({
        tipo: "erro",
        mensagem:
          subidas.length > 0
            ? `${subidas.length} foto(s) entraram. Parou em ${falha}`
            : falha,
      });
    }
  }

  function remover(atual: FotoDoVeiculo[], indice: number) {
    const removida = atual[indice];
    if (!removida) return;
    gravar(
      atual.filter((_, i) => i !== indice),
      // Só o que é NOSSO vira faxina — `caminhoDaUrlPublica` devolve `null`
      // para o carro57, e o filtro dentro de `gravar` descarta.
      [removida],
    );
  }

  const rotulo =
    "mt-foco cursor-pointer border border-mt-regua-fina bg-mt-bg px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-[.06em] text-mt-neutral-800 hover:border-mt-accent hover:text-mt-ink disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <div className="mt-rotulo">Fotos · {fotos.length}</div>
        <span className="ml-auto text-[11px] text-mt-neutral-700">
          A primeira é a capa do anúncio e do card no catálogo
        </span>
      </div>

      {/* A régua, dita com as próprias constantes — nunca com o número escrito
          à mão. Se elas mudarem em `coerenciaDoCadastro`, estas frases mudam
          junto e o site continua concordando com a tela.

          TRÊS estados desde 2026-09-01, e o do meio é o que a mudança criou:
          o carro que já está no ar e ainda deve fotos. A barra fecha em
          `MINIMO_DE_FOTOS` porque a pergunta que ela existe para responder é
          "posso publicar?"; a meta das oito continua visível logo abaixo, como
          o que é — material que falta, não permissão. */}
      {alvo.reguaDoEstoque && (
        <div
          className={`mb-4 border-l-[3px] px-3 py-2.5 text-[11px] leading-snug ${
            faltam > 0
              ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800"
              : "border-mt-ink bg-mt-surface text-mt-neutral-800"
          }`}
        >
          {/* O carro em preparação tem a sua régua: vitrine e busca abrem
              com `MINIMO_DE_FOTOS_EM_PREPARACAO`, e o feed de anúncios
              continua pedindo `MINIMO_DE_FOTOS` (`entraNoFeedDeAnuncios`). */}
          {emPreparacao && faltam > 0 ? (
            <>
              <strong className="tabular-nums">
                Em preparação: {faltam === 1 ? "falta" : "faltam"} {faltam} de{" "}
                {MINIMO_DE_FOTOS_EM_PREPARACAO}
              </strong>{" "}
              para aparecer na vitrine e na busca. O feed de anúncios pede {MINIMO_DE_FOTOS}.
            </>
          ) : emPreparacao ? (
            <>
              <strong className="tabular-nums">
                Em preparação: no ar com {fotos.length} {fotos.length === 1 ? "foto" : "fotos"}.
              </strong>
              {faltasDoEmPreparacao(fotos.length) && <> {faltasDoEmPreparacao(fotos.length)}</>}
            </>
          ) : faltam > 0 ? (
            <>
              <strong className="tabular-nums">
                Faltam {faltam} de {MINIMO_DE_FOTOS}
              </strong>{" "}
              para este veículo aparecer na vitrine, no feed de anúncios e na busca.
            </>
          ) : fotos.length < FOTOS_DA_FICHA_COMPLETA ? (
            <>
              <strong className="tabular-nums">
                No ar com {fotos.length} fotos.
              </strong>{" "}
              Faltam {FOTOS_DA_FICHA_COMPLETA - fotos.length} para a ficha completa — pendência
              que <strong>não</strong> tira o carro do ar.
            </>
          ) : (
            <>
              <strong className="tabular-nums">
                {fotos.length} fotos — ficha completa.
              </strong>{" "}
              No ar, com o material que o anúncio pede.
            </>
          )}
        </div>
      )}

      {podeEditar && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            ref={entrada}
            id="fotos-do-veiculo"
            type="file"
            accept="image/*"
            multiple
            disabled={ocupado}
            onChange={(e) => enviar(e.target.files)}
            className="hidden"
          />
          <label
            htmlFor="fotos-do-veiculo"
            className={`mt-btn mt-btn-primario mt-foco min-h-11 px-5 py-2.5 text-[11px] ${
              ocupado ? "pointer-events-none opacity-45" : "cursor-pointer"
            }`}
          >
            {ocupado ? "Aguarde…" : "Enviar fotos"}
          </label>
          {/* Repasse: o mesmo "Importar fotos do feed" do carro do estoque, ao
              lado do envio. Abre a busca do carro; quem importa é a escolha. */}
          {alvo.importacaoDoFeed && (
            <button
              type="button"
              disabled={ocupado || escolhendoOCarro}
              onClick={() => setEscolhendoOCarro(true)}
              className="mt-btn mt-btn-contorno mt-foco min-h-11 px-5 py-2.5 text-[11px]"
            >
              {estado.tipo === "importando" ? "Buscando no feed…" : "Importar fotos do feed"}
            </button>
          )}
          <span className="text-[11px] leading-snug text-mt-neutral-700">
            JPG, PNG, WebP ou HEIC · até 15 MB cada · o tratamento e as duas versões
            (galeria e card) são gerados aqui, no envio
          </span>
        </div>
      )}

      {podeEditar && alvo.importacaoDoFeed && escolhendoOCarro && !ocupado && (
        <div className="mb-4 flex flex-col gap-2">
          <p className="m-0 text-[11px] leading-snug text-mt-neutral-800">
            Escolha o carro do estoque. As fotos do anúncio dele no RevendaMais entram depois das
            que já estão aqui, sem repetir as que já vieram. A capa não muda.
          </p>
          <BuscaDeCarro
            jaNaLista={[]}
            buscar={alvo.importacaoDoFeed.buscar}
            termoInicial={alvo.importacaoDoFeed.termoInicial}
            rotulo="De qual carro do estoque são as fotos?"
            aoEscolher={(carro) => void importarDoCarro(carro.id)}
            aoCancelar={() => setEscolhendoOCarro(false)}
          />
        </div>
      )}

      {/* Estados de carregamento e erro — sempre desenhados, nunca implícitos.
          Sem eles, um upload de 20 arquivos é uma tela parada. */}
      {estado.tipo === "enviando" && (
        <div className="mb-4 border-l-[3px] border-mt-ink bg-mt-surface px-3 py-2.5 text-[11px] text-mt-neutral-800">
          <span className="font-semibold">{estado.etapa}</span>{" "}
          <span className="tabular-nums">
            {estado.feito + 1} de {estado.total}
          </span>
          <div className="mt-2 h-1 w-full bg-mt-regua-fina">
            <div
              className="h-1 bg-mt-ink transition-all"
              style={{ width: `${Math.round((estado.feito / estado.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {estado.tipo === "gravando" && (
        <div className="mb-4 border-l-[3px] border-mt-ink bg-mt-surface px-3 py-2.5 text-[11px] text-mt-neutral-800">
          Gravando as fotos no anúncio…
        </div>
      )}
      {estado.tipo === "importando" && (
        <div className="mb-4 border-l-[3px] border-mt-ink bg-mt-surface px-3 py-2.5 text-[11px] text-mt-neutral-800">
          {alvo.importacaoDoFeed ? "Trazendo as fotos do RevendaMais…" : "Lendo o feed do RevendaMais…"}
        </div>
      )}
      {estado.tipo === "conferindo" && (
        <div className="mb-4 border-l-[3px] border-mt-ink bg-mt-surface px-3 py-2.5 text-[11px] text-mt-neutral-800">
          Conferindo as fotos gravadas…
        </div>
      )}
      {estado.tipo === "erro" && (
        <div
          role="alert"
          className="mb-4 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2.5 text-[11px] leading-snug text-mt-accent-800"
        >
          {estado.mensagem}
        </div>
      )}
      {estado.tipo === "parado" && avisoDoFeed && (
        <div
          role="status"
          className="mb-4 border-l-[3px] border-mt-ink bg-mt-surface px-3 py-2.5 text-[11px] leading-snug tabular-nums text-mt-neutral-800"
        >
          {avisoDoFeed}
        </div>
      )}
      {estado.tipo === "parado" && gravadoEm && !avisoDoFeed && (
        <div className="mb-4 text-[11px] text-mt-neutral-700">
          Fotos gravadas às <span className="tabular-nums">{gravadoEm}</span> — já valem no site.
        </div>
      )}

      {fotos.length === 0 ? (
        <p className="py-8 text-center text-xs text-mt-neutral-700">
          Nenhuma foto neste veículo.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((f, i) => (
            <div
              key={f.web + i}
              className="relative aspect-[4/3] overflow-hidden border border-mt-regua-fina bg-mt-surface"
            >
              {/* `<img>` cru, e não `next/image`: são as MESMAS fotos que o
                  site serve, e passá-las pelo otimizador aqui gastaria a cota
                  de imagem da Vercel (o 402 já aconteceu em produção) para
                  desenhar uma miniatura de painel interno. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.web} alt="" loading="lazy" className="h-full w-full object-cover" />

              {i === 0 && (
                <span className="absolute left-0 top-0 bg-mt-accent px-1.5 py-0.5 text-[9px] font-extrabold tracking-[.1em] text-mt-inverso">
                  CAPA
                </span>
              )}
              <span className="absolute right-0 top-0 bg-[rgba(20,18,18,.72)] px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-mt-inverso">
                {i + 1}
              </span>

              {podeEditar && (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-[rgba(20,18,18,.72)] p-1">
                  <button
                    type="button"
                    disabled={ocupado || i === 0}
                    onClick={() => void agir((atual) => gravar(moverFoto(atual, i, i - 1)))}
                    className={rotulo}
                    aria-label={`Mover a foto ${i + 1} para trás`}
                    title="Mover para trás"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={ocupado || i === fotos.length - 1}
                    onClick={() => void agir((atual) => gravar(moverFoto(atual, i, i + 1)))}
                    className={rotulo}
                    aria-label={`Mover a foto ${i + 1} para frente`}
                    title="Mover para frente"
                  >
                    →
                  </button>
                  {i !== 0 && (
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => void agir((atual) => gravar(moverFoto(atual, i, 0)))}
                      className={rotulo}
                      aria-label={`Usar a foto ${i + 1} como capa`}
                      title="Usar como capa"
                    >
                      Capa
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => void agir((atual) => remover(atual, i))}
                    className={`${rotulo} ml-auto`}
                    aria-label={`Remover a foto ${i + 1}`}
                    title="Remover"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Carro do feed: a foto chega por gente, por dois caminhos — o envio
          desta galeria, como em qualquer carro, e o botão que importa o que o
          anúncio tem no RevendaMais. O sincronizador não é um deles: desde
          30/08 a trava do banco descarta a foto que ele manda.

          Esta nota já disse duas coisas que deixaram de valer. Até 30/08,
          que o sync repunha a galeria a cada ciclo; de 15 a 16/09 (#75), que
          a foto do carro do feed só se subia no RevendaMais, com o envio daqui
          fechado. Somadas, as duas recusas prenderam carro com dezessete fotos
          no RevendaMais em `rascunho` por uma semana. O texto exato de nenhuma
          delas é reproduzido aqui: `tests/fotos-do-veiculo` procura pelos dois
          no arquivo inteiro para garantir que não voltem.

          Decisão do dono em 16/09, na fusão do #45 com o #75: galeria aberta a
          qualquer origem e botão mantido, com o aviso de que importar
          substitui a galeria. */}
      {!doPainel && (
        <div className="mt-4 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
          <p className="text-xs leading-relaxed text-mt-neutral-800">
            Este veículo veio do <strong>feed do RevendaMais</strong>, e as fotos dele
            chegam por dois caminhos: <strong>enviadas aqui</strong>, como as de qualquer
            carro, ou <strong>importadas do anúncio de lá</strong>. O sincronizador não
            grava foto — o anúncio que entra no feed antes das fotos fica sem elas até
            alguém enviar ou importar.
          </p>
          {podeEditar && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={ocupado}
                onClick={importarDoFeed}
                className={`mt-btn mt-btn-primario mt-foco px-5 py-2.5 text-[11px] ${
                  ocupado ? "pointer-events-none opacity-45" : ""
                }`}
              >
                {estado.tipo === "importando" ? "Buscando no feed…" : "Importar fotos do feed"}
              </button>
              <span className="text-[11px] leading-snug text-mt-neutral-700">
                substitui a galeria pela lista do RevendaMais · a primeira de lá vira a capa
              </span>
            </div>
          )}
          {/* "Seu perfil vê as fotos e não as altera" fica só no aviso de
              baixo, que agora vale para qualquer origem — repetido aqui, o
              carro do feed diria a mesma frase duas vezes. */}
          {!podeEditar && (
            <p className="mt-3 text-[11px] leading-relaxed text-mt-neutral-700">
              Importar do feed é de Marketing, Comercial e Admin (matriz A17).
            </p>
          )}
        </div>
      )}
      {!podeEditar && (
        <div className="mt-4 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
          <p className="text-xs leading-relaxed text-mt-neutral-800">{alvo.avisoSemEdicao}</p>
        </div>
      )}
    </>
  );
}
