import * as pagina from "../src/lib/paginaDoRepasse";

/**
 * Todo o texto da seção de repasse, para as travas de texto lerem de uma vez
 * (`pagina-do-repasse`, `textos-sem-marcas-de-ia`).
 *
 * O fixo é recolhido em PROFUNDIDADE de tudo o que `paginaDoRepasse.ts`
 * exporta: string nova num objeto novo entra sozinha na régua, sem ninguém
 * lembrar de registrá-la. O montado sai das funções com dados de amostra —
 * quem acrescentar uma função a `paginaDoRepasse.ts` acrescenta a amostra
 * aqui, e o controle de `pagina-do-repasse` cobra isso (toda função exportada
 * aparece na lista `FUNCOES_COM_AMOSTRA`).
 */
export function textosFixosDoRepasse(): string[] {
  const achados: string[] = [];
  const visitar = (valor: unknown) => {
    if (typeof valor === "string") achados.push(valor);
    else if (Array.isArray(valor)) valor.forEach(visitar);
    else if (valor && typeof valor === "object") Object.values(valor).forEach(visitar);
  };
  Object.values(pagina).forEach(visitar);
  return achados;
}

/** Nome de cada função exportada que tem amostra abaixo. */
export const FUNCOES_COM_AMOSTRA = [
  "tituloDaContaDoCarro",
  "linhaDoReparo",
  "rotuloDaFipe",
  "rotuloDaFipeNaFicha",
  "tituloDoLote",
  "verOsCarros",
  "verOsOutros",
  "linhaDoLote",
  "linhaDoHistoricoNoCard",
  "contagemDeFotos",
  "anosDoCarro",
  "rotuloDoExemplo",
  "notaDoSinistro",
  "tituloDaConfirmacao",
  "textoDaConfirmacao",
  "seloDeAberto",
  "laudoNaListaRapida",
  "laudoNoHistorico",
  "constaNoHistorico",
  "consultaFeitaEm",
  "orcamentoDaOficina",
  "tituloDoExame",
  "tituloDosParecidos",
  "abaixoDaFipeNaBarra",
  "contadorDaGaleria",
  "rotuloDoDefeito",
  "textoAlternativoDaFoto",
  "tituloDaFichaNaBusca",
  "textoDoVazio",
  "abertosHoje",
] as const;

export function textosMontadosDoRepasse(): string[] {
  return [
    pagina.tituloDaContaDoCarro({ modelo: "Kwid", versao: "Zen 1.0", ano_modelo: 2021, carroceria: "hatch" }),
    pagina.tituloDaContaDoCarro({ modelo: "Strada", versao: null, ano_modelo: 2020, carroceria: "picape" }),
    pagina.linhaDoReparo(["Embreagem patinando nas arrancadas", "Pneus dianteiros no fim da vida útil"]),
    pagina.rotuloDaFipe("setembro de 2026"),
    pagina.rotuloDaFipe(null),
    pagina.rotuloDaFipeNaFicha("setembro de 2026", "Kwid Zen 1.0 2021"),
    pagina.tituloDoLote(1),
    pagina.tituloDoLote(6),
    pagina.verOsCarros(1),
    pagina.verOsCarros(6),
    pagina.verOsOutros(1),
    pagina.verOsOutros(4),
    pagina.linhaDoLote({ hoje: true, dia: "24/09", abertos: 6, soLojistas: 1 }),
    pagina.linhaDoLote({ hoje: false, dia: "23/09", abertos: 1, soLojistas: 0 }),
    pagina.linhaDoHistoricoNoCard({
      laudo: "aprovado",
      leilao_consta: false,
      leilao_detalhe: null,
      sinistro_consta: true,
      sinistro_detalhe: "pequena monta em 2021",
    }),
    pagina.linhaDoHistoricoNoCard({
      laudo: "aprovado_com_apontamento",
      leilao_consta: false,
      leilao_detalhe: null,
      sinistro_consta: false,
      sinistro_detalhe: null,
    }),
    pagina.linhaDoHistoricoNoCard({
      laudo: "nao_feito",
      leilao_consta: true,
      leilao_detalhe: "arrematado em leilão de financeira em 2019, com a documentação regularizada",
      sinistro_consta: false,
      sinistro_detalhe: null,
    }),
    pagina.contagemDeFotos(28, 4),
    pagina.contagemDeFotos(1, 0),
    pagina.anosDoCarro({ ano_modelo: 2021, ano_fabricacao: 2020 }),
    pagina.rotuloDoExemplo("Ford Ka SE 1.0 2018"),
    pagina.notaDoSinistro("pequena monta em 2021"),
    pagina.tituloDaConfirmacao("Ana Souza"),
    pagina.textoDaConfirmacao({ faixa: "30-50", carrocerias: ["hatch"], comLote: true }),
    pagina.textoDaConfirmacao({ faixa: "ate-30", carrocerias: ["picape"], comLote: false }),
    pagina.textoDaConfirmacao({ faixa: null, carrocerias: ["hatch", "suv", "picape"], comLote: true }),
    pagina.textoDaConfirmacao({ faixa: "acima-80", carrocerias: [], comLote: true }),
    pagina.seloDeAberto("24/09"),
    pagina.laudoNaListaRapida("aprovado"),
    pagina.laudoNaListaRapida("aprovado_com_apontamento"),
    pagina.laudoNaListaRapida("nao_feito"),
    pagina.laudoNoHistorico("aprovado", null),
    pagina.laudoNoHistorico("aprovado_com_apontamento", "repintura no para-choque traseiro."),
    pagina.laudoNoHistorico("nao_feito", null),
    pagina.constaNoHistorico(true, "pequena monta em 2021"),
    pagina.constaNoHistorico(false, null),
    pagina.consultaFeitaEm("22/09"),
    pagina.orcamentoDaOficina("Oficina Exemplo", "22/09"),
    pagina.tituloDoExame("Kwid", "m"),
    pagina.tituloDoExame("Strada", "f"),
    pagina.tituloDosParecidos("Kwid", "m"),
    pagina.tituloDosParecidos("Strada", "f"),
    pagina.abaixoDaFipeNaBarra("R$ 3.180"),
    pagina.contadorDaGaleria(1, 28, 4),
    pagina.contadorDaGaleria(2, 5, 1),
    pagina.contadorDaGaleria(1, 4, 0),
    pagina.rotuloDoDefeito(1),
    pagina.textoAlternativoDaFoto("Renault Kwid Zen 1.0 2021", 3),
    pagina.tituloDaFichaNaBusca("Renault Kwid Zen 1.0 2021"),
    pagina.textoDoVazio("23/09"),
    pagina.textoDoVazio(null),
    pagina.abertosHoje(1),
    pagina.abertosHoje(6),
  ];
}

export function todoOTextoDoRepasse(): string[] {
  return [...textosFixosDoRepasse(), ...textosMontadosDoRepasse()];
}
