"use client";

import { useEffect, useMemo, useState } from "react";
import {
  validarFechamentoDeVenda,
  projetarRevisoes,
  INTERVALO_KM,
  INTERVALO_MESES,
  TOLERANCIA_DIAS,
  type DadosDaVenda,
  type Problema,
} from "../../lib/ciclo/vendaFechamento";
import {
  consultarCep,
  cepValido,
  formatarCep,
  enderecoEmLinha,
  type EnderecoDoCep,
} from "../../lib/ciclo/cep";

/** Um carro do estoque, do jeito que a rota da A19 devolve. */
interface VeiculoDoEstoque {
  id: number;
  marca: string | null;
  modelo: string | null;
  versao: string | null;
  ano: number | null;
  ano_fabricacao: number | null;
  quilometragem: number | null;
  preco: number | null;
  preco_compra: number | null;
  cor: string | null;
  placa: string | null;
  chassi: string | null;
  valor_fipe: number | null;
}

/**
 * Tela A19 — fechamento da venda do Ciclo (manual v1.1 §3).
 *
 * O §3.2 pede validação **bloqueante, não aviso**: enquanto faltar campo
 * obrigatório, o botão não fecha a venda e a lista do que falta fica visível.
 * Não há "salvar rascunho" — o §0 é explícito em que venda incompleta é
 * gatilho perdido lá na frente, e rascunho é como o incompleto sobrevive.
 *
 * A prévia do plano de revisões existe por um motivo de operação: o vendedor
 * vê, na frente do cliente, as janelas que está criando. É mais fácil explicar
 * o programa mostrando as três datas do que descrevendo a regra.
 */

const vazioDaVenda: DadosDaVenda = {
  cpf_cnpj: "",
  nome: "",
  telefone_e164: "+55",
  email: "",
  chassi: "",
  placa: "",
  marca: "",
  modelo: "",
  versao: "",
  ano_fabricacao: "",
  ano_modelo: "",
  data_venda: new Date().toISOString().slice(0, 10),
  km_na_venda: "",
  valor_venda: "",
  custo_aquisicao: "",
  vendedor: "",
  cep: "",
  consentimento_lgpd: false,
  // Tudo desmarcado de nascença, como o consentimento_lgpd acima (achado
  // #13): sob a LGPD, consentimento é manifestação AFIRMATIVA — caixa
  // pré-marcada não prova que o cliente disse sim, prova que o vendedor não
  // desmarcou. Marcar é gesto do atendimento, na frente do cliente. E canal
  // nenhum consentido não penaliza (regra 2): o motor suprime com
  // `sem_canal_consentido` e o cliente liga o que quiser depois, na área dele.
  consentimento_canais: { whatsapp: false, email: false, sms: false },
  aderiu_ciclo: true,
  financiamento: {
    instituicao: "",
    valor_financiado: "",
    valor_entrada: "",
    taxa_mensal: "",
    prazo_meses: "",
    valor_parcela: "",
    data_primeira_parcela: "",
  },
};

const rotuloClasse = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const inputClasse =
  "w-full border border-mt-regua-fina bg-mt-bg p-3 text-[13px] text-mt-ink outline-none transition-colors placeholder-mt-neutral-500 focus:border-mt-accent";

function Campo({
  id,
  rotulo,
  children,
  problema,
  dica,
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
  problema?: string;
  dica?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={rotuloClasse}>
        {rotulo}
      </label>
      {children}
      {problema ? (
        <p className="text-[11px] font-semibold text-mt-accent">{problema}</p>
      ) : dica ? (
        <p className="text-[11px] text-mt-neutral-500">{dica}</p>
      ) : null}
    </div>
  );
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="border border-mt-regua-fina bg-mt-surface p-6">
      <h2 className="text-[15px] font-extrabold tracking-[-.015em] text-mt-ink">{titulo}</h2>
      {descricao ? <p className="mb-4 mt-1 text-xs text-mt-neutral-700">{descricao}</p> : <div className="mb-4" />}
      {children}
    </section>
  );
}

