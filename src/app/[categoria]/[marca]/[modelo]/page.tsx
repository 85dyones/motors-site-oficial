import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaginaDeEstoque from "../../../../components/modernist/PaginaDeEstoque";
import { getCachedSettings } from "../../../../lib/settings";
import { montarCompartilhamento } from "../../../../lib/compartilhamento";
import {
  acharHubDeMarca,
  acharHubDeModelo,
  recortesDoEstoque,
} from "../../../../lib/hubsDeEstoque";
import {
  blocoJsonLd,
  schemaDeListagem,
  schemaDePerguntas,
  schemaDeTrilha,
} from "../../../../lib/schemaListagem";
import { schemaDaLoja } from "../../../../lib/schemaLoja";
import { perguntasDeCategoria, textoDeModelo } from "../../../../lib/textoDosHubs";
import { buscarTextoDoHub, resolverTextoDoHub } from "../../../../lib/textoEditadoDoHub";
import { seminovo, um } from "../../../../lib/generoDoVeiculo";
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

export const revalidate = 3600;
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

  const { hub } = dados;
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

  // "a partir de R$ X" só entra quando existe preço real. Faixa inventada em
  // título é o tipo de promessa que o visitante confere no primeiro clique.
  // "Saveiro Seminova", não "Saveiro Seminovo". O gênero vem do hub, calculado
  // a partir do histórico — e não é só gramática: quem procura escreve
  // "saveiro usada curitiba", e o título precisa casar com a consulta.
  const novo = seminovo(hub.genero);
  const Novo = novo.charAt(0).toUpperCase() + novo.slice(1);

  const title = menor
    ? `${hub.nome} ${Novo} em Curitiba a partir de ${menor}`
    : `${hub.nome} ${Novo} em Curitiba | Motors Store`;

  const description =
    hub.veiculos.length > 0
      ? `${hub.marca} ${hub.nome} ${novo} em Curitiba com perícia cautelar independente. ` +
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
  const dados = await resolver(resolvidos);
  if (!dados) notFound();

  const { hub, marca, disponiveis } = dados;
  const { companySettings } = await getCachedSettings();
  const caminhoDaMarca = `/${hub.segmento}/${hub.slugMarca}`;
  const caminho = `${caminhoDaMarca}/${hub.slug}`;
  const perguntas = perguntasDeCategoria(`${hub.marca} ${hub.nome}`, hub.genero);

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
  ]);

  const irmaos = (marca?.modelos ?? []).filter((m) => m.slug !== hub.slug);

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
        faq={perguntas}
      />
    </div>
  );
}
