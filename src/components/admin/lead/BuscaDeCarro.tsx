"use client";

import { useEffect, useId, useRef, useState } from "react";
import { contar, linhaDoCarroDaBusca, type CarroDaBusca } from "../../../lib/carrosDeInteresseNaTela";
import { LIMITE_DA_BUSCA_DE_CARRO, MINIMO_DA_BUSCA_DE_CARRO } from "../../../lib/veiculosDeInteresse";

/**
 * O seletor de carro do estoque (pedido do dono em 05/10/2026: "digitar o
 * código é retrabalho, o veículo tem de ser escolhido buscando").
 *
 * Caixa de busca no padrão combobox: a pessoa escreve modelo, placa ou código,
 * a lista sai de `GET /api/estoque/busca` 250 ms depois da última tecla, e as
 * setas e o Enter escolhem sem tirar a mão do teclado. Esc fecha.
 *
 * O carro que já está no lead aparece, desabilitado, com "já está na lista":
 * sumir com ele faria a pessoa achar que o carro não existe.
 *
 * Desde 06/10 a galeria do repasse usa a mesma caixa para escolher de qual
 * anúncio vêm as fotos do RevendaMais: ela passa `buscar` (a busca do estoque
 * do repasse, que tem outro portão), `termoInicial` e `rotulo`. Sem eles, a
 * caixa é a do lead, como sempre.
 */

const ESPERA_MS = 250;

type Resposta = { chave: string; veiculos: CarroDaBusca[] } | { chave: string; erro: string };

const FALHA_DA_BUSCA = "Não deu para buscar os carros.";

/** A busca do lead: `GET /api/estoque/busca`. Falha vira exceção com a frase da tela. */
async function buscarNoEstoqueDosLeads(termo: string): Promise<CarroDaBusca[]> {
  const res = await fetch(`/api/estoque/busca?q=${encodeURIComponent(termo)}`);
  const d = await res.json().catch(() => ({}));
  // Termo que o servidor acha curto (só curingas, por exemplo): lista vazia, sem erro.
  if (!res.ok && d.codigo !== "busca_curta") throw new Error(d.error || FALHA_DA_BUSCA);
  return Array.isArray(d.veiculos) ? d.veiculos : [];
}

