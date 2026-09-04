import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, Fill, Match, Payment, Player, StringResult } from "../api";
import { fireConfetti } from "../lib/confetti";
import { useCountUp } from "../hooks/useCountUp";
import BowlingHero from "../components/BowlingHero";
import BowlingLoader from "../components/BowlingLoader";
import SeasonSelect from "../components/SeasonSelect";

const STRINGS: (1 | 2 | 3)[] = [1, 2, 3];

const emptyForm = {
  playerId: "",
  stringNumber: 1 as 1 | 2 | 3,
  score: "",
  strikes: "",
  spares: "",
  tens: "",
  orangePinsLeft: "",
  amountPaid: "",
};

export default function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [match, setMatch] = useState<Match | null>(null);
  const [results, setResults] = useState<StringResult[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [fills, setFills] = useState<Fill[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ date: "", opponent: "", week: "", season: "" });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingResultKey, setConfirmingResultKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Set while the "Log a string result" form is pre-filled from an existing
  // result rather than starting blank — lets the same form double as an
  // editor (submitting the same player+string upserts, so no separate
  // update endpoint is needed), and lets the UI say "Update" instead of
  // "Save" and offer a way back out to a blank form.
  const [editingResultKey, setEditingResultKey] = useState<string | null>(null);

  const [confirmingPaymentKey, setConfirmingPaymentKey] = useState<string | null>(null);

  const [fillPlayerId, setFillPlayerId] = useState("");
  const [fillStringNumber, setFillStringNumber] = useState<1 | 2 | 3>(1);
  const [fillType, setFillType] = useState<"strike" | "spare">("strike");
  const [fillPins, setFillPins] = useState("");
  const [confirmingFillKey, setConfirmingFillKey] = useState<string | null>(null);

  function load() {
    if (!matchId) return;
    api
      .getMatch(matchId)
      .then(({ match, results, payments, fills }) => {
        setMatch(match);
        setResults(results as StringResult[]);
        setPayments((payments ?? []) as Payment[]);
        setFills((fills ?? []) as Fill[]);
      })
      .catch((e) => setError(String(e)));
  }

  useEffect(load, [matchId]);
  useEffect(() => {
    api.listPlayers().then(setPlayers).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    if (match) {
      setEditForm({ date: match.date, opponent: match.opponent, week: String(match.week), season: match.season });
    }
  }, [match]);

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchId) return;
    setBusy(true);
    try {
      await api.updateMatch(matchId, {
        date: editForm.date,
        opponent: editForm.opponent,
        week: Number(editForm.week),
        season: editForm.season,
      });
      setEditing(false);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMatch() {
    if (!matchId) return;
    setBusy(true);
    try {
      await api.deleteMatch(matchId);
      navigate("/");
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  async function handleDeleteResult(playerId: string, stringNumber: 1 | 2 | 3) {
    if (!matchId) return;
    setBusy(true);
    try {
      await api.deleteResult(matchId, playerId, stringNumber);
      setConfirmingResultKey(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchId || !form.playerId) return;

    const strikes = Number(form.strikes);
    const tens = Number(form.tens);
    const wasEditing = editingResultKey !== null;

    await api.submitResult(matchId, {
      playerId: form.playerId,
      stringNumber: form.stringNumber,
      score: Number(form.score),
      strikes,
      spares: Number(form.spares),
      tens,
      orangePinsLeft: Number(form.orangePinsLeft),
    });

    // Amount paid is per bowler per string — only log it when this
    // submission actually has a value, so re-saving a result you're editing
    // (or logging a different string) doesn't require re-entering it.
    if (form.amountPaid !== "") {
      await api.submitPayment(matchId, form.playerId, form.stringNumber, Number(form.amountPaid));
    }

    // Celebrate a strike or a ten getting logged — but not when just editing
    // an existing result's other fields (e.g. fixing orange pins left)
    // without actually adding a new strike/ten in this edit.
    if (!wasEditing && (strikes > 0 || tens > 0)) {
      fireConfetti();
    }

    setForm({ ...emptyForm, playerId: form.playerId, stringNumber: form.stringNumber });
    setEditingResultKey(null);
    load();
  }

  // Pre-fills the log-result form from an existing result (and its matching
  // per-string payment, if any) so editing is just "change a value, hit
  // save" — submitResult upserts by (matchId, playerId, stringNumber), so
  // resubmitting the same trio overwrites in place rather than creating a
  // duplicate.
  function handleStartEditResult(r: StringResult) {
    const key = `${r.playerId}-${r.stringNumber}`;
    const existingPayment = payments.find(
      (p) => p.playerId === r.playerId && p.stringNumber === r.stringNumber
    );
    setForm({
      playerId: r.playerId,
      stringNumber: r.stringNumber,
      score: String(r.score),
      strikes: String(r.strikes),
      spares: String(r.spares),
      tens: String(r.tens),
      orangePinsLeft: String(r.orangePinsLeft),
      amountPaid: existingPayment ? String(existingPayment.amountPaid) : "",
    });
    setEditingResultKey(key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEditResult() {
    setForm({ ...emptyForm, playerId: form.playerId });
    setEditingResultKey(null);
  }

  async function handleDeletePayment(playerId: string, stringNumber?: 1 | 2 | 3) {
    if (!matchId) return;
    setBusy(true);
    try {
      await api.deletePayment(matchId, playerId, stringNumber);
      setConfirmingPaymentKey(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitFill(e: React.FormEvent) {
    e.preventDefault();
    if (!matchId || !fillPlayerId || fillPins === "") return;
    await api.submitFill(matchId, {
      playerId: fillPlayerId,
      stringNumber: fillStringNumber,
      fillType,
      pins: Number(fillPins),
    });
    setFillPins("");
    load();
  }

  async function handleDeleteFill(playerId: string, fillId: string) {
    if (!matchId) return;
    setBusy(true);
    try {
      await api.deleteFill(matchId, playerId, fillId);
      setConfirmingFillKey(null);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const playerName = (id: string) => players.find((p) => p.playerId === id)?.name ?? id;

  if (error) return <p className="error">{error}</p>;
  if (!match) return <BowlingLoader label="Loading match…" />;

  const sortedResults = [...results].sort(
    (a, b) => a.playerId.localeCompare(b.playerId) || a.stringNumber - b.stringNumber
  );

  // Week-level totals across every bowler logged so far for this match.
  const weekTotals = {
    totalPaid: payments.reduce((sum, p) => sum + p.amountPaid, 0),
    totalStrikes: results.reduce((sum, r) => sum + r.strikes, 0),
    totalSpares: results.reduce((sum, r) => sum + r.spares, 0),
    totalOrangePinsLeft: results.reduce((sum, r) => sum + r.orangePinsLeft, 0),
  };

  // One row per bowler, broken down by string, for the payments table below.
  // `legacy` catches the handful of payments logged before payments were
  // per-string (no stringNumber) — folded into their own column only when
  // at least one actually shows up, so the common case doesn't carry a
  // permanent empty "Other" column.
  const hasLegacyPayments = payments.some((p) => p.stringNumber === undefined);
  const paymentRows = [...new Set(payments.map((p) => p.playerId))]
    .sort((a, b) => playerName(a).localeCompare(playerName(b)))
    .map((playerId) => {
      const playerPayments = payments.filter((p) => p.playerId === playerId);
      const byString = (s: 1 | 2 | 3) => playerPayments.find((p) => p.stringNumber === s);
      const legacy = playerPayments.filter((p) => p.stringNumber === undefined);
      const total = playerPayments.reduce((sum, p) => sum + p.amountPaid, 0);
      return { playerId, byString, legacy, total };
    });

  return (
    <div>
      <BowlingHero title={`Week ${match.week}`} subtitle={`vs ${match.opponent}`} compact />

      {editing ? (
        <form className="card" onSubmit={handleSaveEdit}>
          <h2>✏️ Edit match</h2>
          <SeasonSelect
            value={editForm.season}
            onChange={(s) => setEditForm({ ...editForm, season: s ?? "" })}
            allowCareer={false}
            label="Season"
          />
          <div className="form-row">
            <label>
              Week
              <input
                type="number"
                min={1}
                value={editForm.week}
                onChange={(e) => setEditForm({ ...editForm, week: e.target.value })}
                required
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                required
              />
            </label>
            <label>
              Opponent
              <input
                type="text"
                value={editForm.opponent}
                onChange={(e) => setEditForm({ ...editForm, opponent: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="button-row">
            <button type="submit" disabled={busy}>
              Save changes
            </button>
            <button type="button" className="ghost-button" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="page-title-row" style={{ marginTop: "-0.75rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            {match.date} · {match.season}
          </p>
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete match
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div className="card confirm-card">
          <p>
            Delete week {match.week} vs {match.opponent}? This permanently deletes{" "}
            <strong>{results.length} logged result{results.length === 1 ? "" : "s"}</strong> for this match too.
            This can't be undone.
          </p>
          <div className="button-row">
            <button type="button" className="danger-button" onClick={handleDeleteMatch} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete it"}
            </button>
            <button type="button" className="ghost-button" onClick={() => setConfirmingDelete(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="stat-grid" style={{ marginTop: "0.5rem", marginBottom: "1.75rem" }}>
          <Stat label="Total paid" value={weekTotals.totalPaid} decimals={2} prefix="$" />
          <Stat label="Total strikes" value={weekTotals.totalStrikes} />
          <Stat label="Total spares" value={weekTotals.totalSpares} />
          <Stat label="Total orange pins" value={weekTotals.totalOrangePinsLeft} />
        </div>
      )}

      <form className="card" onSubmit={handleSubmit}>
        <h2>🎳 {editingResultKey ? "Edit string result" : "Log a string result"}</h2>
        {editingResultKey && (
          <p className="muted" style={{ marginTop: "-0.4rem" }}>
            Editing <strong>{playerName(form.playerId)}</strong>'s string {form.stringNumber} — change any
            values and save to update it, or{" "}
            <button
              type="button"
              className="ghost-button"
              style={{ padding: "0.1rem 0.5rem", fontSize: "0.85em" }}
              onClick={handleCancelEditResult}
            >
              cancel
            </button>
            .
          </p>
        )}
        <div className="form-row">
          <label>
            Bowler
            <select
              value={form.playerId}
              onChange={(e) => setForm({ ...form, playerId: e.target.value })}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            String
            <select
              value={form.stringNumber}
              onChange={(e) => setForm({ ...form, stringNumber: Number(e.target.value) as 1 | 2 | 3 })}
            >
              {STRINGS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Score
            <input
              type="number"
              min={0}
              value={form.score}
              onChange={(e) => setForm({ ...form, score: e.target.value })}
              required
            />
          </label>
          <label>
            Strikes
            <input
              type="number"
              min={0}
              value={form.strikes}
              onChange={(e) => setForm({ ...form, strikes: e.target.value })}
              required
            />
          </label>
          <label>
            Spares
            <input
              type="number"
              min={0}
              value={form.spares}
              onChange={(e) => setForm({ ...form, spares: e.target.value })}
              required
            />
          </label>
          <label>
            Tens
            <input
              type="number"
              min={0}
              value={form.tens}
              onChange={(e) => setForm({ ...form, tens: e.target.value })}
              required
            />
          </label>
          <label>
            Orange pins left
            <input
              type="number"
              min={0}
              value={form.orangePinsLeft}
              onChange={(e) => setForm({ ...form, orangePinsLeft: e.target.value })}
              required
            />
          </label>
          <label>
            Amount paid ($)
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="optional"
              value={form.amountPaid}
              onChange={(e) => setForm({ ...form, amountPaid: e.target.value })}
            />
          </label>
        </div>
        <button type="submit">{editingResultKey ? "Update result ✏️" : "Save result 🎉"}</button>
        <p className="muted" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
          Amount paid is per bowler per string — leave it blank to skip logging a payment for this
          string. Logging it again for the same string overwrites that string's amount (it won't touch
          the other two strings).
        </p>
      </form>

      <h2 style={{ marginTop: "2rem" }}>Results so far</h2>

      {sortedResults.length === 0 ? (
        <p className="empty-state">No results logged yet for this match.</p>
      ) : (
        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Bowler</th>
                <th>String</th>
                <th>Score</th>
                <th>Marks</th>
                <th>Orange left</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((r) => {
                const key = `${r.playerId}-${r.stringNumber}`;
                const confirming = confirmingResultKey === key;
                return (
                  <tr key={key}>
                    <td>{playerName(r.playerId)}</td>
                    <td>{r.stringNumber}</td>
                    <td>
                      <strong>{r.score}</strong>
                    </td>
                    <td>
                      {r.strikes > 0 && <span className="badge strike">🔥 {r.strikes}X</span>}{" "}
                      {r.spares > 0 && <span className="badge spare">／ {r.spares}</span>}{" "}
                      {r.tens > 0 && <span className="badge ten">💯 {r.tens}</span>}
                      {r.strikes === 0 && r.spares === 0 && r.tens === 0 && (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{r.orangePinsLeft}</td>
                    <td>
                      {confirming ? (
                        <span className="row-confirm">
                          <button
                            type="button"
                            className="danger-button row-action"
                            disabled={busy}
                            onClick={() => handleDeleteResult(r.playerId, r.stringNumber)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="ghost-button row-action"
                            disabled={busy}
                            onClick={() => setConfirmingResultKey(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="row-confirm">
                          <button
                            type="button"
                            className="ghost-button row-action"
                            onClick={() => handleStartEditResult(r)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ghost-button row-action"
                            onClick={() => setConfirmingResultKey(key)}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: "2rem" }}>Payments so far</h2>

      {payments.length === 0 ? (
        <p className="empty-state">No payments logged yet for this match.</p>
      ) : (
        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Bowler</th>
                <th>String 1</th>
                <th>String 2</th>
                <th>String 3</th>
                {hasLegacyPayments && <th>Other</th>}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((row) => (
                <tr key={row.playerId}>
                  <td>{playerName(row.playerId)}</td>
                  {STRINGS.map((s) => (
                    <td key={s}>
                      <PaymentCell
                        payment={row.byString(s)}
                        confirming={confirmingPaymentKey === `${row.playerId}-${s}`}
                        busy={busy}
                        onDeleteClick={() => setConfirmingPaymentKey(`${row.playerId}-${s}`)}
                        onConfirm={() => handleDeletePayment(row.playerId, s)}
                        onCancel={() => setConfirmingPaymentKey(null)}
                      />
                    </td>
                  ))}
                  {hasLegacyPayments && (
                    <td>
                      {row.legacy.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        row.legacy.map((p, i) => (
                          <PaymentCell
                            key={i}
                            payment={p}
                            confirming={confirmingPaymentKey === `${row.playerId}-legacy`}
                            busy={busy}
                            onDeleteClick={() => setConfirmingPaymentKey(`${row.playerId}-legacy`)}
                            onConfirm={() => handleDeletePayment(row.playerId)}
                            onCancel={() => setConfirmingPaymentKey(null)}
                          />
                        ))
                      )}
                    </td>
                  )}
                  <td>
                    <strong>${row.total.toFixed(2)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="card" onSubmit={handleSubmitFill} style={{ marginTop: "2rem" }}>
        <h2>🎯 Log a fill</h2>
        <div className="form-row">
          <label>
            Bowler
            <select
              value={fillPlayerId}
              onChange={(e) => setFillPlayerId(e.target.value)}
              required
            >
              <option value="" disabled>
                Select…
              </option>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            String
            <select
              value={fillStringNumber}
              onChange={(e) => setFillStringNumber(Number(e.target.value) as 1 | 2 | 3)}
            >
              {STRINGS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            After a
            <select value={fillType} onChange={(e) => setFillType(e.target.value as "strike" | "spare")}>
              <option value="strike">Strike</option>
              <option value="spare">Spare</option>
            </select>
          </label>
          <label>
            Pins on the fill
            <input
              type="number"
              min={0}
              max={fillType === "spare" ? 10 : undefined}
              value={fillPins}
              onChange={(e) => setFillPins(e.target.value)}
              required
            />
          </label>
        </div>
        <button type="submit">Save fill</button>
        <p className="muted" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
          Log one fill per mark — two strikes in a string means two strike fills.
        </p>
      </form>

      <h2 style={{ marginTop: "2rem" }}>Fills so far</h2>

      {fills.length === 0 ? (
        <p className="empty-state">No fills logged yet for this match.</p>
      ) : (
        <div className="table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Bowler</th>
                <th>String</th>
                <th>After a</th>
                <th>Pins</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...fills]
                .sort(
                  (a, b) =>
                    playerName(a.playerId).localeCompare(playerName(b.playerId)) || a.stringNumber - b.stringNumber
                )
                .map((f) => {
                  const confirming = confirmingFillKey === f.fillId;
                  return (
                    <tr key={f.fillId}>
                      <td>{playerName(f.playerId)}</td>
                      <td>{f.stringNumber}</td>
                      <td>
                        <span className={`badge ${f.fillType}`}>
                          {f.fillType === "strike" ? "🔥 Strike" : "／ Spare"}
                        </span>
                      </td>
                      <td>
                        <strong>{f.pins}</strong>
                      </td>
                      <td>
                        {confirming ? (
                          <span className="row-confirm">
                            <button
                              type="button"
                              className="danger-button row-action"
                              disabled={busy}
                              onClick={() => handleDeleteFill(f.playerId, f.fillId)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="ghost-button row-action"
                              disabled={busy}
                              onClick={() => setConfirmingFillKey(null)}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="ghost-button row-action"
                            onClick={() => setConfirmingFillKey(f.fillId)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Renders one string's payment amount + delete/confirm controls inside a
// payments-table cell (the caller supplies the <td> — this is just the
// content, so it can also be reused for the "Other"/legacy column).
function PaymentCell({
  payment,
  confirming,
  busy,
  onDeleteClick,
  onConfirm,
  onCancel,
}: {
  payment: Payment | undefined;
  confirming: boolean;
  busy: boolean;
  onDeleteClick: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!payment) return <span className="muted">—</span>;

  if (confirming) {
    return (
      <span className="row-confirm">
        <strong>${payment.amountPaid.toFixed(2)}</strong>
        <button type="button" className="danger-button row-action" disabled={busy} onClick={onConfirm}>
          Confirm
        </button>
        <button type="button" className="ghost-button row-action" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="row-confirm">
      <strong>${payment.amountPaid.toFixed(2)}</strong>
      <button type="button" className="ghost-button row-action" onClick={onDeleteClick}>
        Delete
      </button>
    </span>
  );
}

function Stat({
  label,
  value,
  decimals = 0,
  prefix = "",
}: {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
}) {
  const animated = useCountUp(value);
  return (
    <div className="stat-tile">
      <div className="stat-value">
        {prefix}
        {animated.toFixed(decimals)}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
