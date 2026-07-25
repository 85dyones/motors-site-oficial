import React from "react";
import Link from "next/link";
import type { QuickTag } from "../types";
import { slugifyTag } from "../lib/tagUtils";

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
  const defaultOptions: QuickTag[] = [
    { id: "todos", name: "Todos", field: "tipo", operator: "equals", value: "" },
    ...validQuickTags,
  ];

  return (
    <div className="w-full bg-brand-bg border-b border-brand-border/40 py-3.5 transition-colors duration-300">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 flex flex-col gap-3">
        {/* Carroceria Filter Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-brand-text/50 shrink-0 mr-1.5">
            CARROCERIA
          </span>
          {bodyTypes.map((item) => {
            const isActive = selectedCategory === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedCategory(item.id)}
                className={`h-8 px-4 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 shrink-0 cursor-pointer border ${
                  isActive
                    ? "bg-brand-primary border-brand-primary text-white shadow-md shadow-brand-primary/20 scale-[1.02]"
                    : "bg-brand-card/60 border-brand-border/60 text-brand-text/75 hover:border-brand-primary/40 hover:text-brand-text hover:bg-brand-card"
                }`}
              >
                {item.name}
              </button>
            );
          })}
        </div>

        {/* Destaques Rápidos Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-brand-text/50 shrink-0 mr-1.5">
            DESTAQUES RÁPIDOS
          </span>
          {defaultOptions.map((opt) => {
            const tagSlug = slugifyTag(opt.name) || opt.id;
            const isSelected = selectedQuickTag === opt.id || selectedQuickTag === tagSlug;

            const cssClasses = `h-8 px-4 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 shrink-0 cursor-pointer flex items-center justify-center border ${
              isSelected
                ? "bg-brand-primary border-brand-primary text-white shadow-md shadow-brand-primary/20 scale-[1.02]"
                : "bg-brand-card/60 border-brand-border/60 text-brand-text/75 hover:border-brand-primary/40 hover:text-brand-text hover:bg-brand-card"
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

            const utmUrl = `/destaques/${tagSlug}?utm_source=site&utm_medium=quick_tag&utm_campaign=${encodeURIComponent(tagSlug)}`;

            return (
              <Link
                key={opt.id}
                href={utmUrl}
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
