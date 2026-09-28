// Runs an e2e script (default tests/e2e/pipeline.e2e.mjs) inside the Firebase emulators.
// mode "mock": fake LLM (no API key needed) — used in CI.
// mode "real": real OpenAI calls; needs functions/.secret.local with OPENAI_API_KEY=...
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, rmSync } from 'node:fs';

const mode = process.argv[2] === 'real' ? 'real' : 'mock';
const script = process.argv[3] ?? 'tests/e2e/pipeline.e2e.mjs';
const envFile = 'functions/.env.local';
const secretFile = 'functions/.secret.local';
const createdSecret = !existsSync(secretFile);

writeFileSync(envFile, mode === 'mock' ? 'LLM_MODE=mock\n' : 'LLM_MODE=real\n');
if (createdSecret) {
  if (mode === 'real') throw new Error(`${secretFile} with OPENAI_API_KEY=... is required for real mode`);
  writeFileSync(secretFile, 'OPENAI_API_KEY=unused-in-mock-mode\n');
}
try {
  execSync(
    `firebase emulators:exec --only auth,firestore,storage,functions,tasks --project demo-mstp "node ${script}"`,
    { stdio: 'inherit' },
  );
} finally {
  rmSync(envFile, { force: true });
  if (createdSecret) rmSync(secretFile, { force: true });
}
