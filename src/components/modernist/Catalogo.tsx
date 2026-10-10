"use client";

import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { QuickTag, StockOverrides, Veiculo } from "../../types";
import { getVeiculoPdpUrl } from "../../lib/supabase";
import {
  checkTagMatchesVehicle,
  precoVigente,
  resolveTipoCombustivel,
} from "../../lib/regrasEstoque";
import { slugifyTag } from "../../lib/tagUtils";
import {
  ajustarFaixa,
  catalogoDeOpcionais,
  dentroDaFaixa,
  enderecoComFiltro,
  estadoDaUrl,
  limitesDaRegua,
  rotuloDaFaixa,
  SEM_FAIXA,
  temTodosOsOpcionais,
  type Faixa,
  type Ordenacao,
} from "../../lib/filtrosDoEstoque";
import {
  CAIXA_DA_BUSCA,
  casaComABusca,
  chipDaBusca,
  CONTAINER_DA_BUSCA,
  EXEMPLO_DA_BUSCA,
  mensagemDeVitrineVazia,
  mostrarLimparTudo,
  painelDeFiltro,
  rotuloDosResultados,
  termosDaBusca,
} from "../../lib/vitrine";
import CampoDeOpcionais from "./CampoDeOpcionais";
import FaixaComCaixas, { PontaDaFaixa } from "./FaixaComCaixas";
import { CardVeiculo, formatarKm, formatarPreco } from "./primitivos";
import Hodometro from "./Hodometro";

/**
 * Catálogo — tela 02 do design doc.
 *
 * Coluna de filtros em régua, densidade alta, sem cartão flutuante. Filtrar
 * aqui é ordenar o que já está à vista: o rótulo com a contagem total e o
 * botão de limpar ficam sempre visíveis, e nenhum filtro remove o caminho de
 * volta para o estoque inteiro.
 *
 * No celular a coluna vira um bloco empilhado ACIMA do primeiro carro — o
 * cliente rolava a lista de filtros inteira antes de ver a vitrine. Desde
 * 2026-09-04 ela nasce recolhida atrás de um botão, e só abaixo do `lg`: no
 * desktop o filtro continua sendo a coluna da esquerda, sem botão nenhum. A
 * regra desse par vive em `lib/vitrine.ts`, com teste de comportamento.
 */

const PAGINA = 9;

/**
 * O passo das réguas de preço e de quilometragem.
 *
 * É só o passo do ARRASTE: as caixas embaixo de cada régua aceitam o número
 * exato. Com o estoque de 28/09 (R$ 26.900 a R$ 318.900), dá 59 posições no
 * preço — fino o bastante para o dedo, sem virar um trilho de mil paradas.
 */
const PASSO_DO_PRECO = 5000;
const PASSO_DO_KM = 5000;

/** As três faixas do painel, num estado só: mudam juntas no "limpar tudo". */
interface Faixas {
  preco: Faixa;
  km: Faixa;
  ano: Faixa;
}

const SEM_FAIXAS: Faixas = { preco: SEM_FAIXA, km: SEM_FAIXA, ano: SEM_FAIXA };

/** O chip de uma faixa, ou nenhum quando ela não filtra. */
function chipDaFaixa(chave: keyof Faixas, faixa: Faixa, formatar: (n: number) => string) {
  const rotulo = rotuloDaFaixa(faixa, formatar);
  return rotulo ? [{ chave, valor: "", rotulo }] : [];
}

const ORDENACOES: { id: Ordenacao; rotulo: string }[] = [
  { id: "recentes", rotulo: "MAIS RECENTES" },
  { id: "menor-preco", rotulo: "MENOR PREÇO" },
  { id: "menor-km", rotulo: "MENOR KM" },
];

interface GrupoFiltro {
  chave: string;
  titulo: string;
  opcoes: { valor: string; rotulo: string; total: number }[];
  /** Quantas opções mostrar antes do "VER TODAS". */
  limite: number;
}

/**
 * Quantas opções um grupo mostra antes do "VER TODAS".
 *
 * Até 28/09 era um CORTE, sem caminho para o resto: medido no ar naquele dia,
 * MARCA mostrava 8 das 14 marcas, e Mercedes-Benz, Kia, Hyundai, Toyota,
 * Peugeot e Mitsubishi não tinham caixa nenhuma — a vitrine escondendo carro,
 * o que a regra 6 do CLAUDE.md proíbe. O mesmo corte já tinha escondido os
 * anos de 2014 para trás em 16/09. Agora o grupo abre inteiro num botão, e a
 * opção marcada fica à vista mesmo com ele fechado.
 */
const LIMITE_DE_OPCOES_NO_PAINEL = 8;

