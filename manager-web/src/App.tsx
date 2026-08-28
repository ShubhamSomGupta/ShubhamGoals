import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { isAllowedAsset, isHttps, reportText, validatePublication, verifyManagerPin, type ManagerPublicationBundle, type PublishedEvidenceItem, type PublishedGoal, type PublishedReport, type PublishedReportNode } from "./publication";

type Page = "goals" | "reports";
type ReportTab = "managerReady" | "annual" | "categories" | "goals" | "commitment";

const formatDate = (value: string | null, withTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
};

const statusLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function App() {
  const [bundle, setBundle] = useState<ManagerPublicationBundle | null>(null);
  const [error, setError] = useState<"none" | "missing" | "invalid" | "unsupported">("none");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("goals");
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("./published/manager-view.json", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 404) throw new Error("missing");
        if (!response.ok) throw new Error("invalid");
        return response.json();
      })
      .then((value) => {
        if (!active) return;
        const result = validatePublication(value);
        if (result.ok) setBundle(result.bundle);
        else setError(result.reason);
      })
      .catch((caught) => { if (active) setError(caught instanceof Error && caught.message === "missing" ? "missing" : "invalid"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <StatePage title="Opening the private manager view" resolution="Loading the latest successful publication…" busy />;
  if (!bundle) {
    const copy = error === "missing"
      ? ["No manager view has been published", "Publish the current year from Reports in the desktop application."]
      : error === "unsupported"
        ? ["This publication needs a newer viewer", "Ask the app owner to update the manager website."]
        : ["The manager view could not open", "Republish it from the desktop application. The source goal data is unchanged."];
    return <StatePage title={copy[0]} resolution={copy[1]} />;
  }

  if (bundle.access.mode === "pin" && !unlocked) return <ManagerPinDialog verifier={bundle.access.verifier} onUnlock={() => setUnlocked(true)} />;

  return <div className="manager-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="manager-header">
      <div className="brand"><span className="brand-mark" aria-hidden="true">✓</span><span><strong>Goal Evidence Tracker</strong><small>Private manager view</small></span></div>
      <div className="publication-meta"><span className="private-pill">Private company view</span><span><strong>{bundle.year.label}</strong><small>Published {formatDate(bundle.publishedAt, true)}</small></span></div>
    </header>
    <aside className="manager-sidebar" aria-label="Manager view navigation">
      <p>Published workspace</p>
      <nav><button type="button" aria-current={page === "goals" ? "page" : undefined} onClick={() => setPage("goals")}><span aria-hidden="true">◎</span>Goals</button><button type="button" aria-current={page === "reports" ? "page" : undefined} onClick={() => setPage("reports")}><span aria-hidden="true">▤</span>Reports</button></nav>
      <div className="read-only-note"><strong>Read only</strong><span>Updates are published from the desktop application.</span></div>
    </aside>
    <main id="main-content" className="manager-main" tabIndex={-1}>
      {page === "goals" ? <GoalsPage bundle={bundle} /> : <ReportsPage bundle={bundle} />}
    </main>
  </div>;
}

function ManagerPinDialog({ verifier, onUnlock }: { verifier: string; onUnlock: () => void }) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  const updateDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits((current) => current.map((item, itemIndex) => itemIndex === index ? digit : item));
    setError(null);
    if (digit && index < 3) inputs.current[index + 1]?.focus();
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); inputs.current[index - 1]?.focus(); }
    if (event.key === "ArrowRight" && index < 3) { event.preventDefault(); inputs.current[index + 1]?.focus(); }
  };

  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const value = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!value) return;
    event.preventDefault();
    const next = Array.from({ length: 4 }, (_, index) => value[index] ?? "");
    setDigits(next);
    setError(null);
    inputs.current[Math.min(value.length, 4) - 1]?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const pin = digits.join("");
    if (pin.length !== 4) { setError("Enter all four digits."); return; }
    setChecking(true);
    const matches = await verifyManagerPin(pin, verifier);
    setChecking(false);
    if (matches) { onUnlock(); return; }
    setDigits(["", "", "", ""]);
    setError("That PIN does not match. Check the digits and try again.");
    inputs.current[0]?.focus();
  };

  return <main className="pin-lock-page">
    <section className="pin-dialog" role="dialog" aria-modal="true" aria-labelledby="pin-dialog-title" aria-describedby="pin-dialog-description">
      <span className="pin-lock-mark" aria-hidden="true">✓</span>
      <p className="eyebrow">Goal Evidence Tracker</p>
      <h1 id="pin-dialog-title">Enter your PIN</h1>
      <p id="pin-dialog-description">Use the four-digit PIN shared by the workspace owner.</p>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className="pin-entry" aria-label="Four-digit PIN">
          <legend className="sr-only">Four-digit PIN</legend>
          {digits.map((digit, index) => <input
            key={index}
            ref={(element) => { inputs.current[index] = element; }}
            type="password"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            pattern="[0-9]"
            maxLength={1}
            value={digit}
            aria-label={`PIN digit ${index + 1}`}
            aria-invalid={Boolean(error)}
            onChange={(event) => updateDigit(index, event.target.value)}
            onKeyDown={(event) => keyDown(event, index)}
            onPaste={paste}
          />)}
        </fieldset>
        {error && <p className="pin-error" role="alert">{error}</p>}
        <button type="submit" disabled={checking || digits.some((digit) => !digit)}>{checking ? "Checking…" : "Open manager view"}</button>
      </form>
      <small>Temporary access screen for pilot testing.</small>
    </section>
  </main>;
}

