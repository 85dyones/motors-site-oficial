import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Fragment } from "react";
import { CardVeiculo, LinkRegua, Rotulo, formatarKm } from "../../../components/modernist/primitivos";
import ContaDoRepasse from "../../../components/repasse/ContaDoRepasse";
import ExameNoPatio from "../../../components/repasse/ExameNoPatio";
import GaleriaDoRepasse, { type FotoDaGaleria } from "../../../components/repasse/GaleriaDoRepasse";
import ListaDoRepasse from "../../../components/repasse/ListaDoRepasse";
import WhatsAppDoRepasse from "../../../components/repasse/WhatsAppDoRepasse";
import { montarCompartilhamento, previaDaFotoDoVeiculo } from "../../../lib/compartilhamento";
import { diasDoExame } from "../../../lib/exameNoPatio";
import { ehFotoPropria } from "../../../lib/fotosDoVeiculo";
import { generoDeModelo } from "../../../lib/generoDoVeiculo";
import { grafiaDoCarro } from "../../../lib/grafiaCanonica";
import { grafoDoRepasse } from "../../../lib/grafoDoRepasse";
import { ddmmEmCuritiba } from "../../../lib/horarioDaLoja";
import { carroDoWhatsApp } from "../../../lib/leadDoRepasse";
import { lerRepassePorSlug, lerRepassePorSufixo, lerRepassesPublicos } from "../../../lib/leituraDosRepasses";
import type { WhatsappDaLoja } from "../../../lib/loteDoRepasse";
import { nomeComAno } from "../../../lib/nomeDoVeiculo";
import {
  ANCORA_DA_CONTA,
  ANCORA_DA_FICHA_DE_ESTADO,
  ANCORA_DA_LISTA,
  ANCORA_DA_LISTA_LOJISTA,
  ANCORA_DO_EXAME,
  CAMINHO_DO_REPASSE,
  CARD_DO_REPASSE,
  DESCRICAO_DO_REPASSE,
  FICHA_DO_REPASSE,
  NAO_ENCONTRADO_NO_REPASSE,
  PERGUNTAS_DO_REPASSE_CABECALHO,
  TRILHA_DO_REPASSE,
  abaixoDaFipeNaBarra,
  anosDoCarro,
  constaNoHistorico,
  consultaFeitaEm,
  laudoNaListaRapida,
  laudoNoHistorico,
  orcamentoDaOficina,
  seloDeAberto,
  textoAlternativoDaFoto,
  tituloDaFichaNaBusca,
  tituloDoExame,
  tituloDosParecidos,
} from "../../../lib/paginaDoRepasse";
import { disponiveisDe } from "../../../lib/regrasEstoque";
import {
  aparecePublicamente,
  contaDoRepasse,
  emReais,
  estadoDoRepasse,
  etiquetaDoRepasse,
  type Repasse,
} from "../../../lib/repasse";
import { blocoJsonLd } from "../../../lib/schemaListagem";
import { getCachedSettings } from "../../../lib/settings";
import { TIPO_NO_FEED, parecidosDoRepasse } from "../../../lib/similares";
import { getEstoque, getVeiculoPdpUrl } from "../../../lib/supabase";
import { numeroDaLoja } from "../../../lib/whatsapp";
import type { Veiculo } from "../../../types";

/**
 * A ficha do carro de repasse (spec §7.2; pranchas "Ficha do carro de
 * repasse" e "Ficha no celular com a barra fixa").
 *
 * Quem decide se a ficha existe é a PÁGINA (decisão 14): a leitura por slug
 * devolve o carro mesmo com a carência vencida, e `aparecePublicamente` falso
 * vira `notFound()`. Vendido na carência fica no ar e indexado, com o selo, a
 * lista do repasse e os parecidos — igual ao estoque.
 *
 * Slug que não abre carro procura o carro pelo sufixo (decisão 13): o slug
 * muda quando alguém corrige marca, modelo ou ano no painel, e o sufixo — os 6
 * primeiros do uuid — não. Achou exatamente um, 308 para o slug atual; zero ou
 * mais de um, não encontrado.
 *
 * Quatro estados (`estadoDoRepasse`): aberto a todos (WhatsApp, exame, barra
 * fixa), só para lojistas (a faixa no lugar do WhatsApp e do exame, decisão
 * 4), reservado e vendido (sem exame; a lista do repasse e o WhatsApp de
 * pergunta, decisão 30 do plano).
 *
 * Todo WhatsApp daqui passa pelo pré-cadastro (`WhatsAppDoRepasse`, pedido do
 * dono em 28/09): o botão abre o modal da ficha do estoque, e a mensagem de
 * cada estado só é montada no envio, com o rastreio do navegador.
 */
