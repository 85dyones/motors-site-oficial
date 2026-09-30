import Image from "next/image";
import Link from "next/link";
import { ehFotoPropria } from "../../lib/fotosDoVeiculo";
import { grafiaDoCarro } from "../../lib/grafiaCanonica";
import { nomeComAno } from "../../lib/nomeDoVeiculo";
import { CAMINHO_DO_REPASSE, abaixoDaFipeNaBarra } from "../../lib/paginaDoRepasse";
import { contaDoRepasse, emReais, etiquetaDoRepasse, type Repasse } from "../../lib/repasse";
import { Etiqueta } from "../modernist/primitivos";

/**
 * O card simplificado das portas (prancha "Portas de entrada", seção 3):
 * foto, etiqueta, carro e ano, preço à vista e "R$ X abaixo da FIPE". Sem a
 * conta inteira e sem WhatsApp, que ficam no card do lote e na ficha (decisão
 * 4 do plano do PR 4). O card inteiro é um link para a ficha.
 *
 * Só recebe carro aberto a todos: quem escolhe é `faixaNaHome`.
 */
export default function CardDaFaixa({ repasse: r }: { repasse: Repasse }) {
  const foto = r.web_full_images[0] ?? r.whatsapp_images[0];
  const etiqueta = etiquetaDoRepasse(r);
  const { abaixoDaFipe } = contaDoRepasse(r);
  // A mesma guarda da conta e da barra da ficha: sem FIPE, ou acima dela, a
  // linha some. Diferença negativa "abaixo da FIPE" seria rótulo que mente.
  const abaixo = abaixoDaFipe !== null && abaixoDaFipe > 0 ? abaixoDaFipe : null;
  // Marca, modelo e ano, sem a versão: "Fiat Argo 2019", como a prancha. Na
  // grafia da casa, como a ficha e o card do lote (29/09): o cadastro em
  // maiúsculas dava "FIAT PALIO 2010".
  const naGrafia = grafiaDoCarro(r);
  const nome = nomeComAno({ marca: naGrafia.marca, modelo: naGrafia.modelo, versao: null, ano: r.ano_modelo });

  return (
    <Link href={`${CAMINHO_DO_REPASSE}/${r.slug}`} className="mt-foco flex h-full flex-col bg-mt-bg text-mt-ink no-underline">
      <span className="relative block aspect-[4/3] bg-mt-neutral-300">
        {foto ? (
          // `alt=""`: o nome do carro já é o texto do link, logo abaixo, e
          // repeti-lo faria o leitor de tela dizê-lo duas vezes.
          <Image
            src={foto}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 20vw"
            unoptimized={ehFotoPropria(foto)}
            className="object-cover"
          />
        ) : null}
        <Etiqueta accent={etiqueta === "COM LAUDO"} className="pointer-events-none absolute left-0 top-0 text-[11px]">
          {etiqueta}
        </Etiqueta>
      </span>
      <span className="block p-3">
        <span className="block text-[15px] font-extrabold leading-tight tracking-[-.01em]">{nome}</span>
        <span className="mt-1 block text-[14px] font-extrabold">{emReais(r.preco)}</span>
        {abaixo !== null && (
          <span className="mt-0.5 block text-[11px] font-semibold text-mt-accent-800">
            {abaixoDaFipeNaBarra(emReais(abaixo))}
          </span>
        )}
      </span>
    </Link>
  );
}
