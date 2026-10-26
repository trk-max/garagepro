/** feat/staff-ux — prise en charge d'abord, QR du véhicule sur les documents, ticket manuel de l'accueil. */
export const staffUxFr = {
  intake: {
    firstTitle: "À faire d’abord : la prise en charge",
    firstHint: "Remplissez l’ordre de réparation puis faites signer le client. Une fois signée, la prise en charge se range derrière un bouton.",
    show: "Prise en charge signée — voir",
    hide: "Masquer la prise en charge",
  },
  qr: {
    carnet: "Carnet du véhicule",
    scan: "Scannez pour ouvrir le carnet du véhicule",
  },
  ticket: {
    nav: "Ticket manuel",
    title: "Ticket manuel",
    subtitle: "Pour un client qui n’a pas pris de ticket à la borne. Le ticket peut aussi être envoyé sur son téléphone.",
    open: "Ticket manuel",
    back: "Retour au poste d’accueil",
    phoneTitle: "Envoyer le ticket au téléphone du client (facultatif)",
    phoneHint: "Le client reçoit un message avec son numéro et le lien de suivi, puis « encore N personnes » et « c’est votre tour ». Seulement avec son accord.",
    email: "E-mail (facultatif)",
    consent: "Le client accepte de recevoir des messages (SMS / e-mail) pour ce ticket — aucun autre usage.",
    langs: { fr: "Français", ar: "العربية", en: "English" },
    lang: "Langue des messages",
    created: "Ticket {ticket}",
    scan: "Le client peut scanner ce code pour suivre son tour sur son téléphone.",
    link: "Lien de suivi",
    noLink: "Adresse du site non configurée : le lien de suivi n’est pas disponible.",
    another: "Nouveau ticket",
    sent: {
      SENT: "Message envoyé au client.",
      PENDING: "Message en file d’attente : il partira dès que possible.",
      FAILED: "L’envoi a échoué : nouvel essai automatique.",
      SKIPPED: "Aucun canal d’envoi configuré (SMS) : aucun message n’est parti.",
      NONE: "Pas de téléphone ou pas d’accord du client : aucun message.",
    },
  },
};
