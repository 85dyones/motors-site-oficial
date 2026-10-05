"use client";

import { useEffect, useRef, useState } from "react";
import {
  contar,
  linhaDaOpcao,
  podeTornarPrincipal,
  precoDeAntes,
  type CarroDaBusca,
  type ItemDaResolucao,
  type MudancaDaOpcao,
} from "../../../lib/carrosDeInteresseNaTela";
import {
  ROTULO_DA_SITUACAO_DA_OPCAO,
  decidirResolucao,
  type MotivoDeDescarte,
  type PendenciaDeVeiculo,
  type VeiculoDeInteresse,
} from "../../../lib/veiculosDeInteresse";
import BuscaDeCarro from "./BuscaDeCarro";
import ResolucaoDosCarros, { ChipsDeMotivo, NotaDoDescarte } from "./ResolucaoDosCarros";
import TituloDeBloco from "./TituloDeBloco";

/**
 * Bloco v do detalhe: os carros de interesse do lead (pedido do dono em
 * 05/10/2026).
 *
 * Quem abre é o vendedor, durante o atendimento: acrescenta o carro que o
 * cliente quis ver (buscando, sem código), e ao fim diz qual foi o escolhido e
 * por que os outros ficaram. O motivo de cada descarte é o que alimenta o
 * relatório "Interesse e objeções" do carro.
 *
 * Com `disponivel: false` (o banco ainda sem a lista de carros), o bloco é o
 * carro único de sempre, só que escolhido pela busca: nada de escolher,
 * descartar ou principal, e nenhum aviso.
 *
 * Nada aqui grava: cada gesto sobe para o detalhe, que fala com as rotas e
 * devolve a lista relida.
 */

const ACAO =
  "mt-foco cursor-pointer border-0 bg-transparent p-0 text-[11px] text-mt-accent-hover hover:underline disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11 pointer-coarse:min-w-11";
const ACAO_DISCRETA =
  "mt-foco cursor-pointer border-0 bg-transparent p-0 text-[11px] text-mt-neutral-700 underline hover:text-mt-accent-hover disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11 pointer-coarse:min-w-11";
const SELO = "border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em]";

const SELO_DA_SITUACAO: Record<VeiculoDeInteresse["situacao"], string> = {
  em_avaliacao: "border-mt-regua-fina text-mt-neutral-700",
  escolhido: "border-mt-ink bg-mt-ink text-mt-bg",
  descartado: "border-mt-regua-fina bg-mt-surface text-mt-neutral-800",
};

