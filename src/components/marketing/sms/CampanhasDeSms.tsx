"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { EstadoDaChecagem } from "../../../lib/consultaDePlaca";
import { ROTULO_DA_SITUACAO, ROTULO_DO_CRITERIO, taxa, type CarroDaCampanha, type SituacaoDaCampanha } from "../../../lib/smsCampanhas";
import type { ConfiguracaoDoSms, LeituraDasCampanhas } from "../../../lib/smsCampanhas-servidor";
import SinalDeEstado, { COR_DO_ESTADO } from "../../admin/consulta/SinalDeEstado";
import NovaCampanhaDeSms from "./NovaCampanhaDeSms";

/**
 * `/admin/marketing/sms` — criar campanhas de SMS por veículo e acompanhar
 * cada uma (pedido do dono em 07/10/2026).
 *
 * Quem abre: Administrador e Marketing. Quando: há um carro para empurrar e
 * gente que já olhou para ele. Que decisão sai: **qual campanha criar agora, e
 * qual das que já saíram trouxe gente de volta** — a lista é o funil de cada
 * uma, lado a lado, com o custo.
 *
 * Nada aqui carrega contato de lead: a lista é só contagem.
 */

/** A forma de cada situação. O rótulo escrito vem sempre ao lado. */
export const SINAL_DA_SITUACAO: Record<SituacaoDaCampanha, EstadoDaChecagem> = {
  rascunho: "nao_conferido",
  enviando: "atencao",
  enviada: "ok",
  interrompida: "impeditivo",
};

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (n: number) => n.toLocaleString("pt-BR");
const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });

