"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { validarRevisao, type DadosDaRevisao } from "../../lib/ciclo/revisao";
import { urlDaFoto } from "../../lib/ciclo/foto";
import { seloDaJanela } from "../../lib/ciclo/selo";
import { classificarJanela } from "../../lib/ciclo/janela";
import { validarSaida } from "../../lib/ciclo/saida";

/**
 * Tela A21 — fila de verificação do diário de bordo (manual v1.1 §5.7,
 * emenda E4/E7).
 *
 * A régua da tela é a do programa: registro NÃO verificado não conta para a
 * conformidade — e é a verificação que converte lançamento em procedência.
 * A fila mostra o que espera decisão; verificar exige a foto da etiqueta
 * nova; recusar exige motivo, e o motivo fica no rastro.
 *
 * O Comercial é o dono da fila; o Admin revisa recusa (decisão do dono,
 * 2026-08-13). O gate de perfil está na página e na rota — aqui é só a tela.
 *
 * Vocabulário: no banco a função ainda se chama `carimbar_revisao`, de quando
 * o programa se chamava "caderneta" (renomeado em 2026-08-14). O nome do
 * objeto de banco não mudou de propósito — migração aplicada é registro
 * histórico, e nenhum usuário lê o nome da função.
 */

interface VeiculoResumo {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  km_na_venda: number;
  /** Preenchida, o carro já saiu da Garagem — o rótulo do seletor avisa. */
  saiu_em: string | null;
  cliente: { nome: string } | null;
}

interface Revisao {
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
  url_etiqueta_anterior: string | null;
  url_etiqueta_atual: string | null;
  url_nota_servico: string | null;
  observacoes: string | null;
  criada_em: string;
  veiculo: VeiculoResumo | null;
}

const rotuloClasse = "text-[10px] font-semibold uppercase tracking-[.12em] text-mt-neutral-700";
const inputClasse =
  "w-full border border-mt-regua-fina bg-mt-bg p-3 text-[13px] text-mt-ink outline-none transition-colors placeholder-mt-neutral-500 focus:border-mt-accent";

const dataBr = (iso: string | null) =>
  iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("pt-BR") : "—";

/**
 * O rótulo do veículo no seletor. Carro que já saiu vem marcado: sem isso, a
 * loja remarca a saída sem perceber e SOBRESCREVE a data que o cliente vê na
 * Garagem como fim do acompanhamento.
 */
const rotuloDoVeiculo = (v: VeiculoResumo) =>
  `${v.placa} — ${v.marca} ${v.modelo} · ${v.cliente?.nome ?? ""}` +
  (v.saiu_em ? ` · já saiu em ${dataBr(v.saiu_em)}` : "");

function Origem({ origem }: { origem: string }) {
  const texto = origem === "cliente" ? "REGISTRO DO CLIENTE" : origem === "parceiro" ? "OFICINA PARCEIRA" : "LOJA";
  return (
    <span className="border border-mt-regua-fina px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] text-mt-neutral-700">
      {texto}
    </span>
  );
}

