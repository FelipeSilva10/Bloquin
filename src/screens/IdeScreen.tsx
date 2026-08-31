import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as PtBr from 'blockly/msg/pt-br';
import {
  BookOpen,
  Check,
  Code2,
  Copy,
  Ellipsis,
  FileJson,
  LogOut,
  MessageCircle,
  RefreshCw,
  Save,
  SaveAll,
  Upload,
  Usb,
} from 'lucide-react';
import { ProjectService } from '../services/projectService';
import { HardwareService, type UploadProgress } from '../services/hardwareService';
import { watchIntervention, stopWatchingIntervention } from "../services/sessionService"; // Novo serviço de sessão
import { BoardSelectionModal } from '../components/modals/BoardSelectionModal';
import { UploadModal, UploadStage } from '../components/modals/UploadModal';
import { OrphanModal } from '../components/modals/OrphanModal';
import { SerialMonitor, SerialMessage } from '../components/modals/SerialMonitor';
import { ErrorModal, FriendlyError, getFriendlyError } from '../components/modals/ErrorModal';
import InterventionModal from "../components/modals/InterventionModal"; // Modal de bloqueio de tela
import { ResponsiveToolbarButton } from '../components/ResponsiveToolbarButton';
import { BloquinSelect } from '../components/forms/BloquinSelect';
import logoSimples from '../assets/LogoSimples.png';
import LZString from 'lz-string';
import { MAX_OPEN_TABS, useTabs } from '../state/tabsStore';
import { useSetup } from '../state/setupStore';
import { createProjectFile } from '../types/project';
import { exportLocalProjectFile, isTauriRuntime, saveLocalProjectFile } from '../services/localProjectService';
import { writeLocalProject } from '../services/localProjectStore';

import { type BoardKey, BOARD_UNSET, BOARDS } from '../blockly/boards';
import { auditSerializedWorkspace, auditWorkspace } from '../blockly/audit';
import { BLOCK_NAMES, getToolboxConfig } from '../blockly/toolbox';
import { bloquinTheme } from '../blockly/theme';

Blockly.setLocale(PtBr as any);

// O Blockly monta a URL deste sprite em runtime, então o Vite não consegue
// descobri-lo apenas pela string "sprites.png" do pacote. Referenciar o asset
// estaticamente garante que lixeira e zoom também existam no bundle Tauri.
const blocklyControlsSpriteUrl = new URL(
  '../../node_modules/blockly/media/sprites.png',
  import.meta.url,
).href;
const xlinkNamespace = 'http://www.w3.org/1999/xlink';

function bindBundledBlocklyControlSprites(container: HTMLElement) {
  for (const image of container.querySelectorAll<SVGImageElement>('image')) {
    const href = image.getAttribute('href') ?? image.getAttributeNS(xlinkNamespace, 'href') ?? '';
    if (!href.endsWith('sprites.png')) continue;
    image.setAttribute('href', blocklyControlsSpriteUrl);
    image.setAttributeNS(xlinkNamespace, 'href', blocklyControlsSpriteUrl);
  }
}

function BoardBadge({ boardKey }: { boardKey: BoardKey }) {
  const colorMap: Record<BoardKey, string> = { uno: '#0984e3', nano: '#ff00d0', esp32: '#e17055' };
  const color = colorMap[boardKey];
  return (
    <div className="board-badge" style={{ background: `${color}15`, border: `2px solid ${color}55`, color }}>
      <span className="board-badge-dot" style={{ background: color }} />
      <span className="board-badge-label">{BOARDS[boardKey].name}</span>
    </div>
  );
}

interface IdeScreenProps { role: 'student' | 'teacher' | 'guest'; userId?: string; readOnly?: boolean; onBack: () => void; projectId?: string; initialWorkspaceData?: Record<string, unknown>; initialBoard?: BoardKey | null; }
type BoardLoadState = 'resolving' | 'selecting' | 'ready' | 'error';
const TOP_LEVEL_BLOCK_TYPES = new Set(['bloco_setup', 'bloco_loop', 'declarar_variavel_global', 'definir_funcao', 'definir_funcao_retorno']);