export default function CampanhasDeSms({
  leitura,
  carros,
  configuracao,
  migracao,
  semChaveDeServico = false,
}: {
  leitura: LeituraDasCampanhas;
  carros: CarroDaCampanha[];
  configuracao: ConfiguracaoDoSms;
  /** O nome da migração que cria as tabelas (`MIGRACAO_DAS_CAMPANHAS_DE_SMS`), para o aviso. */
  migracao: string;
  /** A porta devolveu 503: falta `SUPABASE_SERVICE_ROLE_KEY`, e nada pôde ser lido. */
  semChaveDeServico?: boolean;
}) {
  const faltaMigracao = !leitura.ok && leitura.faltaMigracao;
  const impedimento = semChaveDeServico
    ? "Falta a chave de serviço do banco no servidor: não dá para criar campanha agora."
    : faltaMigracao
      ? "As tabelas das campanhas ainda não existem no banco: não dá para criar campanha agora."
      : null;

  const avisos: Array<{ chave: string; estado: EstadoDaChecagem; rotulo: string; texto: ReactNode }> = [];
  if (semChaveDeServico) {
    avisos.push({
      chave: "servico",
      estado: "impeditivo",
      rotulo: "Configuração",
      texto: (
        <>
          Falta a variável <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> no servidor. Sem ela o público não pode ser
          montado, e a tela não lê nem cria campanha.
        </>
      ),
    });
  }
  if (faltaMigracao) {
    avisos.push({
      chave: "migracao",
      estado: "impeditivo",
      rotulo: "Configuração",
      texto: (
        <>
          As tabelas das campanhas ainda não existem no banco. Aplique a migração <code className="font-mono">{migracao}</code> no
          Supabase para liberar a criação e a lista.
        </>
      ),
    });
  }
  if (!leitura.ok && !leitura.faltaMigracao && !semChaveDeServico) {
    avisos.push({ chave: "leitura", estado: "impeditivo", rotulo: "Erro", texto: <>A lista de campanhas não pôde ser lida: {leitura.motivo}</> });
  }
  if (!configuracao.temToken) {
    avisos.push({
      chave: "token",
      estado: "impeditivo",
      rotulo: "Configuração",
      texto: (
        <>
          Falta a variável <code className="font-mono">APIBRASIL_TOKEN</code> no servidor. Dá para montar a campanha e calcular o
          público, mas nenhum SMS sai sem ela.
        </>
      ),
    });
  }
  if (configuracao.homologacao) {
    avisos.push({
      chave: "homologacao",
      estado: "atencao",
      rotulo: "Atenção",
      texto: <>O fornecedor está em modo de homologação: os envios são de teste, e nenhum SMS chega ao celular de ninguém.</>,
    });
  }
  if (!configuracao.temRetorno) {
    avisos.push({
      chave: "retorno",
      estado: "atencao",
      rotulo: "Atenção",
      texto: (
        <>
          Falta a variável <code className="font-mono">SMS_WEBHOOK_TOKEN</code>. Sem ela a resposta SAIR de quem recebe não chega
          ao painel, e por isso campanha de verdade não é enviada: dá para criar o rascunho, mas o envio é recusado.
        </>
      ),
    });
  }

  const campanhas = leitura.ok ? leitura.campanhas : [];

  return (
    <div className="mt-consulta mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="mt-rotulo">MARKETING</span>
        <h1 className="mt-titulo m-0 text-3xl md:text-4xl">Campanhas de SMS</h1>
        <p className="m-0 max-w-3xl text-sm leading-relaxed text-mt-neutral-800">
          Um SMS com link curto para a ficha de um carro, enviado a quem já demonstrou interesse nele, no modelo, na marca ou na
          faixa de preço. Cada campanha tem o próprio funil: quem recebeu, quem abriu, quem respondeu.
        </p>
      </header>

      {avisos.length > 0 && (
        <div className="flex flex-col gap-2" data-avisos-de-configuracao>
          {avisos.map((a) => (
            <div
              key={a.chave}
              role={a.estado === "impeditivo" ? "alert" : "status"}
              data-aviso={a.chave}
              className="flex items-start gap-3 border-l-[3px] bg-mt-surface px-4 py-3 text-xs leading-relaxed text-mt-ink"
              style={{ borderColor: COR_DO_ESTADO[a.estado] }}
            >
              <SinalDeEstado estado={a.estado} rotulo={a.rotulo} />
              <span>
                <strong>{a.rotulo}:</strong> {a.texto}
              </span>
            </div>
          ))}
        </div>
      )}

      <section aria-label="Nova campanha" className="flex flex-col gap-4">
        <h2 className="mt-titulo m-0 text-xl">Nova campanha</h2>
        <NovaCampanhaDeSms carros={carros} impedimento={impedimento} />
      </section>

      <section aria-label="Campanhas" className="flex flex-col gap-4 border-t-2 border-mt-regua pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="mt-titulo m-0 text-xl">Campanhas</h2>
          {campanhas.length > 0 && (
            <span className="text-xs tabular-nums text-mt-neutral-700">
              {numero(campanhas.length)} {campanhas.length === 1 ? "campanha" : "campanhas"}
            </span>
          )}
        </div>

        {campanhas.length === 0 ? (
          <div className="mt-cartao flex flex-col gap-1" data-lista-vazia>
            <span className="text-sm font-extrabold text-mt-ink">{leitura.ok ? "Nenhuma campanha ainda." : "A lista não está disponível."}</span>
            <span className="text-xs leading-relaxed text-mt-neutral-800">
              {leitura.ok
                ? "Escolha um carro acima, calcule o público e crie a primeira. Ela nasce em rascunho: nada é enviado até você confirmar na tela da campanha."
                : "Veja o aviso de configuração no alto da página."}
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-tabela min-w-[980px] text-xs" data-lista-de-campanhas>
              <thead>
                <tr>
                  <th scope="col">Campanha</th>
                  <th scope="col">Carro</th>
                  <th scope="col">Público</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className="mt-num text-right">Público</th>
                  <th scope="col" className="mt-num text-right">Enviados</th>
                  <th scope="col" className="mt-num text-right">Na operadora</th>
                  <th scope="col" className="mt-num text-right">Clicaram</th>
                  <th scope="col" className="mt-num text-right">Responderam</th>
                  <th scope="col" className="mt-num text-right">Saíram</th>
                  <th scope="col" className="mt-num text-right">Custo</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id} data-campanha={c.id}>
                    <td>
                      <Link href={`/admin/marketing/sms/${c.id}`} className="mt-foco font-extrabold text-mt-ink underline underline-offset-2">
                        {c.nome}
                      </Link>
                      <div className="text-[11px] tabular-nums text-mt-neutral-700">
                        {c.enviadaEm ? `Enviada em ${dia(c.enviadaEm)}` : `Criada em ${dia(c.criadoEm)}`}
                        {c.criadoPorNome ? ` · ${c.criadoPorNome}` : ""}
                      </div>
                    </td>
                    <td>{c.veiculoRotulo}</td>
                    <td>{ROTULO_DO_CRITERIO[c.criterio]}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap" data-situacao={c.situacao}>
                        <SinalDeEstado estado={SINAL_DA_SITUACAO[c.situacao]} tamanho={16} rotulo={ROTULO_DA_SITUACAO[c.situacao]} />
                        {ROTULO_DA_SITUACAO[c.situacao]}
                      </span>
                    </td>
                    <td className="mt-num text-right">{numero(c.resumo.publico)}</td>
                    <td className="mt-num text-right">{numero(c.resumo.enviados)}</td>
                    <td className="mt-num text-right">{numero(c.resumo.naOperadora)}</td>
                    <td className="mt-num text-right">
                      {numero(c.resumo.clicaram)}
                      <span className="text-mt-neutral-700"> · {taxa(c.resumo.clicaram, c.resumo.enviados)}%</span>
                    </td>
                    <td className="mt-num text-right">{numero(c.resumo.responderam)}</td>
                    <td className="mt-num text-right">{numero(c.resumo.sairam)}</td>
                    <td className="mt-num text-right">{c.resumo.enviados > 0 ? reais(c.resumo.custo) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="m-0 mt-2 text-[11px] leading-relaxed text-mt-neutral-700">
              O percentual de “Clicaram” é sobre os enviados. “Na operadora” é o último aviso que o fornecedor dá: ele não confirma
              a entrega no aparelho.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
