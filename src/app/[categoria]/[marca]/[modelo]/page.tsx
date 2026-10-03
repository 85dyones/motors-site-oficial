import type { Metadata } from "next";
import { guiasDoModelo } from "../../../../lib/guiasNoSite";
import { notFound, permanentRedirect } from "next/navigation";
import { caminhoEmMinusculas } from "../../../../lib/enderecoAntigo";
import PaginaDeEstoque from "../../../../components/modernist/PaginaDeEstoque";
import EncomendaDeCarro from "../../../../components/EncomendaDeCarro";
import { getCachedSettings } from "../../../../lib/settings";
import { montarCompartilhamento } from "../../../../lib/compartilhamento";
import {
  acharHubDeMarca,
  acharHubDeModelo,
  ancoraDoHistorico,
  hubAdormecido,
  recortesDoEstoque,
} from "../../../../lib/hubsDeEstoque";
import {
  blocoJsonLd,
  schemaDeListagem,
  schemaDePerguntas,
  schemaDeTrilha,
} from "../../../../lib/schemaListagem";
import { schemaDaLoja, schemaDoSite } from "../../../../lib/schemaLoja";
import { perguntasDeCategoria, textoDeModelo } from "../../../../lib/textoDosHubs";
import { buscarTextoDoHub, resolverTextoDoHub } from "../../../../lib/textoEditadoDoHub";
import { seminovo, um, usado } from "../../../../lib/generoDoVeiculo";
import { linkWhatsApp } from "../../../../lib/whatsapp";
import { ehSegmentoDePdp, type SegmentoDePdp } from "../../../../lib/veiculoUrl";

/**
 * Hub de modelo — `/carros/jeep/renegade`.
 *
 * É o alvo do cluster de maior conversão da praça: `renegade usado curitiba`,
 * `compass seminovo curitiba`. Até 2026-08-25 respondia 404 (§0.5.3), e o
 * sinal acumulado por cada ficha morria junto com o carro vendido.
 *
 * Perene pela mesma regra do hub de marca — ver `lib/hubsDeEstoque.ts`.
 */

/**
 * 60 s, o mesmo relógio de `/estoque`, da home e das geográficas — desde
 * 2026-09-21. Com 3600 esta página mostrava no `<h1>` uma contagem até uma
 * hora mais velha que a de `/estoque`: o n8n marca o carro vendido e
 * `/estoque` tira em um minuto, enquanto o hub seguia listando e contando o
 * carro por até sessenta. A leitura é a mesma que `/estoque` já faz a cada
 * minuto (`recortesDoEstoque`), e só roda quando alguém visita.
 */
export const revalidate = 60;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ categoria: string; marca: string; modelo: string }>;
}

