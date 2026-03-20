# ToutBet – Backend MVP (Node.js / Express / Prisma / PostgreSQL)

## 1. Présentation

Ce dépôt contient le socle technique d'un MVP pour **ToutBet**, une application de paris entre particuliers.

- **Backend**: Node.js + Express (API REST)
- **Base de données**: PostgreSQL
- **ORM**: Prisma
- **Validation**: Zod
- **Auth**: JWT (simulé) via middleware Express

Les contrôles de sécurité sont pensés en s'inspirant de l'analyse **STRIDE** (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege).

---

## 2. Installation

### 2.1. Prérequis

- Node.js 18+ (recommandé)
- PostgreSQL en local ou accessible via réseau

### 2.1.b Interface (Frontend)

Une interface **Next.js** est disponible dans le dossier `frontend/` pour piloter le MVP (login, création de pari, mise, clôture).

### 2.2. Configuration

1. Cloner le projet (ou télécharger les sources) dans `toutbet`.
2. Créer un fichier `.env` à la racine en partant de `.env.example` :

```bash
cp .env.example .env
```

1. Adapter les variables `DATABASE_URL`, `JWT_SECRET` et `CORS_ALLOWED_ORIGINS`.

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/toutbet?schema=public"
JWT_SECRET="(colle_ici_la_sortie_base64)"
PORT=4000
CORS_ALLOWED_ORIGINS="http://localhost:3000"
```

#### Générer `JWT_SECRET`

`JWT_SECRET` sert à signer/vérifier les JWT (HMAC). Utiliser une valeur **longue et aléatoire** (au moins 32–64 octets), et ne pas mettre une simple phrase.

**PowerShell (Windows)** :

```powershell
$bytes = New-Object byte[] 64
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

**Node.js** :

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

**OpenSSL** :

```bash
openssl rand -base64 64
```

#### Politique CORS

`CORS_ALLOWED_ORIGINS` doit contenir une liste d'origines frontend autorisees (separees par des virgules), par exemple :

```bash
CORS_ALLOWED_ORIGINS="http://localhost:3000,https://app.toutbet.com"
```

Règles de sécurité appliquées par le backend :

- `*` est interdit.
- Seules les origines présentes dans `CORS_ALLOWED_ORIGINS` sont autorisées.

Bonne pratique de déploiement :

- En dev, utiliser `http://localhost:3000`.
- En production, renseigner uniquement le ou les domaines frontend publics (ex: `https://app.toutbet.com`).

### 2.3. Installation des dépendances

```bash
npm install
```

### 2.4. Initialisation de la base

Tu peux lancer PostgreSQL via Docker (recommandé). Deux approches possibles :

#### Option A — Docker Compose (recommandé)

```bash
docker compose up -d
```

Le fichier `docker-compose.yml` est fourni à la racine du projet (dossier `toutbet/`).

Commandes utiles :

```bash
docker compose logs -f postgres
docker compose down
```

#### Option B — `docker run` (rapide)

Linux/macOS (bash) :

```bash
docker run --name toutbet-postgres \
  -e POSTGRES_USER=toutbet \
  -e POSTGRES_PASSWORD=toutbet \
  -e POSTGRES_DB=toutbet \
  -p 5432:5432 \
  -v toutbet_pgdata:/var/lib/postgresql/data \
  -d postgres:16
```

Windows (PowerShell) :

```powershell
docker run --name toutbet-postgres `
  -e POSTGRES_USER=toutbet `
  -e POSTGRES_PASSWORD=toutbet `
  -e POSTGRES_DB=toutbet `
  -p 5432:5432 `
  -v toutbet_pgdata:/var/lib/postgresql/data `
  -d postgres:16
```

#### Configurer l’URL et appliquer les migrations

1. Mettre à jour `DATABASE_URL` dans `.env` :

```bash
DATABASE_URL="postgresql://toutbet:toutbet@localhost:5432/toutbet?schema=public"
```

2. Appliquer les migrations Prisma (création des tables) :

```bash
npx prisma migrate dev --name init
```

Si tu relances le projet plus tard, tu peux simplement redémarrer le conteneur :

```bash
docker start toutbet-postgres
```

Pour arrêter le conteneur :

```bash
docker stop toutbet-postgres
```

Optionnel : ouvrir Prisma Studio

```bash
npx prisma studio
```

### 2.5. Lancement du serveur

```bash
npm run dev
```

L'API sera disponible sur `http://localhost:4000`.

### 2.6. Lancer le frontend Next.js

Dans un 2ᵉ terminal :

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Le frontend sera disponible sur `http://localhost:3000` et consomme l’API via `NEXT_PUBLIC_API_BASE_URL`.

### 2.7. Tests automatisés

Le projet inclut deux types de tests:

