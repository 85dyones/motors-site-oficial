import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabase-server";
import { ehStaff } from "../../lib/permissoes";
import { Rotulo } from "../../components/modernist/primitivos";
import GaragemEntrada from "../../components/garagem/GaragemEntrada";
import GaragemVeiculo, { type VeiculoDaGaragem } from "../../components/garagem/GaragemVeiculo";
import MeusDados from "../../components/garagem/MeusDados";
import BotaoSair from "../../components/garagem/BotaoSair";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Garagem Motors — Motors Store",
  description: "O diário de bordo do seu veículo.",
  // Área logada de cliente: fora de busca, como /login e /admin.
  robots: { index: false, follow: false },
};

/**
 * A Garagem Motors — manual v1.1 §6.3, fase 1.
 *
 * O que entra nesta fase é o que tem dado real por trás: o carro, a próxima
 * janela de revisão, o diário de bordo com o status de verificação, e os dois
 * registros que o cliente pode fazer (KM declarado e revisão feita fora da
 * rede). Os blocos B e C do §6.3 — posição de troca e a curva — dependem de
 * financiamento capturado e valor de mercado, e ficam para quando houver.
 *
 * Toda leitura sai com o cliente DA SESSÃO, sob RLS. Não há chave de serviço
 * nesta página nem nas rotas da Garagem: se a policy não deixa, a tela não
 * mostra — é a regra 2-b do CLAUDE.md aplicada ao layout.
 */
export default async function GaragemPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // ---- sem sessão: a porta de entrada -----------------------------------
  if (!user) {
    return (
      <Moldura>
        <GaragemEntrada linkVencido={erro === "link-vencido"} />
      </Moldura>
    );
  }

  // ---- staff não vive aqui ----------------------------------------------
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (ehStaff(profile?.role)) {
    redirect("/admin");
  }

  // ---- o cliente da sessão ----------------------------------------------
  const camposDoCliente = "id, nome, email, telefone_e164, cpf_cnpj, consentimento_canais";

  // O `error` é lido em toda leitura desta página, e não por preciosismo: a
  // RLS não devolve erro, devolve vazio — mas uma coluna ausente ou um
  // relacionamento quebrado derruba a query INTEIRA no PostgREST. Sem checar,
  // isso vira "você não tem veículo registrado" na cara do cliente, sem log
  // nenhum. É o mesmo modo de falha que já matou o painel de margens e a
  // descrição do feed neste projeto.
  let { data: cliente, error: erroCliente } = await supabase
    .from("clientes")
    .select(camposDoCliente)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (erroCliente) {
    console.error("[Garagem] Falha ao ler o cliente da sessão:", erroCliente.message);
    return <GaragemIndisponivel />;
  }

  // Vínculo que não nasceu na venda liga aqui, pelo e-mail que o link mágico
  // provou. Idempotente e barato — só roda quando ainda não há vínculo.
  if (!cliente) {
    const { error: erroVinculo } = await supabase.rpc("reivindicar_garagem");
    if (erroVinculo) {
      console.error("[Garagem] Falha ao reivindicar o vínculo:", erroVinculo.message);
    }
    ({ data: cliente, error: erroCliente } = await supabase
      .from("clientes")
      .select(camposDoCliente)
      .eq("auth_user_id", user.id)
      .maybeSingle());
    if (erroCliente) {
      console.error("[Garagem] Falha ao reler o cliente:", erroCliente.message);
      return <GaragemIndisponivel />;
    }
  }

  if (!cliente) {
    return (
      <Moldura>
        <div className="flex flex-col gap-4">
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            GARAGEM MOTORS
          </Rotulo>
          <h1 className="mt-titulo m-0 text-[28px]">Não achamos o seu cadastro</h1>
          <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
            Você entrou como <strong>{user.email}</strong>, mas nenhum veículo está
            registrado nesse e-mail. Se a sua compra foi feita com outro endereço, fale
            com a loja — a equipe ajusta o cadastro e a sua garagem aparece aqui.
          </p>
          <BotaoSair />
        </div>
      </Moldura>
    );
  }

  // ---- os veículos, sob RLS ---------------------------------------------
  const { data: veiculos, error: erroVeiculos } = await supabase
    .from("veiculos_vendidos")
    .select(
      `id, placa, marca, modelo, versao, ano_modelo, data_venda, km_na_venda,
       contrato:contratos_ciclo ( plano, garantia_meses, garantia_fim ),
       plano_revisoes ( numero_revisao, km_previsto, janela_inicio, janela_fim, manutencao_id ),
       manutencoes ( id, tipo, numero_revisao, data_servico, km_registrado,
                     origem_registro, confirmada_em, recusada_em, motivo_recusa,
                     dentro_da_janela, url_etiqueta_atual, criada_em ),
       leituras_odometro ( km, origem, registrada_em )`,
    )
    .eq("cliente_id", cliente.id)
    .order("data_venda", { ascending: false });

  if (erroVeiculos) {
    // Nunca dizer "não há veículo" quando o que houve foi uma falha de
    // leitura: o cliente TEM carro, e mandá-lo falar com a loja por causa de
    // um erro nosso queima confiança que não se recupera.
    console.error("[Garagem] Falha ao ler os veículos do cliente:", erroVeiculos.message);
    return <GaragemIndisponivel />;
  }

  const lista = (veiculos ?? []) as unknown as VeiculoDaGaragem[];
  const primeiroNome = cliente.nome.trim().split(/\s+/)[0] ?? cliente.nome;

  return (
    <Moldura larga>
      <div className="flex flex-wrap items-end justify-between gap-4 border-t-2 border-mt-regua pt-6">
        <div>
          <Rotulo accent className="text-[11px] tracking-[.18em]">
            GARAGEM MOTORS
          </Rotulo>
          <h1 className="mt-titulo m-0 mt-3 text-[30px]">Olá, {primeiroNome}</h1>
        </div>
        <BotaoSair />
      </div>

      {lista.length === 0 ? (
        <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
          Seu cadastro está aqui, mas ainda não há veículo registrado nele. Assim que a
          loja registrar a sua compra, o diário de bordo aparece nesta página.
        </p>
      ) : (
        lista.map((v) => <GaragemVeiculo key={v.id} veiculo={v} />)
      )}

      <MeusDados
        cliente={{
          nome: cliente.nome,
          email: cliente.email,
          telefone_e164: cliente.telefone_e164,
          cpf_cnpj: cliente.cpf_cnpj,
          consentimento_canais: cliente.consentimento_canais,
        }}
      />
    </Moldura>
  );
}

