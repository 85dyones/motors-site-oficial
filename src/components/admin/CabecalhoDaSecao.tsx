"use client";

import {
  REGUA_DESCRIPTION,
  TETO_DO_CAMPO,
  camposAlterados,
  podeSalvarCabecalho,
  podeVoltarAoPadrao,
  type CabecalhoNaTela,
} from "../../lib/salvarCabecalho";

/**
 * O bloco que edita o cabeçalho de `/guias` — sem estado próprio.
 *
 * Saiu de dentro do `EditorDeGuias` na quarta rodada de revisão, e a razão é
 * uma só: lá as travas ficavam INALCANÇÁVEIS por teste. O componente escolhe o
 * estado por `useState`, e no render de servidor `carregando` nasce `true` —
 * então os botões saem desabilitados de qualquer jeito, e apagar as guardas de
 * `cabecalhoLido` do `disabled` deixava a suíte inteira verde.
 *
 * Com o estado vindo por PROPS, cada combinação é um render, e `disabled`
 * aparece no markup estático (isso a revisão mediu — o que não aparece é
 * `onClick`). As decisões do bloco — o que libera cada botão — passam a ter
 * testemunha.
 *
 * A FIAÇÃO em `EditorDeGuias` — `onClick={aoSalvar}` e o
 * `setCabecalhoLido(r.cabecalhoLido)` que alimenta este `cabecalhoLido` — não
 * é assunto daqui, e tem arquivo próprio desde 07/09:
 * `tests/painel-de-guias-fiacao.test.ts`, em `jsdom`.
 */

const CAMPO =
  "w-full border border-mt-regua-fina bg-mt-bg px-3 py-2 text-[13px] text-mt-ink outline-none focus:border-mt-accent";
const BOTAO =
  "border border-mt-regua px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-ink hover:border-mt-accent disabled:opacity-40";

export interface CabecalhoDaSecaoProps {
  /** O que está NOS CAMPOS agora — o rascunho de quem edita. */
  cabecalho: CabecalhoNaTela;
  /**
   * O que foi LIDO do servidor. A diferença entre os dois é o que se grava.
   *
   * Sem isto o botão mandava a linha inteira, e um formulário em branco por
   * falha de leitura apagava o texto do ar. Ver `camposAlterados`.
   */
  carregado: CabecalhoNaTela;
  /** O texto do código, que vira `placeholder`. Campo em branco não é "sem texto". */
  padrao: CabecalhoNaTela;
  salvando: boolean;
  carregando: boolean;
  /**
   * Se a leitura deu certo.
   *
   * Governa DUAS coisas: se o "Voltar ao padrão" está disponível, e se a tela
   * avisa que os campos em branco são ignorância, não ausência de texto. As
   * duas saem da mesma pergunta — não dá para oferecer "apagar" nem para ficar
   * calado sobre um estado que não se conseguiu ler.
   */
  cabecalhoLido: boolean;
  aoMudar: (troca: Partial<CabecalhoNaTela>) => void;
  /** Devolve a seção ao texto do código — ação com nome próprio, e confirmada. */
  aoVoltarAoPadrao: () => void;
  aoSalvar: () => void;
}

export default function CabecalhoDaSecao({
  cabecalho,
  carregado,
  padrao,
  salvando,
  carregando,
  cabecalhoLido,
  aoMudar,
  aoVoltarAoPadrao,
  aoSalvar,
}: CabecalhoDaSecaoProps) {
  const passouDaRegua = cabecalho.resumo.length > REGUA_DESCRIPTION;
  const alteracoes = camposAlterados(cabecalho, carregado);

  return (
    <section className="border border-mt-regua p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="mt-titulo m-0 text-[16px]">Cabeçalho da seção</h2>
        <span className="text-[12px] text-mt-neutral-700">
          O que aparece no topo de <code>/guias</code> e na busca. Salvar manda só os campos
          que você mudou; esvaziar um campo e salvar devolve aquele campo ao texto padrão.
        </span>
      </div>

      <label className="mt-3 block text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-neutral-700">
        Título da aba e da busca
        <input
          className={`${CAMPO} mt-1 normal-case`}
          value={cabecalho.tituloSeo}
          placeholder={padrao.tituloSeo}
          maxLength={TETO_DO_CAMPO}
          onChange={(e) => aoMudar({ tituloSeo: e.target.value })}
        />
      </label>
      <p className="m-0 mt-1 text-[11px] text-mt-neutral-700">
        O site acrescenta <code>| Motors Store</code> no fim — não precisa repetir.
      </p>

      <label className="mt-3 block text-[11px] font-extrabold uppercase tracking-[.06em] text-mt-neutral-700">
        Parágrafo de abertura
        <textarea
          className={`${CAMPO} mt-1 min-h-[88px] normal-case`}
          value={cabecalho.resumo}
          placeholder={padrao.resumo}
          maxLength={TETO_DO_CAMPO}
          onChange={(e) => aoMudar({ resumo: e.target.value })}
        />
      </label>
      <p className="m-0 mt-1 text-[11px] text-mt-neutral-700">
        Aparece em quatro lugares: sob o título da página, no resultado do Google, no card do
        WhatsApp e no preview aqui do painel.{" "}
        {/* Contador, e não bloqueio: o teto do banco é 300 e a régua da busca é
            155. Recusar por três caracteres seria pior que uma description
            cortada — quem decide o texto é quem escreve. */}
        <span className={passouDaRegua ? "font-bold text-mt-accent" : ""}>
          {cabecalho.resumo.length}/{REGUA_DESCRIPTION} caracteres
          {passouDaRegua ? " — a busca pode cortar o fim." : ""}
        </span>
      </p>

      {!cabecalhoLido && !carregando && (
        // O aviso continua, e o texto mudou junto com o desenho: hoje ele não
        // anuncia uma trava, e sim o que os campos em branco significam. Salvar
        // aqui não apaga nada — só o que a pessoa DIGITAR é enviado —, mas
        // quem vê dois campos vazios precisa saber que isso não é "a seção
        // está sem texto".
        <p className="m-0 mt-3 border-l-[3px] border-mt-accent bg-mt-surface px-3 py-2 text-[12px] text-mt-neutral-800">
          Não consegui ler o cabeçalho que está no ar. Os campos acima estão vazios por isso — não
          porque a seção esteja sem texto. O que você escrever aqui será salvo normalmente, e os
          campos que não tocar ficam como estão no site.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={BOTAO}
          onClick={aoSalvar}
          // Habilitado quando há diferença entre o que foi lido e o que está
          // nos campos. Deixou de ser trava de segurança: o PUT manda só o que
          // mudou, então não há o que travar.
          disabled={!podeSalvarCabecalho({ salvando, carregando, alteracoes })}
        >
          Salvar cabeçalho
        </button>
        <button
          className={BOTAO}
          onClick={aoVoltarAoPadrao}
          disabled={!podeVoltarAoPadrao({ salvando, carregando, cabecalhoLido, carregado })}
        >
          Voltar ao padrão
        </button>
      </div>
    </section>
  );
}
