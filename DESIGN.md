---
name: Trail Density
description: Le carnet de course où l'on classe les trails selon le niveau réel de leur tête de course.
colors:
  warm-paper: "oklch(0.975 0.006 75)"
  page-white: "oklch(0.995 0.003 75)"
  paper-shade: "oklch(0.97 0.006 70)"
  pencil-border: "oklch(0.89 0.012 70)"
  faint-rule: "oklch(0.93 0.008 70)"
  chart-grid: "oklch(0.91 0.01 70)"
  bark-ink: "oklch(0.24 0.02 55)"
  soft-ink: "oklch(0.52 0.02 60)"
  faded-ink: "oklch(0.62 0.02 60)"
  terracotta: "oklch(0.6 0.15 45)"
  terracotta-tint: "oklch(0.94 0.03 45)"
  lake-blue: "oklch(0.52 0.13 250)"
  lake-blue-tint: "oklch(0.94 0.025 250)"
  compare-ink: "oklch(0.3 0.02 55)"
  compare-green: "oklch(0.58 0.12 165)"
  compare-magenta: "oklch(0.55 0.18 340)"
  compare-ochre: "oklch(0.7 0.14 85)"
  night-paper: "oklch(0.2 0.012 60)"
  night-page: "oklch(0.24 0.012 60)"
  night-shade: "oklch(0.27 0.012 60)"
  night-border: "oklch(0.34 0.012 60)"
  night-ink: "oklch(0.94 0.01 75)"
  night-soft-ink: "oklch(0.72 0.015 70)"
  night-terracotta: "oklch(0.7 0.14 45)"
  night-terracotta-tint: "oklch(0.32 0.05 45)"
  night-lake-blue: "oklch(0.72 0.12 250)"
  night-lake-blue-tint: "oklch(0.3 0.05 250)"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(30px, 5.5vw, 48px)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1.15
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  figure:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "clamp(40px, 8vw, 56px)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
rounded:
  sm: "2px"
  md: "3px"
spacing:
  gutter-mobile: "16px"
  gutter-desktop: "32px"
  card-mobile: "18px"
  card-desktop: "22px 24px"
  section-gap: "28px"
components:
  card:
    backgroundColor: "{colors.page-white}"
    rounded: "{rounded.md}"
    padding: "{spacing.card-mobile}"
  chip:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.soft-ink}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
  segmented-button:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.soft-ink}"
    padding: "7px 13px"
  segmented-button-active:
    backgroundColor: "{colors.bark-ink}"
    textColor: "{colors.warm-paper}"
    padding: "7px 13px"
  brand-tag:
    backgroundColor: "{colors.terracotta-tint}"
    textColor: "{colors.terracotta}"
    rounded: "{rounded.sm}"
    padding: "2px 7px"
---

# Design System: Trail Density

## Overview

**Creative North Star: "Le carnet de course"**

Trail Density ressemble au carnet d'un coureur curieux : une page de papier chaud, des colonnes tenues avec soin, des chiffres bien alignés et une phrase écrite pour dire ce qu'ils signifient. Le site est personnel et libre. Il partage une passion, il ne vend ni méthode ni dépassement de soi.

Du dossard, il ne garde qu'une idée : le côté imprimé et le plaisir d'un beau chiffre. Le grand RCI en mono d'une fiche course est l'objet graphique du site. Autour de lui, tout reste calme et simple.

La référence à rejeter est l'imaginaire de la performance virile : « go muscu », « no pain no gain », publicité pour déodorant. Pas de noir et néon, pas d'italiques agressives, pas de majuscules qui crient, pas de vocabulaire de guerrier.

**Key Characteristics:**

- Papier chaud, encre brune et bordures fines plutôt que surfaces lourdes
- Chiffres en mono, assez beaux pour porter la page seuls
- Densité tranquille : beaucoup d'information, peu d'ornement
- Femmes et hommes à égalité, chacun avec sa couleur
- Angles nets et pages plates, comme une feuille

