"use client";

import { useEffect, useState } from "react";
import type { ParametrosDaCurva } from "../../../lib/avaliacaoRecomendacao";
import type { LeituraDasRecentes } from "../../../lib/consultaDePlaca-servidor";
import type { ItemDoHistorico, LeituraDoHistorico } from "../../../lib/historicoDeConsultas";
import type { LeituraDosModelos } from "../../../lib/mercadoPorModelo-servidor";
import ConsultaDePlaca from "./ConsultaDePlaca";
import ConsultaPorModelo, { type PedidoDeFora } from "./ConsultaPorModelo";
import HistoricoDeConsultas from "./HistoricoDeConsultas";

/**
 * O invólucro de `/admin/consulta-veiculos`: o cabeçalho e as três abas.
 *
 * A ordem é a do trabalho (dono, 06 e 08/10/2026), do que não custa ao que
 * custa mais: a FIPE de hoje, grátis ("quanto vale?"); o MODELO, pago por mês
 * de tabela ("para onde ele vai?"); a PLACA, paga por consulta ("posso
 * comprar ESTE carro?"). A aba que abre é a gratuita: ninguém gasta uma
 * consulta por ter entrado na tela.
 *
 * As três ficam montadas (a escondida leva `hidden`): trocar de aba não apaga
 * o que o avaliador já consultou na outra.
 */

type Aba = "fipe" | "modelo" | "placa" | "historico";

const ABAS: Array<{ chave: Aba; rotulo: string; descricao: string }> = [
  {
    chave: "fipe",
    rotulo: "FIPE · GRÁTIS",
    descricao:
      "A consulta do dia a dia: o valor FIPE de hoje do modelo e dos anos vizinhos, e a faixa de compra pela curva da loja. Não gasta nada.",
  },
  {
    chave: "modelo",
    rotulo: "POR MODELO · PAGA",
    descricao:
      "A análise completa: 24 meses de tabela, para onde ela vai, quanto o carro perde por mês de pátio e o alerta de desvalorização. Os meses que a FIPE gratuita não libera vêm da APIBrasil; o que já foi consultado reabre sem custo.",
  },
  {
    chave: "placa",
    rotulo: "POR PLACA · PAGA",
    descricao:
      "O retrato do carro oferecido à loja: impeditivos, histórico, FIPE e faixa de compra. Cada placa nova é uma consulta paga; a que já foi consultada reabre sem custo.",
  },
  {
    chave: "historico",
    rotulo: "HISTÓRICO",
    descricao:
      "Todas as consultas da equipe, com pesquisa. Abrir uma consulta antiga não consulta ninguém nem custa nada; o “Atualizar dados” traz só os meses que faltam.",
  },
];

