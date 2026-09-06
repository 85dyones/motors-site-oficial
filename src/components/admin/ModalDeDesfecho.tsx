"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MOTIVO_DO_DESFECHO,
  ehDescarte,
  type EtapaDoFunil,
  type MotivoDoFunil,
} from "../../lib/funil";

/**
 * A caixa que pergunta POR QUÊ antes de fechar o negócio.
 *
 * 2026-08-28, pedido do dono: *"uma opção de dar o negócio como ganho ou
 * perdido, selecionando opções para mensurar em relatórios depois"* — e, na
 * segunda rodada: *"deixe um campo de observação adicional além dos motivos
 * padrão"*.
 *
 * ---------------------------------------------------------------------------
 * Os dois campos fazem trabalhos diferentes, e é por isso que são dois
 * ---------------------------------------------------------------------------
 * O **motivo** é lista fechada porque é o que o relatório agrupa: texto livre
 * vira "preço", "Preço", "preco alto" e "achou caro" na mesma planilha, e aí
 * não há gráfico. A **observação** é texto livre porque é onde mora o que
 * nenhuma lista prevê — *"queria prata, só tinha branco"*, *"o banco pediu
 * fiador"*. Uma lista sem campo aberto empurra o vendedor para o motivo mais
 * próximo e contamina a estatística; um campo aberto sem lista não agrupa.
 * Juntos, o número diz o quê e a frase diz o porquê.
 *
 * ---------------------------------------------------------------------------
 * Por que o motivo NÃO grava sozinho no clique
 * ---------------------------------------------------------------------------
 * A primeira versão fechava no clique do motivo — um gesto só, e os campos
 * abaixo eram um adendo com a instrução "preencha antes de escolher". Isso
 * deixou de servir no momento em que a observação passou a ser um pedido
 * explícito: um campo que só é preenchido por quem lê a letra miúda é um campo
 * vazio. Agora o motivo SELECIONA, a observação fica no caminho, e um botão
 * fecha. Dois cliques para o desfecho de um negócio é o preço certo.
 */
export interface DesfechoEscolhido {
  motivo: string;
  valor: string;
  nota: string;
}

