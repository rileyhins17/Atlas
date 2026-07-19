'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ChatMessageDTO } from '@atlas/shared';

const SIDEBAR_KEY = 'atlas.sidebar.collapsed';

export interface AtlasUi {
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  /** Open the chat rail; with `ask`, the question is submitted on open. */
  openChat: (ask?: string) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** Chat transcript lives here so it survives the rail closing. */
  messages: ChatMessageDTO[];
  setMessages: (update: (m: ChatMessageDTO[]) => ChatMessageDTO[]) => void;
  /** Question queued by openChat(ask) for the rail to send once mounted. */
  pendingAsk: string | null;
  consumePendingAsk: () => string | null;
}

const AtlasUiContext = createContext<AtlasUi | null>(null);

export function useAtlasUi(): AtlasUi {
  const ctx = useContext(AtlasUiContext);
  if (!ctx) throw new Error('useAtlasUi must be used inside AtlasUiProvider');
  return ctx;
}

/**
 * Ambient-AI UI state: the ⌘K command bar, the ⌘J chat rail (with its
 * transcript), and the ⌘\ sidebar. One global keydown listener owns all three
 * shortcuts so they work from any screen.
 */
export function AtlasUiProvider({ children }: { children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [messages, setMessagesState] = useState<ChatMessageDTO[]>([]);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);

  // Restore the sidebar preference after mount (SSR-safe).
  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_KEY) === '1') setSidebarCollapsed(true);
    } catch {
      /* private mode */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, prev ? '0' : '1');
      } catch {
        /* private mode */
      }
      return !prev;
    });
  }, []);

  const openChat = useCallback((ask?: string) => {
    if (ask) setPendingAsk(ask);
    setChatOpen(true);
    setCommandOpen(false);
  }, []);

  const consumePendingAsk = useCallback(() => {
    const ask = pendingAsk;
    if (ask) setPendingAsk(null);
    return ask;
  }, [pendingAsk]);

  const setMessages = useCallback(
    (update: (m: ChatMessageDTO[]) => ChatMessageDTO[]) => setMessagesState(update),
    [],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      } else if (key === 'j') {
        e.preventDefault();
        setChatOpen((v) => !v);
      } else if (e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);

  const value = useMemo<AtlasUi>(
    () => ({
      commandOpen,
      setCommandOpen,
      chatOpen,
      setChatOpen,
      openChat,
      sidebarCollapsed,
      toggleSidebar,
      messages,
      setMessages,
      pendingAsk,
      consumePendingAsk,
    }),
    [
      commandOpen,
      chatOpen,
      openChat,
      sidebarCollapsed,
      toggleSidebar,
      messages,
      setMessages,
      pendingAsk,
      consumePendingAsk,
    ],
  );

  return <AtlasUiContext.Provider value={value}>{children}</AtlasUiContext.Provider>;
}
