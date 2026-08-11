import { useState, useEffect, useMemo } from "react";
import {
  ChevronUp, ChevronDown, Trophy, Crown,
  Check, RefreshCw, Medal, Users, ListOrdered, X, Wifi,
  HelpCircle, CalendarDays, Clock, Eye,
} from "lucide-react";
import {
  GROUP_IDS, FLAG, GROUP_TOTAL_MAX, POS_META,
  scoreGroup, scoreKnockout, slug, tallyPicks, KNOCKOUT_SCORES, ALL_MATCH_IDS, BRACKET_TREE,
} from "./data.js";
import { api } from "./api.js";

export default function App() {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState(null);
  const [entries, setEntries] = useState([]);
  const [groups, setGroups] = useState({});
  const [matches, setMatches] = useState([]);
  const [knockout, setKnockout] = useState({ bracket: {}, picksBySlug: {} });
  const [meta, setMeta] = useState({});
  const [tab, setTab] = useState("standings");
  const [helpOpen, setHelpOpen] = useState(false);

  async function load() {
    try {
      const s = await api.getState();
      setConfig(s.config); setEntries(s.entries || []); setGroups(s.groups || {}); setMatches(s.matches || []);
      setKnockout(s.knockout || { bracket: {}, picksBySlug: {} }); setMeta(s.meta || {});
    } catch (e) { /* keep last state */ }
    setReady(true);
  }
  useEffect(() => {
    load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!ready) return <Shell><Centered><RefreshCw className="spin" size={28} /><div style={{ marginTop: 12, color: "var(--muted)" }}>Loading the pool…</div></Centered><FontAndTheme /></Shell>;
  if (!config) return <Shell><Centered><Trophy size={34} style={{ color: "var(--muted)" }} /><div style={{ marginTop: 12, color: "var(--muted)" }}>Pool not configured.</div></Centered><FontAndTheme /></Shell>;

  return (
    <Shell>
      <Header config={config} helpOpen={helpOpen} setHelpOpen={setHelpOpen} />
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      <Tabs tab={tab} setTab={setTab} count={entries.length} hasBracket={Object.keys(knockout.bracket).length > 0} />
      {tab === "picks" && <PicksTab entries={entries} />}
      {tab === "bracket" && <BracketTab knockout={knockout} entries={entries} />}
      {tab === "matches" && <MatchesTab matches={matches} meta={meta} />}
      {tab === "standings" && <StandingsTab entries={entries} groups={groups} knockout={knockout} meta={meta} />}
      <SpectatorFooter />
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
function Header({ config, helpOpen, setHelpOpen }) {
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
          <Eye size={15} style={{ color: "var(--gold)" }} />
          <span style={{ fontWeight: 700 }}>Tournament complete — spectator mode</span>
        </div>
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
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>How to read the bracket</div>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 10px", lineHeight: 1.55 }}>The bracket always shows the actual match result — winner bold, loser dimmed. Each cell also has a <b style={{ color: "var(--text)" }}>PICK</b> strip at the bottom showing the selected player's predicted winner for that match:</p>
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--muted)" }}>
              <span style={{ color: "var(--green)", fontWeight: 800, minWidth: 16, flexShrink: 0 }}>✓</span>
              <span><b style={{ color: "var(--green)" }}>Green</b> — correct pick. Points earned.</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--muted)" }}>
              <span style={{ color: "var(--red)", fontWeight: 800, minWidth: 16, flexShrink: 0 }}>✗</span>
              <span><b style={{ color: "var(--red)" }}>Red strikethrough</b> — wrong pick. Also shows when the team you picked was already eliminated in an earlier round and can no longer reach this match.</span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--muted)" }}>
              <span style={{ fontWeight: 800, minWidth: 16, flexShrink: 0 }}>···</span>
              <span><b style={{ color: "var(--muted)" }}>Muted</b> — match not yet played.</span>
            </div>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14, margin: 0, lineHeight: 1.55 }}>If your picked team appears in a later round but has already been eliminated, their name shows in red with a strikethrough in that cell too — so dead picks are obvious at a glance.</p>
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
          <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 12px" }}>Tap any player's row to expand their per-group breakdown.</p>
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
              <span>Next to a player's rank, this shows how many spots they moved in the leaderboard between the last two matchdays that finished. A gray "—" means they held their spot.</span>
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

