# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Deux publics à égalité, aucun ne prime sur l'autre :

- les passionnés qui suivent l'élite du trail ;
- les amateurs qui aiment les chiffres et les grandes courses.

Ils viennent pour une réponse (« cette course était-elle relevée ? »), souvent depuis un lien partagé, souvent sur mobile. La profondeur doit rester disponible sans gêner le premier lecteur.

## Product Purpose

Trail Density répond à la question : quels trails ont les plateaux les plus relevés ? Le site mesure le niveau en tête de course avec le RCI (Realized Competition Index), par genre, et permet de classer et de comparer les courses après leur déroulement.

C'est un projet personnel, partagé entre amis et dans une petite sphère d'amateurs de trail et de données. La réussite se mesure au plaisir et à l'utilité dans ce cercle, pas à la croissance de l'audience.

## Positioning

Le seul endroit qui classe les courses de trail a posteriori selon le niveau réel de leur tête de course, avec un chiffre comparable (RCI) entre femmes et hommes, et qui reste honnête sur ses limites.

## Operating Context

- Les lecteurs consultent le site surtout après une course, ou en suivant un lien partagé.
- Les données sont mises à jour à la main après les courses : `refresh`, import, export des JSON, commit, PR, déploiement.
- Un serveur MCP public en lecture seule (`mcp/`) expose les mêmes données à des assistants.

## Capabilities and Constraints

- Pages : Accueil, Classement, Fiche course, Comparer, Records, Et moi ?, Méthode. Chacune répond à une question définie dans `docs/guidelines.md`.
- Site statique Astro dans `site/`, déployé sur Cloudflare Pages. Il lit des JSON versionnés et n'interroge jamais Supabase depuis le navigateur des visiteurs.
- Bilingue FR/EN, langue dans l'URL. Les noms de courses ne se traduisent pas.
- RCI10 est le chiffre de référence ; RCI3, 5 et 20 restent au second plan. Pas de RCI10 sous 10 finishers classés avec un index.
- Hommes et femmes côte à côte, jamais l'un « par défaut ». Les scores féminins sont ramenés à l'échelle masculine avec les formules d'Enduraw.
- Les index ITRA et UTMB ne sont pas comparables entre eux. Aucune conversion n'est faite, et les deux restent visibles sur les fiches course.
- Comparer ne s'ouvre jamais vide et garde sa sélection dans l'URL.
- Paliers du RCI10 : 900 et plus = niveau mondial, 850 et plus = élite internationale, 750 et plus = fort, moins de 750 = régional. Sous 15 points d'écart, un RCI est dit stable, car les index ITRA et UTMB sont peu précis.
- Le site classe a posteriori : pas de RCI prévisionnel à ce jour, par décision du 2026-11-04.
- Le catalogue couvre une sélection de courses, pas toutes les courses. Certaines éditions ont des résultats partiels.

## Brand Commitments

- Nom : Trail Density.
- Ton : précis et sobre, média de données sportives plutôt qu'outil d'analyste. Le chiffre, puis une phrase qui l'interprète. Le jargon est expliqué une fois, là où il apparaît.
- Le site reste personnel, libre et simple. Il refuse l'imaginaire de la performance virile : pas de « go muscu », de « no pain no gain » ni d'esprit publicité pour déodorant.
- Le site vouvoie, sauf la page « Et moi ? » qui tutoie.
- Crédits : le RCI revient à Travis Loncar (Freetrail), cité sur l'accueil et la page Méthode, pas dans le pied de page. La conversion de l'index féminin revient à Enduraw (publiée par Distances+). Ne pas promouvoir plus largement avant que Benoit ait contacté Travis Loncar.
- Contraintes visuelles fixées par Benoit : femmes en bleu, hommes en terre cuite, partout et toujours ; angles nets (2 à 3 px) ; la courbe de densité comme visuel signature.

## Evidence on Hand

- Données réelles : catalogue dans `catalog/events/`, résultats exportés dans `site/public/data/`.
- Méthode et sources : page Méthode, `docs/guidelines.md`, article de Travis Loncar sur Freetrail, formules d'Enduraw sur Distances+.
- Pas de témoignages, de chiffres d'audience ni de partenariats. Ne pas en inventer.

## Product Principles

1. Chaque page répond à une question et montre une réponse avant de demander quoi que ce soit. Les filtres affinent une réponse déjà affichée.
2. Un chiffre n'arrive jamais seul : il vient avec un repère (rang, écart) et une phrase qui l'interprète.
3. Femmes et hommes ont le même rang, partout.
4. L'honnêteté prime sur l'impression de précision : sources, résultats partiels et limites restent visibles.
5. Le site reste à la mesure d'un projet personnel : simple, statique et facile à maintenir.
