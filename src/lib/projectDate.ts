const DAY_MS = 24 * 60 * 60 * 1000;
const RELATIVE_DAY_THRESHOLD = 7;

const relativeDayFormatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Formata a última edição de um projeto de forma contextual: relativa para
 * datas recentes ("hoje às 14:32", "ontem às 18:45", "anteontem", "há 3
 * dias") e absoluta (dd/mm/aaaa) a partir de uma semana. Usa só Intl nativo,
 * na mesma convenção pt-BR já usada no resto do app — sem biblioteca extra.
 */
export function formatProjectUpdatedAt(isoDate: string | null | undefined, now: number = Date.now()): string {
  if (!isoDate) return 'Data desconhecida';
  const updatedTimestamp = Date.parse(isoDate);
  if (!Number.isFinite(updatedTimestamp)) return 'Data desconhecida';

  const dayDiff = Math.round((startOfDay(now) - startOfDay(updatedTimestamp)) / DAY_MS);
  const updated = new Date(updatedTimestamp);

  if (dayDiff <= 0) return `Editado hoje às ${timeFormatter.format(updated)}`;
  if (dayDiff === 1) return `Editado ontem às ${timeFormatter.format(updated)}`;
  if (dayDiff < RELATIVE_DAY_THRESHOLD) {
    // "anteontem", "há 3 dias" etc. — a caixa baixa combina com "Editado hoje/ontem".
    return `Editado ${relativeDayFormatter.format(-dayDiff, 'day')}`;
  }
  return `Editado em ${dateFormatter.format(updated)}`;
}
