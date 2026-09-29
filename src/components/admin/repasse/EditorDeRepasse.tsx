"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import GaleriaDeFotos from "../GaleriaDeFotos";
import AcoesDoRepasse from "./AcoesDoRepasse";
import ConsultaFipeDoRepasse from "./ConsultaFipeDoRepasse";
import FichaDeEstadoNoEditor from "./FichaDeEstadoNoEditor";
import InscritosQueCombinam from "./InscritosQueCombinam";
import type { InscritoDoRepasse } from "../../../lib/avisosDoRepasse";
import { checklistCompletoNa, checklistDoRepasse, termosProibidosEm } from "../../../lib/checklistDoRepasse";
import { destinoDoRepasse } from "../../../lib/destinoDasFotos";
import { alteracoes, formularioDe, podeEditarORepasse, validaRepasse, type FormularioDoRepasse } from "../../../lib/edicaoDoRepasse";
import { comItem } from "../../../lib/fichaDeEstado";
import { fotosDoVeiculo } from "../../../lib/fotosDoVeiculo";
import { CAMINHO_DO_PAINEL_DO_REPASSE, caminhoDoCarroNoPainel } from "../../../lib/painelDoRepasse";
import type { Perfil } from "../../../lib/permissoes";
import {
  CARROCERIAS_DO_REPASSE,
  NOME_DA_SITUACAO,
  aparecePublicamente,
  contaDoRepasse,
  emReais,
  soParaLojistas,
  type Repasse,
  type RepasseDoPainel,
} from "../../../lib/repasse";

const rotuloCampo = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const caixa = "mt-campo-caixa mt-foco";

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={rotuloCampo}>{rotulo}</span>
      {children}
    </label>
  );
}

function AvisoDeTermo({ texto }: { texto: string | null }) {
  const achados = termosProibidosEm(texto);
  if (achados.length === 0) return null;
  return <p className="text-[11px] text-mt-accent-800">Este texto usa um termo que o repasse não usa: {achados[0]}.</p>;
}

const simNao = (v: boolean | null) => (v === null ? "" : v ? "sim" : "nao");
const deSimNao = (v: string): boolean | null => (v === "" ? null : v === "sim");
const numeroOuNulo = (v: string): number | null => (v === "" ? null : Number(v));

/**
 * O editor de um carro de repasse (spec §6): dados, FIPE, fotos, ficha de
 * estado, histórico, textos, o checklist ao vivo, os atos de situação e, para
 * quem valida num carro publicado, quem avisar.
 *
 * Grava só o que mudou (`alteracoes`) por PATCH; a rota decide de novo tudo o
 * que este componente oferece.
 *
 * Fora do rascunho, quem não valida vê o carro inteiro com os campos
 * travados, e sem o botão de salvar. É o mesmo carro que já está no site, e
 * essa pessoa precisa ler o que vai pedir ao validador. Nenhum campo do
 * repasse é sigiloso por perfil: o que a regra "campo que o perfil não grava
 * não é renderizado" protege no estoque (o custo de compra) não existe aqui.
 * Ação negada, essa sim, some (botões de ato, salvar, a lista do repasse).
 */
