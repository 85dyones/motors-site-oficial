import type { Metadata } from "next";
import Link from "next/link";
import CardDoRepasse from "../../components/repasse/CardDoRepasse";
import ContaDoRepasse from "../../components/repasse/ContaDoRepasse";
import ListaDoRepasse from "../../components/repasse/ListaDoRepasse";
import LoteDoRepasse from "../../components/repasse/LoteDoRepasse";
import {
  ComoComprar,
  ContaAberta,
  PerguntasDoRepasse,
  ProvasDoRepasse,
  RepasseOuEstoque,
  ServeParaVoce,
} from "../../components/repasse/SecoesDoRepasse";
import TrilhaDoHeroi from "../../components/repasse/TrilhaDoHeroi";
import { CardVeiculo, LinkRegua, Rotulo } from "../../components/modernist/primitivos";
import { montarCompartilhamento } from "../../lib/compartilhamento";
import { patioEmDestaque } from "../../lib/fichaPerdida";
import { grafoDaPaginaDoRepasse } from "../../lib/grafoDoRepasse";
import { lerRepassesPublicos } from "../../lib/leituraDosRepasses";
import { resumoDoLote, type WhatsappDaLoja } from "../../lib/loteDoRepasse";
import {
  ANCORA_DO_ESTOQUE,
  ANCORA_DO_LOTE,
  CAMINHO_DO_REPASSE,
  COMO_LER_UM_REPASSE,
  DESCRICAO_DO_REPASSE,
  HEROI_DO_REPASSE,
  JA_SAIRAM,
  LOTE_DO_REPASSE,
  PERGUNTAS_DO_REPASSE,
  PRECISA_FINANCIAR,
  TITULO_SEO_DO_REPASSE,
  TRILHA_DO_REPASSE,
  VAZIO_DO_REPASSE,
  linhaDoLote,
  linhaDoReparo,
  textoDoVazio,
  tituloDaContaDoCarro,
  tituloDoLote,
} from "../../lib/paginaDoRepasse";
import { disponiveisDe } from "../../lib/regrasEstoque";
import { blocoJsonLd } from "../../lib/schemaListagem";
import { getCachedSettings } from "../../lib/settings";
import { getEstoque, getVeiculoPdpUrl } from "../../lib/supabase";
import type { Veiculo } from "../../types";

/**
 * `/repasse` — a seção do Repasse Motors (spec §7.1; pranchas "Página
 * /repasse" e "Página /repasse sem carro aberto").
 *
 * Um minuto, como `/estoque` e a ficha: o carro muda de situação pelo painel
 * (reservar, vender, abrir para todos) e nada avisa o site.
 *
 * Ordem das seções, a das pranchas: herói escuro com o seletor de trilha,
 * faixa das quatro provas, lote, "precisa financiar?", "já saíram", a conta
 * aberta, repasse × estoque, "serve para você?", como comprar, lista do
 * repasse, perguntas. Sem carro no lote, o topo vira o do vazio (lista, "já
 * saíram", três carros do estoque com garantia) e a explicação continua
 * embaixo (decisão 20 do plano).
 *
 * A leitura dos repasses NÃO tem `.catch`: numa pane, mostrar "nenhum
 * repasse aberto" seria afirmar o que não se sabe; o ISR segura a última
 * página boa. O estoque tem: ele só alimenta a amostra do vazio e a faixa de
 * preço do `AutoDealer`.
 */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { companySettings } = await getCachedSettings();
  return {
    title: TITULO_SEO_DO_REPASSE,
    description: DESCRICAO_DO_REPASSE,
    alternates: { canonical: CAMINHO_DO_REPASSE },
    ...montarCompartilhamento({ empresa: companySettings, pagina: "repasse", caminho: CAMINHO_DO_REPASSE }),
  };
}

const MARGEM = "px-[18px] lg:px-10";

