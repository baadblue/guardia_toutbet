import { test, expect } from "@playwright/test";

const UI_BASE = process.env.PW_UI_BASE_URL || "http://localhost:3000";
const API_BASE = process.env.PW_API_BASE_URL || "http://localhost:4000";

const LOGIN_PASSWORD = process.env.PW_TEST_LOGIN_PASSWORD || "Azertyuiop1";

function uniqueEmail(prefix = "user") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@exemple.com`;
}

async function getAuthFromLocalStorage(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("toutbet_auth");
    return raw ? JSON.parse(raw) : null;
  });
}

async function apiRegister(page, { email, name, password }) {
  const res = await page.request.post(`${API_BASE}/auth/register`, {
    headers: { "Content-Type": "application/json" },
    data: { email, name, password },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

async function apiCreateBet(page, { token, title, minStake, invitedEmails }) {
  const res = await page.request.post(`${API_BASE}/bets`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: {
      title,
      minStake,
      visibility: "PRIVATE",
      invitedEmails,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

async function apiPlaceWager(page, { token, betId, amount }) {
  return page.request.post(`${API_BASE}/bets/${betId}/wagers`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { amount },
  });
}

async function apiCloseBet(page, { token, betId, winnerUserIds }) {
  return page.request.post(`${API_BASE}/bets/${betId}/close`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { winnerUserIds },
  });
}

test.describe("Automatisation des 10 Abuse Stories", () => {
  test.beforeEach(async ({ page }) => {
    const auth = await apiRegister(page, {
      email: uniqueEmail("seed"),
      name: "Seed User",
      password: LOGIN_PASSWORD,
    });

    await page.goto(`${UI_BASE}/login`);
    await page.evaluate((authPayload) => {
      localStorage.setItem("toutbet_auth", JSON.stringify(authPayload));
    }, auth);
  });

  // AS 1 : XSS dans le titre
  test("AS 1 - Protection contre injection XSS dans le titre", async ({ page }) => {
    const auth = await getAuthFromLocalStorage(page);
    expect(auth?.token).toBeTruthy();

    const payload = '<script>document.cookie="stolen=true"</script>';
    const bet = await apiCreateBet(page, {
      token: auth.token,
      title: payload,
      minStake: 5,
      invitedEmails: [auth.user.email],
    });

    // On ne doit jamais conserver une balise script dans le titre.
    expect(String(bet.title)).not.toContain("<script>");
    expect(String(bet.title)).not.toContain("</script>");
  });

  // AS 2 : Contournement mise minimum (API)
  test("AS 2 - Validation de la mise minimum (API)", async ({ page }) => {
    const auth = await getAuthFromLocalStorage(page);
    const bet = await apiCreateBet(page, {
      token: auth.token,
      title: "Bet min stake",
      minStake: 5,
      invitedEmails: [auth.user.email],
    });

    const res = await apiPlaceWager(page, {
      token: auth.token,
      betId: bet.id,
      amount: 0.01,
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Le montant de la mise est inférieur à la mise minimale requise.");
  });

  // AS 3 : Accès restreint à un pari PRIVATE (non invité)
  test("AS 3 - Protection accès privé sans invitation", async ({ page }) => {
    const auth = await getAuthFromLocalStorage(page);
    const bet = await apiCreateBet(page, {
      token: auth.token,
      title: "Private bet",
      minStake: 5,
      invitedEmails: [auth.user.email],
    });

    const user2 = await apiRegister(page, {
      email: uniqueEmail("user2"),
      name: "User2",
      password: LOGIN_PASSWORD,
    });

    const res = await apiPlaceWager(page, {
      token: user2.token,
      betId: bet.id,
      amount: 10,
    });

    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Vous n’êtes pas autorisé à miser sur ce pari.");
  });

  // AS 4 : Mise négative
  test("AS 4 - Rejet d'une mise négative", async ({ page }) => {
    const auth = await getAuthFromLocalStorage(page);
    const bet = await apiCreateBet(page, {
      token: auth.token,
      title: "Negative wager",
      minStake: 5,
      invitedEmails: [auth.user.email],
    });

    const res = await apiPlaceWager(page, {
      token: auth.token,
      betId: bet.id,
      amount: -100,
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Les données envoyées ne sont pas valides.");
  });

  // AS 5 : IDOR sur participants (accès uniquement bookie)
  test("AS 5 - Accès restreint aux participants (IDOR)", async ({ page }) => {
    const auth = await getAuthFromLocalStorage(page);
    const bet = await apiCreateBet(page, {
      token: auth.token,
      title: "Participants list",
      minStake: 5,
      invitedEmails: [auth.user.email],
    });

    const user2 = await apiRegister(page, {
      email: uniqueEmail("user3"),
      name: "User3",
      password: LOGIN_PASSWORD,
    });

    const res = await page.request.get(`${API_BASE}/bets/${bet.id}/participants`, {
      headers: { Authorization: `Bearer ${user2.token}` },
    });

    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Seul le créateur du pari peut voir les participants.");
  });

  // AS 6 : Interception (HSTS/HTTPS) - non applicable à l'app actuelle
  test.skip("AS 6 - Sécurité du transport (HSTS/HTTPS)", async () => {});

  // AS 7 : Intégrité de la clôture (validation Zod des winners)
  test("AS 7 - Validation des droits de clôture via winners (Zod)", async ({ page }) => {
    const auth = await getAuthFromLocalStorage(page);
    const bet = await apiCreateBet(page, {
      token: auth.token,
      title: "Close validation",
      minStake: 5,
      invitedEmails: [auth.user.email],
    });

    const res = await apiCloseBet(page, {
      token: auth.token,
      betId: bet.id,
      winnerUserIds: ["not-a-uuid"],
    });

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Les données envoyées ne sont pas valides.");
  });

  // AS 8 : Usurpation identité au retrait (wallet withdraw sans JWT)
  test("AS 8 - Vérification de session au retrait", async ({ page }) => {
    const res = await page.request.post(`${API_BASE}/api/wallet/withdraw`, {
      headers: { "Content-Type": "application/json" },
      data: { amount: 10 },
    });

    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("En-tête d’authentification manquant ou invalide.");
  });

  // AS 9 : Droits de clôture de pari
  test("AS 9 - Validation des droits de clôture de pari", async ({ page }) => {
    const auth = await getAuthFromLocalStorage(page);
    const bet = await apiCreateBet(page, {
      token: auth.token,
      title: "Close rights",
      minStake: 5,
      invitedEmails: [auth.user.email],
    });

    const user2 = await apiRegister(page, {
      email: uniqueEmail("user4"),
      name: "User4",
      password: LOGIN_PASSWORD,
    });

    const res = await apiCloseBet(page, {
      token: user2.token,
      betId: bet.id,
      winnerUserIds: [user2.user.id],
    });

    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Seul le créateur du pari peut le clôturer.");
  });

  // AS 10 : DoS sur authentification
  test("AS 10 - Rate Limiting sur authentification", async ({ page }) => {
    const email = `ratelimit_${Date.now()}@exemple.com`;
    const password = "WrongPass1";

    // La limite est à 5 requêtes par fenêtre (rateLimiter max: 5)
    for (let i = 0; i < 6; i++) {
      await page.request.post(`${API_BASE}/auth/login`, {
        headers: { "Content-Type": "application/json" },
        data: { email, password },
      });
    }

    const lastResponse = await page.request.post(`${API_BASE}/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email, password },
    });

    expect(lastResponse.status()).toBe(429);
  });
});