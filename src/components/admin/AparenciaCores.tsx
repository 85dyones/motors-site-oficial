"use client";

import Link from "next/link";
import { THEME_PRESETS } from "../../app/ThemeContext";
import {
  razaoDeContraste,
  nivelDeContraste,
  formatarRazao,
  type NivelDeContraste,
} from "../../lib/contraste";
import type { ThemeType, CompanySettings } from "../../types";

/**
 * Tela A2 do design doc do admin — aparência e cores.
 *
 * Antes deste arquivo, a troca de paleta morava no meio da aba
 * "Integrações & Webhooks" de `ConfiguracoesClientWrapper.tsx`, entre um
 * campo de webhook e a curadoria do carrossel. O doc abre com essa queixa:
 * conteúdo, aparência, financeiro e integrações dividiam uma tela só. Aqui
 * aparência vira domínio próprio.
 *
 * Três coisas que o doc desenha e que **não** estão implementadas, por
 * dependerem de recurso que não existe — nenhuma foi simulada na interface:
 *
 * - **Rascunho e publicação** ("Alteração não publicada", Descartar /
 *   Publicar). Hoje `setTheme` aplica no site na hora. Um rascunho exige
 *   guardar duas versões da paleta e decidir quem enxerga qual.
 * - **Histórico com reversão.** Não há tabela de auditoria de tema.
 * - **Escala de título** (Compacta / Padrão / Display). A escala tipográfica
 *   é fixa no CSS; o controle só faria sentido depois de tokenizá-la.
 *
 * O que é real e entrou: as paletas vêm de `THEME_PRESETS` (as quatro, não as
 * três que a tela antiga listava à mão — `motors-modernist`, que é a paleta
 * em produção, ficava de fora e não dava para selecionar de volta), e o
 * contraste é calculado pela fórmula da WCAG em `lib/contraste.ts`.
 */

interface AparenciaCoresProps {
  theme: ThemeType;
  setTheme: (t: ThemeType) => void;
  companySettings: CompanySettings;
  aoAbrirDadosDaEmpresa: () => void;
}

/** Nome e descrição de cada preset. O `id` é a chave de `THEME_PRESETS`. */
const DESCRICAO_DAS_PALETAS: Record<ThemeType, { nome: string; descricao: string }> = {
  "motors-modernist": {
    nome: "Modernist",
    descricao: "Vermelho sobre papel claro. É a paleta do redesign 2026.",
  },
  "luxury-light": {
    nome: "Luxury Claro",
    descricao: "Laranja queimado sobre branco, com cartões brancos.",
  },
  "stealth-dark": {
    nome: "Stealth Carbon",
    descricao: "Fundo carvão com dourado. Única paleta escura por padrão.",
  },
  "sport-nardo": {
    nome: "Sport Nardo",
    descricao: "Grafite com vermelho de corrida, mais saturado.",
  },
};

/** Um papel de cor da paleta e o par contra o qual ele é medido. */
interface PapelDeCor {
  papel: string;
  token: keyof (typeof THEME_PRESETS)["motors-modernist"];
  contra: keyof (typeof THEME_PRESETS)["motors-modernist"];
  contraRotulo: string;
  uso: string;
}

const PAPEIS: PapelDeCor[] = [
  {
    papel: "Fundo",
    token: "--brand-background",
    contra: "--brand-foreground",
    contraRotulo: "sobre a tinta",
    uso: "Fundo de todas as páginas do site",
  },
  {
    papel: "Tinta",
    token: "--brand-foreground",
    contra: "--brand-background",
    contraRotulo: "sobre o fundo",
    uso: "Texto corrido, títulos e réguas",
  },
  {
    papel: "Acento",
    token: "--brand-primary",
    contra: "--brand-background",
    contraRotulo: "sobre o fundo",
    uso: "Botão primário, régua de destaque e preço",
  },
  {
    papel: "Acento pressionado",
    token: "--brand-primary-hover",
    contra: "--brand-background",
    contraRotulo: "sobre o fundo",
    uso: "Hover e estado pressionado do botão primário",
  },
  {
    papel: "Superfície",
    token: "--brand-card",
    contra: "--brand-foreground",
    contraRotulo: "sob a tinta",
    uso: "Cartão de veículo, campo de busca e blocos",
  },
  {
    papel: "Rodapé e cabeçalho",
    token: "--brand-footer-bg",
    contra: "--brand-background",
    contraRotulo: "sobre o fundo",
    uso: "Faixas invertidas do topo e do rodapé",
  },
];

/** Cor da etiqueta de contraste — vermelho só onde há problema de verdade. */
function estiloDoNivel(nivel: NivelDeContraste): string {
  switch (nivel) {
    case "AAA":
    case "AA":
      return "bg-mt-inverso-fundo text-mt-inverso";
    case "AA GRANDE":
      return "border border-mt-regua text-mt-neutral-800";
    case "INSUFICIENTE":
      return "bg-mt-accent text-mt-inverso";
  }
}

