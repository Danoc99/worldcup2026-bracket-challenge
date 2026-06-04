import { useState, useEffect, useMemo, useRef } from "react";
import {
  ChevronUp, ChevronDown, Trophy, Lock, Unlock, Crown, Settings,
  Save, Check, RefreshCw, Medal, Users, ListOrdered, X, EyeOff, Wifi, Trash2,
  GripVertical, HelpCircle,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  LOCK_ISO, GROUPS, GROUP_IDS, FLAG, SCORE_MATRIX, GROUP_TOTAL_MAX, POS_META,
  scoreGroup, slug, clone,
} from "./data.js";
import { api } from "./api.js";

const ME_KEY = "wc26_me";

export default function App() {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState(null);
  const [entries, setEntries] = useState([]);
  const [groups, setGroups] = useState({});
  const [meta, setMeta] = useState({});
  const [me, setMe] = useState(() => { try { return JSON.parse(localStorage.getItem(ME_KEY)); } catch { return null; } });
  const [tab, setTab] = useState("picks");
  const [now, setNow] = useState(Date.now());
  const locked = now >= new Date(LOCK_ISO).getTime();

  async function load() {
    try {
      const s = await api.getState();
      setConfig(s.config); setEntries(s.entries || []); setGroups(s.groups || {}); setMeta(s.meta || {});
    } catch (e) { /* keep last state */ }
    setReady(true);
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  function saveMe(identity) { setMe(identity); try { identity ? localStorage.setItem(ME_KEY, JSON.stringify(identity)) : localStorage.removeItem(ME_KEY); } catch {} }

  if (!ready) return <Shell><Centered><RefreshCw className="spin" size={28} /><div style={{ marginTop: 12, color: "var(--muted)" }}>Loading the pool…</div></Centered><FontAndTheme /></Shell>;
  if (!config) return <Shell><SetupCard onDone={load} /><FontAndTheme /></Shell>;

  return (
    <Shell>
      <Header config={config} locked={locked} now={now} />
      <Tabs tab={tab} setTab={setTab} count={entries.length} />
      {tab === "picks" && <PicksTab me={me} saveMe={saveMe} entries={entries} locked={locked} reload={load} />}
      {tab === "standings" && <StandingsTab entries={entries} groups={groups} meta={meta} locked={locked} me={me} />}
      <AdminFooter groups={groups} entries={entries} reload={load} />
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
function Header({ config, locked, now }) {
  const remain = new Date(LOCK_ISO).getTime() - now;
  const d = Math.max(0, Math.floor(remain / 86400000));
  const h = Math.max(0, Math.floor((remain % 86400000) / 3600000));
  const m = Math.max(0, Math.floor((remain % 3600000) / 60000));
  return (
    <div className="rise" style={{ paddingTop: 28, paddingBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--pitch)", fontWeight: 700, letterSpacing: 2, fontSize: 12, textTransform: "uppercase" }}>
        <Trophy size={15} /> World Cup 2026 · Group Stage
      </div>
      <h1 style={{ fontFamily: "var(--display)", fontSize: "clamp(34px,8vw,64px)", lineHeight: .95, margin: "6px 0 0", letterSpacing: 1, background: "linear-gradient(110deg,#1fb574 0%,#f5c542 70%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
        {config.poolName || "BRACKET CHALLENGE"}
      </h1>
      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--line)", padding: "8px 14px", borderRadius: 999, fontSize: 14 }}>
          {locked
            ? <><Lock size={15} style={{ color: "var(--gold)" }} /><span style={{ fontWeight: 700 }}>Picks locked</span><span style={{ color: "var(--muted)" }}>— tournament underway</span></>
            : <><Unlock size={15} style={{ color: "var(--green)" }} /><span style={{ fontWeight: 700 }}>Picks lock in {d}d {h}h {m}m</span></>}
        </div>
        <HelpPill />
      </div>
    </div>
  );
}

function HelpPill() {
  const [show, setShow] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setShow(true)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)", padding: "8px 14px", borderRadius: 999, fontSize: 14 }}>
        <HelpCircle size={15} style={{ color: "var(--pitch)" }} /> How it works
      </button>
      {show && <HelpModal onClose={() => setShow(false)} />}
    </>
  );
}

function HelpModal({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(4,7,14,.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="rise" style={{ maxWidth: 640, width: "100%", margin: "40px 0", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 18, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 26, color: "var(--gold)" }}>HOW IT WORKS</div>
          <button className="btn" onClick={onClose} style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)", padding: 8 }}><X size={16} /></button>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>How points work</div>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px", lineHeight: 1.5 }}>You earn points for each group based on how close your predicted finishing order matches the real result.</p>
          <ul style={{ color: "var(--muted)", fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Exact slot match → max points: <b style={{ color: "var(--text)" }}>25</b> for 1st, <b style={{ color: "var(--text)" }}>20</b> for 2nd, <b style={{ color: "var(--text)" }}>15</b> for 3rd</li>
            <li>Off by one or two slots → partial credit (5–15 pts)</li>
            <li>Predict ANY team to finish 4th → <b style={{ color: "var(--text)" }}>0 pts</b> no matter what</li>
          </ul>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "8px 0 0", lineHeight: 1.5 }}>Each group is worth up to <b style={{ color: "var(--text)" }}>60 pts</b>, so the group stage alone is worth up to <b style={{ color: "var(--text)" }}>720</b>.</p>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>Example — you picked Brazil 1st</div>
          <ul style={{ color: "var(--muted)", fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Brazil finishes 1st → <b style={{ color: "var(--green)" }}>25 pts</b></li>
            <li>Brazil finishes 2nd → <b style={{ color: "var(--text)" }}>15 pts</b> (partial credit, off by one)</li>
            <li>Brazil finishes 3rd → <b style={{ color: "var(--text)" }}>5 pts</b></li>
            <li>Brazil finishes 4th → <b style={{ color: "var(--muted)" }}>0 pts</b></li>
          </ul>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>Projected vs. Final points</div>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 6px", lineHeight: 1.5 }}><b style={{ color: "var(--red)" }}>Projected (~12)</b> — the group is still being played. Points update as games happen.</p>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 6px", lineHeight: 1.5 }}><b style={{ color: "var(--green)" }}>Final (+15)</b> — the group has played all 12 of its matches. Points are locked in.</p>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: 0, fontStyle: "italic" }}>Your leaderboard total mixes both.</p>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Color meanings on the Standings tab</div>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 10px" }}>Tap your own bracket to expand your per-group breakdown.</p>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--red)", fontWeight: 800, minWidth: 84, flexShrink: 0 }}>Red name</span>
              <span>You picked this team for this slot AND it's currently in that slot, but the group is still live. Earning projected points; can change.</span>
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--green)", fontWeight: 800, minWidth: 84, flexShrink: 0 }}>Green name ✓</span>
              <span>Same as red, but the group is officially done. Points locked in.</span>
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--text)", fontWeight: 800, minWidth: 84, flexShrink: 0 }}>White name</span>
              <span>Team isn't in the exact slot you picked. You may STILL be earning partial credit if it's one or two slots off — that just doesn't show as a color.</span>
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--text)", opacity: .55, fontWeight: 800, minWidth: 84, flexShrink: 0 }}>Dimmed 4th</span>
              <span>4th place is always worth 0 pts, so the row is faded as a reminder.</span>
            </div>
          </div>
        </div>

        <div style={{ background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>TL;DR</div>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: 0, lineHeight: 1.5 }}>Red and green = slot-perfect hits. White can still score partial credit. 4th never scores. Projected can change; Final is locked in.</p>
        </div>

      </div>
    </div>
  );
}

