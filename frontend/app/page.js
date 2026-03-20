"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, setStoredAuth } from "./lib/auth";
import { useAuth } from "./providers";

export default function Page() {
  const { token, user, userId, userEmail, setAuth } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [betTitle, setBetTitle] = useState("");
  const [minStake, setMinStake] = useState(10);
  const [invitedEmails, setInvitedEmails] = useState("");
  const [betVisibility, setBetVisibility] = useState("PRIVATE");

  const [createdBets, setCreatedBets] = useState([]);
  const [invitedBets, setInvitedBets] = useState([]);
  const [wagerOpenForBetId, setWagerOpenForBetId] = useState("");
  const [wagerAmount, setWagerAmount] = useState(25);

  const [lastBet, setLastBet] = useState(null);
  const [lastTx, setLastTx] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txOffset, setTxOffset] = useState(0);
  const txLimit = 10;

  const [closingBetId, setClosingBetId] = useState("");
  const [closingParticipants, setClosingParticipants] = useState([]);
  const [selectedWinners, setSelectedWinners] = useState(new Set());

  useEffect(() => {
    if (!token) {
      setCreatedBets([]);
      setInvitedBets([]);
      setTransactions([]);
      setTxTotal(0);
      setTxOffset(0);
      setLastBet(null);
      setLastTx(null);
      setClosingBetId("");
      setClosingParticipants([]);
      setSelectedWinners(new Set());
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [mine, invited, tx] = await Promise.all([
          apiFetch("/bets/mine", { token }),
          apiFetch("/bets/invited", { token }),
          apiFetch(`/api/transactions?limit=${txLimit}&offset=0`, { token }),
        ]);
        if (cancelled) return;
        setCreatedBets(Array.isArray(mine) ? mine : []);
        setInvitedBets(Array.isArray(invited) ? invited : []);
        if (tx && Array.isArray(tx.transactions)) {
          setTransactions(tx.transactions);
          setTxTotal(tx.total ?? tx.transactions.length);
          setTxOffset(tx.offset ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function loadTransactions(offset) {
    if (!token) return;
    setLoading(true);
    try {
      const tx = await apiFetch(`/api/transactions?limit=${txLimit}&offset=${offset}`, { token });
      if (tx && Array.isArray(tx.transactions)) {
        setTransactions(tx.transactions);
        setTxTotal(tx.total ?? tx.transactions.length);
        setTxOffset(tx.offset ?? offset);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onCreateBet(e) {
    e.preventDefault();
    setError("");
    setOk("");
    setLoading(true);
    try {
      const normalizedInvites =
        betVisibility === "PRIVATE"
          ? invitedEmails
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
          : [];

      const data = await apiFetch("/bets", {
        token,
        method: "POST",
        body: {
          title: betTitle,
          minStake: Number(minStake),
          visibility: betVisibility,
          invitedEmails: normalizedInvites,
        },
      });

      setLastBet(data);
      setOk("Pari créé.");

      setCreatedBets((prev) => [
        {
          id: data.id,
          title: data.title,
          minStake: data.minStake,
          status: data.status,
          createdAt: data.createdAt,
          invitedEmails: normalizedInvites,
          bookieId: userId,
        },
        ...prev,
      ]);

      setIsCreateOpen(false);
      setBetTitle("");
      setInvitedEmails("");
      setBetVisibility("PRIVATE");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onPlaceWager(betId) {
    setError("");
    setOk("");
    setLoading(true);
    try {
      const id = String(betId || "").trim();
      const data = await apiFetch(`/bets/${id}/wagers`, {
        token,
        method: "POST",
        body: { amount: Number(wagerAmount) },
      });

      setLastTx(data);
      setOk("Mise enregistrée.");
      setWagerOpenForBetId("");

      if (user && data?.user?.balance != null) {
        const updated = { token, user: { ...user, balance: data.user.balance } };
        setAuth(updated);
        setStoredAuth(updated);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const sortedCreatedBets = useMemo(() => {
    return [...createdBets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [createdBets]);

  const sortedInvitedBets = useMemo(() => {
    return [...invitedBets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [invitedBets]);

  async function onOpenCloseBet(betId) {
    setError("");
    setOk("");
    setClosingBetId(betId);
    setClosingParticipants([]);
    setSelectedWinners(new Set());
    setLoading(true);
    try {
      const data = await apiFetch(`/bets/${betId}/participants`, {
        token,
      });
      const list = Array.isArray(data?.participants) ? data.participants : [];
      setClosingParticipants(list);
    } catch (err) {
      setError(err.message);
      setClosingBetId("");
    } finally {
      setLoading(false);
    }
  }

  function onToggleWinner(userId) {
    setSelectedWinners((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function onConfirmCloseBet(betId) {
    setError("");
    setOk("");
    const winnerUserIds = Array.from(selectedWinners);
    if (closingParticipants.length > 0 && winnerUserIds.length === 0) {
      setError("Sélectionne au moins un gagnant avant de clôturer.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch(`/bets/${betId}/close`, {
        token,
        method: "POST",
        body: { winnerUserIds },
      });

      setCreatedBets((prev) =>
        prev.map((b) =>
          b.id === betId ? { ...b, status: data?.updatedBet?.status || "CLOSED" } : b
        )
      );

      setOk("Pari clôturé et gains redistribués.");
      setClosingBetId("");
      setClosingParticipants([]);
      setSelectedWinners(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error ? (
        <div style={{ marginTop: 16 }} className="error">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div style={{ marginTop: 16 }} className="ok">
          {ok}
        </div>
      ) : null}

      <div className="row">
        <div className="card">
          <div className="cardHeader">
            <h2>Tableau de bord</h2>
            <div className="btnRow">
              <button
                className="btn btnPrimary"
                onClick={() => setIsCreateOpen((v) => !v)}
                disabled={!token || loading}
              >
                Créer un Pari
              </button>
            </div>
          </div>
          <div className="cardBody">
            {isCreateOpen ? (
              <form onSubmit={onCreateBet} className="stack">
                <div className="field">
                  <label>Titre</label>
                  <input
                    value={betTitle}
                    onChange={(e) => setBetTitle(e.target.value)}
                    placeholder="Ex: PSG - OM"
                  />
                </div>
                <div className="field">
                  <label>Mise minimale</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minStake}
                    onChange={(e) => setMinStake(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Visibilité du pari</label>
                  <div className="btnRow">
                    <button
                      type="button"
                      className={`btn ${betVisibility === "PUBLIC" ? "btnPrimary" : ""}`}
                      onClick={() => setBetVisibility("PUBLIC")}
                      disabled={loading}
                    >
                      Pari Public (Ouvert à tous)
                    </button>
                    <button
                      type="button"
                      className={`btn ${betVisibility === "PRIVATE" ? "btnPrimary" : ""}`}
                      onClick={() => setBetVisibility("PRIVATE")}
                      disabled={loading}
                    >
                      Pari Privé (Sur invitation)
                    </button>
                  </div>
                </div>
                {betVisibility === "PRIVATE" ? (
                  <div className="field">
                    <label>Invités (emails, séparés par virgule)</label>
                    <input
                      value={invitedEmails}
                      onChange={(e) => setInvitedEmails(e.target.value)}
                      placeholder="bob@example.com, carol@example.com"
                    />
                    <div className="muted">
                      Les invitations sont vérifiées côté backend à partir des emails.
                    </div>
                  </div>
                ) : (
                  <div className="muted">
                    Aucune invitation nécessaire pour un pari public.
                  </div>
                )}
                <div className="btnRow">
                  <button className="btn btnPrimary" type="submit" disabled={loading || !token}>
                    Créer
                  </button>
                  <button className="btn" type="button" onClick={() => setIsCreateOpen(false)} disabled={loading}>
                    Annuler
                  </button>
                </div>
              </form>
            ) : null}

            {lastBet ? (
              <div className="kpi" style={{ marginTop: 12 }}>
                <span className="pill">
                  Dernier pari <strong>{lastBet.title}</strong>
                </span>
                <span className="pill">
                  Statut <strong>{lastBet.status}</strong>
                </span>
                <span className="pill">
                  Mise min <strong>{String(lastBet.minStake)}</strong>
                </span>
              </div>
            ) : null}

            <div style={{ marginTop: 14 }} className="muted">
              Astuce : si on t’a partagé un lien avec un identifiant de pari, ouvre <code>/?betId=...</code> pour
              l’ajouter ici.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h2>Historique des transactions</h2>
          </div>
          <div className="cardBody">
            {transactions.length === 0 ? (
              <div className="muted">Aucune transaction trouvée pour le moment.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Montant</th>
                    <th>Balance après</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 5).map((tx) => (
                    <tr key={tx.id}>
                      <td>#{tx.id}</td>
                      <td>{tx.type}</td>
                      <td>{String(tx.amount)}</td>
                      <td>{String(tx.balanceAfter ?? "-")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {txTotal > txLimit ? (
              <div className="btnRow" style={{ marginTop: 10 }}>
                <button
                  className="btn"
                  type="button"
                  disabled={txOffset <= 0 || loading}
                  onClick={() => loadTransactions(Math.max(txOffset - txLimit, 0))}
                >
                  Précédent
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={txOffset + txLimit >= txTotal || loading}
                  onClick={() => loadTransactions(txOffset + txLimit)}
                >
                  Suivant
                </button>
                <span className="muted">
                  {txOffset + 1}–{Math.min(txOffset + txLimit, txTotal)} sur {txTotal}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="row">
        <div className="card">
          <div className="cardHeader">
            <h2>Mes paris (créés)</h2>
          </div>
          <div className="cardBody">
            {sortedCreatedBets.length === 0 ? (
              <div className="muted">Tu n’as pas encore créé de pari via ce tableau de bord.</div>
            ) : (
              <div className="cards">
                {sortedCreatedBets.map((b) => (
                  <div key={b.id} className="betCard">
                    <div className="betCardTop">
                      <div className="betCardTitle">{b.title || "Pari"}</div>
                      <span className="pill">
                        Statut <strong>{b.status || "OPEN"}</strong>
                      </span>
                    </div>
                    <div className="betCardMeta">
                      <span className="pill">
                        Mise min <strong>{b.minStake != null ? String(b.minStake) : "—"}</strong>
                      </span>
                      <span className="pill">
                        Invités <strong>{Array.isArray(b.invitedEmails) ? String(b.invitedEmails.length) : "—"}</strong>
                      </span>
                    </div>

                    <div className="btnRow" style={{ marginTop: 12 }}>
                      <button
                        className="btn btnPrimary"
                        type="button"
                        onClick={() => onOpenCloseBet(b.id)}
                        disabled={loading || b.status === "CLOSED"}
                      >
                        Clôturer le pari
                      </button>
                    </div>

                    {closingBetId === b.id ? (
                      <div className="inlineForm">
                        {closingParticipants.length === 0 ? (
                          <>
                            <div className="muted" style={{ marginBottom: 8 }}>
                              Aucun participant n’a encore misé sur ce pari. Tu peux le clôturer sans désigner de
                              gagnant.
                            </div>
                            <div className="btnRow">
                              <button
                                className="btn btnPrimary"
                                type="button"
                                onClick={() => onConfirmCloseBet(b.id)}
                                disabled={loading}
                              >
                                Clôturer sans mise
                              </button>
                              <button
                                className="btn"
                                type="button"
                                onClick={() => {
                                  setClosingBetId("");
                                  setClosingParticipants([]);
                                  setSelectedWinners(new Set());
                                }}
                                disabled={loading}
                              >
                                Annuler
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="muted" style={{ marginBottom: 8 }}>
                              Sélectionne un ou plusieurs gagnants parmi les participants ci-dessous.
                            </div>
                            <div className="participantsList">
                              {closingParticipants.map((p) => (
                                <label key={p.userId} className="participantRow">
                                  <input
                                    type="checkbox"
                                    checked={selectedWinners.has(p.userId)}
                                    onChange={() => onToggleWinner(p.userId)}
                                  />
                                  <span className="pill">
                                    <span>{p.email}</span>
                                    <span>
                                      Mise totale: <strong>{String(p.totalStake)}</strong>
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                            <div className="btnRow" style={{ marginTop: 10 }}>
                              <button
                                className="btn btnPrimary"
                                type="button"
                                onClick={() => onConfirmCloseBet(b.id)}
                                disabled={loading || selectedWinners.size === 0}
                              >
                                Confirmer la clôture
                              </button>
                              <button
                                className="btn"
                                type="button"
                                onClick={() => {
                                  setClosingBetId("");
                                  setClosingParticipants([]);
                                  setSelectedWinners(new Set());
                                }}
                                disabled={loading}
                              >
                                Annuler
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h2>Paris où je suis invité</h2>
          </div>
          <div className="cardBody">
            {sortedInvitedBets.length === 0 ? (
              <div className="muted">Aucun pari invité dans ton tableau de bord.</div>
            ) : (
              <div className="cards">
                {sortedInvitedBets.map((b) => {
                  const emails = Array.isArray(b?.invitedEmails) ? b.invitedEmails : null;
                  const invitedByEmail = emails ? emails.includes(String(userEmail || "").toLowerCase()) : false;
                  const invitedByLink = b?.source === "inviteLink";
                  const isClosed = b.status === "CLOSED";
                  const canWager = Boolean(token) && !isClosed && (invitedByEmail || invitedByLink);
                  const isWagerOpen = wagerOpenForBetId === b.id;

                  return (
                    <div key={b.id} className="betCard">
                      <div className="betCardTop">
                        <div className="betCardTitle">{b.title || "Pari invité"}</div>
                        <span className="pill">
                          Statut <strong>{b.status || "OPEN"}</strong>
                        </span>
                      </div>
                      <div className="betCardMeta">
                        <span className="pill">
                          Mise min <strong>{b.minStake != null ? String(b.minStake) : "—"}</strong>
                        </span>
                        <span className="pill">
                          Accès <strong>{invitedByEmail ? "invité" : "lien"}</strong>
                        </span>
                      </div>

                      <div className="btnRow" style={{ marginTop: 12 }}>
                        {isClosed ? null : (
                          <button
                            className="btn btnPrimary"
                            type="button"
                            onClick={() => setWagerOpenForBetId(isWagerOpen ? "" : b.id)}
                            disabled={!canWager || loading}
                          >
                            Miser
                          </button>
                        )}
                        {/* plus d’option “Retirer” côté UI pour éviter la confusion avec la clôture */}
                        {!token ? <span className="muted">Connexion requise</span> : null}
                      </div>

                      {isWagerOpen && !isClosed ? (
                        <div className="inlineForm">
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label>Montant de la mise</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={wagerAmount}
                              onChange={(e) => setWagerAmount(e.target.value)}
                              placeholder="Ex: 25"
                            />
                          </div>
                          <div className="btnRow" style={{ marginTop: 10 }}>
                            <button
                              className="btn btnPrimary"
                              type="button"
                              onClick={() => onPlaceWager(b.id)}
                              disabled={!token || loading}
                            >
                              Confirmer
                            </button>
                            <button
                              className="btn"
                              type="button"
                              onClick={() => setWagerOpenForBetId("")}
                              disabled={loading}
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