export default function AparenciaCores({
  theme,
  setTheme,
  companySettings,
  aoAbrirDadosDaEmpresa,
}: AparenciaCoresProps) {
  const ativa = THEME_PRESETS[theme];

  return (
    <div className="flex flex-col items-stretch xl:flex-row">
      {/* ─── Coluna de edição ─── */}
      <div className="min-w-0 flex-1 pb-10 xl:border-r-2 xl:border-mt-regua xl:pr-7">
        <h1 className="mt-titulo text-[36px]">Aparência</h1>
        <p className="mt-2 max-w-[520px] text-sm text-mt-neutral-800">
          As cores do site vêm de paletas aprovadas pela marca. Trocar a paleta troca todos
          os pontos de uso ao mesmo tempo — botões, réguas, destaques de preço e estados.
        </p>

        {/* — paletas — */}
        <section className="mt-regua mt-8 pt-5">
          <div className="mt-rotulo mb-3.5">Paleta da marca</div>
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(THEME_PRESETS) as ThemeType[]).map((id) => {
              const tokens = THEME_PRESETS[id];
              const meta = DESCRICAO_DAS_PALETAS[id];
              const selecionada = id === theme;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  aria-pressed={selecionada}
                  className={`mt-foco cursor-pointer p-3.5 text-left ${
                    selecionada ? "mt-cartao mt-cartao-ativo" : "mt-cartao"
                  }`}
                >
                  {/* Amostras: o fundo, a tinta, o acento e a superfície da
                      própria paleta — não do tema aplicado agora. */}
                  <div className="mb-3 flex gap-0.5">
                    {(
                      [
                        "--brand-background",
                        "--brand-foreground",
                        "--brand-primary",
                        "--brand-card",
                      ] as const
                    ).map((t) => (
                      <span
                        key={t}
                        className="h-9 flex-1 border border-mt-regua-fina"
                        style={{ background: tokens[t] }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mr-auto text-[13px] font-extrabold tracking-[-.01em]">
                      {meta.nome}
                    </span>
                    {selecionada && (
                      <span className="text-[10px] font-semibold tracking-[.1em] text-mt-accent">
                        ATIVA
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-mt-neutral-700">
                    {meta.descricao}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* — onde cada cor é usada — */}
        <section className="mt-regua mt-8 pt-5">
          <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
            <div className="mt-rotulo">Onde cada cor é usada</div>
            <span className="text-[11px] text-mt-neutral-700">
              Contraste verificado automaticamente
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="mt-tabela">
              <thead>
                <tr>
                  <th>Papel</th>
                  <th>Cor</th>
                  <th>Aplicação no site</th>
                  <th>Contraste</th>
                </tr>
              </thead>
              <tbody>
                {PAPEIS.map((p) => {
                  const hex = ativa[p.token];
                  const razao = razaoDeContraste(hex, ativa[p.contra]);
                  const nivel = razao === null ? null : nivelDeContraste(razao);
                  return (
                    <tr key={p.papel}>
                      <td className="font-semibold">{p.papel}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-[18px] w-[18px] shrink-0 border border-mt-regua"
                            style={{ background: hex }}
                          />
                          <span className="mt-num text-xs">{hex}</span>
                        </div>
                      </td>
                      <td className="text-mt-neutral-800">{p.uso}</td>
                      <td>
                        {razao === null || nivel === null ? (
                          <span className="text-xs text-mt-neutral-700">—</span>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-[.08em] ${estiloDoNivel(
                                nivel,
                              )}`}
                            >
                              {nivel} · <span className="mt-num">{formatarRazao(razao)}</span>
                            </span>
                            <span className="text-[10px] text-mt-neutral-700">
                              {p.contraRotulo}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 max-w-[560px] text-[11px] leading-relaxed text-mt-neutral-700">
            <strong>AA GRANDE</strong> significa 3:1 — o bastante para ícone, título grande e
            cromo de interface, e não para texto de parágrafo. É onde o acento do Modernist
            fica de propósito: vermelho em corpo pequeno sobre o papel claro não passa na
            norma, então texto corrido nunca usa a cor de acento.
          </p>
        </section>

        {/* — tipografia e marca — */}
        <section className="mt-regua mt-8 grid grid-cols-1 gap-8 pt-5 lg:grid-cols-2">
          <div>
            <div className="mt-rotulo mb-3.5">Tipografia</div>
            <label className="block text-[11px] font-semibold text-mt-neutral-700" htmlFor="fonte-familia">
              Família
            </label>
            <input
              id="fonte-familia"
              className="mt-campo-caixa mt-1"
              value="Archivo (marca)"
              readOnly
            />
            <p className="mt-2.5 text-[11px] leading-relaxed text-mt-neutral-700">
              A família é fixa: Archivo é a fonte da marca, carregada uma vez no layout. A
              escala de título ainda não é um token — enquanto não for, não há o que ajustar
              aqui sem mexer no CSS.
            </p>
          </div>

          <div>
            <div className="mt-rotulo mb-3.5">Logo e favicon</div>
            <div className="flex gap-2">
              <div className="flex h-[88px] flex-1 items-center justify-center border border-mt-regua-fina bg-mt-inverso-fundo p-2">
                {companySettings?.logoUrl ? (
                  <img
                    src={companySettings.logoUrl}
                    alt="Logo da loja"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] tracking-[.1em] text-mt-inverso-suave">
                    SEM LOGO
                  </span>
                )}
              </div>
              <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center border border-mt-regua-fina bg-mt-surface p-2">
                {companySettings?.faviconUrl ? (
                  <img
                    src={companySettings.faviconUrl}
                    alt="Favicon"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] tracking-[.1em] text-mt-neutral-600">
                    FAVICON
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-mt-neutral-700">
              O logo claro aparece no cabeçalho escuro do site. Os dois arquivos são enviados
              junto do resto do cadastro, em{" "}
              <button
                type="button"
                onClick={aoAbrirDadosDaEmpresa}
                className="mt-foco cursor-pointer font-semibold text-mt-accent underline underline-offset-2"
              >
                Dados da concessionária
              </button>{" "}
              — ficam salvos por lá para não existirem dois lugares gravando o mesmo campo.
            </p>
          </div>
        </section>
      </div>

      {/* ─── Preview ─── */}
      <aside className="mt-8 w-full shrink-0 bg-mt-surface p-6 xl:mt-0 xl:w-[452px]">
        <div className="mt-rotulo mb-4">Preview ao vivo</div>

        {/* Desenhado com os hexadecimais crus da paleta selecionada, e não com
            os tokens `--mt-*`: assim o quadro continua mostrando a paleta certa
            mesmo que o painel passe a ter rascunho e a página em volta ainda
            esteja na paleta antiga. */}
        <div
          className="border border-mt-regua-fina"
          style={{ background: ativa["--brand-background"] }}
        >
          <div
            className="flex h-[38px] items-center gap-2 px-3"
            style={{ background: ativa["--brand-footer-bg"] }}
          >
            <span
              className="h-[15px] w-[5px] shrink-0"
              style={{ background: ativa["--brand-primary"] }}
            />
            <span
              className="mr-auto text-[11px] font-extrabold"
              style={{ color: ativa["--brand-background"] }}
            >
              MOTORS STORE
            </span>
            <span
              className="px-2 py-1 text-[9px] font-extrabold tracking-[.08em]"
              style={{
                background: ativa["--brand-primary"],
                color: ativa["--brand-background"],
              }}
            >
              WHATSAPP
            </span>
          </div>

          <div
            className="relative flex h-[130px] items-end p-3"
            style={{ background: ativa["--brand-card"] }}
          >
            <div>
              <div
                className="mb-1 text-[9px] font-semibold tracking-[.16em]"
                style={{ color: ativa["--brand-primary"] }}
              >
                CURITIBA · PREMIUM
              </div>
              <div
                className="text-[30px] font-extrabold leading-[.9] tracking-[-.04em]"
                style={{ color: ativa["--brand-foreground"] }}
              >
                FORA
                <br />
                DA CURVA
              </div>
            </div>
          </div>

          <div
            className="flex border-b-2"
            style={{ borderColor: ativa["--brand-foreground"] }}
          >
            <div
              className="flex-1 px-3 py-2.5 text-[11px] font-semibold"
              style={{ color: ativa["--brand-foreground"] }}
            >
              Todas as marcas
            </div>
            <div
              className="flex items-center px-4 py-2.5 text-[10px] font-extrabold tracking-[.1em]"
              style={{
                background: ativa["--brand-primary"],
                color: ativa["--brand-background"],
              }}
            >
              BUSCAR
            </div>
          </div>

          <div className="p-3">
            <div
              className="aspect-[16/10] w-full"
              style={{ background: ativa["--brand-card"] }}
            />
            <div
              className="mt-2.5 border-t-2 pt-2"
              style={{ borderColor: ativa["--brand-foreground"] }}
            >
              <div
                className="text-[9px] font-semibold tracking-[.16em]"
                style={{ color: ativa["--brand-primary"] }}
              >
                LAND ROVER
              </div>
              <div
                className="mt-0.5 text-base font-extrabold tracking-[-.02em]"
                style={{ color: ativa["--brand-foreground"] }}
              >
                Range Rover Evoque
              </div>
              <div className="mt-2 flex items-end justify-between">
                <span
                  className="text-xl font-extrabold tracking-[-.03em]"
                  style={{ color: ativa["--brand-foreground"] }}
                >
                  R$ 289.900
                </span>
                <span
                  className="px-1.5 py-0.5 text-[10px] font-extrabold tracking-[.08em]"
                  style={{
                    background: ativa["--brand-primary"],
                    color: ativa["--brand-background"],
                  }}
                >
                  5% ABAIXO DA FIPE
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-mt-neutral-700">
          O quadro é uma amostra dos pontos de uso, com números de exemplo. Para conferir no
          site de verdade,{" "}
          <Link href="/" target="_blank" className="font-semibold text-mt-accent underline underline-offset-2">
            abra a home numa aba nova
          </Link>{" "}
          — a troca de paleta já vale lá na hora, sem publicar.
        </p>
      </aside>
    </div>
  );
}
