"use client";

import { useCallback, useEffect, useState } from "react";
import type { EstadoDoGuia } from "../../lib/guias";
import { NOME_DA_SECAO } from "../../lib/guias";
import {
  REGUA_DESCRIPTION,
  SEM_CABECALHO,
  TETO_DO_CAMPO,
  podeSalvarCabecalho,
  podeVoltarAoPadrao,
  salvarCabecalho,
  type CabecalhoNaTela,
} from "../../lib/salvarCabecalho";
import { carregarPainel, type GuiaDoPainel } from "../../lib/carregarPainelDeGuias";

/**
 * O editor de guias.
 *
 * ---------------------------------------------------------------------------
 * Parágrafos separados por linha em branco
 * ---------------------------------------------------------------------------
 * Mesma escolha de `TextosDosHubs`, pelo mesmo motivo: é como as pessoas já
 * escrevem, e faz o NÚMERO de parágrafos ser decisão de quem escreve em vez de
 * decisão da tela. Um campo por parágrafo obrigaria a clicar em "adicionar"
 * antes de cada ideia.
 *
 * O mesmo vale para as seções e o FAQ, com uma diferença: ali a estrutura
 * importa (cada seção é um `<h2>`, cada pergunta é um par no `FAQPage`), então
 * são blocos de verdade — mas o corpo de cada um continua sendo texto corrido.
 *
 * ---------------------------------------------------------------------------
 * "Salvar" PRESERVA o estado. Mudar de estado é ação própria.
 * ---------------------------------------------------------------------------
 * A primeira versão tinha "Salvar rascunho" e "Publicar", e o docblock dizia
 * que "salvar nunca muda o estado". Era falso, e o efeito era caro: num guia
 * PUBLICADO, "Salvar rascunho" despublicava — e como a API revalida o cluster
 * na hora, a página saía do ar imediatamente. Quem só queria corrigir um
 * parágrafo precisava adivinhar que a ação certa era "Republicar", e nada
 * pedia confirmação. A revisão pegou.
 *
 * Agora são três ações com nomes que dizem o que fazem:
 *
 *  · **Salvar** — grava o texto e mantém o estado, seja qual for. É o botão
 *    que quem edita usa noventa por cento das vezes.
 *  · **Publicar** — só aparece no rascunho. Quando o guia não está pronto, a
 *    API devolve 422 com a lista do que falta, e a tela mostra a lista em vez
 *    de um "erro ao salvar" opaco.
 *  · **Despublicar** — só aparece no publicado, e pede confirmação, porque
 *    tira uma página indexada do ar.
 */



const CAMPO =
  "w-full border border-mt-regua-fina bg-mt-bg px-3 py-2 text-[13px] text-mt-ink outline-none focus:border-mt-accent";
const BOTAO =
  "border border-mt-regua px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink hover:border-mt-accent disabled:opacity-40";

