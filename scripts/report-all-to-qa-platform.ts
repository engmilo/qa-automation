import 'dotenv/config';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { login, env } from '../helpers/login';

// UNIVERSAL reporter v4 - with STEP sync + LOCAL timestamp (Helsinki)
// FIX: was using new Date().toISOString() = UTC, so Run name was 2h behind Helsinki (UTC+2)
// Now uses local time: 2026-11-17 17:13 instead of 15:13

function localStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function qaStatusFromPlaywright(statuses: string[]): string {
  if (statuses.some((s) => s === 'failed' || s === 'timedOut' || s === 'interrupted')) return 'failed';
  if (statuses.every((s) => s === 'skipped')) return 'blocked';
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
const SUITE_CONFIG = [
  { name: 'Automation - Smoke', planName: 'Automation - Regression', tcs: ['TC-001', 'TC-002', 'TC-004'] },
  { name: 'Demoblaze - Cart', planName: 'Automation - Regression', tcs: ['TC-003'] },
];

async function main() {
  const baseURL = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const email = env('TEST_USER_EMAIL');
  const password = env('TEST_USER_PASSWORD');
  const resultsPath = path.join(process.cwd(), 'test-results', 'results.json');
  if (!fs.existsSync(resultsPath)) throw new Error('No test-results/results.json - run npx playwright test first');
  const json = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const specs = collectSpecs(json);
  console.log(`[reporter] Found ${specs.length} Playwright specs in results.json`);
  const byCase = new Map<string, string[]>();
  for (const { title, status } of specs) {
    const m = title.match(/TC-\d+/);
    if (!m) continue;
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
  console.log(`[reporter] Local time for Run name: ${localStamp()} (UTC would be ${new Date().toISOString().slice(0, 16).replace('T', ' ')})`);

  console.log('[reporter] Logging in via browser to get cookies...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await login(page, email, password);
  const probe = await page.request.get(`${baseURL}/api/test-suites`);
  if (!probe.ok()) throw new Error(`Login failed - GET /api/test-suites returned ${probe.status()}`);
  console.log('[reporter] Logged in, cookies OK');

  const suitesRes = await page.request.get(`${baseURL}/api/test-suites`);
  const suitesJson: any = await suitesRes.json();
  const suitesList: any[] = suitesJson.testSuites ?? suitesJson.test_suites ?? suitesJson.data ?? suitesJson ?? [];
  console.log(`[reporter] Suites from API: ${suitesList.map((s: any) => s.name ?? s.title).join(', ')}`);

  for (const cfg of SUITE_CONFIG) {
    const wanted = cfg.tcs.filter((tc) => qaByCase.has(tc));
    if (wanted.length === 0) { console.log(`[reporter] SKIP suite "${cfg.name}" - no Playwright results`); continue; }
    const suite = suitesList.find((s: any) => (s.name ?? s.title) === cfg.name);
    if (!suite) throw new Error(`Suite not found: ${cfg.name}`);
    const suiteId = suite.id;
    const projectId = suite.project_id ?? suite.projectId;
    let testPlanId = suite.test_plan_id ?? suite.testPlanId ?? null;
    console.log(`[reporter] Suite ${cfg.name} id=${suiteId} project=${projectId} plan=${testPlanId}`);
    if (!testPlanId) {
      const plansRes = await page.request.get(`${baseURL}/api/test-plans`);
      const plansJson: any = await plansRes.json();
      const plansList: any[] = plansJson.testPlans ?? plansJson.test_plans ?? plansJson.data ?? [];
      const plan = plansList.find((p: any) => (p.name ?? p.title) === cfg.planName);
      if (plan) testPlanId = plan.id;
    }

    const runName = `${cfg.name} - ${localStamp()}`;
    console.log(`[reporter] Creating Run: ${runName}`);
    const createRes = await page.request.post(`${baseURL}/api/test-runs`, {
      data: { projectId, name: runName, testPlanId, suiteIds: [suiteId], description: `Auto-reported from Playwright qa-automation (${cfg.name})` },
    });
    if (!createRes.ok()) throw new Error(`POST /api/test-runs failed ${createRes.status()}: ${await createRes.text()}`);
    const created: any = await createRes.json();
    const runId = created.testRun?.id ?? created.run?.id ?? created.data?.id ?? created.id;
    console.log(`[reporter] Run created id=${runId}`);

    const runRes = await page.request.get(`${baseURL}/api/test-runs/${runId}`);
    const runJson: any = await runRes.json();
    const executions: any[] = runJson.executions ?? runJson.testRun?.executions ?? runJson.test_cases ?? [];
    const keyToExec = new Map<string, { tcId: string; execId: string }>();
    for (const e of executions) {
      const key = e.test_cases?.case_key ?? e.case_key ?? e.test_cases?.code ?? e.code;
      const tcId = e.test_case_id ?? e.test_cases?.id;
      const execId = e.id;
      if (key && tcId && execId) keyToExec.set(key, { tcId, execId });
    }
    console.log(`[reporter] Executions in Run: ${[...keyToExec.keys()].join(', ')}`);

    for (const key of wanted) {
      const qaStatus = qaByCase.get(key)!;
      const found = keyToExec.get(key);
      if (!found) { console.log(`[reporter] SKIP ${key} - not in this Run's executions`); continue; }
      const patchRes = await page.request.patch(`${baseURL}/api/test-runs/${runId}`, { data: { test_case_id: found.tcId, status: qaStatus } });
      if (!patchRes.ok()) console.log(`[reporter] WARN PATCH ${key} -> ${qaStatus} failed ${patchRes.status()}`);
      else console.log(`[reporter] Updated ${key} -> ${qaStatus}`);
      if (qaStatus === 'passed' || qaStatus === 'blocked') {
        const stepsRes = await page.request.get(`${baseURL}/api/test-executions/${found.execId}/steps`);
        const stepsJson: any = await stepsRes.json().catch(() => ({}));
        const steps: any[] = stepsJson.steps ?? [];
        if (steps.length === 0) console.log(`[reporter] ${key} - no steps to sync`);
        else {
          const updated = steps.map((s: any) => ({
            ...s,
            status: qaStatus,
            actual_result: s.actual_result || (qaStatus === 'passed' ? 'Auto: Playwright passed' : 'Auto: Playwright blocked - precondition missing'),
          }));
          const saveRes = await page.request.patch(`${baseURL}/api/test-executions/${found.execId}/steps`, { data: { steps: updated } });
          if (!saveRes.ok()) console.log(`[reporter] WARN steps ${key} failed ${saveRes.status()}`);
          else console.log(`[reporter] Steps ${key} -> ${qaStatus} (${steps.length} steps)`);
        }
      } else {
        console.log(`[reporter] Steps ${key} left Not Run - ${key} failed, mark the failing step manually`);
      }
    }
    const doneRes = await page.request.patch(`${baseURL}/api/test-runs/${runId}`, { data: { status: 'completed' } });
    if (!doneRes.ok()) console.log(`[reporter] WARN complete Run failed ${doneRes.status()}`);
    else console.log('[reporter] Run completed');
    console.log(`[reporter] DONE ${cfg.name}. See it at: ${baseURL}/test-runs/${runId}`);
  }
  await browser.close();
}
main().catch((e) => { console.error('[reporter] FAILED:', e.message); process.exit(1); });
