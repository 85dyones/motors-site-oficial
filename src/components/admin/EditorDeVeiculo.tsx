"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { podeGravarCampo, type Perfil } from "../../lib/permissoes";
import { CARROCERIAS } from "../../lib/classificacaoVeiculo";
import { PERFIS_DE_USO } from "../../lib/perfisDeUso";
import { bloqueiosDePublicacao, divergenciaDeCarroceria } from "../../lib/coerenciaDoCadastro";

/**
 * Tela A15 do design doc — editor de veículo.
 *
 * Antes disto, editar um carro era rolar até ele numa lista de 88 cards e
 * mexer nos campos ali mesmo. O doc pede tela dedicada, com abas e o
 * checklist de publicação sempre à vista — é o que esta é. Desde 2026-08-08 a
 * lista de cards não existe mais: quem lista é a tabela A6
 * (`/admin/estoque`), e é dela que se chega aqui.
 *
 * O que o doc desenha e NÃO está aqui, por não haver fonte:
 *
 * - **Visitas na página.** Vêm do GA4 por caminho, e a leitura hoje é feita em
 *   lote na tabela A6; por veículo, entra quando houver credencial garantida
 *   em produção.
 * - **Reordenar fotos / marca d'água.** As imagens vêm do feed do
 *   RevendaMais e são sobrescritas a cada sync; uma ordem salva aqui se
 *   perderia no ciclo seguinte. Entra junto com o storage próprio, quando o
 *   feed for descontinuado.
 * - **Enviar para revisão.** É a tela A16, ainda não construída.
 *
 * Cada um aparece nomeado na interface em vez de simulado — a régua da casa.
 */

interface VeiculoDb {
  id: number | string;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  ano: number | null;
  ano_fabricacao: number | null;
  quilometragem: number | null;
  cambio: string | null;
  combustivel: string | null;
  cor: string | null;
  preco: number | null;
  preco_original: number | null;
  whatsapp_images: string[] | null;
  pericia: string | null;
  descricao: string | null;
  descricao_seo: string | null;
  laudo_pericia: string | null;
  opcionais: string | null;
  tipo: string | null;
  perfil_uso: string | null;
  perfis_uso: string[] | null;
  status_tag: string | null;
  status_tag_color: string | null;
  vendido: boolean | null;
  created_at: string | null;
  last_seen_at: string | null;
  placa: string | null;
  motor: string | null;
  cor_interna: string | null;
  modelo_override: string | null;
  versao_override: string | null;
  donos_anteriores: number | null;
  garantia_fabrica: string | null;
  preco_compra: number | null;
}

type Aba = "fotos" | "ficha" | "opcionais" | "preco" | "texto";

interface LinhaDeHistorico {
  id: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  autor_nome: string | null;
  registrado_em: string;
}

/** Rótulo legível para o nome de coluna que o histórico grava. */
const NOME_DO_CAMPO: Record<string, string> = {
  placa: "Placa",
  motor: "Motor",
  cor_interna: "Cor interna",
  modelo_override: "Modelo",
  versao_override: "Versão",
  donos_anteriores: "Donos anteriores",
  garantia_fabrica: "Garantia de fábrica",
  preco_compra: "Preço de compra",
  descricao: "Descrição",
  descricao_seo: "Descrição para portais",
  laudo_pericia: "Laudo cautelar",
  opcionais: "Opcionais",
  status_tag: "Tag de destaque",
  status_tag_color: "Cor da tag",
  vendido: "Disponibilidade",
  tipo: "Carroceria",
  perfil_uso: "Perfil de uso",
  perfis_uso: "Para que serve",
};

