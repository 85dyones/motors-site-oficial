"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rotulo } from "../modernist/primitivos";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import {
  BUCKET_DO_DIARIO,
  caminhoDaFoto,
  prepararFoto,
  urlDaFoto,
  validarFoto,
} from "../../lib/ciclo/foto";

/**
 * Um veículo na Garagem — o recorte da fase 1 do §6.3-A:
 * o carro, o KM conhecido com origem e data, a janela da próxima revisão e o
 * diário de bordo com o status de verificação de cada lançamento.
 *
 * O que NÃO aparece aqui é tão decidido quanto o que aparece: nada de valor
 * de recompra (regra 5 — o gatilho §1.4 não abriu), nada de saldo devedor
 * (regra 3 exigiria o rótulo de estimativa e o dado ainda não é exibido), e
 * "caderneta" não existe no vocabulário desde 2026-08-14.
 */

export interface VeiculoDaGaragem {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  versao: string | null;
  ano_modelo: number;
  data_venda: string;
  km_na_venda: number;
  contrato: {
    plano: string;
    garantia_meses: number;
    garantia_fim: string;
  } | null;
  plano_revisoes: {
    numero_revisao: number;
    km_previsto: number | null;
    janela_inicio: string;
    janela_fim: string;
    manutencao_id: string | null;
  }[];
  manutencoes: {
    id: string;
    tipo: string;
    numero_revisao: number | null;
    data_servico: string;
    km_registrado: number;
    origem_registro: string;
    confirmada_em: string | null;
    recusada_em: string | null;
    motivo_recusa: string | null;
    dentro_da_janela: boolean | null;
    url_etiqueta_atual: string | null;
    criada_em: string;
  }[];
  leituras_odometro: {
    km: number;
    origem: string;
    registrada_em: string;
  }[];
}

const dataBr = (iso: string | null | undefined) =>
  iso
    ? new Date(String(iso).length <= 10 ? `${iso}T12:00:00Z` : String(iso)).toLocaleDateString("pt-BR")
    : "—";

