import { ANCORA_DA_FICHA_DE_ESTADO, ROTULOS_DA_CONTA, rotuloDaFipe, rotuloDaFipeNaFicha } from "../../lib/paginaDoRepasse";
import { contaDoRepasse, emReais, type Repasse } from "../../lib/repasse";

/**
 * A conta do repasse (spec §1): preço à vista, reparo orçado, "você gasta",
 * FIPE do mês e a diferença para a FIPE em reais. Três desenhos:
 *   - `card`: compacto, com "à vista, no estado";
 *   - `ficha`: em linhas, com o link para a ficha de estado e a FIPE nomeando
 *     a versão;
 *   - `exemplo`: em linhas, para os quadros "como ler" (herói e conta aberta).
 * A diferença só aparece quando o carro está ABAIXO da FIPE — acima dela, a
 * linha "abaixo" seria número negativo com rótulo que mente.
 */
export default function ContaDoRepasse({
  repasse: r,
  variante,
  carroNaFipe,
}: {
  repasse: Repasse;
  variante: "card" | "ficha" | "exemplo";
  /** Só na ficha: "Kwid Zen 1.0 2021", depois do mês da FIPE. */
  carroNaFipe?: string;
}) {
  const conta = contaDoRepasse(r);
  const comReparo = conta.reparoOrcado > 0;
  const abaixo = conta.abaixoDaFipe !== null && conta.abaixoDaFipe > 0 ? conta.abaixoDaFipe : null;
  const fipe =
    variante === "ficha" && carroNaFipe
      ? rotuloDaFipeNaFicha(r.fipe_mes_referencia, carroNaFipe)
      : rotuloDaFipe(r.fipe_mes_referencia);

  if (variante === "card") {
    return (
      <div className="mt-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[23px] font-extrabold tracking-[-.03em]">{emReais(conta.preco)}</span>
          <span className="text-[10px] text-mt-neutral-600">{ROTULOS_DA_CONTA.noEstado}</span>
        </div>
        <dl className="m-0 mt-1 grid grid-cols-[1fr_auto] gap-x-3 text-[12px]">
          {comReparo && (
            <>
              <dt className="text-mt-neutral-700">{ROTULOS_DA_CONTA.reparo}</dt>
              <dd className="m-0 text-right">{emReais(conta.reparoOrcado)}</dd>
              <dt className="text-mt-neutral-700">{ROTULOS_DA_CONTA.voceGasta}</dt>
              <dd className="m-0 text-right font-semibold">{emReais(conta.voceGasta)}</dd>
            </>
          )}
          {conta.fipe !== null && (
            <>
              <dt className="text-mt-neutral-700">{fipe}</dt>
              <dd className="m-0 text-right">{emReais(conta.fipe)}</dd>
            </>
          )}
          {abaixo !== null && (
            <>
              <dt className="font-semibold text-mt-accent-800">{ROTULOS_DA_CONTA.abaixoCurto}</dt>
              <dd className="m-0 text-right font-extrabold text-mt-accent-800">{emReais(abaixo)}</dd>
            </>
          )}
        </dl>
      </div>
    );
  }

  return (
    <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[14px]">
      <dt>{ROTULOS_DA_CONTA.preco}</dt>
      <dd className="m-0 text-right text-[18px] font-extrabold">{emReais(conta.preco)}</dd>
      {comReparo && (
        <>
          <dt>
            {ROTULOS_DA_CONTA.reparo}
            {variante === "ficha" && (
              <>
                {" "}
                <a href={`#${ANCORA_DA_FICHA_DE_ESTADO}`} className="mt-foco underline underline-offset-2">
                  {ROTULOS_DA_CONTA.verFicha}
                </a>
              </>
            )}
          </dt>
          <dd className="m-0 text-right">+ {emReais(conta.reparoOrcado)}</dd>
          <dt className="font-semibold">{ROTULOS_DA_CONTA.voceGasta}</dt>
          <dd className="m-0 text-right font-semibold">{emReais(conta.voceGasta)}</dd>
        </>
      )}
      {conta.fipe !== null && (
        <>
          <dt>{fipe}</dt>
          <dd className="m-0 text-right">{emReais(conta.fipe)}</dd>
        </>
      )}
      {abaixo !== null && (
        <>
          <dt className="font-extrabold text-mt-accent">{ROTULOS_DA_CONTA.abaixo}</dt>
          <dd className="m-0 text-right text-[18px] font-extrabold text-mt-accent">{emReais(abaixo)}</dd>
        </>
      )}
    </dl>
  );
}
