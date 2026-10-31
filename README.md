# Trail Density

Quels trails ont les plateaux les plus relevés ? Le site mesure le niveau en tête de course avec le
**RCI** (Realized Competition Index, proposé par Travis Loncar sur
[Freetrail](https://fantasy.freetrail.com/news/2026/01/realized-competition-index)) :

    RCI_N = moyenne(top N) − écart-type population(top N)

calculé séparément pour les femmes et les hommes, sur les scores ITRA (source principale) et UTMB Index.
Les scores des femmes sont ramenés à l'échelle des hommes avec les formules d'Enduraw
([Distances+](https://distances.plus/communaute/trail-running-classement-teams-trail-composition-2025/)).

Site : https://trail-density.pages.dev (FR / EN).

## Organisation

| Dossier | Rôle |
|---|---|
| `catalog/events/*.yaml` | Les courses suivies et l'URL ITRA / UTMB de chaque édition. Ajouter une course = éditer le catalogue et commiter. |
| `scripts/` | Import (Playwright + Chrome, avec ton compte ITRA / UTMB), calcul des stats, export JSON. |
| `migrations/` | Schéma `v2` dans Supabase (`events → races → editions → result_sets → results`, `edition_stats`). |
| `data/courses/` | Anciens fichiers JSON, utilisés comme source « archive » pour quelques éditions. |
| `site/` | Le site public (Astro, statique), lit les JSON de `site/public/data/`. |
| `docs/guidelines.md` | Principes du site : public, pages, ton, identité visuelle, règles sur les chiffres. |

## Mettre à jour les données

```bash
pnpm install
cp .env.example .env          # DATABASE_URL, et en option les identifiants ITRA / UTMB
pnpm run add search "lavaredo"                                  # trouve la course sur ITRA
pnpm run add <url ITRA> --event lavaredo --race lut-120k        # l'ajoute au catalogue (ou --batch fichier)
pnpm run import               # récupère les résultats, valide, écrit dans Supabase
pnpm run export               # écrit site/public/data/*.json
git commit                    # les JSON exportés sont versionnés : le build n'a pas besoin de la base
```

`pnpm run recompute-stats` recalcule les stats depuis les résultats en base (après un changement de formule).

## Site

```bash
cd site
pnpm install
pnpm run dev                  # http://localhost:4321
```

Cloudflare Pages construit `site/` à chaque push sur `main` (commande `cd site && pnpm install && pnpm run build`,
sortie `site/dist`). Chaque branche poussée a sa prévisualisation sur `<branche>.trail-density.pages.dev`.
