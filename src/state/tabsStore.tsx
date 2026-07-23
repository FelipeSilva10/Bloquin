import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { BoardKey } from '../blockly/boards';

export type TabType = 'dashboard' | 'project';
export type ProjectSource = 'remote' | 'memory' | 'local-file';
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
  dirty: boolean;
}

interface TabsContextValue {
  tabs: ProjectTab[];
  activeTabId: string;
  activeTab: ProjectTab;
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
    setTabs([
      ...current,
      { ...input, id: openedId, type: 'project', dirty: input.dirty ?? false },
    ]);
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
    setTabs(next);
    if (activeTabId === id) setActiveTabId(next[Math.max(0, index - 1)]?.id ?? 'dashboard');
  }, [activeTabId]);

  const updateTab = useCallback((id: string, patch: Partial<ProjectTab>) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, ...patch } : tab));
  }, []);

  const resetTabs = useCallback(() => {
    setTabs([dashboardTab]);
    setActiveTabId('dashboard');
  }, []);

  const value = useMemo<TabsContextValue>(() => ({
    tabs,
    activeTabId,
    activeTab: tabs.find((tab) => tab.id === activeTabId) ?? dashboardTab,
    openProject,
    activateTab,
    closeTab,
    updateTab,
    resetTabs,
  }), [tabs, activeTabId, openProject, activateTab, closeTab, updateTab, resetTabs]);

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('useTabs precisa estar dentro de TabsProvider.');
  return context;
}
