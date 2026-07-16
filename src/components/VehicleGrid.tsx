import React from "react";
import Image from "next/image";
import Link from "next/link";
import type { Veiculo } from "../types";
import { formatPrice, formatKm, resolveTagColorClass } from "./HeroSection";

interface VehicleGridProps {
  filteredEstoque: Veiculo[];
  visibleCount: number;
  layoutMode: "grid" | "list";
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  getVeiculoPdpUrl: (veiculo: Veiculo) => string;
  handleWhatsappClick: (e: React.MouseEvent, veiculo: Veiculo) => void;
  isInCompare: (id: string) => boolean;
  addToCompare: (id: string) => void;
  removeFromCompare: (id: string) => void;
}

export default function VehicleGrid({
  filteredEstoque,
  visibleCount,
  layoutMode,
  handleScroll,
  getVeiculoPdpUrl,
  handleWhatsappClick,
  isInCompare,
  addToCompare,
  removeFromCompare,
}: VehicleGridProps) {
  return (
    <div
      className="max-h-[850px] overflow-y-auto overflow-x-hidden custom-scrollbar pr-2 pb-4"
      onScroll={handleScroll}
    >
      <div
        className={`grid gap-6 ${
          layoutMode === "grid" ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"
        }`}
      >
        {filteredEstoque.slice(0, visibleCount).map((veiculo) => {
          const pdpUrl = getVeiculoPdpUrl(veiculo);

          const hasDiscount =
            veiculo.preco_promocional > 0 && veiculo.preco_promocional < veiculo.preco_original;
          const activePrice = hasDiscount ? veiculo.preco_promocional : veiculo.preco_original;

          // GRID COMPONENT CARD (Mimics Auto Club item style)
          if (layoutMode === "grid") {
            return (
              <div
                key={veiculo.id}
                className="group bg-brand-card border border-brand-card-border hover:border-brand-primary/40 rounded-3xl flex flex-col justify-between shadow-[0_8px_30px_var(--brand-shadow)] hover:shadow-xl transition-all duration-300 relative overflow-hidden animate-fadeIn"
              >
                {/* Image block container - Perfect Full-Bleed (no borders/padding surrounding) */}
                <Link
                  prefetch={false}
                  href={pdpUrl}
                  className="relative w-full aspect-video overflow-hidden bg-brand-bg flex-shrink-0 block cursor-pointer"
                >
                  <Image
                    src={veiculo.whatsapp_images[0] || "/logo.png"}
                    alt={`${veiculo.marca} ${veiculo.modelo}`}
                    fill
                    sizes="(max-w-768px) 100vw, 350px"
                    className={`w-full border-none p-0 m-0 object-cover transition-transform duration-700 group-hover:scale-105 ${
                      veiculo.vendido ? "filter grayscale-[30%] opacity-75" : ""
                    }`}
                  />
                  {/* Elegant inspection / status badge */}
                  {veiculo.status_tag && (
                    <div
                      className={`absolute top-2.5 left-2.5 backdrop-blur-sm text-[8px] font-black uppercase px-2 py-0.5 rounded shadow-lg tracking-wider flex items-center gap-1 z-10 border ${resolveTagColorClass(
                        veiculo.status_tag_color
                      )}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                      {veiculo.status_tag.toUpperCase()}
                    </div>
                  )}
                  {/* Sold overlay */}
                  {veiculo.vendido && (
                    <div className="absolute inset-0 bg-zinc-950/45 flex items-center justify-center z-20 backdrop-blur-[0.5px]">
                      <div className="bg-black/80 backdrop-blur-md border border-red-500/30 px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[9px] font-black tracking-[0.25em] text-white uppercase">
                          VENDIDO
                        </span>
                      </div>
                    </div>
                  )}
                </Link>

                {/* Info details block */}
                <div className="p-4 max-sm:p-2 flex flex-col flex-grow justify-between gap-3 max-sm:gap-1.5">
                  {/* Brand, Model, Version Link */}
                  <Link
                    prefetch={false}
                    href={pdpUrl}
                    className="flex flex-col gap-1 group/link cursor-pointer"
                  >
                    <span className="text-[9px] font-medium text-brand-gold uppercase tracking-widest leading-none">
                      {veiculo.marca}
                    </span>
                    <h4 className="text-base max-sm:text-sm font-bold text-brand-text leading-tight max-sm:leading-tight group-hover/link:text-brand-primary transition-colors duration-200 uppercase mt-0.5">
                      {veiculo.modelo}
                    </h4>
                    <span className="text-[10px] max-sm:text-[9px] text-brand-text/40 truncate max-w-[240px] font-light uppercase tracking-wide mt-0.5 block">
                      {veiculo.versao}
                    </span>
                  </Link>

                  {/* Specs Grid Link */}
                  <Link prefetch={false} href={pdpUrl} className="block cursor-pointer">
                    <div className="grid grid-cols-3 gap-1 max-sm:gap-0.5 py-1 max-sm:py-0.5 border-t border-b border-brand-border/40 my-1 text-center font-thin uppercase tracking-wider text-[9px] max-sm:text-[8px] max-sm:h-auto text-brand-text/50 hover:border-brand-primary/30 transition-all duration-300">
                      <div className="flex flex-col gap-0.5 border-r border-brand-border/40 last:border-r-0 py-0.5">
                        <span className="text-[7px] text-brand-text/30 font-semibold">ANO</span>
                        <span className="text-brand-text/70 font-semibold">{veiculo.ano}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 border-r border-brand-border/40 last:border-r-0 py-0.5 truncate">
                        <span className="text-[7px] text-brand-text/30 font-semibold">KM</span>
                        <span className="text-brand-text/70 font-semibold truncate">
                          {veiculo.quilometragem === 0
                            ? "NOVO"
                            : formatKm(veiculo.quilometragem).split(" ")[0]}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 border-r border-brand-border/40 last:border-r-0 py-0.5 truncate">
                        <span className="text-[7px] text-brand-text/30 font-semibold">CÂMBIO</span>
                        <span className="text-brand-text/70 font-semibold truncate">
                          {veiculo.cambio.split(" ")[0].toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </Link>

                  {/* Price & Green WhatsApp trigger button */}
                  <div className="flex items-end justify-between gap-2 mt-1.5">
                    {/* Price Link */}
                    <Link
                      prefetch={false}
                      href={pdpUrl}
                      className="flex flex-col cursor-pointer flex-grow"
                    >
                      {hasDiscount ? (
                        <>
                          <span className="text-[9px] text-brand-text/40 line-through leading-none mb-0.5">
                            De {formatPrice(veiculo.preco_original)}
                          </span>
                          <span className="text-base max-sm:text-sm font-bold text-brand-primary leading-none">
                            Por {formatPrice(veiculo.preco_promocional)}
                          </span>
                        </>
                      ) : (
                        <span className="text-base max-sm:text-sm font-bold text-brand-primary leading-none">
                          {formatPrice(veiculo.preco_original)}
                        </span>
                      )}
                    </Link>

                    {/* CTAs Group */}
                    <div className="flex items-center gap-2 max-sm:gap-1.5 self-end flex-shrink-0">
                      {/* Toggle Comparar Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          if (isInCompare(veiculo.id)) {
                            removeFromCompare(veiculo.id);
                          } else {
                            addToCompare(veiculo.id);
                          }
                        }}
                        className={`flex items-center gap-1.5 max-sm:gap-1 text-[10px] max-sm:text-[9px] font-bold cursor-pointer select-none rounded-lg px-3 py-2 max-sm:px-2.5 transition-all duration-300 active:scale-95 shadow-sm border ${
                          isInCompare(veiculo.id)
                            ? "bg-brand-primary text-white border-brand-primary shadow-md"
                            : "bg-brand-bg text-brand-text/70 border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/45 hover:text-brand-primary"
                        }`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="h-3 w-3 flex-shrink-0"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4"
                          />
                        </svg>
                        <span>{isInCompare(veiculo.id) ? "Comparando" : "Comparar"}</span>
                      </button>

                      {/* Square Green Emerald WhatsApp Button (w-12 h-12 / 48x48px) */}
                      <button
                        type="button"
                        onClick={(e) => handleWhatsappClick(e, veiculo)}
                        className="w-12 h-12 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl flex items-center justify-center transition-all duration-300 shadow-md shadow-emerald-950/15 cursor-pointer select-none border border-transparent flex-shrink-0"
                        aria-label="Contatar via WhatsApp"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 448 512"
                          fill="currentColor"
                          className="w-5 h-5"
                        >
                          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // LIST COMPONENT CARD (Mimics Auto Club ListingsTwo.html Look - Expandido Horizontal)
          return (
            <div
              key={veiculo.id}
              className="group bg-brand-card border border-brand-card-border hover:border-brand-primary/40 rounded-3xl p-0 flex flex-col md:flex-row gap-6 max-sm:gap-4.5 shadow-[0_8px_30px_var(--brand-shadow)] hover:shadow-xl transition-all duration-300 relative overflow-hidden animate-fadeIn"
            >
              {/* Big Image on Left - Full-Bleed marginless top/left/bottom */}
              <Link
                prefetch={false}
                href={pdpUrl}
                className="w-full md:w-2/5 aspect-video overflow-hidden bg-brand-bg flex-shrink-0 relative block cursor-pointer"
              >
                <Image
                  src={veiculo.whatsapp_images[0] || "/logo.png"}
                  alt={`${veiculo.marca} ${veiculo.modelo}`}
                  fill
                  sizes="(max-w-1024px) 100vw, 400px"
                  className={`w-full border-none p-0 m-0 object-cover transition-transform duration-700 group-hover:scale-105 ${
                    veiculo.vendido ? "filter grayscale-[30%] opacity-75" : ""
                  }`}
                />
                {/* Elegant status tag */}
                {veiculo.status_tag && (
                  <div
                    className={`absolute top-3 left-3 backdrop-blur-sm text-[9px] font-black uppercase px-2.5 py-0.5 rounded shadow-lg tracking-wider z-10 border ${resolveTagColorClass(
                      veiculo.status_tag_color
                    )}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    {veiculo.status_tag.toUpperCase()}
                  </div>
                )}
                {/* Sold overlay */}
                {veiculo.vendido && (
                  <div className="absolute inset-0 bg-zinc-950/45 flex items-center justify-center z-20 backdrop-blur-[0.5px]">
                    <div className="bg-black/80 backdrop-blur-md border border-red-500/30 px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[9px] font-black tracking-[0.25em] text-white uppercase">
                        VENDIDO
                      </span>
                    </div>
                  </div>
                )}
              </Link>

              {/* Mid Block Column: Title & Specs matrix */}
              <div className="flex flex-col justify-between flex-grow gap-4 py-4 pr-5 max-sm:p-2 max-sm:pt-0 max-sm:pr-2 max-sm:m-0">
                <Link
                  prefetch={false}
                  href={pdpUrl}
                  className="flex flex-col gap-1.5 group/link cursor-pointer"
                >
                  <span className="text-[10px] font-medium text-brand-gold uppercase tracking-widest leading-none">
                    {veiculo.marca}
                  </span>
                  <h4 className="text-xl max-sm:text-base font-bold text-brand-text leading-tight max-sm:leading-tight group-hover/link:text-brand-primary transition-colors duration-200 uppercase">
                    {veiculo.modelo}
                  </h4>
                  <p className="text-xs text-brand-text/50 font-thin uppercase leading-relaxed max-w-xl">
                    <span className="font-thin uppercase">{veiculo.versao}</span>
                    {veiculo.pericia &&
                      !veiculo.pericia.toLowerCase().includes("análise") &&
                      !veiculo.pericia.toLowerCase().includes("analise") &&
                      ` • ${veiculo.pericia.toUpperCase()}`}
                  </p>
                </Link>

                {/* Technical specifications bar - Horizontal Row with Dynamic Brand SVGs */}
                <Link
                  prefetch={false}
                  href={pdpUrl}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand-border/40 pt-3 text-xs text-brand-text/70 hover:border-brand-primary/30 transition-all duration-300 cursor-pointer"
                >
                  {/* 1. ANO */}
                  <div className="flex items-center gap-1.5 pr-4 border-r border-brand-border/40 last:border-0 last:pr-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                      />
                    </svg>
                    <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">
                      ANO:
                    </span>
                    <span className="font-semibold uppercase text-brand-text text-[11px]">
                      {veiculo.ano}
                    </span>
                  </div>

                  {/* 2. QUILOMETRAGEM */}
                  <div className="flex items-center gap-1.5 pr-4 border-r border-brand-border/40 last:border-0 last:pr-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                    <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">
                      KM:
                    </span>
                    <span className="font-semibold uppercase text-brand-text text-[11px]">
                      {formatKm(veiculo.quilometragem)}
                    </span>
                  </div>

                  {/* 3. CÂMBIO */}
                  <div className="flex items-center gap-1.5 pr-4 border-r border-brand-border/40 last:border-0 last:pr-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12a7.5 7.5 0 0 0 15 0m-15 0a7.5 7.5 0 1 1 15 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.25 0h8.25"
                      />
                    </svg>
                    <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">
                      CÂMBIO:
                    </span>
                    <span className="font-semibold uppercase text-brand-text text-[11px]">
                      {veiculo.cambio}
                    </span>
                  </div>

                  {/* 4. COMBUSTÍVEL */}
                  <div className="flex items-center gap-1.5 pr-4 border-r border-brand-border/40 last:border-0 last:pr-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.375 7.5c0 1.242-1.008 2.25-2.25 2.25h-2.25v-4.5h2.25c1.242 0 2.25 1.008 2.25 2.25ZM2.25 12h20.25M6.75 6h10.5M6.75 18h10.5M10.875 13.5c0 1.242-1.008 2.25-2.25 2.25h-1.875v-4.5h1.875c1.242 0 2.25 1.008 2.25 2.25Z"
                      />
                    </svg>
                    <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">
                      COMB:
                    </span>
                    <span className="font-semibold uppercase text-brand-text text-[11px]">
                      {veiculo.combustivel}
                    </span>
                  </div>

                  {/* 5. STATUS DA PERÍCIA */}
                  {veiculo.pericia &&
                    !veiculo.pericia.toLowerCase().includes("análise") &&
                    !veiculo.pericia.toLowerCase().includes("analise") && (
                      <div className="flex items-center gap-1.5 pr-4 last:border-0 last:pr-0">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="h-3.5 w-3.5 flex-shrink-0 text-brand-primary"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
                          />
                        </svg>
                        <span className="font-thin uppercase text-[10px] tracking-wider text-brand-text/40">
                          PERÍCIA:
                        </span>
                        <span className="font-semibold uppercase text-brand-text text-[11px]">
                          {veiculo.pericia}
                        </span>
                      </div>
                    )}
                </Link>
              </div>

              {/* Right Block Column: Pricing & CTAs */}
              <div className="w-full md:w-1/4 flex flex-col justify-between items-stretch border-t md:border-t-0 md:border-l border-brand-border/60 pt-4 md:pt-4 pb-4 px-5 md:pl-6 flex-shrink-0 gap-4">
                {/* Price tag display */}
                <div className="flex flex-col md:items-end">
                  <Link
                    prefetch={false}
                    href={pdpUrl}
                    className="flex flex-col md:items-end cursor-pointer group/price mb-2 w-full"
                  >
                    <span className="text-[10px] text-brand-text/40 group-hover/price:text-brand-primary uppercase font-semibold tracking-wider mb-1">
                      Preço Especial
                    </span>
                    {hasDiscount ? (
                      <div className="flex flex-col md:items-end">
                        <span className="text-xs text-brand-text/40 line-through">
                          De {formatPrice(veiculo.preco_original)}
                        </span>
                        <span className="text-2xl font-bold text-brand-primary">
                          {formatPrice(veiculo.preco_promocional)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-2xl font-bold text-brand-primary">
                        {formatPrice(veiculo.preco_original)}
                      </span>
                    )}
                  </Link>

                  {/* Toggle Comparar Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (isInCompare(veiculo.id)) {
                        removeFromCompare(veiculo.id);
                      } else {
                        addToCompare(veiculo.id);
                      }
                    }}
                    className={`flex items-center gap-1.5 max-sm:gap-1 text-[10px] max-sm:text-[9px] font-bold cursor-pointer select-none rounded-lg px-3 py-2 max-sm:px-2.5 transition-all duration-300 active:scale-95 mt-2 shadow-sm border ${
                      isInCompare(veiculo.id)
                        ? "bg-brand-primary text-white border-brand-primary shadow-md"
                        : "bg-brand-bg text-brand-text/70 border-brand-border hover:bg-brand-primary/10 hover:border-brand-primary/45 hover:text-brand-primary"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-3 w-3 flex-shrink-0"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 3v18M6 8l-4 4 4 4M18 8l4 4-4 4"
                      />
                    </svg>
                    <span>{isInCompare(veiculo.id) ? "Comparando" : "Comparar"}</span>
                  </button>
                </div>

                {/* Direct Click Buttons Block CTAs */}
                <div className="flex items-center gap-2 mt-auto w-full">
                  {/* Ver Detalhes Button */}
                  <Link
                    href={pdpUrl}
                    className="flex-grow h-11 border border-brand-primary hover:bg-brand-primary hover:text-white text-brand-gold hover:text-white font-semibold text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center transition-all duration-300 select-none cursor-pointer"
                  >
                    Ver Detalhes
                  </Link>

                  {/* WhatsApp Square Icon Only Button (w-12 h-12 / 48x48px) */}
                  <button
                    type="button"
                    onClick={(e) => handleWhatsappClick(e, veiculo)}
                    className="w-12 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center justify-center transition-all duration-300 shadow-md shadow-emerald-950/15 cursor-pointer select-none border border-transparent flex-shrink-0"
                    aria-label="Contatar via WhatsApp"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 448 512"
                      fill="currentColor"
                      className="w-5 h-5"
                    >
                      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