- **Playwright (E2E securite / Abuse Stories)**
- **Locust (charge et concurrence)**

#### Playwright

Depuis la racine du projet:

```bash
npx playwright test
```

Pour executer uniquement la suite Abuse Stories:

```bash
npx playwright test tests/playwright/as.spec.js
```

Documentation detaillee: `tests/playwright/README.md`.

#### Locust

Depuis la racine du projet:

```bash
locust -f tests/locust/locustfile.py --host http://localhost:4000
```

Puis ouvrir `http://localhost:8089`.

Documentation detaillee: `tests/locust/README.md`.

---

## 3. Schéma Prisma (modèles principaux)

Les modèles sont définis dans `prisma/schema.prisma` :

- `User` : utilisateur avec un solde (`balance`), identifié par un **UUID** (`id: String @id @default(uuid())`).
  - `isVerified` (Boolean, par défaut `false`) : nécessaire pour participer aux paris `PUBLIC`.
- `Bet` : pari créé par un **Bookie** (créateur), avec :
  - `title`
  - `minStake` (mise minimale)
  - `status` (OPEN / CLOSED)
  - `visibility` (`PRIVATE` / `PUBLIC`, par défaut `PRIVATE`)
  - relation vers `BetInvitation` (invitations par email)
- `BetInvitation` : email invité à un pari :
  - `id` (UUID)
  - `betId` (UUID vers `Bet`)
  - `email`
  - `status` (`PENDING` par défaut)
- `Transaction` : enregistre chaque mouvement d'argent :
  - `type` : `STAKE`, `PAYOUT`, `COMMISSION`, `DEPOSIT`, `WITHDRAW`
  - `amount`
  - `balanceAfter` (solde après transaction)
- `AuditLog` : journal d'audit pour **non-répudiation** :
  - `action`
  - `userId`, `betId`, `transactionId` (UUID)
  - `timestamp` (non modifiable)
  - `metadata` (JSON avec détails)

Les accès CRUD directs à `Transaction` et `AuditLog` sont restreints par le code : ces tables ne sont écrites qu'au travers de la logique métier sécurisée.

---

## 4. Endpoints principaux de l'API

### 4.1. Authentification (Anti-Spoofing)

#### `POST /auth/register`

Payload :

```json
{
  "email": "alice@example.com",
  "name": "Alice",
  "password": "MotDePasse123"
}
```

Comportement :

- Vérifie qu'aucun compte n'existe déjà avec cet email.
- Hash le mot de passe avec **Argon2**.
- Crée l'utilisateur avec un **UUID** comme identifiant.
- Retourne un **JWT** signé et les infos publiques du user.

