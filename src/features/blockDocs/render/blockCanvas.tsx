import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly/core';
import type { BoardKey } from '../../../blockly/boards';
import { bloquinTheme } from '../../../blockly/theme';
import { getCanonicalBlockState } from '../derive';
import type { BlockExample } from '../types';

/**
 * Renderiza o bloco/exemplo com o Blockly de verdade — a mesma engine que a
 * IDE usa (mesmo tema, mesmo motor de layout) — em vez de clonar e
 * serializar um fragmento de SVG fora do seu contexto original. Uma
 * tentativa anterior fazia exatamente isso (clonar `getCanvas()` e colar o
 * SVG em outro lugar do DOM via `dangerouslySetInnerHTML`), e isso perdia o
 * `<defs>` e as variáveis CSS que o Blockly define no próprio elemento de
 * injeção (`--blocklyEmbossFilter`, `--blocklyDisabledPattern`, etc.) —
 * causando campos pretos, filtros ausentes e medidas de texto incorretas.
 * Manter um workspace real e ao vivo por bloco evita essa classe inteira de
 * problema, ao custo de uma instância Blockly por card visível.
 */

let blocksReadyPromise: Promise<void> | null = null;
function ensureBlocksRegistered(): Promise<void> {
  if (!blocksReadyPromise) {
    blocksReadyPromise = import('../../../blockly/blocks').then(({ initBlocks }) => initBlocks());
  }
  return blocksReadyPromise;
}

const PREVIEW_PADDING = 10;

function fitWorkspaceToContent(workspace: Blockly.WorkspaceSvg, container: HTMLDivElement): boolean {
  if (workspace.getAllBlocks(false).length === 0) return false;
  const box = workspace.getBlocksBoundingBox();
  const width = Math.max(1, box.right - box.left) + PREVIEW_PADDING * 2;
  const height = Math.max(1, box.bottom - box.top) + PREVIEW_PADDING * 2;
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  Blockly.svgResize(workspace);
  workspace.scrollCenter();
  return true;
}

const IN_VIEW_ROOT_MARGIN = '200px';

/**
 * Só monta o workspace Blockly quando o card entra (ou está perto de entrar)
 * na viewport. Sem isso, uma grade com uma centena de blocos injeta uma
 * centena de instâncias Blockly de uma vez no mount da tela de Documentação
 * — cada uma cara o bastante para, somadas, travar a página por vários
 * segundos.
 */
function useLiveBlockWorkspace(load: (workspace: Blockly.WorkspaceSvg) => void, deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { rootMargin: IN_VIEW_ROOT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let workspace: Blockly.WorkspaceSvg | null = null;
    setReady(false);

    void ensureBlocksRegistered().then(() => {
      if (disposed) return;
      workspace = Blockly.inject(container, {
        readOnly: true,
        theme: bloquinTheme,
        trashcan: false,
        sounds: false,
        move: { scrollbars: false, drag: false, wheel: false },
        zoom: { controls: false, wheel: false },
      });
      try {
        load(workspace);
      } catch (error) {
        console.warn('[Documentação] não foi possível carregar o bloco no workspace de pré-visualização.', error);
        return;
      }
      const fitted = fitWorkspaceToContent(workspace, container);
      setReady(fitted);
      // Métricas de texto podem só se acertar depois que a fonte termina de
      // carregar (mesmo cuidado tomado pelo redimensionamento da IDE).
      void document.fonts?.ready.then(() => {
        if (disposed || !workspace) return;
        fitWorkspaceToContent(workspace, container);
      });
    });

    return () => {
      disposed = true;
      workspace?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, ...deps]);

  return { containerRef, ready };
}

export function BlockCanvas({ type, board, label }: { type: string; board: BoardKey; label: string }) {
  const { containerRef, ready } = useLiveBlockWorkspace((workspace) => {
    const state = getCanonicalBlockState(type, board);
    Blockly.serialization.blocks.append(state as unknown as Parameters<typeof Blockly.serialization.blocks.append>[0], workspace);
  }, [type, board]);

  return (
    <div className={`block-doc-canvas${ready ? '' : ' block-doc-canvas-empty'}`} role="img" aria-label={label}>
      <div ref={containerRef} className="block-doc-canvas-workspace" />
    </div>
  );
}

export function ExampleCanvas({ example }: { example: BlockExample }) {
  const { containerRef, ready } = useLiveBlockWorkspace((workspace) => {
    Blockly.serialization.workspaces.load(example.workspace as Parameters<typeof Blockly.serialization.workspaces.load>[0], workspace);
  }, [example.id]);

  return (
    <div className={`block-doc-canvas${ready ? '' : ' block-doc-canvas-empty'}`} role="img" aria-label={example.title}>
      <div ref={containerRef} className="block-doc-canvas-workspace" />
    </div>
  );
}
