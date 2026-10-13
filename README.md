# DSP : suivi de la consommation des jours projets

Application **locale**, à ouvrir dans le navigateur, pour suivre les jours consommés et planifiés **par consultant, client, projet et commande**, à partir de l'export Excel de **PlanningPME**.

- **Aucune installation** : un seul fichier, `suivi-jours-projets.html`, à ouvrir d'un double-clic (Chrome, Edge ou Firefox).
- **Aucune donnée envoyée sur Internet** : le fichier est lu dans le navigateur, et les données comme les budgets sont enregistrés sur le poste (IndexedDB).

## Utilisation

1. Sur GitHub, ouvrez `suivi-jours-projets.html`, cliquez sur **Download raw file**, puis ouvrez le fichier téléchargé.
2. Dans PlanningPME, exportez le rapport **« number-hours-by-resource-by-task-by-day »** (.xlsx) sur la période voulue (date de début / date de fin).
3. Glissez le fichier dans la page.
4. Pour les extractions suivantes, choisissez **Compléter** pour cumuler les périodes, ou **Remplacer**. Avec « Compléter », les jours de la période couverte par le nouveau fichier sont remplacés, et les autres périodes sont conservées. Vous pouvez donc importer chaque mois une extraction du mois et garder l'historique.

## Écrans

| Écran | Contenu |
|---|---|
| **Tableau de bord** | Jours consommés (réalisés), jours à venir, total, taux d'occupation, heures supplémentaires et week-ends, jours à planifier ; charge par semaine ou par mois ; jours par consultant, client, projet, commande, tâche et département. Un clic sur une barre filtre l'ensemble. |
| **Analyse croisée** | Tableau croisé au choix : lignes, sous-lignes repliables, colonnes (mois, semaine ou un autre axe), en jours ou en heures, réalisé et/ou à venir. Export CSV. |
| **Suivi des budgets** | Par commande, projet ou client : saisie des **jours vendus**, puis réalisé, à venir, reste, % consommé et % projeté, avec un état (Dépassé, Dépassement prévu, Vigilance ≥ 80 %, Dans le budget). Les budgets peuvent être sauvegardés et restaurés en CSV. |
| **Détail** | Toutes les affectations journalières, avec recherche, tri et export CSV. |

**Date de référence** (dans les filtres) : les jours jusqu'à cette date sont comptés comme *réalisés*, les suivants comme *à venir*. Par défaut, c'est la date du jour.

## Règles de calcul

- Les données sont lues dans l'onglet **`_All`** de l'export, à raison d'une ligne par ressource, par tâche et par jour.
- **Jours** = `Dat_Days + Dat_DaysExtra`, et **heures** = `Dat_Hours + Dat_HoursExtra`. Les heures supplémentaires et les week-ends sont donc inclus, et un indicateur les isole.
- **Doublons** : PlanningPME répète une affectation pour chaque département de la ressource (par exemple « Commercial, IT » donne 2 lignes). L'application fusionne ces lignes. Le tableau croisé fourni dans l'export, lui, les compte en double : sur le fichier d'exemple, il affiche 53 h pour Adam au lieu de 26,5 h.
- **Commande** = champ `Evt_Order`, **Projet** = `Pro_Label`, **Client** = `Cus_Label`. Un axe sans aucune valeur dans les données est masqué.
- Les ressources de type **« À planifier »** ne sont pas des consultants. Leurs jours sont comptés à part (indicateur « À planifier ») et exclus du taux d'occupation.
- **Taux d'occupation** = jours des consultants ÷ (jours ouvrés de la période × nombre de consultants présents dans la sélection). Les jours fériés ne sont pas déduits.
- **Suivi des budgets** : calculé sur **toutes** les données importées, sans tenir compte des filtres, car un budget se consomme sur toute la durée de l'affaire.

## Développement

```bash
npm install
npm run dev      # serveur de développement
npm test         # tests unitaires (dont lecture du fichier d'exemple tests/fixtures)
npm run build    # régénère suivi-jours-projets.html
```

Stack : Vue 3 + Vite, fflate (lecture du .xlsx, sans dépendance de type SheetJS), graphiques en SVG/HTML. `vite-plugin-singlefile` produit le fichier HTML unique.
