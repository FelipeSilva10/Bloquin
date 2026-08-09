import { Cpu, TriangleAlert } from 'lucide-react';
import { getProjectBoardStatus } from '../lib/projectBoard';
import './ProjectBoardBadge.css';

interface ProjectBoardBadgeProps {
  board?: string | null;
  showPrefix?: boolean;
}

/** A compact, accessible description of the board persisted with a project. */
export function ProjectBoardBadge({ board, showPrefix = true }: ProjectBoardBadgeProps) {
  const status = getProjectBoardStatus(board);
  const isUnknown = status.state === 'unknown';

  return (
    <span
      className={`project-board-badge project-board-badge--${status.state}`}
      aria-label={status.accessibleLabel}
      title={status.accessibleLabel}
    >
      {isUnknown ? <TriangleAlert aria-hidden="true" /> : <Cpu aria-hidden="true" />}
      <span>{showPrefix && status.state === 'selected' ? `Placa: ${status.label}` : status.label}</span>
    </span>
  );
}