export function IdeScreen({ role, userId, readOnly = false, onBack, projectId, initialWorkspaceData, initialBoard = null }: IdeScreenProps) {
  const blocklyDiv = useRef<HTMLDivElement>(null);
  const workspace  = useRef<Blockly.WorkspaceSvg | null>(null);
  const codeGeneratorRef = useRef<any>(null);
  const codeGenerationFrame = useRef<number | null>(null);
  const workspaceAuditTimer = useRef<number | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const { activeTab, updateTab, openInternalPage } = useTabs();
  const navigate = useNavigate();

  const openDocumentation = () => {
    const id = openInternalPage('documentation');
    if (!id) {
      window.alert(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
      return;
    }
    navigate('/documentacao', { state: { workspaceTabId: id } });
  };
  const dirtyRef = useRef(activeTab.dirty);
  const projectNameRef = useRef(activeTab.title || 'Projeto');
  const workspaceLoadFailedRef = useRef(false);
  const setup = useSetup();

  const [board, setBoard]                   = useState<BoardKey | null>(initialBoard);
  const [boardLoadState, setBoardLoadState] = useState<BoardLoadState>(projectId ? 'resolving' : initialBoard ? 'resolving' : 'selecting');
  const pendingWorkspaceData = useRef<unknown>(null);
  const [port, setPort]                     = useState('');
  const [availablePorts, setAvailablePorts]     = useState<string[]>([]);
  const [isRefreshingPorts, setIsRefreshingPorts] = useState(false);
  const [generatedCode, setGeneratedCode]       = useState('// O código C++ aparecerá aqui...');
  const [isSaving, setIsSaving]                 = useState(false);
  const [projectName, setProjectName]           = useState(activeTab.title || 'Projeto');
  const [saveStatus, setSaveStatus]             = useState<'saved' | 'exported' | null>(null);
  const [isExporting, setIsExporting]           = useState(false);
  const [isSerialOpen, setIsSerialOpen]         = useState(false);
  const [isSerialStarting, setIsSerialStarting] = useState(false);
  const [serialMessages, setSerialMessages]     = useState<SerialMessage[]>([]);
  const [isDirty, setIsDirty]                   = useState(activeTab.dirty);
  const [showExitConfirm, setShowExitConfirm]   = useState(false);
  const trackChanges                            = useRef(false); 
  const [isCodeVisible, setIsCodeVisible]       = useState(false);
  const [isFullscreenCode, setIsFullscreenCode] = useState(false);
  const [uploadStage, setUploadStage]           = useState<UploadStage | null>(null);
  const [orphanWarning, setOrphanWarning]       = useState<string[]>([]);
  const isUploadingRef                          = useRef(false);
  const [isUploading, setIsUploading]            = useState(false);
  const [friendlyError, setFriendlyError]       = useState<FriendlyError | null>(null);

  // Novos estados do patch
  const [copied, setCopied] = useState(false);
  const [intervention, setIntervention] = useState<{ teacher_name: string } | null>(null);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFeedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    if (!isMoreOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setIsMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMoreOpen(false);
        window.requestAnimationFrame(() => {
          moreMenuRef.current?.querySelector<HTMLButtonElement>('.ide-more-toggle')?.focus();
        });
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMoreOpen]);

  const closeMoreMenu = (restoreFocus = false) => {
    setIsMoreOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        moreMenuRef.current?.querySelector<HTMLButtonElement>('.ide-more-toggle')?.focus();
      });
    }
  };

  useEffect(() => () => {
    if (copyTimeout.current) clearTimeout(copyTimeout.current);
    if (saveFeedbackTimeout.current) clearTimeout(saveFeedbackTimeout.current);
  }, []);

  const fetchPorts = useCallback(async () => {
    setIsRefreshingPorts(true);
    try {
      const ports = await HardwareService.getAvailablePorts();
      setAvailablePorts(ports);
      setPort((currentPort) => ports.includes(currentPort) ? currentPort : ports[0] ?? '');
    } catch (err) {
      setFriendlyError(getFriendlyError(String(err)));
    } finally {
      setIsRefreshingPorts(false);
    }
  }, []);

  const getOrphanedBlocks = (): string[] => {
    if (!workspace.current) return [];
    return workspace.current.getTopBlocks(false)
      .filter(b => !TOP_LEVEL_BLOCK_TYPES.has(b.type))
      .map(b => BLOCK_NAMES[b.type] ?? b.type);
  };

  const initializeBlocklyModules = async () => {
    const { initBlocks } = await import('../blockly/blocks');
    const { initGenerators, generateCode } = await import('../blockly/generators');
    initBlocks();
    initGenerators();
    codeGeneratorRef.current = generateCode;
  };

  // ─── Watcher de Intervenção do Professor ────────────────────────────────────
  useEffect(() => {
    if (role !== "student") return;

    let isMounted = true;
    
    if (!userId) return;

    watchIntervention(userId, (payload) => {
      if (isMounted) setIntervention(payload); // null desbloqueia a tela
    });

    return () => {
      isMounted = false;
      stopWatchingIntervention();
    };
  }, [role, userId]);

  // ─── Carregamento Inicial do Projeto ────────────────────────────────────────
  useEffect(() => {
    if (!projectId) {
      pendingWorkspaceData.current = initialWorkspaceData ?? null;
      if (initialBoard && initialBoard in BOARDS) {
        (async () => {
          const { syncBoardPins } = await import('../blockly/blocks');
          syncBoardPins(initialBoard);
          setBoard(initialBoard);
          await initializeBlocklyModules();
          setBoardLoadState('ready');
        })();
      }
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await ProjectService.getProjectData(projectId);      
      if (cancelled) return;
      if (error || !data) {
        if (initialWorkspaceData && initialBoard && initialBoard in BOARDS) {
          const { syncBoardPins } = await import('../blockly/blocks');
          syncBoardPins(initialBoard);
          pendingWorkspaceData.current = initialWorkspaceData;
          setBoard(initialBoard);
          await initializeBlocklyModules();
          setBoardLoadState('ready');
          return;
        }
        setBoardLoadState('selecting');
        setFriendlyError({ emoji: '📂', title: 'Não consegui abrir o projeto', message: 'O projeto não pôde ser carregado agora.', tip: 'Você pode escolher uma placa para continuar ou voltar ao painel.', rawError: error?.message ?? 'Projeto não encontrado.' });
        return;
      }

      setProjectName(data.nome);
      // A cópia em memória da aba é mais recente que o banco quando existem
      // edições ainda não salvas.
      pendingWorkspaceData.current = initialWorkspaceData ?? data.workspace_data ?? null;

      const raw = data.target_board as string | null | undefined;
      if (!raw || raw === BOARD_UNSET) { setBoardLoadState('selecting'); return; }

      if (raw in BOARDS) {
        const key = raw as BoardKey;
        const { syncBoardPins } = await import('../blockly/blocks'); 
        syncBoardPins(key);
        setBoard(key);
        await initializeBlocklyModules();
        setBoardLoadState('ready');
      } else {
        setBoardLoadState('error');
        setFriendlyError({
          emoji: '⚠️', title: 'Placa desconhecida no projeto!', message: `O projeto foi salvo com a placa "${raw}", que não é reconhecida.`, tip: 'Contate o suporte ou o professor. O projeto não foi carregado.', rawError: `target_board="${raw}" não existe em BOARDS.`,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, initialBoard, initialWorkspaceData]);

  useEffect(() => {
    dirtyRef.current = isDirty;
    projectNameRef.current = projectName;
    updateTab(activeTab.id, { dirty: isDirty, title: projectName || activeTab.title, board });
  }, [activeTab.id, activeTab.title, isDirty, projectName, board, updateTab]);

  const handleBoardSelected = async (selected: BoardKey) => {
    try {
      const { syncBoardPins } = await import('../blockly/blocks');
      syncBoardPins(selected);
      if (projectId) {
        const { error } = await ProjectService.updateBoard(projectId, selected);
        if (error) throw error;
      }
      setBoard(selected);
      await initializeBlocklyModules();
      setBoardLoadState('ready');
    } catch (error) {
      setFriendlyError({ emoji: '🧩', title: 'Não consegui configurar a placa', message: 'A placa não pôde ser preparada para este projeto.', tip: 'Verifique sua conexão e tente escolher a placa novamente.', rawError: String(error) });
    }
  };

  useEffect(() => { void fetchPorts(); }, [fetchPorts]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const cleanup = await HardwareService.listenUploadResult((payload) => {
        if (payload === 'ok') setUploadStage('success');
        else if (payload.startsWith('err:')) {
          setUploadStage(null);
          setFriendlyError(getFriendlyError(payload.slice(4)));
        }
        isUploadingRef.current = false;
        setIsUploading(false);
      });
      if (disposed) cleanup();
      else unlisten = cleanup;
    })();
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const cleanup = await HardwareService.listenUploadProgress((payload: UploadProgress) => {
        console.info(
          `[UPLOAD][TIMING] ${payload.stage}/${payload.status}: ${payload.elapsedMs} ms (total ${payload.totalElapsedMs} ms)`,
        );
        if (payload.status !== 'started') return;

        if (payload.stage === 'checking-core' || payload.stage === 'preparing') {
          setUploadStage('validating');
        } else if (payload.stage === 'compiling') {
          setUploadStage('compiling');
        } else if (payload.stage === 'sending') {
          setUploadStage('sending');
        }
      });
      if (disposed) cleanup();
      else unlisten = cleanup;
    })();
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    if (boardLoadState !== 'ready' || !board || !blocklyDiv.current || workspace.current) return;

    workspace.current = Blockly.inject(blocklyDiv.current, {
      toolbox: getToolboxConfig(board),
      grid: { spacing: 24, length: 4, colour: '#d8e0ec', snap: true },
      readOnly,
      move: { scrollbars: true, drag: true, wheel: true },
      theme: bloquinTheme,
      zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
      trashcan: true,
      sounds: false,
    });
    bindBundledBlocklyControlSprites(blocklyDiv.current);

    const generateCurrentCode = () => {
      if (!workspace.current || !codeGeneratorRef.current) return;
      try {
        setGeneratedCode(codeGeneratorRef.current(workspace.current, board) || '// Arraste blocos para dentro de PREPARAR e AGIR!');
      } catch (e) {
        console.error('Erro ao gerar código:', e);
        setGeneratedCode('// Não foi possível gerar o código. Revise o último bloco alterado.');
      }
    };

    let isApplyingWorkspaceAudit = false;
    const runWorkspaceAudit = () => {
      if (!workspace.current || isApplyingWorkspaceAudit) return;
      isApplyingWorkspaceAudit = true;
      try {
        auditWorkspace(workspace.current, board);
      } finally {
        isApplyingWorkspaceAudit = false;
      }
    };

    workspace.current.addChangeListener((event) => {
      if (event.isUiEvent || isApplyingWorkspaceAudit) return;
      if (trackChanges.current) {
        dirtyRef.current = true;
        setIsDirty(true);
      }
      // Drag/connection events can arrive in bursts. Generate at most once
      // per animation frame so Blockly remains responsive on larger graphs.
      if (codeGenerationFrame.current === null) {
        codeGenerationFrame.current = window.requestAnimationFrame(() => {
          codeGenerationFrame.current = null;
          generateCurrentCode();
        });
      }
      if (workspaceAuditTimer.current !== null) {
        window.clearTimeout(workspaceAuditTimer.current);
      }
      workspaceAuditTimer.current = window.setTimeout(() => {
        workspaceAuditTimer.current = null;
        runWorkspaceAudit();
      }, 220);

      // Projeto local (sem conta) grava sozinho em disco — ninguém precisa
      // lembrar de clicar em Salvar. 1.8s de espera evita gravar a cada
      // pequeno movimento de bloco.
      if (!projectId && activeTab.source === 'local-file' && activeTab.filePath && isTauriRuntime()) {
        const filePath = activeTab.filePath;
        if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = window.setTimeout(() => {
          autosaveTimer.current = null;
          if (!workspace.current) return;
          const file = createProjectFile({
            name: projectNameRef.current || 'Meu projeto',
            targetBoard: board,
            workspace: Blockly.serialization.workspaces.save(workspace.current) as Record<string, unknown>,
          });
          writeLocalProject(filePath, file)
            .then(() => {
              dirtyRef.current = false;
              setIsDirty(false);
            })
            .catch(() => {
              // Falha silenciosa: o botão Salvar continua disponível e o
              // indicador de alterações não salvas permanece ativo.
            });
        }, 1800);
      }
    });

    const ensureRootBlocks = () => {
      if (!workspace.current) return;
      let s = workspace.current.getTopBlocks(false).find(b => b.type === 'bloco_setup');
      if (!s) { s = workspace.current.newBlock('bloco_setup'); s.moveBy(50, 50); s.initSvg(); s.render(); }
      s.setDeletable(false);
      let l = workspace.current.getTopBlocks(false).find(b => b.type === 'bloco_loop');
      if (!l) { l = workspace.current.newBlock('bloco_loop'); l.moveBy(450, 50); l.initSvg(); l.render(); }
      l.setDeletable(false);
    };

    const savedData = pendingWorkspaceData.current;
    if (savedData) {
      try {
        const raw = typeof savedData === 'string'
          ? (() => {
              const decompressed = LZString.decompressFromBase64(savedData);
              if (!decompressed) throw new Error('Os dados compactados do projeto são inválidos.');
              return JSON.parse(decompressed);
            })()
          : savedData;
        if (raw && Object.keys(raw).length > 0) {
          const serializedIssues = auditSerializedWorkspace(raw, board);
          if (serializedIssues.length > 0) throw new Error(serializedIssues.join('\n'));
          Blockly.serialization.workspaces.load(raw, workspace.current);
        }
      } catch (error) {
        workspaceLoadFailedRef.current = true;
        setFriendlyError({
          emoji: '🛟',
          title: 'O projeto precisa de recuperação',
          message: 'Os blocos salvos não puderam ser carregados. O salvamento foi bloqueado para proteger o conteúdo original.',
          tip: 'Volte ao painel e peça ajuda antes de substituir este projeto.',
          rawError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    ensureRootBlocks();
    if (!workspaceLoadFailedRef.current && codeGeneratorRef.current) {
      setGeneratedCode(
        codeGeneratorRef.current(workspace.current, board)
        || '// Arraste blocos para dentro de PREPARAR e AGIR!',
      );
      runWorkspaceAudit();
    }
    const trackTimer = setTimeout(() => { trackChanges.current = true; }, 300);
    
    return () => {
      clearTimeout(trackTimer);
      if (codeGenerationFrame.current !== null) {
        window.cancelAnimationFrame(codeGenerationFrame.current);
        codeGenerationFrame.current = null;
      }
      if (workspaceAuditTimer.current !== null) {
        window.clearTimeout(workspaceAuditTimer.current);
        workspaceAuditTimer.current = null;
      }
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      trackChanges.current = false;
      if (workspace.current) {
        if (!workspaceLoadFailedRef.current) {
          const workspaceData = Blockly.serialization.workspaces.save(workspace.current) as Record<string, unknown>;
          updateTab(activeTab.id, {
            workspaceData,
            board,
            dirty: dirtyRef.current,
          });
          // Troca de aba/fechamento não deve esperar o debounce: grava agora
          // se havia alterações pendentes.
          if (!projectId && activeTab.source === 'local-file' && activeTab.filePath && dirtyRef.current && isTauriRuntime()) {
            const file = createProjectFile({
              name: projectNameRef.current || 'Meu projeto',
              targetBoard: board,
              workspace: workspaceData,
            });
            void writeLocalProject(activeTab.filePath, file);
          }
        }
        workspace.current.dispose();
        workspace.current = null;
      }
    };
  }, [activeTab.id, board, boardLoadState, readOnly, updateTab]);

  useEffect(() => {
    const container = blocklyDiv.current;
    const currentWorkspace = workspace.current;
    if (boardLoadState !== 'ready' || !container || !currentWorkspace) return;

    let disposed = false;
    let resizeFrame: number | null = null;

    const resizeWorkspace = () => {
      resizeFrame = null;
      if (disposed || workspace.current !== currentWorkspace || !container.isConnected) return;

      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      Blockly.svgResize(currentWorkspace);
    };

    const scheduleWorkspaceResize = () => {
      if (disposed || resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(resizeWorkspace);
    };

    // Blockly listens to window.resize, but that does not cover every change
    // to its flex container (responsive toolbar, code panel and WebView layout).
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleWorkspaceResize);
    resizeObserver?.observe(container);

    window.addEventListener('resize', scheduleWorkspaceResize);
    window.visualViewport?.addEventListener('resize', scheduleWorkspaceResize);
    document.addEventListener('fullscreenchange', scheduleWorkspaceResize);

    // Font metrics can finish after the first Blockly render and alter the
    // toolbar height without a global resize event.
    void document.fonts?.ready.then(scheduleWorkspaceResize);
    scheduleWorkspaceResize();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleWorkspaceResize);
      window.visualViewport?.removeEventListener('resize', scheduleWorkspaceResize);
      document.removeEventListener('fullscreenchange', scheduleWorkspaceResize);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    };
  }, [boardLoadState, isCodeVisible, isFullscreenCode, role]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    let unlistenReady: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const [messageCleanup, errorCleanup, readyCleanup] = await Promise.all([
        HardwareService.listenSerialMessages((payload) => {
          const msg: SerialMessage = { text: payload, ts: Date.now() };
          setSerialMessages(prev => {
            const next = [...prev, msg];
            return next.length > 50 ? next.slice(next.length - 50) : next;
          });
        }),
        HardwareService.listenSerialError((payload) => {
          setIsSerialOpen(false);
          setIsSerialStarting(false);
          setFriendlyError(getFriendlyError(payload));
        }),
        HardwareService.listenSerialReady(() => {
          setIsSerialStarting(false);
          setIsSerialOpen(true);
        }),
      ]);
      if (disposed) {
        messageCleanup();
        errorCleanup();
        readyCleanup();
      } else {
        unlisten = messageCleanup;
        unlistenError = errorCleanup;
        unlistenReady = readyCleanup;
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
      unlistenError?.();
      unlistenReady?.();
    };
  }, []);

  const handleToggleSerial = async () => {
    try {
      if (isSerialOpen || isSerialStarting) {
        await HardwareService.stopSerial();
        setIsSerialOpen(false);
        setIsSerialStarting(false);
      } else {
        if (!port) {
          setFriendlyError(getFriendlyError('Nenhuma porta USB foi selecionada.'));
          return;
        }
        setSerialMessages([]);
        setIsSerialStarting(true);
        await HardwareService.startSerial(port);
      }
    } catch (error) {
      setIsSerialStarting(false);
      setFriendlyError(getFriendlyError(String(error)));
    }
  };

  const showSaveFeedback = (status: 'saved' | 'exported' = 'saved') => {
    setSaveStatus(status);
    if (saveFeedbackTimeout.current) clearTimeout(saveFeedbackTimeout.current);
    saveFeedbackTimeout.current = setTimeout(() => setSaveStatus(null), 2600);
  };

  const handleSaveProject = async (saveAs = false): Promise<boolean> => {
    if (!workspace.current) return false;
    if (workspaceLoadFailedRef.current) {
      setFriendlyError({
        emoji: '🛟',
        title: 'Salvamento bloqueado para proteger o projeto',
        message: 'Os blocos originais não foram carregados corretamente.',
        tip: 'Volte ao painel e peça ajuda para recuperar o projeto antes de salvar.',
        rawError: 'workspace_load_failed',
      });
      return false;
    }
    const workspaceData = Blockly.serialization.workspaces.save(workspace.current) as Record<string, unknown>;
    if (!projectId) {
      const file = createProjectFile({
        name: projectName || 'Projeto',
        targetBoard: board,
        workspace: workspaceData,
      });
      const json = JSON.stringify(file, null, 2);
      const safeName = `${(projectName || 'projeto').replace(/[^\p{L}\p{N}_-]+/gu, '-').toLowerCase()}.json`;

      setIsSaving(true);
      try {
        const filePath = await saveLocalProjectFile(json, safeName, activeTab.filePath, saveAs);
        if (!filePath) return false;
        updateTab(activeTab.id, {
          workspaceData,
          board,
          filePath,
          source: 'local-file',
          title: file.project.name,
          dirty: false,
        });
        showSaveFeedback();
        dirtyRef.current = false;
        setIsDirty(false);
        return true;
      } catch (error) {
        setFriendlyError({
          emoji: '💾',
          title: 'Não consegui salvar o projeto',
          message: error instanceof Error ? error.message : 'O arquivo não pôde ser salvo.',
          tip: 'Verifique as permissões da pasta e tente novamente.',
          rawError: String(error),
        });
        return false;
      } finally {
        setIsSaving(false);
      }
    }
    if (!board) {
      setFriendlyError({
        emoji: '🧩',
        title: 'Escolha uma placa antes de salvar',
        message: 'Projetos sincronizados precisam de uma placa de destino.',
        tip: 'Selecione Arduino Uno, Nano ou ESP32 no editor.',
        rawError: 'target_board is empty',
      });
      return false;
    }
    setIsSaving(true);
    try {
      const { error } = await ProjectService.saveProject(
        projectId,
        board,
        LZString.compressToBase64(JSON.stringify(workspaceData))
      );
      if (error) throw error;
      updateTab(activeTab.id, { workspaceData, board });
      showSaveFeedback();
      dirtyRef.current = false;
      setIsDirty(false);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFriendlyError({ emoji: '☁️', title: 'Não consegui salvar!', message, tip: 'Verifique sua conexão com a internet e tente de novo.', rawError: message });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadProject = async () => {
    if (!workspace.current) return;
    if (workspaceLoadFailedRef.current) {
      setFriendlyError({
        emoji: '🛟',
        title: 'Exportação bloqueada para proteger o projeto',
        message: 'Os blocos originais não foram carregados corretamente.',
        tip: 'Volte ao painel e peça ajuda para recuperar o arquivo original.',
        rawError: 'workspace_load_failed',
      });
      return;
    }
    const file = createProjectFile({
      name: projectName || 'Projeto',
      targetBoard: board,
      workspace: Blockly.serialization.workspaces.save(workspace.current) as Record<string, unknown>,
    });
    const safeName = `${(projectName || 'projeto').replace(/[^\p{L}\p{N}_-]+/gu, '-').toLowerCase()}.json`;

    setIsExporting(true);
    try {
      const exportedPath = await exportLocalProjectFile(
        JSON.stringify(file, null, 2),
        safeName,
      );
      if (exportedPath) showSaveFeedback('exported');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFriendlyError({
        emoji: '📤',
        title: 'Não consegui exportar o projeto',
        message,
        tip: 'Escolha outra pasta e verifique se você tem permissão para gravar nela.',
        rawError: message,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleUploadCode = async (ignoreOrphans = false) => {
    const currentWorkspace = workspace.current;
    if (!currentWorkspace || isUploadingRef.current || !board || setup.status !== 'ready') return;
    const uploadStartedAt = performance.now();
    if (!port) {
      setFriendlyError(getFriendlyError('Nenhuma porta USB foi selecionada.'));
      return;
    }
    if (!ignoreOrphans) { const orphans = getOrphanedBlocks(); if (orphans.length > 0) { setOrphanWarning(orphans); return; } }

    const validationStartedAt = performance.now();
    const auditIssues = auditWorkspace(currentWorkspace, board);
    console.info(`[UPLOAD][TIMING] validation: ${Math.round(performance.now() - validationStartedAt)} ms`);
    if (auditIssues.length > 0) {
      const details = auditIssues.map((issue) => `• ${issue.message}`).join('\n');
      setFriendlyError({
        emoji: '🔎',
        title: 'Revise alguns blocos antes de enviar',
        message: auditIssues[0].message,
        tip: auditIssues.length > 1
          ? `Há mais ${auditIssues.length - 1} item(ns). Veja os detalhes técnicos.`
          : 'O bloco com aviso amarelo mostra onde corrigir.',
        rawError: details,
      });
      return;
    }

    let codeToUpload: string;
    const codeGenerationStartedAt = performance.now();
    try {
      codeToUpload = codeGeneratorRef.current?.(currentWorkspace, board) ?? '';
      setGeneratedCode(codeToUpload);
      console.info(`[UPLOAD][TIMING] code-generation: ${Math.round(performance.now() - codeGenerationStartedAt)} ms`);
    } catch (error) {
      setFriendlyError({
        emoji: '🧩',
        title: 'Não consegui gerar o código',
        message: 'Um dos blocos contém dados que não puderam ser convertidos para C++.',
        tip: 'Revise o último bloco alterado e tente novamente.',
        rawError: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (!codeToUpload.includes('void setup()') || !codeToUpload.includes('void loop()')) {
      setFriendlyError({
        emoji: '🧩',
        title: 'Faltam peças importantes!',
        message: 'Os blocos PREPARAR e AGIR são obrigatórios para o robô funcionar.',
        tip: 'Dica: mexa em uma peça e tente novamente para atualizar o código.',
        rawError: 'Missing setup() or loop().',
      });
      return;
    }
    if (isSerialOpen || isSerialStarting) {
      const serialStopStartedAt = performance.now();
      await HardwareService.stopSerial();
      setIsSerialOpen(false);
      setIsSerialStarting(false);
      console.info(`[UPLOAD][TIMING] serial-stop: ${Math.round(performance.now() - serialStopStartedAt)} ms`);
    }
    isUploadingRef.current = true;
    setIsUploading(true);
    setUploadStage('validating');
    try {
      // O backend emite as etapas reais (core, preparo, compilação e envio).
      // Não aguardar tempos fixos aqui: além de atrasar o início, eles podiam
      // exibir "Enviando" enquanto o arduino-cli ainda compilava.
      await HardwareService.uploadCode(codeToUpload, board, port);
      console.info(`[UPLOAD][TIMING] backend-started: ${Math.round(performance.now() - uploadStartedAt)} ms`);
    } catch (error) {
      isUploadingRef.current = false;
      setIsUploading(false);
      setUploadStage(null);
      setFriendlyError(getFriendlyError(String(error)));
    }
  };

  // ─── Função Otimizada para Cópia (Suporte a Rede Local HTTP) ────────────────
  const handleCopyCode = async () => {
    if (!generatedCode) return;

    const triggerFeedback = () => {
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2000);
    };

    try {
      // Tenta a API moderna (funciona em HTTPS/Localhost)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(generatedCode);
        triggerFeedback();
        return;
      }

      throw new Error("Clipboard API indisponível");
    } catch {
      // Fallback robusto para redes HTTP
      try {
        const ta = document.createElement("textarea");
        ta.value = generatedCode;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const copiedByFallback = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!copiedByFallback) throw new Error('Não foi possível copiar o código.');
        triggerFeedback();
      } catch (error) {
        setFriendlyError({ emoji: '📋', title: 'Não consegui copiar o código', message: 'A cópia foi bloqueada pelo sistema.', tip: 'Selecione o código manualmente e use Ctrl+C.', rawError: String(error) });
      }
    }
  };

  const handleAttemptBack = () => {
    if (readOnly) { onBack(); return; }
    if (isDirty) { setShowExitConfirm(true); } else { onBack(); }
  };

  const handleCloseError = () => { setFriendlyError(null); };
  const projectTitle = activeTab.type === 'project'
    ? projectId
      ? readOnly ? `Inspecionando: ${projectName}` : `Meu Projeto: ${projectName}`
      : `Meu projeto: ${projectName}`
    : '';

  return (
    <div className="app-container">

      {boardLoadState === 'selecting' && <BoardSelectionModal onSelect={handleBoardSelected} />}

      {boardLoadState === 'resolving' && (
        <div className="modal-overlay" style={{ zIndex: 999998 }}>
          <div className="loading-overlay-text">Carregando projeto…</div>
        </div>
      )}

      {/* TOOLBAR */}
      <div className="ide-toolbar">
        <div className="ide-toolbar-main">
          <div className="ide-project-context">
            <img src={logoSimples} draggable={false} alt="bloquin" style={{ height: '38px' }} />
            {projectTitle && (
              <div className="ide-project-title">
                {readOnly && <span className="read-only-dot" />}
                {!projectId && !readOnly ? (
                  <input
                    aria-label="Nome do projeto"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    onBlur={() => setProjectName((name) => name.trim() || 'Meu projeto')}
                    className="ide-project-name-input"
                  />
                ) : <span>{projectTitle}</span>}
              </div>
            )}
          </div>

          <div className="ide-toolbar-controls">
            <div className="ide-hardware-controls hardware-controls">
              {boardLoadState === 'ready' && board && <BoardBadge boardKey={board} />}
              <div className="control-group ide-port-control">
                <BloquinSelect
                  className={`ide-port-select ${port ? 'has-port' : ''}`}
                  compact
                  label="Porta USB da placa"
                  value={port}
                  onChange={setPort}
                  placeholder="Sem porta USB"
                  leadingIcon={<Usb className="ide-action-icon ide-port-icon" />}
                  options={availablePorts.map((availablePort) => ({ value: availablePort, label: availablePort }))}
                />
                <ResponsiveToolbarButton
                  icon={<RefreshCw className="ide-action-icon ide-refresh-icon" />}
                  label="Atualizar porta"
                  tooltip="Atualizar porta"
                  ariaLabel="Atualizar porta"
                  variant="neutral"
                  compact
                  onClick={() => { void fetchPorts(); }}
                  disabled={isRefreshingPorts}
                  className={`ide-toolbar-refresh-action ${isRefreshingPorts ? 'is-refreshing' : ''}`}
                />
              </div>
              {!readOnly && (
                <ResponsiveToolbarButton
                  icon={<Upload className="ide-action-icon" />}
                  label="Enviar"
                  tooltip="Enviar"
                  variant="primary"
                  onClick={() => handleUploadCode()}
                  className="ide-toolbar-send-action ide-toolbar-primary-action"
                  disabled={isUploading || boardLoadState !== 'ready' || setup.status !== 'ready'}
                  ariaLabel="Enviar para a placa"
                />
              )}
            </div>

            <ResponsiveToolbarButton
              icon={<Code2 className="ide-action-icon" />}
              label={isCodeVisible ? 'Ocultar Código' : 'Ver Código'}
              tooltip={isCodeVisible ? 'Ocultar Código' : 'Ver Código'}
              variant="neutral"
              onClick={() => setIsCodeVisible(!isCodeVisible)}
              className="ide-toolbar-code-action ide-toolbar-primary-action"
            />
            {!readOnly && (
              <ResponsiveToolbarButton
                icon={<Save className="ide-action-icon" />}
                label={isSaving ? 'Salvando…' : 'Salvar'}
                tooltip="Salvar"
                variant="primary"
                onClick={() => handleSaveProject()}
                disabled={isSaving}
                className="ide-toolbar-save-action ide-toolbar-primary-action"
              />
            )}

            <div className="ide-toolbar-secondary-actions">
              {!readOnly && !projectId && (
                <ResponsiveToolbarButton
                  icon={<SaveAll className="ide-action-icon" />}
                  label="Salvar como"
                  tooltip="Salvar como"
                  variant="secondary"
                  onClick={() => { void handleSaveProject(true); }}
                  disabled={isSaving}
                  className="ide-toolbar-save-as-action"
                />
              )}
              {!readOnly && (
                <ResponsiveToolbarButton
                  icon={<FileJson className="ide-action-icon" />}
                  label={isExporting ? 'Exportando…' : 'Exportar JSON'}
                  tooltip="Exportar JSON para outro local"
                  variant="secondary"
                  onClick={() => { void handleDownloadProject(); }}
                  disabled={isExporting}
                  className="ide-toolbar-json-action"
                />
              )}
            </div>

            <div className="ide-toolbar-essential-actions">
              <ResponsiveToolbarButton
                icon={<BookOpen className="ide-action-icon" />}
                label="Documentação"
                tooltip="Documentação dos blocos"
                variant="secondary"
                onClick={openDocumentation}
                className="ide-toolbar-docs-action"
              />
              <ResponsiveToolbarButton
                icon={<MessageCircle className="ide-action-icon" />}
                label={isSerialOpen ? (readOnly ? 'Parar monitor' : 'Parar chat') : isSerialStarting ? 'Conectando…' : readOnly ? 'Monitorar' : 'Chat'}
                tooltip={isSerialOpen ? (readOnly ? 'Parar monitor' : 'Parar chat') : isSerialStarting ? 'Conectando ao robô' : readOnly ? 'Monitorar' : 'Chat'}
                variant="secondary"
                onClick={() => { void handleToggleSerial(); }}
                className="ide-toolbar-chat-action"
              />
              <ResponsiveToolbarButton
                icon={<LogOut className="ide-action-icon" />}
                label="Sair"
                tooltip="Sair"
                variant={isDirty && !readOnly ? 'danger' : 'secondary'}
                onClick={handleAttemptBack}
                className="ide-toolbar-exit-action"
              />
            </div>

            <div className={`ide-more-menu ${readOnly ? 'ide-more-menu-readonly' : ''}`} ref={moreMenuRef}>
              <ResponsiveToolbarButton
                icon={<Ellipsis className="ide-action-icon" />}
                label="Mais"
                tooltip="Mais"
                variant="secondary"
                className="ide-more-toggle"
                ariaExpanded={isMoreOpen}
                ariaControls="ide-more-panel"
                onClick={() => setIsMoreOpen((open) => !open)}
              />
              {isMoreOpen && (
                <div
                  id="ide-more-panel"
                  className="ide-more-panel"
                  role="group"
                  aria-label="Mais ações do projeto"
                >
                  {!readOnly && !projectId && (
                  <button type="button" disabled={isSaving} onClick={() => { closeMoreMenu(true); void handleSaveProject(true); }}>
                    <SaveAll className="ide-action-icon" aria-hidden="true" /> Salvar como…
                  </button>
                  )}
                  {!readOnly && (
                  <button type="button" disabled={isExporting} onClick={() => { closeMoreMenu(true); void handleDownloadProject(); }}>
                    <FileJson className="ide-action-icon" aria-hidden="true" /> {isExporting ? 'Exportando…' : 'Exportar JSON…'}
                  </button>
                  )}
                  <button className="ide-more-mobile-action" type="button" onClick={() => { closeMoreMenu(true); openDocumentation(); }}>
                    <BookOpen className="ide-action-icon" aria-hidden="true" /> Documentação
                  </button>
                  <button className="ide-more-mobile-action" type="button" onClick={() => { closeMoreMenu(true); void handleToggleSerial(); }}>
                    <MessageCircle className="ide-action-icon" aria-hidden="true" /> {isSerialOpen ? (readOnly ? 'Parar monitor' : 'Parar chat') : isSerialStarting ? 'Conectando…' : readOnly ? 'Monitorar' : 'Chat'}
                  </button>
                  <button className="ide-more-mobile-action" type="button" onClick={() => { closeMoreMenu(); handleAttemptBack(); }}>
                    <LogOut className="ide-action-icon" aria-hidden="true" /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {readOnly && (
        <div className="readonly-banner">
          <span>Modo Visualização</span>
          <span>Você está vendo o projeto de um aluno. Edição desativada.</span>
        </div>
      )}

      {/* WORKSPACE */}
      <div className="workspace-area">
        <div ref={blocklyDiv} id="blocklyDiv" />
        
        {isCodeVisible && (
          <div className={`code-panel ${isFullscreenCode ? 'fullscreen' : ''}`}>
            <div className="code-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="code-panel-title">Código C++</h3>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button"
                  className={`btn-action ${copied ? "btn-send" : ""}`}
                  onClick={handleCopyCode}
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                >
                  {copied ? <><Check size={16} aria-hidden="true" /> Copiado!</> : <><Copy size={16} aria-hidden="true" /> Copiar</>}
                </button>
                
                <button type="button" aria-label={isFullscreenCode ? 'Reduzir painel de código' : 'Expandir painel de código'} onClick={() => setIsFullscreenCode(!isFullscreenCode)} className="code-fullscreen-btn">
                  {isFullscreenCode ? '↙️ Reduzir' : '⛶ Tela Cheia'}
                </button>
              </div>
            </div>
            <pre>{generatedCode}</pre>
          </div>
        )}
      </div>

      {/* MODAIS COMPONENTIZADOS */}
      {uploadStage && (
        <UploadModal stage={uploadStage} onClose={() => setUploadStage(null)} />
      )}

      {orphanWarning.length > 0 && (
        <OrphanModal 
          orphanBlocks={orphanWarning} 
          onFix={() => setOrphanWarning([])} 
          onSendAnyway={() => { setOrphanWarning([]); handleUploadCode(true); }} 
        />
      )}

      {saveStatus && (
        <div className="save-toast" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <span>{saveStatus === 'exported' ? 'Projeto exportado com sucesso.' : 'Projeto salvo com sucesso.'}</span>
        </div>
      )}

      <SerialMonitor 
        isOpen={isSerialOpen} 
        messages={serialMessages} 
        onClose={handleToggleSerial} 
        onClear={() => setSerialMessages([])} 
        isCodeOpen={isCodeVisible} 
      />

      {friendlyError && (
        <ErrorModal error={friendlyError} onClose={handleCloseError} />
      )}

      {showExitConfirm && (
        <div className="modal-overlay">
          <div className="friendly-error-modal" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-changes-title" style={{ borderTopColor: 'var(--warning)' }}>
            <div className="friendly-error-icon">⚠️</div>
            <h2 id="unsaved-changes-title">Mudanças não salvas!</h2>
            <p className="friendly-error-message">
              Você tem alterações que ainda não foram salvas. Se sair agora, seu progresso será perdido.
            </p>
            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowExitConfirm(false)}>Continuar editando</button>
              <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={async () => { const saved = await handleSaveProject(); if (saved) { setShowExitConfirm(false); onBack(); } }}>💾 Salvar e Sair</button>
              <button type="button" className="btn-danger" style={{ flex: 1 }} onClick={() => { setShowExitConfirm(false); onBack(); }}>Sair sem salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Intervenção (Apenas para Alunos) */}
      {intervention && (
        <InterventionModal teacherName={intervention.teacher_name} />
      )}
    </div>
  );
}