## Colors

Une palette de terre et de papier, où les deux seules couleurs vives portent un sens.

### Primary

- **Terracotta** : les hommes partout, et l'accent du site (étiquette de marque, liens « voir plus »). C'est le seul accent, à doser en petites touches hors données.

### Secondary

- **Lake Blue** : les femmes, partout et toujours. Il n'a pas d'autre usage.

### Tertiary

- **Compare Ink, Compare Green, Compare Magenta, Compare Ochre** : une couleur par course, uniquement sur la page Comparer. Ces teintes restent à l'écart de la terre cuite et du bleu pour ne jamais suggérer un genre.

### Neutral

- **Warm Paper** : le fond de page.
- **Page White** : les cartes et les surfaces posées sur le fond.
- **Paper Shade** : le survol et les zones légèrement enfoncées.
- **Pencil Border, Faint Rule, Chart Grid** : bordures, séparateurs de listes et grilles de graphiques.
- **Bark Ink** : le texte principal et le bouton actif.
- **Soft Ink** : le texte secondaire.
- **Faded Ink** : les rangs, axes et métadonnées. À réserver aux éléments non essentiels.

Le mode sombre reprend les mêmes rôles sur un papier de nuit brun (tokens `night-*`). Les couleurs de genre y gagnent en clarté. Le thème suit le réglage du système, le site n'a pas de sélecteur.

### Named Rules

**The Two Runners Rule.** Le bleu veut dire femmes et la terre cuite veut dire hommes. Une couleur de genre n'est jamais décorative, et aucune autre donnée ne les emprunte.

**The Side by Side Rule.** Femmes et hommes s'affichent côte à côte. Aucun des deux n'est présenté par défaut.

## Typography

**Display Font:** Archivo (avec system-ui, sans-serif)
**Body Font:** Archivo (avec system-ui, sans-serif)
**Label/Mono Font:** IBM Plex Mono (avec ui-monospace, monospace)

**Character:** Archivo donne une voix directe, pleine et sans prétention. IBM Plex Mono apporte le côté tenu à la main du carnet, et aligne les chiffres en colonnes.

### Hierarchy

- **Display** (800, clamp de 30 à 48 px, interligne 1,15) : le titre de page, écrit comme une question ou une réponse.
- **Figure** (mono 600, clamp de 40 à 56 px, interligne 1,05) : le RCI principal d'une fiche course. C'est le moment dossard du site, à réserver au chiffre qui répond à la question de la page.
- **Headline** (800, 21 à 22 px) : les titres de section.
- **Title** (700, 17 px) : les noms de blocs et les verdicts.
- **Body** (500, 15 px, interligne 1,5) : le texte courant. Les paragraphes de la page Méthode restent courts.
- **Label** (mono 600, 11 px, 0,06 em, majuscules) : les surtitres. Cette petite capitale d'imprimé est la seule place des majuscules.

### Named Rules

**The Mono Numbers Rule.** Tout chiffre comparable est en IBM Plex Mono, avec des chasses tabulaires, pour que les colonnes s'alignent.

**The Quiet Capitals Rule.** Les majuscules restent petites, espacées et en mono. Un grand titre en capitales crierait, et le carnet ne crie pas.

## Layout

Le contenu tient dans une colonne de 1120 px au maximum, avec des gouttières de 16 px sur mobile et de 32 px à partir de 720 px. Le site se pense d'abord pour le téléphone.

Le rythme vient de l'empilement : carte ou liste, un titre de section, puis un écart d'environ 28 px. Les listes classées sont denses et séparées par de fins filets. À partir de 860 px, femmes et hommes passent de l'empilement à deux colonnes égales.

L'en-tête fait 56 px, reste collant sur grand écran, puis redevient statique sous 700 px pour ne pas manger l'écran. Ses liens passent alors sur leur propre rangée et restent tous visibles.

## Elevation & Depth

