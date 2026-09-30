import Link from "next/link";
import { nomeComAno } from "../../lib/nomeDoVeiculo";
import {
  ANCORA_DA_CONTA,
  ANCORA_DO_LOTE,
  COMO_COMPRAR,
  CONTA_ABERTA,
  PERGUNTAS_DO_REPASSE,
  PERGUNTAS_DO_REPASSE_CABECALHO,
  PROVAS_DO_REPASSE,
  REPASSE_OU_ESTOQUE,
  SERVE_PARA_VOCE,
  notaDoSinistro,
  rotuloDoExemplo,
} from "../../lib/paginaDoRepasse";
import type { WhatsappDaLoja } from "../../lib/loteDoRepasse";
import type { Repasse } from "../../lib/repasse";
import { LinkRegua, Rotulo } from "../modernist/primitivos";
import ContaDoRepasse from "./ContaDoRepasse";
import WhatsAppDoRepasse from "./WhatsAppDoRepasse";

/**
 * As seções que explicam o repasse (pranchas "Página /repasse", a parte de
 * `Conteudo.dc.html`). As mesmas com lote e sem lote (decisão 20 do plano):
 * a página no ar sem carro não pode perder o texto que responde à busca, e o
 * `FAQPage` exige as perguntas visíveis. Server components sem estado; o
 * texto vem inteiro de `paginaDoRepasse.ts`.
 */
const SECAO = "border-t-2 border-mt-regua px-[18px] py-12 lg:px-10";
const TITULO = "mt-titulo m-0 mt-2 text-3xl md:text-[40px]";
const TEXTO = "m-0 mt-3 max-w-[620px] text-[14px] leading-relaxed text-mt-neutral-800 lg:text-[15px]";