export const revalidate = 60;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ carro: string }>;
}

export async function generateStaticParams() {
  const repasses = await lerRepassesPublicos(new Date(), "/repasse/[carro]").catch((): Repasse[] => []);
  return repasses.map((r) => ({ carro: r.slug }));
}

/**
 * O nome do carro na ficha vem na grafia da casa, e não como o cadastro
 * gravou (pedido do dono em 29/09: o `<h1>` mostrava "PALIO 1.0 ECONOMY FIRE
 * FLEX 8V 4P"). Quem chama passa o carro por `grafiaDoCarro`, a composição que
 * a rota de leads já usava (#163). Só onde a ficha NOMEIA o carro: `<h1>`,
 * `<title>`, card de compartilhamento, JSON-LD, a FIPE da conta e os títulos
 * do exame e dos parecidos. Slug, mensagem do WhatsApp e rastreio seguem com o
 * carro como está no banco.
 */
const nomeDe = (r: Repasse) => nomeComAno({ marca: r.marca, modelo: r.modelo, versao: r.versao, ano: r.ano_modelo });

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { carro } = await params;
  const r = await lerRepassePorSlug(carro).catch(() => null);
  if (!r || !aparecePublicamente(r, new Date())) {
    return { title: NAO_ENCONTRADO_NO_REPASSE.tituloNaBusca, description: NAO_ENCONTRADO_NO_REPASSE.descricaoNaBusca };
  }
  const nome = nomeDe(grafiaDoCarro(r));
  const caminho = `${CAMINHO_DO_REPASSE}/${r.slug}`;
  const estado = estadoDoRepasse(r);
  const { companySettings } = await getCachedSettings();
  const previa = previaDaFotoDoVeiculo(r.whatsapp_images[0] ?? r.web_full_images[0] ?? "");
  return {
    title: tituloDaFichaNaBusca(nome),
    description: r.resumo ?? DESCRICAO_DO_REPASSE,
    alternates: { canonical: caminho },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "pdp",
      rotulo: TRILHA_DO_REPASSE.repasse,
      // Reservado e vendido não anunciam preço no card — a régua da ficha do estoque.
      tituloPadrao: estado === "aberto" || estado === "lojistas" ? `${nome} · ${emReais(r.preco)}` : nome,
      descricaoPadrao: r.resumo ?? DESCRICAO_DO_REPASSE,
      caminho,
      imagemPreferida: previa.url,
      imagemPreferidaSemDimensao: previa.semDimensao,
    }),
  };
}

const MARGEM = "px-[18px] lg:px-10";
const SECAO = `border-t-2 border-mt-regua py-10 ${MARGEM}`;
const TITULO = "mt-titulo m-0 mt-2 text-[28px] lg:text-[36px]";