Le site est plat, comme du papier. La profondeur vient des bordures fines et de la légère différence entre Warm Paper et Page White, jamais d'une ombre portée.

La seule exception actuelle est le menu de suggestions de Comparer, qui flotte réellement au-dessus de la page (`box-shadow: 0 6px 20px oklch(0 0 0 / 0.08)`).

### Named Rules

**The Flat Paper Rule.** Pas d'ombres. Seul un élément qui flotte réellement au-dessus de la page peut en porter une, très légère.

**The Useful Motion Rule.** L'animation reste rare et discrète : elle n'est permise que si elle aide à comprendre un changement. Elle n'est jamais décorative, et elle respecte `prefers-reduced-motion`. Aucun composant n'a de transition aujourd'hui.

## Shapes

Les angles sont nets (2 à 3 px), avec juste assez de douceur pour ne pas être coupants. La forme de base est le rectangle à bordure fine. Les pilules, grands arrondis et formes organiques n'appartiennent pas à ce système.

## Components

Des outils de carnet : plats, précis et sans effet.

### Buttons

- **Shape :** angles de 2 px, groupés dans une rangée segmentée à bordure fine.
- **Repos :** Page White et Soft Ink, en Archivo 600 de 13 px.
- **Actif :** inversion complète en Bark Ink et Warm Paper, sans couleur d'accent.
- **Mobile :** le rembourrage se resserre sous 560 px.

### Chips

- **Style :** bordure fine, Page White, Soft Ink, en 12,5 px et 600.
- **État :** sur Comparer, une pastille de la couleur de la course et une croix pour la retirer.

### Cards / Containers

- **Corner Style :** 3 px.
- **Background :** Page White sur Warm Paper.
- **Shadow Strategy :** aucune.
- **Border :** Pencil Border de 1 px.
- **Internal Padding :** 18 px sur mobile, 22 px sur 24 px dès 720 px.

### Inputs / Fields

- **Style :** bordure fine et Page White. Dans « Et moi ? », le champ d'index est en mono de 22 px, car le chiffre y est le sujet.
- **Focus :** contour de 2 px en Bark Ink.

### Navigation

- **Style :** bandeau papier légèrement translucide (88 %, flou de 8 px) et filet bas.
- **Marque :** « Trail Density » en 800 et 17 px, suivi de l'étiquette mono en terre cuite.
- **Liens :** 14 px et 600, de Soft Ink vers Bark Ink au survol.
- **Langue :** petit bouton mono à bordure fine.

### Courbe de densité

Le visuel signature : l'index par rang, en SVG maison. En grand sur les fiches, en miniature de 84 px sur 24 dans les classements. Ses lignes font 2,5 px et prennent la couleur du genre. Les étiquettes de fin sont en mono.

### Liste classée

Le cœur du site : rang en Faded Ink, nom sur une ligne avec ellipse, miniature, puis valeur en mono colorée par genre et écart. La miniature disparaît sous 560 px pour garder le nom et le chiffre.

## Do's and Don'ts

### Do:

- **Do** laisser un grand chiffre en mono porter la page lorsqu'il répond à sa question.
- **Do** accompagner chaque chiffre d'un repère et d'une phrase simple qui l'interprète.
- **Do** garder un ton personnel, libre et simple, comme une note prise pour des amis.
- **Do** tenir les filets et bordures à 1 px et les angles à 2 ou 3 px. Seul le liseré de genre des cartes RCI monte à 4 px.
- **Do** vérifier chaque écran sur téléphone, en clair et en sombre.

### Don't:

- **Don't** employer l'imaginaire de la performance virile : « go muscu », « no pain no gain », publicité pour déodorant.
- **Don't** utiliser le bleu ou la terre cuite pour autre chose que le genre, en dehors des touches d'accent existantes.
- **Don't** ajouter des ombres, sauf pour un élément qui flotte réellement.
- **Don't** animer pour décorer.
- **Don't** utiliser des pilules ou de grands arrondis.
- **Don't** montrer l'un des deux genres par défaut.