/* -------------------------------- picks ---------------------------------- */
// Spectator-mode Picks tab. Player selector across the top; selecting a player
// shows their locked-in group predictions with the pool consensus strip.
function PicksTab({ entries }) {
  const [viewingSlug, setViewingSlug] = useState(() => entries[0] ? slug(entries[0].name) : null);
  const tally = useMemo(() => tallyPicks(entries), [entries]);

  if (entries.length === 0) {
    return <div className="rise"><Empty icon={Users} title="No entries" sub="This pool has no submitted brackets." /></div>;
  }

  const viewingEntry = entries.find((e) => slug(e.name) === viewingSlug) || entries[0];
  const preds = viewingEntry?.predictions;

  return (
    <div className="rise">
      <PlayerSelector entries={entries} viewingSlug={viewingSlug} setViewingSlug={setViewingSlug} />
      <Banner icon={Eye}>Viewing {viewingEntry.name}'s locked group predictions.</Banner>
      {preds && GROUP_IDS.map((g, gi) => (
        <div key={g} className="rise" style={{ animationDelay: `${gi * 25}ms` }}>
          <GroupCard g={g} order={preds[g] || []} />
          <ContrarianStrip pred={preds[g]} tally={tally[g]} total={tally.total} />
        </div>
      ))}
      <ScoringKey />
    </div>
  );
}

function PlayerSelector({ entries, viewingSlug, setViewingSlug }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {entries.map((e) => {
        const s = slug(e.name);
        const on = s === viewingSlug;
        return (
          <button key={s} className="btn" onClick={() => setViewingSlug(s)} style={{ padding: "7px 14px", fontSize: 13, background: on ? "linear-gradient(110deg,#1fb574,#f5c542)" : "var(--card)", color: on ? "#0b1410" : "var(--text)", border: on ? "none" : "1px solid var(--line)", borderRadius: 999, touchAction: "manipulation" }}>
            {e.name}
          </button>
        );
      })}
    </div>
  );
}

function GroupCard({ g, order }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "var(--card2)" }}>
        <div style={{ fontFamily: "var(--display)", fontSize: 22, color: "var(--gold)", lineHeight: 1 }}>GROUP {g}</div>
      </div>
      <div>
        {order.map((team, idx) => <StaticRow key={team} team={team} idx={idx} last={idx === 3} />)}
      </div>
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
function PosBadge({ idx, small }) {
  const mm = POS_META[idx]; const s = small ? 22 : 28;
  return <div style={{ width: s, height: s, minWidth: s, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: small ? 10 : 12, color: idx === 3 ? "var(--muted)" : "#0b1410", background: idx === 3 ? "transparent" : mm.color, border: idx === 3 ? "1px solid var(--line)" : "none" }}>{mm.label}</div>;
}

/* -------------------------------- bracket -------------------------------- */

// Round display order left→right: R32 left half, R16 left, QF left, SF left,
// FINAL center, SF right, QF right, R16 right, R32 right.
// Left half: R32_1-8, R16_1-4, QF_1-2, SF_1
// Right half: SF_2, QF_3-4, R16_5-8, R32_9-16 (rendered right→left so they converge)
const CELL_H = 108;  // px per R32 slot — accounts for two team rows + pick tab
const BRACKET_H = 16 * CELL_H; // 1152px total bracket height
const COL_W = 148;
const CONN_W = 32;
const HEADER_H = 22;

function matchCenterY(id) {
  if (id === "FINAL") return 8 * CELL_H;
  const [prefix, n] = id.split("_");
  const k = parseInt(n, 10);
  if (prefix === "R32") return (k - 0.5) * CELL_H;
  if (prefix === "R16") return (2 * k - 1) * CELL_H;
  if (prefix === "QF")  return (4 * k - 2) * CELL_H;
  if (prefix === "SF")  return (8 * k - 4) * CELL_H;
  return 8 * CELL_H;
}

const ALL_ROUNDS = [
  { round: "R32", ids: ["R32_1","R32_2","R32_3","R32_4","R32_5","R32_6","R32_7","R32_8","R32_9","R32_10","R32_11","R32_12","R32_13","R32_14","R32_15","R32_16"] },
  { round: "R16", ids: ["R16_1","R16_2","R16_3","R16_4","R16_5","R16_6","R16_7","R16_8"] },
  { round: "QF",  ids: ["QF_1","QF_2","QF_3","QF_4"] },
  { round: "SF",  ids: ["SF_1","SF_2"] },
  { round: "FINAL", ids: ["FINAL"] },
];
const ROUND_LABELS = { R32: "ROUND OF 32", R16: "ROUND OF 16", QF: "QUARTERS", SF: "SEMIS", FINAL: "FINAL" };

