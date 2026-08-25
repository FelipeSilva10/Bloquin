import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { BoardKey } from '../blockly/boards';
import type { LibraryPost } from '../types/library';

export type TabType = 'dashboard' | 'library' | 'library-resource' | 'components' | 'sag' | 'documentation' | 'project';
export type ProjectSource = 'remote' | 'memory' | 'local-file';
export type LibraryResourceKind = 'post' | 'image' | 'pdf';
export type InternalPageType = 'library' | 'components' | 'sag' | 'documentation';
export const MAX_OPEN_TABS = 8;

export interface ProjectTab {
  id: string;
  type: TabType;
  title: string;
  source?: ProjectSource;
  projectId?: string;
  filePath?: string;
  board?: BoardKey | null;
  workspaceData?: Record<string, unknown>;
  readOnly?: boolean;
  libraryPost?: LibraryPost;
  libraryAttachmentId?: string;
  libraryResourceKind?: LibraryResourceKind;
  libraryViewState?: {
    page?: number;
    zoom?: number;
  };
  /** Usado só pela aba de Documentação, para abrir já focada num bloco específico. */
  focusBlockType?: string;
  dirty: boolean;
}

interface OpenLibraryResourceInput {
  post: LibraryPost;
  attachmentId?: string;
}

const INTERNAL_PAGE_TITLES: Record<InternalPageType, string> = {
  library: 'Biblioteca',
  components: 'Componentes',
  sag: 'SAG',
  documentation: 'Documentação',
};

interface TabsContextValue {
  tabs: ProjectTab[];
  activeTabId: string;
  activeTab: ProjectTab;
  openInternalPage: (type: InternalPageType) => string | null;
  openLibrary: () => string | null;
  openLibraryResource: (input: OpenLibraryResourceInput) => string | null;
  openProject: (tab: Omit<ProjectTab, 'id' | 'type' | 'dirty'> & { dirty?: boolean }) => string | null;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<ProjectTab>) => void;
  resetTabs: () => void;
}

const dashboardTab: ProjectTab = { id: 'dashboard', type: 'dashboard', title: 'Início', dirty: false };
const TabsContext = createContext<TabsContextValue | null>(null);

function makeId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<ProjectTab[]>([dashboardTab]);
  const [activeTabId, setActiveTabId] = useState('dashboard');
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const openProject = useCallback((input: Omit<ProjectTab, 'id' | 'type' | 'dirty'> & { dirty?: boolean }) => {
    const current = tabsRef.current;
    const existing = input.projectId
      ? current.find((tab) => tab.projectId === input.projectId && tab.source === 'remote')
      : input.filePath
        ? current.find((tab) => tab.filePath === input.filePath)
        : undefined;

    if (existing) {
      setActiveTabId(existing.id);
      return existing.id;
    }

    if (current.length >= MAX_OPEN_TABS) return null;

    const openedId = makeId();
    const next: ProjectTab[] = [
      ...current,
      { ...input, id: openedId, type: 'project', dirty: input.dirty ?? false },
    ];
    tabsRef.current = next;
    setTabs(next);
    setActiveTabId(openedId);
    return openedId;
  }, []);

  const openInternalPage = useCallback((type: InternalPageType) => {
    const current = tabsRef.current;
    const existing = current.find((tab) => tab.type === type);
    if (existing) {
      setActiveTabId(existing.id);
      return existing.id;
    }

    if (current.length >= MAX_OPEN_TABS) return null;

    const tab: ProjectTab = {
      id: type,
      type,
      title: INTERNAL_PAGE_TITLES[type],
      dirty: false,
    };
    const next = [...current, tab];
    tabsRef.current = next;
    setTabs(next);
    setActiveTabId(tab.id);
    return tab.id;
  }, []);

  const openLibrary = useCallback(() => openInternalPage('library'), [openInternalPage]);

  const openLibraryResource = useCallback(({ post, attachmentId }: OpenLibraryResourceInput) => {
    const attachment = attachmentId
      ? post.anexos.find((item) => item.id === attachmentId)
      : undefined;
    const kind: LibraryResourceKind = attachment?.tipo === 'image' || attachment?.tipo === 'pdf'
      ? attachment.tipo
      : 'post';
    const openedId = attachment
      ? `library-${kind}-${attachment.id}`
      : `library-post-${post.id}`;
    const current = tabsRef.current;
    const existing = current.find((tab) => tab.id === openedId);
    const title = attachment?.titulo?.trim() || (kind === 'pdf'
      ? 'Documento PDF'
      : kind === 'image'
        ? 'Imagem'
        : post.titulo);

    if (existing) {
      const next = current.map((tab) => tab.id === openedId ? { ...tab, libraryPost: post, title } : tab);
      tabsRef.current = next;
      setTabs(next);
      setActiveTabId(openedId);
      return openedId;
    }

    if (current.length >= MAX_OPEN_TABS) return null;

    const next: ProjectTab[] = [
      ...current,
      {
        id: openedId,
        type: 'library-resource',
        title,
        libraryPost: post,
        libraryAttachmentId: attachment?.id,
        libraryResourceKind: kind,
        libraryViewState: { page: 1, zoom: 1 },
        dirty: false,
      },
    ];
    tabsRef.current = next;
    setTabs(next);
    setActiveTabId(openedId);
    return openedId;
  }, []);

  const activateTab = useCallback((id: string) => {
    setActiveTabId(tabsRef.current.some((tab) => tab.id === id) ? id : 'dashboard');
  }, []);

  const closeTab = useCallback((id: string) => {
    if (id === 'dashboard') return;
    const current = tabsRef.current;
    const index = current.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const next = current.filter((tab) => tab.id !== id);
    tabsRef.current = next;
    setTabs(next);
    if (activeTabId === id) setActiveTabId(next[Math.max(0, index - 1)]?.id ?? 'dashboard');
  }, [activeTabId]);

  const updateTab = useCallback((id: string, patch: Partial<ProjectTab>) => {
    const next = tabsRef.current.map((tab) => tab.id === id ? { ...tab, ...patch } : tab);
    tabsRef.current = next;
    setTabs(next);
  }, []);

  const resetTabs = useCallback(() => {
    tabsRef.current = [dashboardTab];
    setTabs([dashboardTab]);
    setActiveTabId('dashboard');
  }, []);

  const value = useMemo<TabsContextValue>(() => ({
    tabs,
    activeTabId,
    activeTab: tabs.find((tab) => tab.id === activeTabId) ?? dashboardTab,
    openInternalPage,
    openLibrary,
    openLibraryResource,
    openProject,
    activateTab,
    closeTab,
    updateTab,
    resetTabs,
  }), [tabs, activeTabId, openInternalPage, openLibrary, openLibraryResource, openProject, activateTab, closeTab, updateTab, resetTabs]);

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('useTabs precisa estar dentro de TabsProvider.');
  return context;
}
