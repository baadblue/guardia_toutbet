import math
import os
import random
import time
from dataclasses import dataclass
from threading import Lock

import gevent
from gevent.pool import Pool
from locust import HttpUser, between, events, task, tag


DEFAULT_PASSWORD = os.getenv("LOCUST_DEFAULT_PASSWORD", "Azertyuiop1")
INITIAL_BALANCE = float(os.getenv("LOCUST_INITIAL_BALANCE", "100"))
MIN_STAKE = float(os.getenv("LOCUST_MIN_STAKE", "5"))
WAGER_AMOUNT = float(os.getenv("LOCUST_WAGER_AMOUNT", "10"))
BETTORS_COUNT = int(os.getenv("LOCUST_BETTORS_COUNT", "50"))
SAME_USER_CONCURRENCY = int(os.getenv("LOCUST_SAME_USER_CONCURRENCY", "20"))


@dataclass
class UserCred:
    email: str
    token: str
    user_id: str


class SharedState:
    def __init__(self):
        self.lock = Lock()
        self.initialized = False
        self.setup_error = None

        self.bookie = None
        self.bettor_bet_id = None
        self.bettors = []
        self.bettor_cursor = 0

        self.burst_user = None
        self.burst_bet_id = None

        self.overspend_detected = False
        self.overspend_notes = []


STATE = SharedState()


def _unique_email(prefix: str) -> str:
    return f"{prefix}_{int(time.time() * 1000)}_{random.randint(1000, 9999)}@exemple.com"


def _extract_json(response):
    try:
        return response.json()
    except Exception:
        return {}


def _register(client, email: str, name: str, password: str = DEFAULT_PASSWORD) -> UserCred:
    with client.post(
        "/auth/register",
        json={"email": email, "name": name, "password": password},
        name="POST /auth/register (setup)",
        catch_response=True,
    ) as res:
        if res.status_code not in (200, 201):
            res.failure(f"register failed [{res.status_code}] {res.text}")
            raise RuntimeError("register failed")
        payload = _extract_json(res)
        token = payload.get("token")
        user = payload.get("user") or {}
        user_id = user.get("id")
        if not token or not user_id:
            res.failure("register response missing token or user.id")
            raise RuntimeError("invalid register payload")
        res.success()
        return UserCred(email=email, token=token, user_id=user_id)


def _deposit(client, token: str, amount: float, name_suffix: str):
    with client.post(
        "/api/wallet/deposit",
        json={"amount": amount},
        headers={"Authorization": f"Bearer {token}"},
        name=f"POST /api/wallet/deposit {name_suffix}",
        catch_response=True,
    ) as res:
        if res.status_code not in (200, 201):
            res.failure(f"deposit failed [{res.status_code}] {res.text}")
            raise RuntimeError("deposit failed")
        res.success()


def _create_private_bet(client, token: str, title: str, invited_emails):
    with client.post(
        "/bets",
        json={
            "title": title,
            "minStake": MIN_STAKE,
            "visibility": "PRIVATE",
            "invitedEmails": invited_emails,
        },
        headers={"Authorization": f"Bearer {token}"},
        name="POST /bets (setup)",
        catch_response=True,
    ) as res:
        if res.status_code not in (200, 201):
            res.failure(f"create bet failed [{res.status_code}] {res.text}")
            raise RuntimeError("create bet failed")
        payload = _extract_json(res)
        bet_id = payload.get("id")
        if not bet_id:
            res.failure("create bet response missing id")
            raise RuntimeError("invalid bet payload")
        res.success()
        return bet_id


