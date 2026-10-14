import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { PublicProfileModal } from '../components/PublicProfileModal';

interface CtxValue {
  openProfile: (userId: string) => void;
}

const Ctx = createContext<CtxValue>({ openProfile: () => {} });

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);

  const value = useMemo(
    () => ({ openProfile: (id: string) => setUserId(id) }),
    [],
  );

  const close = useCallback(() => setUserId(null), []);

  return (
    <Ctx.Provider value={value}>
      {children}
      <PublicProfileModal userId={userId} onClose={close} />
    </Ctx.Provider>
  );
}

export function useOpenProfile(): (userId: string) => void {
  return useContext(Ctx).openProfile;
}