export default function ModalDeDesfecho({
  etapa,
  motivos,
  lead,
  aoConfirmar,
  aoCancelar,
}: {
  etapa: EtapaDoFunil;
  motivos: MotivoDoFunil[];
  lead: { nome: string; interesse?: string | null };
  aoConfirmar: (escolha: DesfechoEscolhido) => void;
  aoCancelar: () => void;
}) {
  const ganho = etapa.tipo === "ganho";
  const descarte = ehDescarte(etapa.tipo);

  /**
   * Os três desfechos escrevem diferente porque significam coisas diferentes.
   *
   * "Negócio perdido" e "Não é oportunidade" no mesmo texto seria a origem do
   * problema que o terceiro tipo resolve: quem lê "perdido" para um spam
   * hesita, marca como perdido mesmo, e a taxa de conversão da loja cai por
   * causa de um robô.
   */
  const rotulos = descarte
    ? {
        chapeu: "Não é oportunidade",
        pergunta: "O que era, então?",
        vazio: MOTIVO_DO_DESFECHO.descartado,
        confirmar: "Descartar",
        exemplo: "Ex.: formulário preenchido por robô, três vezes no mesmo minuto",
      }
    : ganho
      ? {
          chapeu: "Negócio ganho",
          pergunta: "Por quê?",
          vazio: MOTIVO_DO_DESFECHO.ganho,
          confirmar: "Marcar como ganho",
          exemplo: "Ex.: fechou levando o usado na troca, entrega quinta",
        }
      : {
          chapeu: "Negócio perdido",
          pergunta: "Por quê?",
          vazio: MOTIVO_DO_DESFECHO.perdido,
          confirmar: "Marcar como perdido",
          exemplo: "Ex.: queria prata, só tinha branco — pediu para avisar quando chegar",
        };
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  const disponiveis = useMemo(
    () => motivos.filter((m) => m.ativo && m.tipo === etapa.tipo).sort((a, b) => a.ordem - b.ordem),
    [motivos, etapa.tipo],
  );

  useEffect(() => {
    const naTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoCancelar();
    };
    document.addEventListener("keydown", naTecla);
    caixa.current?.querySelector("button")?.focus();
    return () => document.removeEventListener("keydown", naTecla);
  }, [aoCancelar]);

  const confirmar = () => {
    if (!motivo) return;
    aoConfirmar({ motivo, valor, nota });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-mt-inverso-fundo/80 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) aoCancelar();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Motivo de ${etapa.rotulo}`}
    >
      <div
        ref={caixa}
        className={`flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto border-t-4 bg-mt-bg p-6 shadow-[var(--mt-shadow-lg)] ${
          ganho ? "border-mt-accent-800" : descarte ? "border-mt-neutral-500" : "border-mt-accent"
        }`}
      >
        <div className="flex flex-col gap-1 border-b border-mt-regua-fina pb-3">
          <div className="mt-rotulo mt-rotulo-accent">
            {rotulos.chapeu}
          </div>
          <h3 className="text-base font-extrabold tracking-[-.015em] text-mt-ink">{lead.nome}</h3>
          {lead.interesse && (
            <p className="text-[11px] leading-snug text-mt-neutral-700">{lead.interesse}</p>
          )}
        </div>

        {disponiveis.length === 0 ? (
          // Sem motivo ativo a caixa não tem o que perguntar. Dizer isso é
          // melhor que mostrar uma lista vazia e deixar o card preso.
          //
          // O texto mudou em 2026-09-05: ele mandava "Cadastre em Configurar
          // funil", e quem chega aqui é o Comercial — que move lead e NÃO abre
          // aquela tela (`podeFazer(comercial, "Configurar o funil de vendas")`
          // é `nao_ve`). Instrução que o leitor não pode cumprir é um beco com
          // placa. Agora ele diz a quem pedir, e `validarFunil` passou a barrar
          // este estado na origem — quem configura não consegue mais salvar um
          // funil que chegue aqui.
          <div className="border border-dashed border-mt-regua-fina bg-mt-surface p-4 text-center">
            <p className="text-[12px] leading-relaxed text-mt-neutral-800">
              Nenhum motivo de {rotulos.vazio} está ativo, então não dá para fechar por
              aqui. Peça ao Administrador ou ao Gestor para reativar um em{" "}
              <strong>Configurar funil</strong>.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-rotulo">{rotulos.pergunta}</div>
            <div className="flex flex-col gap-0.5">
              {disponiveis.map((m) => (
                <button
                  key={m.chave}
                  type="button"
                  aria-pressed={motivo === m.chave}
                  onClick={() => setMotivo(m.chave)}
                  className={`mt-foco cursor-pointer border-l-[3px] px-3 py-2.5 text-left text-[13px] leading-snug transition-colors ${
                    motivo === m.chave
                      ? "border-mt-accent bg-mt-accent-100 font-semibold text-mt-accent-800"
                      : "border-mt-regua-fina bg-mt-surface text-mt-ink hover:border-mt-accent"
                  }`}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-mt-regua-fina pt-3">
              {/* O campo aberto que o dono pediu. Textarea e não input: o
                  tamanho da caixa é o que comunica que ali cabe uma frase, e
                  um input de uma linha convida a escrever três palavras. */}
              <label className="flex flex-col gap-1">
                <span className="mt-rotulo">O que aconteceu</span>
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={3}
                  placeholder={rotulos.exemplo}
                  className="mt-foco w-full resize-none border border-mt-regua-fina bg-mt-surface p-2 text-[12px] leading-snug text-mt-ink outline-none focus:border-mt-accent"
                />
                <span className="text-[10px] leading-relaxed text-mt-neutral-600">
                  {descarte
                    ? "Opcional. O descarte fica fora da taxa de conversão — este lead não entra na conta de ganhos nem de perdas."
                    : "Opcional, e é o que o motivo não consegue dizer. Aparece no relatório ao lado da estatística."}
                </span>
              </label>

              {ganho && (
                <label className="flex items-center gap-2 text-[11px] text-mt-neutral-700">
                  <span className="w-28 shrink-0 uppercase tracking-[.08em]">Valor da venda</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="opcional"
                    className="mt-foco w-full border border-mt-regua-fina bg-mt-bg px-2 py-1.5 text-[12px] text-mt-ink tabular-nums"
                  />
                </label>
              )}
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-mt-regua-fina pt-3">
          <button
            type="button"
            onClick={aoCancelar}
            className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2.5 text-[11px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!motivo}
            className="mt-btn mt-foco cursor-pointer bg-mt-ink px-4 py-2.5 text-[11px] text-mt-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            {rotulos.confirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