async function resolver(params: { categoria: string; marca: string; modelo: string }) {
  if (!ehSegmentoDePdp(params.categoria)) return null;
  const segmento = params.categoria as SegmentoDePdp;
  const { historico, disponiveis } = await recortesDoEstoque();

  const hub = acharHubDeModelo(historico, disponiveis, segmento, params.marca, params.modelo);
  if (!hub) return null;

  return {
    hub,
    disponiveis,
    // Sem carro há mais de 30 dias pelo relógio do feed → `noindex, follow`.
    // Ver `hubAdormecido`.
    adormecido: hubAdormecido(hub, ancoraDoHistorico(historico)),
    // O hub da marca serve para dois usos: o nome canônico na trilha e a lista
    // de modelos irmãos no rodapé da página.
    marca: acharHubDeMarca(historico, disponiveis, segmento, params.marca),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvidos = await params;
  const dados = await resolver(resolvidos);

  if (!dados) {
    return { title: "Modelo não encontrado | Motors Store", robots: { index: false, follow: true } };
  }

  const { hub, adormecido } = dados;
  const caminho = `/${hub.segmento}/${hub.slugMarca}/${hub.slug}`;
  const { companySettings } = await getCachedSettings();

  const precos = hub.veiculos
    .map((v) =>
      v.preco_promocional > 0 && v.preco_promocional < v.preco_original
        ? v.preco_promocional
        : v.preco_original,
    )
    .filter((p) => p > 0);
  const menor =
    precos.length > 0
      ? Math.min(...precos).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0,
        })
      : null;

  // "Saveiro Usada", não "Saveiro Usado". O gênero vem do hub, calculado a
  // partir do histórico — e não é só gramática: quem procura escreve "saveiro
  // usada curitiba", e o título precisa casar com a consulta.
  //
  // ---------------------------------------------------------------------------
  // O `<title>` mudou em 2026-09-21: marca + modelo + "usado", sem preço
  // ---------------------------------------------------------------------------
  // Era `Onix Seminovo em Curitiba a partir de R$ 75.900`. Três coisas saíram
  // do lugar de uma vez:
  //
  //   · a MARCA entrou. "chevrolet onix usado" é consulta; o `<h1>` e a
  //     description já traziam a marca, e só o título não;
  //   · "usado" no lugar de "seminovo". É o termo que a campanha do Google Ads
  //     compra (`[onix plus usado curitiba]`, `[hb20 usado curitiba]`) e o de
  //     maior busca. "Seminovo" continua na description e no `<h1>`, então a
  //     página cobre as duas grafias;
  //   · o PREÇO saiu do título e foi para a description. O título é o que o
  //     Google mais reescreve e mais guarda em cache, e o "a partir de" muda a
  //     cada carro que entra ou sai. Com marca e sufixo da loja, o preço
  //     empurraria o título para além do que o resultado mostra.
  //
  // Depende da grafia canônica (`lib/grafiaCanonica.ts`): sem ela, este título
  // publicaria "Hyundai Hb20 Usado em Curitiba".
  const novo = seminovo(hub.genero);
  const usadoNoGenero = usado(hub.genero);
  const Usado = usadoNoGenero.charAt(0).toUpperCase() + usadoNoGenero.slice(1);

  const title = `${hub.marca} ${hub.nome} ${Usado} em Curitiba | Motors Store`;

  // "a partir de R$ X" só entra quando existe preço real. Faixa inventada é o
  // tipo de promessa que o visitante confere no primeiro clique.
  const aPartirDe = menor ? ` a partir de ${menor}` : "";
  const description =
    hub.veiculos.length > 0
      ? `${hub.marca} ${hub.nome} ${novo} em Curitiba${aPartirDe}, com perícia cautelar independente. ` +
        `${hub.veiculos.length} ${hub.veiculos.length === 1 ? "unidade" : "unidades"}, troca e financiamento. Veja fotos e ficha.`
      : `${hub.marca} ${hub.nome} ${novo} em Curitiba na Motors Store. Perícia cautelar ` +
        "independente, troca e financiamento. Loja no Bacacheri.";

  return {
    title,
    description,
    // Hub que nasceu com a versão colada no modelo aponta para o limpo, em vez
    // de disputar a mesma consulta com ele. Ver `ehRotuloSujo`.
    alternates: {
      canonical: hub.canonicalDe ? `/${hub.segmento}/${hub.slugMarca}/${hub.canonicalDe}` : caminho,
    },
    // O hub continua no ar e continua passando autoridade pelos links; só
    // deixa de pedir índice enquanto dorme. Some do sitemap junto
    // (`caminhosDosHubs`). O primeiro carro que entrar o acorda.
    ...(adormecido ? { robots: { index: false, follow: true } } : {}),
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      rotulo: hub.nome,
      tituloPadrao: `${hub.marca} ${hub.nome} ${novo} em Curitiba`,
      descricaoPadrao: description,
      caminho,
    }),
  };
}

