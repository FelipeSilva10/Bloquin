import type { ReactNode } from 'react';

type ToolbarButtonVariant = 'primary' | 'secondary' | 'neutral' | 'danger';

interface ResponsiveToolbarButtonProps {
  icon: ReactNode;
  label: string;
  variant?: ToolbarButtonVariant;
  compact?: boolean;
  tooltip?: string;
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  ariaExpanded?: boolean;
  ariaHasPopup?: boolean | 'menu';
  ariaControls?: string;
}

export function ResponsiveToolbarButton({
  icon,
  label,
  variant = 'secondary',
  compact = false,
  tooltip = label,
  ariaLabel = label,
  onClick,
  disabled = false,
  className = '',
  ariaExpanded,
  ariaHasPopup,
  ariaControls,
}: ResponsiveToolbarButtonProps) {
  const classes = [
    'ide-toolbar-button',
    `ide-toolbar-button-${variant}`,
    compact ? 'ide-toolbar-button-compact' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-controls={ariaControls}
    >
      <span className="ide-toolbar-button-icon" aria-hidden="true">{icon}</span>
      <span className="ide-toolbar-button-label">{label}</span>
      <span className="ide-toolbar-tooltip" aria-hidden="true">{tooltip}</span>
    </button>
  );
}
