/**
 * Faixa de procedência — tela 03 do design doc.
 *
 * Bloco escuro de quatro colunas logo abaixo da galeria e da coluna de
 * decisão. É o argumento de confiança da PDP, e o texto é institucional
 * (vale para todo veículo do estoque), não vem do registro do carro — por
 * isso é estático aqui e não um campo do banco.
 */

const ITENS = [
  {
    n: "01",
    t: "Laudo cautelar completo",
    d: "Estrutura, chassi e histórico de sinistro auditados por laboratório credenciado.",
  },
  {
    n: "02",
    t: "Histórico de manutenção",
    d: "Revisões rastreadas, com notas fiscais anexas quando disponíveis.",
  },
  {
    n: "03",
    t: "Garantia de motor e câmbio",
    d: "Cobertura contratada na entrega, sem carência e sem franquia.",
  },
  {
    n: "04",
    t: "Transferência inclusa",
    d: "Documentação e vistoria feitas por nós, sem custo adicional.",
  },
];

export default function FaixaProcedencia() {
  return (
    <section
      aria-label="Procedência"
      className="flex flex-col bg-mt-inverso-fundo text-mt-inverso print:hidden lg:flex-row"
    >
      {ITENS.map((item) => (
        <div
          key={item.n}
          className="flex-1 border-b border-mt-inverso-regua-fina px-[18px] py-6 last:border-b-0 lg:border-b-0 lg:border-r lg:px-7 lg:py-[26px] lg:last:border-r-0"
        >
          <div className="mb-2.5 text-[11px] font-extrabold tracking-[.1em] text-mt-accent">
            {item.n}
          </div>
          <div className="text-[15px] font-extrabold tracking-[-.01em]">{item.t}</div>
          <div className="mt-1.5 text-xs leading-snug text-mt-inverso-suave">{item.d}</div>
        </div>
      ))}
    </section>
  );
}
