import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { apenasDoUltimoSync, mapVeiculoDbToVeiculo } from "../../../lib/supabase";
import { getCachedSettings } from "../../../lib/settings";
import { paginasMaisVistas } from "../../../lib/analytics";
import { normalizarQuickTags, normalizarStockOverrides } from "../../../lib/destaquesRapidos";
import {
  classificarEstado,
  contarLeadsPorVeiculo,
  mapaDeVisitas,
  versaoParaExibir,
  type LinhaDeEstoque,
} from "../../../lib/estoqueTabela";
import TabelaDeEstoque from "../../../components/admin/TabelaDeEstoque";
import { diasEmEstoque } from "../../../lib/dataLayer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Estoque — Motors Store",
  description: "Todos os veículos, estado de publicação e desempenho de cada anúncio.",
};

/**
 * Tela A6 do design doc — a tabela de estoque.
 *
 * Substitui a aba de cards de `/admin/configuracoes?tab=estoque`, onde editar
 * um carro era rolar uma lista de 88 fichas abertas. O doc pede o contrário:
 * uma linha por veículo, densa, com filtro por estado e ação em lote — o carro
 * inteiro abre no editor (A15).
 *
 * O que o doc desenha e não está aqui, por não haver fonte:
 *
 * - **Coluna FIPE.** `fipe` é lida pelo mapper mas NÃO existe no banco
 *   (registrado no baseline `20260803120000`). A coluna sairia vazia em 100%
 *   das linhas.
 * - **Rascunho e reservado.** São estados do fluxo de revisão (A16). O que
 *   existe é `vendido` e o carimbo de sync — daí os três estados reais.
 * - **Importar planilha / + Novo veículo.** O estoque entra pelo sync do
 *   RevendaMais; criar carro à mão é outro pacote, junto com o storage próprio
 *   de fotos.
 */
export default async function AdminEstoquePage() {
  const supabase = await createServerSupabaseClient();

  const [{ data: brutos }, settings, paginas] = await Promise.all([
    supabase
      .from("estoque_motors")
      .select("*")
      .order("created_at", { ascending: false }),
    getCachedSettings(),
    // `null` quando o GA4 não tem credencial de leitura — a célula mostra "—".
    // Uma consulta só para a lista inteira, não uma por veículo.
    paginasMaisVistas(30, 1000),
  ]);

  const linhasDoBanco = (brutos ?? []) as Array<Record<string, any>>;

  // Leads por veículo: dado real desde a migração 20260807210000. `error`
  // ignorado de propósito — a tabela de estoque não pode deixar de abrir
  // porque a de leads falhou.
  const { data: leads } = await supabase.from("leads").select("veiculo_id");
  const leadsPorVeiculo = contarLeadsPorVeiculo((leads ?? []) as Array<{ veiculo_id: any }>);

  const visitasPorVeiculo = mapaDeVisitas(paginas);

  // Quem veio no último ciclo de sync. Fora dessa lista = fora do feed.
  const idsNoUltimoSync = new Set(
    apenasDoUltimoSync(linhasDoBanco as Array<{ last_seen_at?: string | null }>).map((l: any) =>
      String(l.id),
    ),
  );

  const overrides = normalizarStockOverrides(settings.stockOverrides);
  const quickTags = normalizarQuickTags(settings.quickTags);
  const destacados = Array.isArray(settings.carouselVehicleIds)
    ? (settings.carouselVehicleIds as string[]).map(String)
    : [];

  const linhas: LinhaDeEstoque[] = linhasDoBanco.map((bruto) => {
    const v = mapVeiculoDbToVeiculo(bruto);
    const id = String(bruto.id);
    const imagens = Array.isArray(v.whatsapp_images) ? v.whatsapp_images : [];
    const fotos = imagens.filter((f) => f && f !== "/logo.png").length;
    const promocional = Number(v.preco_promocional || 0);
    const cheio = Number(v.preco_original || 0);

    return {
      id,
      marca: v.marca,
      modelo: v.modelo,
      versao: versaoParaExibir(v.modelo, v.versao),
      ano: v.ano ?? null,
      quilometragem: v.quilometragem ?? null,
      preco: promocional > 0 && promocional < cheio ? promocional : cheio || null,
      foto: imagens[0] ?? null,
      fotos,
      estado: classificarEstado(bruto, idsNoUltimoSync.has(id)),
      tipo: v.tipo ?? "",
      perfisUso: v.perfis_uso ?? [],
      // Da linha crua, não do objeto mapeado: o mapper deixou de devolver
      // `placa` para não serializá-la no HTML público. Aqui a consulta é
      // direta e autenticada, e a busca da tabela procura por placa.
      placa: bruto.placa ?? "",
      destacado: destacados.includes(id),
      visitas: visitasPorVeiculo ? (visitasPorVeiculo[id] ?? 0) : null,
      leads: leadsPorVeiculo[id] ?? 0,
      // O sintoma do bug corrigido em 2026-08-07: override gravado só no JSON
      // é invisível para o servidor, e o site segue anunciando carro vendido.
      // A tabela mostra a divergência na linha; marcar como vendido daqui
      // grava na coluna e resolve.
      divergente: overrides[id]?.vendido === true && !bruto.vendido,
      quickTags: overrides[id]?.quick_tags ?? [],
      // Da linha crua: `first_seen_at` é carimbo de banco, não vem do feed.
      diasEmEstoque: diasEmEstoque(bruto.first_seen_at),
    };
  });

  return (
    <TabelaDeEstoque
      linhas={linhas}
      quickTagsDisponiveis={quickTags.map((t) => ({ id: t.id, nome: t.name }))}
      destacadosIniciais={destacados}
      overridesIniciais={overrides}
      visitasDisponiveis={visitasPorVeiculo !== null}
    />
  );
}
