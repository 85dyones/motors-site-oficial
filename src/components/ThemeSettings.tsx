"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme, ThemeType } from "../app/ThemeContext";

export default function ThemeSettings() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const presets: {
    id: ThemeType;
    name: string;
    shortName: string;
    colors: string[];
  }[] = [
    {
      id: "motors-modernist",
      name: "Motors Modernista 2026",
      shortName: "Modernista",
      colors: ["#f3f2f2", "#ec3013", "#201e1d"],
    },
    {
      id: "luxury-light",
      name: "Luxury Laranja Claro",
      shortName: "Claro",
      colors: ["#fafafc", "#C83F00", "#1a1a23"],
    },
    {
      id: "stealth-dark",
      name: "Stealth Carbon Dark",
      shortName: "Escuro",
      colors: ["#09090B", "#D4AF37", "#14141B"],
    },
    {
      id: "sport-nardo",
      name: "Sport Nardo Red",
      shortName: "Esporte",
      colors: ["#1A1D20", "#E30613", "#272B30"],
    },
  ];

  const activePreset = presets.find((p) => p.id === theme) || presets[0];

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button – sits inline in the Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center gap-1.5 rounded-full border border-brand-border bg-brand-card px-3 py-2 text-xs font-semibold uppercase tracking-wider text-brand-gold transition-all duration-300 active:scale-90 hover:border-brand-primary/50 cursor-pointer"
        aria-label="Selecionar Tema de Cores"
      >
        {/* Palette indicator dots */}
        <div className="flex items-center gap-0.5">
          {activePreset.colors.map((c, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full border border-black/10 flex-shrink-0"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-3 w-3 text-brand-gold transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-brand-card border border-brand-border backdrop-blur-lg rounded-2xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] flex flex-col gap-3 z-[60] animate-fadeIn">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
              Personalização
            </span>
            <h4 className="text-sm font-extrabold text-brand-text">
              Paleta de Cores
            </h4>
          </div>

          <div className="flex flex-col gap-2">
            {presets.map((preset) => {
              const isActive = theme === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    setTheme(preset.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                    isActive
                      ? "border-2 border-brand-primary bg-brand-card shadow-sm"
                      : "border-brand-card-border bg-brand-card/60 hover:border-brand-primary/40 hover:bg-brand-card"
                  }`}
                >
                  {/* Palette Swatch */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {preset.colors.map((c, i) => (
                      <span
                        key={i}
                        className="h-4 w-4 rounded-full border border-black/10"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-bold text-brand-text truncate">
                      {preset.name}
                    </span>
                    {isActive && (
                      <span className="text-[9px] text-brand-gold font-semibold">
                        ✓ Ativo
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <span className="text-[9px] text-gray-500 text-center pt-1">
            Antigravity Configurator v2.0
          </span>
        </div>
      )}
    </div>
  );
}