export default function Catalogo({
  estoque,
  quickTags,
  stockOverrides,
}: {
  estoque: Veiculo[];
  quickTags: QuickTag[];
  stockOverrides: StockOverrides;
}) {
  const searchParams = useSearchParams();

  // O endereço é o estado inicial: a busca da home, o link de campanha ou de
  // atendimento ("Onix automático até 80 mil"), e o botão voltar depois de
  // abrir uma ficha. Lido UMA vez; daqui em diante quem escreve no endereço é
  // o efeito lá embaixo, e não o contrário.
  const [inicial] = useState(() => estadoDaUrl(searchParams));
  const [selecionados, setSelecionados] = useState<Record<string, string[]>>(inicial.selecionados);
  const [faixas, setFaixas] = useState<Faixas>({
    preco: inicial.preco,
    km: inicial.km,
    ano: inicial.ano,
  });
  const [opcionais, setOpcionais] = useState<string[]>(inicial.opcionais);
  const [ordem, setOrdem] = useState<Ordenacao>(inicial.ordem);
  const [visiveis, setVisiveis] = useState(PAGINA);
  const [busca, setBusca] = useState(inicial.busca);
  const termos = useMemo(() => termosDaBusca(busca), [busca]);
  // Grupos abertos no "VER TODAS". Estado de tela, não de filtro: não vai
  // para o endereço.
  const [gruposAbertos, setGruposAbertos] = useState<string[]>([]);
  // Recolhido é o estado inicial, e é o mesmo nos dois lados da hidratação:
  // nada aqui mede a janela. Quem está no desktop nunca vê diferença — lá o
  // painel não obedece a este estado.
  const [filtroAberto, setFiltroAberto] = useState(false);
  const botaoDoFiltro = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLElement>(null);
  const fecharDaFolha = useRef<HTMLButtonElement>(null);
  const botaoVerVeiculos = useRef<HTMLButtonElement>(null);
  /** A mesma condição do `@media` de `.mt-folha` (modernist.css). */
  const MIDIA_DA_FOLHA = "(width < 64rem)";
  const folhaNaTela = () =>
    typeof window !== "undefined" && window.matchMedia(MIDIA_DA_FOLHA).matches;
  const campoDeBusca = useRef<HTMLInputElement>(null);
  const regiaoDeResultados = useRef<HTMLDivElement>(null);

  /**
   * Fecha o painel e devolve o foco ao alternador.
   *
   * O botão de fechar vive DENTRO do `<aside>` que ele faz virar
   * `display:none`. Sem esta linha, quem chega nele por teclado ou leitor de
   * tela some com o próprio elemento focado: o foco cai no `<body>` e o Tab
   * seguinte recomeça do topo do documento (WCAG 2.4.3). Achado na revisão de
   * 2026-09-04.
   *
   * O `Header` não sofre disso porque lá quem fecha é o próprio alternador,
   * que continua montado. Aqui são dois elementos, e um deles desaparece.
   */
  const fecharFiltro = () => {
    setFiltroAberto(false);
    botaoDoFiltro.current?.focus();
  };

  /**
   * Zera os filtros e leva o foco para a região de resultados.
   *
   * Fecha a tarefa que ficou aberta em 2026-09-04: os TRÊS botões que limpam
   * — o `LIMPAR (N)` do topo do painel, o `LIMPAR TUDO` da régua de chips e o
   * `VER TODO O ESTOQUE` do estado vazio — tornam falsa a própria condição de
   * renderização e saem do DOM levando o foco de quem os acionou para o
   * `<body>` (WCAG 2.4.3).
   *
   * Desde a 3.5 (29/09), o `LIMPAR (N)` passa antes por `limparDoPainel`: com
   * a folha do celular aberta, a grade fica coberta e o foco vai para o "VER N
   * VEÍCULOS", dentro da folha. Fora dela, cai aqui como os outros dois.
   *
   * `botaoDoFiltro` não servia de destino, que foi o motivo de o conserto ter
   * sido adiado. Ele é o "FILTROS", que tem `SO_NO_CELULAR`: no desktop é
   * `display:none`, e `.focus()` em elemento escondido não faz nada e não
   * devolve erro. Dois destes três aparecem NAS DUAS LARGURAS — medido a
   * 1440px, mandar para lá deixa o `activeElement` no `<body>` do mesmo jeito.
   * Consertaria o celular e esconderia o desktop, com a suíte verde.
   *
   * O terceiro (`LIMPAR TUDO`) é só do celular e chegou a usar o alternador,
   * que ali de fato está na tela. Veio para cá mesmo assim: aquele caminho
   * move o foco para TRÁS, para fora da região que acabou de mudar, e anuncia
   * a contagem velha (ver o `flushSync` abaixo). Mesma ação, mesmo destino.
   *
   * `fecharFiltro` fica de fora, e de propósito: fechar um disclosure e
   * devolver o foco ao alternador que o abriu é outro gesto, e lá o alternador
   * é o lugar certo — não há nada de novo para anunciar.
   *
   * O destino é a grade, que existe nas duas larguras e é o que acabou de
   * mudar: nomeada como região, ela também anuncia o estoque de volta para
   * quem usa leitor de tela, em vez de só não perder o foco.
   *
   * `flushSync` e não `limparTudo()` solto. O React agenda o estado e devolve o
   * controle ANTES de repintar, então o `.focus()` da linha seguinte
   * aconteceria com a região ainda carregando o nome velho — e o nome é lido no
   * instante do foco, não depois. Sem o despacho, quem limpa a partir do estado
   * vazio ouve "Resultados: 0 veículos" no exato momento em que os 36 voltaram
   * para a tela.
   */
  const limparTudoComFocoNosResultados = () => {
    flushSync(() => limparTudo());
    regiaoDeResultados.current?.focus();
  };

  /**
   * O `LIMPAR (N)` do topo do painel, que no celular está DENTRO da folha.
   *
   * Com a folha aberta, a região de resultados fica atrás dela e do fundo
   * escurecido: mandar o foco para lá o deixava invisível, e o leitor de tela
   * ia parar no fundo da página (WCAG 2.4.3). Aberta, o destino é o "VER N
   * VEÍCULOS", que continua na folha e já diz a contagem nova. Fechada (ou no
   * desktop, onde o painel é coluna), vale a regra de cima.
   */
  const limparDoPainel = () => {
    if (filtroAberto && folhaNaTela()) {
      flushSync(() => limparTudo());
      botaoVerVeiculos.current?.focus();
      return;
    }
    limparTudoComFocoNosResultados();
  };

  /**
   * A folha de filtros do celular (tarefa 3.5): foco preso nela, Esc fecha,
   * a página por trás não rola, e o foco volta ao "FILTROS" ao fechar
   * (`fecharFiltro`).
   *
   * Tudo isso só vale ABAIXO do `lg`, onde o painel aberto é uma folha. No
   * desktop o mesmo `<aside>` é a coluna da esquerda e nada disso pode agir —
   * por isso a pergunta à mídia, e não só ao `filtroAberto`. Quem abre no
   * celular e gira o tablet até passar do `lg` vê a folha fechar sozinha.
   */
  useEffect(() => {
    if (!filtroAberto || typeof window === "undefined") return;
    const celular = window.matchMedia(MIDIA_DA_FOLHA);
    if (!celular.matches) return;

    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Semântica de diálogo só enquanto é folha: no desktop o mesmo `<aside>`
    // é a coluna da esquerda. A trava de Tab abaixo depende de teclado; é
    // `aria-modal` que segura o leitor de tela de deslizar para a grade coberta.
    const aside = painel.current;
    aside?.setAttribute("role", "dialog");
    aside?.setAttribute("aria-modal", "true");
    fecharDaFolha.current?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      // Um Esc já consumido (a lista de sugestões dos opcionais) ou no meio de
      // uma composição de teclado não é para a folha.
      if (e.defaultPrevented || e.isComposing || !painel.current) return;
      // Outra camada por cima da folha (o pop-up de captura, o aviso de
      // cookies) tem o foco: a folha não rouba o Tab nem fecha com o Esc dela.
      const dentro = painel.current.contains(document.activeElement);
      if (!dentro && document.activeElement !== document.body) return;
      if (e.key === "Escape") {
        e.preventDefault();
        fecharFiltro();
        return;
      }
      if (e.key !== "Tab") return;
      const focaveis = [
        ...painel.current.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        ),
        // Só o que está desenhado: `getClientRects` vem vazio para o que
        // tem `display:none` em si ou num ancestral (o "FILTROS" do desktop,
        // a opção de um grupo recolhido).
      ].filter((el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0);
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && (document.activeElement === primeiro || !dentro)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    // Passou do `lg` com a folha aberta: fecha, e o foco — que estava no X,
    // agora `lg:hidden` — vai para a grade, que existe nas duas larguras.
    const aoMudarLargura = (e: MediaQueryListEvent) => {
      if (e.matches) return;
      const focoNaFolha = painel.current?.contains(document.activeElement) ?? false;
      setFiltroAberto(false);
      if (focoNaFolha) regiaoDeResultados.current?.focus();
    };
    document.addEventListener("keydown", aoTeclar);
    celular.addEventListener("change", aoMudarLargura);
    return () => {
      document.body.style.overflow = antes;
      aside?.removeAttribute("role");
      aside?.removeAttribute("aria-modal");
      document.removeEventListener("keydown", aoTeclar);
      celular.removeEventListener("change", aoMudarLargura);
    };
  }, [filtroAberto]);

  const alternar = (chave: string, valor: string) => {
    setSelecionados((prev) => {
      const atuais = prev[chave] ?? [];
      const proximos = atuais.includes(valor)
        ? atuais.filter((v) => v !== valor)
        : [...atuais, valor];
      const copia = { ...prev };
      if (proximos.length === 0) delete copia[chave];
      else copia[chave] = proximos;
      return copia;
    });
    setVisiveis(PAGINA);
  };

  const limparTudo = () => {
    setSelecionados({});
    setFaixas(SEM_FAIXAS);
    setOpcionais([]);
    setBusca("");
    setVisiveis(PAGINA);
  };

  const mudarFaixa = (qual: keyof Faixas, faixa: Faixa) => {
    setFaixas((atuais) => ({ ...atuais, [qual]: faixa }));
    setVisiveis(PAGINA);
  };

  const alternarGrupo = (chave: string) =>
    setGruposAbertos((abertos) =>
      abertos.includes(chave) ? abertos.filter((c) => c !== chave) : [...abertos, chave],
    );

  const valorDoCampo = (v: Veiculo, chave: string): string => {
    switch (chave) {
      case "marca":
        return v.marca ?? "";
      case "modelo":
        return v.modelo ?? "";
      case "ano":
        return String(v.ano ?? "");
      case "cambio":
        return v.cambio ?? "";
      case "carroceria":
        return v.tipo ?? "";
      case "combustivel":
        return resolveTipoCombustivel(v);
      default:
        return "";
    }
  };

  const passaNosFiltros = (v: Veiculo, ignorar?: string): boolean => {
    for (const [chave, valores] of Object.entries(selecionados)) {
      if (chave === ignorar || valores.length === 0) continue;
      if (chave === "destaque") {
        const casa = valores.some((slug) => {
          const tag = quickTags.find((t) => (slugifyTag(t.name) || t.id) === slug);
          return tag ? checkTagMatchesVehicle(tag, v, stockOverrides) : false;
        });
        if (!casa) return false;
      } else if (!valores.includes(valorDoCampo(v, chave))) {
        return false;
      }
    }
    if (ignorar !== "preco" && !dentroDaFaixa(precoVigente(v), faixas.preco)) return false;
    if (ignorar !== "km" && !dentroDaFaixa(v.quilometragem, faixas.km)) return false;
    if (ignorar !== "ano" && !dentroDaFaixa(v.ano, faixas.ano)) return false;
    if (ignorar !== "opcional" && !temTodosOsOpcionais(v, opcionais)) return false;
    // A busca vale também para a contagem ao lado de cada caixa: digitar
    // "onix" e continuar vendo "MARCA · FIAT (7)" seria a lista mentindo
    // sobre o que ela vai mostrar.
    //
    // E ela NÃO honra `ignorar`, de propósito: `ignorar` serve para um grupo
    // do painel não zerar a própria contagem, e a busca não é um grupo — não
    // há caixa marcada para desconsiderar. Ninguém passa `"busca"` hoje; quem
    // passar amanhã recebe a contagem com a busca aplicada, que é o certo.
    if (!casaComABusca(v, termos)) return false;
    return true;
  };

  /** Contagem por opção calculada ignorando o próprio grupo, para o número
      ao lado do rótulo não zerar assim que o usuário marca uma caixa. */
  const { grupos, anos, opcoesDeOpcional } = useMemo(() => {
    const contar = (chave: string) => {
      const base = estoque.filter((v) => passaNosFiltros(v, chave));
      const mapa = new Map<string, number>();
      for (const v of base) {
        const valor = valorDoCampo(v, chave);
        if (!valor) continue;
        mapa.set(valor, (mapa.get(valor) ?? 0) + 1);
      }
      return [...mapa.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([valor, total]) => ({ valor, rotulo: valor, total }));
    };

    /**
     * ANO usa a MESMA contagem de `contar("ano")` — ela já ignora a própria
     * faixa e respeita os demais filtros marcados — mas reordena o resultado
     * por valor numérico decrescente.
     *
     * `contar` ordena por popularidade (a contagem, decrescente), o padrão
     * certo para MARCA, CÂMBIO e COMBUSTÍVEL. Ano-modelo é campo numérico, e
     * o dono pediu "igual à home": lista única, ordem decrescente de ano — não
     * de popularidade, e não alfabética, que compara caractere a caractere e
     * poria "2019" depois de "2107" e antes de "2020".
     *
     * A ponta escolhida entra mesmo sem carro (um `?ano=1999` num link
     * velho): sem ela, a lista mostraria "Mais antigo" com a vitrine vazia, e
     * a pessoa não teria como ver o que está filtrando.
     */
    const anosComCarro = contar("ano");
    const pontas = [faixas.ano.min, faixas.ano.max]
      .filter((ano): ano is number => ano !== null)
      .map(String)
      .filter((ano) => !anosComCarro.some((o) => o.valor === ano))
      .map((ano) => ({ valor: ano, rotulo: ano, total: 0 }));
    const anos = [...anosComCarro, ...new Map(pontas.map((p) => [p.valor, p])).values()].sort(
      (a, b) => Number(b.valor) - Number(a.valor),
    );

    // Contados sobre o que está NA TELA, com os opcionais já escolhidos: a
    // escolha é "todos", então o número de uma sugestão é quantos carros
    // sobram se ela entrar.
    const opcoesDeOpcional = catalogoDeOpcionais(estoque.filter((v) => passaNosFiltros(v)));

    const destaques = quickTags
      .map((tag) => {
        const slug = slugifyTag(tag.name) || tag.id;
        const total = estoque.filter(
          (v) =>
            passaNosFiltros(v, "destaque") &&
            checkTagMatchesVehicle(tag, v, stockOverrides),
        ).length;
        // Caixa alta como os outros grupos do filtro, que vêm de campo do
        // banco já normalizado. O nome do destaque é digitado no painel.
        return { valor: slug, rotulo: tag.name.toUpperCase(), total };
      })
      .filter((o) => o.total > 0);

    const grupos: GrupoFiltro[] = [
      {
        chave: "destaque",
        titulo: "DESTAQUES RÁPIDOS",
        opcoes: destaques,
        limite: LIMITE_DE_OPCOES_NO_PAINEL,
      },
      {
        chave: "carroceria",
        titulo: "CARROCERIA",
        opcoes: contar("carroceria"),
        limite: LIMITE_DE_OPCOES_NO_PAINEL,
      },
      {
        chave: "marca",
        titulo: "MARCA",
        opcoes: contar("marca"),
        limite: LIMITE_DE_OPCOES_NO_PAINEL,
      },
      // ANO vem logo depois daqui, mas não é grupo de caixas desde 28/09: são
      // duas listas, DE e ATÉ — ver `blocoDoAno` no render.
      {
        chave: "cambio",
        titulo: "CÂMBIO",
        opcoes: contar("cambio"),
        limite: LIMITE_DE_OPCOES_NO_PAINEL,
      },
      {
        chave: "combustivel",
        titulo: "COMBUSTÍVEL",
        opcoes: contar("combustivel"),
        limite: LIMITE_DE_OPCOES_NO_PAINEL,
      },
    ].filter((g) => g.opcoes.length > 0);

    return { grupos, anos, opcoesDeOpcional };
  }, [estoque, selecionados, faixas, opcionais, termos, quickTags, stockOverrides]);

  // As pontas das réguas vêm do estoque INTEIRO, não do filtrado: a régua que
  // encolhe a cada caixa marcada move os pegadores debaixo do dedo.
  const limitesDoPreco = useMemo(
    () => limitesDaRegua(estoque.map(precoVigente).filter((p) => p > 0), PASSO_DO_PRECO),
    [estoque],
  );
  const limitesDoKm = useMemo(
    () => limitesDaRegua(estoque.map((v) => v.quilometragem), PASSO_DO_KM),
    [estoque],
  );
  // O nome de cada opcional vem do estoque inteiro: o chip de um opcional
  // escolhido continua com nome mesmo quando outro filtro tira da tela o
  // último carro que o tinha.
  const rotulosDeOpcional = useMemo(
    () => new Map(catalogoDeOpcionais(estoque).map((o) => [o.chave, o.rotulo])),
    [estoque],
  );
  const rotuloDoOpcional = (chave: string) => rotulosDeOpcional.get(chave) ?? chave;

  const filtrados = useMemo(() => {
    const lista = estoque.filter((v) => passaNosFiltros(v));
    switch (ordem) {
      case "menor-preco":
        return [...lista].sort((a, b) => precoVigente(a) - precoVigente(b));
      case "menor-km":
        return [...lista].sort((a, b) => a.quilometragem - b.quilometragem);
      default:
        return lista;
    }
  }, [estoque, selecionados, faixas, opcionais, termos, ordem]);

  /**
   * O filtro escrito no endereço, a cada mudança.
   *
   * Até 28/09 ele vivia só neste componente. Medido no ar: marcar VOLKSWAGEN
   * (9 carros), abrir uma ficha e voltar devolvia os 37 — o cliente refazia o
   * filtro a cada carro que abria. Com o filtro no endereço, o voltar do
   * navegador abre `/estoque?marca=Volkswagen`, e `estadoDaUrl` remonta o
   * mesmo painel. De brinde, o link copiado é o filtro.
   *
   * `replaceState` e não `pushState`: cada caixa marcada não pode virar um
   * degrau no botão voltar — ele levaria a pessoa de volta pelas próprias
   * caixas, uma a uma, antes de sair da página. O Next integra as duas
   * chamadas nativas ao roteador desde a 14.1, sem ida ao servidor.
   *
   * `enderecoComFiltro` e não `urlDoEstado` cru: o endereço também carrega
   * `utm_*`, `gclid` e `fbclid` de quem chegou por anúncio, e o rastreamento
   * os lê depois da hidratação. Só o que é do painel é reescrito.
   */
  useEffect(() => {
    const query = enderecoComFiltro(window.location.search, {
      selecionados,
      ...faixas,
      opcionais,
      busca,
      ordem,
    });
    const destino = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    if (destino !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", destino);
    }
  }, [selecionados, faixas, opcionais, busca, ordem]);

  const chipsAtivos = [
    ...Object.entries(selecionados).flatMap(([chave, valores]) =>
      valores.map((valor) => {
        const grupo = grupos.find((g) => g.chave === chave);
        const opcao = grupo?.opcoes.find((o) => o.valor === valor);
        return { chave, valor, rotulo: (opcao?.rotulo ?? valor).toUpperCase() };
      }),
    ),
    ...chipDaFaixa("ano", faixas.ano, String),
    ...chipDaFaixa("preco", faixas.preco, formatarPreco),
    ...chipDaFaixa("km", faixas.km, (km) => formatarKm(km).toUpperCase()),
    ...opcionais.map((chave) => ({
      chave: "opcional",
      valor: chave,
      rotulo: rotuloDoOpcional(chave).toUpperCase(),
    })),
    // A busca entra na régua como qualquer outro filtro. Sem isto, o campo
    // some junto com o painel no celular e a vitrine fica recortada sem que
    // nada na tela diga por quê — o mesmo defeito que a contagem de filtros
    // no botão existe para evitar.
    ...(chipDaBusca(busca) ? [{ chave: "busca", valor: "", rotulo: chipDaBusca(busca)! }] : []),
  ];

  const totalFiltrado = filtrados.length;
  const mostrando = Math.min(visiveis, totalFiltrado);
  const filtro = painelDeFiltro(filtroAberto);

  /**
   * ANO em duas listas, DE e ATÉ — pedido do dono em 28/09, "para diminuir
   * espaço e otimizar o menu". Eram 12 caixas empilhadas.
   *
   * Lista nativa, e não calendário: calendário escolhe dia, aqui se escolhe
   * ano, e no celular a lista nativa abre a roleta do próprio aparelho. O
   * "DE" / "ATÉ" em cima de cada lista diz de que lado é a ponta, e a opção
   * vazia é "Qualquer" — "Mais antigo" saía cortado nos 107px do campo.
   *
   * Sem régua, `ajustarFaixa` só troca as pontas invertidas.
   */
  const escolherAno = (ponta: "min" | "max", valor: string) =>
    mudarFaixa(
      "ano",
      ajustarFaixa({ ...faixas.ano, [ponta]: valor === "" ? null : Number(valor) }, null),
    );
  const blocoDoAno = anos.length > 0 && (
    <fieldset className="mt-grupo">
      <legend>ANO</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <PontaDaFaixa>DE</PontaDaFaixa>
          <span className="sr-only">Ano mínimo</span>
          <select
            value={faixas.ano.min ?? ""}
            onChange={(e) => escolherAno("min", e.target.value)}
            className="mt-campo-caixa mt-foco cursor-pointer px-2 text-[13px] font-semibold"
          >
            <option value="">Qualquer</option>
            {anos.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.valor} ({a.total})
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <PontaDaFaixa>ATÉ</PontaDaFaixa>
          <span className="sr-only">Ano máximo</span>
          <select
            value={faixas.ano.max ?? ""}
            onChange={(e) => escolherAno("max", e.target.value)}
            className="mt-campo-caixa mt-foco cursor-pointer px-2 text-[13px] font-semibold"
          >
            <option value="">Qualquer</option>
            {anos.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.valor} ({a.total})
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );

  return (
    <div className="font-modernist">
      {/* Barra de controle.
          A trilha e o <h1> saíram daqui em 2026-08-25 e passaram para
          `src/app/estoque/page.tsx`, que é server component. Este arquivo usa
          `useSearchParams()` dentro de um <Suspense>: o servidor entrega só o
          fallback, e o HTML de /estoque saía sem <h1> e sem um único link de
          veículo — medido em produção. Título e trilha são conteúdo, não
          interação; não podiam depender do JavaScript rodar.

          O que ficou aqui é o que de fato reage ao usuário: a contagem
          FILTRADA (que muda a cada caixa marcada, e por isso nunca poderia ser
          o <h1>) e a ordenação. */}
      <div className="border-b-2 border-mt-regua px-[18px] pb-5 pt-6 lg:px-10 lg:pb-5 lg:pt-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex items-baseline gap-2">
            {/* Gira como hodômetro quando o filtro muda a contagem: a pessoa vê,
                sem ler, que a seleção encolheu ou cresceu. */}
            <Hodometro texto={String(totalFiltrado)} className="mt-titulo text-[26px] lg:text-[32px]" />
            <span className="text-[11px] font-semibold tracking-[.14em] text-mt-neutral-600">
              {totalFiltrado === 1 ? "VEÍCULO NA SELEÇÃO" : "VEÍCULOS NA SELEÇÃO"}
            </span>
          </div>

          {/* `gap-y-6`: quando a ordenação quebra em duas linhas (celular de
              360 px), as camadas de toque de 44 px (`.mt-alvo`) de uma linha
              e da outra não se encostam. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-6 text-xs font-semibold tracking-[.1em]">
            <span className="text-mt-neutral-600">ORDENAR:</span>
            {ORDENACOES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOrdem(o.id)}
                aria-pressed={ordem === o.id}
                className={`mt-foco mt-alvo border-b-2 pb-[3px] ${
                  ordem === o.id
                    ? "border-mt-accent text-mt-ink"
                    : "border-transparent text-mt-neutral-600 hover:text-mt-ink"
                }`}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* Busca por digitação.
            Fica FORA do painel de filtros, e nas duas larguras: o painel some
            no celular, e um campo de busca escondido atrás de um botão é a
            mesma caçada que ele existe para encurtar. Vem antes do alternador
            porque é o caminho mais curto de todos — quem sabe o que quer
            digita, quem não sabe abre o filtro.

            Sem `<form>` e sem botão de enviar AQUI: filtra a cada tecla, sobre
            uma lista que já está na memória do navegador, e um botão só
            existiria para disparar o que já aconteceu. O fallback de
            `/estoque` tem um `<form>` de verdade, porque lá não há tecla que
            dispare nada — e é ele que reserva esta caixa no HTML servido, para
            a grade não pular na hidratação. */}
        <div className={CONTAINER_DA_BUSCA}>
          <label htmlFor="busca-da-vitrine" className="sr-only">
            Buscar por modelo, marca ou característica
          </label>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mt-neutral-600"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4.5-4.5" />
          </svg>
          <input
            ref={campoDeBusca}
            id="busca-da-vitrine"
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setVisiveis(PAGINA);
            }}
            // O placeholder ensina a digitar VALOR, não nome de campo. A
            // primeira versão dizia "modelo, marca, câmbio, cor" e piorava o
            // resultado de quem obedecia: "câmbio automático" achava 5 e
            // "automático" achava 14, porque o nome do campo não está no
            // índice — só o valor dele.
            placeholder={EXEMPLO_DA_BUSCA}
            // `appearance-none` no botão nativo de limpar: o `type="search"`
            // desenha um X próprio no Chrome, Edge e Safari, e ele apareceria
            // ao lado do nosso — dois X colados, e só um deles com rótulo e
            // ordem de foco. O preflight do Tailwind reseta só o
            // `search-decoration`, não este.
            className={CAIXA_DA_BUSCA}
          />
          {busca !== "" && (
            <button
              type="button"
              // Devolve o foco ao campo, e não é preciosismo: este botão só
              // existe enquanto `busca !== ""`, e o clique torna a própria
              // precondição falsa. Sem isto o nó sai do DOM e o foco cai no
              // `<body>` (WCAG 2.4.3) — a terceira vez que este defeito
              // aparece neste branch, depois de `fecharFiltro` e do
              // `LIMPAR TUDO`.
              //
              // As outras duas ocorrências do arquivo ficaram adiadas porque o
              // vizinho natural (`botaoDoFiltro`) é `display:none` no desktop.
              // Aqui esse motivo não existe: o campo está montado nas duas
              // larguras, e continuar digitando é o que a pessoa quer fazer.
              onClick={() => {
                setBusca("");
                setVisiveis(PAGINA);
                campoDeBusca.current?.focus();
              }}
              aria-label="Limpar a busca"
              className="mt-foco absolute right-3 top-1/2 -translate-y-1/2 p-1 text-mt-accent"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                className="h-3.5 w-3.5"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>

        {/* Botão de filtro — só abaixo do `lg`.
            Ocupa o mesmo lugar e a mesma altura do "VER TODO O ESTOQUE" que o
            fallback do <Suspense> serve no HTML: os dois se trocam na
            hidratação sem empurrar a grade para baixo — e a busca acima faz o
            mesmo par com o `<form>` de lá, o que deixou de ser verdade por um
            commit quando o campo entrou só deste lado. A contagem de filtros
            ativos vem junto porque painel recolhido não pode esconder que a
            vitrine está filtrada. */}
        <button
          ref={botaoDoFiltro}
          type="button"
          onClick={() => setFiltroAberto((aberto) => !aberto)}
          aria-expanded={filtroAberto}
          aria-controls="painel-de-filtros"
          className={`mt-foco mt-4 flex w-full items-center justify-between border-2 border-mt-regua px-4 py-2.5 text-[11px] font-extrabold tracking-[.16em] ${filtro.classeDoBotao}`}
        >
          <span className="flex items-center gap-2">
            {filtro.rotulo}
            {chipsAtivos.length > 0 && (
              <span className="text-mt-accent">({chipsAtivos.length})</span>
            )}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3 w-3 text-mt-accent transition-transform ${
              filtroAberto ? "rotate-180" : ""
            }`}
          >
            <path d="M5 8l7 7 7-7" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {/* O fundo escurecido por trás da folha — tocar nele fecha. Só no
            celular e só com a folha aberta; fora da árvore acessível, porque
            o X e o Esc já fecham. */}
        {filtroAberto && (
          <div
            aria-hidden="true"
            onClick={fecharFiltro}
            className={`fixed inset-0 z-[55] touch-none bg-[rgba(20,18,18,.55)] ${filtro.classeDoBotao}`}
          />
        )}
        {/* Coluna de filtros.
            `filtro.classe` esconde no celular e mantém no desktop. O elemento
            NÃO sai da árvore: decidir isso em JavaScript exigiria medir a
            janela no cliente — divergência de hidratação e piscar de campos na
            primeira pintura, a armadilha que `BuscaRegua.tsx` documenta no
            `soDesktop`. Escondido por CSS, o que o cliente marcou continua no
            estado e volta intacto quando ele reabre. */}
        <aside
          ref={painel}
          id="painel-de-filtros"
          aria-label="Filtros"
          className={`${filtro.classe} shrink-0 px-[18px] lg:w-[290px] lg:border-r-2 lg:border-mt-regua lg:py-0 lg:pl-10 lg:pr-7`}
        >
          {/* No celular, o cabeçalho da folha fica preso no topo enquanto a
              lista rola por baixo — com o X de fechar à mão. */}
          <div className="flex items-baseline justify-between gap-3 border-b-2 border-mt-regua pb-3.5 pt-5 max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:bg-mt-bg">
            <span className="text-[11px] font-extrabold tracking-[.16em]">FILTROS</span>
            {/* Este botão some do DOM ao ser acionado. O destino do foco é a
                região de resultados, e não o alternador do filtro: ele aparece
                também no desktop, onde `botaoDoFiltro` é `display:none`. Era a
                tarefa aberta em 2026-09-04, e o alvo novo é o que a fechou. */}
            {chipsAtivos.length > 0 && (
              <button
                type="button"
                onClick={limparDoPainel}
                className="mt-foco text-[11px] font-semibold text-mt-accent"
              >
                LIMPAR ({chipsAtivos.length})
              </button>
            )}
            <button
              ref={fecharDaFolha}
              type="button"
              onClick={fecharFiltro}
              aria-label="Fechar os filtros"
              className={`mt-foco -my-2 -mr-2 flex h-11 w-11 items-center justify-center self-center text-mt-ink ${filtro.classeDoBotao}`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="square"
                className="h-4 w-4"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          {grupos.map((grupo) => {
            const marcados = selecionados[grupo.chave] ?? [];
            const corta = grupo.opcoes.length > grupo.limite;
            const aberto = gruposAbertos.includes(grupo.chave);
            // Fechado, o grupo mostra as primeiras E as marcadas: a Mitsubishi
            // que chegou marcada por um link não pode ficar sem caixa à vista.
            const naTela =
              corta && !aberto
                ? grupo.opcoes.filter((o, i) => i < grupo.limite || marcados.includes(o.valor))
                : grupo.opcoes;
            return (
            <Fragment key={grupo.chave}>
            {/* `.mt-grupo` (modernist.css) põe o rótulo junto do conteúdo que
                ele nomeia. A contagem é só visual: cada caixa já anuncia se
                está marcada, e o número repetiria isso para o leitor de tela. */}
            <fieldset className="mt-grupo">
              <legend>
                <span>{grupo.titulo}</span>
                {marcados.length > 0 && (
                  <span aria-hidden="true" className="mt-grupo-conta">
                    {marcados.length}
                  </span>
                )}
              </legend>
              <div className="flex flex-col gap-2.5">
                {naTela.map((opcao) => {
                  const marcado = marcados.includes(opcao.valor);
                  return (
                    <label
                      key={opcao.valor}
                      className="flex cursor-pointer items-center gap-2.5 text-[13px]"
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternar(grupo.chave, opcao.valor)}
                        className="peer sr-only"
                      />
                      {/* O input real é sr-only: o anel de foco tem que vir do
                          `peer`, senão o teclado percorre os filtros às cegas. */}
                      <span
                        aria-hidden="true"
                        className={`h-3.5 w-3.5 shrink-0 border-[1.5px] outline-mt-accent peer-focus-visible:outline-2 peer-focus-visible:outline-solid peer-focus-visible:outline-offset-2 ${
                          marcado
                            ? "border-mt-accent bg-mt-accent"
                            : "border-mt-regua bg-mt-bg"
                        }`}
                      />
                      <span className="mr-auto">{opcao.rotulo}</span>
                      <span className="text-[11px] text-mt-neutral-600">{opcao.total}</span>
                    </label>
                  );
                })}
              </div>
              {/* O botão troca de rótulo e continua no lugar: o foco de quem
                  o aciona não se perde, ao contrário dos que limpam. */}
              {corta && (
                <button
                  type="button"
                  aria-expanded={aberto}
                  onClick={() => alternarGrupo(grupo.chave)}
                  className="mt-foco mt-3 text-[11px] font-semibold tracking-[.08em] text-mt-accent"
                >
                  {aberto ? "VER MENOS" : `VER TODAS (${grupo.opcoes.length})`}
                </button>
              )}
            </fieldset>
            {grupo.chave === "marca" && blocoDoAno}
            </Fragment>
            );
          })}
          {/* Sem grupo de marca (estoque sem marca preenchida), o ano não
              pode sumir junto. */}
          {!grupos.some((g) => g.chave === "marca") && blocoDoAno}

          {rotulosDeOpcional.size > 0 && (
            <CampoDeOpcionais
              catalogo={opcoesDeOpcional}
              escolhidos={opcionais}
              rotuloDe={rotuloDoOpcional}
              onEscolher={(chave) => {
                setOpcionais((atuais) => (atuais.includes(chave) ? atuais : [...atuais, chave]));
                setVisiveis(PAGINA);
              }}
              onRemover={(chave) => {
                setOpcionais((atuais) => atuais.filter((c) => c !== chave));
                setVisiveis(PAGINA);
              }}
            />
          )}

          {limitesDoPreco && (
            <FaixaComCaixas
              titulo="PREÇO"
              limites={limitesDoPreco}
              passo={PASSO_DO_PRECO}
              faixa={faixas.preco}
              onChange={(faixa) => mudarFaixa("preco", faixa)}
              formatar={formatarPreco}
              nomes={{
                min: "Preço mínimo",
                max: "Preço máximo",
                digiteMin: "Digite o preço mínimo",
                digiteMax: "Digite o preço máximo",
              }}
            />
          )}

          {limitesDoKm && (
            <FaixaComCaixas
              titulo="QUILOMETRAGEM"
              limites={limitesDoKm}
              passo={PASSO_DO_KM}
              faixa={faixas.km}
              onChange={(faixa) => mudarFaixa("km", faixa)}
              formatar={formatarKm}
              nomes={{
                min: "Quilometragem mínima",
                max: "Quilometragem máxima",
                digiteMin: "Digite a quilometragem mínima",
                digiteMax: "Digite a quilometragem máxima",
              }}
            />
          )}


          {/* A saída do painel no celular, com o resultado já contado — preso
              ao pé da folha, porque a contagem é a resposta ao que se acabou
              de marcar e tem que estar na tela sem rolar. A margem de baixo
              respeita a barra de gestos do iPhone.

              `fecharFiltro` e não `setFiltroAberto(false)`: este botão some
              junto com o painel, e o foco precisa ir para algum lugar. */}
          <div
            className={`sticky bottom-0 z-10 -mx-[18px] mt-5 border-t border-mt-regua-fina bg-mt-bg px-[18px] pb-[max(12px,env(safe-area-inset-bottom))] pt-3 ${filtro.classeDoBotao}`}
          >
            <button
              ref={botaoVerVeiculos}
              type="button"
              onClick={fecharFiltro}
              className={`mt-btn mt-btn-tinta mt-foco w-full justify-center ${filtro.classeDoBotao}`}
            >
              VER {totalFiltrado} {totalFiltrado === 1 ? "VEÍCULO" : "VEÍCULOS"}
            </button>
          </div>
        </aside>

        {/* Grade — e o alvo de foco de quem limpa os filtros.
            `tabIndex={-1}` põe o `<div>` ao alcance de `.focus()` sem colocar a
            grade inteira na ordem de Tab; `role` e `aria-label` existem para o
            foco chegar num elemento que sabe se anunciar, e não num contêiner
            mudo. Nada aqui pode recolher por largura: é o único destino que
            serve ao desktop e ao celular ao mesmo tempo — ver
            `limparTudoComFocoNosResultados`. */}
        <div
          ref={regiaoDeResultados}
          tabIndex={-1}
          role="region"
          aria-label={rotuloDosResultados(totalFiltrado)}
          className="mt-foco min-w-0 flex-1 px-[18px] pb-16 pt-6 lg:px-10 lg:pb-[70px]"
        >
          {chipsAtivos.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {chipsAtivos.map((chip) => (
                <button
                  key={`${chip.chave}-${chip.valor}`}
                  type="button"
                  onClick={() => {
                    if (chip.chave === "preco" || chip.chave === "km" || chip.chave === "ano")
                      mudarFaixa(chip.chave, SEM_FAIXA);
                    else if (chip.chave === "opcional")
                      setOpcionais((atuais) => atuais.filter((c) => c !== chip.valor));
                    else if (chip.chave === "busca") setBusca("");
                    else alternar(chip.chave, chip.valor);
                  }}
                  aria-label={`Remover filtro ${chip.rotulo}`}
                  className="mt-foco flex items-center gap-2 border border-mt-regua px-3 py-1.5 text-xs font-semibold"
                >
                  {chip.rotulo}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="h-3 w-3 text-mt-accent"
                  >
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              ))}

              {/* O "LIMPAR (N)" do painel nasce escondido no celular junto com
                  o painel — desfazer tudo custaria um toque a mais, ou um chip
                  de cada vez. Aqui ele volta, fora do painel.

                  `mostrarLimparTudo` decide, e inclui o estado do painel: com
                  ele ABERTO no celular os dois botões de limpar estariam na
                  mesma tela. A primeira versão disto dizia em comentário que
                  aparecia "só onde some", e não era verdade — a revisão de
                  04/09 pegou.

                  `limparTudo` sozinho no `onClick` seria defeito de foco por
                  construção: zerar os filtros torna falsa a condição da régua
                  logo acima, o botão sai do DOM e o foco de quem acabou de
                  acioná-lo cai no `<body>` (WCAG 2.4.3).

                  Este apontou para o alternador do filtro, que aqui está na
                  tela. Mudou de destino mesmo assim: aquilo mandava o foco para
                  trás, para FORA da região que acabou de mudar, e sem despacho
                  síncrono anunciava a contagem velha. */}
              {mostrarLimparTudo(chipsAtivos.length, filtroAberto) && (
                <button
                  type="button"
                  onClick={limparTudoComFocoNosResultados}
                  className={`mt-foco border border-mt-accent px-3 py-1.5 text-xs font-semibold text-mt-accent ${filtro.classeDoBotao}`}
                >
                  LIMPAR TUDO
                </button>
              )}
            </div>
          )}

          {totalFiltrado === 0 ? (
            <div className="border-t-2 border-mt-regua py-16 text-center">
              <p className="m-0 text-[17px] font-extrabold">
                {mensagemDeVitrineVazia(
                  busca,
                  chipsAtivos.filter((c) => c.chave !== "busca").length,
                )}
              </p>
              {/* Mesmo caso do `LIMPAR (N)` lá em cima: `limparTudo` cru
                  desmontaria este bloco inteiro e o foco cairia no `<body>`.
                  Aqui o desktop é o caso difícil — o alternador do filtro não
                  existe lá para receber o foco — e é por isso que o destino é
                  a região de resultados, que existe nas duas larguras. */}
              <button
                type="button"
                onClick={limparTudoComFocoNosResultados}
                className="mt-btn mt-btn-contorno mt-foco mt-6"
              >
                VER TODO O ESTOQUE
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-y-11">
                {filtrados.slice(0, visiveis).map((v, i) => (
                  <CardVeiculo
                    key={v.id}
                    veiculo={v}
                    href={getVeiculoPdpUrl(v)}
                    etiqueta={v.status_tag || undefined}
                    contagemFotos={
                      v.web_full_images?.length
                        ? `${v.web_full_images.length} fotos`
                        : undefined
                    }
                    prioridade={i < 3}
                  />
                ))}
              </div>

              {/* O fim da primeira leva é onde o cliente decide se a loja tem
                  nove carros ou trinta e seis.

                  Até 05/09/2026 este botão era `mt-btn-tinta` — preto sobre
                  fundo claro, ao lado de um "Mostrando 9 de 36" em cinza de
                  12px. No celular, depois de rolar nove fichas, ele lê como
                  rodapé da lista e não como "tem mais". A cor de destaque é
                  escassa no site de propósito, e este é exatamente o lugar que
                  ela existe para marcar: a única ação que revela que a vitrine
                  continua.

                  A contagem cresceu junto e perdeu o cinza claro — ela é o
                  argumento, não a legenda. */}
              <div className="mt-12 flex flex-wrap items-center gap-4 border-t-2 border-mt-regua pt-5">
                {mostrando < totalFiltrado && (
                  <button
                    type="button"
                    onClick={() => setVisiveis((n) => n + PAGINA)}
                    className="mt-btn mt-btn-primario mt-foco"
                  >
                    CARREGAR MAIS {Math.min(PAGINA, totalFiltrado - mostrando)}
                  </button>
                )}
                <span className="text-[13px] font-semibold text-mt-neutral-800">
                  Mostrando {mostrando} de {totalFiltrado}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
