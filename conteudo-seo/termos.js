/**
 * Os termos que vamos medir no Planejador de Palavras-Chave.
 *
 * Função pura: entra estoque e sementes, sai lista de termos. Sem rede, sem
 * credencial, sem token de desenvolvedor. É de propósito — a única parte
 * disto que carrega decisão nossa é a lista, e ela precisa ser verificável
 * agora, com a API ainda bloqueada.
 *
 * Os clusters fixos são os do §1.6 do `PlanoMotorsStoreSEOGoogleAdsGA4Curitiba.md`.
 * Se o plano mudar, mude aqui — e o teste `tests/termos-planejador.test.ts`
 * cobra a correspondência.
 */

const CIDADE = "curitiba";

/**
 * Clusters de termo fixo — os que não dependem do que está no pátio.
 * Copiados do §1.6; a coluna "Prioridade" do plano vira a ordem daqui.
 */
const CLUSTERS_FIXOS = {
  "geo-comercial": [
    "seminovos curitiba",
    "carros usados curitiba",
    "loja de carros curitiba",
    "revenda de carros curitiba",
  ],
  hiperlocal: [
    "seminovos bacacheri",
    "carros usados bacacheri",
    "loja de carros bairro bacacheri",
    "seminovos boa vista curitiba",
    "carros usados atuba",
  ],
  // O §1.6 fixa estas quatro. Elas NÃO saem do campo `tipo` do estoque de
  // propósito: o feed do RevendaMais classifica Camaro e Bongo como "Hatch",
  // então `tipo` não descreve carroceria de forma confiável. Ele só é usado
  // aqui para separar carro de moto, que é a distinção que ele acerta.
  "categoria-geo": [
    "suv seminovo curitiba",
    "carro automático usado curitiba",
    "hatch usado curitiba",
    "picape usada curitiba",
  ],
  financiamento: [
    "financiamento de carro usado curitiba",
    "carro usado sem entrada curitiba",
    "carro parcelado curitiba",
    "financiar carro nome sujo curitiba",
  ],
  "compra-avaliacao": [
    "quem compra carro usado curitiba",
    "vender meu carro curitiba",
    "avaliação de carro curitiba",
    "loja que compra carro curitiba",
  ],
  confianca: [
    "carro periciado curitiba",
    "seminovo com garantia curitiba",
    "loja de carros confiável curitiba",
  ],
};

/** Clusters cujos termos servem de semente para a descoberta (limite de 20). */
const CLUSTERS_SEMENTE = ["geo-comercial", "hiperlocal", "compra-avaliacao"];

const normalizar = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * O nome do modelo, sem a versão colada.
 *
 * O RevendaMais entrega `modelo` com a versão embutida — "x4 m40i 3.0 m sport
 * edit v6 turbo aut" — e repete a versão no campo `versao`. Ninguém busca
 * assim; busca-se "bmw x4". Então tiramos o sufixo.
 *
 * O caso que quebra a regra: às vezes `versao` é o `modelo` INTEIRO (Honda
 * "hr-v ex 1.8 flexone 16v 5p aut" nos dois campos). Tirar o sufixo devolveria
 * string vazia, então caímos na primeira palavra — que é o nome do modelo.
 */
function nomeDoModelo(veiculo) {
  const modelo = String(veiculo.modelo || "").trim();
  const versao = String(veiculo.versao || "").trim();

  let nome = modelo;
  if (versao && nome.toLowerCase().endsWith(versao.toLowerCase())) {
    nome = nome.slice(0, nome.length - versao.length).trim();
  }
  if (!nome) nome = modelo.split(/\s+/)[0] || "";
  return nome;
}

const ehMoto = (veiculo) => normalizar(veiculo.tipo).startsWith("motocicleta");

/**
 * Modelos distintos do pátio. Vendido sai por padrão: o objetivo é medir a
 * demanda do que a loja tem para vender, não do que já foi.
 */