def ensure_setup(client):
    if STATE.initialized:
        return

    with STATE.lock:
        if STATE.initialized:
            return

        try:
            # Bookie + scenario 1 setup: many different bettors on one common event.
            STATE.bookie = _register(client, _unique_email("bookie"), "Bookie")

            bettors = []
            for i in range(BETTORS_COUNT):
                email = _unique_email(f"bettor{i}")
                bettor = _register(client, email, f"Bettor{i}")
                _deposit(client, bettor.token, INITIAL_BALANCE, "(setup)")
                bettors.append(bettor)

            invited = [b.email for b in bettors]
            # Keep bookie invited as well for parity with app behavior.
            invited.append(STATE.bookie.email)
            STATE.bettor_bet_id = _create_private_bet(
                client,
                STATE.bookie.token,
                "Locust - Afflux parieurs",
                invited,
            )
            STATE.bettors = bettors

            # Scenario 2 setup: same user with many concurrent wagers on one event.
            STATE.burst_user = _register(client, _unique_email("burst"), "BurstUser")
            _deposit(client, STATE.burst_user.token, INITIAL_BALANCE, "(burst setup)")
            STATE.burst_bet_id = _create_private_bet(
                client,
                STATE.burst_user.token,
                "Locust - Meme user concurrent",
                [STATE.burst_user.email],
            )

            STATE.initialized = True
        except Exception as exc:
            STATE.setup_error = str(exc)
            raise


def _next_bettor():
    with STATE.lock:
        if not STATE.bettors:
            raise RuntimeError("No bettors available")
        idx = STATE.bettor_cursor % len(STATE.bettors)
        STATE.bettor_cursor += 1
        return STATE.bettors[idx]


class ManyBettorsSameEventUser(HttpUser):
    wait_time = between(0.1, 0.5)
    weight = 4

    def on_start(self):
        ensure_setup(self.client)
        self.cred = _next_bettor()

    @tag("many_bettors")
    @task
    def place_wager_on_same_event(self):
        with self.client.post(
            f"/bets/{STATE.bettor_bet_id}/wagers",
            json={"amount": WAGER_AMOUNT},
            headers={"Authorization": f"Bearer {self.cred.token}"},
            name="POST /bets/:betId/wagers many_bettors",
            catch_response=True,
        ) as res:
            if res.status_code in (200, 201):
                res.success()
                return
            if res.status_code == 400 and "Solde insuffisant" in res.text:
                # Expected once user has spent all initial balance.
                res.success()
                return
            res.failure(f"unexpected status={res.status_code} body={res.text}")


class SameUserConcurrentBurstUser(HttpUser):
    wait_time = between(2, 4)
    weight = 1

    def on_start(self):
        ensure_setup(self.client)

    @tag("same_user")
    @task
    def burst_from_same_user(self):
        expected_max_success = math.floor(INITIAL_BALANCE / WAGER_AMOUNT)

        def post_one():
            return self.client.post(
                f"/bets/{STATE.burst_bet_id}/wagers",
                json={"amount": WAGER_AMOUNT},
                headers={"Authorization": f"Bearer {STATE.burst_user.token}"},
                name="POST /bets/:betId/wagers same_user",
            )

        pool = Pool(SAME_USER_CONCURRENCY)
        jobs = [pool.spawn(post_one) for _ in range(SAME_USER_CONCURRENCY)]
        gevent.joinall(jobs)

        responses = [job.value for job in jobs]
        success_count = sum(1 for r in responses if r is not None and r.status_code in (200, 201))

        me = self.client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {STATE.burst_user.token}"},
            name="GET /auth/me same_user",
        )
        balance_now = None
        if me.status_code == 200:
            payload = _extract_json(me)
            try:
                balance_now = float(payload.get("balance"))
            except Exception:
                balance_now = None

        if success_count > expected_max_success:
            note = (
                f"RISK: success_count={success_count} > expected_max={expected_max_success} "
                f"with balance={balance_now}"
            )
            STATE.overspend_detected = True
            with STATE.lock:
                STATE.overspend_notes.append(note)
            events.request.fire(
                request_type="RISK",
                name="same_user_overspend_detected",
                response_time=0,
                response_length=0,
                exception=RuntimeError(note),
            )


@events.test_stop.add_listener
def summarize_overspend(environment, **kwargs):
    if STATE.overspend_detected:
        print("\n[SECURITY] Overspend risk detected during same_user scenario:")
        for n in STATE.overspend_notes:
            print(f" - {n}")
    else:
        print("\n[SECURITY] No overspend detected in executed window.")