/** Encurta valor longo (descrição, opcionais) para caber na linha. */
const resumir = (v: string | null) => {
  if (v === null || v === "") return "vazio";
  if (v === "true") return "vendido";
  if (v === "false") return "disponível";
  return v.length > 40 ? v.slice(0, 40) + "…" : v;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const campoCaixa =
  "mt-campo-caixa mt-foco";

export default function EditorDeVeiculo({
  inicial,
  visitas30Dias,
  perfil,
}: {
  inicial: VeiculoDb;
  /** `null` = GA4 não configurado ou indisponível. Nunca confundir com zero. */
  visitas30Dias: number | null;
  /** TODOS os papéis de quem abriu a tela (multi-papel, 2026-08-19) —
   *  `podeGravarCampo` soma: quem é comercial E financeiro grava o que
   *  qualquer um dos dois grava. Governa o que aparece e o que é enviado. */
  perfil: Perfil[];
}) {
  /** "Tudo que for negado some da interface, não fica cinza" — regra do doc
   *  A17. Campo que este perfil não grava não é desenhado, e por isso também
   *  não entra no corpo do PATCH: mandar um campo proibido faria a rota
   *  devolver 403 e derrubaria o salvamento inteiro, inclusive o que a pessoa
   *  podia mesmo alterar. */
  const podeGravar = (campo: string) => podeGravarCampo(perfil, campo);
  const [aba, setAba] = useState<Aba>("fotos");
  const [v, setV] = useState<VeiculoDb>(inicial);
  const [salvo, setSalvo] = useState<VeiculoDb>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [historico, setHistorico] = useState<LinhaDeHistorico[]>([]);
  const [migracaoPendente, setMigracaoPendente] = useState(false);

  const carregarHistorico = useCallback(async () => {
    try {
      const res = await fetch(`/api/estoque/${inicial.id}/historico`);
      const d = await res.json();
      setHistorico(d.historico ?? []);
      setMigracaoPendente(Boolean(d.migracaoPendente));
    } catch {
      /* histórico é informativo: falha nele não atrapalha a edição */
    }
  }, [inicial.id]);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  const sujo = JSON.stringify(v) !== JSON.stringify(salvo);
  const set = <K extends keyof VeiculoDb>(campo: K, valor: VeiculoDb[K]) =>
    setV((atual) => ({ ...atual, [campo]: valor }));

  /* O nome contradiz a carroceria salva? Só diagnóstico — ver
     `lib/coerenciaDoCadastro.ts`, que nunca escreve. */
  const divergencia = useMemo(
    () => divergenciaDeCarroceria({ marca: v.marca, modelo: v.modelo, versao: v.versao, tipo: v.tipo }),
    [v.marca, v.modelo, v.versao, v.tipo],
  );

  const fotos = useMemo(
    () => (Array.isArray(v.whatsapp_images) ? v.whatsapp_images.filter(Boolean) : []),
    [v.whatsapp_images],
  );

  const diasEmEstoque = useMemo(() => {
    if (!v.created_at) return null;
    const d = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86400000);
    return d >= 0 ? d : null;
  }, [v.created_at]);

  const fichaPropriaCompleta = Boolean(
    v.placa && v.motor && v.cor_interna && v.donos_anteriores !== null && v.garantia_fabrica,
  );

  /** Checklist de publicação — os itens do doc que temos como verificar. */
  const checklist = [
    {
      l: "8 fotos — bloqueia a publicação",
      d: "Frente, traseira, laterais, interior, painel e porta-malas.",
      ok: fotos.length >= 8,
      estado: fotos.length >= 8 ? "OK" : `FALTAM ${8 - fotos.length}`,
    },
    {
      l: "Ficha própria completa",
      d: "Placa, motor, cor interna, donos anteriores e garantia.",
      ok: fichaPropriaCompleta,
      estado: fichaPropriaCompleta ? "OK" : "PENDENTE",
    },
    {
      l: "Laudo cautelar",
      // Não diz "bloqueia" porque hoje não bloqueia: 38 das 39 fichas estão com
      // o campo vazio, e ligar o gate agora tiraria a loja do ar em vez de um
      // carro. Ver `LAUDO_BLOQUEIA_PUBLICACAO`.
      d: "Texto do laudo exibido na ficha do veículo.",
      ok: Boolean(v.laudo_pericia),
      estado: v.laudo_pericia ? "OK" : "PENDENTE",
    },
    {
      l: "Texto do anúncio revisado",
      d: "Descrição editorial que abre a página do veículo.",
      ok: Boolean(v.descricao),
      estado: v.descricao ? "OK" : "PENDENTE",
    },
    {
      l: "Opcionais preenchidos",
      d: "Os primeiros aparecem no card do catálogo.",
      ok: Boolean(v.opcionais),
      estado: v.opcionais ? "OK" : "PENDENTE",
    },
    // Só para quem vê custo: "PENDENTE" aqui já contaria a quem não pode ver
    // que o preço de compra está (ou não) lançado.
    ...(podeGravarCampo(perfil, "preco_compra")
      ? [
          {
            l: "Preço de compra lançado",
            d: "Sem ele a margem por veículo não fecha.",
            ok: v.preco_compra !== null && v.preco_compra !== undefined,
            estado: v.preco_compra ? "OK" : "PENDENTE",
          },
        ]
      : []),
    {
      l: "Carroceria e perfil",
      d: "Alimentam os filtros e a curadoria do site.",
      ok: Boolean(v.tipo && (v.perfis_uso ?? []).length > 0),
      estado: v.tipo && (v.perfis_uso ?? []).length > 0 ? "OK" : "PENDENTE",
    },
  ];
  const concluidos = checklist.filter((c) => c.ok).length;

  /* O que tira este carro do ar agora. Mesma função que `getEstoque` usa para
     filtrar, para a tela e o site nunca discordarem sobre o motivo.

     `.filter(bloqueia)` porque a lista traz também a pendência que ainda não
     tira do ar — dizer "fora da vitrine" para quem só está sem laudo seria a
     tela mentindo sobre o próprio site. */
  const bloqueios = useMemo(
    () =>
      bloqueiosDePublicacao({
        laudo_pericia: v.laudo_pericia,
        whatsapp_images: v.whatsapp_images,
      }).filter((b) => b.bloqueia),
    [v.laudo_pericia, v.whatsapp_images],
  );

  const margem =
    v.preco_compra && v.preco_original ? v.preco_original - Number(v.preco_compra) : null;
  const margemPct =
    margem !== null && v.preco_original ? (margem / v.preco_original) * 100 : null;

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const tudo: Record<string, unknown> = {
        placa: v.placa,
        motor: v.motor,
        cor_interna: v.cor_interna,
        donos_anteriores: v.donos_anteriores,
        garantia_fabrica: v.garantia_fabrica,
        preco_compra: v.preco_compra,
        descricao: v.descricao,
        descricao_seo: v.descricao_seo,
        laudo_pericia: v.laudo_pericia,
        opcionais: v.opcionais,
        status_tag: v.status_tag,
        status_tag_color: v.status_tag_color,
        vendido: v.vendido,
        tipo: v.tipo,
        perfis_uso: v.perfis_uso,
      };
      const corpo = Object.fromEntries(
        Object.entries(tudo).filter(([campo]) => podeGravar(campo)),
      );

      const res = await fetch(`/api/estoque/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      setSalvo(v);
      setAviso(
        data.mudancasRegistradas > 0
          ? `Salvo — ${data.mudancasRegistradas} alteração(ões) no histórico.`
          : "Salvo — nada havia mudado.",
      );
      carregarHistorico();
      setTimeout(() => setAviso(""), 4000);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const abas: Array<{ id: Aba; l: string; nota: string; alerta?: boolean }> = [
    { id: "fotos", l: "Fotos e mídia", nota: String(fotos.length) },
    { id: "ficha", l: "Ficha técnica", nota: fichaPropriaCompleta ? "COMPLETA" : "PENDENTE", alerta: !fichaPropriaCompleta },
    { id: "opcionais", l: "Opcionais", nota: v.opcionais ? "OK" : "VAZIO", alerta: !v.opcionais },
    {
      id: "preco",
      l: podeGravar("preco_compra") ? "Preço e margem" : "Preço e destaque",
      // Sem direito a custo, a aba não anuncia estado nenhum — o "PENDENTE"
      // era leitura indireta do preço de compra.
      nota: podeGravar("preco_compra") ? (v.preco_compra ? "OK" : "PENDENTE") : "",
      alerta: podeGravar("preco_compra") ? !v.preco_compra : false,
    },
    { id: "texto", l: "Texto e SEO", nota: v.descricao ? "OK" : "VAZIO", alerta: !v.descricao },
  ];

  return (
    <div className="flex w-full max-w-6xl flex-col gap-6">
      {/* Cabeçalho do veículo */}
      <div className="flex flex-wrap items-start gap-5 border-b-2 border-mt-regua pb-5">
        <div className="h-[82px] w-[132px] flex-none overflow-hidden border border-mt-regua-fina bg-mt-surface">
          {fotos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotos[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-mt-neutral-500">
              SEM FOTO
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Link
            href="/admin/estoque"
            className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 hover:text-mt-accent"
          >
            ← ESTOQUE
          </Link>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h1 className="mt-titulo text-2xl md:text-3xl">
              {v.marca} {v.modelo}
            </h1>
            <span
              className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                v.vendido
                  ? "bg-mt-accent-100 border border-mt-accent-300 text-mt-accent-800"
                  : "border border-mt-regua text-mt-neutral-700"
              }`}
            >
              {v.vendido ? "VENDIDO" : "PUBLICADO"}
            </span>
          </div>
          <div className="mt-1.5 text-xs text-mt-neutral-700">
            cód. {v.id} · {v.versao || "sem versão"} · {v.ano || "—"}
            {v.quilometragem ? ` · ${v.quilometragem.toLocaleString("pt-BR")} km` : ""}
            {v.placa ? ` · placa ${v.placa}` : ""}
            {diasEmEstoque !== null ? ` · ${diasEmEstoque} dias em estoque` : ""}
          </div>
        </div>

        <div className="flex flex-none items-center gap-3">
          {sujo && (
            <span className="text-[11px] font-semibold text-mt-accent-800">Não salvo</span>
          )}
          <button
            onClick={() => setV(salvo)}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px] disabled:opacity-45"
          >
            Descartar
          </button>
          <button
            onClick={salvar}
            disabled={!sujo || salvando}
            className="mt-btn mt-btn-primario mt-foco cursor-pointer px-5 py-2.5 text-[11px] disabled:opacity-45"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="border-l-[3px] border-mt-accent bg-mt-accent-100 px-4 py-3 text-xs text-mt-accent-800">
          {erro}
        </div>
      )}
      {aviso && (
        <div className="border-l-[3px] border-mt-ink bg-mt-surface px-4 py-3 text-xs text-mt-neutral-800">
          {aviso}
        </div>
      )}

      {/* Régua de status */}
      <div className="grid select-none grid-cols-2 border-t-2 border-mt-regua lg:grid-cols-4">
        {[
          { l: "Dias em estoque", v: diasEmEstoque !== null ? String(diasEmEstoque) : "—", nota: v.created_at ? "desde a entrada no feed" : "sem data de entrada" },
          { l: "Fotos", v: String(fotos.length), nota: fotos.length >= 8 ? "acima do mínimo" : "mínimo de 8" },
          { l: "Checklist", v: `${concluidos}/${checklist.length}`, nota: concluidos === checklist.length ? "pronto para publicar" : "itens pendentes" },
          {
            l: "Visitas na página",
            v: visitas30Dias === null ? "—" : visitas30Dias.toLocaleString("pt-BR"),
            nota: visitas30Dias === null ? "GA4 sem credencial de leitura" : "últimos 30 dias",
          },
        ].map((k) => (
          <div
            key={k.l}
            className="flex flex-col gap-2 border-b border-mt-regua-fina py-4 pr-5 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <span className="mt-rotulo">{k.l}</span>
            <span className="text-2xl font-extrabold tracking-[-.03em] tabular-nums">{k.v}</span>
            <span className="text-[11px] leading-tight text-mt-neutral-700">{k.nota}</span>
          </div>
        ))}
      </div>

      {/* Abas */}
      <div className="flex flex-wrap border-b-2 border-mt-regua">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`mt-foco flex cursor-pointer items-center gap-2 border-r border-mt-regua-fina px-5 py-3.5 text-[12px] font-extrabold uppercase tracking-[.08em] ${
              aba === a.id ? "bg-mt-ink text-mt-bg" : "text-mt-neutral-700 hover:text-mt-ink"
            }`}
          >
            {a.l}
            <span
              className={`text-[10px] font-semibold ${
                aba === a.id
                  ? "text-mt-neutral-400"
                  : a.alerta
                    ? "text-mt-accent"
                    : "text-mt-neutral-600"
              }`}
            >
              {a.nota}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-8 xl:flex-row">
        <div className="min-w-0 flex-1 xl:border-r xl:border-mt-regua-fina xl:pr-7">
          {aba === "fotos" && (
            <>
              <div className="mb-3 flex flex-wrap items-baseline gap-3">
                <div className="mt-rotulo">Fotos · {fotos.length}</div>
                <span className="ml-auto text-[11px] text-mt-neutral-700">
                  A primeira é a capa do anúncio e do card no catálogo
                </span>
              </div>
              {fotos.length === 0 ? (
                <p className="py-8 text-center text-xs text-mt-neutral-700">
                  Nenhuma foto neste veículo.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {fotos.map((f, i) => (
                    <div
                      key={f + i}
                      className="relative aspect-[4/3] overflow-hidden border border-mt-regua-fina bg-mt-surface"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f} alt="" className="h-full w-full object-cover" />
                      {i === 0 && (
                        <span className="absolute left-0 top-0 bg-mt-accent px-1.5 py-0.5 text-[9px] font-extrabold tracking-[.1em] text-mt-inverso">
                          CAPA
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
                <p className="text-xs leading-relaxed text-mt-neutral-800">
                  As fotos vêm do feed do RevendaMais e são reescritas a cada sincronização —
                  por isso <strong>reordenar, subir ou aplicar marca d&apos;água ainda não é
                  possível aqui</strong>: a mudança se perderia no ciclo seguinte. Entra junto
                  com o armazenamento próprio, quando o feed for descontinuado.
                </p>
              </div>
            </>
          )}

          {aba === "ficha" && (
            <>
              <div className="mt-rotulo mb-3">Ficha própria · preenchida por nós</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { campo: "placa" as const, l: "Placa", ph: "ABC1D23", up: true },
                  { campo: "motor" as const, l: "Motor", ph: "2.0 turbo · 249 cv" },
                  { campo: "cor_interna" as const, l: "Cor interna", ph: "Ebony" },
                  { campo: "garantia_fabrica" as const, l: "Garantia de fábrica", ph: "Até 03/2027" },
                ].filter((c) => podeGravar(c.campo)).map((c) => (
                  <div key={c.campo} className="flex flex-col gap-1.5">
                    <label className={rotuloCampo} htmlFor={`f-${c.campo}`}>{c.l}</label>
                    <input
                      id={`f-${c.campo}`}
                      value={(v[c.campo] as string) ?? ""}
                      placeholder={c.ph}
                      onChange={(e) =>
                        set(c.campo, (c.up ? e.target.value.toUpperCase() : e.target.value) as any)
                      }
                      className={campoCaixa}
                    />
                  </div>
                ))}
                {podeGravar("donos_anteriores") && (
                  <div className="flex flex-col gap-1.5">
                    <label className={rotuloCampo} htmlFor="f-donos">Donos anteriores</label>
                    <input
                      id="f-donos"
                      type="number"
                      min={0}
                      value={v.donos_anteriores ?? ""}
                      onChange={(e) =>
                        set("donos_anteriores", e.target.value === "" ? null : Number(e.target.value))
                      }
                      className={campoCaixa}
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 border-t-2 border-mt-regua pt-4">
                <div className="mt-rotulo mb-3">Do feed · sobrescrito a cada sync</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["Marca", v.marca],
                    ["Ano", v.ano ? String(v.ano) : null],
                    ["KM", v.quilometragem ? v.quilometragem.toLocaleString("pt-BR") : null],
                    ["Câmbio", v.cambio],
                    ["Combustível", v.combustivel],
                    ["Cor externa", v.cor],
                  ].map(([l, valor]) => (
                    <span
                      key={l as string}
                      className="inline-flex items-center gap-1.5 border border-mt-regua-fina bg-mt-bg px-2.5 py-1.5 text-[11px] text-mt-neutral-800"
                      title="Campo do feed — editar aqui seria perdido no próximo sync"
                    >
                      <span className="font-semibold uppercase tracking-[.08em] text-mt-neutral-600">
                        {l}
                      </span>
                      {valor || <span className="text-mt-neutral-500">—</span>}
                    </span>
                  ))}
                </div>
              </div>

              {/* Modelo e versão — os dois únicos campos do feed que dá para
                  corrigir, e por um caminho próprio.

                  Editar as colunas `modelo` e `versao` seria desfeito no
                  próximo ciclo do n8n: as duas estão entre as 22 que o
                  sincronizador manda. `modelo_override` e `versao_override`
                  (migração 20260826150000) o sync não conhece, e é isso que
                  faz a correção durar.

                  ⚠️ Mexer aqui MUDA A URL da ficha e o hub de modelo. Não é
                  cosmético: a rota já responde 301 do endereço antigo para o
                  novo, mas link externo antigo passa a dar um salto a mais. */}
              <div className="mt-6 border-t-2 border-mt-regua pt-4">
                <div className="mt-rotulo mb-1">Nome do veículo · corrige o que o feed erra</div>
                <p className="m-0 mb-3 max-w-[62ch] text-[11px] leading-relaxed text-mt-neutral-600">
                  Em branco, vale o que o RevendaMais mandou. Preenchido, vale o
                  que está aqui — e muda a URL da ficha e o agrupamento do hub
                  de modelo. Use quando o feed colar a versão inteira no campo
                  de modelo.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    {
                      campo: "modelo_override" as const,
                      l: "Modelo",
                      doFeed: v.modelo,
                      ph: "Ka",
                    },
                    {
                      campo: "versao_override" as const,
                      l: "Versão",
                      doFeed: v.versao,
                      ph: "Sedan 1.0 SE Flex 4p",
                    },
                  ].filter((c) => podeGravar(c.campo)).map((c) => (
                    <div key={c.campo} className="flex flex-col gap-1.5">
                      <label className={rotuloCampo} htmlFor={`f-${c.campo}`}>{c.l}</label>
                      <input
                        id={`f-${c.campo}`}
                        value={(v[c.campo] as string) ?? ""}
                        placeholder={c.ph}
                        onChange={(e) => set(c.campo, e.target.value)}
                        className={campoCaixa}
                      />
                      <span className="text-[10px] leading-snug text-mt-neutral-500">
                        No feed: {c.doFeed || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 border-t-2 border-mt-regua pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className={rotuloCampo} htmlFor="f-tipo">Carroceria</label>
                  {/* Lista fechada, não texto livre: era `<input>`, e o feed já
                      prova o que texto livre vira — "Hatch" em 20 dos 36
                      veículos, inclusive duas Kombi e um Bongo. Digitar
                      "Perúa" ou "sedã" criaria carroceria que nenhum hub
                      conhece. A lista em lote (`TabelaDeEstoque`) sempre foi
                      um `<select>`; esta tela é que divergia. */}
                  <select
                    id="f-tipo"
                    value={v.tipo ?? ""}
                    onChange={(e) => set("tipo", e.target.value)}
                    className={campoCaixa}
                  >
                    <option value="">— sem carroceria —</option>
                    {CARROCERIAS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {divergencia && (
                    /* Alerta, nunca bloqueio. O dono conhece o carro; a tabela
                       conhece o nome. Ele classificou a Saveiro Robust como
                       Utilitário de propósito, e um detector que reclamasse da
                       escolha dele seria desligado na primeira semana. */
                    <p className="m-0 border-l-[3px] border-mt-accent bg-mt-accent-100 px-2.5 py-2 text-[11px] leading-snug text-mt-accent-800">
                      Está <strong>{divergencia.atual}</strong>, mas o nome diz
                      que {divergencia.porque}. Esperado:{" "}
                      <strong>{divergencia.aceitaveis.join(" ou ")}</strong>.
                    </p>
                  )}
                </div>
              </div>

              {/* Para que o carro serve — vários, porque ele é várias coisas.

                  Era um campo de texto com UM valor, e o vocabulário antigo
                  tinha três rótulos dizendo quase a mesma coisa (19 dos 38
                  carros) mais quatro que não existiam em veículo nenhum.
                  Escolher um valor só obrigava a decidir qual verdade contar
                  sobre um HB20 que é urbano, econômico e primeiro carro.

                  Cada perfil marcado vira uma vitrine `/estoque/{slug}`. */}
              <div className="mt-6 border-t-2 border-mt-regua pt-4">
                <div className="mt-rotulo mb-1">Para que este carro serve</div>
                <p className="m-0 mb-3 max-w-[62ch] text-[11px] leading-relaxed text-mt-neutral-600">
                  Marque quantos couberem — um carro costuma servir para mais de
                  uma coisa. Cada marcação coloca o veículo na vitrine daquele
                  uso.
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  {PERFIS_DE_USO.map((perfil) => {
                    const marcado = (v.perfis_uso ?? []).includes(perfil.slug);
                    return (
                      <label
                        key={perfil.slug}
                        className="mt-foco flex cursor-pointer items-center gap-2 text-[12px] text-mt-ink"
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => {
                            const atuais = v.perfis_uso ?? [];
                            // Reordena pela lista canônica em vez de empurrar
                            // no fim: assim a ordem gravada não depende da
                            // ordem dos cliques, e o histórico não registra
                            // mudança quando só a ordem mudou.
                            const proximos = PERFIS_DE_USO.filter((p) =>
                              p.slug === perfil.slug ? !marcado : atuais.includes(p.slug),
                            ).map((p) => p.slug);
                            set("perfis_uso", proximos as any);
                          }}
                          className="h-3.5 w-3.5 accent-mt-accent"
                        />
                        {perfil.nome}
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {aba === "opcionais" && (
            <>
              <div className="mb-3 flex flex-wrap items-baseline gap-3">
                <div className="mt-rotulo">Opcionais e equipamentos</div>
                <span className="ml-auto text-[11px] text-mt-neutral-700">
                  separados por vírgula · os primeiros aparecem no card
                </span>
              </div>
              <textarea
                rows={5}
                value={v.opcionais ?? ""}
                onChange={(e) => set("opcionais", e.target.value)}
                placeholder="Teto solar, Bancos de couro, Câmera 360, Piloto adaptativo…"
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
              {v.opcionais && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.opcionais
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean)
                    .map((o, i) => (
                      <span
                        key={o + i}
                        className="inline-flex items-center gap-1.5 border border-mt-regua px-2.5 py-1.5 text-[11px] text-mt-ink"
                      >
                        <span className="h-2 w-2 flex-none bg-mt-ink" />
                        {o}
                      </span>
                    ))}
                </div>
              )}
              <p className="mt-4 text-[11px] leading-relaxed text-mt-neutral-700">
                O doc agrupa os opcionais em Conforto, Segurança, Tecnologia e Exterior. O
                agrupamento exige um catálogo de opcionais que ainda não existe — hoje o campo
                é texto livre, e os chips acima são a leitura dele.
              </p>
            </>
          )}

          {aba === "preco" && (
            <>
              <div className="mt-rotulo mb-3">Preço e margem</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className={rotuloCampo}>Preço anunciado · do feed</span>
                  <div className="border border-mt-regua-fina bg-mt-surface px-3 py-2.5 text-lg font-extrabold tabular-nums tracking-[-.03em] text-mt-neutral-700">
                    {v.preco_original ? brl(v.preco_original) : "—"}
                  </div>
                </div>
                {podeGravar("preco_compra") && (
                  <div className="flex flex-col gap-1.5">
                    <label className={rotuloCampo} htmlFor="f-compra">
                      Preço de compra · nosso
                    </label>
                    <input
                      id="f-compra"
                      type="number"
                      min={0}
                      value={v.preco_compra ?? ""}
                      placeholder="Ex: 248000"
                      onChange={(e) =>
                        set("preco_compra", e.target.value === "" ? null : Number(e.target.value))
                      }
                      className={`${campoCaixa} border-mt-accent text-lg font-extrabold`}
                    />
                  </div>
                )}
              </div>

              {/* Margem sai junto com o custo, e por não-renderização, não por
                  CSS: ela é o custo por subtração, e um `hidden` deixaria o
                  valor no HTML para quem abrir o código-fonte. */}
              {podeGravar("preco_compra") && (
                <>
                  <div className="mt-5 flex flex-wrap items-baseline gap-3 border-t-2 border-mt-regua pt-4">
                    <span className="text-sm text-mt-neutral-800">Margem bruta projetada</span>
                    <span
                      className={`ml-auto text-xl font-extrabold tabular-nums tracking-[-.03em] ${
                        margem === null
                          ? "text-mt-neutral-500"
                          : margem >= 0
                            ? "text-mt-accent-800"
                            : "text-mt-accent"
                      }`}
                    >
                      {margem === null
                        ? "—"
                        : `${brl(margem)} · ${margemPct!.toFixed(1).replace(".", ",")}%`}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-mt-neutral-700">
                    Bruta: preço anunciado menos o de compra. Não inclui preparação,
                    documentação nem custo de pátio — esses entram por lançamento no
                    financeiro e aparecem em
                    <Link href="/admin/financeiro/margens" className="ml-1 font-semibold text-mt-accent underline underline-offset-2">
                      margem por veículo
                    </Link>
                    .
                  </p>
                </>
              )}

              <div className="mt-6 grid grid-cols-1 gap-4 border-t-2 border-mt-regua pt-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className={rotuloCampo} htmlFor="f-tag">Tag de destaque</label>
                  <input
                    id="f-tag"
                    value={v.status_tag ?? ""}
                    placeholder="ÚNICO DONO"
                    onChange={(e) => set("status_tag", e.target.value)}
                    className={campoCaixa}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className={rotuloCampo}>Disponibilidade</span>
                  <div className="mt-seg">
                    {[
                      [false, "Disponível"],
                      [true, "Vendido"],
                    ].map(([valor, rotulo]) => (
                      <label key={String(valor)} className="mt-seg-opt">
                        <input
                          type="radio"
                          name="disponibilidade"
                          checked={Boolean(v.vendido) === valor}
                          onChange={() => set("vendido", valor as boolean)}
                        />
                        <span>{rotulo as string}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {aba === "texto" && (
            <>
              <div className="mt-rotulo mb-3">Descrição editorial</div>
              <textarea
                rows={7}
                value={v.descricao ?? ""}
                onChange={(e) => set("descricao", e.target.value)}
                placeholder="Texto que abre a página do veículo."
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
              <div className="mt-rotulo mb-3 mt-6">Descrição para portais e busca</div>
              <textarea
                rows={3}
                value={v.descricao_seo ?? ""}
                onChange={(e) => set("descricao_seo", e.target.value)}
                placeholder="Frase curta do anúncio: o que diferencia este carro, sem depender do contexto da página."
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
              <p className="mt-3 text-[11px] leading-relaxed text-mt-neutral-700">
                Vai para o feed dos portais e para a descrição que aparece na busca do Google.
                Vazio, o site usa a descrição editorial acima — e só na falta das duas cai numa
                frase genérica. O Google mostra cerca de 155 caracteres.
                {v.descricao_seo ? ` Atual: ${v.descricao_seo.length}.` : ""}
              </p>

              <div className="mt-rotulo mb-3 mt-6">Laudo cautelar</div>
              <textarea
                rows={5}
                value={v.laudo_pericia ?? ""}
                onChange={(e) => set("laudo_pericia", e.target.value)}
                placeholder="Ex: Laudo cautelar aprovado. Pintura original, sem retoques."
                className="mt-campo-caixa mt-foco resize-y leading-relaxed"
              />
              <p className="mt-3 text-[11px] leading-relaxed text-mt-neutral-700">
                O laudo só acende o selo de perícia aprovada no site quando o próprio feed traz
                a perícia como aprovada — texto aqui não liga selo, para não afirmar ao cliente
                algo que a vistoria não disse.
              </p>
            </>
          )}
        </div>

        {/* Checklist */}
        <div className="w-full flex-none xl:w-[340px]">
          <div className="mt-rotulo mt-rotulo-accent mb-3">Checklist de publicação</div>

          {/* O estado, dito antes dos itens. Desde 2026-08-27 o item de fotos
              não é conselho: abaixo de 8, o carro sai da vitrine, do feed do
              Ads e do índice de busca. A ficha continua respondendo — quem tem
              o link não bate em 404 — e voltar ao ar é só subir as fotos que
              faltam no RevendaMais. */}
          {bloqueios.length > 0 && (
            <div className="mb-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2.5 text-[11px] leading-snug text-mt-accent-800">
              <strong>Fora da vitrine.</strong> Este veículo não aparece no site
              nem no feed de anúncios enquanto:
              <ul className="m-0 mt-1.5 list-disc pl-4">
                {bloqueios.map((b) => (
                  <li key={b.id}>{b.texto}</li>
                ))}
              </ul>
            </div>
          )}
          {checklist.map((c) => (
            <div key={c.l} className="flex gap-3 border-b border-mt-regua-fina py-2.5">
              <span
                className={`mt-0.5 h-3.5 w-3.5 flex-none border-2 ${
                  c.ok ? "border-mt-ink bg-mt-ink" : "border-mt-accent bg-transparent"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-${c.ok ? "semibold" : "extrabold"}`}>{c.l}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-mt-neutral-700">{c.d}</div>
              </div>
              <span
                className={`flex-none text-[9px] font-bold uppercase tracking-wider ${
                  c.ok ? "text-mt-neutral-600" : "text-mt-accent"
                }`}
              >
                {c.estado}
              </span>
            </div>
          ))}
          <div className="mt-3 flex items-baseline gap-2 border-t-2 border-mt-regua pt-3">
            <span className="text-[13px] font-extrabold">
              {concluidos} de {checklist.length} concluídos
            </span>
            {concluidos < checklist.length && (
              <span className="ml-auto text-[11px] text-mt-neutral-700">
                faltam {checklist.length - concluidos}
              </span>
            )}
          </div>

          {/* Histórico deste veículo */}
          <div className="mt-6 border-t-2 border-mt-regua pt-4">
            <div className="mt-rotulo mb-3">Histórico deste veículo</div>
            {migracaoPendente ? (
              <p className="text-[11px] leading-relaxed text-mt-neutral-700">
                A tabela de histórico ainda não existe no banco. Aplique a migração{" "}
                <code className="text-mt-ink">20260807190000_historico_veiculo.sql</code> para
                começar a registrar quem mudou o quê.
              </p>
            ) : historico.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-mt-neutral-700">
                Nenhuma alteração registrada ainda. A partir de agora, cada campo salvo aqui
                entra nesta lista com autor e horário.
              </p>
            ) : (
              historico.map((h) => (
                <div key={h.id} className="border-b border-mt-regua-fina py-2.5 text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-mt-ink">
                      {NOME_DO_CAMPO[h.campo] ?? h.campo}
                    </span>
                    <span className="ml-auto flex-none text-[11px] tabular-nums text-mt-neutral-700">
                      {new Date(h.registrado_em).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 leading-snug text-mt-neutral-800">
                    <span className="text-mt-neutral-600 line-through">
                      {resumir(h.valor_anterior)}
                    </span>
                    <span className="mx-1.5 text-mt-neutral-500">→</span>
                    <span className="font-semibold">{resumir(h.valor_novo)}</span>
                  </div>
                  {h.autor_nome && (
                    <div className="mt-0.5 text-[11px] text-mt-neutral-700">{h.autor_nome}</div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mt-6 border-l-[3px] border-mt-accent bg-mt-surface px-4 py-3.5">
            <div className="mt-rotulo mb-2">Ainda sem fonte</div>
            <p className="text-xs leading-relaxed text-mt-neutral-800">
              <strong>Visitas na página</strong> dependem da leitura do GA4 — a coleta já
              acontece no site, falta a credencial de serviço para o painel consultar. O envio
              para revisão é a tela A16.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
