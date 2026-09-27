# Toetstrainer (mstp)

A practice app for NT2 students (Dutch as a second language) preparing for *toetsweken* at a Dutch secondary school.
Admins upload the study material. An LLM turns it into a topic tree and practice questions. Students answer in Dutch or
English and get scored feedback, a personal list of hard words, flashcards, and gamified stats.

Production: https://mstp.change-commit.nl (fallback: https://mstp-509920.web.app)

## Architecture

| Part | Tech |
| --- | --- |
| Web app | React + Vite + TypeScript + Tailwind, react-i18next (NL/EN), Firebase Hosting |
| Auth | Firebase Auth (Google) with blocking functions: only emails in `allowedUsers/{email}` can sign in; they get a `role` claim (`student` / `admin`) |
| Data | Firestore (europe-west4), Cloud Storage for uploads and analysis artifacts |
| Backend | Cloud Functions v2 (europe-west1, because Cloud Tasks isn't available in europe-west4) |
| LLM | OpenAI Responses API with Structured Outputs; model `gpt-6-sol` (override with `LLM_MODEL`) |

```
shared/src      zod schemas, types, scoring and gamification logic (used by web and functions)
functions/src   auth/ (allowlist), testmaker/ (extract → topic tree → questions), evaluator/, admin/, llm/ (client, prompts, mock)
web/src         pages/ (student), pages/admin/ (Beheer), components/, lib/
tests/          unit/ (vitest), rules/ (emulator), e2e/ (full pipeline on emulators)
```

### Test Maker
1. Admin uploads files under **Beheer → vak**: PDF (scans too), images, DOCX, text.
2. **Genereer vragen** calls `startTestMaker`, which enqueues one `tmExtractMaterial` task per file.
   - Files already analysed with the same content hash, model and prompt version are skipped.
   - *Alle bestanden opnieuw analyseren* forces a re-analysis.
   - Artifacts are stored in `artifacts/…json`.
3. When the last file is done, `tmGenerateQuestions`:
   - extends the topic tree (existing ids stay stable);
   - generates questions per subtopic;
   - **only adds new questions**, skipping duplicates by fingerprint.

   *Vervang-modus* (`allowDeleteQuestions`) builds a fresh set and **archives** the old questions. They are never hard-deleted, so student history stays intact.

Model answers live in `questions/{id}/private/answer`, which only admins and functions can read.

### Evaluator
`evaluateAnswer` grades one answer:
- **English answers:** `score = content`.
- **Dutch answers:** `score = content × (0.7 + 0.3 × language/100)`, so well-written Dutch that misses the point still scores 0.

It returns feedback in NL and EN, a corrected Dutch sentence and key vocabulary. In a single transaction it then:
- updates the best score per language;
- updates the subject stats, XP (for improvement only), streak and badges;
- adds new words to `users/{uid}/vocab`.

It is capped at 150 evaluations per user per day.

## Development

Requires Node 22+, Java 21 (for the emulators) and the Firebase CLI (installed as a dev dependency).

```bash
npm install
npm test                 # unit tests
npm run typecheck
npm run test:rules       # Firestore/Storage security rules on the emulator
npm run test:e2e         # full pipeline on emulators with a mock LLM (what CI runs)
npm run test:e2e:real    # same, with real OpenAI calls (needs functions/.secret.local: OPENAI_API_KEY=...)
```

To run the app locally against the emulators:
```bash
echo "LLM_MODE=mock" > functions/.env.local     # or leave out and add functions/.secret.local for real calls
npm run emulators                                # terminal 1
VITE_USE_EMULATORS=true npm run dev              # terminal 2 → http://localhost:5173
```
Add yourself to `allowedUsers` in the Emulator UI (http://localhost:4000) before signing in.

## Deployment

- **Pull requests:** `.github/workflows/ci.yml` runs typecheck, unit, rules and e2e (mock) tests.
- **Push to `main`:** `.github/workflows/deploy.yml` runs the same checks, then deploys Firestore rules and indexes,
  Storage rules, Functions and Hosting. It authenticates through Workload Identity Federation as
  `github-deployer@mstp-509920.iam.gserviceaccount.com`, so there are no keys in GitHub.

### Operations
- Add the first admin: `scripts/seed-admin.sh you@gmail.com admin "Name"`. After that, manage users in the app under **Beheer → Gebruikers**.
- OpenAI key: stored in Secret Manager as `OPENAI_API_KEY`. To rotate it:
  `printf %s "$KEY" | gcloud secrets versions add OPENAI_API_KEY --data-file=- --project mstp-509920`, then redeploy the functions.