/** "08/10/2026 14:28", para o cabeçalho da impressão. */
const agoraNaImpressao = () =>
  new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default function AbasDaConsulta({
  recentes,
  modelos,
  curva,
  temToken,
  homologacao,
  historico,
}: {
  recentes: LeituraDasRecentes;
  modelos: LeituraDosModelos;
  historico: LeituraDoHistorico;
  curva: ParametrosDaCurva | null;
  temToken: boolean;
  homologacao: boolean;
}) {
  const [aba, setAba] = useState<Aba>("fipe");
  // Cada objeto novo abre uma vez na aba de destino (o componente guarda o último que abriu).
  const [paraACompleta, setParaACompleta] = useState<PedidoDeFora | null>(null);
  const [paraAPontual, setParaAPontual] = useState<PedidoDeFora | null>(null);
  const [placaParaAbrir, setPlacaParaAbrir] = useState<{ placa: string } | null>(null);
  const [impressoEm, setImpressoEm] = useState<string | null>(null);
  const atual = ABAS.find((a) => a.chave === aba)!;

  /** Abre um item do histórico na aba dele, do guardado: nenhuma chamada, nenhum custo. */
  const abrir = (item: ItemDoHistorico) => {
    if (item.abrir.tipo === "placa") {
      setPlacaParaAbrir({ placa: item.abrir.placa });
      setAba("placa");
      return;
    }
    const pedido: PedidoDeFora = { marca: item.abrir.marca, modelo: item.abrir.modelo, ano: item.abrir.ano, anos: [], guardado: true };
    if (item.abrir.modo === "completa") {
      setParaACompleta(pedido);
      setAba("modelo");
    } else {
      setParaAPontual(pedido);
      setAba("fipe");
    }
  };

  /** A impressão do navegador ("Salvar como PDF"): só a aba aberta, sem menu, formulário nem botões. */
  const imprimir = () => {
    setImpressoEm(agoraNaImpressao());
    // O cabeçalho da impressão precisa estar na tela antes do diálogo abrir.
    setTimeout(() => window.print(), 50);
  };
  // Ctrl+P também leva a hora certa. A hora nunca é calculada na renderização:
  // servidor e navegador discordariam no minuto (erro de hidratação).
  useEffect(() => {
    const antes = () => setImpressoEm(agoraNaImpressao());
    window.addEventListener("beforeprint", antes);
    return () => window.removeEventListener("beforeprint", antes);
  }, []);

  return (
    <div className="mt-consulta mx-auto flex w-full max-w-5xl flex-col gap-6" data-relatorio>
      {/* Só no papel: de quem é, o que é e quando foi impresso. */}
      <div className="so-impressao" data-cabecalho-da-impressao>
        <strong>Motors Store · Consulta de veículos · {atual.rotulo}</strong>
        <span>{impressoEm ? `Impresso em ${impressoEm} · ` : ""}uso interno da equipe</span>
      </div>
      <header className="flex flex-col gap-3">
        <div className="nao-imprimir flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-3">
            <span className="mt-rotulo">ESTOQUE</span>
            <h1 className="mt-titulo m-0 text-3xl md:text-4xl">Consulta de veículos</h1>
          </div>
          <button type="button" className="mt-btn mt-btn-contorno mt-foco cursor-pointer px-4 py-2 text-[11px]" onClick={imprimir} data-imprimir>
            Imprimir / salvar PDF
          </button>
        </div>
        <div role="radiogroup" aria-label="Tipo de consulta" className="nao-imprimir mt-seg flex-wrap self-start">
          {ABAS.map((a) => (
            <label key={a.chave} className="mt-seg-opt">
              <input type="radio" name="aba-da-consulta" value={a.chave} checked={aba === a.chave} onChange={() => setAba(a.chave)} />
              {a.rotulo}
            </label>
          ))}
        </div>
        <p className="nao-imprimir m-0 max-w-3xl text-sm leading-relaxed text-mt-neutral-800" data-descricao-da-aba={aba}>
          {atual.descricao}
        </p>
      </header>

      <div hidden={aba !== "fipe"} data-aba="fipe">
        <ConsultaPorModelo
          modo="pontual"
          curva={curva}
          recentes={modelos}
          pedidoDeFora={paraAPontual}
          aoPedirCompleta={(s) => {
            // Objeto novo a cada clique: a aba paga abre este modelo (e pergunta o custo antes).
            setParaACompleta({ ...s });
            setAba("modelo");
          }}
        />
      </div>
      <div hidden={aba !== "modelo"} data-aba="modelo">
        <ConsultaPorModelo modo="completa" curva={curva} recentes={modelos} pedidoDeFora={paraACompleta} />
      </div>
      <div hidden={aba !== "placa"} data-aba="placa">
        <ConsultaDePlaca recentes={recentes} curva={curva} temToken={temToken} homologacao={homologacao} placaDeFora={placaParaAbrir} />
      </div>
      <div hidden={aba !== "historico"} data-aba="historico">
        <HistoricoDeConsultas inicial={historico} aoAbrir={abrir} />
      </div>
    </div>
  );
}