function BracketTab({ knockout, entries }) {
  const { bracket, picksBySlug } = knockout;
  const hasBracket = Object.keys(bracket).some((k) => bracket[k]?.home || bracket[k]?.away);

  const [viewingSlug, setViewingSlug] = useState(() => entries[0] ? slug(entries[0].name) : null);

  if (!hasBracket) {
    return <div className="rise"><Empty icon={Crown} title="Bracket not set up" sub="No knockout bracket has been recorded." /></div>;
  }

  const displayPicks = (viewingSlug ? picksBySlug[viewingSlug] : null) || {};
  const viewingEntry = entries.find((e) => slug(e.name) === viewingSlug);

  const eliminatedTeams = new Set();
  for (const id of ALL_MATCH_IDS) {
    const m = bracket[id] || {};
    if (m.winner && m.home && m.away) eliminatedTeams.add(m.winner === m.home ? m.away : m.home);
  }

  return (
    <div className="rise">
      {entries.length > 0 && (
        <PlayerSelector entries={entries} viewingSlug={viewingSlug} setViewingSlug={setViewingSlug} />
      )}
      <Banner icon={Eye}>
        {viewingEntry ? `Viewing ${viewingEntry.name}'s locked bracket picks.` : "Viewing the final bracket."}
      </Banner>

      <div style={{ overflowX: "auto", paddingBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", minWidth: ALL_ROUNDS.length * COL_W + (ALL_ROUNDS.length - 1) * CONN_W }}>
          {ALL_ROUNDS.flatMap(({ round, ids }, i) => [
            i > 0 && <BracketConnector key={"conn-" + round} toRound={round} />,
            <BracketColumn key={"col-" + round} round={round} ids={ids} bracket={bracket} picks={displayPicks} eliminatedTeams={eliminatedTeams} />,
          ]).filter(Boolean)}
        </div>
      </div>
    </div>
  );
}

function BracketColumn({ round, ids, bracket, picks, eliminatedTeams }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: `0 0 ${COL_W}px`, width: COL_W }}>
      <div style={{ fontFamily: "var(--display)", fontSize: 10, letterSpacing: 1.5, color: "var(--muted)", textAlign: "center", height: HEADER_H, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 3, whiteSpace: "nowrap" }}>
        {ROUND_LABELS[round]}
      </div>
      <div style={{ position: "relative", height: BRACKET_H }}>
        {ids.map((id) => (
          <div key={id} style={{ position: "absolute", top: matchCenterY(id) - CELL_H / 2, left: 0, right: 0 }}>
            <BracketMatchCell id={id} round={round} bracket={bracket} picks={picks} eliminatedTeams={eliminatedTeams} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketConnector({ toRound }) {
  const mid = CONN_W / 2;
  const connEntries = Object.entries(BRACKET_TREE).filter(([parentId]) =>
    (parentId === "FINAL" ? "FINAL" : parentId.split("_")[0]) === toRound
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: `0 0 ${CONN_W}px`, width: CONN_W }}>
      <div style={{ height: HEADER_H }} />
      <svg width={CONN_W} height={BRACKET_H} style={{ display: "block" }}>
        {connEntries.map(([parentId, [feedAId, feedBId]]) => {
          const ay = matchCenterY(feedAId);
          const by = matchCenterY(feedBId);
          const py = matchCenterY(parentId);
          return (
            <g key={parentId}>
              <path d={`M 0 ${ay} H ${mid} V ${by} H 0`} fill="none" stroke="var(--line)" strokeWidth={1.5} strokeLinejoin="round" />
              <path d={`M ${mid} ${py} H ${CONN_W}`} fill="none" stroke="var(--line)" strokeWidth={1.5} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BracketMatchCell({ id, round, bracket, picks, eliminatedTeams = new Set() }) {
  const match = bracket[id] || {};
  let home = match.home || null;
  let away = match.away || null;
  let homeDeadPick = false;
  let awayDeadPick = false;
  if (BRACKET_TREE[id]) {
    const [feedA, feedB] = BRACKET_TREE[id];
    const feedAWinner = bracket[feedA]?.winner || null;
    const feedBWinner = bracket[feedB]?.winner || null;
    home = feedAWinner || picks[feedA] || null;
    away = feedBWinner || picks[feedB] || null;
    homeDeadPick = !feedAWinner && !!home && eliminatedTeams.has(home);
    awayDeadPick = !feedBWinner && !!away && eliminatedTeams.has(away);
  }

  const winner = match.winner || null;
  const myPick = picks[id] || null;
  const isLive = match.status === "live";
  const pickCorrect = !!(myPick && winner && winner === myPick);
  const pickWrong = !!(myPick && (winner ? winner !== myPick : eliminatedTeams.has(myPick)));

  function TeamRow({ team, side, deadPick }) {
    if (!team) return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: side === "home" ? "1px solid var(--line)" : "none", opacity: .4 }}>
        <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>TBD</span>
      </div>
    );
    const isWinner = !!(winner && winner === team);
    const isEliminated = !!(winner && winner !== team);
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 10px",
          borderBottom: side === "home" ? "1px solid var(--line)" : "none",
          opacity: (isEliminated || deadPick) ? .45 : 1,
          borderRadius: side === "home" ? "8px 8px 0 0" : "0 0 8px 8px",
        }}
      >
        <span style={{ fontSize: 15 }}>{FLAG[team] || "🏳️"}</span>
        <span style={{ fontSize: 12, fontWeight: isWinner ? 800 : 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: deadPick ? "var(--red)" : "var(--text)",
          textDecoration: deadPick ? "line-through" : "none" }}>
          {team}
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", border: `1px solid ${isLive ? "rgba(230,57,70,.4)" : "var(--line)"}`, borderRadius: 8, margin: "2px 4px", overflow: "hidden" }}>
      <TeamRow team={home} side="home" deadPick={homeDeadPick} />
      <TeamRow team={away} side="away" deadPick={awayDeadPick} />
      {myPick && (
        <div style={{
          display: "flex", alignItems: "center", gap: 4, padding: "3px 8px 4px",
          borderTop: "1px solid var(--line)",
          background: pickCorrect ? "rgba(31,181,116,.1)" : pickWrong ? "rgba(230,57,70,.1)" : "rgba(255,255,255,.03)",
        }}>
          <span style={{ fontSize: 8, color: "var(--muted)", fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>PICK</span>
          <span style={{ fontSize: 11, flexShrink: 0 }}>{FLAG[myPick] || "🏳️"}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: pickCorrect ? "var(--green)" : pickWrong ? "var(--red)" : "var(--muted)",
            textDecoration: pickWrong ? "line-through" : "none",
          }}>{myPick}</span>
          {pickCorrect && <Check size={9} style={{ color: "var(--green)", flexShrink: 0 }} />}
          {pickWrong && <X size={9} style={{ color: "var(--red)", flexShrink: 0 }} />}
        </div>
      )}
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
    const toDayObj = ([key, list]) => ({
      key,
      label: new Date(list[0].utcDate).toLocaleDateString("en-US", {
        timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric",
      }),
      matches: list,
    });
    const entries = [...byDate.entries()];
    // Today + future: ascending (today first, then upcoming)
    const upcoming = entries.filter(([k]) => k >= todayKey).sort(([a], [b]) => a.localeCompare(b)).map(toDayObj);
    // Past: descending (most recent first)
    const past = entries.filter(([k]) => k < todayKey).sort(([a], [b]) => b.localeCompare(a)).map(toDayObj);
    return [...upcoming, ...past];
  }, [matches, todayKey]);

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

function StandingsTab({ entries, groups, knockout, meta }) {
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

  const eliminatedTeams = useMemo(() => {
    const s = new Set();
    for (const id of ALL_MATCH_IDS) {
      const m = (koBracket || {})[id] || {};
      if (m.winner && m.home && m.away) s.add(m.winner === m.home ? m.away : m.home);
    }
    return s;
  }, [koBracket]);

  const rows = useMemo(() => entries.map((e) => {
    let groupPts = 0;
    GROUP_IDS.forEach((g) => {
      const r = groups[g];
      if (r && r.status !== "pending") groupPts += scoreGroup(e.predictions?.[g], r.order);
    });
    const myKoPicks = koPicks?.[slug(e.name)] || {};
    const koPts = scoreKnockout(myKoPicks, koBracket || {});
    let maxKoRemaining = 0;
    for (const id of ALL_MATCH_IDS) {
      const m = (koBracket || {})[id] || {};
      if (m.winner) continue;
      const pick = myKoPicks[id];
      if (!pick || eliminatedTeams.has(pick)) continue;
      const round = id === "FINAL" ? "FINAL" : id.split("_")[0];
      maxKoRemaining += KNOCKOUT_SCORES[round];
    }
    return { ...e, total: groupPts + koPts, groupPts, koPts, maxKoRemaining };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)), [entries, groups, koBracket, koPicks, eliminatedTeams]);

  if (entries.length === 0) return <div className="rise"><Empty icon={Users} title="No entries" sub="This pool has no submitted brackets." /></div>;

  return (
    <div className="rise">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, fontSize: 13, color: "var(--muted)", flexWrap: "wrap" }}>
        {anyLive && <span className="pulse" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--red)", fontWeight: 800, letterSpacing: 1 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--red)" }} />LIVE</span>}
        {anyResults
          ? <span>{finalCount} final · {liveCount} projected{pendingCount ? ` · ${pendingCount} pending` : ""} · {12 - counted.length} to come</span>
          : <span>Tournament results archived.</span>}
        {meta?.stale && <span style={{ color: "#caa14a", display: "inline-flex", alignItems: "center", gap: 5 }}><Wifi size={13} /> showing last synced data</span>}
      </div>
      {allPending && <Banner icon={Trophy}>Tournament results not yet recorded.</Banner>}
      {anyLive && <Banner icon={RefreshCw}>Projected points assume each live group finishes in its current order.</Banner>}
      {rows.map((r, i) => {
        const medal = i < 3 && anyResults;
        return (
          <div key={r.name} style={{ marginBottom: 10 }}>
            <Card style={{ padding: 0 }}>
              <button className="btn" onClick={() => toggle(r.name)} style={{ width: "100%", background: "transparent", color: "var(--text)", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", textAlign: "left" }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 22, width: 30, color: medal ? POS_META[i].color : "var(--muted)" }}>{medal ? <Medal size={22} style={{ color: POS_META[i].color }} /> : i + 1}</div>
                <PlayerMovementChip delta={meta?.playerMovement?.[r.name]} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{r.name}</div>
                  {!anyResults && <div style={{ color: "var(--muted)", fontSize: 12 }}>bracket submitted</div>}
                </div>
                {anyResults && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--display)", fontSize: 26, color: "var(--gold)", lineHeight: 1 }}>{r.total}</div>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>
                      {r.koPts > 0 ? "incl. knockout" : anyLive ? "projected" : `/ ${GROUP_TOTAL_MAX} pts`}
                    </div>
                    {r.maxKoRemaining > 0 && (
                      <div style={{ color: "var(--muted)", fontSize: 10, marginTop: 1 }}>max {r.total + r.maxKoRemaining}</div>
                    )}
                  </div>
                )}
              </button>
              {open.has(r.name) && <div style={{ borderTop: "1px solid var(--line)", padding: "10px 16px 14px" }}><PlayerBreakdown entry={r} groups={groups} tally={tally} knockout={knockout} /></div>}
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

function PlayerBreakdown({ entry, groups, tally, knockout }) {
  const entrySlug = slug(entry.name);
  const koPicks = knockout?.picksBySlug?.[entrySlug] || {};
  const koBracket = knockout?.bracket || {};
  const hasKoPicks = Object.keys(koPicks).length > 0;
  const showKo = true;
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

/* ------------------------------ spectator -------------------------------- */
function SpectatorFooter() {
  return (
    <div style={{ textAlign: "center", marginTop: 40 }}>
      <div style={{ color: "#46506b", fontSize: 11 }}>World Cup 2026 · results archived after final whistle</div>
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
function Banner({ children, icon: Icon }) { return <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 14, color: "var(--muted)" }}><Icon size={17} style={{ color: "var(--gold)", marginTop: 1, flexShrink: 0 }} /><span>{children}</span></div>; }
function Empty({ icon: Icon, title, sub }) { return <Centered><Icon size={34} style={{ color: "var(--muted)" }} /><div style={{ fontWeight: 800, fontSize: 18, marginTop: 12 }}>{title}</div><div style={{ color: "var(--muted)", marginTop: 4, maxWidth: 300 }}>{sub}</div></Centered>; }
