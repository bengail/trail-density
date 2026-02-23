# Trail Race Analytics (v2)

Web app statique (GitHub Pages friendly) pour analyser / comparer des courses via des Race Scores (ITRA / UTMB Index).

## Features
- **Table** interactive : sélection de courses + **tri** par colonnes (Top3/5/10, RCI10/20/30, AUC, Gini…)
- **Graphes** : rank→index (aire), Lorenz + Gini, heatmap par déciles

## Données (JSON)
- `data/courses_index.json` : manifest (liste des courses)
- `data/courses/<race_id>.json` : un fichier par course, avec :
  - `meta` : description (enrichissable : pays, série, prize money, etc.)
  - `results` : classement (rank / index / runner / gender / nationality)

## RCIs
RCI_N = mean(top N) - std(top N) (écart-type population).

## Lancer en local
```bash
python3 -m http.server 8000
# ouvrir http://localhost:8000
```

## Navigation
- `/` : landing page with `RCI Charts`, `RCI Normalized`, and `Visualisation`.
- `/admin/` : admin pages (`Summary`, `Charts`, `Race`, `Import`) without auth.

## Mettre à jour les données depuis un Excel
```bash
python3 scripts/build_json_from_xlsx.py itra_resultats.xlsx .
```
Puis commit/push.

## Publier sur GitHub Pages
Le projet est statique. Configure GitHub Pages pour servir la branche `main` à la racine.
