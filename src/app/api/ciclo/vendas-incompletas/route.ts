import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "../../../../lib/supabase-server";
import { autorizarMotor } from "../../../../lib/ciclo/autorizacaoDoMotor";

export const dynamic = "force-dynamic";

/**
 * A rotina noturna de vendas incompletas (manual §3.2).
 *
 * Mesma divisão do motor de gatilhos, e pela mesma razão: **o banco decide, o
 * n8n entrega**. A régua de completude vive na view `vw_vendas_incompletas`,
 * onde não pode ser afrouxada por reconfiguração de workflow; aqui só se
 * agrupa por vendedor e se monta o texto.
 *
 * Não tem cron próprio: quem acorda é o workflow do n8n. Uma view está sempre
 * fresca, então agendar um cálculo seria agendar nada.
 */

/** Como cada pendência se chama para um humano. */
const NOME_DA_PENDENCIA: Record<string, string> = {
  vendedor: "vendedor da venda",
  versao: "versão do veículo",
  cep: "CEP do cliente",
  data_nascimento: "data de nascimento",
  consentimento_canais: "consentimento de canal",
};

interface LinhaIncompleta {
  veiculo_vendido_id: string;
  data_venda: string;
  placa: string | null;
  marca: string | null;
  modelo: string | null;
  vendedor_id: string | null;
  vendedor_nome: string;
  vendedor_telefone: string | null;
  cliente_nome: string;
  pendencias: string[];
}

/** O primeiro nome, que é como a loja fala com a equipe. */
function primeiroNome(nome: string): string {
  return (nome || "").trim().split(/\s+/)[0] || nome;
}

function listar(itens: string[]): string {
  if (itens.length === 1) return itens[0];
  return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
}

/**
 * O texto que o vendedor recebe.
 *
 * Cutucar não é cobrar: a mensagem diz o que falta e por quê, sem ranking e
 * sem comparação com colega. O ranking existe para a gestão ver o conjunto, e
 * mandá-lo por WhatsApp transformaria um indicador de registro numa exposição
 * pública — que é como um indicador honesto vira número maquiado.
 */
export function mensagemDoVendedor(
  nome: string,
  vendas: { cliente_nome: string; placa: string | null; pendencias: string[] }[],
): string {
  const linhas = vendas.map((v) => {
    const faltando = v.pendencias.map((p) => NOME_DA_PENDENCIA[p] ?? p);
    const carro = v.placa ? ` (${v.placa})` : "";
    return `• ${v.cliente_nome}${carro}: falta ${listar(faltando)}`;
  });

  const abertura =
    vendas.length === 1
      ? `Oi, ${primeiroNome(nome)}. Ficou um registro de venda pela metade:`
      : `Oi, ${primeiroNome(nome)}. Ficaram ${vendas.length} registros de venda pela metade:`;

  return [
    abertura,
    "",
    ...linhas,
    "",
    "Dá para completar no painel, em Vendas do Ciclo. O que falta aí muda o " +
      "que o cliente recebe: sem canal consentido, ele não recebe nada do " +
      "programa — nem a boas-vindas.",
  ].join("\n");
}

export async function GET(request: Request) {
  const auth = await autorizarMotor(request);
  if (auth.erro) return auth.erro;

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    console.error("[Ciclo/Incompletas] SUPABASE_SERVICE_ROLE_KEY ausente — rota indisponível.");
    return NextResponse.json(
      { error: "Rotina indisponível: credencial de serviço não configurada." },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("vw_vendas_incompletas")
    .select("*")
    .order("data_venda", { ascending: false });

  if (error) {
    console.error("[Ciclo/Incompletas] Falha ao ler a view:", error.message);
    return NextResponse.json({ error: "Não foi possível listar as vendas." }, { status: 502 });
  }

  const linhas = ((data ?? []) as LinhaIncompleta[]).filter(
    (l) => (l.pendencias ?? []).length > 0,
  );

  // Agrupa por vendedor. Quem não tem `vendedor_id` cai num balde próprio: a
  // venda sem atribuição É uma pendência, e mandá-la para alguém seria
  // cobrar a pessoa errada.
  const porVendedor = new Map<string, LinhaIncompleta[]>();
  const semAtribuicao: LinhaIncompleta[] = [];
  for (const l of linhas) {
    if (!l.vendedor_id) {
      semAtribuicao.push(l);
      continue;
    }
    const atual = porVendedor.get(l.vendedor_id) ?? [];
    atual.push(l);
    porVendedor.set(l.vendedor_id, atual);
  }

  const avisos: Record<string, unknown>[] = [];
  const semTelefone: Record<string, unknown>[] = [];

  for (const [vendedorId, vendas] of porVendedor) {
    const primeira = vendas[0];
    const alvo = {
      vendedor_id: vendedorId,
      vendedor_nome: primeira.vendedor_nome,
      vendas: vendas.length,
      campos_pendentes: vendas.reduce((n, v) => n + v.pendencias.length, 0),
    };

    // Telefone ausente não é erro de execução — é cadastro faltando na A17.
    // Sai separado para que o workflow não tente enviar e para que alguém
    // veja o motivo, em vez de o aviso sumir.
    if (!primeira.vendedor_telefone) {
      semTelefone.push({ ...alvo, motivo: "vendedor sem telefone em profiles" });
      continue;
    }

    avisos.push({
      ...alvo,
      // Formato que a Evolution espera: só dígitos, sem "+".
      numero_whatsapp: primeira.vendedor_telefone.replace(/\D/g, ""),
      mensagem: mensagemDoVendedor(primeira.vendedor_nome, vendas),
    });
  }

  return NextResponse.json({
    ok: true,
    total_vendas_incompletas: linhas.length,
    avisos,
    // Sempre presentes, normalmente vazios — contrato estável para o workflow.
    sem_telefone: semTelefone,
    sem_atribuicao: semAtribuicao.map((l) => ({
      veiculo_vendido_id: l.veiculo_vendido_id,
      cliente_nome: l.cliente_nome,
      placa: l.placa,
      pendencias: l.pendencias,
    })),
  });
}
