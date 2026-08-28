export type GoalStatus = "not_started" | "in_progress" | "achieved" | "at_risk" | "deferred";
export type ActionStatus = "not_started" | "in_progress" | "completed";
export type ReportKind = "manager_ready" | "annual" | "category" | "goal" | "commitment";

export interface PublishedAction { id: string; title: string; status: ActionStatus; sortOrder: number; }
export interface PublishedSection { id: string; title: string; sortOrder: number; actions: PublishedAction[]; }
export interface PublishedGoal { id: string; title: string; description: string; status: GoalStatus; progress: number; confidence: number; dueDate: string | null; sortOrder: number; xdLensIds: string[]; xdLensNames: string[]; philipsLensNames: string[]; confirmedEvidenceCount: number; sections: PublishedSection[]; }
export interface PublishedLens { id: string; name: string; description: string; color: string; sortOrder: number; }
export interface PublishedEvidenceItem { id: string; title: string; metadata: string; relationship: string | null; note: string | null; sourceUrl: string | null; fileName: string | null; assetPath: string | null; }
export interface PublishedReportNode { title: string; paragraphs: string[]; bullets: string[]; evidence: PublishedEvidenceItem[]; children: PublishedReportNode[]; }
export interface PublishedReport { id: string; kind: ReportKind; title: string; subtitle: string; generatedAt: string; evidenceDisclosure: "metadata_only" | "include_excerpts"; privacyNote: string; categoryId: string | null; goalId: string | null; sections: PublishedReportNode[]; }
export interface PublishedAsset { id: string; path: string; mimeType: string; byteLength: number; }
export type PublishedAccess = { mode: "none" } | { mode: "pin"; verifier: string };
export interface ManagerPublicationBundle { schemaVersion: 1; publicationId: string; publishedAt: string; contentFingerprint: string; access: PublishedAccess; year: { id: string; label: string; status: string }; lenses: PublishedLens[]; goals: PublishedGoal[]; reports: { managerReady: PublishedReport; annual: PublishedReport; categories: PublishedReport[]; goals: PublishedReport[]; commitment: PublishedReport }; assets: PublishedAsset[]; }

const string = (value: unknown): value is string => typeof value === "string";
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function validatePublication(value: unknown): { ok: true; bundle: ManagerPublicationBundle } | { ok: false; reason: "unsupported" | "invalid" } {
  if (!object(value)) return { ok: false, reason: "invalid" };
  if (value.schemaVersion !== 1) return { ok: false, reason: "unsupported" };
  if (!string(value.publicationId) || !string(value.publishedAt) || !string(value.contentFingerprint) || !object(value.year) || !string(value.year.label) || !Array.isArray(value.lenses) || !Array.isArray(value.goals) || !object(value.reports) || !Array.isArray(value.assets)) return { ok: false, reason: "invalid" };
  const access = value.access === undefined ? { mode: "none" } : value.access;
  if (!object(access) || (access.mode !== "none" && !(access.mode === "pin" && string(access.verifier) && /^[a-f0-9]{64}$/i.test(access.verifier)))) return { ok: false, reason: "invalid" };
  const reports = value.reports;
  if (!object(reports.managerReady) || !object(reports.annual) || !object(reports.commitment) || !Array.isArray(reports.categories) || !Array.isArray(reports.goals)) return { ok: false, reason: "invalid" };
  const serialized = JSON.stringify(value);
  if (/file:\/\//i.test(serialized) || /(?:^|[\s("'=])\/(?:Users|home|private|var)\//i.test(serialized) || /goal-evidence-tracker\.db|sqlite:/i.test(serialized)) return { ok: false, reason: "invalid" };
  return { ok: true, bundle: { ...value, access } as unknown as ManagerPublicationBundle };
}

const MANAGER_PIN_CONTEXT = "goal-evidence-manager-view:";

export async function verifyManagerPin(pin: string, verifier: string): Promise<boolean> {
  if (!/^\d{4}$/.test(pin) || !/^[a-f0-9]{64}$/i.test(verifier)) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${MANAGER_PIN_CONTEXT}${pin}`));
  const candidate = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return candidate === verifier.toLowerCase();
}

export function isAllowedAsset(bundle: ManagerPublicationBundle, path: string | null): path is string {
  return Boolean(path && !path.startsWith("/") && !path.includes("..") && bundle.assets.some((asset) => asset.path === path));
}

export function isHttps(value: string | null): value is string {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function reportText(report: PublishedReport): string {
  const lines = [report.title, report.subtitle, report.privacyNote];
  const visit = (node: PublishedReportNode, depth: number) => {
    lines.push(`${"#".repeat(Math.min(6, depth))} ${node.title}`, ...node.paragraphs, ...node.bullets.map((item) => `- ${item}`));
    node.evidence.forEach((item) => { lines.push(item.title, item.metadata); if (item.note) lines.push(item.note); if (item.sourceUrl) lines.push(item.sourceUrl); if (item.fileName) lines.push(item.fileName); });
    node.children.forEach((item) => visit(item, depth + 1));
  };
  report.sections.forEach((item) => visit(item, 2));
  return lines.filter(Boolean).join("\n\n");
}
