// Routine, non-destructive verification of the committed data (npm run verify:data).
// Run from frontend/. Regenerates nothing and downloads nothing; stops at the first failing check and
// exits with its status. The sequence and the MAP-AUDIT.md handling live in scripts/lib/verify-data.mjs;
// CI runs this same command.
//
// Not covered: strict WWII provenance with external inputs (npm run data:ww2:verify -- --require-external),
// the country-geometry reproducibility rebuild, npm audit, build, browser smokes, perf budgets, backend.
import { verifyData } from './lib/verify-data.mjs'

process.exitCode = verifyData().status
