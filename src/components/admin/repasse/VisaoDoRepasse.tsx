import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { formatarKm } from "../../modernist/primitivos";
import ContaDoRepasse from "../../repasse/ContaDoRepasse";
import AcoesDaVisao from "./AcoesDaVisao";
import InscritosQueCombinam from "./InscritosQueCombinam";
import LeadsDoCarro from "./LeadsDoCarro";
import type { InscritoDoRepasse } from "../../../lib/avisosDoRepasse";
import { checklistCompletoNa, checklistDoRepasse } from "../../../lib/checklistDoRepasse";
import { podeEditarORepasse, validaRepasse } from "../../../lib/edicaoDoRepasse";
import { fotosDoVeiculo } from "../../../lib/fotosDoVeiculo";
import { ddmmEmCuritiba } from "../../../lib/horarioDaLoja";
import {
  ANCORA_DA_FICHA_DE_ESTADO,
  FICHA_DO_REPASSE,
  NOME_DA_CARROCERIA,
  anosDoCarro,
  constaNoHistorico,
  consultaFeitaEm,
  laudoNoHistorico,
  orcamentoDaOficina,
  textoAlternativoDaFoto,
} from "../../../lib/paginaDoRepasse";
import { CAMINHO_DO_PAINEL_DO_REPASSE, caminhoDoEditorNoPainel } from "../../../lib/painelDoRepasse";
import type { LeadDoCarroNaTela } from "../../../lib/pedidosDeExame";
import type { Perfil } from "../../../lib/permissoes";
import {
  NOME_DA_SITUACAO,
  aparecePublicamente,
  contaDoRepasse,
  emReais,
  soParaLojistas,
  type RepasseDoPainel,
} from "../../../lib/repasse";

/**
 * A visão do carro de repasse no painel: tudo o que o editor guarda, em
 * texto, sem um campo sequer. Pedido do dono em 28/09: "a gestão do painel
 * está confusa, não existe um modo visualização interna, ele só abre edição"
 * — e a escolha dele foi "visão primeiro, editar num botão".
 *
 * O que muda o carro continua com as portas de sempre: "Editar" só aparece
 * para quem `podeEditarORepasse`; os atos da situação são o `AcoesDoRepasse`
 * do editor; "Quem avisar" só para quem valida, no carro publicado. O
 * histórico usa as frases da ficha pública, com uma diferença que só o painel
 * tem: campo ainda não preenchido é "Não informado", e não "Não consta" nem
 * "Não feito", que seriam afirmações sobre o carro.
 */