Réponse (exemple) :

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "b9f9b3e0-8f0b-4f7e-9e3f-3d5b9c4e2a10",
    "email": "alice@example.com",
    "name": "Alice",
    "balance": "0"
  }
}
```

#### `POST /auth/login`

Payload :

```json
{
  "email": "alice@example.com",
  "password": "MotDePasse123"
}
```

Comportement :

- Charge l'utilisateur via son email.
- Vérifie le mot de passe avec **Argon2**.
- En cas de succès, retourne un **JWT** signé et les infos publiques du user.

#### `GET /auth/me`

Retourne le profil de l'utilisateur courant à partir du token :

```json
{
  "id": "b9f9b3e0-8f0b-4f7e-9e3f-3d5b9c4e2a10",
  "email": "alice@example.com",
  "name": "Alice",
  "balance": "0"
}
```

Les routes sensibles (`/bets`) exigent le header :

```http
Authorization: Bearer <token>
```

---

### 4.1.b Lister les paris disponibles

#### `GET /bets`

Headers :

- `Authorization: Bearer <token>`

Retour :

- Tous les paris `PUBLIC`
- Tous les paris `PRIVATE` où l'utilisateur est invité (via `BetInvitation.email`)

Chaque pari inclut aussi :

- `participantsCount` : nombre distinct de participants (basé sur `Transaction` de type `STAKE`)

---

### 4.2. Création de pari (Bookie)

#### `POST /bets`

Headers :

- `Authorization: Bearer <token>`

Payload :

```json
{
  "title": "Match PSG - OM",
  "minStake": 10,
  "visibility": "PRIVATE",
  "invitedEmails": ["bob@example.com", "carol@example.com"]
}
```

Sécurité :

- **Anti-Tampering** : validation Zod (`title`, `minStake > 0`).
- Si `visibility === "PRIVATE"` : `invitedEmails` doit contenir au moins 1 email valide (sinon erreur).
- Si `visibility === "PUBLIC"` : `invitedEmails` peut être vide (aucune invitation n'est créée).
- Crée un enregistrement `Bet` et, si `PRIVATE`, les lignes `BetInvitation` correspondantes.
- Crée un enregistrement `AuditLog` avec action `BET_CREATED`.

---

### 4.3. Placer une mise (Parieur)

#### `POST /bets/:betId/wagers`

Headers :

- `Authorization: Bearer <token>`

Payload :

```json
{
  "amount": 25
}
```

Sécurité :

- **Anti-Tampering** :
  - `amount` doit être strictement positif (Zod) et est à nouveau vérifié dans le contrôleur (garde défensive).
  - On ne peut pas miser si le pari n'est pas `OPEN`.
- **Accès selon visibilité** :
  - Si `bet.visibility === "PRIVATE"` :
    - charge les invitations associées au pari
    - vérifie que `req.user.email` (normalisé en minuscule) est présent dans la liste des emails invités
  - Si `bet.visibility === "PUBLIC"` :
    - vérifie que `req.user.isVerified === true`
    - sinon renvoie une erreur **403** avec `error: "Compte non vérifié"` (et écriture dans `logs/security.log`)
- **Intégrité financière** :
  - Vérifie que le solde utilisateur est suffisant.
  - Utilise une transaction Prisma (`$transaction`) pour :
    - Débiter l'utilisateur (`User.balance`).
    - Créer une `Transaction` de type `STAKE`.
    - Créer un `AuditLog` (`WAGER_PLACED`) incluant solde avant/après.

---

### 4.4. Clôture du pari et redistribution

#### `POST /bets/:betId/close`

Headers :

- `Authorization: Bearer <token>` (doit être le bookie du pari)

Payload :

```json
{
  "winnerUserIds": [
    "75b4f1a0-61ec-45d8-8676-6f57396fbac5",
    "f0a47b93-1356-4eae-9c5d-7338f9ffe56f"
  ]
}
```

Logique métier :

1. Vérifie que :
  - le pari existe,
  - l'appelant est le **bookie**,
  - le pari est `OPEN`.
2. Récupère toutes les `Transaction` de type `STAKE` du pari.
3. Calcule :
  - `totalPot` = somme des mises
  - `commission` = 5% du pot
  - `distributable` = `totalPot - commission`
4. Filtre les mises des gagnants (`winnerUserIds`) et calcule
  un payout proportionnel à la mise de chacun.
5. Dans une **transaction Prisma** :
  - Met à jour `Bet.status = CLOSED`.
  - Crée une `Transaction` de type `COMMISSION`.
  - Pour chaque gagnant :
    - crédite son solde,
    - crée une `Transaction` de type `PAYOUT`,
    - crée un `AuditLog` `PAYOUT_ISSUED`.
  - Crée un `AuditLog` global `BET_CLOSED`.

Ce mécanisme assure une **redistribution automatique** des gains (avec 5% de commission prélevée).

---

### 4.5. Portefeuille (simulation)

#### `POST /api/wallet/deposit`

Headers :

- `Authorization: Bearer <token>`

Payload :

```json
{
  "amount": 100
}
```

Comportement :

- Validation stricte `amount > 0`.
- Mise à jour du solde en transaction Prisma (`$transaction`).
- Création d'une `Transaction` (`DEPOSIT`) + `AuditLog` (`WALLET_DEPOSIT`).

#### `POST /api/wallet/withdraw`

Headers :

- `Authorization: Bearer <token>`

Payload :

```json
{
  "amount": 50
}
```

Comportement :

- Validation stricte `amount > 0`.
- Vérification de solde suffisant côté serveur.
- Mise à jour atomique du solde + `Transaction` (`WITHDRAW`) + `AuditLog` (`WALLET_WITHDRAW`).

---

## 5. Logging persistant

- Le backend écrit maintenant les événements dans deux fichiers :
  - `logs/app.log` : logs applicatifs (requêtes HTTP, validations, erreurs techniques).
  - `logs/security.log` : logs sensibles (auth échouée, accès non autorisés, transactions financières).
- Chaque entrée inclut : `timestamp`, `level`, `userId` (si disponible), `ip`, et un message.

---
## 6. Sécurité – STRIDE et tests recommandés

### 6.1. Anti-Tampering (Intégrité des données)

- **Validation stricte des schémas** :
  - Utilisation de **Zod** pour toutes les entrées critiques (`createBet`, `placeWager`, `closeBet`).
  - Une mise négative ou nulle est refusée.
- **Pari non modifiable après clôture** :
  - Les mises sont refusées si `Bet.status !== OPEN`.

**Tests manuels suggérés** :

1. Appeler `POST /bets/:betId/wagers` avec `amount: -10` → doit échouer (400).
2. Fermer un pari (`/bets/:betId/close`), puis retenter de miser → doit échouer (400).

---

### 6.2. Anti-IDOR (Insecure Direct Object Reference)

- Avant d'accepter une mise, le backend vérifie que l'utilisateur a le droit d'accéder au pari selon sa visibilité :
  - Si `bet.visibility === "PRIVATE"` : l'email de `req.user.email` doit être présent dans les invitations du pari.
  - Si `bet.visibility === "PUBLIC"` : l'utilisateur doit avoir `req.user.isVerified === true`.

**Tests manuels** :

1. Créer un pari `PRIVATE` via `POST /bets` (avec `visibility: "PRIVATE"` et `invitedEmails`), puis tenter de miser avec un utilisateur dont l'email n'est pas invité.
2. Se connecter en tant qu'utilisateur non invité et appeler `POST /bets/:betId/wagers`.
3. Réponse attendue : `403` avec un message d'accès refusé (par ex. `Vous n’êtes pas autorisé à miser sur ce pari.`).
4. Créer un pari `PUBLIC`, puis se connecter avec un utilisateur `isVerified=false` et appeler `POST /bets/:betId/wagers`.
5. Réponse attendue : `403` avec `"Compte non vérifié"` et une trace dans `logs/security.log`.

---

### 6.3. Anti-Spoofing (Usurpation d'identité)

- Toutes les routes sensibles (`/bets`) sont protégées par un **middleware JWT** :
  - Lecture du header `Authorization: Bearer <token>`.
  - Vérification de la signature avec `JWT_SECRET`.
  - Chargement de l'utilisateur en base ; si l'utilisateur n'existe plus → 401.

**Tests manuels** :

1. Appeler les routes `/bets` sans header `Authorization` → 401.
2. Utiliser un token altéré (`…xxx` modifié) → 401.
3. Supprimer un user en base et réutiliser son token → 401.

---

### 6.4. Non-répudiation (Audit et traçabilité)

- Chaque transaction financière crée :
  - une ligne dans `Transaction`,
  - une ligne dans `AuditLog` avec :
    - `timestamp` auto-généré et non modifiable,
    - des métadonnées (montant, balance avant/après, etc.).
- Le code n'expose pas de route pour modifier ou supprimer les `AuditLog`.

**Tests manuels** :

1. Placer une mise, puis vérifier dans Prisma Studio les tables `Transaction` et `AuditLog`.
2. Clôturer un pari, puis vérifier :
  - un enregistrement `COMMISSION`,
  - des enregistrements `PAYOUT`,
  - plusieurs entrées `AuditLog` associées.

---

### 6.5. Injection (SQL / ORM)

- Toutes les requêtes passent par **Prisma**, qui utilise des requêtes préparées.
- On évite la construction de SQL dynamique à partir des inputs utilisateurs.

**Tests manuels** :

1. Essayer de passer des chaînes de type `"1; DROP TABLE users;"` dans les paramètres.
2. Vérifier que les requêtes échouent en validation Zod ou sont traitées comme des valeurs simples, sans exécuter de SQL arbitraire.

---

## 7. Scénario de test complet (MVP)

1. **Créer des utilisateurs** :
  - `POST /auth/login` pour `alice@example.com`, `bob@example.com`, `carol@example.com`.
  - Noter leurs `id` et `token`.
2. **Créditer manuellement les soldes** (via Prisma Studio) :
  - Donner, par exemple, 100 à Bob et Carol.
3. **Créer un pari** :
  - Se connecter en tant qu'Alice (bookie).
  - `POST /bets` avec :
    - `visibility: "PRIVATE"`
    - `invitedEmails: [bobEmail, carolEmail]`
4. **Placer des mises** :
  - Bob : `POST /bets/:betId/wagers` avec `amount: 30`.
  - Carol : `POST /bets/:betId/wagers` avec `amount: 70`.
5. **Clôturer le pari** :
  - En tant qu'Alice : `POST /bets/:betId/close` avec `winnerUserIds: [bobId, carolId]`.
6. **Vérifier les résultats** :
  - Soldes de Bob et Carol (doivent avoir été crédités proportionnellement).
  - `Transaction` et `AuditLog` dans Prisma Studio pour tracer chaque opération.

7. **Cas PUBLIC (vérification)** :
  - Créer un pari avec `visibility: "PUBLIC"` (invités vides).
  - Tenter une mise avec un utilisateur `isVerified=false` → doit échouer (403) avec `"Compte non vérifié"` et écriture dans `logs/security.log`.

---

## 8. Aller plus loin

Pour un vrai produit en production, il serait recommandé de :

- Ajouter une vraie gestion d'auth (mots de passe hashés, refresh tokens, rôles).
- Ajouter des tests automatisés (unitaires / d'intégration).
- Sécuriser encore davantage (rate limiting, logs centralisés, monitoring, etc.).
- Implémenter des paris plus complexes (cotes, marchés multiples, annulation, etc.).

Ce projet sert de **socle MVP sécurisé** pour commencer rapidement avec ToutBet.