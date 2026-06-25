import 'react';

declare module 'react' {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    toolautosubmit?: boolean;
    toolparamdescription?: string;
  }
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: any) => string;
      remove: (widgetId: string) => void;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}
