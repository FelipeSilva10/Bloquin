import { readFileSync } from "node:fs";

// Utilitário preservado apenas para uma eventual reconciliação futura do
// ambiente de desenvolvimento. O Lote 1 não depende mais de staging/dry-run.
const TARGET_MIGRATIONS = [
  "20260730144836_harden_profiles_and_sessions",
  "20260730154141_drop_obsolete_delete_student_user",
];
const inputPath = process.argv[2];

let output;

try {
  output = inputPath && inputPath !== "-"
    ? readFileSync(inputPath, "utf8")
    : readFileSync(0, "utf8");
} catch (error) {
  console.error(
    `Não foi possível ler a saída do dry-run: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(2);
}

const blockers = [
  /migration repair/i,
  /remote migration versions not found/i,
  /local migration files to be inserted before the last migration/i,
  /--include-all/i,
];

const blocker = blockers.find((pattern) => pattern.test(output));

if (blocker) {
  console.error(
    "DRY-RUN RECUSADO: a saída indica divergência de histórico ou exige reconciliação.",
  );
  process.exit(1);
}

const migrationPattern = /\b(\d{14}_[a-z0-9][a-z0-9_-]*)(?:\.sql)?\b/gi;
const migrations = [
  ...new Set(
    [...output.matchAll(migrationPattern)].map((match) => match[1]),
  ),
].sort();

if (JSON.stringify(migrations) !== JSON.stringify(TARGET_MIGRATIONS)) {
  console.error(
    "DRY-RUN RECUSADO: eram esperadas exclusivamente "
      + `${TARGET_MIGRATIONS.map((migration) => `${migration}.sql`).join(", ")}; encontradas: `
      + (migrations.length > 0 ? migrations.join(", ") : "nenhuma"),
  );
  process.exit(1);
}

console.log(
  `DRY-RUN ACEITO: somente ${TARGET_MIGRATIONS.map((migration) => `${migration}.sql`).join(", ")} estão pendentes.`,
);
