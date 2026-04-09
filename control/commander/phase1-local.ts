import { runPhase1Local } from "../../core/loop/phase1-local-flow.ts";

const summary = await runPhase1Local(process.cwd());
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
