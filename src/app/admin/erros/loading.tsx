/**
 * O carregamento da fila e do detalhe.
 *
 * A tela é de servidor, então não há `carregando` em estado de componente: quem
 * mostra o intervalo entre o clique e a resposta é o Suspense do segmento. Vale
 * para `/admin/erros` e para `/admin/erros/[hash]`, que herda este arquivo.
 *
 * Esqueleto em vez de "Carregando…" porque a leitura passa por duas consultas
 * (a janela e a contagem) e o salto de layout, num painel que se abre no
 * telefone, é o que faz a pessoa clicar duas vezes.
 */
export default function CarregandoErros() {
  return (
    <div className="flex w-full max-w-6xl animate-pulse flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2 border-b-2 border-mt-regua pb-5">
        <div className="h-2.5 w-24 bg-mt-neutral-300" />
        <div className="h-8 w-64 bg-mt-neutral-300" />
      </div>
      <div className="h-16 border-t-2 border-mt-regua" />
      <div className="h-24 border border-mt-regua-fina bg-mt-surface" />
      <div className="flex flex-col divide-y divide-mt-regua-fina border border-mt-regua-fina bg-mt-surface">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 p-4">
            <div className="h-3 w-48 bg-mt-neutral-300" />
            <div className="h-2.5 w-72 bg-mt-neutral-300" />
            <div className="h-2.5 w-40 bg-mt-neutral-300" />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando a fila de erros…</span>
    </div>
  );
}