export default async function HubDeModeloPage({ params }: PageProps) {
  const resolvidos = await params;
  // Marca ou modelo em maiúsculas (endereço do site antigo) vai para o
  // endereço em minúsculas em vez de 404. Ver `lib/enderecoAntigo.ts`.
  const emMinusculas = caminhoEmMinusculas([resolvidos.categoria, resolvidos.marca, resolvidos.modelo]);
  if (emMinusculas) permanentRedirect(emMinusculas);
  const dados = await resolver(resolvidos);
  if (!dados) notFound();

  const { hub, marca, disponiveis } = dados;
  const { companySettings } = await getCachedSettings();
  const caminhoDaMarca = `/${hub.segmento}/${hub.slugMarca}`;
  const caminho = `${caminhoDaMarca}/${hub.slug}`;
  const perguntas = perguntasDeCategoria(`${hub.marca} ${hub.nome}`, hub.genero, caminho);

  // O texto que a loja escreveu vence o gerado (2026-08-31). Falha na busca
  // devolve `null` e a página segue com o automático — ver `textoEditadoDoHub`.
  const { titulo, paragrafos: introducao } = resolverTextoDoHub(
    await buscarTextoDoHub(caminho),
    {
      titulo: `${hub.marca} ${hub.nome} ${seminovo(hub.genero)} em Curitiba`,
      paragrafos: textoDeModelo(hub.marca, hub.nome, hub.veiculos, hub.genero),
    },
  );

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
      { nome: hub.marca, caminho: caminhoDaMarca },
      { nome: hub.nome, caminho },
    ]),
    schemaDeListagem(titulo, hub.veiculos),
    schemaDePerguntas(perguntas),
    schemaDaLoja(companySettings, { disponiveis }),
    schemaDoSite(companySettings),
  ]);

  const irmaos = (marca?.modelos ?? []).filter((m) => m.slug !== hub.slug);
  const guiasDoMotor = hub.segmento === "carros" ? guiasDoModelo(hub.slugMarca, hub.slug) : [];
  const temCambio = guiasDoMotor.some((g) => g.slug === "cambio-dupla-embreagem-usado");
  const temMotor = guiasDoMotor.some((g) => g.slug !== "cambio-dupla-embreagem-usado");
  const assuntoDosGuias = temCambio && temMotor ? "motor e câmbio" : temCambio ? "o câmbio" : "o motor";

  /* A saída do hub sem carro (2026-09-01, relatório dos hubs).
     Quem procurou ESTE modelo e não achou é o lead mais qualificado que chega
     no site — e sem saída ele volta para o Google. A alternativa mais honesta
     aqui é a mesma marca: quem quer uma Saveiro aceita ver uma Amarok antes de
     aceitar ver um Onix. Sem nenhuma da marca, cai no estoque de hoje; sem
     estoque nenhum, não desenha nada e o texto perene responde sozinho. */
  const daMesmaMarca = (marca?.modelos ?? []).flatMap((m) => m.veiculos).slice(0, 3);
  const alternativos = daMesmaMarca.length > 0 ? daMesmaMarca : disponiveis.slice(0, 3);
  /* O `avisarHref` saiu daqui em 2026-09-08 — ver a nota gêmea no hub de
     marca. Quem procurou ESTE modelo e não achou é o lead mais qualificado do
     site, e era justamente ele que saía do funil por um link. */

  return (
    <div className="flex flex-col bg-mt-bg text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <PaginaDeEstoque
        trilha={[
          { rotulo: "Home", href: "/" },
          { rotulo: "Estoque", href: "/estoque" },
          { rotulo: hub.marca, href: caminhoDaMarca },
        ]}
        titulo={titulo}
        introducao={introducao}
        veiculos={hub.veiculos}
        alternativos={alternativos}
        rotuloAlternativos={`Enquanto isso, ${daMesmaMarca.length > 0 ? `outros ${hub.marca}` : "no estoque de hoje"}`}
        encomenda={
          <EncomendaDeCarro
            marca={hub.marca}
            modelo={hub.nome}
            caminho={caminho}
            segmento={hub.segmento}
          />
        }
        textoSemEstoque={`Sem ${hub.marca} ${hub.nome} disponível neste momento. A página fica no ar — o modelo faz parte do que a loja compra, e quando ${um(hub.genero)} passar na perícia entra aqui.`}
        blocos={
          irmaos.length > 0
            ? [
                {
                  titulo: `Outros ${hub.marca} em Curitiba`,
                  links: irmaos.map((m) => ({
                    rotulo: m.nome,
                    href: `/${hub.segmento}/${hub.slugMarca}/${m.slug}`,
                    total: m.veiculos.length,
                  })),
                },
              ]
            : []
        }
        /* Os guias de mecânica que o texto dos próprios guias liga a este
           modelo (auditoria de 29/09: nenhum hub de modelo linkava guia). */
        guias={{
          titulo: `Antes de comprar ${um(hub.genero)} ${hub.marca} ${hub.nome}: ${assuntoDosGuias}`,
          lista: guiasDoMotor,
        }}
        faq={perguntas}
      />
    </div>
  );
}
