# En-têtes de sécurité du navigateur

GaragePro ajoute une politique CSP avec un nonce aléatoire différent à chaque requête. Elle autorise les scripts Next.js portant ce nonce, les styles intégrés nécessaires à l'interface, les médias du site et le stockage Supabase configuré pour les téléversements directs. Aucun fournisseur d'IA externe n'est autorisé dans `connect-src` : les appels IA passent par le serveur.

La CSP du document de signature reste définie par sa route dédiée, qui sert le document dans un bac à sable. Le service worker conserve ses en-têtes de cache propres.

La caméra est autorisée uniquement sur la borne d'accueil et les écrans d'atelier/ordre qui proposent une capture. Elle est désactivée sur les autres pages. HSTS est ajouté uniquement aux requêtes HTTPS ; les autres en-têtes s'appliquent aux routes de l'application.

Une CSP avec nonce nécessite le rendu dynamique des pages Next.js. Pour vérifier les en-têtes et les flux navigateur, lancer `npm run check` puis les contrôles Chromium/Playwright décrits dans la tâche A2.
