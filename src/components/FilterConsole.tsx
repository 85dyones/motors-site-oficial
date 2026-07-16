import React from "react";

interface FilterConsoleProps {
  handleApplySearch: () => void;
  tempSearchTerm: string;
  setTempSearchTerm: (value: string) => void;
  filterMarca: string;
  setFilterMarca: (value: string) => void;
  setFilterModelo: (value: string) => void;
  marcasDisponiveis: string[];
  filterModelo: string;
  modelosDisponiveis: string[];
  filterAno: string;
  setFilterAno: (value: string) => void;
  anosDisponiveis: string[];
  filterCambio: string;
  setFilterCambio: (value: string) => void;
  cambiosDisponiveis: string[];
  filterDirecao: string;
  setFilterDirecao: (value: string) => void;
  direcoesDisponiveis: string[];
  filterCombustivel: string;
  setFilterCombustivel: (value: string) => void;
  combustiveisDisponiveis: string[];
  filterPrecoMin: string;
  setFilterPrecoMin: (value: string) => void;
  filterPrecoMax: string;
  setFilterPrecoMax: (value: string) => void;
  handleClearFilters: () => void;
}

export default function FilterConsole({
  handleApplySearch,
  tempSearchTerm,
  setTempSearchTerm,
  filterMarca,
  setFilterMarca,
  setFilterModelo,
  marcasDisponiveis,
  filterModelo,
  modelosDisponiveis,
  filterAno,
  setFilterAno,
  anosDisponiveis,
  filterCambio,
  setFilterCambio,
  cambiosDisponiveis,
  filterDirecao,
  setFilterDirecao,
  direcoesDisponiveis,
  filterCombustivel,
  setFilterCombustivel,
  combustiveisDisponiveis,
  filterPrecoMin,
  setFilterPrecoMin,
  filterPrecoMax,
  setFilterPrecoMax,
  handleClearFilters
}: FilterConsoleProps) {
  return (
    <aside className="hidden lg:flex lg:col-span-3 flex-col gap-6 sticky top-24 lg:h-[calc(100vh-120px)] lg:overflow-y-auto pr-2 bg-brand-card border border-brand-card-border p-6 rounded-3xl shadow-[0_8px_30px_var(--brand-shadow)]">
      <div className="flex flex-col gap-1 border-b border-brand-border pb-4">
        <span className="text-[9px] font-extrabold uppercase text-brand-primary tracking-widest">
          Filtros Avançados
        </span>
        <h4 className="text-md font-black text-brand-text">
          Refinar Busca
        </h4>
      </div>

      <form
        toolname="buscar_carros_estoque"
        tooldescription="Filtra o inventário ativo de veículos seminovos por parâmetros técnicos e de preço."
        onSubmit={(e) => {
          e.preventDefault();
          handleApplySearch();
        }}
        className="flex flex-col gap-4"
      >
        {/* Direct Text input inside sidebar */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50">O que você procura?</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Ex: Porsche, 911, M Sport..."
              value={tempSearchTerm}
              onChange={(e) => setTempSearchTerm(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-xl text-xs text-brand-text pl-4 pr-10 h-12 w-full placeholder-brand-text/30 focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              style={{ minHeight: "48px" }}
              toolparamdescription="Termo de pesquisa por marca, modelo ou palavras-chave (ex: BMW, M Sport)."
            />
            <button
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text/50 hover:text-brand-primary transition-colors cursor-pointer"
              aria-label="Buscar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Brand Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50">Marca</label>
          <select
            value={filterMarca}
            onChange={(e) => {
              setFilterMarca(e.target.value);
              setFilterModelo("todos");
            }}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
            toolparamdescription="Marca do fabricante do veículo (ex: Fiat, Chevrolet, Ford)."
          >
            <option value="todos">Todas Marcas</option>
            {marcasDisponiveis.map((marca) => (
              <option key={marca} value={marca}>
                {marca}
              </option>
            ))}
          </select>
        </div>

        {/* Model Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50">Modelo</label>
          <select
            aria-label="Modelo"
            value={filterModelo}
            onChange={(e) => setFilterModelo(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
            toolparamdescription="Nome do modelo de veículo (ex: Titano, Onix)."
          >
            <option value="todos">Todos Modelos</option>
            {modelosDisponiveis.map((modelo) => (
              <option key={modelo} value={modelo}>
                {modelo}
              </option>
            ))}
          </select>
        </div>

        {/* Year Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50">Ano de Fabricação</label>
          <select
            aria-label="Ano de Fabricação"
            value={filterAno}
            onChange={(e) => setFilterAno(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
            toolparamdescription="Ano de fabricação ou ano modelo do veículo."
          >
            <option value="todos">Todos Anos</option>
            {anosDisponiveis.map((ano) => (
              <option key={ano} value={ano}>
                {ano}
              </option>
            ))}
          </select>
        </div>

        {/* Câmbio Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50">Câmbio</label>
          <select
            aria-label="Câmbio"
            value={filterCambio}
            onChange={(e) => setFilterCambio(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
            toolparamdescription="Tipo de transmissão ou câmbio (Automático ou Manual)."
          >
            <option value="todos">Todos Câmbios</option>
            {cambiosDisponiveis.map((cambio) => (
              <option key={cambio} value={cambio}>
                {cambio.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Direção Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50">Direção</label>
          <select
            aria-label="Direção"
            value={filterDirecao}
            onChange={(e) => setFilterDirecao(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
            toolparamdescription="Tipo de direção de assistência mecânica (Elétrica, Hidráulica, Mecânica)."
          >
            <option value="todos">Todas Direções</option>
            {direcoesDisponiveis.map((dir) => (
              <option key={dir} value={dir}>
                {dir.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Combustível Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50">Combustível</label>
          <select
            aria-label="Combustível"
            value={filterCombustivel}
            onChange={(e) => setFilterCombustivel(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
            toolparamdescription="Tipo de combustível aceito (Flex, Diesel, Gasolina, Híbrido, Elétrico)."
          >
            <option value="todos">Todos Combustíveis</option>
            {combustiveisDisponiveis.map((comb) => (
              <option key={comb} value={comb}>
                {comb.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Min Price Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50">Preço Mínimo</label>
          <select
            value={filterPrecoMin}
            onChange={(e) => setFilterPrecoMin(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
            toolparamdescription="Preço mínimo aceito em reais para a busca."
          >
            <option value="todos">Qualquer Valor</option>
            <option value="100000">R$ 100 mil</option>
            <option value="250000">R$ 250 mil</option>
            <option value="500000">R$ 500 mil</option>
            <option value="750000">R$ 750 mil</option>
            <option value="1000000">R$ 1.0 milhão</option>
          </select>
        </div>

        {/* Max Price Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase text-brand-text/50">Preço Máximo</label>
          <select
            value={filterPrecoMax}
            onChange={(e) => setFilterPrecoMax(e.target.value)}
            className="bg-brand-bg border border-brand-border rounded-xl text-xs font-bold text-brand-text px-4 h-12 w-full focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
            style={{ minHeight: "48px" }}
            toolparamdescription="Preço máximo aceito em reais para a busca."
          >
            <option value="todos">Qualquer Valor</option>
            <option value="300000">R$ 300 mil</option>
            <option value="600000">R$ 600 mil</option>
            <option value="1000000">R$ 1.0 milhão</option>
            <option value="1500000">R$ 1.5 milhão</option>
            <option value="2000000">R$ 2.0 milhões</option>
          </select>
        </div>

        {/* Clear Filter Sidebar Button */}
        <button
          onClick={handleClearFilters}
          type="button"
          className="mt-2 w-full py-4 bg-brand-bg hover:bg-brand-card-border border border-brand-border text-brand-gold hover:text-brand-primary font-black uppercase tracking-wider text-xs rounded-xl transition-all duration-300"
          style={{ minHeight: "48px" }}
        >
          Limpar Filtros
        </button>
      </form>
    </aside>
  );
}
