"use client";

import React, { createContext, useContext, useState, useRef } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: "danger" | "warning" | "info" | "success";
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: ConfirmOptions | string) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAlert, setIsAlert] = useState(false);
  const [config, setConfig] = useState<ConfirmOptions>({ message: "" });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = (options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === "string" ? { message: options } : options;
    setConfig({
      title: opts.title || "Confirmar Ação",
      message: opts.message,
      confirmLabel: opts.confirmLabel || "Confirmar",
      cancelLabel: opts.cancelLabel || "Cancelar",
      type: opts.type || "warning"
    });
    setIsAlert(false);
    setIsOpen(true);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  };

  const alert = (options: ConfirmOptions | string): Promise<void> => {
    const opts = typeof options === "string" ? { message: options } : options;
    setConfig({
      title: opts.title || "Aviso",
      message: opts.message,
      confirmLabel: opts.confirmLabel || "OK",
      type: opts.type || "info"
    });
    setIsAlert(true);
    setIsOpen(true);
    return new Promise((resolve) => {
      resolveRef.current = () => resolve();
    });
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolveRef.current) resolveRef.current(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolveRef.current) resolveRef.current(false);
  };

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-brand-card border border-brand-border/60 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4 transform transition-all duration-300 scale-100 animate-in fade-in zoom-in-95">
            {/* Header / Title */}
            <div className="flex items-center gap-3">
              {config.type === "danger" && (
                <div className="p-2 bg-red-500/10 text-red-500 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                </div>
              )}
              {config.type === "warning" && (
                <div className="p-2 bg-brand-gold/10 text-brand-gold rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
                  </svg>
                </div>
              )}
              {config.type === "info" && (
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 111.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0Zm-9-3.75h.008v.008H12V8.25Z" />
                  </svg>
                </div>
              )}
              {config.type === "success" && (
                <div className="p-2 bg-green-500/10 text-green-400 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0Z" />
                  </svg>
                </div>
              )}
              <h3 className="text-xs font-bold uppercase tracking-widest text-brand-text">
                {config.title}
              </h3>
            </div>

            {/* Message Body */}
            <p className="text-xs text-brand-text/70 leading-relaxed font-light">
              {config.message}
            </p>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 mt-2">
              {!isAlert && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="h-9 px-4 border border-brand-border/80 hover:bg-brand-card-hover text-brand-text/60 hover:text-brand-text text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer active:scale-95"
                >
                  {config.cancelLabel}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                className={`h-9 px-5 text-[10px] font-bold uppercase tracking-widest text-white rounded-xl transition-all cursor-pointer active:scale-95 ${
                  config.type === "danger"
                    ? "bg-red-600 hover:bg-red-500"
                    : config.type === "warning"
                    ? "bg-brand-primary hover:bg-brand-primary-hover"
                    : config.type === "success"
                    ? "bg-green-600 hover:bg-green-500"
                    : "bg-brand-primary hover:bg-brand-primary-hover"
                }`}
              >
                {config.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}
