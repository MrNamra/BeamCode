import { ConnectionType } from '../core/rtc/connectionType.js';
import { useTranslation } from '../i18n/index.js';

interface ConnectionBadgeProps {
  type: ConnectionType | null;
}

export function ConnectionBadge({ type }: ConnectionBadgeProps) {
  const { t } = useTranslation();

  if (!type) return null;

  let labelKey = 'badge.direct';
  let tooltipKey = 'badge.directTooltip';
  let colorClasses = 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800';

  if (type === 'lan') {
    labelKey = 'badge.lan';
    tooltipKey = 'badge.lanTooltip';
    colorClasses = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  } else if (type === 'relay') {
    labelKey = 'badge.relay';
    tooltipKey = 'badge.relayTooltip';
    colorClasses = 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses} cursor-help transition-colors`}
      title={t(tooltipKey)}
      data-testid="connection-badge"
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-80" />
      {t(labelKey)}
    </span>
  );
}