export default function FilaDeVerificacao() {
  const [pendentes, setPendentes] = useState<Revisao[]>([]);
  const [recentes, setRecentes] = useState<Revisao[]>([]);
  const [veiculos, setVeiculos] = useState<VeiculoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const res = await fetch("/api/ciclo/revisoes", { cache: "no-store" });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(corpo.error ?? "Não foi possível carregar a fila.");
        return;
      }
      setPendentes(corpo.pendentes ?? []);
      setRecentes(corpo.recentes ?? []);
      setVeiculos(corpo.veiculos ?? []);
    } catch {
      setErro("Falha de rede ao carregar a fila.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const decidir = async (id: string, aceitar: boolean, motivoRecusa?: string) => {
    setDecidindo(id);
    setAviso("");
    setErro("");
    try {
      const res = await fetch(`/api/ciclo/revisoes/${id}/verificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aceitar, motivo: motivoRecusa }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(corpo.error ?? "Não foi possível processar.");
        return;
      }
      const estadoDaJanela = classificarJanela(corpo.dentro_da_janela);
      setAviso(
        aceitar
          ? estadoDaJanela === "fora"
            ? "Verificada — fora da janela. Entra no diário de bordo, não na procedência."
            : estadoDaJanela === "sem"
              ? "Verificada. Não havia janela aberta para este serviço — entra no diário de bordo."
              : "Verificada dentro da janela. A procedência deste veículo subiu."
          : "Recusada. O motivo ficou no registro.",
      );
      setRecusando(null);
      setMotivo("");
      await carregar();
    } finally {
      setDecidindo(null);
    }
  };

  // ---- registro pela loja ----
  const hoje = new Date().toISOString().slice(0, 10);
  const [registro, setRegistro] = useState<DadosDaRevisao>({
    veiculo_vendido_id: "",
    data_servico: hoje,
    km_registrado: "",
    numero_revisao: "",
    url_etiqueta_anterior: "",
    url_etiqueta_atual: "",
    observacoes: "",
    confirmar: true,
  });
  const [registrando, setRegistrando] = useState(false);
  const [tentouRegistrar, setTentouRegistrar] = useState(false);

  const problemasDoRegistro = useMemo(() => validarRevisao(registro), [registro]);
  const problemaDe = (campo: string) =>
    tentouRegistrar ? problemasDoRegistro.find((p) => p.campo === campo)?.mensagem : undefined;

  const registrar = async () => {
    setTentouRegistrar(true);
    if (problemasDoRegistro.length > 0) return;
    setRegistrando(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/ciclo/revisoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registro),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(corpo.error ?? "Não foi possível registrar.");
        return;
      }
      const estadoDaJanela = classificarJanela(corpo.verificacao?.dentro_da_janela);
      setAviso(
        corpo.aviso ??
          (corpo.verificacao
            ? estadoDaJanela === "fora"
              ? "Lançada e verificada — fora da janela."
              : estadoDaJanela === "sem"
                ? "Lançada e verificada. Não havia janela aberta para este serviço."
                : "Lançada e verificada dentro da janela."
            : "Lançada no diário de bordo. Está na fila de verificação."),
      );
      setRegistro({
        veiculo_vendido_id: "",
        data_servico: hoje,
        km_registrado: "",
        numero_revisao: "",
        url_etiqueta_anterior: "",
        url_etiqueta_atual: "",
        observacoes: "",
        confirmar: true,
      });
      setTentouRegistrar(false);
      await carregar();
    } finally {
      setRegistrando(false);
    }
  };

  // Fim do acompanhamento: a Garagem é do cliente enquanto o carro for dele.
  const [saida, setSaida] = useState({
    veiculo_vendido_id: "",
    saiu_em: hoje,
    motivo_saida: "",
  });
  const [marcandoSaida, setMarcandoSaida] = useState(false);

  const marcarSaida = async () => {
    setErro("");
    // Como em `decidir` e `registrar`: sem isto, o aviso da ação anterior fica
    // na tela ao lado do erro da atual, e a loja lê o sucesso de outra coisa.
    setAviso("");
    if (!saida.veiculo_vendido_id) {
      setErro("Escolha o veículo que saiu.");
      return;
    }
    const problemas = validarSaida(saida);
    if (problemas.length > 0) {
      setErro(problemas[0].mensagem);
      return;
    }
    setMarcandoSaida(true);
    try {
      const res = await fetch(`/api/ciclo/veiculos/${saida.veiculo_vendido_id}/saida`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saiu_em: saida.saiu_em, motivo_saida: saida.motivo_saida }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(corpo.error ?? "Não foi possível marcar a saída.");
        return;
      }
      setAviso(
        "Saída registrada. O cronograma parou aqui; o diário de bordo continua visível para o cliente.",
      );
      setSaida({ veiculo_vendido_id: "", saiu_em: hoje, motivo_saida: "" });
      await carregar();
    } finally {
      setMarcandoSaida(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <span className="mt-rotulo mt-rotulo-accent">MOTORS CICLO · CADERNETA</span>
        <h1 className="mt-2 text-[24px] font-extrabold tracking-[-.02em] text-mt-ink">
          Fila de verificação
        </h1>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-mt-neutral-700">
          Lançamento não verificado não vira procedência. A prova é a foto da etiqueta de troca
          de óleo — a anterior e a nova, com o KM legível. Recusa exige motivo, e o motivo fica
          no diário de bordo.
        </p>
      </header>

      {aviso ? (
        <div role="status" className="mb-4 border-l-[3px] border-mt-ink bg-mt-surface p-4 text-[13px] text-mt-ink">
          {aviso}
        </div>
      ) : null}
      {erro ? (
        <div role="alert" className="mb-4 border-l-[3px] border-mt-accent bg-mt-surface p-4 text-[13px] text-mt-ink">
          {erro}
        </div>
      ) : null}

      {/* ---- a fila ---- */}
      <section className="border border-mt-regua-fina bg-mt-surface p-6">
        <h2 className="text-[15px] font-extrabold tracking-[-.015em] text-mt-ink">
          Aguardando decisão {pendentes.length > 0 ? `(${pendentes.length})` : ""}
        </h2>
        {carregando ? (
          <p className="mt-3 text-[13px] text-mt-neutral-700">Carregando…</p>
        ) : pendentes.length === 0 ? (
          <p className="mt-3 text-[13px] text-mt-neutral-700">
            Fila vazia. Registro novo do cliente aparece aqui.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {pendentes.map((r) => (
              <li key={r.id} className="border border-mt-regua-fina p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-bold text-mt-ink">
                    {r.veiculo?.placa ?? "—"}
                  </span>
                  <span className="text-[13px] text-mt-ink">
                    {r.veiculo ? `${r.veiculo.marca} ${r.veiculo.modelo}` : ""}
                  </span>
                  <span className="text-[12px] text-mt-neutral-700">
                    · {r.veiculo?.cliente?.nome ?? "cliente"}
                  </span>
                  <span className="ml-auto">
                    <Origem origem={r.origem_registro} />
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-mt-neutral-700">
                  <span>Serviço em {dataBr(r.data_servico)}</span>
                  <span className="tabular-nums">{r.km_registrado.toLocaleString("pt-BR")} km</span>
                  {r.numero_revisao ? <span>{r.numero_revisao}ª revisão</span> : null}
                  <span>Registrado em {dataBr(r.criada_em)}</span>
                </div>
                {/* `urlDaFoto` resolve as duas origens que convivem na mesma
                    coluna: URL externa colada à mão (o jeito antigo, de quando
                    a foto vinha por WhatsApp) e caminho do bucket privado, que
                    só abre por URL assinada. */}
                <div className="mt-2 flex flex-wrap gap-4 text-[12px]">
                  {urlDaFoto(r.url_etiqueta_atual) ? (
                    <a className="mt-foco font-semibold text-mt-accent underline" href={urlDaFoto(r.url_etiqueta_atual)!} target="_blank" rel="noreferrer">
                      Etiqueta nova
                    </a>
                  ) : (
                    <span className="font-semibold text-mt-accent">Sem foto da etiqueta nova</span>
                  )}
                  {urlDaFoto(r.url_etiqueta_anterior) ? (
                    <a className="mt-foco text-mt-neutral-700 underline" href={urlDaFoto(r.url_etiqueta_anterior)!} target="_blank" rel="noreferrer">
                      Etiqueta anterior
                    </a>
                  ) : null}
                  {urlDaFoto(r.url_nota_servico) ? (
                    <a className="mt-foco text-mt-neutral-700 underline" href={urlDaFoto(r.url_nota_servico)!} target="_blank" rel="noreferrer">
                      Nota de serviço
                    </a>
                  ) : null}
                </div>

                {recusando === r.id ? (
                  <div className="mt-3 flex flex-col gap-2 border-t border-mt-regua-fina pt-3">
                    <label htmlFor={`motivo-${r.id}`} className={rotuloClasse}>
                      Motivo da recusa
                    </label>
                    <input
                      id={`motivo-${r.id}`}
                      className={inputClasse}
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: etiqueta ilegível; KM não confere com a anterior"
                    />
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={decidindo === r.id || motivo.trim() === ""}
                        onClick={() => decidir(r.id, false, motivo)}
                        className="mt-foco bg-mt-ink px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-mt-inverso disabled:opacity-50"
                      >
                        Confirmar recusa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRecusando(null);
                          setMotivo("");
                        }}
                        className="mt-foco px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-mt-neutral-700"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-3 border-t border-mt-regua-fina pt-3">
                    <button
                      type="button"
                      disabled={decidindo === r.id || !r.url_etiqueta_atual}
                      onClick={() => decidir(r.id, true)}
                      title={r.url_etiqueta_atual ? undefined : "Sem a foto da etiqueta nova não há verificação"}
                      className="mt-foco bg-mt-accent px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-mt-inverso disabled:opacity-50"
                    >
                      {decidindo === r.id ? "Processando…" : "Verificar"}
                    </button>
                    <button
                      type="button"
                      disabled={decidindo === r.id}
                      onClick={() => setRecusando(r.id)}
                      className="mt-foco border border-mt-regua px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-mt-ink"
                    >
                      Recusar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- registro pela loja ---- */}
      <section className="mt-5 border border-mt-regua-fina bg-mt-surface p-6">
        <h2 className="text-[15px] font-extrabold tracking-[-.015em] text-mt-ink">
          Lançar revisão no diário de bordo
        </h2>
        <p className="mb-4 mt-1 text-xs text-mt-neutral-700">
          Para serviço feito pela loja ou pela rede. Com as fotos em mãos, o lançamento já sai
          verificado.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="rev-veiculo" className={rotuloClasse}>
              Veículo *
            </label>
            <select
              id="rev-veiculo"
              className={inputClasse}
              value={registro.veiculo_vendido_id ?? ""}
              onChange={(e) => setRegistro((d) => ({ ...d, veiculo_vendido_id: e.target.value }))}
            >
              <option value="">Escolha…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} — {v.marca} {v.modelo} · {v.cliente?.nome ?? ""}
                </option>
              ))}
            </select>
            {problemaDe("veiculo_vendido_id") ? (
              <p className="text-[11px] font-semibold text-mt-accent">{problemaDe("veiculo_vendido_id")}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rev-data" className={rotuloClasse}>
              Data do serviço *
            </label>
            <input
              id="rev-data"
              type="date"
              className={inputClasse}
              value={registro.data_servico ?? ""}
              onChange={(e) => setRegistro((d) => ({ ...d, data_servico: e.target.value }))}
            />
            {problemaDe("data_servico") ? (
              <p className="text-[11px] font-semibold text-mt-accent">{problemaDe("data_servico")}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rev-km" className={rotuloClasse}>
              KM do odômetro *
            </label>
            <input
              id="rev-km"
              type="number"
              className={inputClasse}
              value={String(registro.km_registrado ?? "")}
              onChange={(e) => setRegistro((d) => ({ ...d, km_registrado: e.target.value }))}
            />
            {problemaDe("km_registrado") ? (
              <p className="text-[11px] font-semibold text-mt-accent">{problemaDe("km_registrado")}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rev-etq-nova" className={rotuloClasse}>
              Foto da etiqueta nova {registro.confirmar ? "*" : ""}
            </label>
            <input
              id="rev-etq-nova"
              className={inputClasse}
              value={registro.url_etiqueta_atual ?? ""}
              onChange={(e) => setRegistro((d) => ({ ...d, url_etiqueta_atual: e.target.value }))}
              placeholder="Link da foto (com o KM legível)"
            />
            {problemaDe("url_etiqueta_atual") ? (
              <p className="text-[11px] font-semibold text-mt-accent">{problemaDe("url_etiqueta_atual")}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="rev-etq-ant" className={rotuloClasse}>
              Foto da etiqueta anterior
            </label>
            <input
              id="rev-etq-ant"
              className={inputClasse}
              value={registro.url_etiqueta_anterior ?? ""}
              onChange={(e) => setRegistro((d) => ({ ...d, url_etiqueta_anterior: e.target.value }))}
              placeholder="Vazia na primeira revisão — o marco é o KM de saída"
            />
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={registro.confirmar === true}
            onChange={(e) => setRegistro((d) => ({ ...d, confirmar: e.target.checked }))}
            className="mt-foco h-4 w-4 accent-mt-accent"
          />
          <span className="text-[13px] text-mt-ink">Verificar já — conferi as etiquetas</span>
        </label>

        <div className="mt-4">
          <button
            type="button"
            onClick={registrar}
            disabled={registrando}
            className="mt-foco bg-mt-accent px-5 py-3 text-[12px] font-bold uppercase tracking-[.08em] text-mt-inverso disabled:opacity-50"
          >
            {registrando ? "Lançando…" : registro.confirmar ? "Lançar e verificar" : "Lançar"}
          </button>
        </div>
      </section>

      {/* ---- fim do acompanhamento ---- */}
      <section className="mt-5 border border-mt-regua-fina bg-mt-surface p-6">
        <h2 className="text-[15px] font-extrabold tracking-[-.015em] text-mt-ink">
          Marcar saída da Garagem
        </h2>
        <p className="mb-4 mt-1 text-xs text-mt-neutral-700">
          Use quando o carro deixar de ser do cliente. O cronograma de revisões para e os
          lembretes cessam — <strong>o diário de bordo continua visível para ele</strong>,
          porque o histórico é dele.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="saida-veiculo" className={rotuloClasse}>
              Veículo *
            </label>
            <select
              id="saida-veiculo"
              className={inputClasse}
              value={saida.veiculo_vendido_id}
              onChange={(e) => setSaida((d) => ({ ...d, veiculo_vendido_id: e.target.value }))}
            >
              <option value="">Escolha…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {rotuloDoVeiculo(v)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="saida-data" className={rotuloClasse}>
              Data da saída *
            </label>
            <input
              id="saida-data"
              type="date"
              className={inputClasse}
              value={saida.saiu_em}
              max={hoje}
              onChange={(e) => setSaida((d) => ({ ...d, saiu_em: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="saida-motivo" className={rotuloClasse}>
              Motivo *
            </label>
            <input
              id="saida-motivo"
              type="text"
              className={inputClasse}
              placeholder="revendido, perda total…"
              value={saida.motivo_saida}
              onChange={(e) => setSaida((d) => ({ ...d, motivo_saida: e.target.value }))}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={marcarSaida}
          disabled={marcandoSaida}
          className="mt-4 border border-mt-ink px-4 py-2.5 text-[13px] font-bold text-mt-ink transition-colors hover:bg-mt-ink hover:text-mt-bg disabled:opacity-50"
        >
          {marcandoSaida ? "Registrando…" : "Marcar saída"}
        </button>
      </section>

      {/* ---- as últimas verificações ---- */}
      <section className="mt-5 border border-mt-regua-fina bg-mt-surface p-6">
        <h2 className="text-[15px] font-extrabold tracking-[-.015em] text-mt-ink">
          Últimas verificações
        </h2>
        {recentes.length === 0 ? (
          <p className="mt-3 text-[13px] text-mt-neutral-700">Nenhum ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col">
            {recentes.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-mt-regua-fina py-2.5 text-[12px] last:border-0"
              >
                <span className="font-mono font-bold text-mt-ink">{r.veiculo?.placa ?? "—"}</span>
                <span className="text-mt-neutral-700">
                  {r.numero_revisao ? `${r.numero_revisao}ª` : "revisão"} · {dataBr(r.data_servico)} ·{" "}
                  <span className="tabular-nums">{r.km_registrado.toLocaleString("pt-BR")} km</span>
                </span>
                {/* Recusada não é "fora da janela": é lançamento que a loja
                    não validou. Mostrar o selo da janela aqui diria que a
                    revisão existe e chegou atrasada. */}
                {r.recusada_em ? (
                  <span
                    className="ml-auto border border-mt-accent px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] text-mt-accent"
                    title={r.motivo_recusa ?? undefined}
                  >
                    RECUSADA
                  </span>
                ) : (
                  <span
                    className={`ml-auto border px-2 py-0.5 text-[9px] font-semibold tracking-[.14em] ${
                      {
                        na: "border-mt-ink text-mt-ink",
                        fora: "border-mt-accent text-mt-accent",
                        sem: "border-mt-regua-fina text-mt-neutral-600",
                      }[seloDaJanela(r.dentro_da_janela).tom]
                    }`}
                  >
                    {seloDaJanela(r.dentro_da_janela).texto}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
