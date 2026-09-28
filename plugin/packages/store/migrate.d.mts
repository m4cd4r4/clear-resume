export interface MigrateReport {
  imported: number;
  alreadyPresent: number;
  skipped: number;
  missingBody: number;
  unparsed: string[];
}

export function parseName(file: string): {
  project: string;
  month: string;
  day: string;
  hhmm: string;
  title: string;
  actioned: boolean;
} | null;

export function migrate(opts: { notesDir: string; root?: string; machine?: string }): MigrateReport;
