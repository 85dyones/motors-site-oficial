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

  // Título curto de propósito: o Google corta por volta de 60 caracteres, e o
  // que precisa sobreviver ao corte é "{Marca} seminovo em Curitiba".
  const title = `${hub.nome} Seminovo em Curitiba | Motors Store`;
  const description =
    hub.veiculos.length > 0
      ? `${hub.veiculos.length} ${hub.nome} ${hub.veiculos.length === 1 ? "seminovo" : "seminovos"} em Curitiba, ` +
        "com perícia cautelar independente. Loja no Bacacheri, troca e financiamento."
      : `${hub.nome} seminovo em Curitiba na Motors Store: perícia cautelar independente, troca ` +
        "e financiamento. Loja no Bacacheri.";

  return {
    title,
    description,
    alternates: { canonical: caminho },
    ...montarCompartilhamento({
      empresa: companySettings,
      pagina: "estoque",
      rotulo: hub.nome,
      tituloPadrao: `${hub.nome} seminovo em Curitiba`,
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

  const perguntas = perguntasDeCategoria(`${hub.nome} seminovos`);

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
      { nome: hub.nome, caminho },
    ]),
    schemaDeListagem(`${hub.nome} seminovos em Curitiba`, hub.veiculos),
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
        titulo={`${hub.nome} seminovos em Curitiba`}
        introducao={textoDeMarca(hub.nome, hub.veiculos, hub.modelos.map((m) => m.nome))}
        veiculos={hub.veiculos}
        textoSemEstoque={`Sem ${hub.nome} disponível neste momento. O estoque gira toda semana e esta página continua no ar — quando entrar um, aparece aqui.`}
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
