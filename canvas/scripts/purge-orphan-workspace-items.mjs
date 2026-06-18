import { pool } from '../server/db.js';
import {
  ORPHAN_PURGE_CONFIRM_TOKEN,
  runOrphanWorkspacePurge,
} from '../server/repositories/orphan-workspace-purge.js';

function argValue(name) {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

const apply = process.argv.includes('--apply');
const confirm = argValue('--confirm');
const sampleLimit = Number(argValue('--sample-limit')) || 20;

function printableReport(report) {
  const { candidates, ...safeReport } = report;
  return safeReport;
}

try {
  const report = await runOrphanWorkspacePurge({
    apply,
    confirm,
    sampleLimit,
  });
  console.log(JSON.stringify(printableReport(report), null, 2));
  if (!apply) {
    console.log(
      `Dry run only. To apply, rerun with --apply --confirm=${ORPHAN_PURGE_CONFIRM_TOKEN}`,
    );
  }
} catch (error) {
  console.error(error?.message ?? error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
