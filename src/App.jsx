import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronUp, ChevronDown, Trophy, Lock, Unlock, Crown, Settings,
  Save, Check, RefreshCw, Medal, Users, ListOrdered, X, EyeOff, Wifi, Trash2,
  GripVertical, HelpCircle, CalendarDays, Clock,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  LOCK_ISO, KNOCKOUT_LOCK_ISO, GROUPS, GROUP_IDS, FLAG, SCORE_MATRIX, GROUP_TOTAL_MAX, POS_META,
  scoreGroup, scoreKnockout, slug, clone, tallyPicks, KNOCKOUT_SCORES, ALL_MATCH_IDS, BRACKET_TREE,
} from "./data.js";
import { api } from "./api.js";

const ME_KEY = "wc26_me";

export default function App() {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState(null);
  const [entries, setEntries] = useState([]);
  const [groups, setGroups] = useState({});
  const [matches, setMatches] = useState([]);
  const [knockout, setKnockout] = useState({ bracket: {}, picksBySlug: {} });
  const [meta, setMeta] = useState({});
  const [me, setMe] = useState(() => { try { return JSON.parse(localStorage.getItem(ME_KEY)); } catch { return null; } });
  const [tab, setTab] = useState("picks");
  const [helpOpen, setHelpOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const locked = now >= new Date(LOCK_ISO).getTime();
  const knockoutLocked = now >= new Date(KNOCKOUT_LOCK_ISO).getTime();

  async function load() {
    try {
      const s = await api.getState();
      setConfig(s.config); setEntries(s.entries || []); setGroups(s.groups || {}); setMatches(s.matches || []);
      setKnockout(s.knockout || { bracket: {}, picksBySlug: {} }); setMeta(s.meta || {});
    } catch (e) { /* keep last state */ }
    setReady(true);
  }
  // Poll /api/state every 5 minutes, and only while the tab is visible.
  // Each call costs ~(3 + N entries) KV reads; with friends leaving tabs open,
  // a 60s poll burns through the daily free-tier KV budget fast. The football-
  // data feed is server-cached for 10 min anyway (functions/_lib/fd.js), so a
  // shorter client poll wouldn't even buy fresher data. Manual refresh always
  // triggers an immediate fetch.
  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  function saveMe(identity) { setMe(identity); try { identity ? localStorage.setItem(ME_KEY, JSON.stringify(identity)) : localStorage.removeItem(ME_KEY); } catch {} }

  if (!ready) return <Shell><Centered><RefreshCw className="spin" size={28} /><div style={{ marginTop: 12, color: "var(--muted)" }}>Loading the pool…</div></Centered><FontAndTheme /></Shell>;
  if (!config) return <Shell><SetupCard onDone={load} /><FontAndTheme /></Shell>;

  return (
    <Shell>
      <Header config={config} locked={locked} knockoutLocked={knockoutLocked} now={now} helpOpen={helpOpen} setHelpOpen={setHelpOpen} />
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      <Tabs tab={tab} setTab={setTab} count={entries.length} hasBracket={Object.keys(knockout.bracket).length > 0} />
      {tab === "picks" && <PicksTab me={me} saveMe={saveMe} entries={entries} locked={locked} knockoutLocked={knockoutLocked} knockout={knockout} reload={load} />}
      {tab === "bracket" && <BracketTab me={me} knockout={knockout} knockoutLocked={knockoutLocked} entries={entries} reload={load} />}
      {tab === "matches" && <MatchesTab matches={matches} meta={meta} />}
      {tab === "standings" && <StandingsTab entries={entries} groups={groups} knockout={knockout} knockoutLocked={knockoutLocked} meta={meta} locked={locked} me={me} />}
      <AdminFooter groups={groups} entries={entries} matches={matches} knockout={knockout} reload={load} />
      <FontAndTheme />
    </Shell>
  );
}

/* ------------------------------- shell / theme ------------------------------- */
function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--body)", padding: "0 0 64px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px" }}>{children}</div>
    </div>
  );
}
function FontAndTheme() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Anton&family=Sora:wght@400;500;600;700;800&display=swap');
      :root{ --bg:#0b1410; --bg2:#0f1c14; --card:#122019; --card2:#16271d; --line:#1f3328;
        --text:#eef5ef; --muted:#8aa097; --gold:#f5c542; --pitch:#1fb574; --green:#2ee6a6; --red:#e63946;
        --display:'Anton',sans-serif; --body:'Sora',system-ui,sans-serif; }
      *{box-sizing:border-box;} body{margin:0;background:var(--bg);}
      .spin{animation:spin 1s linear infinite;} @keyframes spin{to{transform:rotate(360deg);}}
      .rise{animation:rise .5s cubic-bezier(.2,.8,.2,1) both;} @keyframes rise{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
      .pulse{animation:pulse 1.6s ease-in-out infinite;} @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.35;}}
      .btn{cursor:pointer;border:none;font-family:var(--body);font-weight:700;border-radius:12px;transition:transform .08s ease,filter .15s ease;}
      .btn:active{transform:translateY(1px) scale(.99);} .btn:hover{filter:brightness(1.08);}
      input{font-family:var(--body);} ::placeholder{color:#5d6985;}
      .grouprow{transition:background .15s ease;} .grouprow:hover{background:var(--card2);}
    `}</style>
  );
}
function Centered({ children }) { return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", textAlign: "center" }}>{children}</div>; }

/* --------------------------------- header --------------------------------- */
function Header({ config, locked, knockoutLocked, now, helpOpen, setHelpOpen }) {
  const remain = new Date(LOCK_ISO).getTime() - now;
  const d = Math.max(0, Math.floor(remain / 86400000));
  const h = Math.max(0, Math.floor((remain % 86400000) / 3600000));
  const m = Math.max(0, Math.floor((remain % 3600000) / 60000));
  const koRemain = new Date(KNOCKOUT_LOCK_ISO).getTime() - now;
  const kod = Math.max(0, Math.floor(koRemain / 86400000));
  const koh = Math.max(0, Math.floor((koRemain % 86400000) / 3600000));
  const kom = Math.max(0, Math.floor((koRemain % 3600000) / 60000));
  return (
    <div className="rise" style={{ paddingTop: 28, paddingBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--pitch)", fontWeight: 700, letterSpacing: 2, fontSize: 12, textTransform: "uppercase" }}>
        <Trophy size={15} /> World Cup 2026
      </div>
      <h1 style={{ fontFamily: "var(--display)", fontSize: "clamp(34px,8vw,64px)", lineHeight: .95, margin: "6px 0 0", letterSpacing: 1, background: "linear-gradient(110deg,#1fb574 0%,#f5c542 70%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
        {config.poolName || "BRACKET CHALLENGE"}
      </h1>
      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--line)", padding: "8px 14px", borderRadius: 999, fontSize: 14 }}>
          {locked
            ? <><Lock size={15} style={{ color: "var(--gold)" }} /><span style={{ fontWeight: 700 }}>Group picks locked</span></>
            : <><Unlock size={15} style={{ color: "var(--green)" }} /><span style={{ fontWeight: 700 }}>Group picks lock in {d}d {h}h {m}m</span></>}
        </div>
        {locked && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--line)", padding: "8px 14px", borderRadius: 999, fontSize: 14 }}>
            {knockoutLocked
              ? <><Lock size={15} style={{ color: "var(--gold)" }} /><span style={{ fontWeight: 700 }}>Bracket picks locked</span></>
              : <><Unlock size={15} style={{ color: "var(--green)" }} /><span style={{ fontWeight: 700 }}>Bracket picks lock in {kod}d {koh}h {kom}m</span></>}
          </div>
        )}
        <HelpPill open={helpOpen} setOpen={setHelpOpen} />
      </div>
    </div>
  );
}

function HelpPill({ open, setOpen }) {
  return (
    <button className="btn" onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: open ? "var(--card2)" : "var(--card)", border: "1px solid var(--line)", color: "var(--text)", padding: "8px 14px", borderRadius: 999, fontSize: 14 }}>
      <HelpCircle size={15} style={{ color: "var(--pitch)" }} /> {open ? "Hide help" : "How it works"}
    </button>
  );
}

// Inline expandable panel — renders right under the Header as regular page
// content. Earlier modal-based approaches kept hitting mobile viewport/100vh
// bugs that clipped the panel and let the page bleed through. As an inline
// section, there's no positioning math to get wrong: the user just scrolls
// the page normally. Close X collapses; clicking "How it works" again toggles.
function HelpPanel({ onClose }) {
  return (
    <div className="rise" style={{ margin: "12px 0 18px" }}>
      <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 18, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 28, color: "var(--gold)" }}>HOW IT WORKS</div>
          <button className="btn" onClick={onClose} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)", padding: 10 }}><X size={18} /></button>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>How points work</div>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 10px", lineHeight: 1.55 }}>You earn points for each group based on how close your predicted finishing order matches the real result. You also earn knockout points for every match winner you predict correctly.</p>
          <ul style={{ color: "var(--muted)", fontSize: 15, margin: 0, paddingLeft: 22, lineHeight: 1.75 }}>
            <li>Exact slot match → max points: <b style={{ color: "var(--text)" }}>25</b> for 1st, <b style={{ color: "var(--text)" }}>20</b> for 2nd, <b style={{ color: "var(--text)" }}>15</b> for 3rd</li>
            <li>Off by one or two slots → partial credit (5–15 pts)</li>
            <li>Predict ANY team to finish 4th → <b style={{ color: "var(--text)" }}>0 pts</b> no matter what</li>
          </ul>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "10px 0 0", lineHeight: 1.55 }}>Each group is worth up to <b style={{ color: "var(--text)" }}>60 pts</b>, so the group stage alone is worth up to <b style={{ color: "var(--text)" }}>720</b>. Knockout rounds add up to <b style={{ color: "var(--text)" }}>1,600</b> more (R32: 20 · R16: 40 · QF: 80 · SF: 160 · Final: 320). Max combined: <b style={{ color: "var(--text)" }}>2,320 pts</b>.</p>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Example — you picked Brazil 1st</div>
          <ul style={{ color: "var(--muted)", fontSize: 15, margin: 0, paddingLeft: 22, lineHeight: 1.75 }}>
            <li>Brazil finishes 1st → <b style={{ color: "var(--green)" }}>25 pts</b></li>
            <li>Brazil finishes 2nd → <b style={{ color: "var(--text)" }}>15 pts</b> (partial credit, off by one)</li>
            <li>Brazil finishes 3rd → <b style={{ color: "var(--text)" }}>5 pts</b></li>
            <li>Brazil finishes 4th → <b style={{ color: "var(--muted)" }}>0 pts</b></li>
          </ul>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Projected vs. Final points</div>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 8px", lineHeight: 1.55 }}><b style={{ color: "var(--red)" }}>Projected (~12)</b> — the group is still being played. Points update as games happen.</p>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 8px", lineHeight: 1.55 }}><b style={{ color: "var(--green)" }}>Final (+15)</b> — the group has played all 12 of its matches. Points are locked in.</p>
          <p style={{ color: "var(--muted)", fontSize: 14, margin: 0, fontStyle: "italic" }}>Your leaderboard total mixes both.</p>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>Color meanings on the Standings tab</div>
          <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 12px" }}>Tap your own bracket to expand your per-group breakdown.</p>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, fontSize: 15, color: "var(--muted)", lineHeight: 1.55 }}>
              <span style={{ color: "var(--red)", fontWeight: 800, minWidth: 100, flexShrink: 0 }}>Red name</span>
              <span>You picked this team for this slot AND it's currently in that slot, but the group is still live. Earning projected points; can change.</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 15, color: "var(--muted)", lineHeight: 1.55 }}>
              <span style={{ color: "var(--green)", fontWeight: 800, minWidth: 100, flexShrink: 0 }}>Green name ✓</span>
              <span>Same as red, but either the group is officially done OR that team has mathematically clinched the slot — no remaining results can move them out.</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 15, color: "var(--muted)", lineHeight: 1.55 }}>
              <span style={{ color: "var(--text)", fontWeight: 800, minWidth: 100, flexShrink: 0 }}>▲ / ▼</span>
              <span>How that team moved in the real standings since the last matchday — green up, red down. Blank means no change (or no prior matchday to compare).</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 15, color: "var(--muted)", lineHeight: 1.55 }}>
              <span style={{ color: "var(--text)", fontWeight: 800, minWidth: 100, flexShrink: 0 }}>▲N / ▼N / —</span>
              <span>Next to your rank, this shows how many spots you moved in the leaderboard since the last group's matchday finished. A gray "—" means you held your spot (or there isn't enough matchday data yet to compare).</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 15, color: "var(--muted)", lineHeight: 1.55 }}>
              <span style={{ color: "var(--text)", fontWeight: 800, minWidth: 100, flexShrink: 0 }}>White name</span>
              <span>Team isn't in the exact slot you picked. You may STILL be earning partial credit if it's one or two slots off — that just doesn't show as a color.</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 15, color: "var(--muted)", lineHeight: 1.55 }}>
              <span style={{ color: "var(--text)", opacity: .55, fontWeight: 800, minWidth: 100, flexShrink: 0 }}>Dimmed 4th</span>
              <span>4th place is always worth 0 pts, so the row is faded as a reminder.</span>
            </div>
          </div>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Tiebreaker</div>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 8px", lineHeight: 1.55 }}>If two players finish tied on total points, the tiebreaker is <b style={{ color: "var(--text)" }}>knockout points only</b>. Whoever called more knockout matches correctly (with deeper rounds worth more) wins the tiebreak.</p>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: 0, lineHeight: 1.55 }}>This rewards the hardest calls: a correct Final pick (320 pts) outweighs 16 correct R32 picks combined (320 pts too), so depth matters when totals are tied.</p>
        </div>

        <div style={{ background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>TL;DR</div>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: 0, lineHeight: 1.55 }}>Red and green = slot-perfect hits. White can still score partial credit. 4th never scores. Projected can change; Final is locked in.</p>
        </div>
      </div>
    </div>
  );
}

function Tabs({ tab, setTab, count, hasBracket }) {
  const items = [
    { id: "picks", label: "My Picks", icon: ListOrdered },
    ...(hasBracket ? [{ id: "bracket", label: "Bracket", icon: Crown }] : []),
    { id: "matches", label: "Matches", icon: CalendarDays },
    { id: "standings", label: `Standings${count ? " · " + count : ""}`, icon: Trophy },
  ];
  return (
    <div style={{ display: "flex", gap: 8, margin: "22px 0 18px" }}>
      {items.map((it) => {
        const on = tab === it.id;
        return (
          <button key={it.id} className="btn" onClick={() => setTab(it.id)} style={{ flex: 1, padding: "12px 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: on ? "linear-gradient(110deg,#1fb574,#f5c542)" : "var(--card)", color: on ? "#0b1410" : "var(--text)", border: on ? "none" : "1px solid var(--line)", fontSize: 15 }}>
            <it.icon size={17} /> {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------- setup ---------------------------------- */
function SetupCard({ onDone }) {
  const [name, setName] = useState(""); const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  async function create() {
    if (!name.trim() || !pw.trim()) return;
    setBusy(true); setErr(null);
    try { await api.setupPool(name.trim(), pw.trim()); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="rise" style={{ paddingTop: 60 }}>
      <div style={{ fontFamily: "var(--display)", fontSize: 40, background: "linear-gradient(110deg,#1fb574,#f5c542)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>SET UP YOUR POOL</div>
      <p style={{ color: "var(--muted)", marginTop: 4 }}>One-time setup. Whoever does this is the admin.</p>
      <Card>
        <Label>Pool name</Label>
        <TextInput value={name} onChange={setName} placeholder="The Group Chat Cup" />
        <Label style={{ marginTop: 14 }}>Admin password</Label>
        <TextInput value={pw} onChange={setPw} placeholder="for overriding results" type="password" />
        {err && <Note bad>{err}</Note>}
        <button className="btn" disabled={busy} onClick={create} style={{ marginTop: 18, width: "100%", padding: 14, background: "linear-gradient(110deg,#1fb574,#f5c542)", color: "#0b1410", fontSize: 16 }}>{busy ? "Creating…" : "Create pool"}</button>
      </Card>
    </div>
  );
}

/* -------------------------------- picks ---------------------------------- */
function PicksTab({ me, saveMe, entries, locked, knockoutLocked, knockout, reload }) {
  const [name, setName] = useState(me?.name || "");
  const [pin, setPin] = useState(me?.pin || "");
  const [preds, setPreds] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const initFor = useRef(null);

  const myEntry = useMemo(() => entries.find((e) => slug(e.name) === slug(me?.name || "")), [entries, me]);
  const tally = useMemo(() => tallyPicks(entries), [entries]);
  function freshPreds() { const p = {}; GROUP_IDS.forEach((g) => (p[g] = [...GROUPS[g]])); return p; }

  useEffect(() => {
    if (!me) { setPreds(null); initFor.current = null; return; }
    if (initFor.current !== slug(me.name)) { setPreds(myEntry?.predictions ? clone(myEntry.predictions) : freshPreds()); initFor.current = slug(me.name); }
  }, [me, myEntry]);

  function enter() {
    if (!name.trim() || !pin.trim()) { setStatus({ bad: true, msg: "Enter a name and a PIN." }); return; }
    const existing = entries.find((e) => slug(e.name) === slug(name));
    if (existing) { /* server will verify pin on save */ }
    saveMe({ name: name.trim(), pin: pin.trim() }); setStatus(null);
  }
  function reorder(g, newOrder) {
    if (locked) return;
    setPreds((prev) => ({ ...prev, [g]: newOrder }));
  }
  async function save() {
    setBusy(true); setStatus(null);
    try { await api.submitEntry(me.name, me.pin, preds); setStatus({ msg: "Saved! Your picks are in." }); reload(); }
    catch (e) { setStatus({ bad: true, msg: e.message }); }
    setBusy(false);
  }

  if (!me) {
    return (
      <div className="rise">
        <Card>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Join the pool</div>
          <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 14 }}>Pick a name and a PIN. The PIN lets only you edit your bracket.</p>
          <Label>Your name</Label>
          <TextInput value={name} onChange={setName} placeholder="Daniel" />
          <Label style={{ marginTop: 14 }}>PIN</Label>
          <TextInput value={pin} onChange={setPin} placeholder="4 digits is plenty" type="password" />
          {status && <Note bad={status.bad}>{status.msg}</Note>}
          <button className="btn" onClick={enter} style={{ marginTop: 16, width: "100%", padding: 13, background: "linear-gradient(110deg,#1fb574,#f5c542)", color: "#0b1410", fontSize: 15 }}>Start my bracket</button>
        </Card>
        <ScoringKey />
      </div>
    );
  }
  if (!preds) return null;

  return (
    <div className="rise">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Users size={16} style={{ color: "var(--pitch)" }} /><span style={{ fontWeight: 700 }}>Playing as {me.name}</span></div>
        <button className="btn" onClick={() => saveMe(null)} style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--line)", padding: "6px 12px", fontSize: 13 }}>Switch</button>
      </div>
      {locked
        ? <Banner icon={Lock}>Picks are locked — this is your final bracket.</Banner>
        : <Banner icon={ListOrdered}>Drag teams to reorder each group 1→4, then save. Editable until June 11 kickoff.</Banner>}
      {GROUP_IDS.map((g, gi) => (
        <div key={g} className="rise" style={{ animationDelay: `${gi * 25}ms` }}>
          <GroupCard g={g} order={preds[g]} onReorder={reorder} locked={locked} />
          {locked && myEntry && <ContrarianStrip pred={preds[g]} tally={tally[g]} total={tally.total} />}
        </div>
      ))}
      {status && <Note bad={status.bad}>{status.msg}</Note>}
      {!locked && (
        <button className="btn" disabled={busy} onClick={save} style={{ marginTop: 16, width: "100%", padding: 15, background: "linear-gradient(110deg,#1fb574,#f5c542)", color: "#0b1410", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {busy ? <><RefreshCw size={17} className="spin" /> Saving…</> : <><Save size={17} /> Save my bracket</>}
        </button>
      )}
      <ScoringKey />
    </div>
  );
}

function GroupCard({ g, order, onReorder, locked }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id);
    const newIndex = order.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(g, arrayMove(order, oldIndex, newIndex));
  }
  return (
    <Card style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "var(--card2)" }}>
        <div style={{ fontFamily: "var(--display)", fontSize: 22, color: "var(--gold)", lineHeight: 1 }}>GROUP {g}</div>
      </div>
      {locked ? (
        <div>
          {order.map((team, idx) => <StaticRow key={team} team={team} idx={idx} last={idx === 3} />)}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div>
              {order.map((team, idx) => <SortableRow key={team} team={team} idx={idx} last={idx === 3} />)}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </Card>
  );
}
function ContrarianStrip({ pred, tally, total }) {
  if (!pred || !total) return null;
  const labels = ["1st", "2nd", "3rd"];
  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 14px 10px", marginTop: -4, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>
        <Users size={11} /> Pool agreement
      </div>
      {labels.map((label, i) => {
        const team = pred[i];
        const count = tally?.[i]?.[team] || 0;
        const share = total > 0 ? count / total : 0;
        const contrarian = total >= 4 && share <= 0.25;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "2px 0" }}>
            <span style={{ color: "var(--muted)", width: 26, fontWeight: 700, fontSize: 11 }}>{label}</span>
            <span style={{ fontSize: 14 }}>{FLAG[team] || ""}</span>
            <span style={{ flex: 1, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team}</span>
            {contrarian && <span style={{ background: "var(--gold)", color: "#0b1410", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>CONTRARIAN</span>}
            <span style={{ color: "var(--muted)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{count} of {total}</span>
          </div>
        );
      })}
    </div>
  );
}

function StaticRow({ team, idx, last }) {
  return (
    <div className="grouprow" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <PosBadge idx={idx} />
      <span style={{ fontSize: 20 }}>{FLAG[team] || "🏳️"}</span>
      <span style={{ fontWeight: 600, flex: 1, opacity: idx === 3 ? .6 : 1 }}>{team}</span>
    </div>
  );
}
function SortableRow({ team, idx, last }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: team });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? .6 : 1,
    display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
    borderBottom: last ? "none" : "1px solid var(--line)",
    background: isDragging ? "var(--card2)" : undefined,
    cursor: "grab", touchAction: "none",
  };
  return (
    <div ref={setNodeRef} className="grouprow" style={style} {...attributes} {...listeners}>
      <PosBadge idx={idx} />
      <span style={{ fontSize: 20 }}>{FLAG[team] || "🏳️"}</span>
      <span style={{ fontWeight: 600, flex: 1, opacity: idx === 3 ? .6 : 1 }}>{team}</span>
      <GripVertical size={16} style={{ color: "var(--muted)" }} />
    </div>
  );
}
function PosBadge({ idx, small }) {
  const mm = POS_META[idx]; const s = small ? 22 : 28;
  return <div style={{ width: s, height: s, minWidth: s, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: small ? 10 : 12, color: idx === 3 ? "var(--muted)" : "#0b1410", background: idx === 3 ? "transparent" : mm.color, border: idx === 3 ? "1px solid var(--line)" : "none" }}>{mm.label}</div>;
}

/* -------------------------------- bracket -------------------------------- */

// Round display order left→right: R32 left half, R16 left, QF left, SF left,
// FINAL center, SF right, QF right, R16 right, R32 right.
// Left half: R32_1-8, R16_1-4, QF_1-2, SF_1
// Right half: SF_2, QF_3-4, R16_5-8, R32_9-16 (rendered right→left so they converge)
const LEFT_ROUNDS = [
  { round: "R32", ids: ["R32_1","R32_2","R32_3","R32_4","R32_5","R32_6","R32_7","R32_8"] },
  { round: "R16", ids: ["R16_1","R16_2","R16_3","R16_4"] },
  { round: "QF",  ids: ["QF_1","QF_2"] },
  { round: "SF",  ids: ["SF_1"] },
];
const RIGHT_ROUNDS = [
  { round: "SF",  ids: ["SF_2"] },
  { round: "QF",  ids: ["QF_3","QF_4"] },
  { round: "R16", ids: ["R16_5","R16_6","R16_7","R16_8"] },
  { round: "R32", ids: ["R32_9","R32_10","R32_11","R32_12","R32_13","R32_14","R32_15","R32_16"] },
];
const ROUND_LABELS = { R32: "ROUND OF 32", R16: "ROUND OF 16", QF: "QUARTERS", SF: "SEMIS", FINAL: "FINAL" };

function BracketTab({ me, knockout, knockoutLocked, entries, reload }) {
  const { bracket, picksBySlug } = knockout;
  const hasBracket = Object.keys(bracket).some((k) => bracket[k]?.home || bracket[k]?.away);

  // Which player's bracket are we viewing? Default = me (by slug), or first entry.
  const mySlug = me ? slug(me.name) : null;
  const allSlugs = entries.map((e) => slug(e.name));
  const [viewingSlug, setViewingSlug] = useState(mySlug || allSlugs[0] || null);
  // Sync viewing slug when me changes
  useEffect(() => { if (mySlug && !knockoutLocked) setViewingSlug(mySlug); }, [mySlug, knockoutLocked]);

  // My own picks for editing (before lock).
  const [myPicks, setMyPicks] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    if (!mySlug) return;
    setMyPicks(picksBySlug[mySlug] ? { ...picksBySlug[mySlug] } : {});
  }, [mySlug, picksBySlug]);

  function pickWinner(matchId, team) {
    if (knockoutLocked || !mySlug) return;
    setMyPicks((prev) => {
      const next = { ...prev, [matchId]: team };
      // When a pick changes, clear any downstream picks that relied on the old winner.
      clearDownstream(next, matchId, prev[matchId]);
      return next;
    });
    setSaveStatus(null);
  }

  async function savePicks() {
    if (!me) return;
    setSaving(true); setSaveStatus(null);
    try {
      await api.submitKnockout(me.name, me.pin, myPicks);
      setSaveStatus({ ok: true, msg: "Bracket saved!" });
      reload();
    } catch (e) { setSaveStatus({ ok: false, msg: e.message }); }
    setSaving(false);
  }

  if (!hasBracket) {
    return <div className="rise"><Empty icon={Crown} title="Bracket not set up yet" sub="The admin will enter the R32 matchups — check back soon." /></div>;
  }

  // Picks to display: if before lock always show my own editable picks; after lock show selected player.
  const displaySlug = knockoutLocked ? viewingSlug : mySlug;
  const displayPicks = (knockoutLocked ? picksBySlug[displaySlug] : myPicks) || {};

  return (
    <div className="rise">
      {/* Player selector — only after lock */}
      {knockoutLocked && entries.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {entries.map((e) => {
            const s = slug(e.name);
            const on = s === viewingSlug;
            const isMe = s === mySlug;
            return (
              <button key={s} className="btn" onClick={() => setViewingSlug(s)} style={{ padding: "7px 14px", fontSize: 13, background: on ? "linear-gradient(110deg,#1fb574,#f5c542)" : "var(--card)", color: on ? "#0b1410" : "var(--text)", border: on ? "none" : "1px solid var(--line)", borderRadius: 999 }}>
                {e.name}{isMe ? " · you" : ""}
              </button>
            );
          })}
        </div>
      )}

      {!knockoutLocked && me && (
        <Banner icon={Crown}>
          Pick the winner of each match — click a team name to advance them. Locks at the first R32 kickoff.
        </Banner>
      )}
      {!knockoutLocked && !me && (
        <Banner icon={EyeOff}>Go to My Picks to join the pool, then come back to fill out your bracket.</Banner>
      )}
      {knockoutLocked && (
        <Banner icon={Lock}>Bracket picks are locked. Viewing {viewingSlug === mySlug ? "your" : entries.find((e) => slug(e.name) === viewingSlug)?.name + "'s"} bracket.</Banner>
      )}

      {/* The bracket tree */}
      <div style={{ overflowX: "auto", paddingBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: 900 }}>
          {/* Left half */}
          {LEFT_ROUNDS.map(({ round, ids }) => (
            <BracketColumn key={"L-" + round + ids[0]} round={round} ids={ids} bracket={bracket} picks={displayPicks} onPick={knockoutLocked ? null : pickWinner} />
          ))}
          {/* Final */}
          <BracketColumn key="FINAL" round="FINAL" ids={["FINAL"]} bracket={bracket} picks={displayPicks} onPick={knockoutLocked ? null : pickWinner} isCenter />
          {/* Right half */}
          {RIGHT_ROUNDS.map(({ round, ids }) => (
            <BracketColumn key={"R-" + round + ids[0]} round={round} ids={ids} bracket={bracket} picks={displayPicks} onPick={knockoutLocked ? null : pickWinner} />
          ))}
        </div>
      </div>

      {!knockoutLocked && mySlug && (
        <div style={{ marginTop: 16 }}>
          {saveStatus && <Note bad={!saveStatus.ok}>{saveStatus.msg}</Note>}
          <button className="btn" disabled={saving} onClick={savePicks} style={{ marginTop: 12, width: "100%", padding: 15, background: "linear-gradient(110deg,#1fb574,#f5c542)", color: "#0b1410", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {saving ? <><RefreshCw size={17} className="spin" /> Saving…</> : <><Save size={17} /> Save my bracket</>}
          </button>
        </div>
      )}
    </div>
  );
}

// Clear picks for matches that depended on `oldWinner` being the winner of `changedId`.
function clearDownstream(picks, changedId, oldWinner) {
  if (!oldWinner) return;
  for (const [id, feeders] of Object.entries(BRACKET_TREE)) {
    if (!feeders.includes(changedId)) continue;
    if (picks[id] === oldWinner) {
      const prev = picks[id];
      delete picks[id];
      clearDownstream(picks, id, prev);
    }
  }
}

function BracketColumn({ round, ids, bracket, picks, onPick, isCenter }) {
  const cellHeight = 72; // px per match cell
  const roundCount = ids.length;
  // Vertical spacing: cells are evenly spaced within the column.
  // R32 has 8 cells on left/right; each subsequent round halves → natural bracket spacing.
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: isCenter ? 160 : 150, flex: isCenter ? "0 0 160px" : "0 0 150px" }}>
      <div style={{ fontFamily: "var(--display)", fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", textAlign: "center", padding: "4px 6px 8px", whiteSpace: "nowrap" }}>
        {ROUND_LABELS[round]}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1 }}>
        {ids.map((id, idx) => {
          // Vertical centering within the bracket column.
          // Groups of 2 R32 matches feed into 1 R16, so each later round's cell
          // spans 2× the space. We achieve this with a growing margin-top.
          const spacer = roundCount < 8 ? Math.floor((8 / roundCount - 1) * cellHeight / 2) : 0;
          return (
            <div key={id} style={{ marginTop: idx === 0 ? spacer : spacer * 2 }}>
              <BracketMatchCell id={id} round={round} bracket={bracket} picks={picks} onPick={onPick} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketMatchCell({ id, round, bracket, picks, onPick }) {
  const match = bracket[id] || {};
  // Derive home/away team for R16+ from the bracket tree + winners of feeder matches.
  let home = match.home || null;
  let away = match.away || null;
  if (BRACKET_TREE[id]) {
    const [feedA, feedB] = BRACKET_TREE[id];
    home = bracket[feedA]?.winner || picks[feedA] || null;
    away = bracket[feedB]?.winner || picks[feedB] || null;
  }

  const winner = match.winner || null;  // actual confirmed winner
  const myPick = picks[id] || null;
  const isFinal = match.status === "final";
  const isLive = match.status === "live";

  function TeamRow({ team, side }) {
    if (!team) return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: side === "home" ? "1px solid var(--line)" : "none", opacity: .4 }}>
        <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>TBD</span>
      </div>
    );
    const isWinner = winner && winner === team;
    const isEliminated = winner && winner !== team;
    const isMyPick = myPick === team;
    const pickCorrect = isFinal && isMyPick && isWinner;
    const pickWrong = isFinal && isMyPick && isEliminated;
    const canPick = !!onPick && !winner; // can only pick live/unplayed matches
    return (
      <div
        onClick={() => canPick && onPick(id, team)}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 10px",
          borderBottom: side === "home" ? "1px solid var(--line)" : "none",
          cursor: canPick ? "pointer" : "default",
          background: isMyPick && !isFinal ? "rgba(31,181,116,.12)" : "transparent",
          opacity: isEliminated ? .45 : 1,
          borderRadius: side === "home" ? "8px 8px 0 0" : "0 0 8px 8px",
          transition: "background .1s ease",
        }}
        className={canPick ? "grouprow" : ""}
      >
        <span style={{ fontSize: 15 }}>{FLAG[team] || "🏳️"}</span>
        <span style={{ fontSize: 12, fontWeight: isWinner ? 800 : 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: pickCorrect ? "var(--green)" : pickWrong ? "var(--red)" : isWinner ? "var(--gold)" : "var(--text)" }}>
          {team}
        </span>
        {pickCorrect && <Check size={11} style={{ color: "var(--green)", flexShrink: 0 }} />}
        {pickWrong && <X size={11} style={{ color: "var(--red)", flexShrink: 0 }} />}
        {isMyPick && !isFinal && <span style={{ fontSize: 9, color: "var(--pitch)", fontWeight: 800, flexShrink: 0 }}>✓</span>}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", border: `1px solid ${isLive ? "rgba(230,57,70,.4)" : "var(--line)"}`, borderRadius: 8, margin: "2px 4px", overflow: "hidden" }}>
      <TeamRow team={home} side="home" />
      <TeamRow team={away} side="away" />
      {isLive && <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, color: "var(--red)", textAlign: "center", padding: "2px 0" }}>LIVE</div>}
    </div>
  );
}

/* ------------------------------ standings -------------------------------- */
/* -------------------------------- matches -------------------------------- */
function MatchesTab({ matches, meta }) {
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const grouped = useMemo(() => {
    const byDate = new Map();
    for (const m of matches) {
      if (!m.utcDate) continue;
      const key = new Date(m.utcDate).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(m);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, list]) => ({
        key,
        label: new Date(list[0].utcDate).toLocaleDateString("en-US", {
          timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric",
        }),
        matches: list,
      }));
  }, [matches]);

  if (matches.length === 0) {
    return <div className="rise"><Empty icon={CalendarDays} title="No fixtures yet" sub="The schedule will appear once football-data publishes it." /></div>;
  }

  return (
    <div className="rise">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, fontSize: 13, color: "var(--muted)", flexWrap: "wrap" }}>
        <span>{matches.length} matches · times shown in EST</span>
        {meta?.stale && <span style={{ color: "#caa14a", display: "inline-flex", alignItems: "center", gap: 5 }}><Wifi size={13} /> showing last synced data</span>}
      </div>
      {grouped.map((day) => {
        const isToday = day.key === todayKey;
        return (
          <div key={day.key} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontFamily: "var(--display)", fontSize: 18, color: isToday ? "var(--pitch)" : "var(--text)", letterSpacing: 1 }}>
              {day.label}
              {isToday && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "var(--pitch)", color: "#0b1410", fontWeight: 800, letterSpacing: 1 }}>TODAY</span>}
            </div>
            {day.matches.map((m, i) => <MatchRow key={m.id ?? `${day.key}-${i}`} match={m} />)}
          </div>
        );
      })}
    </div>
  );
}

function MatchRow({ match }) {
  const finished = match.status === "FINISHED";
  // Guard: feed sometimes flips status to FINISHED before populating scores.
  // Without this we'd render "null–null" — show a dash instead and never bold a "winner".
  const hasScore = finished && match.homeScore != null && match.awayScore != null;
  const time = match.utcDate ? new Date(match.utcDate).toLocaleString("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit",
  }) : "";
  const stageLabel = match.group ? `GRP ${match.group}` : stageName(match.stage);
  const homeWin = hasScore && match.homeScore > match.awayScore;
  const awayWin = hasScore && match.awayScore > match.homeScore;
  const dim = (won) => finished && !won ? "var(--muted)" : "var(--text)";
  const weight = (won) => (won ? 700 : 400);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, marginTop: 6, fontSize: 13 }}>
      <div style={{ minWidth: 52, fontFamily: "var(--display)", fontSize: 13, color: "var(--gold)", letterSpacing: 1 }}>{stageLabel}</div>
      <div style={{ minWidth: 70, fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
        {finished ? <span style={{ fontWeight: 800, color: "var(--green)" }}>FT</span> : <><Clock size={11} />{time}</>}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", minWidth: 0 }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: dim(homeWin), fontWeight: weight(homeWin) }}>{match.home}</span>
        <span>{FLAG[match.home]}</span>
      </div>
      <div style={{ fontFamily: "var(--display)", fontSize: 16, minWidth: 52, textAlign: "center", color: hasScore ? "var(--text)" : "var(--muted)" }}>
        {hasScore ? `${match.homeScore}–${match.awayScore}` : finished ? "—" : "vs"}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span>{FLAG[match.away]}</span>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: dim(awayWin), fontWeight: weight(awayWin) }}>{match.away}</span>
      </div>
    </div>
  );
}

function stageName(stage) {
  switch (stage) {
    case "GROUP_STAGE": return "GRP";
    case "LAST_32": case "ROUND_OF_32": return "R32";
    case "LAST_16": case "ROUND_OF_16": return "R16";
    case "QUARTER_FINALS": case "QUARTER_FINAL": return "QF";
    case "SEMI_FINALS": case "SEMI_FINAL": return "SF";
    case "THIRD_PLACE": return "3RD";
    case "FINAL": return "FINAL";
    default: return stage || "—";
  }
}

function StandingsTab({ entries, groups, knockout, knockoutLocked, meta, locked, me }) {
  // Multi-open: each row toggles independently so players can be compared side-by-side.
  const [open, setOpen] = useState(() => new Set());
  function toggle(name) {
    setOpen((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  }
  const tally = useMemo(() => tallyPicks(entries), [entries]);
  const counted = GROUP_IDS.map((g) => groups[g]).filter(Boolean);
  const liveCount = counted.filter((r) => r.status === "live").length;
  const finalCount = counted.filter((r) => r.status === "final").length;
  const pendingCount = counted.filter((r) => r.status === "pending").length;
  const anyLive = liveCount > 0;
  const anyResults = liveCount + finalCount > 0;
  const allPending = pendingCount > 0 && !anyResults;

  const { bracket: koBracket, picksBySlug: koPicks } = knockout || {};
  const rows = useMemo(() => entries.map((e) => {
    let groupPts = 0;
    GROUP_IDS.forEach((g) => {
      const r = groups[g];
      if (r && r.status !== "pending") groupPts += scoreGroup(e.predictions?.[g], r.order);
    });
    const myKoPicks = koPicks?.[slug(e.name)] || {};
    const koPts = scoreKnockout(myKoPicks, koBracket || {});
    return { ...e, total: groupPts + koPts, groupPts, koPts };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)), [entries, groups, koBracket, koPicks]);

  if (entries.length === 0) return <div className="rise"><Empty icon={Users} title="No entries yet" sub="Be the first — head to My Picks and fill out your bracket." /></div>;

  return (
    <div className="rise">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, fontSize: 13, color: "var(--muted)", flexWrap: "wrap" }}>
        {anyLive && <span className="pulse" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--red)", fontWeight: 800, letterSpacing: 1 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--red)" }} />LIVE</span>}
        {anyResults
          ? <span>{finalCount} final · {liveCount} projected{pendingCount ? ` · ${pendingCount} pending` : ""} · {12 - counted.length} to come</span>
          : <span>{locked ? "Tournament underway — standings update automatically." : "Standings light up once games start."}</span>}
        {meta?.stale && <span style={{ color: "#caa14a", display: "inline-flex", alignItems: "center", gap: 5 }}><Wifi size={13} /> showing last synced data</span>}
      </div>
      {allPending && <Banner icon={Trophy}>Tournament hasn't started yet — projections will start once games kick off on June 11.</Banner>}
      {anyLive && <Banner icon={RefreshCw}>Projected points assume each live group finishes in its current order — they shuffle as results change and lock when a group goes final.</Banner>}
      {rows.map((r, i) => {
        const isMe = slug(r.name) === slug(me?.name || ""); const medal = i < 3 && anyResults;
        return (
          <div key={r.name} style={{ marginBottom: 10 }}>
            <Card style={{ padding: 0, border: isMe ? "1px solid var(--pitch)" : "1px solid var(--line)" }}>
              <button className="btn" onClick={() => toggle(r.name)} style={{ width: "100%", background: "transparent", color: "var(--text)", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", textAlign: "left" }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 22, width: 30, color: medal ? POS_META[i].color : "var(--muted)" }}>{medal ? <Medal size={22} style={{ color: POS_META[i].color }} /> : i + 1}</div>
                <PlayerMovementChip delta={meta?.playerMovement?.[r.name]} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{r.name} {isMe && <span style={{ color: "var(--pitch)", fontSize: 12, fontWeight: 700 }}>· you</span>}</div>
                  {!anyResults && <div style={{ color: "var(--muted)", fontSize: 12 }}>bracket submitted</div>}
                </div>
                {anyResults && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--display)", fontSize: 26, color: "var(--gold)", lineHeight: 1 }}>{r.total}</div>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>
                      {r.koPts > 0 ? "incl. knockout" : anyLive ? "projected" : `/ ${GROUP_TOTAL_MAX} pts`}
                    </div>
                  </div>
                )}
              </button>
              {open.has(r.name) && <div style={{ borderTop: "1px solid var(--line)", padding: "10px 16px 14px" }}><PlayerBreakdown entry={r} groups={groups} locked={locked} isMe={isMe} tally={tally} knockout={knockout} knockoutLocked={knockoutLocked} /></div>}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// Small ▲N / ▼N / — chip rendered next to the rank number in StandingsTab.
// `delta` is meta.playerMovement[name]: positive = moved up, negative = down,
// 0 = held position, undefined = no movement data yet (new entry, or <2 snapshots).
// Last two render as a muted "—" so every row always shows a tracker slot.
function PlayerMovementChip({ delta }) {
  if (!Number.isFinite(delta) || delta === 0) {
    return (
      <span style={{ width: 26, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "flex-start", fontSize: 14, fontWeight: 800, color: "var(--muted)" }}>
        —
      </span>
    );
  }
  const up = delta > 0;
  const Icon = up ? ChevronUp : ChevronDown;
  return (
    <span style={{ width: 26, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "flex-start", gap: 1, fontSize: 12, fontWeight: 800, color: up ? "var(--green)" : "var(--red)" }}>
      <Icon size={13} /> {Math.abs(delta)}
    </span>
  );
}

function PlayerBreakdown({ entry, groups, locked, isMe, tally, knockout, knockoutLocked }) {
  if (!(locked || isMe)) return <div style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><EyeOff size={15} /> Picks hidden until lock (June 11).</div>;
  const entrySlug = slug(entry.name);
  const koPicks = knockout?.picksBySlug?.[entrySlug] || {};
  const koBracket = knockout?.bracket || {};
  const hasKoPicks = Object.keys(koPicks).length > 0;
  const showKo = knockoutLocked || isMe;
  const koRounds = [
    { key: "R32", label: "R32 (×16)" }, { key: "R16", label: "R16 (×8)" },
    { key: "QF", label: "QF (×4)" }, { key: "SF", label: "SF (×2)" }, { key: "FINAL", label: "Final (×1)" },
  ];

  return (
    <div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
      {GROUP_IDS.map((g) => {
        const pred = entry.predictions?.[g] || []; const r = groups[g];
        const isLive = r?.status === "live"; const isFinal = r?.status === "final"; const isPending = r?.status === "pending";
        const pts = r && !isPending ? scoreGroup(pred, r.order) : null;
        const top1 = pickConsensus(tally?.[g]?.[0]);
        return (
          <div key={g} style={{ background: "var(--bg2)", border: `1px solid ${isLive ? "rgba(230,57,70,.35)" : "var(--line)"}`, borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--display)", fontSize: 14, color: "var(--gold)" }}>GRP {g}</span>
              {pts !== null ? <span style={{ fontWeight: 800, fontSize: 13, color: isLive ? "var(--red)" : "var(--green)" }}>{isLive ? "~" : "+"}{pts}</span> : <span style={{ fontSize: 10, color: "#46506b" }}>—</span>}
            </div>
            {pred.map((t, i) => {
              const teamAtSlot = r?.order?.[i];
              const clinchedHere = r?.clinched?.[teamAtSlot] === i + 1;
              const correct = (isFinal || clinchedHere) && teamAtSlot === t;
              const liveMatch = isLive && !clinchedHere && teamAtSlot === t;
              const move = r?.movement?.[t]; // up | down | null — on the predicted team's real movement
              return (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, opacity: i === 3 ? .55 : 1, marginBottom: 2 }}>
                  <span style={{ color: "var(--muted)", width: 10 }}>{i + 1}</span><span>{FLAG[t]}</span>
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: correct ? "var(--green)" : liveMatch ? "var(--red)" : "var(--text)" }}>{t}</span>
                  {move === "up" && <ChevronUp size={12} style={{ color: "var(--green)" }} />}
                  {move === "down" && <ChevronDown size={12} style={{ color: "var(--red)" }} />}
                  {correct && <Check size={12} style={{ color: "var(--green)" }} />}
                </div>
              );
            })}
            {isLive && <div style={{ marginTop: 4, fontSize: 9, letterSpacing: 1, fontWeight: 800, color: "var(--red)" }}>PROJECTED</div>}
            {isPending && <div style={{ marginTop: 4, fontSize: 9, letterSpacing: 1, fontWeight: 800, color: "var(--muted)" }}>PENDING</div>}
            {top1 && tally?.total > 0 && (
              <div style={{ marginTop: 6, paddingTop: 5, borderTop: "1px dashed var(--line)" }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: "var(--muted)" }}>POOL 1ST</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, marginTop: 2 }}>
                  <span>{FLAG[top1.team]}</span>
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--text)" }}>{top1.team}</span>
                  <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{top1.count}/{tally.total}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>

    {/* Knockout summary card */}
    {showKo && Object.keys(koBracket).length > 0 && (
      <div style={{ marginTop: 8, background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: "var(--display)", fontSize: 13, color: "var(--gold)" }}>KNOCKOUT</span>
          {hasKoPicks
            ? <span style={{ fontWeight: 800, fontSize: 13, color: "var(--green)" }}>+{scoreKnockout(koPicks, koBracket)}</span>
            : <span style={{ fontSize: 11, color: "var(--muted)" }}>no picks</span>}
        </div>
        {hasKoPicks && koRounds.map(({ key, label }) => {
          const roundIds = ALL_MATCH_IDS.filter((id) => (id === "FINAL" ? key === "FINAL" : id.startsWith(key + "_")));
          const correct = roundIds.filter((id) => koPicks[id] && koBracket[id]?.winner && koPicks[id] === koBracket[id].winner).length;
          const total = roundIds.filter((id) => koBracket[id]?.winner).length;
          if (total === 0) return null;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "2px 0", color: "var(--muted)" }}>
              <span style={{ minWidth: 90 }}>{label}</span>
              <span style={{ color: "var(--text)" }}>{correct}/{total} correct</span>
              <span style={{ marginLeft: "auto", color: "var(--green)", fontWeight: 700 }}>+{correct * KNOCKOUT_SCORES[key]}</span>
            </div>
          );
        })}
        {!hasKoPicks && <div style={{ fontSize: 11, color: "var(--muted)" }}>Bracket picks not submitted.</div>}
      </div>
    )}
    </div>
  );
}

function pickConsensus(slotMap) {
  if (!slotMap) return null;
  let bestTeam = null, bestCount = 0;
  for (const team of Object.keys(slotMap)) {
    const c = slotMap[team];
    if (c > bestCount || (c === bestCount && bestTeam !== null && team < bestTeam)) {
      bestTeam = team; bestCount = c;
    }
  }
  return bestTeam ? { team: bestTeam, count: bestCount } : null;
}

/* --------------------------------- admin --------------------------------- */
function AdminFooter({ groups, entries, matches, knockout, reload }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <button className="btn" onClick={() => setShow(true)} style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--muted)", padding: "8px 14px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 7 }}><Settings size={14} /> Admin · override results</button>
        <div style={{ color: "#46506b", fontSize: 11, marginTop: 14 }}>World Cup 2026 · live scores auto-update</div>
      </div>
      {show && <AdminModal groups={groups} entries={entries} matches={matches} knockout={knockout} reload={reload} onClose={() => setShow(false)} />}
    </>
  );
}

function AdminModal({ groups, entries, matches, knockout, reload, onClose }) {
  const [pw, setPw] = useState(""); const [authed, setAuthed] = useState(false); const [err, setErr] = useState(null);
  const [draft, setDraft] = useState(() => { const d = {}; GROUP_IDS.forEach((g) => (d[g] = groups[g]?.order ? [...groups[g].order] : [...GROUPS[g]])); return d; });
  // mode per group: "auto" (follow API), "live" (manual), "final" (manual)
  const [mode, setMode] = useState(() => { const m = {}; GROUP_IDS.forEach((g) => (m[g] = groups[g]?.source === "admin" ? groups[g].status : "auto")); return m; });
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  async function login() { setErr(null); try { await api.adminVerify(pw.trim()); setAuthed(true); } catch (e) { setErr(e.message); } }
  async function deleteEntry(name) {
    if (!window.confirm(`Delete bracket for "${name}"? This cannot be undone.`)) return;
    setDeleting(name); setMsg(null);
    try { await api.adminDeleteEntry(pw.trim(), name); setMsg(`Deleted "${name}".`); reload(); }
    catch (e) { setMsg("ERR: " + e.message); }
    setDeleting(null);
  }
  function move(g, i, dir) { setDraft((p) => { const a = [...p[g]]; const j = i + dir; if (j < 0 || j > 3) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, [g]: a }; }); }
  async function save() {
    setBusy(true); setMsg(null);
    const payload = {};
    GROUP_IDS.forEach((g) => { payload[g] = mode[g] === "auto" ? null : { order: draft[g], status: mode[g] }; });
    try { await api.adminSave(pw.trim(), payload); setMsg("Saved — overrides applied."); reload(); }
    catch (e) { setMsg("ERR: " + e.message); }
    setBusy(false);
  }
  const MODES = [{ k: "auto", label: "Auto" }, { k: "live", label: "Live" }, { k: "final", label: "Final" }];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,14,.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="rise" style={{ maxWidth: 640, width: "100%", margin: "40px 0", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 18, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 26, color: "var(--gold)" }}>ADMIN</div>
          <button className="btn" onClick={onClose} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)", padding: 8 }}><X size={16} /></button>
        </div>
        {!authed ? (
          <div>
            <Label>Admin password</Label>
            <TextInput value={pw} onChange={(v) => { setPw(v); setErr(null); }} type="password" placeholder="password" />
            {err && <Note bad>{err}</Note>}
            <button className="btn" onClick={login} style={{ marginTop: 14, width: "100%", padding: 12, background: "linear-gradient(110deg,#1fb574,#f5c542)", color: "#0b1410" }}>Unlock</button>
          </div>
        ) : (
          <div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 18, color: "var(--gold)", marginBottom: 8 }}>ENTRIES</div>
              {(!entries || entries.length === 0) ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>No entries yet.</div>
              ) : (
                entries.map((e) => (
                  <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{e.name}</span>
                    <button className="btn" disabled={deleting === e.name} onClick={() => deleteEntry(e.name)} style={{ background: "transparent", border: "1px solid rgba(230,57,70,.35)", color: "var(--red)", padding: "5px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5, opacity: deleting === e.name ? .5 : 1 }}>
                      {deleting === e.name ? <RefreshCw size={12} className="spin" /> : <Trash2 size={12} />} Delete
                    </button>
                  </div>
                ))
              )}
            </div>
            <MatchScoresCard pw={pw} matches={matches} reload={reload} setMsg={setMsg} />
            <BracketSetupCard pw={pw} knockout={knockout} reload={reload} setMsg={setMsg} />
            <KnockoutResultsCard pw={pw} knockout={knockout} reload={reload} setMsg={setMsg} />
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
              Standings update from the live feed on their own — you usually don't need to touch this. Use it only to <b style={{ color: "var(--muted)" }}>override</b> a group: <b style={{ color: "var(--text)" }}>Auto</b> follows the feed, <b style={{ color: "var(--red)" }}>Live</b>/<b style={{ color: "var(--green)" }}>Final</b> force your own order (handy for fixing an official tiebreaker the feed gets wrong).
            </p>
            {GROUP_IDS.map((g) => (
              <div key={g} style={{ background: "var(--card)", border: `1px solid ${mode[g] === "live" ? "rgba(230,57,70,.35)" : mode[g] === "final" ? "rgba(46,230,166,.3)" : "var(--line)"}`, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--display)", fontSize: 18, color: "var(--gold)" }}>GROUP {g}</span>
                  <div style={{ display: "flex", gap: 4, background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 9, padding: 3 }}>
                    {MODES.map((s) => { const on = mode[g] === s.k; const c = s.k === "live" ? "var(--red)" : s.k === "final" ? "var(--green)" : "var(--muted)";
                      return <button key={s.k} className="btn" onClick={() => setMode((p) => ({ ...p, [g]: s.k }))} style={{ padding: "4px 12px", fontSize: 12, borderRadius: 6, background: on ? c : "transparent", color: on ? (s.k === "auto" ? "#0b1410" : "#0a1410") : "var(--muted)" }}>{s.label}</button>;
                    })}
                  </div>
                </div>
                {draft[g].map((t, i) => (
                  <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", opacity: mode[g] === "auto" ? .55 : 1 }}>
                    <PosBadge idx={i} small /><span>{FLAG[t]}</span><span style={{ flex: 1, fontSize: 14 }}>{t}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <IconBtn disabled={i === 0 || mode[g] === "auto"} onClick={() => move(g, i, -1)}><ChevronUp size={14} /></IconBtn>
                      <IconBtn disabled={i === 3 || mode[g] === "auto"} onClick={() => move(g, i, 1)}><ChevronDown size={14} /></IconBtn>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {msg && <Note bad={msg.startsWith("ERR")}>{msg.replace(/^ERR: /, "")}</Note>}
            <button className="btn" disabled={busy} onClick={save} style={{ marginTop: 8, width: "100%", padding: 14, background: "linear-gradient(110deg,#1fb574,#f5c542)", color: "#0b1410", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{busy ? <><RefreshCw size={16} className="spin" /> Saving…</> : <><Save size={16} /> Save overrides</>}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// FINISHED-only safeguard: lets admin fill in a final score when the feed
// flips status to FINISHED before populating score.fullTime, or correct a
// wrong score. Empty inputs + Save clears the override for that match.
function MatchScoresCard({ pw, matches, reload, setMsg }) {
  const finished = useMemo(() => (matches || []).filter((m) => m.status === "FINISHED"), [matches]);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  function setDraft(id, side, v) {
    setDrafts((p) => ({ ...p, [id]: { ...(p[id] || {}), [side]: v.replace(/[^\d]/g, "").slice(0, 2) } }));
  }
  async function save(m, clear = false) {
    const d = drafts[m.id] || {};
    const home = clear ? "" : (d.home ?? (m.homeScore ?? ""));
    const away = clear ? "" : (d.away ?? (m.awayScore ?? ""));
    setSavingId(m.id); setMsg(null);
    try {
      await api.adminSetMatchScore(pw.trim(), m.id, home === "" ? null : Number(home), away === "" ? null : Number(away));
      setDrafts((p) => { const n = { ...p }; delete n[m.id]; return n; });
      setMsg(clear ? `Cleared override for ${m.home} v ${m.away}.` : `Saved ${m.home} ${home}–${away} ${m.away}.`);
      reload();
    } catch (e) { setMsg("ERR: " + e.message); }
    setSavingId(null);
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
      <div style={{ fontFamily: "var(--display)", fontSize: 18, color: "var(--gold)", marginBottom: 4 }}>MATCH SCORE OVERRIDES</div>
      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>
        Safeguard for finished matches. Fill in a score if the feed marked the match final without one ({" "}
        <span style={{ color: "var(--red)", fontWeight: 700 }}>MISSING</span>{" "}), or overwrite a wrong one. Leave both blank and Save to revert to the feed.
      </div>
      {finished.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>No finished matches yet.</div>
      ) : finished.map((m) => {
        const d = drafts[m.id] || {};
        const homeVal = d.home ?? (m.homeScore == null ? "" : String(m.homeScore));
        const awayVal = d.away ?? (m.awayScore == null ? "" : String(m.awayScore));
        const missing = m.homeScore == null || m.awayScore == null;
        const isOverride = m.scoreSource === "admin";
        const busy = savingId === m.id;
        return (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
            <span style={{ minWidth: 46, fontFamily: "var(--display)", fontSize: 12, color: "var(--gold)", letterSpacing: 1 }}>{m.group ? `GRP ${m.group}` : stageName(m.stage)}</span>
            <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.home} v {m.away}</span>
            {missing && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: "rgba(230,57,70,.18)", color: "var(--red)", fontWeight: 800, letterSpacing: 1 }}>MISSING</span>}
            {isOverride && !missing && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: "rgba(46,230,166,.18)", color: "var(--green)", fontWeight: 800, letterSpacing: 1 }}>OVERRIDE</span>}
            <input value={homeVal} onChange={(e) => setDraft(m.id, "home", e.target.value)} inputMode="numeric" placeholder="–" style={{ width: 38, padding: "5px 6px", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 7, color: "var(--text)", fontSize: 14, textAlign: "center", outline: "none" }} />
            <span style={{ color: "var(--muted)" }}>–</span>
            <input value={awayVal} onChange={(e) => setDraft(m.id, "away", e.target.value)} inputMode="numeric" placeholder="–" style={{ width: 38, padding: "5px 6px", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 7, color: "var(--text)", fontSize: 14, textAlign: "center", outline: "none" }} />
            <button className="btn" disabled={busy} onClick={() => save(m)} style={{ background: "var(--bg2)", border: "1px solid var(--line)", color: "var(--text)", padding: "5px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, opacity: busy ? .5 : 1 }}>
              {busy ? <RefreshCw size={12} className="spin" /> : <Save size={12} />} Save
            </button>
            {isOverride && (
              <button className="btn" disabled={busy} onClick={() => save(m, true)} style={{ background: "transparent", border: "1px solid rgba(230,57,70,.35)", color: "var(--red)", padding: "5px 10px", fontSize: 12, opacity: busy ? .5 : 1 }}>Clear</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------- bracket admin cards ----------------------------- */

// All 48 pool teams for admin dropdowns, sorted alphabetically.
const ALL_TEAMS = Object.values({
  A: ["Mexico","South Korea","South Africa","Czechia"],
  B: ["Canada","Switzerland","Qatar","Bosnia and Herzegovina"],
  C: ["Brazil","Scotland","Morocco","Haiti"],
  D: ["United States","Paraguay","Australia","Türkiye"],
  E: ["Germany","Ecuador","Ivory Coast","Curaçao"],
  F: ["Netherlands","Japan","Tunisia","Sweden"],
  G: ["Belgium","Iran","Egypt","New Zealand"],
  H: ["Spain","Uruguay","Saudi Arabia","Cape Verde"],
  I: ["France","Norway","Senegal","Iraq"],
  J: ["Argentina","Austria","Algeria","Jordan"],
  K: ["Portugal","Colombia","Uzbekistan","DR Congo"],
  L: ["England","Croatia","Ghana","Panama"],
}).flat().sort();

const R32_IDS = Array.from({ length: 16 }, (_, i) => `R32_${i + 1}`);

// Admin card to enter the 16 R32 matchups. Each match saves individually.
// Visual bracket entry for admin. Shows the same left/right tree layout as
// BracketTab so the admin can orient to the real bracket online. R32 cells are
// editable in-place: tap to expand dropdowns, save per match individually.
// R16+ cells show "→ Winner of R32_X" placeholders (read-only here).
function BracketSetupCard({ pw, knockout, reload, setMsg }) {
  const bracketData = knockout?.bracket || {};
  const [editing, setEditing] = useState(null); // which R32_X is open
  const [draft, setDraftState] = useState({ home: "", away: "" });
  const [saving, setSaving] = useState(false);

  function openEdit(id) {
    const existing = bracketData[id] || {};
    setDraftState({ home: existing.home || "", away: existing.away || "" });
    setEditing(id);
  }

  async function save() {
    if (!editing) return;
    setSaving(true); setMsg(null);
    try {
      await api.adminSetBracketMatch(pw, editing, draft.home || null, draft.away || null);
      setMsg(`Saved ${editing}: ${draft.home || "TBD"} vs ${draft.away || "TBD"}.`);
      setEditing(null);
      reload();
    } catch (e) { setMsg("ERR: " + e.message); }
    setSaving(false);
  }

  // Derive display label for any match cell.
  function cellLabel(id) {
    if (id.startsWith("R32_")) {
      const m = bracketData[id] || {};
      const h = m.home; const a = m.away;
      if (h && a) return `${FLAG[h] || ""} ${h}\n${FLAG[a] || ""} ${a}`;
      if (h) return `${FLAG[h] || ""} ${h}\nTBD`;
      if (a) return `TBD\n${FLAG[a] || ""} ${a}`;
      return "TBD\nvs\nTBD";
    }
    const feeders = BRACKET_TREE[id];
    if (!feeders) return "FINAL";
    const [a, b] = feeders;
    const wa = bracketData[a]?.winner; const wb = bracketData[b]?.winner;
    if (wa && wb) return `${FLAG[wa] || ""} ${wa}\n${FLAG[wb] || ""} ${wb}`;
    return `W of ${a}\nvs\nW of ${b}`;
  }

  function AdminCell({ id, roundLabel }) {
    const isR32 = id.startsWith("R32_");
    const isEditing = editing === id;
    const existing = bracketData[id] || {};
    const isApi = isR32 && existing.source === "api" && !isEditing;
    const lines = cellLabel(id).split("\n");
    return (
      <div style={{ background: isEditing ? "var(--card2)" : "var(--card)", border: `1px solid ${isEditing ? "var(--pitch)" : "var(--line)"}`, borderRadius: 8, margin: "2px 3px", overflow: "hidden", minWidth: 130 }}>
        {isEditing ? (
          <div style={{ padding: "6px 8px" }}>
            <div style={{ fontFamily: "var(--display)", fontSize: 10, color: "var(--gold)", marginBottom: 5 }}>{id}</div>
            <select value={draft.home} onChange={(e) => setDraftState((p) => ({ ...p, home: e.target.value }))} style={{ width: "100%", marginBottom: 4, padding: "4px 5px", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 6, color: draft.home ? "var(--text)" : "var(--muted)", fontSize: 11, outline: "none" }}>
              <option value="">— Team 1 —</option>
              {ALL_TEAMS.map((t) => <option key={t} value={t}>{FLAG[t] || ""} {t}</option>)}
            </select>
            <select value={draft.away} onChange={(e) => setDraftState((p) => ({ ...p, away: e.target.value }))} style={{ width: "100%", marginBottom: 6, padding: "4px 5px", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 6, color: draft.away ? "var(--text)" : "var(--muted)", fontSize: 11, outline: "none" }}>
              <option value="">— Team 2 —</option>
              {ALL_TEAMS.map((t) => <option key={t} value={t}>{FLAG[t] || ""} {t}</option>)}
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="btn" disabled={saving} onClick={save} style={{ flex: 1, background: "var(--pitch)", color: "#0b1410", padding: "4px 0", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                {saving ? <RefreshCw size={10} className="spin" /> : <Save size={10} />} Save
              </button>
              <button className="btn" onClick={() => setEditing(null)} style={{ background: "var(--bg2)", border: "1px solid var(--line)", color: "var(--muted)", padding: "4px 8px", fontSize: 11 }}>✕</button>
            </div>
          </div>
        ) : (
          <div onClick={() => isR32 && openEdit(id)} style={{ padding: "7px 9px", cursor: isR32 ? "pointer" : "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontFamily: "var(--display)", fontSize: 9, color: "var(--gold)", letterSpacing: 1 }}>{id}</span>
              {isApi && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "rgba(31,181,116,.2)", color: "var(--pitch)", fontWeight: 800 }}>API</span>}
              {isR32 && !isApi && <span style={{ fontSize: 9, color: "var(--muted)" }}>tap</span>}
            </div>
            {lines.map((line, i) => (
              <div key={i} style={{ fontSize: 11, color: line.startsWith("W of") || line === "TBD" || line === "vs" ? "var(--muted)" : "var(--text)", fontStyle: line.startsWith("W of") || line === "TBD" || line === "vs" ? "italic" : "normal", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
      <div style={{ fontFamily: "var(--display)", fontSize: 18, color: "var(--gold)", marginBottom: 4 }}>BRACKET SETUP · R32 MATCHUPS</div>
      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>
        Tap any R32 match to set the two teams. Layout mirrors the real bracket — left side top-half, right side bottom-half. Feed fills slots automatically when available (API badge).
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: 860 }}>
          {LEFT_ROUNDS.map(({ round, ids }) => (
            <div key={"AL-" + ids[0]} style={{ display: "flex", flexDirection: "column", flex: "0 0 140px", minWidth: 140 }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 9, letterSpacing: 1.5, color: "var(--muted)", textAlign: "center", padding: "2px 4px 6px", whiteSpace: "nowrap" }}>{ROUND_LABELS[round]}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {ids.map((id, idx) => {
                  const spacer = ids.length < 8 ? Math.floor((8 / ids.length - 1) * 38) : 0;
                  return <div key={id} style={{ marginTop: idx === 0 ? spacer : spacer * 2 }}><AdminCell id={id} /></div>;
                })}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", flex: "0 0 150px", minWidth: 150 }}>
            <div style={{ fontFamily: "var(--display)", fontSize: 9, letterSpacing: 1.5, color: "var(--muted)", textAlign: "center", padding: "2px 4px 6px" }}>{ROUND_LABELS.FINAL}</div>
            <div style={{ marginTop: Math.floor((8 - 1) * 38) }}><AdminCell id="FINAL" /></div>
          </div>
          {RIGHT_ROUNDS.map(({ round, ids }) => (
            <div key={"AR-" + ids[0]} style={{ display: "flex", flexDirection: "column", flex: "0 0 140px", minWidth: 140 }}>
              <div style={{ fontFamily: "var(--display)", fontSize: 9, letterSpacing: 1.5, color: "var(--muted)", textAlign: "center", padding: "2px 4px 6px", whiteSpace: "nowrap" }}>{ROUND_LABELS[round]}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {ids.map((id, idx) => {
                  const spacer = ids.length < 8 ? Math.floor((8 / ids.length - 1) * 38) : 0;
                  return <div key={id} style={{ marginTop: idx === 0 ? spacer : spacer * 2 }}><AdminCell id={id} /></div>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Admin card to override knockout match results (R32 through Final).
function KnockoutResultsCard({ pw, knockout, reload, setMsg }) {
  const bracketData = knockout?.bracket || {};
  // Only show matches where both teams are known.
  const knownMatches = ALL_MATCH_IDS.filter((id) => {
    if (id.startsWith("R32_")) return bracketData[id]?.home && bracketData[id]?.away;
    const feeders = BRACKET_TREE[id];
    if (!feeders) return false;
    return bracketData[feeders[0]]?.winner && bracketData[feeders[1]]?.winner;
  });

  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);

  function teamOptions(id) {
    if (id.startsWith("R32_")) return [bracketData[id]?.home, bracketData[id]?.away].filter(Boolean);
    const feeders = BRACKET_TREE[id] || [];
    return feeders.map((f) => bracketData[f]?.winner).filter(Boolean);
  }

  async function save(id) {
    const d = drafts[id] || {};
    const winner = d.winner !== undefined ? d.winner : (bracketData[id]?.winner || "");
    const status = d.status || "final";
    setSaving(id); setMsg(null);
    try {
      await api.adminSetKnockoutResult(pw, id, winner || null, status);
      setDrafts((p) => { const n = { ...p }; delete n[id]; return n; });
      setMsg(winner ? `Set ${id} winner: ${winner}.` : `Cleared ${id} override.`);
      reload();
    } catch (e) { setMsg("ERR: " + e.message); }
    setSaving(null);
  }

  if (knownMatches.length === 0) return null;

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
      <div style={{ fontFamily: "var(--display)", fontSize: 18, color: "var(--gold)", marginBottom: 4 }}>KNOCKOUT RESULTS</div>
      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>
        Override the winner of any knockout match. Feed picks these up automatically when available.
      </div>
      {knownMatches.map((id) => {
        const d = drafts[id] || {};
        const current = bracketData[id] || {};
        const opts = teamOptions(id);
        const winnerVal = d.winner !== undefined ? d.winner : (current.winner || "");
        const statusVal = d.status || current.status || "final";
        const busy = saving === id;
        const round = id === "FINAL" ? "FINAL" : id.split("_")[0];
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
            <span style={{ minWidth: 54, fontFamily: "var(--display)", fontSize: 12, color: "var(--gold)" }}>{id}</span>
            <span style={{ fontSize: 11, color: "var(--muted)", minWidth: 40 }}>+{KNOCKOUT_SCORES[round]}</span>
            <select value={winnerVal} onChange={(e) => setDrafts((p) => ({ ...p, [id]: { ...(p[id] || {}), winner: e.target.value } }))} style={{ flex: 1, minWidth: 100, padding: "5px 6px", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 7, color: winnerVal ? "var(--text)" : "var(--muted)", fontSize: 12, outline: "none" }}>
              <option value="">— Winner —</option>
              {opts.map((t) => <option key={t} value={t}>{FLAG[t] || ""} {t}</option>)}
            </select>
            <select value={statusVal} onChange={(e) => setDrafts((p) => ({ ...p, [id]: { ...(p[id] || {}), status: e.target.value } }))} style={{ width: 70, padding: "5px 6px", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 7, color: "var(--text)", fontSize: 12, outline: "none" }}>
              <option value="live">Live</option>
              <option value="final">Final</option>
            </select>
            <button className="btn" disabled={busy} onClick={() => save(id)} style={{ background: "var(--bg2)", border: "1px solid var(--line)", color: "var(--text)", padding: "5px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, opacity: busy ? .5 : 1 }}>
              {busy ? <RefreshCw size={12} className="spin" /> : <Save size={12} />} Save
            </button>
            {current.winner && (
              <button className="btn" disabled={busy} onClick={() => { setDrafts((p) => ({ ...p, [id]: { winner: "", status: "final" } })); setTimeout(() => save(id), 0); }} style={{ background: "transparent", border: "1px solid rgba(230,57,70,.35)", color: "var(--red)", padding: "5px 10px", fontSize: 12, opacity: busy ? .5 : 1 }}>Clear</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ scoring key ------------------------------ */
function ScoringKey() {
  const rows = [["Team finished 1st", [25, 15, 5, 0]], ["Team finished 2nd", [15, 20, 5, 0]], ["Team finished 3rd", [5, 5, 15, 0]], ["Team finished 4th", [0, 0, 0, 0]]];
  return (
    <Card style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, marginBottom: 4 }}><Crown size={16} style={{ color: "var(--gold)" }} /> How points work</div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>Each group is worth up to <b style={{ color: "var(--text)" }}>60 pts</b> — <b style={{ color: "var(--text)" }}>720</b> across all 12. The knockout bracket adds up to <b style={{ color: "var(--text)" }}>1,600</b> more (R32=20 / R16=40 / QF=80 / SF=160 / Final=320). Max combined: <b style={{ color: "var(--text)" }}>2,320 pts</b>. Predicting 4th is worth nothing, so the obvious last-place team never pads a score.</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 360 }}>
          <thead><tr style={{ color: "var(--muted)" }}><th style={{ textAlign: "left", padding: "6px 8px" }}>You predicted →</th>{["1st", "2nd", "3rd", "4th"].map((h) => <th key={h} style={{ padding: "6px 8px" }}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(([label, vals], ri) => (
            <tr key={label} style={{ borderTop: "1px solid var(--line)" }}>
              <td style={{ padding: "6px 8px", color: "var(--text)", fontWeight: 600 }}>{label}</td>
              {vals.map((v, ci) => <td key={ci} style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: v === 0 ? "#46506b" : ri === ci ? "var(--green)" : "var(--text)" }}>{v}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>Green = exact placement. Off-diagonal = right team, wrong spot (partial credit for the qualifiers).</p>
    </Card>
  );
}

/* ------------------------------ primitives ------------------------------ */
function Card({ children, style }) { return <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, ...style }}>{children}</div>; }
function Label({ children, style }) { return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--muted)", marginBottom: 6, ...style }}>{children}</div>; }
function TextInput({ value, onChange, placeholder, type = "text" }) { return <input value={value} type={type} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--text)", fontSize: 15, outline: "none" }} />; }
function IconBtn({ children, onClick, disabled }) { return <button className="btn" disabled={disabled} onClick={onClick} style={{ background: disabled ? "transparent" : "var(--bg2)", border: "1px solid var(--line)", padding: 3, borderRadius: 7, opacity: disabled ? .35 : 1, lineHeight: 0, display: "flex", color: disabled ? "#3a425c" : "var(--text)" }}>{children}</button>; }
function Note({ children, bad }) { return <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: bad ? "rgba(230,57,70,.12)" : "rgba(46,230,166,.12)", color: bad ? "var(--red)" : "var(--green)", border: `1px solid ${bad ? "rgba(230,57,70,.3)" : "rgba(46,230,166,.3)"}` }}>{children}</div>; }
function Banner({ children, icon: Icon }) { return <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 14, color: "var(--muted)" }}><Icon size={17} style={{ color: "var(--gold)", marginTop: 1, flexShrink: 0 }} /><span>{children}</span></div>; }
function Empty({ icon: Icon, title, sub }) { return <Centered><Icon size={34} style={{ color: "var(--muted)" }} /><div style={{ fontWeight: 800, fontSize: 18, marginTop: 12 }}>{title}</div><div style={{ color: "var(--muted)", marginTop: 4, maxWidth: 300 }}>{sub}</div></Centered>; }