export function ProvasDoRepasse() {
  return (
    <section aria-label={PROVAS_DO_REPASSE.rotulo} className="border-b-2 border-mt-regua">
      <ol className="m-0 grid list-none p-0 lg:grid-cols-4">
        {PROVAS_DO_REPASSE.itens.map((prova) => (
          <li
            key={prova.numero}
            className="border-b border-mt-regua-fina px-[18px] py-6 last:border-b-0 lg:border-b-0 lg:border-r lg:px-7 lg:last:border-r-0"
          >
            <div className="mb-2.5 text-[11px] font-extrabold tracking-[.1em] text-mt-accent">{prova.numero}</div>
            <div className="text-[15px] font-extrabold tracking-[-.01em]">{prova.titulo}</div>
            <p className="m-0 mt-1.5 text-[13px] leading-snug text-mt-neutral-800">{prova.texto}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** O glossário da conta, e o quadro de exemplo com um carro de verdade do lote (decisão 19). */
export function ContaAberta({ exemplo }: { exemplo: Repasse | null }) {
  return (
    <section id={ANCORA_DA_CONTA} className={SECAO}>
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Rotulo accent>{CONTA_ABERTA.rotulo}</Rotulo>
          <h2 className={TITULO}>{CONTA_ABERTA.titulo}</h2>
          <dl className="m-0 mt-6 grid gap-4">
            {CONTA_ABERTA.termos.map((t) => (
              <div key={t.termo} className="border-t border-mt-regua-fina pt-3">
                <dt className="text-[14px] font-extrabold">{t.termo}</dt>
                <dd className="m-0 mt-1 text-[14px] leading-relaxed text-mt-neutral-800">{t.definicao}</dd>
              </div>
            ))}
          </dl>
          <p className={TEXTO}>{CONTA_ABERTA.nota}</p>
        </div>
        {exemplo && (
          <aside className="self-start border-2 border-mt-regua p-5">
            <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">
              {rotuloDoExemplo(
                nomeComAno({ marca: exemplo.marca, modelo: exemplo.modelo, versao: exemplo.versao, ano: exemplo.ano_modelo }),
              )}
            </p>
            <div className="mt-4">
              <ContaDoRepasse repasse={exemplo} variante="exemplo" />
            </div>
            {exemplo.sinistro_consta && exemplo.sinistro_detalhe && (
              <p className="m-0 mt-4 text-[13px] leading-snug text-mt-neutral-800">{notaDoSinistro(exemplo.sinistro_detalhe)}</p>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

export function RepasseOuEstoque() {
  const R = REPASSE_OU_ESTOQUE;
  return (
    <section className={SECAO}>
      <Rotulo accent>{R.rotulo}</Rotulo>
      <h2 className={TITULO}>{R.titulo}</h2>
      <p className={TEXTO}>{R.texto}</p>
      <div className="mt-foco mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label={R.titulo}>
        <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b-2 border-mt-regua text-[11px] tracking-[.12em] text-mt-neutral-600">
              <th scope="col" className="py-2 pr-4">
                <span className="sr-only">{R.rotulo}</span>
              </th>
              <th scope="col" className="py-2 pr-4 font-extrabold text-mt-accent">
                {R.colunaRepasse}
              </th>
              <th scope="col" className="py-2 font-extrabold">
                {R.colunaEstoque}
              </th>
            </tr>
          </thead>
          <tbody>
            {R.linhas.map((linha) => (
              <tr key={linha.tema} className="border-b border-mt-regua-fina align-top">
                <th scope="row" className="py-3 pr-4 font-extrabold">
                  {linha.tema}
                </th>
                <td className="py-3 pr-4">{linha.repasse}</td>
                <td className="py-3">{linha.estoque}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={`#${ANCORA_DO_LOTE}`} className="mt-btn mt-btn-tinta mt-foco">
          {R.verRepasse}
        </a>
        <Link href="/estoque" className="mt-btn mt-btn-contorno mt-foco">
          {R.verEstoque}
        </Link>
      </div>
    </section>
  );
}

export function ServeParaVoce() {
  const S = SERVE_PARA_VOCE;
  return (
    <section className={SECAO}>
      <Rotulo accent>{S.rotulo}</Rotulo>
      <h2 className={TITULO}>{S.titulo}</h2>
      <p className={TEXTO}>{S.texto}</p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em]">{S.serveRotulo}</p>
          <ul className="m-0 mt-3 grid gap-1.5 pl-5 text-[14px]">
            {S.serve.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="m-0 text-[11px] font-extrabold tracking-[.14em] text-mt-accent">{S.naoServeRotulo}</p>
          <ul className="m-0 mt-3 grid gap-1.5 pl-5 text-[14px]">
            {S.naoServe.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="mt-4">
            <LinkRegua href="/estoque">{S.link}</LinkRegua>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ComoComprar() {
  return (
    <section className={SECAO}>
      <Rotulo accent>{COMO_COMPRAR.rotulo}</Rotulo>
      <ol className="m-0 mt-6 grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-4">
        {COMO_COMPRAR.passos.map((passo) => (
          <li key={passo.numero} className="border-t-2 border-mt-regua pt-3">
            <div className="text-[11px] font-extrabold tracking-[.1em] text-mt-accent">{passo.numero}</div>
            <div className="mt-1 text-[16px] font-extrabold">{passo.titulo}</div>
            <p className="m-0 mt-1.5 text-[13px] leading-snug text-mt-neutral-800">{passo.texto}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * As onze perguntas, visíveis, e o `FAQPage` do grafo é a mesma lista. Sem
 * link automático no texto (decisão 27 do plano): o linkador ligaria "laudo
 * cautelar" à `/garantia`, a garantia que o repasse justamente não tem.
 *
 * O "PERGUNTAR NO WHATSAPP" passa pelo pré-cadastro, sem carro (28/09); sem
 * número da loja, o botão não aparece.
 */
export function PerguntasDoRepasse({ whatsappDaLoja }: { whatsappDaLoja: WhatsappDaLoja }) {
  const P = PERGUNTAS_DO_REPASSE_CABECALHO;
  return (
    <section className={SECAO}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Rotulo accent>{P.rotulo}</Rotulo>
          <h2 className={TITULO}>{P.titulo}</h2>
          <p className={TEXTO}>{P.texto}</p>
        </div>
        <WhatsAppDoRepasse
          assunto={{ carro: null }}
          whatsappDaLoja={whatsappDaLoja}
          origem="repasse-perguntas"
          className="mt-btn mt-btn-contorno mt-foco"
        >
          {P.botao}
        </WhatsAppDoRepasse>
      </div>
      <dl className="m-0 mt-6 max-w-[760px]">
        {PERGUNTAS_DO_REPASSE.map((p) => (
          <div key={p.pergunta} className="border-t border-mt-regua-fina py-4">
            <dt className="text-[15px] font-extrabold">{p.pergunta}</dt>
            <dd className="m-0 mt-1.5 text-[14px] leading-relaxed text-mt-neutral-800">{p.resposta}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