/** Texto corrido ↔ parágrafos. Linha em branco separa. */
const paraTexto = (paragrafos: string[]) => paragrafos.join("\n\n");
const paraParagrafos = (texto: string) =>
  texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export default function EditorDeGuias() {
  const [guias, setGuias] = useState<GuiaDoPainel[]>([]);
  const [regua, setRegua] = useState<string[]>([]);
  const [aberto, setAberto] = useState<GuiaDoPainel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string; itens?: string[] } | null>(
    null,
  );
  // O que está GRAVADO (campo vazio = automático) e o que o CÓDIGO usa quando
  // está vazio. São coisas diferentes de propósito: o segundo vira `placeholder`,
  // para o campo em branco não parecer página sem texto.
  const [cabecalho, setCabecalho] = useState<CabecalhoNaTela>(SEM_CABECALHO);
  const [padrao, setPadrao] = useState<CabecalhoNaTela>(SEM_CABECALHO);
  /**
   * O cabeçalho foi LIDO com sucesso? Falso trava o salvamento.
   *
   * Não é zelo: sem isto havia um caminho vivo de PERDA, e ele levou DUAS
   * rodadas de revisão para fechar.
   *
   * Na primeira, `carregar()` estourava antes de preencher o cabeçalho quando o
   * GET falhava — campos vazios, tela liberada, Salvar habilitado. Na segunda,
   * com a trava já no lugar, a revisão reproduziu o mesmo desfecho por outra
   * porta: a resposta tem DUAS metades com clientes diferentes (os guias pela
   * sessão, o cabeçalho pelo `anon`), e um timeout só na segunda devolvia 200
   * com os campos nulos — indistinguível de "sem override". A tela concluía que
   * tinha lido.
   *
   * Como o PUT substitui a linha inteira, um clique nesse estado apaga o texto
   * que está no ar, e vai ao ar no mesmo request por causa do
   * `revalidarCluster`. Hoje o valor vem do servidor (`cabecalhoLido`), e a
   * decisão de habilitar mora em `podeSalvarCabecalho`, que tem teste.
   */
  const [cabecalhoLido, setCabecalhoLido] = useState(false);

  // A chamada e a leitura do corpo moram em `lib/carregarPainelDeGuias.ts`,
  // com teste próprio — a metade que apagava texto era esta.
  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await carregarPainel();
    if (r.ok) {
      setGuias(r.guias);
      setRegua(r.regua);
      setCabecalho(r.cabecalho);
      setPadrao(r.padrao);
      // E NÃO `true`: a resposta pode trazer a listagem e falhar só na metade
      // do cabeçalho — clientes diferentes, uma cai sozinha. Assumir que leu
      // era o caminho que apagava o texto do dono.
      setCabecalhoLido(r.cabecalhoLido);
      if (r.aviso) setAviso({ tipo: "erro", texto: r.aviso });
    } else {
      // Travar em vez de gravar por cima: uma recarga que falha depois de uma
      // que deu certo deixaria texto velho na mão, e o PUT substitui a linha.
      setCabecalhoLido(false);
      setAviso({ tipo: "erro", texto: r.texto });
    }
    setCarregando(false);
  }, []);

  // A chamada, o tratamento de erro e a escolha da mensagem moram em
  // `lib/salvarCabecalho.ts`, com teste próprio: `renderToStaticMarkup` não
  // enxerga `onClick`, então o que ficaria descoberto aqui seria comportamento,
  // e não um identificador. Ver o docblock de lá.
  async function aoSalvarCabecalho() {
    setSalvando(true);
    const r = await salvarCabecalho(cabecalho);
    if (r.ok) {
      setCabecalho(r.cabecalho);
      setAviso({ tipo: "ok", texto: r.texto, itens: r.avisos });
    } else {
      setAviso({ tipo: "erro", texto: r.texto });
    }
    setSalvando(false);
  }

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criar() {
    const titulo = window.prompt("Título do guia novo:");
    if (!titulo?.trim()) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/guias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: titulo.trim() }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error || "Falha ao criar");
      await carregar();
      setAberto(dados.guia);
      setAviso({ tipo: "ok", texto: `Guia criado como rascunho em /guias/${dados.guia.slug}.` });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  async function salvar(estado: EstadoDoGuia) {
    if (!aberto) return;
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/guias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: aberto.slug,
          titulo: aberto.titulo,
          tituloSeo: aberto.titulo_seo,
          descricao: aberto.descricao,
          corpo: aberto.corpo,
          faq: aberto.faq,
          saida: aberto.saida,
          sobre: aberto.sobre ?? [],
          estado,
        }),
      });
      const dados = await r.json();
      if (!r.ok) {
        // 422 traz a lista do que falta para publicar. Mostrar a lista é a
        // diferença entre "conserte isto" e "deu erro".
        setAviso({ tipo: "erro", texto: dados.error || "Falha ao salvar", itens: dados.problemas });
        return;
      }
      const antes = aberto.estado;
      setAberto(dados.guia);
      await carregar();
      setAviso({
        tipo: "ok",
        texto:
          estado === antes
            ? // O caso comum: corrigiu um parágrafo. A mensagem diz onde o
              // texto foi parar, porque publicado e rascunho vão a lugares
              // diferentes.
              estado === "publicado"
              ? `Salvo. A página no ar em /guias/${dados.guia.slug} já mostra a alteração.`
              : "Rascunho salvo. Não aparece no site nem no sitemap."
            : estado === "publicado"
              ? `Publicado. Já está no ar em /guias/${dados.guia.slug}.`
              : "Despublicado. A página saiu do ar e do sitemap.",
      });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(slug: string) {
    if (!window.confirm(`Apagar o guia /guias/${slug}? A página sai do ar.`)) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/guias?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.error || "Falha ao excluir");
      setAberto(null);
      await carregar();
      setAviso({ tipo: "ok", texto: "Guia apagado." });
    } catch (e) {
      setAviso({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  function mexer(troca: Partial<GuiaDoPainel>) {
    setAberto((atual) => (atual ? { ...atual, ...troca } : atual));
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-2">
        {/* A tela nomeia a seção que ela edita — o menu lateral fica "Guias",
            que é rótulo de navegação e vive entre outros nove. */}
        <h1 className="mt-titulo m-0 text-[24px]">{NOME_DA_SECAO}</h1>
        <span className="text-[12px] text-mt-neutral-700">
          O conteúdo de <code>/guias</code>. Rascunho não aparece no site nem no sitemap.
        </span>
      </div>

      {regua.length > 0 && (
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          <strong>A régua de um guia:</strong>
          <ul className="m-0 mt-1.5 list-disc pl-4">
            {regua.map((linha) => (
              <li key={linha}>{linha}</li>
            ))}
          </ul>
        </div>
      )}

      {/* O cabeçalho da SEÇÃO — não de um guia. Fica acima da lista porque é o
          que o visitante lê antes de escolher qual guia abrir, e porque a
          pergunta "o que esta seção é?" vem antes de "que guias ela tem?".

          O nome "Guias Motors" não está aqui de propósito: ele alimenta seis
          superfícies do site travadas por teste, e um campo aqui tiraria essa
          trava do caminho. Decisão do dono em 07/09. */}
      <section className="border border-mt-regua p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="mt-titulo m-0 text-[16px]">Cabeçalho da seção</h2>
          <span className="text-[12px] text-mt-neutral-700">
            O que aparece no topo de <code>/guias</code> e na busca. Campo vazio volta ao texto
            padrão.
          </span>
        </div>

        <label className="mt-3 block text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-neutral-700">
          Título da aba e da busca
          <input
            className={`${CAMPO} mt-1 normal-case`}
            value={cabecalho.tituloSeo}
            placeholder={padrao.tituloSeo}
            maxLength={TETO_DO_CAMPO}
            onChange={(e) => setCabecalho((c) => ({ ...c, tituloSeo: e.target.value }))}
          />
        </label>
        <p className="m-0 mt-1 text-[11px] text-mt-neutral-700">
          O site acrescenta <code>| Motors Store</code> no fim — não precisa repetir.
        </p>

        <label className="mt-3 block text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-neutral-700">
          Parágrafo de abertura
          <textarea
            className={`${CAMPO} mt-1 min-h-[88px] normal-case`}
            value={cabecalho.resumo}
            placeholder={padrao.resumo}
            maxLength={TETO_DO_CAMPO}
            onChange={(e) => setCabecalho((c) => ({ ...c, resumo: e.target.value }))}
          />
        </label>
        <p className="m-0 mt-1 text-[11px] text-mt-neutral-700">
          Aparece em quatro lugares: sob o título da página, no resultado do Google, no card do
          WhatsApp e no preview aqui do painel.{" "}
          {/* Contador, e não bloqueio: o teto do banco é 300 e a régua da busca é
              155. Recusar por três caracteres seria pior que uma description
              cortada — quem decide o texto é quem escreve. */}
          <span
            className={
              cabecalho.resumo.length > REGUA_DESCRIPTION ? "font-bold text-mt-accent" : ""
            }
          >
            {cabecalho.resumo.length}/{REGUA_DESCRIPTION} caracteres
            {cabecalho.resumo.length > REGUA_DESCRIPTION ? " — a busca pode cortar o fim." : ""}
          </span>
        </p>

        {!cabecalhoLido && !carregando && (
          // O aviso existe porque um botão desabilitado sem explicação é pior
          // que um botão que apaga: quem não sabe por que não pode salvar
          // recarrega, tenta de novo, e conclui que o painel está quebrado.
          <p className="m-0 mt-3 border-l-[3px] border-mt-accent bg-mt-surface px-3 py-2 text-[12px] text-mt-neutral-800">
            Não consegui ler o cabeçalho que está no ar, então travei o
            salvamento. Os campos acima estão vazios por isso — não porque a
            seção esteja sem texto. Recarregue a página; se persistir, o texto
            no site continua o mesmo.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={BOTAO}
            onClick={aoSalvarCabecalho}
            // `cabecalhoLido` é a trava contra apagar o que está no ar depois
            // de uma falha de leitura — o PUT substitui a linha inteira.
            disabled={!podeSalvarCabecalho({ salvando, carregando, cabecalhoLido })}
          >
            Salvar cabeçalho
          </button>
          <button
            className={BOTAO}
            onClick={() => setCabecalho(SEM_CABECALHO)}
            disabled={!podeVoltarAoPadrao({ salvando, carregando, cabecalhoLido, cabecalho })}
          >
            Voltar ao padrão
          </button>
        </div>
      </section>

      {aviso && (
        <div
          className={
            aviso.tipo === "ok"
              ? "border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800"
              : "border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800"
          }
        >
          {aviso.texto}
          {aviso.itens && aviso.itens.length > 0 && (
            <ul className="m-0 mt-1.5 list-disc pl-4">
              {aviso.itens.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ─── A lista ─── */}
        <div className="flex flex-col gap-4 border border-mt-regua-fina p-4">
          <button type="button" onClick={criar} disabled={salvando} className={BOTAO}>
            + Guia novo
          </button>

          {carregando && <p className="m-0 text-[12px] text-mt-neutral-700">Carregando…</p>}

          {!carregando && guias.length === 0 && (
            <div className="flex items-center justify-center border border-dashed border-mt-regua-fina p-8 text-center text-[12px] text-mt-neutral-700">
              Nenhum guia ainda. O primeiro define o tom dos outros.
            </div>
          )}

          {guias.map((g) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => {
                setAberto(g);
                setAviso(null);
              }}
              className={`flex flex-col gap-1 border p-3 text-left ${
                aberto?.slug === g.slug ? "border-mt-accent" : "border-mt-regua-fina"
              }`}
            >
              <span className="flex items-center gap-2 text-[11px] text-mt-neutral-800">
                <span
                  className={
                    g.estado === "publicado"
                      ? "border border-mt-ink px-1.5 py-0.5 text-[10px] font-extrabold uppercase"
                      : "border border-mt-accent px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-mt-accent-800"
                  }
                >
                  {g.estado}
                </span>
                <code className="text-[10px]">/guias/{g.slug}</code>
              </span>
              <span className="text-[13px] font-extrabold text-mt-ink">{g.titulo}</span>
            </button>
          ))}
        </div>

        {/* ─── O editor ─── */}
        {!aberto ? (
          <div className="flex items-center justify-center border border-dashed border-mt-regua-fina p-8 text-center text-[12px] text-mt-neutral-700">
            Escolha um guia à esquerda, ou crie um novo.
          </div>
        ) : (
          <div className="flex flex-col gap-4 border border-mt-regua-fina p-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[11px] text-mt-neutral-700">/guias/{aberto.slug}</code>
              {aberto.estado === "publicado" && (
                <a
                  href={`/guias/${aberto.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] underline"
                >
                  ver no site
                </a>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">Título</span>
              <input
                className={CAMPO}
                value={aberto.titulo}
                onChange={(e) => mexer({ titulo: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">
                Título da aba <span className="font-normal normal-case">(vazio = usa o título)</span>
              </span>
              <input
                className={CAMPO}
                value={aberto.titulo_seo ?? ""}
                onChange={(e) => mexer({ titulo_seo: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">
                Descrição <span className="font-normal normal-case">(o resumo que aparece na busca)</span>
              </span>
              <textarea
                className={CAMPO}
                rows={2}
                value={aberto.descricao}
                onChange={(e) => mexer({ descricao: e.target.value })}
              />
            </label>

            {/* Seções */}
            <div className="flex flex-col gap-3 border-t border-mt-regua pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">Seções</span>
                <button
                  type="button"
                  className={BOTAO}
                  onClick={() =>
                    mexer({ corpo: [...aberto.corpo, { titulo: "", paragrafos: [] }] })
                  }
                >
                  + seção
                </button>
              </div>

              {aberto.corpo.map((secao, i) => (
                <div key={i} className="flex flex-col gap-2 border border-mt-regua-fina p-3">
                  <div className="flex w-full items-baseline gap-2">
                    <input
                      className={CAMPO}
                      placeholder="Título da seção"
                      value={secao.titulo}
                      onChange={(e) => {
                        const corpo = [...aberto.corpo];
                        corpo[i] = { ...secao, titulo: e.target.value };
                        mexer({ corpo });
                      }}
                    />
                    <button
                      type="button"
                      className={BOTAO}
                      onClick={() => mexer({ corpo: aberto.corpo.filter((_, j) => j !== i) })}
                    >
                      remover
                    </button>
                  </div>
                  <textarea
                    className={CAMPO}
                    rows={6}
                    placeholder="Os parágrafos, separados por uma linha em branco."
                    value={paraTexto(secao.paragrafos)}
                    onChange={(e) => {
                      const corpo = [...aberto.corpo];
                      corpo[i] = { ...secao, paragrafos: paraParagrafos(e.target.value) };
                      mexer({ corpo });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* FAQ */}
            <div className="flex flex-col gap-3 border-t border-mt-regua pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">
                  Perguntas frequentes
                </span>
                <button
                  type="button"
                  className={BOTAO}
                  onClick={() => mexer({ faq: [...aberto.faq, { pergunta: "", resposta: "" }] })}
                >
                  + pergunta
                </button>
              </div>
              <p className="m-0 text-[11px] text-mt-neutral-700">
                Estas perguntas também viram dado estruturado. O texto marcado precisa ser idêntico
                ao visível — por isso não use HTML aqui.
              </p>

              {aberto.faq.map((item, i) => (
                <div key={i} className="flex flex-col gap-2 border border-mt-regua-fina p-3">
                  <div className="flex w-full items-baseline gap-2">
                    <input
                      className={CAMPO}
                      placeholder="A pergunta"
                      value={item.pergunta}
                      onChange={(e) => {
                        const faq = [...aberto.faq];
                        faq[i] = { ...item, pergunta: e.target.value };
                        mexer({ faq });
                      }}
                    />
                    <button
                      type="button"
                      className={BOTAO}
                      onClick={() => mexer({ faq: aberto.faq.filter((_, j) => j !== i) })}
                    >
                      remover
                    </button>
                  </div>
                  <textarea
                    className={CAMPO}
                    rows={3}
                    placeholder="A resposta"
                    value={item.resposta}
                    onChange={(e) => {
                      const faq = [...aberto.faq];
                      faq[i] = { ...item, resposta: e.target.value };
                      mexer({ faq });
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Saída comercial */}
            <div className="flex flex-col gap-2 border-t border-mt-regua pt-3">
              <span className="text-[11px] font-extrabold uppercase tracking-[.06em]">
                Saída comercial
              </span>
              <p className="m-0 text-[11px] text-mt-neutral-700">
                Para onde o leitor vai depois. Caminho interno, começando com barra.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={CAMPO}
                  placeholder="Rótulo do botão"
                  value={aberto.saida?.rotulo ?? ""}
                  onChange={(e) =>
                    mexer({
                      saida: { rotulo: e.target.value, href: aberto.saida?.href ?? "", apoio: aberto.saida?.apoio ?? "" },
                    })
                  }
                />
                <input
                  className={CAMPO}
                  placeholder="/garantia"
                  value={aberto.saida?.href ?? ""}
                  onChange={(e) =>
                    mexer({
                      saida: { rotulo: aberto.saida?.rotulo ?? "", href: e.target.value, apoio: aberto.saida?.apoio ?? "" },
                    })
                  }
                />
              </div>
              <input
                className={CAMPO}
                placeholder="A frase de apoio"
                value={aberto.saida?.apoio ?? ""}
                onChange={(e) =>
                  mexer({
                    saida: { rotulo: aberto.saida?.rotulo ?? "", href: aberto.saida?.href ?? "", apoio: e.target.value },
                  })
                }
              />
            </div>

            {/* Ações.

                "Salvar" manda o estado ATUAL — é o que faz editar um guia no
                ar não tirá-lo do ar. A versão anterior tinha "Salvar rascunho",
                que despublicava em silêncio. Mudar de estado agora exige o
                botão que diz o nome do que faz. */}
            <div className="flex flex-wrap items-center gap-2 border-t border-mt-regua pt-3">
              <button
                type="button"
                className={BOTAO}
                disabled={salvando}
                onClick={() => salvar(aberto.estado)}
              >
                Salvar
              </button>

              {aberto.estado === "rascunho" ? (
                <button
                  type="button"
                  className={`${BOTAO} border-mt-accent text-mt-accent-800`}
                  disabled={salvando}
                  onClick={() => salvar("publicado")}
                >
                  Publicar
                </button>
              ) : (
                <button
                  type="button"
                  className={BOTAO}
                  disabled={salvando}
                  onClick={() => {
                    // Confirma porque tira do ar uma página que o Google pode
                    // já ter indexado — o mesmo peso de "Apagar".
                    if (
                      window.confirm(
                        `Despublicar /guias/${aberto.slug}? A página sai do ar e do sitemap.`,
                      )
                    ) {
                      void salvar("rascunho");
                    }
                  }}
                >
                  Despublicar
                </button>
              )}

              <button
                type="button"
                className={BOTAO}
                disabled={salvando}
                onClick={() => excluir(aberto.slug)}
              >
                Apagar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