const NAO_INFORMADO = "Não informado";
const EM_BRANCO = "Em branco.";

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex flex-col gap-3 border-t-2 border-mt-regua pt-5">
      <h2 id={`${id}-titulo`} className="mt-rotulo m-0">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Linhas({ linhas }: { linhas: Array<[string, string]> }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {linhas.map(([rotulo, valor]) => (
        <Fragment key={rotulo}>
          <dt className="font-semibold">{rotulo}</dt>
          <dd className="m-0 text-mt-neutral-800">{valor}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default function VisaoDoRepasse({
  repasse: r,
  perfis,
  urlDaFicha,
  agora,
  pedidos,
  contatos,
  inscritos,
  avisados,
}: {
  repasse: RepasseDoPainel;
  perfis: Perfil[];
  urlDaFicha: string;
  agora: Date;
  /** null: a leitura daquele canal falhou (`lerLeadsDoCarro`). */
  pedidos: LeadDoCarroNaTela[] | null;
  contatos: LeadDoCarroNaTela[] | null;
  /** null: o perfil não vê a lista do repasse. */
  inscritos: InscritoDoRepasse[] | null;
  avisados: string[];
}) {
  const F = FICHA_DO_REPASSE;
  const nome = [r.marca, r.modelo, r.versao, r.ano_modelo].filter(Boolean).join(" ");
  const fotos = fotosDoVeiculo(r.whatsapp_images, r.web_full_images);
  const conta = contaDoRepasse(r);
  const faltas = checklistDoRepasse(r);
  const consulta = ddmmEmCuritiba(r.historico_consultado_em);
  const orcamentoEm = ddmmEmCuritiba(r.orcamento_em);

  const dados: Array<[string, string]> = [
    ["Marca", r.marca],
    ["Modelo", r.modelo],
    ["Versão", r.versao ?? NAO_INFORMADO],
    ["Ano (fabricação/modelo)", anosDoCarro(r)],
    ["Quilometragem", formatarKm(r.quilometragem)],
    ["Câmbio", r.cambio ?? NAO_INFORMADO],
    ["Combustível", r.combustivel ?? NAO_INFORMADO],
    ["Cor", r.cor ?? NAO_INFORMADO],
    ["Carroceria", r.carroceria ? NOME_DA_CARROCERIA[r.carroceria].rotulo : NAO_INFORMADO],
    ["Código FIPE", r.fipe_codigo ?? NAO_INFORMADO],
    ["Mês de referência da FIPE", r.fipe_mes_referencia ?? NAO_INFORMADO],
  ];

  const historico: Array<[string, string]> = [
    [F.laudo, r.laudo ? laudoNoHistorico(r.laudo, r.laudo_apontamento) : NAO_INFORMADO],
    [F.leilao, r.leilao_consta === null ? NAO_INFORMADO : constaNoHistorico(r.leilao_consta, r.leilao_detalhe)],
    [F.sinistro, r.sinistro_consta === null ? NAO_INFORMADO : constaNoHistorico(r.sinistro_consta, r.sinistro_detalhe)],
    [F.consulta, consulta ? consultaFeitaEm(consulta) : NAO_INFORMADO],
  ];

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-4 border-b-2 border-mt-regua pb-5">
        <div>
          <Link
            href={CAMINHO_DO_PAINEL_DO_REPASSE}
            className="text-[11px] font-extrabold tracking-[.1em] text-mt-neutral-700 no-underline hover:text-mt-accent"
          >
            ← REPASSE
          </Link>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
            <h1 className="mt-titulo m-0 text-2xl md:text-3xl">{nome}</h1>
            {podeEditarORepasse(r, perfis) && (
              <Link href={caminhoDoEditorNoPainel(r.id)} className="mt-btn mt-btn-primario mt-foco px-5 py-2.5 text-[11px]">
                Editar
              </Link>
            )}
          </div>
          <p className="m-0 mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="mt-rotulo">{NOME_DA_SITUACAO[r.situacao]}</span>
            {r.situacao === "publicado" && <span>{soParaLojistas(r) ? "Só para lojistas" : "Aberto a todos"}</span>}
            {aparecePublicamente(r, agora) && (
              <a href={urlDaFicha} target="_blank" rel="noreferrer" className="underline">
                Ver no site ↗
              </a>
            )}
          </p>
          {r.situacao === "rascunho" && r.devolvido_com && (
            <p className="m-0 mt-3 border-l-[3px] border-mt-accent bg-mt-accent-100 px-3 py-2 text-xs text-mt-accent-800">
              Devolvido para rascunho: {r.devolvido_com}
            </p>
          )}
        </div>
        <AcoesDaVisao repasse={{ id: r.id, situacao: r.situacao, aberto_ao_publico_em: r.aberto_ao_publico_em }} perfis={perfis} />
      </div>

      <Secao id="fotos" titulo="Fotos">
        {fotos.length === 0 ? (
          <p className="m-0 text-sm text-mt-neutral-700">Nenhuma foto ainda.</p>
        ) : (
          <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0">
            {fotos.map((f, i) => (
              <li key={`${i}-${f.web}`} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do painel, foto do nosso bucket */}
                <img src={f.web} alt={textoAlternativoDaFoto(nome, i + 1)} loading="lazy" className="h-24 w-32 object-cover" />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao id="conta" titulo="A conta">
        <div className="max-w-md">
          <ContaDoRepasse
            repasse={r}
            variante="ficha"
            carroNaFipe={[r.modelo, r.versao, String(r.ano_modelo)].filter(Boolean).join(" ")}
          />
        </div>
      </Secao>

      <Secao id="o-carro" titulo="O carro">
        <Linhas linhas={dados} />
      </Secao>

      <Secao id="textos" titulo="Textos">
        <Linhas
          linhas={[
            ["Linha do card", r.resumo ?? EM_BRANCO],
            ["Por que está no repasse", r.motivo ?? EM_BRANCO],
          ]}
        />
      </Secao>

      <Secao id={ANCORA_DA_FICHA_DE_ESTADO} titulo="Ficha de estado">
        {r.itens_de_estado.length > 0 ? (
          <ul className="m-0 flex list-none flex-col divide-y divide-mt-regua-fina p-0">
            {r.itens_de_estado.map((item, i) => (
              <li key={`${i}-${item.descricao}`} className="flex flex-wrap items-start gap-4 py-3 text-sm">
                {item.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura do painel, foto do nosso bucket
                  <img src={item.foto} alt={`${item.descricao}, ${item.local}`} loading="lazy" className="h-[72px] w-24 object-cover" />
                ) : (
                  <span className="w-24 text-[11px] text-mt-accent-800">Sem foto</span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong>{item.descricao}</strong>
                  <span className="text-mt-neutral-700">{item.local}</span>
                </span>
                <span className="tabular-nums">
                  {typeof item.orcamento === "number" && item.orcamento > 0
                    ? emReais(item.orcamento)
                    : item.estetico
                      ? F.estetico
                      : F.semOrcamento}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm">{r.sem_defeitos_conhecidos ? F.semDefeitos : "Nenhum defeito cadastrado ainda."}</p>
        )}
        {conta.reparoOrcado > 0 && (
          <div className="flex flex-wrap justify-between gap-3 text-xs">
            <span className="text-mt-neutral-700">
              {r.oficina_do_orcamento && orcamentoEm
                ? orcamentoDaOficina(r.oficina_do_orcamento, orcamentoEm)
                : "Oficina e data do orçamento não informadas."}
            </span>
            <span className="font-extrabold">
              {F.totalOrcado} {emReais(conta.reparoOrcado)}
            </span>
          </div>
        )}
      </Secao>

      <Secao id="historico" titulo="Histórico">
        <Linhas linhas={historico} />
      </Secao>

      <Secao id="checklist" titulo="Checklist">
        {faltas.length === 0 ? (
          <p className="m-0 text-xs">{checklistCompletoNa(r.situacao)}</p>
        ) : (
          <ul className="m-0 list-disc pl-4 text-xs text-mt-accent-800">
            {faltas.map((f) => (
              <li key={`${f.campo}-${f.mensagem}`}>{f.mensagem}</li>
            ))}
          </ul>
        )}
      </Secao>

      {inscritos !== null && validaRepasse(perfis) && r.situacao === "publicado" && (
        <InscritosQueCombinam repasse={r} inscritos={inscritos} avisados={avisados} urlDaFicha={urlDaFicha} />
      )}

      <LeadsDoCarro pedidos={pedidos} contatos={contatos} />
    </div>
  );
}
