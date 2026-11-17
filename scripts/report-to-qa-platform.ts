import 'dotenv/config';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { login, env } from '../helpers/login';

// Reporter: Playwright results -> QA Platform Test Run
// Run AFTER smoke: npx playwright test ... then npx tsx scripts/report-to-qa-platform.ts
// It logs in via browser (cookies), so it can call the cookie-only API.
// Flow: login -> find Suite by name -> POST /api/test-runs (suiteIds) -> PATCH each case -> PATCH completed

function qaStatusFromPlaywright(statuses: string[]): string {
  // statuses for one case_key, e.g. TC-002 has 3: [passed, passed, passed]
  if (statuses.some((s) => s === 'failed' || s === 'timedOut' || s === 'interrupted')) return 'failed';
  if (statuses.every((s) => s === 'skipped')) return 'blocked'; // API maps skipped->not_applicable, so send blocked for TC-004
  if (statuses.some((s) => s === 'passed')) return 'passed';
  return 'not_run';
}

function collectSpecs(node: any, out: { title: string; status: string }[] = []) {
  const suites = node.suites ?? [];
  for (const s of suites) {
    for (const spec of s.specs ?? []) {
      const title = spec.title as string;
      const results = (spec.tests ?? []).flatMap((t: any) => t.results ?? []);
      const status = results[0]?.status ?? (spec.ok ? 'passed' : 'failed');
      out.push({ title, status });
    }
    collectSpecs(s, out);
  }
  return out;
}

async function main() {
  const baseURL = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const suiteName = process.env.QA_SUITE_NAME || 'Automation - Smoke';
  const planName = process.env.QA_PLAN_NAME || 'Automation - Regression';
  const email = env('TEST_USER_EMAIL');
  const password = env('TEST_USER_PASSWORD');

  // 1. Read Playwright JSON
  const resultsPath = path.join(process.cwd(), 'test-results', 'results.json');
  if (!fs.existsSync(resultsPath)) throw new Error('No test-results/results.json - run npx playwright test first');
  const json = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const specs = collectSpecs(json);
  console.log(`[reporter] Found ${specs.length} Playwright specs in results.json`);

  // Group by case_key: TC-002a/b/c -> TC-002
  const byCase = new Map<string, string[]>();
  for (const { title, status } of specs) {
    const m = title.match(/TC-\d+/);
    if (!m) { console.log(`[reporter] SKIP no TC- key in title: ${title}`); continue; }
    const key = m[0];
    if (!byCase.has(key)) byCase.set(key, []);
    byCase.get(key)!.push(status);
  }
  const qaByCase = new Map<string, string>();
  for (const [key, statuses] of byCase) {
    const qa = qaStatusFromPlaywright(statuses);
    qaByCase.set(key, qa);
    console.log(`[reporter] ${key}: Playwright [${statuses.join(',')}] -> QA ${qa}`);
  }

  // 2. Login via browser (cookies)
  console.log('[reporter] Logging in via browser to get cookies...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await login(page, email, password);
  // Verify login worked: API should now return 200, not 401
  const probe = await page.request.get(`${baseURL}/api/test-suites`);
  if (!probe.ok()) throw new Error(`Login failed - GET /api/test-suites returned ${probe.status()}`);
  console.log('[reporter] Logged in, cookies OK');

  // 3. Find Suite by name
  const suitesRes = await page.request.get(`${baseURL}/api/test-suites`);
  const suitesJson: any = await suitesRes.json();
  const suitesList: any[] = suitesJson.testSuites ?? suitesJson.test_suites ?? suitesJson.data ?? suitesJson ?? [];
  const suite = suitesList.find((s: any) => (s.name ?? s.title) === suiteName);
  if (!suite) throw new Error(`Suite not found: ${suiteName}. Available: ${suitesList.map((s: any) => s.name ?? s.title).join(', ')}`);
  const suiteId = suite.id;
  const projectId = suite.project_id ?? suite.projectId;
  let testPlanId = suite.test_plan_id ?? suite.testPlanId ?? null;
  console.log(`[reporter] Suite ${suiteName} id=${suiteId} project=${projectId} plan=${testPlanId}`);

  // Fallback: find Plan by name if Suite has no plan
  if (!testPlanId) {
    const plansRes = await page.request.get(`${baseURL}/api/test-plans`);
    const plansJson: any = await plansRes.json();
    const plansList: any[] = plansJson.testPlans ?? plansJson.test_plans ?? plansJson.data ?? [];
    const plan = plansList.find((p: any) => (p.name ?? p.title) === planName);
    if (plan) testPlanId = plan.id;
  }

  // 4. Create Run with suiteIds -> auto-pulls TC-001..TC-004
  const runName = `Automation - Smoke - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  console.log(`[reporter] Creating Run: ${runName}`);
  const createRes = await page.request.post(`${baseURL}/api/test-runs`, {
    data: { projectId, name: runName, testPlanId, suiteIds: [suiteId], description: 'Auto-reported from Playwright qa-automation (Automation - Smoke)' },
  });
  if (!createRes.ok()) throw new Error(`POST /api/test-runs failed ${createRes.status()}: ${await createRes.text()}`);
  const created: any = await createRes.json();
  const runId = created.testRun?.id ?? created.run?.id ?? created.data?.id;
  console.log(`[reporter] Run created id=${runId} cases=${created.testCaseCount}`);

  // 5. Map case_key -> test_case_id via GET Run
  const runRes = await page.request.get(`${baseURL}/api/test-runs/${runId}`);
  const runJson: any = await runRes.json();
  const executions: any[] = runJson.executions ?? runJson.test_cases ?? [];
  const keyToId = new Map<string, string>();
  for (const e of executions) {
    const key = e.test_cases?.case_key ?? e.case_key;
    const tcId = e.test_case_id ?? e.test_cases?.id;
    if (key && tcId) keyToId.set(key, tcId);
  }
  console.log(`[reporter] Executions in Run: ${[...keyToId.keys()].join(', ')}`);

  // 6. PATCH each case that was in Playwright results
  for (const [key, qaStatus] of qaByCase) {
    const tcId = keyToId.get(key);
    if (!tcId) { console.log(`[reporter] SKIP ${key} - not in this Run's executions`); continue; }
    const patchRes = await page.request.patch(`${baseURL}/api/test-runs/${runId}`, { data: { test_case_id: tcId, status: qaStatus } });
    if (!patchRes.ok()) console.log(`[reporter] WARN PATCH ${key} -> ${qaStatus} failed ${patchRes.status()}: ${await patchRes.text()}`);
    else console.log(`[reporter] Updated ${key} -> ${qaStatus}`);
  }

  // 7. Complete Run
  const doneRes = await page.request.patch(`${baseURL}/api/test-runs/${runId}`, { data: { status: 'completed' } });
  if (!doneRes.ok()) console.log(`[reporter] WARN complete Run failed ${doneRes.status()}`);
  else console.log('[reporter] Run completed');

  console.log(`[reporter] DONE. See it at: ${baseURL}/test-runs/${runId}`);
  await browser.close();
}

main().catch((e) => { console.error('[reporter] FAILED:', e.message); process.exit(1); });
