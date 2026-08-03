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
import type { AiUndoStepDTO, ChatMessageDTO } from '@atlas/shared';
import type { CaptureContext } from '@/components/home/HomeCapture';
import { applyUndoBatch } from '@/lib/api';

const SIDEBAR_KEY = 'atlas.sidebar.collapsed';

/** One thing Atlas changed, and how to put it back. */
export interface AtlasChange {
  id: string;
  /** The server's plain-language sentence, e.g. "Added task: book flights". */
  summary: string;
  at: number;
  /** Server-built inverses. Empty means the write cannot be reversed. */
  undo: AiUndoStepDTO[];
  undone: boolean;
}

/** Enough to be a record, few enough to stay readable at a glance. */
const MAX_CHANGES = 12;

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
  /**
   * Time window attached to the capture dock, set by "Plan" on a full-day gap.
   * Lives here because the gap button and the dock are on opposite ends of the
   * tree (a page section vs. the app shell).
   */
  captureContext: CaptureContext | null;
  /** Sets the window AND pulls focus into the dock. */
  planWindow: (context: CaptureContext) => void;
  clearCaptureContext: () => void;
  /** Bumped by planWindow so the dock knows to focus its input. */
  captureFocusToken: number;
  /**
   * What Atlas has changed this session, newest first.
   *
   * Every AI write already returned a server-built inverse, but it was only
   * ever offered inside a toast — so the record of what an AI did to your data
   * lasted about four seconds. Giving delete permission to a model is only
   * reasonable if you can see what it used it for.
   */
  changes: AtlasChange[];
  recordChanges: (entries: { summary: string; undo: AiUndoStepDTO[] }[]) => void;
  undoChange: (id: string) => Promise<void>;
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
  const [captureContext, setCaptureContext] = useState<CaptureContext | null>(null);
  const [captureFocusToken, setCaptureFocusToken] = useState(0);
  const [changes, setChanges] = useState<AtlasChange[]>([]);

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

  const planWindow = useCallback((context: CaptureContext) => {
    setCaptureContext(context);
    setCaptureFocusToken((t) => t + 1);
  }, []);

  const clearCaptureContext = useCallback(() => setCaptureContext(null), []);

  const recordChanges = useCallback(
    (entries: { summary: string; undo: AiUndoStepDTO[] }[]) => {
      if (entries.length === 0) return;
      const now = Date.now();
      setChanges((prev) =>
        [
          ...entries.map((e, i) => ({
            id: `${now}-${i}`,
            summary: e.summary,
            at: now,
            undo: e.undo,
            undone: false,
          })),
          ...prev,
        ].slice(0, MAX_CHANGES),
      );
    },
    [],
  );

  const undoChange = useCallback(async (id: string) => {
    let steps: AiUndoStepDTO[] = [];
    setChanges((prev) => {
      const hit = prev.find((c) => c.id === id);
      if (hit && !hit.undone) steps = hit.undo;
      return prev;
    });
    if (steps.length === 0) return;
    await applyUndoBatch(steps);
    // Marked rather than removed: a row that vanishes the moment you undo it
    // leaves you unsure whether anything happened.
    setChanges((prev) => prev.map((c) => (c.id === id ? { ...c, undone: true } : c)));
  }, []);

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
      captureContext,
      planWindow,
      clearCaptureContext,
      captureFocusToken,
      changes,
      recordChanges,
      undoChange,
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
      captureContext,
      planWindow,
      clearCaptureContext,
      captureFocusToken,
      changes,
      recordChanges,
      undoChange,
    ],
  );

  return <AtlasUiContext.Provider value={value}>{children}</AtlasUiContext.Provider>;
}