export default function EditorDeRepasse({
  repasse: inicial,
  perfis,
  inscritos,
  avisados,
  urlDaFicha,
}: {
  repasse: RepasseDoPainel;
  perfis: Perfil[];
  /** null: o perfil não vê a lista do repasse. */
  inscritos: InscritoDoRepasse[] | null;
  avisados: string[];
  urlDaFicha: string;
}) {
  const router = useRouter();
  const [repasse, setRepasse] = useState<RepasseDoPainel>(inicial);
  const [form, setForm] = useState<FormularioDoRepasse>(() => formularioDe(inicial));
  const [salvo, setSalvo] = useState<FormularioDoRepasse>(() => formularioDe(inicial));
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string; problemas: string[] } | null>(null);

  const podeEditar = podeEditarORepasse(repasse, perfis);
  const pendente = useMemo(() => alteracoes(form, salvo), [form, salvo]);
  const alterado = Object.keys(pendente).length > 0;
  const atual: Repasse = { ...repasse, ...form };
  const faltas = checklistDoRepasse(atual);
  const conta = contaDoRepasse(atual);
  const nome = [atual.marca, atual.modelo, atual.versao, atual.ano_modelo].filter(Boolean).join(" ");

  const mudar = (parcial: Partial<FormularioDoRepasse>) => setForm((f) => ({ ...f, ...parcial }));

  /**
   * Aplica a linha que voltou do servidor sem apagar o que a pessoa digitou
   * ENQUANTO o pedido estava no ar: reaplica por cima da nova base as
   * alterações feitas depois de `base` (o formulário no instante do envio).
   */
  function aplicar(novo: RepasseDoPainel, base: FormularioDoRepasse) {
    setRepasse(novo);
    const f = formularioDe(novo);
    setSalvo(f);
    setForm((atual) => ({ ...f, ...alteracoes(atual, base) }));
    router.refresh();
  }

  async function salvar() {
    setSalvando(true);
    setMensagem(null);
    const enviado = form;
    try {
      const res = await fetch(`/api/repasses/${repasse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendente),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; problemas?: unknown; repasse?: RepasseDoPainel };
      if (!res.ok || !data.repasse) {
        setMensagem({
          tipo: "erro",
          texto: data.error || "Não deu para salvar.",
          problemas: Array.isArray(data.problemas) ? data.problemas.filter((p): p is string => typeof p === "string") : [],
        });
        return;
      }
      aplicar(data.repasse, enviado);
      setMensagem({ tipo: "ok", texto: "Salvo.", problemas: [] });
    } catch {
      setMensagem({ tipo: "erro", texto: "Não deu para salvar. Confira a conexão.", problemas: [] });
    } finally {
      setSalvando(false);
    }
  }

  const fotos = fotosDoVeiculo(form.whatsapp_images, form.web_full_images);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <div className="border-b-2 border-mt-regua pb-5">
        <nav aria-label="Trilha" className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700">
          <Link href={CAMINHO_DO_PAINEL_DO_REPASSE} className="text-mt-neutral-700 no-underline hover:text-mt-accent">
            ← REPASSE
          </Link>
          {" / "}
          {/* A visão do carro (28/09): o editor é um passo dentro dela. */}
          <Link href={caminhoDoCarroNoPainel(repasse.id)} className="text-mt-neutral-700 no-underline hover:text-mt-accent">
            VER O CARRO
          </Link>
        </nav>
        <h1 className="mt-titulo mt-1 text-2xl md:text-3xl">{nome}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <span className="mt-rotulo">{NOME_DA_SITUACAO[repasse.situacao]}</span>
          {repasse.situacao === "publicado" && <span>{soParaLojistas(repasse) ? "Só para lojistas" : "Aberto a todos"}</span>}
          {aparecePublicamente(repasse, new Date()) && (
            <a href={urlDaFicha} target="_blank" rel="noreferrer" className="underline">
              Ver no site
            </a>
          )}
        </p>
        {repasse.situacao === "rascunho" && repasse.devolvido_com && (
          <p className="mt-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2 text-xs text-mt-accent-800">
            Devolvido para rascunho: {repasse.devolvido_com}
          </p>
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="mt-rotulo md:col-span-3">O carro</div>
        <Campo rotulo="Marca">
          <input className={caixa} value={form.marca} disabled={!podeEditar} onChange={(e) => mudar({ marca: e.target.value })} />
        </Campo>
        <Campo rotulo="Modelo">
          <input className={caixa} value={form.modelo} disabled={!podeEditar} onChange={(e) => mudar({ modelo: e.target.value })} />
        </Campo>
        <Campo rotulo="Versão">
          <input className={caixa} value={form.versao ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ versao: e.target.value || null })} />
        </Campo>
        <Campo rotulo="Ano do modelo">
          <input className={caixa} type="number" value={form.ano_modelo || ""} disabled={!podeEditar} onChange={(e) => mudar({ ano_modelo: Number(e.target.value) })} />
        </Campo>
        <Campo rotulo="Ano de fabricação">
          <input className={caixa} type="number" value={form.ano_fabricacao ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ ano_fabricacao: numeroOuNulo(e.target.value) })} />
        </Campo>
        <Campo rotulo="Quilometragem">
          <input className={caixa} type="number" min={0} value={form.quilometragem} disabled={!podeEditar} onChange={(e) => mudar({ quilometragem: Number(e.target.value) })} />
        </Campo>
        <Campo rotulo="Câmbio">
          <input className={caixa} value={form.cambio ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ cambio: e.target.value || null })} />
        </Campo>
        <Campo rotulo="Combustível">
          <input className={caixa} value={form.combustivel ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ combustivel: e.target.value || null })} />
        </Campo>
        <Campo rotulo="Cor">
          <input className={caixa} value={form.cor ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ cor: e.target.value || null })} />
        </Campo>
        <Campo rotulo="Carroceria">
          <select className={caixa} value={form.carroceria ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ carroceria: (e.target.value || null) as Repasse["carroceria"] })}>
            <option value="">Escolha</option>
            {CARROCERIAS_DO_REPASSE.map((c) => (
              <option key={c} value={c}>
                {c === "seda" ? "Sedã" : c === "suv" ? "SUV" : c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Preço à vista (R$)">
          <input className={caixa} type="number" min={1} value={form.preco || ""} disabled={!podeEditar} onChange={(e) => mudar({ preco: Number(e.target.value) })} />
        </Campo>
      </section>

      <section className="flex flex-col gap-3">
        <div className="mt-rotulo">FIPE</div>
        <ConsultaFipeDoRepasse
          podeEditar={podeEditar}
          aoEscolher={(v) => mudar({ fipe_valor: v.valor, fipe_codigo: v.codigo || null, fipe_mes_referencia: v.mesReferencia || null })}
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Campo rotulo="Valor FIPE (R$)">
            <input className={caixa} type="number" value={form.fipe_valor ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ fipe_valor: numeroOuNulo(e.target.value) })} />
          </Campo>
          <Campo rotulo="Código">
            <input className={caixa} value={form.fipe_codigo ?? ""} disabled />
          </Campo>
          <Campo rotulo="Mês de referência">
            <input className={caixa} value={form.fipe_mes_referencia ?? ""} disabled />
          </Campo>
        </div>
        <p className="text-xs tabular-nums">
          Você gasta {emReais(conta.voceGasta)}
          {conta.abaixoDaFipe !== null &&
            (conta.abaixoDaFipe > 0
              ? ` · ${emReais(conta.abaixoDaFipe)} abaixo da FIPE`
              : ` · ${emReais(-conta.abaixoDaFipe)} acima da FIPE`)}
        </p>
      </section>

      <section>
        <GaleriaDeFotos
          estoqueId={repasse.id}
          fotos={fotos}
          origem="painel"
          podeEditar={podeEditar}
          destino={destinoDoRepasse(repasse.id)}
          aoGravar={(colunas) => {
            const parcial = { web_full_images: colunas.web_full_images, whatsapp_images: colunas.whatsapp_images };
            setForm((f) => ({ ...f, ...parcial }));
            setSalvo((s) => ({ ...s, ...parcial }));
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="mt-rotulo">Laudo cautelar</div>
        <div className="flex flex-wrap gap-4 text-xs">
          {(
            [
              ["aprovado", "Aprovado"],
              ["aprovado_com_apontamento", "Aprovado com apontamento"],
              ["nao_feito", "Não feito"],
            ] as const
          ).map(([valor, rotulo]) => (
            <label key={valor} className="flex items-center gap-2">
              <input type="radio" name="laudo" checked={form.laudo === valor} disabled={!podeEditar} onChange={() => mudar({ laudo: valor })} />
              {rotulo}
            </label>
          ))}
        </div>
        {form.laudo === "aprovado_com_apontamento" && (
          <Campo rotulo="O apontamento">
            <textarea className={`${caixa} min-h-16`} value={form.laudo_apontamento ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ laudo_apontamento: e.target.value || null })} />
          </Campo>
        )}
        <p className="text-[11px] text-mt-neutral-700">Carro reprovado no laudo não entra no repasse.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="mt-rotulo md:col-span-2">Histórico</div>
        <Campo rotulo="Leilão">
          <select className={caixa} value={simNao(form.leilao_consta)} disabled={!podeEditar} onChange={(e) => mudar({ leilao_consta: deSimNao(e.target.value) })}>
            <option value="">Informe</option>
            <option value="nao">Não consta</option>
            <option value="sim">Consta</option>
          </select>
        </Campo>
        <Campo rotulo="Sinistro">
          <select className={caixa} value={simNao(form.sinistro_consta)} disabled={!podeEditar} onChange={(e) => mudar({ sinistro_consta: deSimNao(e.target.value) })}>
            <option value="">Informe</option>
            <option value="nao">Não consta</option>
            <option value="sim">Consta</option>
          </select>
        </Campo>
        {form.leilao_consta === true && (
          <Campo rotulo="O registro de leilão">
            <textarea className={`${caixa} min-h-16`} value={form.leilao_detalhe ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ leilao_detalhe: e.target.value || null })} />
          </Campo>
        )}
        {form.sinistro_consta === true && (
          <Campo rotulo="O registro de sinistro">
            <textarea className={`${caixa} min-h-16`} value={form.sinistro_detalhe ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ sinistro_detalhe: e.target.value || null })} />
          </Campo>
        )}
        <Campo rotulo="Data da consulta do histórico">
          <input className={caixa} type="date" value={form.historico_consultado_em ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ historico_consultado_em: e.target.value || null })} />
        </Campo>
      </section>

      <FichaDeEstadoNoEditor
        repasseId={repasse.id}
        itens={form.itens_de_estado}
        semDefeitos={form.sem_defeitos_conhecidos}
        oficina={form.oficina_do_orcamento}
        orcamentoEm={form.orcamento_em}
        podeEditar={podeEditar}
        aoMudar={mudar}
        aoMudarItem={(i, parcial) => setForm((f) => ({ ...f, itens_de_estado: comItem(f.itens_de_estado, i, parcial) }))}
      />

      <section className="flex flex-col gap-3">
        <div className="mt-rotulo">Textos</div>
        <Campo rotulo={`Linha do card (${(form.resumo ?? "").length}/140)`}>
          <input className={caixa} maxLength={140} value={form.resumo ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ resumo: e.target.value || null })} />
        </Campo>
        <AvisoDeTermo texto={form.resumo} />
        <Campo rotulo="Por que está no repasse">
          <textarea className={`${caixa} min-h-24`} value={form.motivo ?? ""} disabled={!podeEditar} onChange={(e) => mudar({ motivo: e.target.value || null })} />
        </Campo>
        <AvisoDeTermo texto={form.motivo} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="mt-rotulo">Checklist</div>
        {faltas.length === 0 ? (
          <p className="text-xs">{checklistCompletoNa(repasse.situacao)}</p>
        ) : (
          <ul className="list-disc pl-4 text-xs text-mt-accent-800">
            {faltas.map((f) => (
              <li key={`${f.campo}-${f.mensagem}`}>{f.mensagem}</li>
            ))}
          </ul>
        )}
      </section>

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!alterado || salvando} onClick={() => void salvar()} className="mt-btn mt-btn-primario mt-foco px-5 py-2.5 text-[11px]">
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          {mensagem && (
            <div role={mensagem.tipo === "erro" ? "alert" : "status"} className="text-xs">
              <p className={mensagem.tipo === "erro" ? "text-mt-accent-800" : ""}>{mensagem.texto}</p>
              {mensagem.problemas.length > 0 && (
                <ul className="list-disc pl-4">
                  {mensagem.problemas.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <AcoesDoRepasse repasse={repasse} perfis={perfis} alterado={alterado} aoMudar={(novo) => aplicar(novo, salvo)} />

      {inscritos !== null && validaRepasse(perfis) && repasse.situacao === "publicado" && (
        <InscritosQueCombinam repasse={repasse} inscritos={inscritos} avisados={avisados} urlDaFicha={urlDaFicha} />
      )}
    </div>
  );
}
