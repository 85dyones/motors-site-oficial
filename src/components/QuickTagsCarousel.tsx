import React from "react";
import Link from "next/link";
import type { QuickTag } from "../types";

interface BodyType {
  id: string;
  name: string;
}

interface QuickTagsCarouselProps {
  bodyTypes: BodyType[];
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
  validQuickTags: QuickTag[];
  selectedQuickTag: string;
  setSelectedQuickTag: (value: string) => void;
}

export default function QuickTagsCarousel({
  bodyTypes,
  selectedCategory,
  setSelectedCategory,
  validQuickTags,
  selectedQuickTag,
  setSelectedQuickTag,
}: QuickTagsCarouselProps) {
  return (
    <div className="flex flex-col gap-4 w-full overflow-hidden">
      
      {/* CARROCERIA */}
      <div className="flex flex-col gap-1.5 w-full">
        <div className="relative self-start group/carroceria cursor-default">
          <span className="text-[9px] font-extrabold text-zinc-800 uppercase tracking-[0.16em] pl-1 select-none transition-colors duration-300 group-hover/carroceria:text-brand-primary">
            CARROCERIA
          </span>
          <span className="absolute bottom-0 left-1 w-0 h-[1.5px] bg-brand-primary transition-all duration-300 group-hover/carroceria:w-[calc(100%-4px)]" />
        </div>
        <div className="flex overflow-x-auto scrollbar-none gap-2 w-full select-none -mx-3 px-3 sm:mx-0 sm:px-0 scroll-smooth pb-1">
          {bodyTypes.map((style) => {
            const isSelected = selectedCategory === style.id;
            return (
              <button
                key={style.id}
                onClick={() => setSelectedCategory(style.id)}
                className={`inline-flex items-center justify-center px-3 py-1.5 rounded-md border text-center transition-all duration-300 active:scale-95 text-[11px] font-medium uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${
                  isSelected
                    ? "bg-brand-primary text-white border-brand-primary shadow-sm font-semibold"
                    : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-brand-primary hover:text-brand-primary hover:bg-white"
                }`}
              >
                {style.name.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* DESTAQUES RÁPIDOS */}
      <div className="flex flex-col gap-1.5 w-full">
        <div className="relative self-start group/destaques cursor-default">
          <span className="text-[9px] font-extrabold text-zinc-800 uppercase tracking-[0.16em] pl-1 select-none transition-colors duration-300 group-hover/destaques:text-brand-primary">
            DESTAQUES RÁPIDOS
          </span>
          <span className="absolute bottom-0 left-1 w-0 h-[1.5px] bg-brand-primary transition-all duration-300 group-hover/destaques:w-[calc(100%-4px)]" />
        </div>
        <div className="flex overflow-x-auto scrollbar-none gap-2 w-full select-none -mx-3 px-3 sm:mx-0 sm:px-0 scroll-smooth">
          {[
            { id: "todos", name: "TODOS" },
            ...validQuickTags
          ].map((opt) => {
            const isSelected = selectedQuickTag === opt.id;
            const cssClasses = `inline-flex items-center justify-center px-3 py-1.5 rounded-md border text-center transition-all duration-300 active:scale-95 text-[11px] font-medium uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${
              isSelected
                ? "bg-brand-primary text-white border-brand-primary shadow-sm font-semibold"
                : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-brand-primary hover:text-brand-primary hover:bg-white"
            }`;

            if (opt.id === "todos") {
              return (
                <Link
                  key={opt.id}
                  href="/#catalogo"
                  onClick={() => setSelectedQuickTag("todos")}
                  className={cssClasses}
                  title="Ver todos os veículos"
                  aria-label="Remover filtros e ver todos os veículos"
                >
                  {opt.name.toUpperCase()}
                </Link>
              );
            }

            return (
              <Link
                key={opt.id}
                href={`/destaques/${opt.id}`}
                className={cssClasses}
                title={`Ver veículos em destaque: ${opt.name}`}
                aria-label={`Filtrar catálogo pela categoria de destaque ${opt.name}`}
              >
                {opt.name.toUpperCase()}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
