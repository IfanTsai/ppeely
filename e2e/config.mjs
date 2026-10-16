// Settings shared by the test suites, read from environment variables.
import { existsSync } from 'node:fs';

// Test media, created by scripts/make-fixtures.sh; e2e/fixtures by default.
export const FIXTURES = process.env.FIXTURES ?? 'e2e/fixtures';
export const OUTPUT = process.env.OUTPUT ?? 'e2e/output';

if (!existsSync(`${FIXTURES}/cat.jpg`)) {
  throw new Error(`no test media in ${FIXTURES}; create it with ./scripts/make-fixtures.sh ${FIXTURES}`);
}

// E2E_ONLY=<regular expression> runs only the steps whose name matches (case-insensitive), to iterate on one feature.
// Later steps may rely on data that earlier steps leave behind, so a filtered run can fail where a full run passes.
const only = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY, 'i') : null;

export const selected = (name) => !only || only.test(name);
