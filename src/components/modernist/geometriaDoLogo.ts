/**
 * Geometria do logo animado, em "unidades do design": a versão vertical da
 * marca escalada para 1500 de largura, a mesma régua do arquivo do Claude
 * Design ("Motors Store Logo Animation v3"). Assim as constantes da animação
 * entram aqui com os números de lá.
 *
 * Os traçados NÃO são os do design, que foram redesenhados à mão em curvas
 * aproximadas: são os de `public/marca/motors-store-vertical-negativo.svg`
 * (extraídos do .cdr em 29/09), multiplicados por 1500 / 267,898, com o MOTORS
 * e o STORE separados por letra para cada uma andar sozinha. No fim da
 * animação o logo é o desenho da marca, não uma imitação dele.
 *
 * A horizontal (rodapé) é a mesma vertical com o símbolo à esquerda do bloco
 * de texto: os dois blocos da `motors-store-horizontal-negativo.svg` são os da
 * vertical na mesma escala (×0,8965), deslocados. Os deslocamentos abaixo
 * saíram do ajuste ponto a ponto entre os dois arquivos; o erro máximo é de
 * 0,06 unidade do SVG original, menos de um décimo de pixel no rodapé.
 */

export const LARGURA = 1500;
export const ALTURA_VERTICAL = 752.1;

/** As duas metades do "M" de cima, esquerda e direita. */
export const ASAS = [
  "M738.9 0L738.9 371.3L678.2 114.6L487.5 254.1C474.8 263.5 467.3 278.1 467.8 293.8C468.4 315.8 473.5 348.9 493.8 380.6C493.8 380.6 439.4 370.2 421.1 287.6C414.9 259.1 414.9 229.7 420.6 201.3Z",
  "M760.2 0L760.2 371.3L820.9 114.6L1011.4 254.1C1024.3 263.5 1031.6 278.1 1031.1 293.8C1030.4 315.8 1025.4 348.9 1005.1 380.6C1005.1 380.6 1059.4 370.2 1078 287.6C1084.3 258.9 1084.2 229.4 1078.3 200.8C972.3 133.8 866.2 66.8 760.2 0Z",
] as const;

/**
 * O contorno que a luz percorre na fase "Trace", copiado do design: começa no
 * vértice e desce pela borda de fora. O desenho da marca começa pela borda de
 * dentro, e a luz nasceria no lugar errado. O traço some enquanto a asa
 * preenche; a diferença entre os dois contornos é menor que um pixel.
 */
export const CONTORNO_DAS_ASAS = [
  "M738,0 L420,200 Q410,245 420,290 Q440,365 493,380 Q470,345 467,292 Q467,265 487,250 L677,114 L738,370 Z",
  "M760,0 L1078,200 Q1088,245 1078,290 Q1058,365 1005,380 Q1028,345 1031,292 Q1031,265 1011,250 L821,114 L760,370 Z",
] as const;

