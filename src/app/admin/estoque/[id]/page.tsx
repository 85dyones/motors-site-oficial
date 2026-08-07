import { notFound } from "next/navigation";
import EditorDeVeiculo from "../../../../components/admin/EditorDeVeiculo";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { visitasDaPagina } from "../../../../lib/analytics";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Editor de Veículo — Motors Showcase",
  description: "Fotos, ficha técnica, opcionais e checklist de publicação.",
};

export default async function EditorDeVeiculoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  // O id é bigint no banco e chega como string na URL.
  const alvo = /^\d+$/.test(id) ? Number(id) : id;
  const { data } = await supabase
    .from("estoque_motors")
    .select("*")
    .eq("id", alvo)
    .maybeSingle();

  if (!data) notFound();

  // As URLs de veículo terminam com o id (ver getVeiculoPdpUrl), então o id
  // é o filtro certo — e não depende do slug, que muda quando o título muda.
  // `null` quando o GA4 não está configurado: a tela mostra "—", não zero.
  const visitas = await visitasDaPagina(String(data.id), 30);

  return <EditorDeVeiculo inicial={data} visitas30Dias={visitas} />;
}