function Tabs({ tab, setTab, count }) {
  const items = [{ id: "picks", label: "My Picks", icon: ListOrdered }, { id: "standings", label: `Standings${count ? " · " + count : ""}`, icon: Trophy }];
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
function PicksTab({ me, saveMe, entries, locked, reload }) {
  const [name, setName] = useState(me?.name || "");
  const [pin, setPin] = useState(me?.pin || "");
  const [preds, setPreds] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const initFor = useRef(null);

  const myEntry = useMemo(() => entries.find((e) => slug(e.name) === slug(me?.name || "")), [entries, me]);
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
        <div key={g} className="rise" style={{ animationDelay: `${gi * 25}ms` }}><GroupCard g={g} order={preds[g]} onReorder={reorder} locked={locked} /></div>
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

/* ------------------------------ standings -------------------------------- */
function StandingsTab({ entries, groups, meta, locked, me }) {
  const [open, setOpen] = useState(null);
  const counted = GROUP_IDS.map((g) => groups[g]).filter(Boolean);
  const liveCount = counted.filter((r) => r.status === "live").length;
  const finalCount = counted.filter((r) => r.status === "final").length;
  const anyLive = liveCount > 0;
  const anyResults = counted.length > 0;

  const rows = useMemo(() => entries.map((e) => {
    let total = 0;
    GROUP_IDS.forEach((g) => { const r = groups[g]; if (r) total += scoreGroup(e.predictions?.[g], r.order); });
    return { ...e, total };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)), [entries, groups]);

  if (entries.length === 0) return <div className="rise"><Empty icon={Users} title="No entries yet" sub="Be the first — head to My Picks and fill out your bracket." /></div>;

  return (
    <div className="rise">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, fontSize: 13, color: "var(--muted)", flexWrap: "wrap" }}>
        {anyLive && <span className="pulse" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--red)", fontWeight: 800, letterSpacing: 1 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--red)" }} />LIVE</span>}
        {anyResults
          ? <span>{finalCount} final · {liveCount} projected · {12 - counted.length} to come</span>
          : <span>{locked ? "Tournament underway — standings update automatically." : "Standings light up once games start."}</span>}
        {meta?.stale && <span style={{ color: "#caa14a", display: "inline-flex", alignItems: "center", gap: 5 }}><Wifi size={13} /> showing last synced data</span>}
      </div>
      {anyLive && <Banner icon={RefreshCw}>Projected points assume each live group finishes in its current order — they shuffle as results change and lock when a group goes final.</Banner>}
      {rows.map((r, i) => {
        const isMe = slug(r.name) === slug(me?.name || ""); const medal = i < 3 && anyResults;
        return (
          <div key={r.name} style={{ marginBottom: 10 }}>
            <Card style={{ padding: 0, border: isMe ? "1px solid var(--pitch)" : "1px solid var(--line)" }}>
              <button className="btn" onClick={() => setOpen(open === r.name ? null : r.name)} style={{ width: "100%", background: "transparent", color: "var(--text)", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", textAlign: "left" }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 22, width: 30, color: medal ? POS_META[i].color : "var(--muted)" }}>{medal ? <Medal size={22} style={{ color: POS_META[i].color }} /> : i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{r.name} {isMe && <span style={{ color: "var(--pitch)", fontSize: 12, fontWeight: 700 }}>· you</span>}</div>
                  {!anyResults && <div style={{ color: "var(--muted)", fontSize: 12 }}>bracket submitted</div>}
                </div>
                {anyResults && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--display)", fontSize: 26, color: "var(--gold)", lineHeight: 1 }}>{r.total}</div>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>{anyLive ? "projected" : `/ ${GROUP_TOTAL_MAX} pts`}</div>
                  </div>
                )}
              </button>
              {open === r.name && <div style={{ borderTop: "1px solid var(--line)", padding: "10px 16px 14px" }}><PlayerBreakdown entry={r} groups={groups} locked={locked} isMe={isMe} /></div>}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function PlayerBreakdown({ entry, groups, locked, isMe }) {
  if (!(locked || isMe)) return <div style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><EyeOff size={15} /> Picks hidden until lock (June 11).</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
      {GROUP_IDS.map((g) => {
        const pred = entry.predictions?.[g] || []; const r = groups[g];
        const isLive = r?.status === "live"; const isFinal = r?.status === "final";
        const pts = r ? scoreGroup(pred, r.order) : null;
        return (
          <div key={g} style={{ background: "var(--bg2)", border: `1px solid ${isLive ? "rgba(230,57,70,.35)" : "var(--line)"}`, borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontFamily: "var(--display)", fontSize: 14, color: "var(--gold)" }}>GRP {g}</span>
              {r ? <span style={{ fontWeight: 800, fontSize: 13, color: isLive ? "var(--red)" : "var(--green)" }}>{isLive ? "~" : "+"}{pts}</span> : <span style={{ fontSize: 10, color: "#46506b" }}>—</span>}
            </div>
            {pred.map((t, i) => {
              const correct = isFinal && r.order[i] === t; const liveMatch = isLive && r.order[i] === t;
              return (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, opacity: i === 3 ? .55 : 1, marginBottom: 2 }}>
                  <span style={{ color: "var(--muted)", width: 10 }}>{i + 1}</span><span>{FLAG[t]}</span>
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: correct ? "var(--green)" : liveMatch ? "var(--red)" : "var(--text)" }}>{t}</span>
                  {correct && <Check size={12} style={{ color: "var(--green)" }} />}
                </div>
              );
            })}
            {isLive && <div style={{ marginTop: 4, fontSize: 9, letterSpacing: 1, fontWeight: 800, color: "var(--red)" }}>PROJECTED</div>}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- admin --------------------------------- */
function AdminFooter({ groups, entries, reload }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <button className="btn" onClick={() => setShow(true)} style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--muted)", padding: "8px 14px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 7 }}><Settings size={14} /> Admin · override results</button>
        <div style={{ color: "#46506b", fontSize: 11, marginTop: 14 }}>World Cup 2026 · live scores auto-update · knockout bracket unlocks after the group stage</div>
      </div>
      {show && <AdminModal groups={groups} entries={entries} reload={reload} onClose={() => setShow(false)} />}
    </>
  );
}

function AdminModal({ groups, entries, reload, onClose }) {
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

/* ------------------------------ scoring key ------------------------------ */
function ScoringKey() {
  const rows = [["Team finished 1st", [25, 15, 5, 0]], ["Team finished 2nd", [15, 20, 5, 0]], ["Team finished 3rd", [5, 5, 15, 0]], ["Team finished 4th", [0, 0, 0, 0]]];
  return (
    <Card style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, marginBottom: 4 }}><Crown size={16} style={{ color: "var(--gold)" }} /> How points work</div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>Each group is worth up to <b style={{ color: "var(--text)" }}>60 pts</b> — <b style={{ color: "var(--text)" }}>720</b> across all 12. The knockout phase later adds up to <b style={{ color: "var(--text)" }}>1,600</b> more (20/40/80/160/320 a round; the champion pick alone is 320). Predicting 4th is worth nothing, so the obvious last-place team never pads a score.</p>
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