/**
 * A tela de "não deu para carregar" — deliberadamente diferente da de
 * "não achamos seu cadastro".
 *
 * A distinção importa: dizer "você não tem veículo" para quem TEM, por causa
 * de uma falha nossa de leitura, manda o cliente ligar para a loja reclamar
 * de um cadastro que está correto. Aqui a mensagem assume o erro, não o
 * transfere — e não oferece nenhuma ação que dependa do dado que falhou.
 */
function GaragemIndisponivel() {
  return (
    <Moldura>
      <div className="flex flex-col gap-4">
        <Rotulo accent className="text-[11px] tracking-[.18em]">
          GARAGEM MOTORS
        </Rotulo>
        <h1 className="mt-titulo m-0 text-[28px]">Não conseguimos abrir sua garagem agora</h1>
        <p className="m-0 text-[14px] leading-relaxed text-mt-neutral-700">
          A falha é nossa, não do seu cadastro — seu veículo e seu diário de bordo estão
          guardados. Tente de novo em alguns minutos; se continuar assim, fale com a loja
          e diga que a garagem não abriu.
        </p>
        <BotaoSair />
      </div>
    </Moldura>
  );
}

function Moldura({
  children,
  larga = false,
}: {
  children: React.ReactNode;
  larga?: boolean;
}) {
  return (
    // `<div>`, não `<main>`: o layout raiz já abre um `<main>` (mesmo motivo
    // da página de login).
    <div className="flex min-h-[70vh] w-full flex-col items-center bg-mt-bg px-[18px] py-16 font-modernist text-mt-ink">
      <div className={`flex w-full flex-col gap-8 ${larga ? "max-w-[720px]" : "max-w-[420px]"}`}>
        {children}
      </div>
    </div>
  );
}
