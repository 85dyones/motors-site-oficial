import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { acharDuplicatas, type PessoaDaAgenda } from "../../../../lib/agenda";

export const dynamic = "force-dynamic";

/**
 * Quem provavelmente está cadastrado duas vezes.
 *
 * É o que o dono descreveu como *"pra organizar tudo"*: o mesmo CNPJ existe
 * hoje como fornecedor no financeiro e como oficina na rede do Ciclo, com duas
 * grafias, porque nunca houve tela que olhasse os dois cadastros juntos.
 *
 * ---------------------------------------------------------------------------
 * Por que esta rota NÃO é paginada — e por que ela diz quando desiste
 * ---------------------------------------------------------------------------
 * Duplicata é uma propriedade do CONJUNTO. Procurá-la numa página é procurar
 * pares dentro de uma fatia: o fornecedor "ACME" na página 1 e o "Acme Ltda"
 * na página 4 nunca se encontrariam, e a tela diria "nenhuma duplicata" com a
 * mesma cara de quem procurou de verdade.
 *
 * Então esta rota varre tudo. Só que "tudo" tem limite — o PostgREST devolve
 * no máximo 1000 linhas por chamada, e uma base grande passaria disso. Duas
 * decisões, as duas contra o mesmo defeito:
 *
 *  1. varre em PÁGINAS, em laço, até acabar de verdade;
 *  2. quando bate o teto, devolve `completo: false` — e a tela diz que a
 *     análise foi parcial.
 *
 * A alternativa preguiçosa (pedir 1000 e analisar o que vier) é exatamente o
 * defeito que enterrou um lançamento na posição 709 em 2026-08-24: uma fatia
 * apresentada como se fosse o conjunto.
 */

const POR_LOTE = 1000;
/** 20 lotes = 20 mil pessoas. Muito além de qualquer revenda; longe do infinito. */
const TETO_DE_LOTES = 20;

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const pessoas: PessoaDaAgenda[] = [];
    let completo = true;
    let lote = 0;

    // Só as colunas que a comparação usa. Trazer telefone, observação e cidade
    // de vinte mil linhas para compará-las por nome seria pagar caro por dado
    // que ninguém lê.
    for (; lote < TETO_DE_LOTES; lote++) {
      const inicio = lote * POR_LOTE;
      const { data, error } = await supabase
        .from("agenda_de_pessoas")
        .select("origem, id, nome, papel, documento, ativo")
        .order("id", { ascending: true })
        .range(inicio, inicio + POR_LOTE - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const recebidas = (data ?? []) as unknown as PessoaDaAgenda[];
      pessoas.push(...recebidas);

      if (recebidas.length < POR_LOTE) break;
      // Encheu o último lote possível e ainda vinha gente: a varredura parou
      // antes do fim, e quem lê precisa saber disso.
      if (lote === TETO_DE_LOTES - 1) completo = false;
    }

    const grupos = acharDuplicatas(pessoas);

    return NextResponse.json({
      grupos,
      analisadas: pessoas.length,
      completo,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
