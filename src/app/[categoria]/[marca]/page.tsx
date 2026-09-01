import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaginaDeEstoque from "../../../components/modernist/PaginaDeEstoque";
import { getCachedSettings } from "../../../lib/settings";
import { montarCompartilhamento } from "../../../lib/compartilhamento";
import {
  acharHubDeMarca,
  hubsDeCarroceria,
  recortesDoEstoque,
} from "../../../lib/hubsDeEstoque";
import {
  blocoJsonLd,
  schemaDeListagem,
  schemaDePerguntas,
  schemaDeTrilha,
} from "../../../lib/schemaListagem";
import { schemaDaLoja } from "../../../lib/schemaLoja";
import { perguntasDeCategoria, textoDeMarca } from "../../../lib/textoDosHubs";
import { generoDoSegmento, seminovo, um } from "../../../lib/generoDoVeiculo";
import { buscarTextoDoHub, resolverTextoDoHub } from "../../../lib/textoEditadoDoHub";
import { ehSegmentoDePdp, type SegmentoDePdp } from "../../../lib/veiculoUrl";

/**
 * Hub de marca — `/carros/jeep`, `/motos/harley-davidson`.
 *
 * Até 2026-08-25 esta URL respondia **404**: `[marca]` existia só como pasta de
 * caminho para chegar à ficha. A consequência está no §0.5.3 do plano de
 * aquisição — a autoridade do site inteiro ficava pendurada em páginas que
 * morrem quando o carro é vendido, e não havia onde ranquear para "jeep usado
 * curitiba", que é o cluster de maior conversão da praça.
 *
 * A página é **perene**: existe enquanto a loja já tiver tido a marca, não
 * enquanto tiver em estoque (a regra e o porquê estão em `lib/hubsDeEstoque.ts`).
 * Marca que a loja nunca vendeu continua 404 — sem isso o site abriria espaço de
 * URL infinito.
 */

export const revalidate = 3600;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ categoria: string; marca: string }>;
}

async function resolver(params: { categoria: string; marca: string }) {
  if (!ehSegmentoDePdp(params.categoria)) return null;
  const { historico, disponiveis } = await recortesDoEstoque();
  const hub = acharHubDeMarca(historico, disponiveis, params.categoria as SegmentoDePdp, params.marca);
  return hub ? { hub, historico, disponiveis } : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvidos = await params;
  const dados = await resolver(resolvidos);

  if (!dados) {
    return { title: "Marca não encontrada | Motors Store", robots: { index: false, follow: true } };
  }

  const { hub } = dados;
  const caminho = `/${hub.segmento}/${hub.slug}`;
  const { companySettings } = await getCachedSettings();

  // O gênero de uma marca é o do SEGMENTO, não o de um modelo: "Volkswagen"
  // cobre a Saveiro e o Polo ao mesmo tempo. `/motos/honda` fala de motos e
  // concorda no feminino; `/carros/honda` fala de carros.
  const genero = generoDoSegmento(hub.segmento);
  const novo = seminovo(genero);
  const Novo = novo.charAt(0).toUpperCase() + novo.slice(1);

  // Título curto de propósito: o Google corta por volta de 60 caracteres, e o
  // que precisa sobreviver ao corte é "{Marca} seminovo em Curitiba".
  const title = `${hub.nome} ${Novo} em Curitiba | Motors Store`;
  const description =
    hub.veiculos.length > 0
      ? `${hub.veiculos.length} ${hub.nome} ${seminovo(genero, hub.veiculos.length !== 1)} em Curitiba, ` +
        "com perícia cautelar independente. Loja no Bacacheri, troca e financiamento."
      : `${hub.nome} ${novo} em Curitiba na Motors Store: perícia cautelar independente, troca ` +
        "e financiamento. Loja no Bacacheri.";

  return {
    title,
    description,
    alternates: { canonical: caminho },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      rotulo: hub.nome,
      tituloPadrao: `${hub.nome} ${novo} em Curitiba`,
      descricaoPadrao: description,
      caminho,
    }),
  };
}

export default async function HubDeMarcaPage({ params }: PageProps) {
  const resolvidos = await params;
  const dados = await resolver(resolvidos);
  if (!dados) notFound();

  const { hub, historico, disponiveis } = dados;
  const { companySettings } = await getCachedSettings();
  const caminho = `/${hub.segmento}/${hub.slug}`;
  const rotuloDoSegmento = hub.segmento === "motos" ? "Motos" : "Carros";
  const genero = generoDoSegmento(hub.segmento);
  const novos = seminovo(genero, true);
  const perguntas = perguntasDeCategoria(`${hub.nome} ${novos}`, genero);

  // O texto que a loja escreveu vence o gerado. Esta rota ficou de fora na
  // entrega de 31/08 junto com `/estoque/[recorte]` — ver a nota lá.
  const { titulo: tituloDaPagina, paragrafos: introducao } = resolverTextoDoHub(
    await buscarTextoDoHub(caminho),
    {
      titulo: `${hub.nome} ${novos} em Curitiba`,
      paragrafos: textoDeMarca(hub.nome, hub.veiculos, hub.modelos.map((m) => m.nome), genero),
    },
  );

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
      { nome: hub.nome, caminho },
    ]),
    schemaDeListagem(tituloDaPagina, hub.veiculos),
    schemaDePerguntas(perguntas),
    schemaDaLoja(companySettings, { disponiveis }),
  ]);

  return (
    <div className="flex flex-col bg-mt-bg text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <PaginaDeEstoque
        trilha={[
          { rotulo: "Home", href: "/" },
          { rotulo: "Estoque", href: "/estoque" },
        ]}
        titulo={tituloDaPagina}
        introducao={introducao}
        veiculos={hub.veiculos}
        textoSemEstoque={`Sem ${hub.nome} disponível neste momento. O estoque gira toda semana e esta página continua no ar — quando entrar ${um(genero)}, aparece aqui.`}
        blocos={[
          ...(hub.modelos.length > 0
            ? [
                {
                  titulo: `Modelos ${hub.nome}`,
                  links: hub.modelos.map((m) => ({
                    rotulo: m.nome,
                    href: `/${hub.segmento}/${hub.slug}/${m.slug}`,
                    total: m.veiculos.length,
                  })),
                },
              ]
            : []),
          {
            titulo: `${rotuloDoSegmento} por carroceria`,
            links: hubsDeCarroceria(historico, disponiveis).map((c) => ({
              rotulo: c.nome,
              href: `/estoque/${c.slug}`,
              total: c.veiculos.length,
            })),
          },
        ]}
        faq={perguntas}
      />
    </div>
  );
}
