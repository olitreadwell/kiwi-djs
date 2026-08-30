// Prioritised, dependency-ordered work queue for the self-improving loop.
// Audits ALL open GitHub issues (not just automatable dataset fixes),
// scores them by priority label + dependency graph, and writes
// .loop/queue.json so the loop and agent sessions always work the top
// issue. Lower score = work first; blockers always land before the issues
// that depend on them.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATASET_FIXES } from './dataset-fixes';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const QUEUE_FILE = new URL('../.loop/queue.json', import.meta.url);

export interface QueueIssue {
  number: number;
  title: string;
  priority: number; // 0 = P0 ... 3 = P3, 4 = unlabelled
  persona: string | null;
  labels: string[];
  blocks: number[];
  blockedBy: number[];
  workable: boolean; // loop can auto-fix (DATASET_FIXES)
  score: number;
}

const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3'];

function runGh(args: string[]): string {
  const result = spawnSync('gh', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return result.stdout || result.stderr || '';
}

// Strong dependency edges from issue bodies: "depends on #12", "blocked by
// #12", "blocks #12", "part of #12", "parent of #12", "child of #12".
const DEP_KEYWORDS: Array<[RegExp, 'blocks' | 'blockedBy']> = [
  [/\b(?:depends? on|blocked by|requires?|needs?|waiting on|after|part of|child of|sub-?issue of)\s+#(\d+)/gi, 'blockedBy'],
  [/\b(?:blocks?|unblocks?|prerequisite for|before|parent of|parent)\s+#(\d+)/gi, 'blocks'],
];

// Bare "#12" references ("see #12", "related to #12") are weak edges: they
// nudge the referencing issue to land just after the referenced one.
const WEAK_REF = /#(\d+)/g;

interface RawIssue {
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
}

function priorityOf(labels: string[]): number {
  for (let i = 0; i < PRIORITY_ORDER.length; i += 1) {
    if (labels.includes(PRIORITY_ORDER[i])) return i;
  }
  return PRIORITY_ORDER.length;
}

function personaOf(labels: string[]): string | null {
  return labels.find((label) => label.startsWith('persona:')) ?? null;
}

function collectEdges(text: string, kind: 'blocks' | 'blockedBy'): number[] {
  const out = new Set<number>();
  for (const [pattern, edgeKind] of DEP_KEYWORDS) {
    if (edgeKind !== kind) continue;
    for (const match of text.matchAll(pattern)) out.add(Number(match[1]));
  }
  return [...out];
}

function weakRefs(text: string): number[] {
  const out = new Set<number>();
  for (const match of text.matchAll(WEAK_REF)) out.add(Number(match[1]));
  return [...out];
}

export function buildIssueQueue(): QueueIssue[] {
  const raw = runGh([
    'issue', 'list', '--state', 'open', '--limit', '200',
    '--json', 'number,title,body,labels',
  ]);
  let issues: RawIssue[] = [];
  try {
    issues = JSON.parse(raw) as RawIssue[];
  } catch {
    return [];
  }
  const workableNumbers = new Set(DATASET_FIXES.map((fix) => fix.issueNumber));
  const byNumber = new Map<number, QueueIssue>();
  for (const issue of issues) {
    const labels = issue.labels.map((label) => label.name);
    const text = `${issue.title}\n${issue.body ?? ''}`;
    byNumber.set(issue.number, {
      number: issue.number,
      title: issue.title,
      priority: priorityOf(labels),
      persona: personaOf(labels),
      labels,
      blocks: collectEdges(text, 'blocks').filter((n) => n !== issue.number),
      blockedBy: collectEdges(text, 'blockedBy').filter((n) => n !== issue.number),
      workable: workableNumbers.has(issue.number),
      score: 0,
    });
  }
  // Weak edges: referencing issue lands just after the referenced one.
  const weakCount = new Map<number, number>();
  for (const issue of issues) {
    const refs = weakRefs(`${issue.title}\n${issue.body ?? ''}`).filter((n) => n !== issue.number);
    weakCount.set(issue.number, refs.length);
  }
  // Topological order: blockers before dependents, priority first, then
  // how many issues each one unblocks, then issue number.
  const remaining = new Set(byNumber.keys());
  const ordered: QueueIssue[] = [];
  while (remaining.size > 0) {
    const available = [...remaining].filter((number) => {
      const issue = byNumber.get(number)!;
      return issue.blockedBy.every((blocker) => !remaining.has(blocker));
    });
    if (available.length === 0) {
      // Dependency cycle — break it by priority so the queue never stalls.
      const cycle = [...remaining].sort((a, b) => {
        const pa = byNumber.get(a)!.priority;
        const pb = byNumber.get(b)!.priority;
        return pa - pb || a - b;
      });
      available.push(cycle[0]);
    }
    available.sort((a, b) => {
      const ia = byNumber.get(a)!;
      const ib = byNumber.get(b)!;
      return ia.priority - ib.priority || ib.blocks.length - ia.blocks.length || a - b;
    });
    const next = available[0];
    remaining.delete(next);
    ordered.push(byNumber.get(next)!);
  }
  for (const issue of ordered) {
    issue.score =
      issue.priority * 100 +
      (weakCount.get(issue.number) ?? 0) * 25 +
      issue.blockedBy.length * 10 -
      issue.blocks.length * 5 +
      issue.number / 1000;
  }
  return ordered;
}

export function writeIssueQueue(queue: QueueIssue[]): void {
  const dir = new URL('../.loop/', import.meta.url);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    QUEUE_FILE,
    JSON.stringify({ generatedAt: new Date().toISOString(), issues: queue }, null, 2),
  );
}

export function loadIssueQueue(): QueueIssue[] {
  if (!existsSync(QUEUE_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(QUEUE_FILE, 'utf8')) as { issues: QueueIssue[] };
    return parsed.issues ?? [];
  } catch {
    return [];
  }
}
