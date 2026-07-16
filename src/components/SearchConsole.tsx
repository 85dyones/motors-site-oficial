import React from "react";

interface SearchConsoleProps {
  tempSearchTerm: string;
  setTempSearchTerm: (value: string) => void;
  handleApplySearch: () => void;
}

export default function SearchConsole({
  tempSearchTerm,
  setTempSearchTerm,
  handleApplySearch
}: SearchConsoleProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleApplySearch();
      }}
      className="w-full flex justify-center mt-2 mb-4"
    >
      <div className="w-full max-w-[600px] flex items-center bg-white border border-brand-primary/20 rounded-full shadow-sm hover:border-brand-primary/50 hover:shadow-md transition-all overflow-hidden pl-5 pr-2 py-1.5 focus-within:ring-2 focus-within:ring-brand-primary/20 focus-within:border-brand-primary">
        
        {/* Text Label on the left */}
        <div className="hidden sm:flex items-center gap-2 shrink-0 pr-3 border-r border-zinc-200">
           <span className="h-1.5 w-1.5 rounded-full bg-brand-primary animate-pulse" />
           <span className="text-brand-primary text-[10px] font-extrabold tracking-[0.1em] uppercase whitespace-nowrap">
              ENCONTRE SEU VEÍCULO
           </span>
        </div>

        {/* Input part */}
        <div className="flex-1 flex items-center relative pl-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 text-brand-primary/60 mr-2 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={tempSearchTerm}
            onChange={(e) => setTempSearchTerm(e.target.value)}
            placeholder="Pesquise por modelo ou marca..."
            className="w-full bg-transparent text-zinc-900 placeholder-zinc-400 text-[11px] md:text-xs font-semibold focus:outline-none border-none py-1.5"
            aria-label="Pesquise por modelo ou marca"
          />
        </div>

        <button
          type="submit"
          className="ml-2 shrink-0 flex items-center gap-1 bg-brand-primary text-white hover:bg-brand-primary-hover font-extrabold px-4 py-1.5 rounded-full text-[9px] uppercase tracking-wider transition-colors duration-200 cursor-pointer"
        >
          Buscar
        </button>
      </div>
    </form>
  );
}