function StatePage({ title, resolution, busy = false }: { title: string; resolution: string; busy?: boolean }) {
  return <main className="state-page" aria-busy={busy}><span className="state-mark" aria-hidden="true">{busy ? "…" : "!"}</span><h1>{title}</h1><p>{resolution}</p></main>;
}

function GoalsPage({ bundle }: { bundle: ManagerPublicationBundle }) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const normalized = query.trim().toLowerCase();
  const goals = useMemo(() => bundle.goals.filter((goal) => !normalized || `${goal.title} ${goal.description} ${goal.xdLensNames.join(" ")}`.toLowerCase().includes(normalized)), [bundle.goals, normalized]);
  const actionCount = bundle.goals.reduce((total, goal) => total + goal.sections.reduce((sum, section) => sum + section.actions.length, 0), 0);
  return <div className="page goals-page">
    <header className="page-head"><div><p className="eyebrow">Annual plan · {bundle.year.label}</p><h1>Goals and the work that moves them.</h1><p>This view reflects the latest successful publication from the desktop workspace.</p></div></header>
    <div className="toolbar"><label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">Search published goals</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search goals" /></label><div className="counts"><span>{bundle.goals.length} goals</span><span>{actionCount} actions</span></div></div>
    <div className="goal-groups">{bundle.lenses.map((lens) => {
      const lensGoals = goals.filter((goal) => goal.xdLensIds.includes(lens.id));
      if (!lensGoals.length) return null;
      const allLensGoals = bundle.goals.filter((goal) => goal.xdLensIds.includes(lens.id));
      const average = allLensGoals.length ? Math.round(allLensGoals.reduce((sum, goal) => sum + goal.progress, 0) / allLensGoals.length) : 0;
      const isCollapsed = collapsed.has(lens.id);
      return <section className="card goal-group" style={{ "--lens-color": lens.color } as React.CSSProperties} key={lens.id}>
        <button className="goal-group-head" type="button" aria-expanded={!isCollapsed} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(lens.id)) next.delete(lens.id); else next.add(lens.id); return next; })}><span className="lens-dot" aria-hidden="true" /><span><small>XD Lens</small><strong>{lens.name}</strong><em>{lens.description}</em></span><span className="lens-summary"><span>{average}% average progress</span><span aria-hidden="true">{isCollapsed ? "▸" : "⌄"}</span></span></button>
        {!isCollapsed && <div className="goal-list">{lensGoals.map((goal) => <GoalCard goal={goal} lensColor={lens.color} key={`${lens.id}:${goal.id}`} />)}</div>}
      </section>;
    })}</div>
    {goals.length === 0 && <div className="empty-state"><strong>No goals match this search</strong><span>Clear the search or try another word.</span></div>}
  </div>;
}

function GoalCard({ goal, lensColor }: { goal: PublishedGoal; lensColor: string }) {
  return <article className="published-goal">
    <div className="goal-summary"><div><h2>{goal.title}</h2><p>{goal.description || "No description was published."}</p><span className="lens-names">{goal.philipsLensNames.join(" · ")}</span></div><div className="goal-status"><StatusPill status={goal.status} /><strong>{goal.progress}%</strong><span>{goal.confirmedEvidenceCount} evidence</span></div></div>
    <div className="goal-progress"><progress value={goal.progress} max="100" aria-label={`${goal.title} progress: ${goal.progress}%`} style={{ "--lens-color": lensColor } as React.CSSProperties}>{goal.progress}%</progress><span><span>Confidence {goal.confidence}%</span><span>Target {formatDate(goal.dueDate)}</span></span></div>
    {goal.sections.length > 0 && <div className="goal-structure" aria-label={`${goal.title} sections and actions`}>{goal.sections.map((section) => <section key={section.id}><h3>{section.title}</h3><ul>{section.actions.map((action) => <li key={action.id}><span className={`action-mark ${action.status}`} aria-hidden="true">{action.status === "completed" ? "✓" : action.status === "in_progress" ? "◐" : "○"}</span><span>{action.title}</span><small>{statusLabel(action.status)}</small></li>)}</ul></section>)}</div>}
  </article>;
}

function StatusPill({ status }: { status: string }) { return <span className={`status-pill ${status}`}>{statusLabel(status)}</span>; }

const reportTabs: Array<{ id: ReportTab; label: string }> = [
  { id: "managerReady", label: "Manager-ready summary" },
  { id: "annual", label: "Annual performance" },
  { id: "categories", label: "XD Lens progress" },
  { id: "goals", label: "Goal detail" },
  { id: "commitment", label: "Commitment reflection" },
];

