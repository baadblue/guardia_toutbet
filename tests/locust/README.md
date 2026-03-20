# Locust Load Tests

Ce dossier contient des scenarios Locust pour stress-tester l'API ToutBet.

## Scenarios

- `many_bettors`: simule de nombreux parieurs differents misant sur le meme evenement.
- `same_user`: simule un meme utilisateur qui envoie de nombreuses mises en parallele.

## Lancement (UI Web Locust)

Depuis la racine du projet:

```bash
locust -f tests/locust/locustfile.py --host http://localhost:4000
```

Puis ouvrir `http://localhost:8089`.

Exemple de parametres UI:

- Number of users: `80`
- Spawn rate: `20`
- Host: `http://localhost:4000`

## Lancement cible par tag

Seulement afflux de parieurs:

```bash
locust -f tests/locust/locustfile.py --host http://localhost:4000 --tags many_bettors
```

Seulement meme utilisateur concurrent:

```bash
locust -f tests/locust/locustfile.py --host http://localhost:4000 --tags same_user
```

## Variables utiles

```bash
export LOCUST_BETTORS_COUNT=80
export LOCUST_INITIAL_BALANCE=100
export LOCUST_WAGER_AMOUNT=10
export LOCUST_SAME_USER_CONCURRENCY=20
```

## Interpretation du risque "meme utilisateur"

Le scenario `same_user` calcule:

- succes maximum theorique: `floor(balance_initial / montant_mise)`
- succes reels observes pendant une rafale concurrente

Si les succes reels depassent le maximum theorique, Locust emet un evenement d'echec `same_user_overspend_detected` indiquant un risque de condition de concurrence.