export default async function PaginaDoRepasse() {
  const agora = new Date();
  const [visiveis, disponiveis, { companySettings }] = await Promise.all([
    lerRepassesPublicos(agora, CAMINHO_DO_REPASSE),
    getEstoque()
      .then((estoque) => disponiveisDe(estoque))
      .catch((): Veiculo[] => []),
    getCachedSettings(),
  ]);

  const resumo = resumoDoLote(visiveis, agora);
  const vazio = resumo.lote.length === 0;
  // Só o número da loja vai para as ilhas cliente — nunca o `companySettings` inteiro.
  const whatsappDaLoja: WhatsappDaLoja = {
    whatsappRaw: companySettings?.whatsappRaw ?? "",
    whatsapp: companySettings?.whatsapp ?? "",
  };
  const grafo = grafoDaPaginaDoRepasse({
    repasses: resumo.lote,
    perguntas: PERGUNTAS_DO_REPASSE,
    trilha: [
      { nome: TRILHA_DO_REPASSE.inicio, caminho: "/" },
      { nome: TRILHA_DO_REPASSE.repasse, caminho: CAMINHO_DO_REPASSE },
    ],
    empresa: companySettings,
    disponiveis,
  });
  const exemplo = resumo.exemploDoHeroi;
  const reparosDoExemplo = exemplo
    ? exemplo.itens_de_estado.filter((i) => typeof i.orcamento === "number" && i.orcamento > 0).map((i) => i.descricao)
    : [];

  const jaSairam =
    resumo.sairam.length > 0 ? (
      <section className={`border-t-2 border-mt-regua py-12 ${MARGEM}`}>
        <Rotulo accent>{JA_SAIRAM.rotulo}</Rotulo>
        <p className="m-0 mt-2 text-[14px] text-mt-neutral-800">{vazio ? JA_SAIRAM.textoNoVazio : JA_SAIRAM.texto}</p>
        <ul className="m-0 mt-6 grid list-none gap-x-6 gap-y-10 p-0 sm:grid-cols-2 desktop:grid-cols-3">
          {resumo.sairam.map((r) => (
            <li key={r.id}>
              <CardDoRepasse repasse={r} whatsappDaLoja={whatsappDaLoja} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="font-modernist">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blocoJsonLd(grafo) }} />

      <section className="bg-mt-inverso-fundo text-mt-inverso">
        <div className={`grid gap-10 py-10 lg:grid-cols-[1.4fr_1fr] lg:py-14 ${MARGEM}`}>
          <div>
            <nav aria-label="Trilha" className="mt-trilha text-[11px] font-semibold tracking-[.16em] text-mt-inverso-suave">
              <Link href="/" className="mt-foco text-mt-inverso-suave no-underline hover:text-mt-inverso">
                {TRILHA_DO_REPASSE.inicio.toUpperCase()}
              </Link>
              {" / "}
              <span className="text-mt-inverso">{TRILHA_DO_REPASSE.repasse.toUpperCase()}</span>
            </nav>
            <p className="m-0 mt-6 text-[11px] font-extrabold tracking-[.14em] text-mt-cobre-marca">{HEROI_DO_REPASSE.rotulo}</p>
            <h1 className="mt-titulo m-0 mt-3 text-[38px] lg:text-[64px]">{HEROI_DO_REPASSE.titulo}</h1>
            <p className="m-0 mt-4 max-w-[560px] text-[15px] leading-relaxed text-mt-inverso-suave">{HEROI_DO_REPASSE.texto}</p>
            {!vazio && <TrilhaDoHeroi totalNoLote={resumo.lote.length} />}
            {resumo.atualizacao && (
              <p className="m-0 mt-6 text-[12px] text-mt-inverso-suave">
                {linhaDoLote({ ...resumo.atualizacao, abertos: resumo.abertos.length, soLojistas: resumo.soLojistas })}
              </p>
            )}
          </div>
          {exemplo && (
            <aside className="self-start border-2 border-mt-inverso-regua p-5">
              <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">{COMO_LER_UM_REPASSE.rotulo}</p>
              <p className="m-0 mt-2 text-[20px] font-extrabold">{tituloDaContaDoCarro(exemplo)}</p>
              {reparosDoExemplo.length > 0 && (
                <p className="m-0 mt-1 text-[13px] text-mt-inverso-suave">{linhaDoReparo(reparosDoExemplo)}</p>
              )}
              <div className="mt-4">
                <ContaDoRepasse repasse={exemplo} variante="exemplo" />
              </div>
              {reparosDoExemplo.length > 0 && (
                <p className="m-0 mt-4 text-[12px] leading-snug text-mt-inverso-suave">{COMO_LER_UM_REPASSE.nota}</p>
              )}
            </aside>
          )}
        </div>
      </section>

      <ProvasDoRepasse />

      {vazio ? (
        <>
          <section id={ANCORA_DO_LOTE} className={`scroll-mt-24 py-12 ${MARGEM}`}>
            <Rotulo accent>{LOTE_DO_REPASSE.rotulo}</Rotulo>
            <h2 className="mt-titulo m-0 mt-2 text-3xl md:text-[46px]">{VAZIO_DO_REPASSE.titulo}</h2>
            <p className="m-0 mt-3 max-w-[620px] text-[15px] leading-relaxed text-mt-neutral-800">
              {textoDoVazio(resumo.ultimaSaida)}
            </p>
            <p className="m-0 mt-2 max-w-[620px] text-[15px] leading-relaxed text-mt-neutral-800">{VAZIO_DO_REPASSE.lojista}</p>
            <div className="mt-4">
              <LinkRegua href={`#${ANCORA_DO_ESTOQUE}`}>{VAZIO_DO_REPASSE.enquantoIsso}</LinkRegua>
            </div>
            <div className="mt-8">
              <ListaDoRepasse contexto="vazio" cabecalho={false} />
            </div>
          </section>
          {jaSairam}
          {disponiveis.length > 0 && (
            <section id={ANCORA_DO_ESTOQUE} className={`scroll-mt-24 border-t-2 border-mt-regua py-12 ${MARGEM}`}>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <Rotulo accent>{VAZIO_DO_REPASSE.estoqueRotulo}</Rotulo>
                  <h2 className="mt-titulo m-0 mt-2 text-3xl md:text-[40px]">{VAZIO_DO_REPASSE.estoqueTitulo}</h2>
                </div>
                <LinkRegua href="/estoque">{VAZIO_DO_REPASSE.verTodoOEstoque}</LinkRegua>
              </div>
              <ul className="m-0 mt-6 grid list-none gap-x-6 gap-y-10 p-0 sm:grid-cols-2 desktop:grid-cols-3">
                {patioEmDestaque(disponiveis, 3).map((v) => (
                  <li key={v.id}>
                    <CardVeiculo veiculo={v} href={getVeiculoPdpUrl(v)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <section id={ANCORA_DO_LOTE} className={`scroll-mt-24 py-12 ${MARGEM}`}>
            <Rotulo accent>{LOTE_DO_REPASSE.rotulo}</Rotulo>
            <h2 className="mt-titulo m-0 mt-2 text-3xl md:text-[46px]">{tituloDoLote(resumo.lote.length)}</h2>
            <LoteDoRepasse lote={resumo.lote} whatsappDaLoja={whatsappDaLoja} />
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-2 border-mt-regua p-5">
              <p className="m-0 max-w-[640px] text-[14px] leading-relaxed">{PRECISA_FINANCIAR.texto}</p>
              <LinkRegua href="/estoque">{PRECISA_FINANCIAR.link}</LinkRegua>
            </div>
          </section>
          {jaSairam}
        </>
      )}

      <ContaAberta exemplo={vazio ? null : resumo.exemploDaConta} />
      <RepasseOuEstoque />
      <ServeParaVoce />
      <ComoComprar />
      {!vazio && (
        <div className={`border-t-2 border-mt-regua py-12 ${MARGEM}`}>
          <ListaDoRepasse contexto="pagina" />
        </div>
      )}
      <PerguntasDoRepasse whatsappDaLoja={whatsappDaLoja} />
    </div>
  );
}
