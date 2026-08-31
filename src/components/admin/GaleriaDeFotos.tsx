"use client";

import { useCallback, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { processarFotoDeVeiculo } from "../../lib/imageProcessor";
import {
  BUCKET_DE_FOTOS,
  caminhoDaFoto,
  caminhoDaUrlPublica,
  colunasDasFotos,
  moverFoto,
  novoLote,
  validarFoto,
  type FotoDoVeiculo,
} from "../../lib/fotosDoVeiculo";
import { MINIMO_DE_FOTOS } from "../../lib/coerenciaDoCadastro";

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
 * é `MINIMO_DE_FOTOS`, a mesma que o site usa para filtrar a vitrine
 * (`bloqueiosDePublicacao`), e por isso o contador aqui e o site nunca
 * discordam. O operador sobe fotos até a barra fechar, arrasta a melhor para a
 * primeira posição — que é a capa do card, do card do WhatsApp e do anúncio no
 * portal — e o carro entra na vitrine no ciclo seguinte.
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
  | { tipo: "erro"; mensagem: string };

export default function GaleriaDeFotos({
  estoqueId,
  fotos,
  origem,
  podeEditar,
  aoGravar,
}: {
  estoqueId: number | string;
  fotos: FotoDoVeiculo[];
  /** `painel` (cadastro nativo) ou `sync` (RevendaMais). Decide se edita. */
  origem: string | null | undefined;
  /** Matriz A17, linha "Adicionar e reordenar fotos". */
  podeEditar: boolean;
  /**
   * Chamado depois que a gravação VOLTOU OK, com as três colunas já no formato
   * do banco. O editor usa para atualizar o estado exibido e o estado salvo ao
   * mesmo tempo — senão a tela ficaria marcada como "Não salvo" por uma
   * alteração que já está no banco.
   */
  aoGravar: (colunas: ReturnType<typeof colunasDasFotos>) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "parado" });
  const [gravadoEm, setGravadoEm] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const doPainel = origem === "painel";
  const ocupado = estado.tipo === "enviando" || estado.tipo === "gravando";
  const faltam = Math.max(0, MINIMO_DE_FOTOS - fotos.length);

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
      setEstado({ tipo: "gravando" });
      const colunas = colunasDasFotos(novas);
      try {
        const res = await fetch(`/api/estoque/${estoqueId}`, {
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
    [estoqueId, aoGravar],
  );

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
          web: caminhoDaFoto(estoqueId, lote, "web"),
          zap: caminhoDaFoto(estoqueId, lote, "zap"),
        };

        for (const variante of ["zap", "web"] as const) {
          const { error } = await supabase.storage
            .from(BUCKET_DE_FOTOS)
            .upload(caminhos[variante], versoes[variante], {
              contentType: versoes[variante].type,
              upsert: false,
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
      await gravar([...fotos, ...subidas]);
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

  function remover(indice: number) {
    const removida = fotos[indice];
    if (!removida) return;
    gravar(
      fotos.filter((_, i) => i !== indice),
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

      {/* A régua de publicação, dita com a própria função — nunca com o número
          escrito à mão. Se `MINIMO_DE_FOTOS` mudar em `coerenciaDoCadastro`,
          esta frase muda junto e o site continua concordando com a tela. */}
      <div
        className={`mb-4 border-l-[3px] px-3 py-2.5 text-[11px] leading-snug ${
          faltam > 0
            ? "border-mt-accent bg-mt-accent-100 text-mt-accent-800"
            : "border-mt-ink bg-mt-surface text-mt-neutral-800"
        }`}
      >
        {faltam > 0 ? (
          <>
            <strong className="tabular-nums">
              Faltam {faltam} de {MINIMO_DE_FOTOS}
            </strong>{" "}
            para este veículo aparecer na vitrine, no feed de anúncios e na busca.
          </>
        ) : (
          <>
            <strong className="tabular-nums">
              {fotos.length} fotos — mínimo de {MINIMO_DE_FOTOS} cumprido.
            </strong>{" "}
            A régua de publicação não trava mais por foto.
          </>
        )}
      </div>

      {podeEditar && doPainel && (
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
            className={`mt-btn mt-btn-primario mt-foco px-5 py-2.5 text-[11px] ${
              ocupado ? "pointer-events-none opacity-45" : "cursor-pointer"
            }`}
          >
            {ocupado ? "Aguarde…" : "Enviar fotos"}
          </label>
          <span className="text-[11px] leading-snug text-mt-neutral-700">
            JPG, PNG, WebP ou HEIC · até 15 MB cada · o tratamento e as duas versões
            (galeria e card) são gerados aqui, no envio
          </span>
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
      {estado.tipo === "erro" && (
        <div
          role="alert"
          className="mb-4 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2.5 text-[11px] leading-snug text-mt-accent-800"
        >
          {estado.mensagem}
        </div>
      )}
      {estado.tipo === "parado" && gravadoEm && (
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

              {podeEditar && doPainel && (
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-[rgba(20,18,18,.72)] p-1">
                  <button
                    type="button"
                    disabled={ocupado || i === 0}
                    onClick={() => gravar(moverFoto(fotos, i, i - 1))}
                    className={rotulo}
                    aria-label={`Mover a foto ${i + 1} para trás`}
                    title="Mover para trás"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    disabled={ocupado || i === fotos.length - 1}
                    onClick={() => gravar(moverFoto(fotos, i, i + 1))}
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
                      onClick={() => gravar(moverFoto(fotos, i, 0))}
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
                    onClick={() => remover(i)}
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

      {/* A explicação de por que o carro do feed não recebe foto aqui.
          Ela é a mesma nota que existia antes do storage próprio — continua
          verdadeira, só que agora apenas para `origem = 'sync'`. */}
      {!doPainel && (
        <div className="mt-4 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
          <p className="text-xs leading-relaxed text-mt-neutral-800">
            As fotos deste veículo vêm do <strong>feed do RevendaMais</strong> e são
            reescritas a cada sincronização — por isso enviar, reordenar ou remover aqui{" "}
            <strong>não é possível</strong>: a mudança se perderia no ciclo seguinte, em
            silêncio, e o carro sairia da vitrine sem ninguém ligar uma coisa à outra.
            Suba as fotos no RevendaMais. O envio pelo painel vale para o veículo
            cadastrado aqui, que o sincronizador não toca.
          </p>
        </div>
      )}
      {doPainel && !podeEditar && (
        <div className="mt-4 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
          <p className="text-xs leading-relaxed text-mt-neutral-800">
            Seu perfil vê as fotos e não as altera. Adicionar e reordenar foto é de
            Marketing, Comercial e Admin (matriz A17).
          </p>
        </div>
      )}
    </>
  );
}