function ReportsPage({ bundle }: { bundle: ManagerPublicationBundle }) {
  const [tab, setTab] = useState<ReportTab>("managerReady");
  const [categoryId, setCategoryId] = useState(bundle.reports.categories[0]?.categoryId ?? "");
  const [goalId, setGoalId] = useState(bundle.reports.goals[0]?.goalId ?? "");
  const [copied, setCopied] = useState(false);
  const report = tab === "managerReady" ? bundle.reports.managerReady : tab === "annual" ? bundle.reports.annual : tab === "commitment" ? bundle.reports.commitment : tab === "categories" ? bundle.reports.categories.find((item) => item.categoryId === categoryId) ?? bundle.reports.categories[0] : bundle.reports.goals.find((item) => item.goalId === goalId) ?? bundle.reports.goals[0];
  const selectTab = (next: ReportTab) => { setTab(next); setCopied(false); };
  const tabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? reportTabs.length - 1 : (index + direction + reportTabs.length) % reportTabs.length;
    selectTab(reportTabs[nextIndex].id);
    requestAnimationFrame(() => document.getElementById(`manager-report-tab-${reportTabs[nextIndex].id}`)?.focus());
  };
  const copy = async () => { if (!report) return; await navigator.clipboard.writeText(reportText(report)); setCopied(true); };
  return <div className="page reports-page"><header className="page-head"><div><p className="eyebrow">Published reporting · {bundle.year.label}</p><h1>Evidence-backed manager reports.</h1><p>Generated in the desktop application and published after review.</p></div></header>
    <section className="card report-workspace" aria-label="Published reports"><div className="report-controls"><div className="report-tabs" role="tablist" aria-label="Report type">{reportTabs.map((item, index) => <button id={`manager-report-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls="published-report-panel" tabIndex={tab === item.id ? 0 : -1} key={item.id} onClick={() => selectTab(item.id)} onKeyDown={(event) => tabKey(event, index)}>{item.label}</button>)}</div><div className="report-toolbar"><div>{tab === "categories" && <label>XD Lens<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{bundle.reports.categories.map((item) => <option value={item.categoryId ?? ""} key={item.id}>{item.title.replace(/ progress report$/i, "")}</option>)}</select></label>}{tab === "goals" && <label>Goal<select value={goalId} onChange={(event) => setGoalId(event.target.value)}>{bundle.reports.goals.map((item) => <option value={item.goalId ?? ""} key={item.id}>{item.title}</option>)}</select></label>}</div><button className="copy-button" type="button" disabled={!report} onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button></div></div>
      <article id="published-report-panel" className="report-scroll" role="tabpanel" aria-labelledby={`manager-report-tab-${tab}`} tabIndex={0}>{report ? <ReportView bundle={bundle} report={report} /> : <div className="empty-state"><strong>No report was published</strong><span>Republish this year from the desktop application.</span></div>}</article><span className="sr-only" aria-live="polite">{copied ? "Report copied to clipboard" : ""}</span>
    </section></div>;
}

function ReportView({ bundle, report }: { bundle: ManagerPublicationBundle; report: PublishedReport }) {
  return <div className="report-document"><h2>{report.title}</h2><p className="report-meta">{report.subtitle} · Published {formatDate(bundle.publishedAt)}</p><p>{report.privacyNote}</p>{report.sections.map((node, index) => <ReportNodeView bundle={bundle} node={node} depth={3} key={`${node.title}:${index}`} />)}</div>;
}

function ReportNodeView({ bundle, node, depth }: { bundle: ManagerPublicationBundle; node: PublishedReportNode; depth: number }) {
  const heading: ReactNode = depth <= 3 ? <h3>{node.title}</h3> : <h4>{node.title}</h4>;
  return <section>{heading}{node.paragraphs.map((item, index) => <p key={index}>{item}</p>)}{node.bullets.length > 0 && <ul>{node.bullets.map((item, index) => <li key={index}>{item}</li>)}</ul>}{node.evidence.map((item) => <EvidenceView bundle={bundle} item={item} key={item.id} />)}{node.children.map((item, index) => <ReportNodeView bundle={bundle} node={item} depth={depth + 1} key={`${item.title}:${index}`} />)}</section>;
}

function EvidenceView({ bundle, item }: { bundle: ManagerPublicationBundle; item: PublishedEvidenceItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const asset = isAllowedAsset(bundle, item.assetPath) ? `./${item.assetPath}` : null;
  return <figure className="report-evidence"><figcaption><strong>{item.title}</strong>{item.metadata && <span>{item.metadata}</span>}</figcaption>{item.note && <blockquote><strong>Note</strong><span>{item.note}</span></blockquote>}{isHttps(item.sourceUrl) && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open source link <span className="sr-only">for {item.title}</span></a>}{item.fileName && !asset && <p className="attachment"><strong>Document or media attachment</strong><span>{item.fileName}</span></p>}{asset && !imageFailed ? <div className="evidence-image"><img src={asset} alt={`Evidence preview: ${item.title}`} onError={() => setImageFailed(true)} /><span>{item.fileName}</span></div> : asset && imageFailed ? <p className="image-fallback">Image preview unavailable. Republish the manager view to restore it.</p> : null}</figure>;
}
