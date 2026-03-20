# Playwright Tests

Ce dossier contient les tests E2E de securite (Abuse Stories) pour ToutBet.

## Contenu

- [as.spec.js](tests/playwright/as.spec.js): suite des 10 Abuse Stories.

## Prerequis

1. API backend demarree sur `http://localhost:4000`.
2. Frontend demarre sur `http://localhost:3000`.
3. Dependances installees a la racine du projet.

## Lancer les tests

Depuis la racine du projet:

```bash
npx playwright test
```

Lancer uniquement cette suite:

```bash
npx playwright test tests/playwright/as.spec.js
```

Afficher le rapport HTML:

```bash
npx playwright show-report
```

## Variables d'environnement utiles

```bash
export PW_UI_BASE_URL=http://localhost:3000
export PW_API_BASE_URL=http://localhost:4000
export PW_TEST_LOGIN_PASSWORD=Azertyuiop1
```

## Notes

- Le fichier de configuration est [playwright.config.js](playwright.config.js).
- Le `testDir` cible `tests/playwright`.
