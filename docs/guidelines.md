# Trail Density — guidelines du site public

Validées le 2026-10-30. Base visuelle : la maquette `claude_design/` (couleurs, typo), mais pas sa structure
(sélection préalable + onglets), remplacée par des pages éditoriales.

## Public
Les passionnés qui suivent l'élite, et les amateurs qui aiment les chiffres et les grandes courses.
Ils viennent pour une réponse (« cette course était-elle relevée ? »), souvent depuis un lien partagé, souvent sur mobile.

## Principe directeur
**Chaque page répond à une question et montre une réponse avant de demander quoi que ce soit.**
Jamais d'écran vide « commencez par choisir ». Les filtres affinent une réponse déjà affichée.

## Pages
| Page | Question |
|---|---|
| Accueil | Quelles courses sont les plus relevées en ce moment ? |
| Classement | Les plus relevées, par format / année / genre |
| Fiche course | Cette course est-elle relevée, et comment évolue-t-elle ? |
| Comparer | Laquelle de ces 2 à 4 courses est la plus relevée ? |
| Méthode | Comment le RCI est calculé, les sources, les limites |

**Comparer** : ne s'ouvre jamais vide (comparaison suggérée, p. ex. le top 3 d'un format). On ajoute une course
par recherche (jusqu'à 4, en étiquettes retirables), avec des suggestions (même format, même circuit, RCI proche).
L'entrée principale est le bouton « Comparer avec… » de la fiche course. La sélection est dans l'URL
(`/fr/comparer/?c=occ,sierre-zinal,zegama-marathon`, en query string pour rester un site statique).

## Ton
- Précis et sobre : média de données sportives, pas outil d'analyste. Le chiffre, puis une phrase qui l'interprète.
- Le jargon est expliqué une fois, là où il apparaît (infobulle « en savoir plus »), pas en paragraphe en tête de page.
- Honnête sur les limites : source, résultats partiels, index ITRA vs UTMB non comparables.

## Identité visuelle
- Fond papier chaud, texte brun foncé, un seul accent.
- **Femmes = mousse, hommes = terre cuite, partout et toujours.**
- Archivo pour le texte, IBM Plex Mono pour tous les chiffres.
- Visuel signature : **la courbe de densité** (index par rang). En grand sur les fiches, en miniature dans les classements.
- Mode sombre en plus du clair.

Tokens (OKLCH, repris de la maquette) :

| Rôle | Clair |
|---|---|
| Fond page | `oklch(0.975 0.006 75)` |
| Surface | `oklch(0.995 0.003 75)` |
| Bordure | `oklch(0.89 0.012 70)` |
| Texte | `oklch(0.24 0.02 55)` |
| Texte secondaire | `oklch(0.52 0.02 60)` |
| Terre cuite (hommes, accent) | `oklch(0.6 0.15 45)`, teinte `oklch(0.94 0.03 45)` |
| Mousse (femmes) | `oklch(0.56 0.09 150)`, teinte `oklch(0.94 0.02 150)` |

## Chiffres
- **RCI10 = chiffre de référence.** RCI3/5/20 accessibles, en second plan.
- Toujours un repère à côté d'un chiffre : rang, écart avec l'an dernier ou avec la moyenne du format.
- Hommes et femmes côte à côte, jamais l'un « par défaut ».
- Pas de RCI10 sous 10 finishers classés avec un index.

## Langues
FR et EN, langue dans l'URL (`/fr/course/occ`, `/en/race/occ`), langue du navigateur par défaut.
Les noms de courses ne se traduisent pas.

## Technique
- Site statique (`site/`), données en JSON générées à la fin de chaque import (`pnpm run export`).
  Aucune requête Supabase depuis le navigateur des visiteurs.
- Mobile d'abord.
- Graphiques légers (SVG maison ou petite librairie), pas Plotly.
