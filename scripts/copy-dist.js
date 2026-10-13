// Copie le build mono-fichier à la racine du dépôt : c'est ce fichier que
// l'utilisateur télécharge puis ouvre dans son navigateur.
import { copyFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'suivi-jours-projets.html');
console.log('-> suivi-jours-projets.html mis à jour');