export default function FechamentoDeVenda() {
  const [dados, setDados] = useState<DadosDaVenda>(vazioDaVenda);
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState("");
  const [problemasDoServidor, setProblemasDoServidor] = useState<Problema[]>([]);
  const [concluida, setConcluida] = useState<{ veiculo_vendido_id: string } | null>(null);
  const [tentouEnviar, setTentouEnviar] = useState(false);

  // ---- o estoque, para o seletor ----
  const [estoque, setEstoque] = useState<VeiculoDoEstoque[]>([]);
  const [buscaVeiculo, setBuscaVeiculo] = useState("");
  const [escolhido, setEscolhido] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/ciclo/vendas/estoque")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo && j?.veiculos) setEstoque(j.veiculos as VeiculoDoEstoque[]);
      })
      .catch(() => {
        // Estoque indisponível não trava a venda: o formulário continua
        // digitável, que é como ele funcionava até 2026-08-17.
      });
    return () => {
      vivo = false;
    };
  }, []);

  const encontrados = useMemo(() => {
    const termo = buscaVeiculo.trim().toLowerCase();
    if (termo.length < 2) return [];
    return estoque
      .filter((v) =>
        [v.marca, v.modelo, v.versao, v.placa, v.id, v.cor]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
      )
      .slice(0, 8);
  }, [buscaVeiculo, estoque]);

  /**
   * Preenche o bloco do veículo a partir do estoque — e deixa tudo editável.
   *
   * O KM e o valor vêm do anúncio: o KM muda entre anunciar e entregar, e o
   * valor final é o negociado. Por isso entram como ponto de partida, não como
   * verdade — quem confere é o vendedor, com o carro na frente.
   */
  function usarVeiculo(v: VeiculoDoEstoque) {
    setEscolhido(v.id);
    setBuscaVeiculo("");
    setDados((d) => ({
      ...d,
      estoque_id: v.id,
      chassi: v.chassi ?? d.chassi,
      placa: v.placa ?? d.placa,
      marca: v.marca ?? d.marca,
      modelo: v.modelo ?? d.modelo,
      versao: v.versao ?? d.versao,
      ano_fabricacao: v.ano_fabricacao ?? d.ano_fabricacao,
      ano_modelo: v.ano ?? d.ano_modelo,
      km_na_venda: v.quilometragem ?? d.km_na_venda,
      valor_venda: v.preco ?? d.valor_venda,
      custo_aquisicao: v.preco_compra ?? d.custo_aquisicao,
    }));
  }

  // ---- CEP ----
  const [endereco, setEndereco] = useState<EnderecoDoCep | null>(null);
  const [cepBuscando, setCepBuscando] = useState(false);
  const [cepNaoAchado, setCepNaoAchado] = useState(false);

  async function buscarCep(valor: string) {
    if (!cepValido(valor)) {
      setEndereco(null);
      setCepNaoAchado(false);
      return;
    }
    setCepBuscando(true);
    setCepNaoAchado(false);
    const achado = await consultarCep(valor);
    setEndereco(achado);
    setCepNaoAchado(achado === null);
    setCepBuscando(false);
  }

  const problemas = useMemo(() => validarFechamentoDeVenda(dados), [dados]);
  const podeFechar = problemas.length === 0;

  // Só mostra erro de campo depois da primeira tentativa: apontar tudo em
  // vermelho num formulário ainda em branco é ruído, não ajuda.
  const problemaDe = (campo: string): string | undefined => {
    if (!tentouEnviar) {
      return problemasDoServidor.find((p) => p.campo === campo)?.mensagem;
    }
    return (
      problemas.find((p) => p.campo === campo)?.mensagem ??
      problemasDoServidor.find((p) => p.campo === campo)?.mensagem
    );
  };

  const set = (campo: keyof DadosDaVenda, valor: unknown) =>
    setDados((d) => ({ ...d, [campo]: valor }));
  const setFin = (campo: string, valor: unknown) =>
    setDados((d) => ({ ...d, financiamento: { ...(d.financiamento ?? {}), [campo]: valor } }));

  const previa = useMemo(() => {
    const km = Number(dados.km_na_venda);
    if (!dados.data_venda || !Number.isFinite(km) || String(dados.km_na_venda).trim() === "") return [];
    return projetarRevisoes(dados.data_venda, km);
  }, [dados.data_venda, dados.km_na_venda]);

  const enviar = async () => {
    setTentouEnviar(true);
    setErroGeral("");
    setProblemasDoServidor([]);
    if (!podeFechar) return;

    setEnviando(true);
    try {
      const res = await fetch("/api/ciclo/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroGeral(corpo.error ?? "Não foi possível fechar a venda.");
        setProblemasDoServidor(corpo.problemas ?? []);
        return;
      }
      setConcluida({ veiculo_vendido_id: corpo.veiculo_vendido_id });
    } catch {
      setErroGeral("Falha de rede. A venda não foi registrada — tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  if (concluida) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="border border-mt-regua-fina bg-mt-surface p-8">
          <span className="mt-rotulo mt-rotulo-accent">VENDA REGISTRADA</span>
          <h1 className="mt-2 text-[22px] font-extrabold tracking-[-.02em] text-mt-ink">
            O par cliente-veículo está no Ciclo
          </h1>
          <p className="mt-3 max-w-prose text-[13px] leading-relaxed text-mt-neutral-700">
            O KM de saída virou a primeira notação de odômetro e as três janelas de revisão já
            existem. A partir daqui o cliente entra na Garagem Motors e a procedência do carro
            dele passa a contar.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setDados(vazioDaVenda);
                setConcluida(null);
                setTentouEnviar(false);
              }}
              className="mt-foco bg-mt-accent px-5 py-3 text-[12px] font-bold uppercase tracking-[.08em] text-mt-inverso"
            >
              Fechar outra venda
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <span className="mt-rotulo mt-rotulo-accent">MOTORS CICLO · FECHAMENTO</span>
        <h1 className="mt-2 text-[24px] font-extrabold tracking-[-.02em] text-mt-ink">
          Registrar venda
        </h1>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-mt-neutral-700">
          Nenhum campo aqui é opcional por engano. O que está marcado como obrigatório é o que o
          programa precisa para funcionar daqui a três anos — e a venda não fecha sem ele.
        </p>
      </header>

      <div className="flex flex-col gap-5">
        <Secao titulo="Cliente" descricao="É por este e-mail que ele entra na Garagem Motors.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="cpf_cnpj" rotulo="CPF ou CNPJ *" problema={problemaDe("cpf_cnpj")}>
              <input
                id="cpf_cnpj"
                className={inputClasse}
                value={dados.cpf_cnpj ?? ""}
                onChange={(e) => set("cpf_cnpj", e.target.value)}
                placeholder="000.000.000-00"
              />
            </Campo>
            <Campo id="nome" rotulo="Nome completo *" problema={problemaDe("nome")}>
              <input
                id="nome"
                className={inputClasse}
                value={dados.nome ?? ""}
                onChange={(e) => set("nome", e.target.value)}
              />
            </Campo>
            <Campo
              id="telefone_e164"
              rotulo="Telefone *"
              problema={problemaDe("telefone_e164")}
              dica="Com o +55 e o DDD."
            >
              <input
                id="telefone_e164"
                className={inputClasse}
                value={dados.telefone_e164 ?? ""}
                onChange={(e) => set("telefone_e164", e.target.value)}
                placeholder="+5541999990000"
              />
            </Campo>
            <Campo
              id="email"
              rotulo="E-mail *"
              problema={problemaDe("email")}
              dica="Porta de entrada da Garagem Motors."
            >
              <input
                id="email"
                type="email"
                className={inputClasse}
                value={dados.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </Campo>

            {/* CEP: consulta para CONFERIR. Só o CEP é gravado — o §2.1 prevê
                `clientes.cep` e não prevê o endereço completo. */}
            <Campo id="cep" rotulo="CEP" dica="Opcional. Serve para saber a região do cliente.">
              <input
                id="cep"
                inputMode="numeric"
                className={inputClasse}
                value={formatarCep(dados.cep)}
                onChange={(e) => {
                  set("cep", e.target.value);
                  setEndereco(null);
                  setCepNaoAchado(false);
                }}
                onBlur={(e) => buscarCep(e.target.value)}
                placeholder="00000-000"
              />
              {cepBuscando && (
                <p className="text-[11px] text-mt-neutral-700">Consultando…</p>
              )}
              {endereco && (
                <p className="text-[11px] text-mt-ink">{enderecoEmLinha(endereco)}</p>
              )}
              {cepNaoAchado && (
                <p className="text-[11px] font-semibold text-mt-accent">
                  CEP não encontrado. Confira — ele é gravado do jeito que estiver.
                </p>
              )}
            </Campo>
          </div>

          <div className="mt-5 border-t border-mt-regua-fina pt-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={dados.consentimento_lgpd === true}
                onChange={(e) => set("consentimento_lgpd", e.target.checked)}
                className="mt-foco mt-0.5 h-4 w-4 shrink-0 accent-mt-accent"
              />
              <span className="text-[13px] leading-relaxed text-mt-ink">
                O cliente autorizou o uso dos dados para o programa, no ato da venda. *
                {problemaDe("consentimento_lgpd") ? (
                  <span className="mt-1 block text-[11px] font-semibold text-mt-accent">
                    {problemaDe("consentimento_lgpd")}
                  </span>
                ) : null}
              </span>
            </label>

            <div className="mt-4 flex flex-wrap gap-5">
              {(["whatsapp", "email", "sms"] as const).map((canal) => (
                <label key={canal} className="flex cursor-pointer items-center gap-2 text-[13px] text-mt-ink">
                  <input
                    type="checkbox"
                    checked={dados.consentimento_canais?.[canal] === true}
                    onChange={(e) =>
                      set("consentimento_canais", {
                        ...(dados.consentimento_canais ?? {}),
                        [canal]: e.target.checked,
                      })
                    }
                    className="mt-foco h-4 w-4 accent-mt-accent"
                  />
                  {canal === "sms" ? "SMS" : canal === "email" ? "E-mail" : "WhatsApp"}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-mt-neutral-500">
              Canal desligado é canal que não recebe aviso. O cliente troca isso depois, na área
              dele.
            </p>
          </div>
        </Secao>

        <Secao
          titulo="Veículo"
          descricao="O KM de saída é a primeira notação do odômetro — é contra ele que a primeira revisão é conferida."
        >
          {/* ---- o atalho: puxar do estoque ----
              Chassi e placa vêm do feed da RevendaMais desde 2026-08-17. Eram
              os dois campos que o vendedor copiava do documento à mão. */}
          <div className="mb-5 border border-mt-regua-fina bg-mt-bg p-4">
            <label htmlFor="busca-veiculo" className={rotuloClasse}>
              Puxar do estoque
            </label>
            <input
              id="busca-veiculo"
              className={`${inputClasse} mt-1.5`}
              value={buscaVeiculo}
              onChange={(e) => setBuscaVeiculo(e.target.value)}
              placeholder={
                estoque.length > 0
                  ? `Marca, modelo, placa ou código — ${estoque.length} carros`
                  : "Estoque indisponível; preencha à mão abaixo"
              }
              autoComplete="off"
            />

            {encontrados.length > 0 && (
              <ul className="mt-2 flex list-none flex-col border border-mt-regua-fina bg-mt-surface p-0">
                {encontrados.map((v) => (
                  <li key={v.id} className="border-b border-mt-regua-fina last:border-0">
                    <button
                      type="button"
                      onClick={() => usarVeiculo(v)}
                      className="mt-foco flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 p-2.5 text-left text-[12px] hover:bg-mt-bg"
                    >
                      <span className="font-semibold text-mt-ink">
                        {[v.marca, v.modelo, v.versao].filter(Boolean).join(" ")}
                      </span>
                      <span className="text-mt-neutral-700">{v.ano ?? "—"}</span>
                      {v.placa && (
                        <span className="font-mono text-mt-neutral-700">{v.placa}</span>
                      )}
                      <span className="ml-auto text-mt-neutral-600">
                        {v.quilometragem?.toLocaleString("pt-BR") ?? "—"} km
                      </span>
                      {!v.chassi && (
                        <span className="w-full text-[10px] font-semibold uppercase tracking-[.1em] text-mt-accent">
                          sem chassi no feed — digite à mão
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {buscaVeiculo.trim().length >= 2 && encontrados.length === 0 && (
              <p className="mt-2 text-[12px] text-mt-neutral-700">
                Nenhum carro do estoque com isso. Se o veículo não veio da loja (troca, por
                exemplo), preencha os campos abaixo.
              </p>
            )}

            {escolhido !== null && (
              <p className="mt-2 text-[12px] text-mt-neutral-700">
                Preenchido do estoque <strong>#{escolhido}</strong>. Confira o KM de saída e o
                valor negociado — os dois mudam entre o anúncio e a entrega.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="chassi" rotulo="Chassi *" problema={problemaDe("chassi")}>
              <input
                id="chassi"
                className={`${inputClasse} font-mono uppercase`}
                value={dados.chassi ?? ""}
                onChange={(e) => set("chassi", e.target.value)}
              />
            </Campo>
            <Campo id="placa" rotulo="Placa *" problema={problemaDe("placa")}>
              <input
                id="placa"
                className={`${inputClasse} font-mono uppercase`}
                value={dados.placa ?? ""}
                onChange={(e) => set("placa", e.target.value)}
              />
            </Campo>
            <Campo id="marca" rotulo="Marca *" problema={problemaDe("marca")}>
              <input id="marca" className={inputClasse} value={dados.marca ?? ""} onChange={(e) => set("marca", e.target.value)} />
            </Campo>
            <Campo id="modelo" rotulo="Modelo *" problema={problemaDe("modelo")}>
              <input id="modelo" className={inputClasse} value={dados.modelo ?? ""} onChange={(e) => set("modelo", e.target.value)} />
            </Campo>
            <Campo id="versao" rotulo="Versão">
              <input id="versao" className={inputClasse} value={dados.versao ?? ""} onChange={(e) => set("versao", e.target.value)} />
            </Campo>
            <div className="grid grid-cols-2 gap-4">
              <Campo id="ano_fabricacao" rotulo="Ano fabr. *" problema={problemaDe("ano_fabricacao")}>
                <input
                  id="ano_fabricacao"
                  type="number"
                  className={inputClasse}
                  value={String(dados.ano_fabricacao ?? "")}
                  onChange={(e) => set("ano_fabricacao", e.target.value)}
                />
              </Campo>
              <Campo id="ano_modelo" rotulo="Ano mod. *" problema={problemaDe("ano_modelo")}>
                <input
                  id="ano_modelo"
                  type="number"
                  className={inputClasse}
                  value={String(dados.ano_modelo ?? "")}
                  onChange={(e) => set("ano_modelo", e.target.value)}
                />
              </Campo>
            </div>
            <Campo id="data_venda" rotulo="Data da venda *" problema={problemaDe("data_venda")}>
              <input
                id="data_venda"
                type="date"
                className={inputClasse}
                value={dados.data_venda ?? ""}
                onChange={(e) => set("data_venda", e.target.value)}
              />
            </Campo>
            <Campo id="km_na_venda" rotulo="KM de saída *" problema={problemaDe("km_na_venda")}>
              <input
                id="km_na_venda"
                type="number"
                className={inputClasse}
                value={String(dados.km_na_venda ?? "")}
                onChange={(e) => set("km_na_venda", e.target.value)}
              />
            </Campo>
            <Campo id="valor_venda" rotulo="Valor da venda (R$) *" problema={problemaDe("valor_venda")}>
              <input
                id="valor_venda"
                type="number"
                step="0.01"
                className={inputClasse}
                value={String(dados.valor_venda ?? "")}
                onChange={(e) => set("valor_venda", e.target.value)}
              />
            </Campo>
            <Campo id="vendedor" rotulo="Vendedor">
              <input id="vendedor" className={inputClasse} value={dados.vendedor ?? ""} onChange={(e) => set("vendedor", e.target.value)} />
            </Campo>
          </div>
        </Secao>

        <Secao
          titulo="Financiamento"
          descricao="Se houver, preencha tudo. A taxa mensal é o que permite calcular o saldo devedor — sem ela o campo inteiro perde a função."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="instituicao" rotulo="Banco ou financeira" problema={problemaDe("instituicao")}>
              <input
                id="instituicao"
                className={inputClasse}
                value={dados.financiamento?.instituicao ?? ""}
                onChange={(e) => setFin("instituicao", e.target.value)}
              />
            </Campo>
            <Campo id="valor_financiado" rotulo="Valor financiado (R$)" problema={problemaDe("valor_financiado")}>
              <input
                id="valor_financiado"
                type="number"
                step="0.01"
                className={inputClasse}
                value={String(dados.financiamento?.valor_financiado ?? "")}
                onChange={(e) => setFin("valor_financiado", e.target.value)}
              />
            </Campo>
            <Campo id="valor_entrada" rotulo="Entrada (R$)">
              <input
                id="valor_entrada"
                type="number"
                step="0.01"
                className={inputClasse}
                value={String(dados.financiamento?.valor_entrada ?? "")}
                onChange={(e) => setFin("valor_entrada", e.target.value)}
              />
            </Campo>
            <Campo
              id="taxa_mensal"
              rotulo="Taxa mensal"
              problema={problemaDe("taxa_mensal")}
              dica="Em decimal: 0,0175 para 1,75% a.m."
            >
              <input
                id="taxa_mensal"
                type="number"
                step="0.000001"
                className={inputClasse}
                value={String(dados.financiamento?.taxa_mensal ?? "")}
                onChange={(e) => setFin("taxa_mensal", e.target.value)}
                placeholder="0,0175"
              />
            </Campo>
            <Campo id="prazo_meses" rotulo="Prazo (meses)" problema={problemaDe("prazo_meses")}>
              <input
                id="prazo_meses"
                type="number"
                className={inputClasse}
                value={String(dados.financiamento?.prazo_meses ?? "")}
                onChange={(e) => setFin("prazo_meses", e.target.value)}
              />
            </Campo>
            <Campo id="valor_parcela" rotulo="Valor da parcela (R$)" problema={problemaDe("valor_parcela")}>
              <input
                id="valor_parcela"
                type="number"
                step="0.01"
                className={inputClasse}
                value={String(dados.financiamento?.valor_parcela ?? "")}
                onChange={(e) => setFin("valor_parcela", e.target.value)}
              />
            </Campo>
            <Campo id="data_primeira_parcela" rotulo="1ª parcela" problema={problemaDe("data_primeira_parcela")}>
              <input
                id="data_primeira_parcela"
                type="date"
                className={inputClasse}
                value={dados.financiamento?.data_primeira_parcela ?? ""}
                onChange={(e) => setFin("data_primeira_parcela", e.target.value)}
              />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Programa" descricao="Garantia e plano de manutenção. Recompra não entra aqui — o gatilho do programa não abriu.">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={dados.aderiu_ciclo === true}
              onChange={(e) => set("aderiu_ciclo", e.target.checked)}
              className="mt-foco h-4 w-4 accent-mt-accent"
            />
            <span className="text-[13px] text-mt-ink">O cliente aderiu ao Motors Ciclo</span>
          </label>

          {previa.length > 0 ? (
            <div className="mt-5 border-t border-mt-regua-fina pt-4">
              <div className={rotuloClasse}>Plano de revisões que será criado</div>
              <p className="mb-3 mt-1 text-[11px] text-mt-neutral-500">
                A cada {INTERVALO_KM.toLocaleString("pt-BR")} km ou {INTERVALO_MESES} meses, o que
                vier primeiro. Tolerância de {TOLERANCIA_DIAS} dias.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-mt-regua-fina text-left text-mt-neutral-700">
                      <th className="py-2 pr-4 font-semibold">Revisão</th>
                      <th className="py-2 pr-4 font-semibold">KM previsto</th>
                      <th className="py-2 font-semibold">Janela</th>
                    </tr>
                  </thead>
                  <tbody className="text-mt-ink">
                    {previa.map((r) => (
                      <tr key={r.numero_revisao} className="border-b border-mt-regua-fina last:border-0">
                        <td className="py-2 pr-4">{r.numero_revisao}ª</td>
                        <td className="py-2 pr-4 tabular-nums">{r.km_previsto.toLocaleString("pt-BR")} km</td>
                        <td className="py-2 tabular-nums">
                          {new Date(`${r.janela_inicio}T12:00:00Z`).toLocaleDateString("pt-BR")} —{" "}
                          {new Date(`${r.janela_fim}T12:00:00Z`).toLocaleDateString("pt-BR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </Secao>

        {tentouEnviar && problemas.length > 0 ? (
          <div role="alert" className="border-l-[3px] border-mt-accent bg-mt-surface p-5">
            <p className="text-[13px] font-bold text-mt-ink">
              Falta preencher {problemas.length === 1 ? "1 campo" : `${problemas.length} campos`} para
              fechar a venda:
            </p>
            <ul className="mt-2 list-disc pl-5 text-[12px] text-mt-neutral-700">
              {problemas.map((p) => (
                <li key={`${p.campo}-${p.mensagem}`}>{p.mensagem}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {erroGeral ? (
          <div role="alert" className="border-l-[3px] border-mt-accent bg-mt-surface p-5 text-[13px] text-mt-ink">
            {erroGeral}
          </div>
        ) : null}

        <div className="flex items-center gap-4 pb-10">
          <button
            type="button"
            onClick={enviar}
            disabled={enviando}
            className="mt-foco bg-mt-accent px-6 py-3.5 text-[12px] font-bold uppercase tracking-[.08em] text-mt-inverso disabled:opacity-50"
          >
            {enviando ? "Registrando…" : "Fechar venda"}
          </button>
          <span className="text-[11px] text-mt-neutral-500">
            {podeFechar ? "Tudo preenchido." : "Campos obrigatórios pendentes."}
          </span>
        </div>
      </div>
    </div>
  );
}
