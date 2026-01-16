import React from 'react';

type ToastApi = {
  show: (msg: string) => void;
};

const ToastCtx = React.createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = React.useState<string>('');
  const [open, setOpen] = React.useState<boolean>(false);
  const tRef = React.useRef<number | null>(null);

  const show = (m: string) => {
    setMsg(m);
    setOpen(true);
    if (tRef.current) window.clearTimeout(tRef.current);
    tRef.current = window.setTimeout(() => setOpen(false), 1600);
  };

  React.useEffect(() => {
    return () => {
      if (tRef.current) window.clearTimeout(tRef.current);
    };
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className={open ? 'toast show' : 'toast'} role="status" aria-live="polite">
        {msg}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) {
    // provider 밖에서도 죽지 않게 no-op
    return { show: () => {} } as ToastApi;
  }
  return ctx;
}
