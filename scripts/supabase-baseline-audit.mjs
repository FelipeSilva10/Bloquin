#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const supabaseDirectory = join(repositoryRoot, "supabase");
const migrationsDirectory = join(supabaseDirectory, "migrations");
const archiveDirectory = join(
  supabaseDirectory,
  "migration-history",
  "original",
);
const evidencePath = join(
  supabaseDirectory,
  "audits",
  "lot1_remote_evidence.json",
);
const configPath = join(supabaseDirectory, "config.toml");
const rolesPath = join(supabaseDirectory, "roles.sql");
const testsDirectory = join(supabaseDirectory, "tests", "database");
const inventoryPath = join(
  supabaseDirectory,
  "audits",
  "lot1_remote_inventory.sql",
);

const outputAsJson = process.argv.includes("--json");

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function hashFile(filePath) {
  return sha256(readFileSync(filePath));
}

function normalizeSqlWhitespace(sql) {
  return sql.replace(/[ \t]+$/gm, "").trimEnd();
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ");
}

function normalizeIdentifier(identifier) {
  return identifier.replaceAll('"', "").toLowerCase();
}

function collectDefinitions(sql) {
  const definitions = new Set();
  const pattern =
    /\bcreate\s+(?:or\s+replace\s+)?(?:table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?(?:"public"|public)\.(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;

  for (const match of sql.matchAll(pattern)) {
    definitions.add(normalizeIdentifier(match[1] ?? match[2]));
  }

  return definitions;
}

function collectPublicRelationReferences(sql) {
  const references = new Set();
  const pattern =
    /\b(?:alter\s+table(?:\s+only)?|alter\s+view|references|from|join|into|update|delete\s+from|on)\s+(?:"public"|public)\.(?:"([^"]+)"|([a-z_][a-z0-9_$]*))/gi;

  for (const match of sql.matchAll(pattern)) {
    references.add(normalizeIdentifier(match[1] ?? match[2]));
  }

  return references;
}

function gitTrackedFiles(glob) {
  try {
    const output = execFileSync("git", ["ls-files", "--", glob], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    return new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

const evidence = existsSync(evidencePath)
  ? JSON.parse(readFileSync(evidencePath, "utf8"))
  : null;

const migrationFiles = existsSync(migrationsDirectory)
  ? readdirSync(migrationsDirectory)
      .filter((file) => /^\d{14}_[a-z0-9_]+\.sql$/i.test(file))
      .sort()
  : [];

const expectedHistoricalFiles =
  evidence?.migration_history.map(
    ({ version, name }) => `${version}_${name}.sql`,
  ) ?? [];
const expectedHistoricalSet = new Set(expectedHistoricalFiles);
const lastRemoteVersion =
  evidence?.migration_history.at(-1)?.version ?? "00000000000000";
const activeHistoricalFiles = migrationFiles.filter(
  (file) => file.slice(0, 14) <= lastRemoteVersion,
);
const baselineFile = expectedHistoricalFiles[0] ?? null;
const baselinePath = baselineFile
  ? join(migrationsDirectory, baselineFile)
  : null;
const securityMigration =
  "20260730144836_harden_profiles_and_sessions.sql";
const securityMigrationPath = join(migrationsDirectory, securityMigration);
const legacyCleanupMigration =
  "20260730154141_drop_obsolete_delete_student_user.sql";
const legacyCleanupMigrationPath = join(
  migrationsDirectory,
  legacyCleanupMigration,
);

const expectedArchiveFiles = [
  "20260727000000_project_management.sql",
  ...expectedHistoricalFiles,
  "20260729120000_fix_library_publish_authorization.sql",
  "20260729160000_repair_library_publication_insert_rls.sql",
].sort();
const archiveFiles = existsSync(archiveDirectory)
  ? readdirSync(archiveDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort()
  : [];

const trackedMigrations = gitTrackedFiles("supabase/migrations/*.sql");
const untrackedMigrations = migrationFiles.filter(
  (file) =>
    !trackedMigrations.has(
      relative(repositoryRoot, join(migrationsDirectory, file)),
    ),
);

const allDefinitions = new Set();
const allReferences = new Set();
const migrationSql = new Map();

for (const file of migrationFiles) {
  const sql = readFileSync(join(migrationsDirectory, file), "utf8");
  migrationSql.set(file, sql);
  const uncommented = stripSqlComments(sql);
  for (const relation of collectDefinitions(uncommented)) {
    allDefinitions.add(relation);
  }
  for (const relation of collectPublicRelationReferences(uncommented)) {
    allReferences.add(relation);
  }
}

const missingDefinitions = [...allReferences]
  .filter((relation) => !allDefinitions.has(relation))
  .sort();
const securitySql = migrationSql.get(securityMigration) ?? "";
const legacyCleanupSql = migrationSql.get(legacyCleanupMigration) ?? "";
const rolesSql = existsSync(rolesPath)
  ? readFileSync(rolesPath, "utf8")
  : "";

const schemaSourcePath = evidence?.schema_dump?.source_file
  ? join(repositoryRoot, evidence.schema_dump.source_file)
  : null;
const sourceSchemaAvailable = Boolean(
  schemaSourcePath && existsSync(schemaSourcePath),
);
const sourceSchemaHashMatches = sourceSchemaAvailable
  ? hashFile(schemaSourcePath) === evidence.schema_dump.sha256
  : null;
const baselineHashMatches = Boolean(
  baselinePath &&
    existsSync(baselinePath) &&
    hashFile(baselinePath) === evidence?.schema_dump?.baseline_sha256,
);
const baselineDdlMatchesSource =
  sourceSchemaAvailable && baselinePath && existsSync(baselinePath)
    ? normalizeSqlWhitespace(readFileSync(schemaSourcePath, "utf8")) ===
      normalizeSqlWhitespace(readFileSync(baselinePath, "utf8"))
    : null;

const artifactHashChecks = [];
for (const artifact of Object.values(
  evidence?.advisor_artifacts ?? {},
)) {
  const sourcePath = join(repositoryRoot, artifact.source_file);
  artifactHashChecks.push({
    file: artifact.source_file,
    available: existsSync(sourcePath),
    matches: existsSync(sourcePath)
      ? hashFile(sourcePath) === artifact.sha256
      : null,
  });
}

const historyMatches =
  JSON.stringify(activeHistoricalFiles) ===
  JSON.stringify(expectedHistoricalFiles);
const archiveMatches =
  JSON.stringify(archiveFiles) === JSON.stringify(expectedArchiveFiles);
const markersMatch = expectedHistoricalFiles
  .slice(1)
  .every((file) =>
    (migrationSql.get(file) ?? "").includes("Marcador histórico"),
  );

const inventorySql = existsSync(inventoryPath)
  ? stripSqlComments(readFileSync(inventoryPath, "utf8"))
  : "";
const inventoryIsReadOnly =
  Boolean(inventorySql) &&
  !/\b(?:create|alter|drop|grant|revoke|insert|update|delete|truncate|merge|call|do)\b/i.test(
    inventorySql,
  );

const securityAssertions = {
  dropsGlobalTeacherSessionRead:
    /drop\s+policy\s+if\s+exists\s+user_sessions_teacher_read\s+on\s+public\.user_sessions/i.test(
      securitySql,
    ),
  restrictsProfileColumns:
    /grant\s+select\s*\(\s*id\s*,\s*nome\s*,\s*role\s*,\s*turma_id\s*\)\s+on\s+table\s+public\.perfis\s+to\s+authenticated/i.test(
      securitySql,
    ),
  requiresTeacherRole:
    /current_profile_role\(\)\)\s*=\s*'teacher'/i.test(securitySql),
  preventsProfileWrites:
    /revoke\s+all\s+on\s+table\s+public\.perfis\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(
      securitySql,
    ),
  scopesSessionsToAuthUid:
    /create\s+policy\s+user_sessions_self_select[\s\S]*?user_id\s*=\s*\(select\s+auth\.uid\(\)\)/i.test(
      securitySql,
    ),
  hardensFunctionGrants:
    /revoke\s+all\s+on\s+function\s+public\.encerrar_escola/i.test(
      securitySql,
    ) &&
    /revoke\s+all\s+on\s+function\s+public\.set_updated_at/i.test(
      securitySql,
    ),
  normalizesRestoreDefaults:
    /alter\s+default\s+privileges[\s\S]*?revoke\s+all\s+on\s+tables\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(
      rolesSql,
    ) &&
    /revoke\s+execute\s+on\s+functions\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(
      rolesSql,
    ),
  removesBrokenLegacyStudentDeletion:
    /drop\s+function\s+if\s+exists\s+public\.delete_student_user\s*\(\s*uuid\s*\)/i.test(
      legacyCleanupSql,
    ) &&
    !/\bdrop\s+function\b[^;]*\bcascade\b/i.test(legacyCleanupSql),
};

const relationsUsedOnlyByRemovedLegacyRpc = new Set([
  "classroom_students",
  "profiles",
  "projects",
]);
const unresolvedMissingDefinitions = missingDefinitions.filter(
  (relation) =>
    !(
      securityAssertions.removesBrokenLegacyStudentDeletion
      && relationsUsedOnlyByRemovedLegacyRpc.has(relation)
    ),
);

const blockers = [];
const warnings = [];

if (!existsSync(configPath)) blockers.push("supabase/config.toml não existe.");
if (!existsSync(rolesPath)) blockers.push("supabase/roles.sql não existe.");
if (!evidence) blockers.push("Manifesto de evidência remota não existe.");
if (!historyMatches) {
  blockers.push(
    "As versões históricas ativas não correspondem às 15 versões remotas.",
  );
}
if (!archiveMatches) {
  blockers.push(
    "O arquivo histórico não preserva exatamente as 18 migrations originais.",
  );
}
if (!baselineHashMatches) {
  blockers.push("O hash do baseline ativo difere do manifesto.");
}
if (baselineDdlMatchesSource === false) {
  blockers.push("O DDL do baseline difere do dump remoto fornecido.");
}
if (!markersMatch) {
  blockers.push("Uma ou mais versões remotas não são marcadores históricos.");
}
if (!existsSync(securityMigrationPath)) {
  blockers.push("A migration de segurança do Lote 1 não existe.");
}
if (!existsSync(legacyCleanupMigrationPath)) {
  blockers.push("A migration de remoção da RPC legada não existe.");
}
if (Object.values(securityAssertions).some((assertion) => !assertion)) {
  blockers.push("A migration de segurança não cumpre todos os contratos.");
}
if (!inventoryIsReadOnly) {
  blockers.push("O inventário remoto não é estritamente somente leitura.");
}
if (sourceSchemaHashMatches === false) {
  blockers.push("O dump temporário não corresponde ao hash capturado.");
}
if (artifactHashChecks.some(({ matches }) => matches === false)) {
  blockers.push("Um advisor temporário não corresponde ao hash capturado.");
}

if (!sourceSchemaAvailable) {
  warnings.push(
    "O dump temporário não está disponível; a verificação usa o hash versionado do baseline.",
  );
}
if (artifactHashChecks.some(({ available }) => !available)) {
  warnings.push(
    "Um ou mais advisors temporários não estão disponíveis; os resumos permanecem no manifesto.",
  );
}
if (unresolvedMissingDefinitions.length > 0) {
  warnings.push(
    `A cadeia ativa contém referência não resolvida a relação inexistente: ${unresolvedMissingDefinitions.join(", ")}.`,
  );
}
if (untrackedMigrations.length > 0) {
  warnings.push(
    `Nota de entrega: ${untrackedMigrations.length} migration(s) ainda não estão rastreadas pelo Git.`,
  );
}

const linkedProjectPath = join(supabaseDirectory, ".temp", "project-ref");
const report = {
  status: blockers.length === 0 ? "ready" : "blocked",
  baseline: {
    evidenceCapturedAt: evidence?.captured_at ?? null,
    postgresVersion: evidence?.database?.server_version ?? null,
    activeMigrations: migrationFiles,
    remoteHistoricalMigrations: expectedHistoricalFiles,
    historyMatches,
    baselineFile,
    baselineHashMatches,
    baselineDdlMatchesSource,
    archivedOriginalMigrations: archiveFiles.length,
    archiveMatches,
    markersMatch,
    historicalMissingRelationDefinitions: missingDefinitions,
    unresolvedMissingRelationDefinitions: unresolvedMissingDefinitions,
  },
  git: {
    trackedMigrations: migrationFiles.length - untrackedMigrations.length,
    untrackedMigrations,
  },
  remote: {
    linked: existsSync(linkedProjectPath),
    accessTokenAvailable: Boolean(process.env.SUPABASE_ACCESS_TOKEN),
    databasePasswordAvailable: Boolean(process.env.SUPABASE_DB_PASSWORD),
    evidenceAvailable: Boolean(evidence),
    sourceSchemaAvailable,
    sourceSchemaHashMatches,
    advisorArtifacts: artifactHashChecks,
    mutableOperationPerformed: false,
  },
  security: securityAssertions,
  tests: {
    databaseTestFiles: existsSync(testsDirectory)
      ? readdirSync(testsDirectory)
          .filter((file) => file.endsWith(".sql"))
          .sort()
      : [],
  },
  blockers,
  warnings,
};

if (outputAsJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const marker = (value) => (value ? "sim" : "não");
  console.log("Auditoria do baseline Supabase — Lote 1");
  console.log(
    `Status: ${report.status === "ready" ? "pronto localmente" : "bloqueado"}`,
  );
  console.log(
    `Histórico remoto reconciliado: ${marker(historyMatches)} | Baseline verificado: ${marker(baselineHashMatches && baselineDdlMatchesSource !== false)}`,
  );
  console.log(
    `Migrations ativas: ${migrationFiles.length} | Originais arquivadas: ${archiveFiles.length}`,
  );
  console.log(
    `Testes pgTAP preparados: ${report.tests.databaseTestFiles.length} | Operação remota mutável: não`,
  );

  if (blockers.length > 0) {
    console.log("\nBloqueios:");
    for (const blocker of blockers) console.log(`- ${blocker}`);
  }
  if (warnings.length > 0) {
    console.log("\nAvisos:");
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}

process.exitCode = blockers.length === 0 ? 0 : 1;
