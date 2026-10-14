import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { ConfirmDialog, type ConfirmDialogState } from '../components/ConfirmDialog';

interface CtxValue {
  confirm: (
    opts: Omit<ConfirmDialogState, 'onConfirm'>,
  ) => Promise<boolean>;
}

const Ctx = createContext<CtxValue>({
  confirm: () => Promise.resolve(false),
});

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmDialogState | null>(null);
  const [resolver, setResolver] = useState<
    ((v: boolean) => void) | null
  >(null);

  const confirm = useCallback(
    (opts: Omit<ConfirmDialogState, 'onConfirm'>): Promise<boolean> =>
      new Promise((resolve) => {
        setResolver(() => resolve);
        setState({
          ...opts,
          onConfirm: () => {
            resolve(true);
            setState(null);
            setResolver(null);
          },
        });
      }),
    [],
  );

  const handleClose = useCallback(() => {
    resolver?.(false);
    setState(null);
    setResolver(null);
  }, [resolver]);

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog state={state} onClose={handleClose} />
    </Ctx.Provider>
  );
}

export function useConfirm(): CtxValue['confirm'] {
  return useContext(Ctx).confirm;
}