const kmBr = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} km`;

const ORIGEM_DA_LEITURA: Record<string, string> = {
  venda: "KM de saída na compra",
  cliente: "informado por você",
  revisao: "verificado na revisão",
  vistoria: "verificado em vistoria",
};

export default function GaragemVeiculo({ veiculo }: { veiculo: VeiculoDaGaragem }) {
  const nome = [veiculo.marca, veiculo.modelo, veiculo.versao].filter(Boolean).join(" ");

  // O KM conhecido: a leitura mais recente. A primeira linha de todo veículo
  // é o KM de saída na compra (origem 'venda'), então sempre há uma.
  const leituras = [...veiculo.leituras_odometro].sort((a, b) =>
    a.registrada_em < b.registrada_em ? 1 : -1,
  );
  const kmConhecido = leituras[0] ?? {
    km: veiculo.km_na_venda,
    origem: "venda",
    registrada_em: veiculo.data_venda,
  };

  // A próxima janela em aberto: nenhuma revisão carimbada casou com ela.
  const proxima = [...veiculo.plano_revisoes]
    .filter((p) => p.manutencao_id === null)
    .sort((a, b) => a.numero_revisao - b.numero_revisao)[0];

  const diario = [...veiculo.manutencoes].sort((a, b) =>
    a.data_servico < b.data_servico ? 1 : -1,
  );

  return (
    <section className="flex flex-col gap-6 border border-mt-regua-fina bg-mt-surface p-6">
      {/* ---- o carro ---- */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-mt-regua-fina pb-4">
        <div>
          <h2 className="m-0 text-[19px] font-extrabold tracking-[-.015em] text-mt-ink">
            {nome} {veiculo.ano_modelo}
          </h2>
          <p className="m-0 mt-1 font-mono text-[13px] font-bold tracking-[.06em] text-mt-neutral-700">
            {veiculo.placa}
          </p>
        </div>
        <p className="m-0 text-[12px] text-mt-neutral-600">
          com você desde {dataBr(veiculo.data_venda)}
        </p>
      </div>

      {/* ---- o estado de hoje ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Rotulo className="text-[10px] tracking-[.14em]">KM CONHECIDO</Rotulo>
          <p className="m-0 mt-1 text-[17px] font-bold tabular-nums text-mt-ink">
            {kmBr(kmConhecido.km)}
          </p>
          <p className="m-0 mt-0.5 text-[11px] leading-snug text-mt-neutral-600">
            {ORIGEM_DA_LEITURA[kmConhecido.origem] ?? kmConhecido.origem} ·{" "}
            {dataBr(kmConhecido.registrada_em)}
          </p>
        </div>

        <div>
          <Rotulo className="text-[10px] tracking-[.14em]">PRÓXIMA REVISÃO</Rotulo>
          {proxima ? (
            <>
              <p className="m-0 mt-1 text-[15px] font-bold text-mt-ink">
                {dataBr(proxima.janela_inicio)} a {dataBr(proxima.janela_fim)}
              </p>
              <p className="m-0 mt-0.5 text-[11px] leading-snug text-mt-neutral-600">
                {proxima.numero_revisao}ª revisão
                {proxima.km_previsto ? ` · por volta de ${kmBr(proxima.km_previsto)}` : ""}
              </p>
            </>
          ) : (
            <p className="m-0 mt-1 text-[13px] text-mt-neutral-700">
              Nenhuma janela em aberto.
            </p>
          )}
        </div>

        <div>
          <Rotulo className="text-[10px] tracking-[.14em]">GARANTIA</Rotulo>
          {veiculo.contrato ? (
            <>
              <p className="m-0 mt-1 text-[15px] font-bold text-mt-ink">
                até {dataBr(veiculo.contrato.garantia_fim)}
              </p>
              <p className="m-0 mt-0.5 text-[11px] leading-snug text-mt-neutral-600">
                {veiculo.contrato.garantia_meses} meses · plano{" "}
                {veiculo.contrato.plano === "completo" ? "Completo" : "Essencial"}
              </p>
            </>
          ) : (
            <p className="m-0 mt-1 text-[13px] text-mt-neutral-700">—</p>
          )}
        </div>
      </div>

      {/* ---- o diário de bordo ---- */}
      <div className="border-t border-mt-regua-fina pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="m-0 text-[13px] font-extrabold uppercase tracking-[.08em] text-mt-ink">
            Diário de bordo
          </h3>
          <p className="m-0 text-[11px] text-mt-neutral-600">
            revisão verificada vira procedência
          </p>
        </div>

        {diario.length === 0 ? (
          <p className="m-0 mt-3 text-[13px] leading-relaxed text-mt-neutral-700">
            Ainda sem lançamentos. A primeira revisão tem janela marcada aí em cima — e
            o KM de saída já está anotado como o marco zero.
          </p>
        ) : (
          <ul className="m-0 mt-3 flex list-none flex-col p-0">
            {diario.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-mt-regua-fina py-2.5 text-[12px] last:border-0"
              >
                <span className="text-mt-neutral-700">
                  {m.numero_revisao ? `${m.numero_revisao}ª revisão` : "revisão"} ·{" "}
                  {dataBr(m.data_servico)} ·{" "}
                  <span className="tabular-nums">{kmBr(m.km_registrado)}</span>
                  {urlDaFoto(m.url_etiqueta_atual) ? (
                    <>
                      {" · "}
                      <a
                        href={urlDaFoto(m.url_etiqueta_atual)!}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-foco font-semibold text-mt-ink underline underline-offset-2"
                      >
                        ver a foto
                      </a>
                    </>
                  ) : null}
                </span>
                {m.confirmada_em ? (
                  <span className="ml-auto border border-mt-ink px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] text-mt-ink">
                    {m.dentro_da_janela ? "VERIFICADA · NA JANELA" : "VERIFICADA"}
                  </span>
                ) : m.recusada_em ? (
                  <span
                    className="ml-auto border border-mt-accent px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] text-mt-accent"
                    title={m.motivo_recusa ?? undefined}
                  >
                    NÃO VALIDADA
                  </span>
                ) : (
                  <span className="ml-auto border border-mt-regua-fina px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] text-mt-neutral-700">
                    AGUARDANDO VERIFICAÇÃO
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Registros veiculoId={veiculo.id} kmConhecido={kmConhecido.km} />
    </section>
  );
}

/**
 * Os dois registros do cliente. Ambos opcionais e nenhum penaliza (§5.6 e
 * regra 2): não registrar KM só deixa a estimativa menos precisa; revisão
 * registrada aqui nasce pendente e vale quando a loja verificar.
 */
function Registros({ veiculoId, kmConhecido }: { veiculoId: string; kmConhecido: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<"km" | "revisao" | null>(null);
  const [km, setKm] = useState("");
  const [dataServico, setDataServico] = useState("");
  const [kmRevisao, setKmRevisao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  // A foto que JÁ subiu ao bucket, com o caminho dela. Existe porque o upload
  // acontece antes do POST e o bucket recusa DELETE (protect_delete): se o
  // POST falhar, apagar o arquivo não é opção — então o reenvio reaproveita
  // o caminho em vez de subir cópia nova e largar a anterior órfã (achado #11).
  const [fotoSubida, setFotoSubida] = useState<{ arquivo: File; caminho: string } | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * Sobe a foto DIRETO para o bucket privado, com a sessão do cliente — a RLS
   * do storage decide se a pasta é dele. Devolve o caminho, que é o que a
   * rota grava. Não passa pelo servidor Next de propósito: o limite de corpo
   * da Vercel (~4,5 MB) barraria justamente a foto de celular.
   */
  async function subirFoto(arquivo: File): Promise<string> {
    const problema = validarFoto(arquivo);
    if (problema) throw new Error(problema.mensagem);

    setProgresso("Preparando a foto…");
    const preparada = await prepararFoto(arquivo);

    setProgresso("Enviando a foto…");
    const supabase = createBrowserSupabaseClient();
    const caminho = caminhoDaFoto(veiculoId, "atual", preparada.name);
    const { error } = await supabase.storage
      .from(BUCKET_DO_DIARIO)
      .upload(caminho, preparada, { contentType: preparada.type, upsert: false });

    if (error) {
      throw new Error(
        "Não deu para enviar a foto. Tente de novo — se persistir, mande pelo WhatsApp da loja.",
      );
    }
    return caminho;
  }

  async function enviar(url: string, corpo: Record<string, unknown>, sucesso: string) {
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veiculo_vendido_id: veiculoId, ...corpo }),
      });
      const json = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(json?.error ?? "Não deu para registrar agora. Tente de novo.");
        return;
      }
      setMensagem(sucesso);
      setAberto(null);
      setKm("");
      setDataServico("");
      setKmRevisao("");
      setObservacoes("");
      setFoto(null);
      setFotoSubida(null);
      router.refresh();
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  }

  const rotuloBotao =
    "mt-foco border border-mt-regua-fina px-4 py-2 text-[11px] font-semibold uppercase tracking-[.1em] text-mt-neutral-700 transition-colors hover:border-mt-accent hover:text-mt-ink";
  const inputClasse =
    "w-full border border-mt-regua-fina bg-mt-bg p-2.5 text-[13px] text-mt-ink outline-none transition-colors placeholder-mt-neutral-500 focus:border-mt-accent";

  return (
    <div className="border-t border-mt-regua-fina pt-4">
      {mensagem && (
        <p className="m-0 mb-3 border-l-2 border-mt-ink bg-mt-bg p-3 text-[13px] text-mt-ink">
          {mensagem}
        </p>
      )}
      {erro && (
        <p role="alert" className="m-0 mb-3 border-l-2 border-mt-accent bg-mt-bg p-3 text-[13px] text-mt-ink">
          {erro}
        </p>
      )}

      {aberto === null && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={rotuloBotao} onClick={() => { setMensagem(null); setAberto("km"); }}>
            Informar KM atual
          </button>
          <button type="button" className={rotuloBotao} onClick={() => { setMensagem(null); setAberto("revisao"); }}>
            Registrar revisão feita
          </button>
        </div>
      )}

      {aberto === "km" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(
              "/api/garagem/km",
              { km: Number(km) },
              "KM anotado no diário. Obrigado — isso deixa o lembrete de revisão mais preciso.",
            );
          }}
        >
          <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
            KM no painel do carro
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            required
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder={`hoje consta ${kmBr(kmConhecido)}`}
            className={inputClasse}
          />
          <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-600">
            Opcional, sempre. Informar ajuda a avisar da revisão na hora certa; não
            informar não muda nada no seu programa.
          </p>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={enviando}
              className="mt-foco bg-mt-accent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-mt-inverso disabled:opacity-50"
            >
              {enviando ? "Anotando…" : "Anotar"}
            </button>
            <button type="button" className={rotuloBotao} onClick={() => setAberto(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {aberto === "revisao" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setErro(null);
            let caminho: string | null = null;
            if (foto) {
              if (fotoSubida && fotoSubida.arquivo === foto) {
                // Esta foto já está no bucket — foi o POST que recusou da
                // outra vez. Reaproveita o caminho em vez de subir de novo.
                caminho = fotoSubida.caminho;
              } else {
                setEnviando(true);
                try {
                  caminho = await subirFoto(foto);
                } catch (falha: any) {
                  setErro(falha?.message ?? "Não deu para enviar a foto.");
                  setEnviando(false);
                  setProgresso(null);
                  return;
                }
                setEnviando(false);
                setFotoSubida({ arquivo: foto, caminho });
              }
            }
            enviar(
              "/api/garagem/revisoes",
              {
                data_servico: dataServico,
                km_registrado: Number(kmRevisao),
                observacoes: observacoes.trim() || null,
                url_etiqueta_atual: caminho,
              },
              caminho
                ? "Revisão lançada com a foto — está na fila de verificação da loja. Quando a equipe conferir a etiqueta, ela vira procedência do carro."
                : "Revisão lançada no diário — está na fila de verificação da loja. Sem a foto da etiqueta a equipe vai precisar pedir a prova; dá para anexar num registro novo.",
            );
          }}
        >
          <p className="m-0 text-[12px] leading-relaxed text-mt-neutral-700">
            Fez a revisão fora da rede parceira? Lança aqui. O lançamento fica{" "}
            <strong>aguardando verificação</strong> até a loja conferir a foto da
            etiqueta de troca de óleo — verificada, vira procedência do carro.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                Data do serviço
              </label>
              <input
                type="date"
                required
                value={dataServico}
                onChange={(e) => setDataServico(e.target.value)}
                className={inputClasse}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
                KM no dia
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                required
                value={kmRevisao}
                onChange={(e) => setKmRevisao(e.target.value)}
                className={inputClasse}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700">
              Onde fez, o que trocou (opcional)
            </label>
            <input
              type="text"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="ex.: oficina do bairro, troca de óleo e filtros"
              className={inputClasse}
            />
          </div>

          {/* A prova. `capture` abre a câmera direto no celular, que é onde a
              etiqueta é fotografada — de pé, ao lado do carro. */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`foto-${veiculoId}`}
              className="text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700"
            >
              Foto da etiqueta de troca de óleo
            </label>
            <input
              id={`foto-${veiculoId}`}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="w-full border border-mt-regua-fina bg-mt-bg p-2.5 text-[12px] text-mt-ink file:mr-3 file:border-0 file:bg-mt-ink file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:uppercase file:tracking-[.08em] file:text-mt-inverso"
            />
            <p className="m-0 text-[11px] leading-relaxed text-mt-neutral-600">
              A etiqueta nova, com o <strong>KM legível</strong> — é ela que valida o
              lançamento. Dá para lançar sem a foto, mas aí a verificação fica parada
              até a prova chegar.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={enviando}
              className="mt-foco bg-mt-accent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-mt-inverso disabled:opacity-50"
            >
              {enviando ? progresso ?? "Lançando…" : "Lançar no diário"}
            </button>
            <button type="button" className={rotuloBotao} onClick={() => setAberto(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
