import Image from "next/image";
import Link from "next/link";
import { ehFotoPropria } from "../../lib/fotosDoVeiculo";
import { grafiaDoCarro } from "../../lib/grafiaCanonica";
import { carroDoWhatsApp } from "../../lib/leadDoRepasse";
import type { WhatsappDaLoja } from "../../lib/loteDoRepasse";
import {
  ANCORA_DA_FICHA_DE_ESTADO,
  ANCORA_DA_LISTA,
  ANCORA_DA_LISTA_LOJISTA,
  CAMINHO_DO_REPASSE,
  CARD_DO_REPASSE,
  anosDoCarro,
  contagemDeFotos,
  linhaDoHistoricoNoCard,
} from "../../lib/paginaDoRepasse";
import { estadoDoRepasse, etiquetaDoRepasse, type Repasse } from "../../lib/repasse";
import { Etiqueta, formatarKm } from "../modernist/primitivos";
import ContaDoRepasse from "./ContaDoRepasse";
import WhatsAppDoRepasse from "./WhatsAppDoRepasse";

/**
 * O card do repasse (prancha "Card do repasse e estados"). Quatro estados:
 *   - aberto a todos: etiqueta (com laudo, sem laudo, reparo orçado) e
 *     "QUERO ESTE REPASSE", que abre o pré-cadastro e depois o WhatsApp com
 *     a referência do carro (`WhatsAppDoRepasse`, 28/09);
 *   - só para lojistas: a camada, "CADASTRAR MEU CNPJ" e "AVISE QUANDO ABRIR
 *     PARA TODOS" — sem WhatsApp (decisão 4);
 *   - reservado e vendido: a camada e a lista do repasse, preço apagado.
 * Todo card leva "VER A FICHA DE ESTADO". O card não tem estado de React:
 * desenha igual no servidor ("já saíram") e dentro da ilha do lote; quem tem
 * estado é o botão do WhatsApp, que é ilha própria.
 */
export default function CardDoRepasse({
  repasse: r,
  whatsappDaLoja,
  prioridade = false,
}: {
  repasse: Repasse;
  whatsappDaLoja: WhatsappDaLoja;
  prioridade?: boolean;
}) {
  const estado = estadoDoRepasse(r);
  if (!estado) return null;

  const ficha = `${CAMINHO_DO_REPASSE}/${r.slug}`;
  // O nome na grafia da casa, como a ficha (29/09): o cadastro em maiúsculas
  // punha "PALIO" e "1.0 ECONOMY FIRE FLEX 8V 4P" no card.
  const naGrafia = grafiaDoCarro(r);
  const foto = r.web_full_images[0] ?? r.whatsapp_images[0];
  const defeitos = r.itens_de_estado.filter((item) => item.foto).length;
  const totalDeFotos = r.web_full_images.length + defeitos;
  const etiqueta = etiquetaDoRepasse(r);
  const camada =
    estado === "lojistas" ? CARD_DO_REPASSE.soLojistas : estado === "reservado" ? CARD_DO_REPASSE.reservado : estado === "vendido" ? CARD_DO_REPASSE.vendido : null;

  return (
    <article className="flex flex-col">
      <Link href={ficha} className="mt-foco relative block aspect-[4/3] bg-mt-neutral-300">
        {foto ? (
          <Image
            src={foto}
            alt={[naGrafia.marca, naGrafia.modelo, naGrafia.versao].filter(Boolean).join(" ")}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            priority={prioridade}
            unoptimized={ehFotoPropria(foto)}
            className="object-cover"
          />
        ) : null}
        {estado === "aberto" && (
          <Etiqueta accent={etiqueta === "COM LAUDO"} className="pointer-events-none absolute left-0 top-0 text-[11px]">
            {etiqueta}
          </Etiqueta>
        )}
        {totalDeFotos > 0 && (
          <span className="pointer-events-none absolute bottom-0 right-0 bg-[rgba(20,18,18,.82)] px-2 py-1 text-[11px] font-semibold text-mt-inverso">
            {contagemDeFotos(totalDeFotos, defeitos)}
          </span>
        )}
        {camada && (
          <span className="absolute inset-0 flex flex-col items-start justify-end bg-[rgba(20,18,18,.72)] p-4 text-mt-inverso">
            <span className="text-[11px] font-extrabold tracking-[.14em]">{camada}</span>
            {estado === "lojistas" && <span className="mt-1 text-[13px]">{CARD_DO_REPASSE.soLojistasTexto}</span>}
          </span>
        )}
      </Link>

      <div className="mt-3 border-t-2 border-mt-regua pt-2.5">
        <div className="text-[11px] font-semibold tracking-[.16em] text-mt-accent">{r.marca.toUpperCase()}</div>
        <Link href={ficha} className="mt-foco block text-mt-ink no-underline">
          <span className="mt-0.5 block text-[19px] font-extrabold leading-tight tracking-[-.02em]">{naGrafia.modelo}</span>
          {naGrafia.versao && <span className="block text-xs text-mt-neutral-700">{naGrafia.versao}</span>}
        </Link>
        <div className="mt-2 flex gap-2 border-t border-mt-regua-fina pt-2 text-[11px] tracking-[.05em] text-mt-neutral-600">
          <span>{anosDoCarro(r)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatarKm(r.quilometragem)}</span>
          {r.cambio && (
            <>
              <span aria-hidden="true">·</span>
              <span>{r.cambio}</span>
            </>
          )}
        </div>
        {r.resumo && <p className="m-0 mt-2 text-[13px] leading-snug text-mt-neutral-800">{r.resumo}</p>}
        <div className={camada && estado !== "lojistas" ? "opacity-60" : ""}>
          <ContaDoRepasse repasse={r} variante="card" />
        </div>
        <p className="m-0 mt-2 text-[11px] leading-snug text-mt-neutral-700">{linhaDoHistoricoNoCard(r)}</p>
        <div className="mt-3 flex flex-col items-start gap-3">
          {estado === "aberto" && (
            <WhatsAppDoRepasse assunto={{ carro: carroDoWhatsApp(r), estado }} whatsappDaLoja={whatsappDaLoja} origem="repasse-card">
              {CARD_DO_REPASSE.quero}
            </WhatsAppDoRepasse>
          )}
          {/* Âncora da lista é <a> puro: o card mora no próprio /repasse, e o
              next/link resolveria o hash por pushState, sem `hashchange` — a
              lista não trocaria de trilha (final-review I1, 25/09). */}
          {estado === "lojistas" && (
            <>
              <a href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA_LOJISTA}`} className="mt-btn mt-btn-tinta mt-foco">
                {CARD_DO_REPASSE.cadastrarCnpj}
              </a>
              <a href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA}`} className="mt-link-regua mt-foco">
                {CARD_DO_REPASSE.aviseQuandoAbrir}
              </a>
            </>
          )}
          {estado === "reservado" && (
            <a href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA}`} className="mt-link-regua mt-foco">
              {CARD_DO_REPASSE.aviseSeVoltar}
            </a>
          )}
          {estado === "vendido" && (
            <a href={`${CAMINHO_DO_REPASSE}#${ANCORA_DA_LISTA}`} className="mt-link-regua mt-foco">
              {CARD_DO_REPASSE.entrarNaLista}
            </a>
          )}
          <Link href={`${ficha}#${ANCORA_DA_FICHA_DE_ESTADO}`} className="mt-link-regua mt-foco">
            {CARD_DO_REPASSE.verFicha}
          </Link>
        </div>
      </div>
    </article>
  );
}