function modelosDoEstoque(veiculos, { incluirVendidos = false } = {}) {
  const porChave = new Map();

  for (const v of veiculos || []) {
    if (!incluirVendidos && v.vendido) continue;
    const nome = nomeDoModelo(v);
    const marca = String(v.marca || "").trim();
    if (!marca || !nome) continue;

    const chave = normalizar(`${marca} ${nome}`);
    if (!porChave.has(chave)) {
      porChave.set(chave, { marca, nome, moto: ehMoto(v), quantidade: 0 });
    }
    porChave.get(chave).quantidade += 1;
  }

  // Mais unidades no pátio primeiro: se o orçamento de medição apertar, mede
  // o que a loja mais tem.
  return [...porChave.values()].sort(
    (a, b) => b.quantidade - a.quantidade || a.marca.localeCompare(b.marca)
  );
}

/**
 * As três formas de buscar um modelo, do §1.6: `[modelo] usado curitiba`,
 * `[modelo] seminovo curitiba`, `comprar [modelo] curitiba`.
 * Moto concorda no feminino — "honda cb usada", não "usado".
 */
function termosDoModelo({ marca, nome, moto }) {
  const base = normalizar(`${marca} ${nome}`);
  return [
    `${base} ${moto ? "usada" : "usado"} ${CIDADE}`,
    `${base} ${moto ? "seminova" : "seminovo"} ${CIDADE}`,
    `comprar ${base} ${CIDADE}`,
  ];
}

/**
 * A lista inteira, com o cluster de origem de cada termo.
 *
 *   veiculos ........... array de `conteudo-seo/estoque.json`
 *   extras ............. termos avulsos de `sementes.json`
 *   incluirVendidos .... mede também o que já saiu do pátio
 *
 * Devolve `{ termos, porCluster }`. `termos` é a lista deduplicada, na ordem
 * em que os clusters foram montados; a primeira ocorrência vence, então um
 * termo que já está num cluster fixo não vira "semente" nem "modelo".
 */
function montarTermos({ veiculos = [], extras = [], incluirVendidos = false } = {}) {
  const porCluster = {};
  const vistos = new Set();
  const termos = [];

  const adicionar = (cluster, lista) => {
    for (const bruto of lista) {
      const termo = normalizar(bruto);
      if (!termo || vistos.has(termo)) continue;
      vistos.add(termo);
      termos.push({ termo, cluster });
      (porCluster[cluster] ||= []).push(termo);
    }
  };

  for (const [cluster, lista] of Object.entries(CLUSTERS_FIXOS)) adicionar(cluster, lista);

  const modelos = modelosDoEstoque(veiculos, { incluirVendidos });
  adicionar(
    "modelo-geo",
    modelos.filter((m) => !m.moto).flatMap(termosDoModelo)
  );

  const motos = modelos.filter((m) => m.moto);
  if (motos.length) {
    adicionar("moto-geo", ["motos usadas curitiba", "moto seminova curitiba"]);
    adicionar("moto-geo", motos.flatMap(termosDoModelo));
  }

  adicionar("sementes", extras);

  return { termos, porCluster, modelos };
}

/**
 * Sementes para o modo de descoberta. O `generateKeywordIdeas` aceita no
 * máximo 20 palavras por chamada, então aqui vai o topo de intenção — não a
 * lista inteira. Descoberta é para achar o que não sabemos; medir o que já
 * sabemos é o outro modo.
 */
function sementesDeDescoberta({ extras = [] } = {}) {
  const base = CLUSTERS_SEMENTE.flatMap((c) => CLUSTERS_FIXOS[c]);
  const todas = [...base, ...extras.map(normalizar)];
  return [...new Set(todas)].slice(0, 20);
}

module.exports = {
  CIDADE,
  CLUSTERS_FIXOS,
  nomeDoModelo,
  modelosDoEstoque,
  termosDoModelo,
  montarTermos,
  sementesDeDescoberta,
};