export default async function FichaDoRepasse({ params }: PageProps) {
  const { carro } = await params;
  const agora = new Date();

  const r = await lerRepassePorSlug(carro);
  if (!r) {
    const candidatos = await lerRepassePorSufixo(carro.slice(-6));
    if (candidatos.length === 1 && candidatos[0].slug !== carro && aparecePublicamente(candidatos[0], agora)) {
      permanentRedirect(`${CAMINHO_DO_REPASSE}/${candidatos[0].slug}`);
    }
    notFound();
  }
  if (!aparecePublicamente(r, agora)) notFound();
  const estado = estadoDoRepasse(r);
  if (!estado) notFound();

  const [estoque, { companySettings }] = await Promise.all([
    getEstoque()
      .then((lista) => disponiveisDe(lista))
      .catch((): Veiculo[] => []),
    getCachedSettings(),
  ]);

  const F = FICHA_DO_REPASSE;
  const naGrafia = grafiaDoCarro(r);
  const nome = nomeDe(naGrafia);
  const caminho = `${CAMINHO_DO_REPASSE}/${r.slug}`;
  const conta = contaDoRepasse(r);
  const genero = generoDeModelo(naGrafia.modelo, { tipo: r.carroceria ? TIPO_NO_FEED[r.carroceria] : "" });
  const parecidos = parecidosDoRepasse(r, estoque);
  const whatsappDaLoja: WhatsappDaLoja = {
    whatsappRaw: companySettings?.whatsappRaw ?? "",
    whatsapp: companySettings?.whatsapp ?? "",
  };
  const temWhatsApp = estado !== "lojistas" && numeroDaLoja(whatsappDaLoja) !== "";
  const carroDoContato = carroDoWhatsApp(r);
  const grafo = grafoDoRepasse({
    repasse: naGrafia,
    caminho,
    trilha: [
      { nome: TRILHA_DO_REPASSE.inicio, caminho: "/" },
      { nome: TRILHA_DO_REPASSE.repasse, caminho: CAMINHO_DO_REPASSE },
      { nome, caminho },
    ],
    empresa: companySettings,
    disponiveis: estoque,
  });

  const defeitosComFoto = r.itens_de_estado.flatMap((item) => (item.foto ? [{ ...item, foto: item.foto }] : []));
  const fotos: FotoDaGaleria[] = [
    ...r.web_full_images.map((src, i) => ({ src, alt: textoAlternativoDaFoto(nome, i + 1), defeito: null })),
    ...defeitosComFoto.map((item, i) => ({ src: item.foto, alt: `${item.descricao}, ${item.local}`, defeito: i + 1 })),
  ];
  const especificacoes = [anosDoCarro(r), formatarKm(r.quilometragem), r.cambio, r.combustivel, r.cor]
    .filter(Boolean)
    .join(" · ");
  const selo =
    estado === "aberto"
      ? seloDeAberto(ddmmEmCuritiba(r.aberto_ao_publico_em) ?? "")
      : estado === "lojistas"
        ? F.seloLojistas
        : estado === "reservado"
          ? F.seloReservado
          : F.seloVendido;
  const consulta = ddmmEmCuritiba(r.historico_consultado_em);
  const historico: Array<[string, string]> = [
    [F.laudo, laudoNoHistorico(r.laudo, r.laudo_apontamento)],
    [F.leilao, constaNoHistorico(r.leilao_consta, r.leilao_detalhe)],
    [F.sinistro, constaNoHistorico(r.sinistro_consta, r.sinistro_detalhe)],
    [F.documento, F.documentoValor],
    [F.transferenciaRotulo, F.transferenciaValor],
    ...(consulta ? [[F.consulta, consultaFeitaEm(consulta)] as [string, string]] : []),
  ];
  const abaixo = conta.abaixoDaFipe !== null && conta.abaixoDaFipe > 0 ? conta.abaixoDaFipe : null;

  return (
    <div className="font-modernist pb-24 lg:pb-0">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: blocoJsonLd(grafo) }} />

      <nav aria-label="Trilha" className={`pt-8 text-[11px] font-semibold tracking-[.16em] text-mt-neutral-600 lg:pt-11 ${MARGEM}`}>
        <Link href="/" className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
          {TRILHA_DO_REPASSE.inicio.toUpperCase()}
        </Link>
        {" / "}
        <Link href={CAMINHO_DO_REPASSE} className="mt-foco text-mt-neutral-600 no-underline hover:text-mt-ink">
          {TRILHA_DO_REPASSE.repasse.toUpperCase()}
        </Link>
        {" / "}
        <span className="text-mt-ink">{nome.toUpperCase()}</span>
      </nav>

      <section className={`grid gap-8 pt-6 lg:grid-cols-[1.35fr_1fr] ${MARGEM}`}>
        <GaleriaDoRepasse fotos={fotos} etiqueta={etiquetaDoRepasse(r)} />
        <div>
          <p className="m-0 text-[11px] font-semibold tracking-[.16em] text-mt-accent">{r.marca.toUpperCase()}</p>
          <h1 className="mt-titulo m-0 mt-1 text-[34px] lg:text-[44px]">{[naGrafia.modelo, naGrafia.versao].filter(Boolean).join(" ")}</h1>
          <p className="m-0 mt-2 text-[13px] text-mt-neutral-700">{especificacoes}</p>
          <span className="mt-etiqueta mt-3 inline-block">{selo}</span>

          <div className={`mt-6 ${estado === "reservado" || estado === "vendido" ? "opacity-60" : ""}`}>
            <ContaDoRepasse
              repasse={r}
              variante="ficha"
              carroNaFipe={[naGrafia.modelo, naGrafia.versao, String(r.ano_modelo)].filter(Boolean).join(" ")}
            />
          </div>

          {estado === "aberto" && (
            <div className="mt-6 flex flex-wrap gap-3">
              {temWhatsApp && (
                <WhatsAppDoRepasse assunto={{ carro: carroDoContato, estado }} whatsappDaLoja={whatsappDaLoja} origem="repasse-ficha">
                  {F.quero}
                </WhatsAppDoRepasse>
              )}
              <a href={`#${ANCORA_DO_EXAME}`} className="mt-btn mt-btn-contorno mt-foco">
                {F.marcarExame}
              </a>
            </div>
          )}

          {estado === "lojistas" && (
            <div className="mt-6 border-2 border-mt-ink p-5">
              <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">{CARD_DO_REPASSE.soLojistas}</p>
              <p className="m-0 mt-1 text-[14px]">{CARD_DO_REPASSE.soLojistasTexto}</p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <a href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA_LOJISTA}`} className="mt-btn mt-btn-tinta mt-foco">
                  {CARD_DO_REPASSE.cadastrarCnpj}
                </a>
                <a href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA}`} className="mt-link-regua mt-foco">
                  {CARD_DO_REPASSE.aviseQuandoAbrir}
                </a>
              </div>
            </div>
          )}

          {(estado === "reservado" || estado === "vendido") && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <a href={`#${ANCORA_DA_LISTA}`} className="mt-btn mt-btn-tinta mt-foco">
                {estado === "reservado" ? CARD_DO_REPASSE.aviseSeVoltar : CARD_DO_REPASSE.entrarNaLista}
              </a>
              {temWhatsApp && (
                <WhatsAppDoRepasse
                  assunto={{ carro: carroDoContato, estado }}
                  whatsappDaLoja={whatsappDaLoja}
                  origem="repasse-ficha"
                  className="mt-btn mt-btn-contorno mt-foco"
                >
                  {PERGUNTAS_DO_REPASSE_CABECALHO.botao}
                </WhatsAppDoRepasse>
              )}
            </div>
          )}

          <ul className="m-0 mt-6 grid list-none gap-2 p-0 text-[13px]">
            <li className={r.laudo === "aprovado" || r.laudo === "aprovado_com_apontamento" ? "font-semibold text-mt-ink" : ""}>
              {laudoNaListaRapida(r.laudo)}
            </li>
            <li>{F.semGarantia}</li>
            <li>{F.aVista}</li>
            <li>{F.transferencia}</li>
          </ul>
        </div>
      </section>

      {r.motivo && (
        <section className={`mt-10 ${SECAO}`}>
          <Rotulo accent>{F.motivoRotulo}</Rotulo>
          {conta.reparoOrcado > 0 && <h2 className={TITULO}>{F.motivoComReparo}</h2>}
          <p className="m-0 mt-3 max-w-[680px] text-[15px] leading-relaxed text-mt-neutral-800">{r.motivo}</p>
        </section>
      )}

      <section id={ANCORA_DA_FICHA_DE_ESTADO} className={`scroll-mt-24 ${SECAO}`}>
        <Rotulo accent>{F.fichaRotulo}</Rotulo>
        <h2 className={TITULO}>{F.fichaTitulo}</h2>
        <p className="m-0 mt-2 max-w-[620px] text-[14px] leading-relaxed text-mt-neutral-800">{F.fichaTexto}</p>
        {r.sem_defeitos_conhecidos || r.itens_de_estado.length === 0 ? (
          <p className="m-0 mt-6 text-[14px] font-semibold">{F.semDefeitos}</p>
        ) : (
          <div className="mt-foco mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label={F.fichaTitulo}>
            <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b-2 border-mt-regua text-[11px] tracking-[.12em] text-mt-neutral-600">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {F.colunaFoto}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {F.colunaItem}
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    {F.colunaOrcamento}
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.itens_de_estado.map((item, i) => (
                  <tr key={`${i}-${item.descricao}`} className="border-b border-mt-regua-fina align-top">
                    <td className="py-3 pr-4">
                      {item.foto ? (
                        <Image
                          src={item.foto}
                          alt={`${item.descricao}, ${item.local}`}
                          width={96}
                          height={72}
                          unoptimized={ehFotoPropria(item.foto)}
                          className="h-[72px] w-24 object-cover"
                        />
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <strong className="block text-mt-ink">{item.descricao}</strong>
                      <span className="text-mt-neutral-700">{item.local}</span>
                    </td>
                    <td className="py-3 text-right">
                      {typeof item.orcamento === "number" && item.orcamento > 0
                        ? emReais(item.orcamento)
                        : item.estetico
                          ? F.estetico
                          : F.semOrcamento}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {conta.reparoOrcado > 0 && (
          <div className="mt-4 flex flex-wrap justify-between gap-3 text-[13px]">
            {r.oficina_do_orcamento && r.orcamento_em && (
              <span className="text-mt-neutral-700">
                {orcamentoDaOficina(r.oficina_do_orcamento, ddmmEmCuritiba(r.orcamento_em) ?? "")}
              </span>
            )}
            <span className="font-extrabold">
              {F.totalOrcado} {emReais(conta.reparoOrcado)}
            </span>
          </div>
        )}
      </section>

      <section className={SECAO}>
        <Rotulo accent>{F.historicoRotulo}</Rotulo>
        <dl className="m-0 mt-4 grid max-w-[720px] grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
          {historico.map(([rotulo, valor]) => (
            <Fragment key={rotulo}>
              <dt className="font-semibold">{rotulo}</dt>
              <dd className="m-0 text-mt-neutral-800">{valor}</dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <section className={SECAO}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <Rotulo accent>{F.naoVemRotulo}</Rotulo>
            <ul className="m-0 mt-4 grid list-none gap-2 p-0 text-[14px]">
              {F.naoVem.map((item) => (
                <li key={item}>
                  <span aria-hidden="true" className="mr-2 font-extrabold text-mt-accent">
                    ✕
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="m-0 text-[18px] font-extrabold">{F.naoVemDestaque}</p>
            <p className="m-0 mt-2 text-[14px] leading-relaxed text-mt-neutral-800">{F.naoVemTexto}</p>
            <div className="mt-4">
              <LinkRegua href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_CONTA}`}>{F.entenda}</LinkRegua>
            </div>
          </div>
        </div>
      </section>

      {estado === "aberto" && (
        <ExameNoPatio
          carro={{ id: r.id, slug: r.slug, marca: r.marca, modelo: r.modelo, versao: r.versao, ano_modelo: r.ano_modelo, preco: r.preco }}
          dias={diasDoExame(agora)}
          titulo={tituloDoExame(naGrafia.modelo, genero)}
        />
      )}

      {(estado === "reservado" || estado === "vendido") && (
        <div className={SECAO}>
          <ListaDoRepasse contexto="ficha" />
        </div>
      )}

      {parecidos.length > 0 && (
        <section className={SECAO}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Rotulo accent>{F.parecidosRotulo}</Rotulo>
              <h2 className={TITULO}>{tituloDosParecidos(naGrafia.modelo, genero)}</h2>
            </div>
            <LinkRegua href="/estoque">{F.verOEstoque}</LinkRegua>
          </div>
          <ul className="m-0 mt-6 grid list-none gap-x-6 gap-y-10 p-0 sm:grid-cols-2 desktop:grid-cols-3">
            {parecidos.map((v) => (
              <li key={v.id}>
                <CardVeiculo veiculo={v} href={getVeiculoPdpUrl(v)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {estado === "aberto" && temWhatsApp && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t-2 border-mt-regua bg-mt-bg px-[18px] py-3 lg:hidden">
          <div>
            <div className="text-[20px] font-extrabold tracking-[-.02em]">{emReais(conta.preco)}</div>
            <div className="text-[11px] text-mt-neutral-700">
              {F.aVistaCurto}
              {abaixo !== null && (
                <>
                  {" · "}
                  <strong className="text-mt-accent">{abaixoDaFipeNaBarra(emReais(abaixo))}</strong>
                </>
              )}
            </div>
          </div>
          <WhatsAppDoRepasse assunto={{ carro: carroDoContato, estado }} whatsappDaLoja={whatsappDaLoja} origem="repasse-barra">
            {F.queroEste}
          </WhatsAppDoRepasse>
        </div>
      )}
    </div>
  );
}
