/**
 * Page « Aide » de l'espace équipe (/garage/aide). Texte de référence en français ;
 * help-en.ts et help-ar.ts ont exactement la même forme (typeof helpFr), les mêmes
 * identifiants de rubriques et les mêmes liens.
 */
export type HelpLink = { label: string; href: string };
export type HelpSection = {
  id: string;
  title: string;
  roles: string;
  links: HelpLink[];
  body: string[];
  limits?: string[];
};
export type HelpFaq = { q: string; a: string };

export const helpFr = {
  title: "Aide",
  intro:
    "Comment fonctionne chaque module de GaragePro, qui peut l'utiliser et ce que l'application ne fait pas. Les pages du menu dépendent de votre rôle : si un lien ne s'ouvre pas, c'est que votre rôle n'y a pas accès.",
  searchLabel: "Rechercher dans l'aide",
  searchPlaceholder: "Ex. : devis, congé, QR, sauvegarde…",
  noResult: "Aucune rubrique ne correspond. Essayez un autre mot.",
  resultCount: "{n} rubrique(s)",
  contents: "Sommaire",
  rolesLabel: "Qui peut l'utiliser",
  linksLabel: "Ouvrir",
  limitsLabel: "Limites",
  faqTitle: "Questions fréquentes et dépannage",
  sections: [
    {
      id: "getting-started",
      title: "Démarrer : PC du garage, autres appareils, site en ligne",
      roles: "Tout le personnel (installation du PC du garage : administrateur)",
      links: [{ label: "Vue d'ensemble", href: "/garage" }],
      body: [
        "Le PC du garage est le serveur (« hub ») : il fait tourner GaragePro avec sa propre base PostgreSQL. Chaque jour, double-cliquez sur start-hub.cmd ou sur le raccourci « GaragePro - hub du garage ». Il doit rester allumé pendant le travail.",
        "La fenêtre du hub affiche l'adresse à ouvrir sur les téléphones et tablettes du Wi-Fi du garage, par exemple http://192.168.1.20:3000 (port 3000 par défaut). Sur le PC du garage lui-même : http://localhost:3000.",
        "Sur le Wi-Fi du garage, toute l'équipe travaille même sans internet : ordres, atelier, photos, factures, stock, achats.",
        "Le hub se synchronise avec le site en ligne toutes les 30 secondes. Sans internet, il continue en local et envoie tout au retour de la connexion ; ce qui a été fait en ligne (rendez-vous du site, réclamations…) revient au garage.",
        "Si la même fiche a été modifiée au garage et en ligne pendant une coupure, la modification la plus récente gagne. L'état de la synchronisation est visible dans le menu du compte (« Serveur du garage »).",
        "Autre PC du garage : n'installez rien. Demandez le raccourci GaragePro.cmd (créé sur le PC du garage avec npm run shortcut) : il ouvre le PC du garage sur le Wi-Fi, sinon le site en ligne.",
        "Le site en ligne (https) fonctionne de partout, sans le PC du garage. Votre compte est le même, mais il faut se connecter une fois sur chaque adresse.",
        "Installer l'application : sur le site en ligne, bouton « Installer l'application » dans le panneau « Plus » (ou menu du navigateur ; iPhone : Partager → « Sur l'écran d'accueil »). Sur l'adresse http du Wi-Fi, ajoutez simplement un favori sur l'écran d'accueil.",
      ],
      limits: [
        "Le bouton « Installer » n'apparaît pas sur une adresse http://IP:3000 : les navigateurs exigent https pour installer une application.",
        "Si l'adresse IP du PC du garage change, l'ancienne adresse ne marche plus : réservez-lui une adresse fixe dans la box.",
        "Les factures, bons de commande, bons de réception et contrats sont numérotés uniquement sur le PC du garage quand le hub est en service.",
      ],
    },
    {
      id: "overview",
      title: "Vue d'ensemble (tableau de bord)",
      roles: "Tout le personnel ; les cartes affichées dépendent du rôle",
      links: [{ label: "Vue d'ensemble", href: "/garage" }],
      body: [
        "Première page après la connexion : véhicules à l'atelier, promis aujourd'hui, prêts à livrer, mécaniciens présents, pièces en stock bas.",
        "Les montants (chiffre du jour, encaissé du mois, revenus, factures) ne s'affichent qu'aux rôles qui voient les finances : administrateur, responsable, réception, comptable.",
        "Selon le rôle : alertes à traiter, rendez-vous du jour, ordres récents, objectif mensuel (défini par l'administrateur dans Paramètres).",
        "La page se met à jour toute seule (« En direct ») tant qu'elle est ouverte.",
        "Le champ de recherche en haut retrouve un véhicule par son immatriculation.",
        "Bouton « Personnaliser » (si disponible dans votre version) : choisir et ranger les cartes affichées.",
      ],
    },
    {
      id: "work-orders",
      title: "Ordres de réparation",
      roles: "Administrateur, responsable, réception, mécanicien (facturer : administrateur)",
      links: [
        { label: "Ordres de réparation", href: "/garage/work-orders" },
        { label: "Nouvel ordre", href: "/garage/work-orders/new" },
        { label: "Suivi & retards", href: "/garage/suivi" },
      ],
      body: [
        "Nouvel ordre : tapez l'immatriculation. Voiture déjà à l'atelier → son ordre s'ouvre ; voiture connue → historique puis fiche ; première visite → fiche client et véhicule. S'il manque une information du véhicule (VIN, kilométrage…), un encadré la demande en haut de l'ordre.",
        "Statuts : Réceptionné → Diagnostic → Devis envoyé / Attente assurance → Attente pièces → En réparation → Contrôle qualité → Lavage → Prêt → Livré. Annulé est possible avant le contrôle qualité ; Livré et Annulé sont définitifs (à l'annulation, les pièces reviennent en stock).",
        "Devis : ajoutez les lignes (main-d'œuvre, pièces, forfaits), « Imprimer le devis », passez à « Devis envoyé ». Le client peut valider le devis depuis son suivi en ligne : l'ordre passe alors « En réparation » et la validation s'affiche sur l'ordre. Sinon, changez le statut vous-même après son accord.",
        "Contrôle qualité : la checklist (essai routier, liquides, voyants, outils retirés, travaux et facturation vérifiés) est remplie par l'équipe, puis validée par un responsable ou l'administrateur. « Prêt » est bloqué tant que ce n'est pas validé ; modifier un point ou renvoyer en réparation annule la validation.",
        "Temps passé : « Démarrer mon chrono » pour chaque mécanicien. L'ordre montre les heures-personnes, la durée de l'intervention et la main-d'œuvre facturée. La facture n'est jamais modifiée automatiquement : un bouton propose la ligne à ajouter. Saisir ou annuler le temps des autres : responsable, administrateur.",
        "Pièces manquantes (statuts À commander, Commandée, Reçue, Annulée) avec fournisseur et date prévue, et dossier assurance (compagnie, n° de sinistre, décision). Le magasinier peut aussi signaler une pièce manquante.",
        "Suivi & retards (administrateur, responsable, réception) : livraisons promises dépassées, pièces en retard, assurance sans réponse, réparations bloquées, avec qui appeler et quoi faire. Les seuils se règlent dans Paramètres.",
        "Facturer (administrateur) : une fois la facture émise, les lignes de l'ordre sont verrouillées.",
      ],
      limits: [
        "Une pièce ajoutée avec un stock insuffisant est acceptée avec un avertissement (elle peut être en rayon sans être saisie).",
        "Le devis imprimé indique une validité de 15 jours ; il n'y a pas de signature électronique du devis.",
      ],
    },
    {
      id: "customers",
      title: "Clients et comptes entreprises",
      roles: "Administrateur, responsable, réception, mécanicien (comptes entreprises : administrateur, responsable)",
      links: [
        { label: "Clients", href: "/garage/customers" },
        { label: "Comptes entreprises", href: "/garage/entreprises" },
      ],
      body: [
        "Liste avec onglets Tous, Favoris et Entreprises, et recherche par nom, téléphone ou immatriculation.",
        "Actions rapides sur un client récent : créer un ordre, ou ouvrir sa facture impayée pour la relancer.",
        "Fiche client : coordonnées, véhicules, historique des visites et montants, contrats liés.",
        "Client professionnel : l'administrateur ou le responsable crée sur sa fiche les comptes de ses employés pour l'espace entreprise (/entreprise), avec un mot de passe provisoire à remettre en main propre.",
        "Rôles d'un compte entreprise : Responsable flotte ou Gestionnaire (tout, montants inclus), Consultation (sans montants). Chaque compte ne voit que les véhicules de ce client.",
        "Chaque création ou modification d'un client est enregistrée dans le Journal (avant → après).",
      ],
    },
    {
      id: "vehicles",
      title: "Véhicules : QR Code, diagnostic OBD, entretien",
      roles: "Administrateur, responsable, réception, mécanicien (QR et plans d'entretien : sans le mécanicien)",
      links: [
        { label: "Véhicules", href: "/garage/vehicules" },
        { label: "Rappels clients", href: "/garage/notifications" },
      ],
      body: [
        "La page Véhicules retrouve une voiture par plaque, marque, modèle, VIN ou propriétaire, avec les boutons Nouvel ordre, QR, OBD et Entretien.",
        "QR Code : étiquette à coller dans la voiture (imprimer, renouveler, révoquer). Le scan ouvre la fiche pour l'équipe connectée, l'espace entreprise pour le compte du client, et sinon seulement l'immatriculation et le modèle.",
        "Le lien du QR utilise l'adresse publique du site (APP_URL, ou « Adresse publique du site » dans Paramètres), pas l'adresse du PC du garage.",
        "Diagnostic OBD : adaptateur ELM327 USB ou Bluetooth classique (port COM), Chrome ou Edge sur un ordinateur, contact mis. Lit les codes défauts, des données moteur, le VIN et parfois le kilométrage.",
        "OBD : un VIN différent de la fiche est refusé ; un kilométrage plus bas est signalé et jamais appliqué ; un kilométrage plus haut n'est appliqué que si vous cochez la case. Le mode « Démonstration » est enregistré comme simulé.",
        "Plan d'entretien : vidange, filtres, freins… tous les N jours et/ou N km. Statut à jour, bientôt, en retard ou impossible à calculer (le kilométrage n'est jamais deviné).",
        "Les rappels d'entretien partent par SMS et/ou e-mail seulement si ces envois sont configurés ; le client peut les refuser. Historique et erreurs : Rappels clients (administrateur, responsable).",
      ],
      limits: [
        "OBD : jamais d'effacement des codes ; pas d'adaptateur Wi-Fi ou Bluetooth Low Energy, pas de téléphone, pas de données propres aux constructeurs (ABS, airbag, boîte…).",
        "OBD depuis un autre PC en http://… : le navigateur bloque le port. Utilisez le PC du garage (localhost) ou le site en ligne.",
        "OBD : testé avec le simulateur et des réponses enregistrées, pas encore avec un vrai adaptateur sur une vraie voiture.",
      ],
    },
    {
      id: "appointments",
      title: "Rendez-vous",
      roles: "Consulter : administrateur, responsable, réception, mécanicien ; gérer : administrateur, responsable, réception",
      links: [{ label: "Rendez-vous", href: "/garage/appointments" }],
      body: [
        "Planning du jour (jour précédent / suivant) avec le nombre de rendez-vous et la capacité de l'atelier.",
        "« Réceptionner » crée l'ordre de réparation et le code de suivi du client. « Absent » ou « Annuler » si le client ne vient pas.",
        "Les clients réservent sur le site (/rdv) : seuls les jours et heures libres sont proposés, deux clients ne peuvent pas prendre le même dernier créneau.",
        "Le client peut annuler depuis sa confirmation jusqu'à 2 h avant.",
        "Réglages (réservation ouverte ou fermée, capacité, durée des créneaux, prestations proposées) : Paramètres, administrateur seulement.",
      ],
      limits: ["Confirmations et rappels automatiques seulement si l'envoi de SMS (Twilio) ou d'e-mails est configuré."],
    },
    {
      id: "workshop",
      title: "Atelier (mobile)",
      roles: "Administrateur, responsable, réception, mécanicien",
      links: [{ label: "Atelier (mobile)", href: "/garage/atelier" }],
      body: [
        "Écran pour téléphone ou tablette : une carte par véhicule en cours, avec plaque, demande du client, heure promise et priorité.",
        "« Mes véhicules » ou « Tous » ; un mécanicien voit d'abord ses véhicules.",
        "Un grand bouton passe à l'étape suivante ; les autres étapes possibles sont proposées à côté.",
        "Bouton Photo pour prendre une photo ou une vidéo depuis le téléphone ; chrono de son propre temps.",
        "Chaque changement met à jour en quelques secondes le suivi en ligne du client.",
      ],
      limits: ["L'annulation d'un ordre ne se fait pas ici : depuis la fiche de l'ordre."],
    },
    {
      id: "stock-purchasing",
      title: "Stock, fournisseurs, achats et réceptions",
      roles: "Stock en lecture : administrateur, responsable, réception, mécanicien, magasinier ; mouvements : administrateur, magasinier ; valider un achat et payer un fournisseur : administrateur",
      links: [
        { label: "Stock pièces", href: "/garage/parts" },
        { label: "Fournisseurs", href: "/garage/suppliers" },
        { label: "Bons de commande", href: "/garage/purchase-orders" },
        { label: "Bons de réception", href: "/garage/receipts" },
        { label: "Factures fournisseurs", href: "/garage/supplier-invoices" },
      ],
      body: [
        "Stock : valeur, pièces sous le minimum, colonnes Réservé et Disponible. Une pièce ajoutée à un ordre sort du stock, et revient si elle est retirée ou si l'ordre est annulé.",
        "Réserver une pièce pour une réparation (administrateur, responsable, réception, magasinier) : elle reste sur l'étagère mais n'est plus disponible ailleurs.",
        "Mouvements manuels : entrée, sortie (jamais sous 0), retour fournisseur. Un mouvement erroné se corrige par un mouvement inverse avec motif ; l'original reste dans l'historique.",
        "Achat : le magasinier, le responsable ou l'administrateur crée une demande (pré-remplie avec les pièces en stock bas). Elle reste « en attente » jusqu'à la validation ou au refus motivé de l'administrateur ; une commande créée par l'administrateur est validée directement.",
        "Bon de commande validé : imprimable pour le fournisseur. Bon de réception (administrateur, magasinier) : entrée en stock et prix d'achat mis à jour ; une commande peut être reçue en plusieurs fois.",
        "Factures fournisseurs (administrateur, magasinier, comptable) : saisie et suivi Non payée / Partielle / Payée ; l'enregistrement d'un paiement fournisseur est réservé à l'administrateur.",
      ],
    },
    {
      id: "invoices",
      title: "Factures, paiements, relances et réclamations",
      roles: "Consulter : administrateur, responsable, réception, comptable ; facturer : administrateur ; encaisser et relancer : administrateur, responsable, réception",
      links: [
        { label: "Factures clients", href: "/garage/invoices" },
        { label: "Réclamations & avis", href: "/garage/reclamations" },
      ],
      body: [
        "La facture est créée depuis l'ordre (« Facturer », administrateur) : numéro automatique, TVA par taux, droit de timbre, copie figée qui ne change plus.",
        "Paiements partiels possibles : espèces, carte, chèque, virement. Statuts : Émise, Partiellement payée, Payée.",
        "Filtres : numéro, date ou intervalle, client, véhicule, montant, reste dû, statut. Les factures en retard (délai de paiement réglé dans Paramètres) sont signalées.",
        "Relance : WhatsApp, SMS ou e-mail s'ouvre avec le message prêt ; la relance est enregistrée dans l'historique de la facture.",
        "Impression : bouton d'impression du navigateur, format A4 ; choisissez « Enregistrer en PDF » pour un fichier.",
        "Réclamations & avis (administrateur, responsable, réception) : réclamations et notes envoyées par les clients, réponse et statut Ouverte / En cours / Résolue.",
      ],
      limits: ["La relance n'est pas envoyée toute seule : c'est vous qui appuyez sur Envoyer dans WhatsApp, l'application SMS ou la messagerie."],
    },
    {
      id: "warranties",
      title: "Garanties",
      roles: "Administrateur, responsable, réception, mécanicien ; montants et décisions : administrateur, responsable",
      links: [{ label: "Garanties", href: "/garage/garanties" }],
      body: [
        "Garantie de réparation (donnée par le garage) ou de pièce (donnée par le fournisseur), par durée et/ou kilométrage : la première limite atteinte l'emporte.",
        "Ajout à la main sur l'ordre (carte « Garanties »), ou automatique à la livraison si l'administrateur l'a réglé dans Paramètres (désactivé au départ).",
        "Si rien ne permet de conclure (kilométrage actuel inconnu), la garantie est « À vérifier » : rien n'est supposé.",
        "Réclamation de garantie : Ouverte → Envoyée → Acceptée / Acceptée en partie / Refusée → Clôturée. Le mécanicien et la réception voient l'état, jamais les montants.",
        "Remboursements reçus : seulement sur une réclamation acceptée et non clôturée. Une garantie ou un remboursement s'annule avec un motif, jamais effacé.",
      ],
    },
    {
      id: "expenses",
      title: "Dépenses et échéances",
      roles: "Administrateur, responsable",
      links: [{ label: "Dépenses et échéances", href: "/garage/depenses" }],
      body: [
        "Charges du garage : loyer, salaires, électricité, crédit… une fois, tous les mois, trimestres ou ans, avec une dernière échéance facultative.",
        "La première échéance est la prochaine à payer : ne saisissez pas celles déjà réglées.",
        "« Marquer payée » : date, montant réellement payé, mode, référence. Un paiement saisi par erreur s'annule avec un motif.",
        "Modifier le montant ne change que les échéances non payées à partir d'aujourd'hui. Pour changer la fréquence : arrêter la charge et en créer une nouvelle.",
        "Dépenses directes d'une réparation (sous-traitance, remorquage…) : sur la fiche de l'ordre, annulées avec motif si besoin.",
      ],
    },
    {
      id: "cash",
      title: "Trésorerie prévisionnelle",
      roles: "Administrateur, responsable ; comptable en lecture seule",
      links: [{ label: "Trésorerie", href: "/garage/tresorerie" }],
      body: [
        "Point de départ : le solde caisse + banque saisi à la main, en fin de journée (administrateur, responsable).",
        "Prévision par semaine sur 30, 60 ou 90 jours : paiements réels depuis le solde, factures clients impayées, remboursements de garantie attendus, dettes fournisseurs et échéances de dépenses, sans double comptage.",
        "Trois scénarios (prudent, normal, optimiste) avec leurs hypothèses affichées sur la page.",
        "Avertissement si le solde a plus de 14 jours. Sans solde saisi, aucun solde n'est inventé.",
        "Alerte de solde bas (seuil et scénario dans Paramètres) : sur la page et dans Suivi & retards, pour l'administrateur et le responsable.",
      ],
      limits: [
        "Estimation, pas une comptabilité : pas de TVA à reverser, pas d'impôts, pas de rapprochement.",
        "Aucune connexion bancaire : l'argent non enregistré dans GaragePro n'est connu qu'en ressaisissant le solde.",
        "Un seul garage : pas de succursales.",
      ],
    },
    {
      id: "profitability",
      title: "Rentabilité",
      roles: "Administrateur",
      links: [{ label: "Rentabilité", href: "/garage/rentabilite" }],
      body: [
        "Sur chaque ordre : chiffre d'affaires HT, coût réel des pièces, dépenses directes, marge brute, coût de la main-d'œuvre, frais indirects, bénéfice estimé. L'encaissé est affiché à part.",
        "Le coût de la main-d'œuvre utilise les heures réellement travaillées (chronos) × coût horaire, jamais les heures facturées.",
        "Le prix d'achat d'une pièce est figé au moment où elle est utilisée.",
        "Page Rentabilité : par réparation, véhicule, client, type d'intervention ou mois, sur une période, avec export Excel.",
        "Réglages dans Paramètres (coût horaire moyen, frais indirects) ; coût horaire par employé sur sa fiche.",
      ],
      limits: ["Tout montant estimé ou incomplet (ordre pas encore facturé, ancienne pièce sans prix d'origine…) est signalé comme tel."],
    },
    {
      id: "reports",
      title: "Rapports et journal",
      roles: "Administrateur",
      links: [
        { label: "Rapports", href: "/garage/rapports" },
        { label: "Journal", href: "/garage/journal" },
      ],
      body: [
        "Rapports sur aujourd'hui, 7 jours, 30 jours ou 3 mois, comparés à la période précédente.",
        "Argent (facturé, encaissé par mode, main-d'œuvre, pièces, marge, achats), voitures reçues et livrées, pannes fréquentes, pièces, mécaniciens, réclamations et avis, et « À retenir ».",
        "Bouton « Imprimer / PDF ».",
        "Journal : qui a fait quoi et quand, avec avant → après (argent, stock, clients, équipe, paramètres…). Les lignes ne peuvent être ni modifiées ni effacées ; jamais de mot de passe dedans.",
      ],
    },
    {
      id: "team",
      title: "Équipe : pointage, congés, calendrier, attestations",
      roles: "Pointer, demander un congé, calendrier : tout le personnel sauf vendeur et responsable showroom ; équipe, borne, validations, attestations : administrateur, responsable, RH",
      links: [
        { label: "Pointage & congés", href: "/garage/pointage" },
        { label: "Borne de pointage", href: "/garage/pointage/borne" },
        { label: "Calendrier", href: "/garage/calendrier" },
        { label: "Équipe", href: "/garage/equipe" },
      ],
      body: [
        "Borne : un écran du garage affiche un code à 6 chiffres qui change toutes les 30 s, et un QR code. Chacun pointe depuis son propre compte (arrivée, pause, départ) avec ce code.",
        "Option dans Paramètres : exiger aussi le réseau du garage. Un code ne sert qu'une fois par personne ; trop d'essais faux bloquent le pointage quelques minutes.",
        "Corrections : le responsable ajoute ou corrige un pointage avec un motif obligatoire ; l'original est marqué « annulé », jamais effacé. Personne ne corrige ses propres pointages, sauf l'administrateur.",
        "Congés : congé payé, maladie, sans solde, autorisation de quelques heures, absence. Le responsable accepte ou refuse (jamais sa propre demande) ; les chevauchements sont refusés. Solde de congés payés si le nombre de jours par an est rempli sur la fiche.",
        "Calendrier jour, semaine, mois, année : congés, demandes en attente, rendez-vous, livraisons promises. Les collègues voient « Absent », pas le motif.",
        "Équipe : présence en direct, demandes à valider, fiche employé, rapport par période (Excel .xlsx, CSV, impression). Une sortie non pointée compte 0 h : rien n'est deviné.",
        "Attestation de travail : depuis la fiche employé, PDF numéroté ATT-AAAA-NNNN avec les seules informations enregistrées (entreprise + fiche). Refusée s'il manque une information.",
      ],
      limits: ["L'attestation n'a ni signature ni cachet : elle se signe et se cachette à la main."],
    },
    {
      id: "contracts",
      title: "Contrats (Tunisie)",
      roles: "Administrateur, responsable, réception, RH, comptable — selon la catégorie ; contrats de travail : administrateur et RH seulement",
      links: [
        { label: "Contrats", href: "/garage/contrats" },
        { label: "Nouveau contrat", href: "/garage/contrats/nouveau" },
        { label: "Modèles et revue juridique", href: "/garage/contrats/modeles" },
      ],
      body: [
        "Catégories : réparation (pré-remplie depuis l'ordre, prix TTC en dinars), flotte / entreprise, contrat de travail, fournisseur / partenaire, contrat vierge.",
        "Statuts : Brouillon → En validation → Revue juridique / RH → Approuvé → En attente de signature → Signé → Actif → Expiré ou Résilié → Archivé. Seul le brouillon se modifie.",
        "Signature : imprimez le PDF (avec votre logo), faites signer et cacheter à la main, puis déposez le scan (PDF, JPEG ou PNG, 10 Mo max). Le statut « Signé » n'est atteint que par ce dépôt.",
        "Contrat de travail : CDI par défaut sans date de fin ; CDD seulement avec l'un des 3 motifs légaux et sans période d'essai ; essai de 6 mois au plus. Salaire, horaires, congés et lieu sont saisis par le garage, jamais proposés.",
        "Prestataire : 4 questions détectent le risque de « sous-traitance de main-d'œuvre déguisée » et imposent la revue.",
        "Alerte avant l'échéance (30 jours par défaut, réglable sur la page Contrats). Le renouvellement n'est jamais automatique : c'est un nouveau contrat qui repasse par validation et signature.",
        "Chaque modèle reste « à valider par un juriste » tant qu'un administrateur n'a pas enregistré sa relecture.",
      ],
      limits: [
        "Aide à la rédaction, pas un avis juridique : aucun contrat n'est présenté comme « conforme ».",
        "Pas de signature électronique ; documents en français seulement (pas d'arabe dans le PDF).",
        "Pas d'e-mail à l'échéance : alerte dans l'application seulement.",
        "Un scan déposé sur le PC du garage reste sur ce PC (la ligne du contrat, elle, est synchronisée).",
      ],
    },
    {
      id: "showroom",
      title: "Showroom et messages acheteurs",
      roles: "Annonces : administrateur, responsable showroom, vendeur (lecture : responsable, réception) ; messages : administrateur, responsable showroom, vendeur",
      links: [
        { label: "Annonces", href: "/garage/showroom" },
        { label: "Nouvelle annonce", href: "/garage/showroom/new" },
        { label: "Messages acheteurs", href: "/garage/messages" },
      ],
      body: [
        "Annonce : photos, documents PDF, fiche technique, équipements, prix. Le vendeur ne modifie que ses annonces ; l'administrateur et le responsable showroom gèrent toutes les annonces.",
        "Statuts : Brouillon, En ligne, Réservé, Vendu, Indisponible, Archivé. Publier exige marque, modèle, prix et au moins une photo visible.",
        "Sur le site public : annonces en ligne et réservées ; une voiture vendue reste visible 14 jours avec le badge « Vendu ».",
        "Chaque information indique sa source : « vérifié par le garage » (d'après les données de l'atelier) ou « déclaré par le vendeur ». Immatriculation et VIN ne sont jamais publics ; les documents PDF sont privés par défaut.",
        "L'acheteur écrit sans compte et reçoit un lien privé vers sa conversation. L'équipe répond dans Messages acheteurs (non lus, filtre par annonce, mise à jour en direct).",
        "Le vendeur ne voit que les conversations de ses annonces. Fermer une conversation bloque les nouveaux messages des deux côtés.",
      ],
      limits: [
        "Aucune page de GaragePro ne vaut transfert de propriété (mutation auprès de l'ATTT).",
        "Le lien privé de l'acheteur ne peut pas être renvoyé par l'équipe : il doit recontacter le vendeur depuis l'annonce.",
        "Vendeur et responsable showroom n'ont pas le pointage.",
      ],
    },
    {
      id: "public-site",
      title: "Site public, suivi client et espace entreprise",
      roles: "Clients (sans compte) ; code de suivi : administrateur, responsable, réception",
      links: [
        { label: "Site public", href: "/" },
        { label: "Suivi de réparation", href: "/suivi" },
        { label: "Prendre rendez-vous", href: "/rdv" },
        { label: "Espace entreprise", href: "/entreprise" },
      ],
      body: [
        "Site public : accueil, page « L'atelier », assistant auto (guide de pannes, et IA si une clé est configurée), prise de rendez-vous, avis et réclamations, showroom.",
        "Suivi client : sur l'ordre, carte « Suivi client en ligne » → générer le code à 4 chiffres et l'envoyer par WhatsApp. Le client se connecte avec immatriculation + code.",
        "Le client voit les étapes en direct, le technicien, l'heure prévue, les photos marquées « Visible client », le devis à valider, la facture, et peut envoyer un message ou un avis.",
        "« Nouveau code » rend l'ancien inutilisable. L'accès est coupé 7 jours après la livraison ; trop de codes faux bloquent 15 minutes.",
        "Espace entreprise (/entreprise) : les comptes créés sur la fiche d'un client professionnel voient uniquement ses véhicules, réparations, photos et, selon le rôle, devis et factures. Mot de passe oublié par e-mail (lien valable 1 heure).",
      ],
      limits: ["Envois automatiques (code de suivi, véhicule prêt, mot de passe entreprise) seulement si SMS ou e-mail sont configurés ; sinon utilisez le bouton WhatsApp."],
    },
    {
      id: "backups",
      title: "Sauvegardes",
      roles: "Administrateur",
      links: [{ label: "Sauvegardes", href: "/garage/sauvegardes" }],
      body: [
        "Le PC du garage sauvegarde sa base chaque jour (23 h par défaut), et au démarrage si la dernière a plus de 26 h, à condition que la clé ait été créée (npm run backup:key).",
        "Chaque sauvegarde est chiffrée, copiée sur un 2e emplacement si BACKUP_COPY_DIR est réglé (clé USB, OneDrive…), puis restaurée pour de vrai dans une base jetable pour vérifier qu'elle est utilisable.",
        "La page Sauvegardes affiche l'état, la dernière réussite, la vérification et les fichiers. Alerte si la dernière a échoué, a plus de 36 h ou n'a pas pu être restaurée.",
        "Gardez une copie de la clé backup.key à part (clé USB rangée) : sans elle, aucune sauvegarde ne peut être relue.",
        "Restauration : toujours dans une base neuve et vide, jamais par-dessus la base en service (procédure dans docs/SAUVEGARDES.md).",
      ],
      limits: [
        "Les photos et vidéos ne sont pas dans la sauvegarde de la base.",
        "Pas d'e-mail en cas d'échec : alerte dans l'application et dans la fenêtre du hub.",
        "Sur le site en ligne, les sauvegardes ne tournent pas : elles sont faites par le PC du garage.",
      ],
    },
    {
      id: "settings",
      title: "Paramètres",
      roles: "Administrateur",
      links: [{ label: "Paramètres", href: "/garage/settings" }],
      body: [
        "Garage : nom, coordonnées, taux horaire, TVA, droit de timbre, délai de paiement, pied de facture, adresse publique du site, logo des documents.",
        "Forfaits (lignes de main-d'œuvre et de pièces prêtes à appliquer sur un ordre).",
        "Équipe : créer un compte, changer le rôle ou le mot de passe, désactiver, supprimer. Il reste toujours au moins un administrateur actif ; un administrateur ne change pas son propre rôle.",
        "Rendez-vous en ligne, e-mails (avec envoi de test), rappels et alertes, pointage, alertes de retard, rentabilité, garantie automatique, alerte de trésorerie, objectif mensuel.",
        "Les changements de paramètres sont enregistrés dans le Journal.",
      ],
      limits: ["Les clés techniques (SMS, e-mail, IA, APP_URL, sauvegardes) se règlent dans le fichier .env du serveur, pas dans cette page."],
    },
    {
      id: "roles-access",
      title: "Rôles, accès et « À traiter »",
      roles: "Tout le personnel",
      links: [
        { label: "À traiter", href: "/garage/a-traiter" },
        { label: "Paramètres (rôles)", href: "/garage/settings" },
      ],
      body: [
        "Administrateur : tout, dont facturer, valider les achats, payer les fournisseurs, rapports, rentabilité, journal, sauvegardes et paramètres.",
        "Responsable : atelier, clients, factures (encaisser, relancer), suivi & retards, équipe et congés, contrôle qualité, dépenses, trésorerie, montants de garantie, contrats sauf contrats de travail.",
        "Réception : ordres, clients, véhicules, rendez-vous, factures (encaisser, relancer), réclamations, suivi & retards, garanties sans montants, contrats réparation et flotte.",
        "Mécanicien : ordres, atelier mobile, clients et véhicules, OBD, chrono, checklist qualité, garanties sans montants, stock en lecture.",
        "Magasinier : stock, fournisseurs, demandes d'achat, réceptions, factures fournisseurs. RH : pointage, équipe, congés, borne, attestations, contrats de travail. Comptable : finances, factures en lecture, factures fournisseurs, trésorerie en lecture, contrats en lecture (sauf travail).",
        "Vendeur : ses annonces et leurs messages. Responsable showroom : toutes les annonces et toutes les conversations.",
        "Menu du compte (initiales, en haut à droite) : Équipe, Contrats, Aide et Paramètres selon le rôle, la langue, l'état du serveur du garage et la déconnexion. Cette aide : /garage/aide.",
        "La cloche liste ce qui est incomplet et ce qui attend la validation d'un responsable ou d'un administrateur ; « Tout voir » ouvre la page À traiter.",
      ],
      limits: ["Les droits sont vérifiés par le serveur : un bouton masqué ne peut pas être contourné. Pour changer un rôle, demandez à l'administrateur (Paramètres → Équipe)."],
    },
    {
      id: "offline",
      title: "Hors ligne et mises à jour",
      roles: "Tout le personnel",
      links: [],
      body: [
        "Sur le Wi-Fi du garage, l'application fonctionne sans internet grâce au PC du garage.",
        "Si le réseau coupe, les pages déjà ouvertes sur cet appareil restent consultables avec un bandeau « Hors ligne » ; un message s'affiche quand la connexion revient.",
        "Une page jamais ouverte sur cet appareil affiche « Pas de connexion » avec un bouton Réessayer.",
        "Rien n'est enregistré hors ligne : les modifications (formulaires, photos, paiements) partent toujours vers le serveur. Les données privées ne sont pas gardées par le navigateur et la déconnexion efface les pages gardées.",
        "Quand le PC du garage redémarre ou se met à jour, il continue de servir la version précédente pendant qu'il prépare la nouvelle ; la coupure au moment du basculement ne dure que quelques secondes. Si une page ne répond pas, réessayez dans une minute.",
      ],
      limits: ["Sans le PC du garage et sans internet, rien ne peut être enregistré."],
    },
  ] as HelpSection[],
  faq: [
    {
      q: "La page « Pas de connexion » s'affiche. Que faire ?",
      a: "L'appareil ne joint pas le serveur et cette page n'avait jamais été ouverte ici. Au garage, vérifiez que vous êtes sur le Wi-Fi du garage et que le PC du garage est allumé avec le hub lancé. Ailleurs, vérifiez internet. Puis appuyez sur Réessayer ; après une mise à jour du PC du garage, réessayez dans une minute.",
    },
    {
      q: "Le téléphone n'ouvre pas l'adresse du PC du garage (http://…:3000).",
      a: "Le téléphone doit être sur le même Wi-Fi que le PC du garage (pas en 4G). L'adresse IP du PC a peut-être changé : relisez celle affichée dans la fenêtre du hub, et réservez une adresse fixe dans la box. Au premier lancement, Windows demande l'accès réseau pour Node.js : il faut autoriser les réseaux privés.",
    },
    {
      q: "Le QR Code d'un véhicule ouvre une mauvaise adresse ou ne s'ouvre pas.",
      a: "Le QR utilise l'adresse publique du site (APP_URL, ou « Adresse publique du site » dans Paramètres), donc internet est nécessaire pour l'ouvrir. Si l'adresse est fausse, corrigez-la, puis réimprimez l'étiquette. Si le QR a été renouvelé ou révoqué, l'ancienne étiquette ne fonctionne plus.",
    },
    {
      q: "Comment imprimer une facture, un devis ou un bon, ou en faire un PDF ?",
      a: "Ouvrez le document et utilisez son bouton d'impression (ou Ctrl+P). Choisissez le format A4 ; pour un fichier, choisissez « Enregistrer en PDF » comme imprimante. Les documents imprimés sont toujours sur fond blanc, avec le logo réglé dans Paramètres.",
    },
    {
      q: "J'ai oublié mon mot de passe (équipe).",
      a: "Il n'y a pas de lien « mot de passe oublié » pour l'équipe. Demandez à un administrateur : Paramètres → Équipe → Gérer → Changer le mot de passe. Sans administrateur disponible, sur le PC du garage, dans le dossier GaragePro : npm run reset-access -- EMAIL NOUVEAU_MOT_DE_PASSE (8 caractères minimum).",
    },
    {
      q: "Mon compte est bloqué après plusieurs essais.",
      a: "Après 5 mots de passe faux, la connexion est bloquée 15 minutes. Attendez, ou demandez à l'administrateur de lancer sur le PC du garage npm run reset-access -- EMAIL, qui débloque et réactive le compte. Un compte désactivé se réactive aussi dans Paramètres → Équipe.",
    },
    {
      q: "Une page n'apparaît pas dans mon menu.",
      a: "Le menu ne montre que les pages autorisées pour votre rôle (voir la rubrique « Rôles, accès et À traiter »). Certaines pages sont dans le panneau « Plus » ou dans le menu du compte. Si votre travail l'exige, demandez à l'administrateur de changer votre rôle.",
    },
    {
      q: "La page Sauvegardes signale un échec ou une sauvegarde trop ancienne.",
      a: "Vérifiez que le PC du garage est allumé et que le hub tourne : c'est lui qui sauvegarde. Lisez le message dans la fenêtre du hub. Si la clé n'existe pas, créez-la (npm run backup:key) ; vérifiez que la clé USB ou le dossier de copie est branché ; testez avec npm run backup, qui doit afficher « RESTAURATION TESTÉE ».",
    },
    {
      q: "Le démarrage est long après une mise à jour.",
      a: "Après un changement de version, le PC du garage prépare la version rapide (1 à 2 minutes) et met à jour sa base. Pendant ce temps, la version précédente continue de servir ; la coupure au basculement ne dure que quelques secondes. Si une page ne répond pas, réessayez dans une minute.",
    },
    {
      q: "Comment changer la langue ? L'arabe s'affiche de droite à gauche.",
      a: "Menu du compte (initiales, en haut à droite) → Langue : Français, العربية ou English. L'arabe affiche toute l'interface de droite à gauche. Le choix est gardé par ce navigateur. Les contrats PDF restent en français.",
    },
    {
      q: "Je ne peux pas passer un ordre à « Prêt ».",
      a: "La checklist de contrôle qualité doit être remplie puis validée par un responsable ou l'administrateur. Si un point a été modifié après la validation, ou si la voiture est repassée en réparation, il faut valider de nouveau.",
    },
    {
      q: "Une modification faite au garage n'apparaît pas sur le site en ligne.",
      a: "La synchronisation passe toutes les 30 secondes quand internet fonctionne. Regardez l'état dans le menu du compte (« Serveur du garage » : synchronisé, en attente ou internet coupé). Un conflit impossible à fusionner (même plaque créée des deux côtés) s'affiche dans la fenêtre du hub et est réessayé.",
    },
    {
      q: "L'adaptateur OBD n'est pas trouvé.",
      a: "Utilisez Chrome ou Edge sur un ordinateur, sur le PC du garage (localhost) ou le site en ligne. Choisissez le bon port COM, contact mis, adaptateur bien enfoncé ; fermez les autres logiciels qui utilisent le port. Les adaptateurs Wi-Fi et Bluetooth Low Energy ne sont pas pris en charge.",
    },
  ] as HelpFaq[],
};
