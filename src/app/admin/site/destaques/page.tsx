import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { getCachedSettings } from "../../../../lib/settings";
import { classificarEstado, versaoParaExibir, type LinhaDeEstoque } from "../../../../lib/estoqueTabela";
import { mapVeiculoDbToVeiculo } from "../../../../lib/supabase";
import CuradoriaDeDestaques from "../../../../components/admin/CuradoriaDeDestaques";

export const dynamic = "force-dynamic";

/**
 * O formato mínimo que este mapeamento precisa do registro cru do banco:
 * exatamente o que `classificarEstado` lê, mais o `id`. Extraído do PARÂMETRO
 * dela (`Parameters<...>`) em vez de redigitado — se a assinatura ganhar um
 * campo nunca, este tipo acompanha sozinho, em vez de discordar em silêncio.
 * Evita o `any` sem precisar mexer em `mapVeiculoDbToVeiculo`, que aceita
 * qualquer formato de propósito.
 */
type LinhaBruta = Parameters<typeof classificarEstado>[0] & { id: string | number };

export const metadata = {
  title: "Destaques — Motors Store",
  description: "Ordem e curadoria do banner da home, da grade da semana e da TV do showroom.",
};

/**
 * A tela de curadoria. Irmã de `/admin/site/areas` — mesmo molde de setas e de
 * publicação.
 *
 * Lê o estoque INTEIRO, e não só o publicado: a lista gravada pode conter
 * carros que já saíram do ar, e é justamente para poder mostrá-los (e
 * limpá-los) que eles precisam chegar aqui.
 */
export default async function DestaquesPage() {
  const supabase = await createServerSupabaseClient();
  const [{ data: brutos }, settings] = await Promise.all([
    supabase.from("estoque_motors").select("*"),
    getCachedSettings(),
  ]);

  const linhas: LinhaDeEstoque[] = ((brutos ?? []) as LinhaBruta[]).map((bruto) => {
    const v = mapVeiculoDbToVeiculo(bruto);
    const promocional = Number(v.preco_promocional || 0);
    const cheio = Number(v.preco_original || 0);
    return {
      id: String(bruto.id),
      marca: v.marca,
      modelo: v.modelo,
      versao: versaoParaExibir(v.modelo, v.versao),
      preco: promocional > 0 && promocional < cheio ? promocional : cheio || null,
      estado: classificarEstado(bruto),
    } as unknown as LinhaDeEstoque;
  });

  const lista = (valor: unknown): string[] =>
    Array.isArray(valor) ? (valor as string[]).map(String) : [];

  return (
    <CuradoriaDeDestaques
      bannerInicial={lista(settings.carouselVehicleIds)}
      gradeInicial={lista(settings.destaquesDaSemana)}
      tvInicial={lista(settings.vitrineTv)}
      linhas={linhas}
    />
  );
}
