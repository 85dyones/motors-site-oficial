import PaginaDeEstoque from "./modernist/PaginaDeEstoque";
import ContagemDeEstoque from "./ContagemDeEstoque";
import LinkComoChegar from "./LinkComoChegar";
import { getCachedSettings } from "../lib/settings";
import { hubsDeCarroceria, hubsDeMarca, recortesDoEstoque } from "../lib/hubsDeEstoque";
import { blocoJsonLd, schemaDeListagem, schemaDePerguntas, schemaDeTrilha } from "../lib/schemaListagem";
import { schemaDaLoja, schemaDoSite } from "../lib/schemaLoja";
import type { PaginaGeo } from "../lib/paginasGeo";

/**
 * O corpo das duas páginas geográficas.
 *
 * Server component: a grade precisa estar no HTML servido, que é o ponto
 * inteiro de uma página feita para ranquear (ver `PaginaDeEstoque`).
 *
 * As rotas são duas pastas estáticas (`/seminovos-curitiba`,
 * `/seminovos-bacacheri`) e não uma rota dinâmica de raiz. Um `[geo]` no topo
 * de `src/app` capturaria todo caminho desconhecido do site — `/qualquer-coisa`
 * responderia 200 — e transformaria um erro de link em página indexável.
 */
export default async function PaginaGeoView({ pagina }: { pagina: PaginaGeo }) {
  const [{ historico, disponiveis }, settings] = await Promise.all([
    recortesDoEstoque(),
    getCachedSettings(),
  ]);

  const caminho = `/${pagina.slug}`;
  const marcas = hubsDeMarca(historico, disponiveis, "carros").filter((m) => m.veiculos.length > 0);
  const carrocerias = hubsDeCarroceria(historico, disponiveis).filter((c) => c.veiculos.length > 0);

  const jsonLd = blocoJsonLd([
    schemaDeTrilha([
      { nome: "Home", caminho: "/" },
      { nome: "Estoque", caminho: "/estoque" },
      { nome: pagina.nome, caminho },
    ]),
    schemaDeListagem(pagina.titulo, disponiveis),
    schemaDePerguntas(pagina.faq),
    // A loja com `@id` também aqui: é a página que fala do endereço físico, e é
    // ela que o Google deve associar ao pacote local do bairro.
    schemaDaLoja(settings.companySettings, { disponiveis }),
    schemaDoSite(settings.companySettings),
  ]);

  return (
    <div className="flex flex-col bg-mt-bg text-mt-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <ContagemDeEstoque total={disponiveis.length} />
      <PaginaDeEstoque
        trilha={[
          { rotulo: "Home", href: "/" },
          { rotulo: "Estoque", href: "/estoque" },
        ]}
        titulo={pagina.titulo}
        introducao={pagina.paragrafos}
        veiculos={disponiveis}
        blocos={[
          { titulo: "Por carroceria", links: carrocerias.map((c) => ({ rotulo: c.nome, href: `/estoque/${c.slug}`, total: c.veiculos.length })) },
          { titulo: "Por marca", links: marcas.map((m) => ({ rotulo: m.nome, href: `/carros/${m.slug}`, total: m.veiculos.length })) },
        ]}
        faq={pagina.faq}
        acao={
          <LinkComoChegar
            endereco={settings.companySettings?.address ?? ""}
            origem={`geo:${pagina.slug}`}
          />
        }
      />
    </div>
  );
}
