import DetalheDoLead from "../../../../components/admin/DetalheDoLead";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lead · Motors Showcase",
  description: "O detalhe de um lead: próximo passo, registros, histórico e dados do negócio.",
};

/**
 * A página de um lead (03/10/2026): o destino dos links (o do alerta aponta
 * para cá) e das telas com menos de 1024px, onde a gaveta do quadro não cabe.
 *
 * Como em `../page.tsx`, a porta é a do layout do painel e a do proxy; quem
 * confere o escopo do lead é `GET /api/leads/[id]`, que o detalhe chama com a
 * sessão de quem está logado. Lead fora do escopo responde 404, e a tela diz.
 *
 * A `key` remonta o detalhe ao trocar de lead (os links "anterior" e
 * "próximo"): o que foi digitado para um lead não aparece no outro.
 */
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalheDoLead key={id} id={id} layout="pagina" />;
}