export default function BuscaDeCarro({
  jaNaLista,
  aoEscolher,
  aoCancelar,
  aoMudarRascunho,
  buscar = buscarNoEstoqueDosLeads,
  termoInicial = "",
  rotulo = "Buscar carro no estoque",
}: {
  /** Os `estoque_motors.id` que o lead já tem. */
  jaNaLista: readonly number[];
  aoEscolher: (carro: CarroDaBusca) => void;
  aoCancelar: () => void;
  /** Há (ou deixou de haver) texto digitado: quem monta não fecha por cima dele. */
  aoMudarRascunho?: (temTexto: boolean) => void;
  /**
   * Quem busca. Precisa ser a MESMA função a cada desenho (de módulo, ou
   * memorizada): trocar de função refaz a busca.
   */
  buscar?: (termo: string) => Promise<CarroDaBusca[]>;
  /** O que já vem escrito na caixa, e buscado, quando ela abre. */
  termoInicial?: string;
  rotulo?: string;
}) {
  const [texto, setTexto] = useState(termoInicial);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [ativo, setAtivo] = useState(-1);
  const [tentativa, setTentativa] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const base = useId();
  const idDaLista = `${base}-lista`;
  const idDaDica = `${base}-dica`;

  const termo = texto.trim().replace(/\s+/g, " ");
  const valido = termo.length >= MINIMO_DA_BUSCA_DE_CARRO;
  const chave = `${tentativa}:${termo}`;

  useEffect(() => {
    campo.current?.focus();
  }, []);

  useEffect(() => {
    if (!valido) return;
    let vivo = true;
    const relogio = setTimeout(() => {
      buscar(termo)
        .then((veiculos) => {
          if (!vivo) return;
          setResposta({ chave, veiculos });
          setAtivo(-1);
        })
        .catch((e: unknown) => {
          if (vivo) setResposta({ chave, erro: e instanceof Error && e.message ? e.message : FALHA_DA_BUSCA });
        });
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(relogio);
    };
  }, [termo, valido, chave, buscar]);

  const temTexto = texto.trim() !== "";
  useEffect(() => {
    aoMudarRascunho?.(temTexto);
  }, [temTexto, aoMudarRascunho]);
  useEffect(() => () => aoMudarRascunho?.(false), [aoMudarRascunho]);

  // O carro marcado pelas setas fica à vista dentro da lista, que rola.
  useEffect(() => {
    if (ativo < 0) return;
    const marcado = campo.current?.closest("[data-busca-de-carro]")?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    if (typeof marcado?.scrollIntoView === "function") marcado.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  const atual = valido && resposta?.chave === chave ? resposta : null;
  const veiculos = atual && "veiculos" in atual ? atual.veiculos : [];
  const erro = atual && "erro" in atual ? atual.erro : "";
  const buscando = valido && atual === null;
  const aberta = veiculos.length > 0;
  /** O carro que não dá para escolher: já está na lista, ou a busca o marcou (`indisponivel`). */
  const repetido = (c: CarroDaBusca) => jaNaLista.includes(c.id) || Boolean(c.indisponivel);
  const motivoDe = (c: CarroDaBusca) => c.indisponivel ?? (jaNaLista.includes(c.id) ? "já está na lista" : "");

  /** O próximo carro que dá para escolher, a partir de `de`, no sentido dado. */
  const vizinho = (de: number, passo: 1 | -1): number => {
    for (let i = 1; i <= veiculos.length; i++) {
      const indice = (((de + passo * i) % veiculos.length) + veiculos.length) % veiculos.length;
      if (!repetido(veiculos[indice])) return indice;
    }
    return -1;
  };

  const naTecla = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // O Esc é desta caixa: a gaveta do lead não fecha junto. E ele só fecha
      // a busca vazia: uma tecla não apaga o que foi escrito.
      e.preventDefault();
      e.stopPropagation();
      if (!temTexto) aoCancelar();
      return;
    }
    if (!aberta) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const baixo = e.key === "ArrowDown";
      setAtivo(vizinho(ativo === -1 ? (baixo ? -1 : 0) : ativo, baixo ? 1 : -1));
    } else if (e.key === "Enter") {
      // Sem carro marcado, o Enter fica com o primeiro que dá para escolher.
      const indice = ativo >= 0 ? ativo : vizinho(-1, 1);
      const carro = veiculos[indice];
      if (!carro || repetido(carro)) return;
      e.preventDefault();
      aoEscolher(carro);
    }
  };

  let dica: string;
  if (!valido) dica = `Digite pelo menos ${MINIMO_DA_BUSCA_DE_CARRO} letras ou números.`;
  else if (buscando) dica = "Buscando…";
  else if (erro) dica = "";
  else if (veiculos.length === 0) dica = "Nenhum carro encontrado.";
  else {
    dica = contar(veiculos.length, "carro encontrado", "carros encontrados") + ".";
    if (veiculos.length >= LIMITE_DA_BUSCA_DE_CARRO) dica += " Se o carro não está aqui, escreva mais.";
  }

  return (
    <div data-busca-de-carro className="flex flex-col gap-2 border border-mt-regua bg-mt-surface p-2.5">
      <div className="flex items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] text-mt-neutral-700">{rotulo}</span>
          <input
            ref={campo}
            type="text"
            role="combobox"
            aria-expanded={aberta}
            aria-controls={idDaLista}
            aria-autocomplete="list"
            aria-activedescendant={aberta && ativo >= 0 ? `${base}-carro-${veiculos[ativo].id}` : undefined}
            aria-describedby={idDaDica}
            autoComplete="off"
            spellCheck={false}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAtivo(-1);
            }}
            onKeyDown={naTecla}
            placeholder="Buscar por modelo, placa ou código"
            className="mt-foco w-full border border-mt-regua-fina bg-mt-bg px-2.5 py-2 text-[13px] text-mt-ink placeholder:text-mt-neutral-600 pointer-coarse:min-h-11"
          />
        </label>
        <button
          type="button"
          onClick={aoCancelar}
          className="mt-foco cursor-pointer border-0 bg-transparent px-1 py-2 text-[11px] text-mt-neutral-700 underline hover:text-mt-accent-hover pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          Cancelar
        </button>
      </div>

      <p id={idDaDica} role="status" className="m-0 text-[11px] tabular-nums text-mt-neutral-700">
        {dica}
      </p>

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2 text-xs text-mt-accent-800">
          <span className="flex-1">{erro}</span>
          <button
            type="button"
            onClick={() => setTentativa((n) => n + 1)}
            className="mt-foco cursor-pointer border-0 bg-transparent p-0 text-[11px] font-semibold text-mt-accent-800 underline pointer-coarse:min-h-11"
          >
            Tentar de novo
          </button>
        </div>
      )}

      <ul
        id={idDaLista}
        role="listbox"
        aria-label="Carros encontrados"
        hidden={!aberta}
        className="m-0 flex max-h-80 list-none flex-col overflow-y-auto border border-mt-regua-fina bg-mt-bg p-0"
      >
        {veiculos.map((c, i) => {
          const naLista = repetido(c);
          const linha = linhaDoCarroDaBusca(c);
          return (
            <li
              key={c.id}
              id={`${base}-carro-${c.id}`}
              role="option"
              aria-selected={i === ativo}
              aria-disabled={naLista || undefined}
              // O foco fica no campo: o toque escolhe sem a lista fechar antes.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!naLista) aoEscolher(c);
              }}
              className={`flex flex-col gap-0.5 border-t border-mt-regua-fina px-2.5 py-2 first:border-t-0 pointer-coarse:min-h-11 ${
                naLista ? "cursor-not-allowed text-mt-neutral-600" : "cursor-pointer text-mt-ink hover:bg-mt-surface"
              } ${i === ativo ? "bg-mt-accent-100 shadow-[inset_3px_0_0_var(--mt-accent)]" : ""}`}
            >
              <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold [overflow-wrap:anywhere]">
                {c.rotulo}
                {c.vendido && (
                  <span className="border border-mt-regua px-1.5 text-[10px] font-semibold uppercase tracking-[.08em]">Vendido</span>
                )}
                {c.publicado === false && !c.vendido && (
                  <span className="text-[10px] font-normal uppercase tracking-[.08em] text-mt-neutral-700">Fora da vitrine</span>
                )}
              </span>
              {(linha || naLista) && (
                <span className="text-[11px] tabular-nums text-mt-neutral-700">
                  {[linha, motivoDe(c)].filter(Boolean).join(" · ")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