/** `cx` é o centro da letra: a animação a afasta do meio (750) e a traz de volta. */
export const MOTORS = [
  { cx: 157.7, d: "M259.8 458.9L157.7 574.7L55.6 458.9L6.2 458.9L6.2 637.5L41.8 637.5L41.8 497.1L157.7 628.6L273.6 497.1L273.6 637.5L309.3 637.5L309.3 458.9Z" },
  { cx: 442.6, d: "M513.8 566C513.8 575.8 510.5 584.2 503.5 591.1C496.5 598.1 488.1 601.6 478.3 601.6L371.3 601.6L371.3 530.1C371.3 520.3 374.8 511.9 381.7 504.9C388.7 498 397.1 494.5 406.9 494.5L513.8 494.5ZM335.6 637.5L478.3 637.5C497.9 637.5 514.8 630.3 528.7 616.4C542.6 602.6 549.6 585.8 549.6 566L549.6 458.9L406.9 458.9C387.3 458.9 370.3 465.9 356.5 479.7C342.6 493.7 335.6 510.5 335.6 530.1Z" },
  { cx: 676.9, d: "M575.8 458.9L575.8 494.5L659 494.5L659 637.5L694.7 637.5L694.7 494.5L778.1 494.5L778.1 458.9Z" },
  { cx: 905, d: "M976.4 566C976.4 575.8 973 584.2 966.1 591.1C959.1 598.1 950.7 601.6 940.9 601.6L833.9 601.6L833.9 530.1C833.9 520.3 837.4 511.9 844.3 504.9C851.3 498 859.7 494.5 869.5 494.5L976.4 494.5ZM798 637.5L940.9 637.5C960.5 637.5 977.3 630.3 991.3 616.4C1005.2 602.6 1012 585.8 1012 566L1012 458.9L869.5 458.9C849.7 458.9 832.9 465.9 819.1 479.7C805.2 493.7 798 510.5 798 530.1Z" },
  { cx: 1145.4, d: "M1074 494.5L1213.7 494.5C1209.9 504.9 1203.6 513.6 1194.5 520.1C1185.2 526.8 1174.7 530.1 1163.3 530.1L1074 530.1ZM1038.4 637.5L1074 637.5L1074 566L1163.3 566C1178 566 1190.6 571.2 1201 581.7C1211.5 592.1 1216.7 604.8 1216.7 619.5L1216.7 637.5L1252.4 637.5L1252.4 619.5C1252.4 605.3 1249.2 591.8 1242.7 579.1C1236.4 566.7 1227.8 556.4 1216.7 548C1227.8 539.6 1236.4 529.3 1242.7 517.1C1249.2 504.6 1252.4 491 1252.4 476.5L1252.4 458.9L1038.4 458.9Z" },
  { cx: 1385.7, d: "M1278.7 566L1456.9 566C1456.9 575.8 1453.5 584.2 1446.6 591.1C1439.6 598.1 1431.2 601.6 1421.4 601.6L1278.7 601.6L1278.7 637.5L1421.4 637.5C1441 637.5 1457.8 630.3 1471.8 616.4C1485.7 602.6 1492.7 585.8 1492.7 566L1492.7 530.1L1314.4 530.1C1314.4 520.3 1317.9 511.9 1324.8 504.9C1331.8 498 1340.2 494.5 1350 494.5L1492.7 494.5L1492.7 458.9L1350 458.9C1330.2 458.9 1313.4 465.9 1299.6 479.7C1285.7 493.7 1278.7 510.5 1278.7 530.1Z" },
] as const;

export const STORE = [
  { cx: 385.9, d: "M406.1 726.5C411.4 726.5 411.4 738.1 406.1 738.1L344.2 738.1L344.2 751.9L409.6 751.9C411.1 751.9 412.3 751.8 413.6 751.3C429.4 745.1 426.3 712.4 409.6 712.4L360.2 712.4C354.9 712.4 354.8 700.9 360.2 700.9L422 700.9L422 687.1L356.7 687.1C347.3 687.1 342.3 697.9 342.3 706.7C342.3 714.5 346.1 724.3 354 726.2Z" },
  { cx: 564, d: "M557.1 700.9L557.1 751.9L571 751.9L571 700.9L604.9 700.9L604.9 687.1L523.2 687.1L523.2 700.9Z" },
  { cx: 747.7, d: "M771.6 752.1C779.3 752.1 785.7 746.8 789.6 740.5C801.2 721.8 793.9 692 775.7 687.5C758.4 687.4 741.1 687.2 723.8 687.1C716.1 687.1 709.7 692.1 705.8 698.5C694.2 717.2 701.5 747 719.7 751.4C737 751.6 754.3 751.8 771.6 752.1ZM723.8 738C717.3 738 714 725.4 714 719.4C714 713.9 716.7 702.6 723.1 701C739.1 701 755.4 701 771.6 701C778.1 701 781.2 713.7 781.2 719.4C781.2 725.1 778.7 736.4 772.4 738C756.2 738 740 738 723.8 738Z" },
  { cx: 935.5, d: "M891.7 721.2L891.7 751.9L905.7 751.9L905.7 735L950.4 735L961 751.9L977.5 751.9L964.8 731.8C979.2 720.7 975.1 691 959.1 687.4L891.7 687.1L891.7 700.9L952.6 700.9C961.5 700.9 962.3 719.1 953.7 721Z" },
  { cx: 1115.3, d: "M1075.9 700.9L1154.7 700.9L1154.7 687.1L1075.9 687.1ZM1075.9 712.4L1075.9 751.9L1154.7 751.9L1154.7 738L1089.9 738L1089.9 726.5L1154.7 726.5L1154.7 712.4Z" },
] as const;

/** As duas réguas ao lado do STORE. A barra de luz da abertura vira elas. */
export const REGUAS = [
  { x: 0, y: 703.4, largura: 286, altura: 32.3 },
  { x: 1214, y: 703.4, largura: 286, altura: 32.3 },
] as const;

export const HORIZONTAL = {
  largura: 2266.3,
  altura: 380.6,
  simbolo: "translate(-416.4 -0.1)",
  texto: "translate(766.4 -406.9)",
} as const;