export default function CarrosDeInteresse({
  veiculos,
  disponivel,
  pendencias,
  resolvendo,
  podeEscolherAoResolver,
  podeRemover,
  ocupado,
  className = "",
  aoAdicionar,
  aoMudar,
  aoRemover,
  aoTrocarOUnico,
  aoResolver,
  aoAbrirResolucao,
  aoAdiarResolucao,
}: {
  veiculos: readonly VeiculoDeInteresse[];
  /** `false`: o lead tem um carro só (a lista ainda não existe no banco). */
  disponivel: boolean;
  /** Os carros sem resolução de um lead JÁ FECHADO. Lead aberto: lista vazia. */
  pendencias: readonly PendenciaDeVeiculo[];
  /** A caixa "Feche os carros deste atendimento" está aberta. */
  resolvendo: boolean;
  podeEscolherAoResolver: boolean;
  /** Só o Administrador apaga uma opção; os outros descartam. */
  podeRemover: boolean;
  /** Uma gravação está em curso: as ações esperam. */
  ocupado: boolean;
  className?: string;
  aoAdicionar: (carro: CarroDaBusca) => void;
  aoMudar: (veiculo: VeiculoDeInteresse, mudanca: MudancaDaOpcao) => void;
  aoRemover: (veiculo: VeiculoDeInteresse) => void;
  /** Sem a lista: troca (ou tira, com `null`) o carro único do lead. */
  aoTrocarOUnico: (veiculoId: number | null) => void;
  aoResolver: (itens: ItemDaResolucao[]) => void;
  aoAbrirResolucao: () => void;
  aoAdiarResolucao: () => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const [descartando, setDescartando] = useState<number | null>(null);
  const [removendo, setRemovendo] = useState<number | null>(null);
  const [motivo, setMotivo] = useState<MotivoDeDescarte | null>(null);
  const [nota, setNota] = useState("");
  const raiz = useRef<HTMLElement>(null);
  /** Para onde o foco vai depois da próxima pintura (um seletor dentro do bloco). */
  const focoPendente = useRef<string | null>(null);

  // Uma caixa que abre leva o foco; a que fecha o devolve a quem a abriu.
  useEffect(() => {
    if (!focoPendente.current) return;
    const alvo = raiz.current?.querySelector<HTMLElement>(focoPendente.current);
    focoPendente.current = null;
    alvo?.focus();
  });

  const focar = (seletor: string) => {
    focoPendente.current = seletor;
  };
  const linhaDe = (veiculoId: number) => `[data-carro="${veiculoId}"]`;

  const abrirDescarte = (v: VeiculoDeInteresse) => {
    setRemovendo(null);
    setMotivo(null);
    setNota(v.nota ?? "");
    setDescartando(v.veiculo_id);
    focar(`${linhaDe(v.veiculo_id)} [data-descarte] button`);
  };
  const fecharDescarte = (veiculoId: number, confirmado: boolean) => {
    setDescartando(null);
    // Confirmado, o botão "Descartar" deixa de existir: o foco fica na linha.
    focar(confirmado ? linhaDe(veiculoId) : `${linhaDe(veiculoId)} [data-acao="descartar"]`);
  };

  const corpoDoDescarte = {
    situacao: "descartado" as const,
    ...(motivo ? { motivo_descarte: motivo } : {}),
    nota: nota.trim() || null,
  };
  const decisao = decidirResolucao(corpoDoDescarte);
  const dicaDoDescarte = decisao.ok
    ? ""
    : decisao.codigo === "nota_obrigatoria"
      ? 'O motivo "Outro" pede a nota dizendo qual foi.'
      : decisao.codigo === "nota_longa"
        ? "A nota ficou longa demais."
        : "Escolha o motivo.";

  const fecharBusca = () => {
    setBuscando(false);
    focar('[data-acao="adicionar"]');
  };
  const escolherNaBusca = (carro: CarroDaBusca) => {
    fecharBusca();
    if (disponivel) aoAdicionar(carro);
    else aoTrocarOUnico(carro.id);
  };

  const unico = disponivel ? null : (veiculos[0] ?? null);
  const semResolucao = pendencias.length;

  return (
    <section
      ref={raiz}
      data-bloco="v"
      aria-labelledby="titulo-dos-carros"
      className={`flex flex-col gap-3 border-t border-mt-regua-fina px-6 py-5 ${className}`}
    >
      <TituloDeBloco id="titulo-dos-carros">{disponivel ? "Carros de interesse" : "Carro de interesse"}</TituloDeBloco>

      {disponivel && semResolucao > 0 && resolvendo && (
        <ResolucaoDosCarros
          pendencias={pendencias}
          podeEscolher={podeEscolherAoResolver}
          ocupado={ocupado}
          aoSalvar={aoResolver}
          aoAdiar={() => {
            aoAdiarResolucao();
            focar('[data-acao="resolver"]');
          }}
        />
      )}
      {disponivel && semResolucao > 0 && !resolvendo && (
        <button type="button" data-acao="resolver" onClick={aoAbrirResolucao} className={`${ACAO_DISCRETA} self-start text-left`}>
          <span className="tabular-nums">{contar(semResolucao, "carro sem resolução", "carros sem resolução")}</span>
        </button>
      )}

      {veiculos.length === 0 && !buscando && <p className="m-0 text-xs text-mt-neutral-700">Nenhum carro ligado a este lead.</p>}

      {veiculos.length > 0 && (
        <ul role="list" className="m-0 flex list-none flex-col gap-2 p-0">
          {(disponivel ? veiculos : veiculos.slice(0, 1)).map((v) => {
            const era = precoDeAntes(v);
            const resolvida = v.situacao !== "em_avaliacao";
            return (
              <li
                key={v.veiculo_id}
                data-carro={v.veiculo_id}
                data-situacao={disponivel ? v.situacao : undefined}
                tabIndex={-1}
                className="flex flex-col gap-2 border border-mt-regua-fina bg-mt-surface p-2.5 outline-none focus-visible:border-mt-accent"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span
                      className={`text-[13px] font-semibold [overflow-wrap:anywhere] ${
                        disponivel && v.situacao === "descartado" ? "text-mt-neutral-700" : "text-mt-ink"
                      }`}
                    >
                      {v.rotulo}
                    </span>
                    {disponivel && v.principal && <span className={`${SELO} border-mt-accent text-mt-accent-800`}>Principal</span>}
                  </div>
                  <div className="text-[11px] tabular-nums text-mt-neutral-700">
                    {linhaDaOpcao(v)}
                    {era && <span> · {era}</span>}
                  </div>
                  {disponivel && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`${SELO} ${SELO_DA_SITUACAO[v.situacao]}`}>{ROTULO_DA_SITUACAO_DA_OPCAO[v.situacao]}</span>
                      {v.situacao === "descartado" && v.motivo_rotulo && (
                        <span className="text-[11px] text-mt-neutral-800">{v.motivo_rotulo}</span>
                      )}
                    </div>
                  )}
                  {disponivel && v.nota && (
                    <p className="m-0 text-[12px] leading-snug text-mt-neutral-800 [overflow-wrap:anywhere]">
                      <span className="text-mt-neutral-600">Nota: </span>
                      {v.nota}
                    </p>
                  )}
                </div>

                {disponivel ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {!resolvida && (
                      <>
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => {
                            setDescartando(null);
                            aoMudar(v, { situacao: "escolhido" });
                            focar(linhaDe(v.veiculo_id));
                          }}
                          className={ACAO}
                        >
                          Escolher
                        </button>
                        <button
                          type="button"
                          data-acao="descartar"
                          disabled={ocupado}
                          aria-expanded={descartando === v.veiculo_id}
                          onClick={() => (descartando === v.veiculo_id ? fecharDescarte(v.veiculo_id, false) : abrirDescarte(v))}
                          className={ACAO}
                        >
                          Descartar
                        </button>
                      </>
                    )}
                    {resolvida && (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => {
                          aoMudar(v, { situacao: "em_avaliacao" });
                          focar(linhaDe(v.veiculo_id));
                        }}
                        className={ACAO}
                      >
                        Reabrir
                      </button>
                    )}
                    {podeTornarPrincipal(v, veiculos) && (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => {
                          aoMudar(v, { principal: true });
                          focar(linhaDe(v.veiculo_id));
                        }}
                        className={ACAO_DISCRETA}
                      >
                        Tornar principal
                      </button>
                    )}
                    {/* A opção sem linha no banco (`id: null`) não tem o que apagar. */}
                    {podeRemover && v.id !== null && (
                      <button
                        type="button"
                        data-acao="remover"
                        disabled={ocupado}
                        aria-expanded={removendo === v.veiculo_id}
                        onClick={() => {
                          setDescartando(null);
                          setRemovendo(removendo === v.veiculo_id ? null : v.veiculo_id);
                          if (removendo !== v.veiculo_id) focar(`${linhaDe(v.veiculo_id)} [data-remocao] button`);
                        }}
                        className={ACAO_DISCRETA}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button
                      type="button"
                      data-acao="adicionar"
                      aria-expanded={buscando}
                      onClick={() => setBuscando((b) => !b)}
                      className={ACAO}
                    >
                      Trocar
                    </button>
                    <button type="button" onClick={() => aoTrocarOUnico(null)} className={ACAO_DISCRETA}>
                      Desvincular
                    </button>
                  </div>
                )}

                {disponivel && descartando === v.veiculo_id && (
                  <div
                    data-descarte
                    role="group"
                    aria-label={`Descartar ${v.rotulo}`}
                    onKeyDown={(e) => {
                      if (e.key !== "Escape") return;
                      // O Esc é desta caixa: a gaveta do lead não fecha junto.
                      e.stopPropagation();
                      fecharDescarte(v.veiculo_id, false);
                    }}
                    className="flex flex-col gap-2 border-t border-mt-regua-fina pt-2"
                  >
                    <span className="text-[11px] text-mt-neutral-700">Por que o cliente não ficou com este carro?</span>
                    <ChipsDeMotivo rotulo="Motivo do descarte" valor={motivo} aoEscolher={setMotivo} />
                    <NotaDoDescarte motivo={motivo} valor={nota} aoMudar={setNota} />
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={!decisao.ok || ocupado}
                        onClick={() => {
                          if (!decisao.ok || !motivo) return;
                          fecharDescarte(v.veiculo_id, true);
                          aoMudar(v, { situacao: "descartado", motivo_descarte: motivo, nota: nota.trim() || null });
                        }}
                        className="mt-btn mt-btn-tinta mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => fecharDescarte(v.veiculo_id, false)}
                        className="mt-btn mt-btn-contorno mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
                      >
                        Cancelar
                      </button>
                      <span role="status" className="min-w-0 flex-1 text-[11px] text-mt-neutral-700">
                        {dicaDoDescarte}
                      </span>
                    </div>
                  </div>
                )}

                {disponivel && removendo === v.veiculo_id && (
                  <div
                    data-remocao
                    role="group"
                    aria-label={`Remover ${v.rotulo}`}
                    className="flex flex-wrap items-center gap-3 border-t border-mt-regua-fina pt-2"
                  >
                    <span className="min-w-0 flex-1 basis-full text-[11px] leading-snug text-mt-neutral-800">
                      Remover apaga o carro deste lead e ele sai do relatório. Use só para carro posto por engano.
                    </span>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => {
                        setRemovendo(null);
                        focar('[data-acao="adicionar"]');
                        aoRemover(v);
                      }}
                      className="mt-btn mt-btn-tinta mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
                    >
                      Remover do lead
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRemovendo(null);
                        focar(`${linhaDe(v.veiculo_id)} [data-acao="remover"]`);
                      }}
                      className="mt-btn mt-btn-contorno mt-foco px-3.5 py-[9px] text-[11px] pointer-coarse:min-h-11"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {buscando ? (
        <BuscaDeCarro
          jaNaLista={veiculos.map((v) => v.veiculo_id)}
          aoEscolher={escolherNaBusca}
          aoCancelar={fecharBusca}
        />
      ) : (
        (disponivel || unico === null) && (
          <button
            type="button"
            data-acao="adicionar"
            onClick={() => setBuscando(true)}
            className={`${ACAO} self-start`}
          >
            + Adicionar carro
          </button>
        )
      )}
    </section>
  );
}
