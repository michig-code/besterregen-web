// Übersetzung ins Englische: übersetzt feste deutsche Texte (Wörterbuch) und Muster mit Zahlen.
// Wird nur im Englisch-Modus ausgeführt. Texte, die nicht im Wörterbuch stehen, bleiben deutsch.
(function () {
  const DICT = {
    // Navigation & Footer
    "Listen": "Lists", "Statistiken": "Statistics", "Regeln": "Rules", "Einsenden": "Submit",
    "Support": "Support", "Discord": "Discord", "Discord beitreten": "Join Discord", "Datenschutz": "Privacy",
    "Impressum": "Legal notice", "Verwaltung": "Admin", "Moderation": "Moderation", "Rollen & Mitglieder": "Roles & members",
    "Einstellungen": "Settings", "Abmelden": "Log out", "Anmelden": "Log in", "Mit Discord anmelden": "Log in with Discord",
    "Zur Anmeldung": "Go to login", "Zur Rangliste": "Go to the ranking", "Benachrichtigungen": "Notifications",
    "Noch keine Benachrichtigungen.": "No notifications yet.", "Alle als gelesen": "Mark all as read",
    "Sprache wechseln": "Switch language", "Verifizieren": "Verify", "Einreichen": "Submit",
    "© 2026 Bester Regen": "© 2026 Bester Regen", "Lädt …": "Loading …", "Lädt": "Loading",
    "Zurück zur Liste": "Back to list", "Zurück": "Back", "Speichern": "Save", "Abbrechen": "Cancel",
    "Entfernen": "Remove", "Löschen": "Delete", "Bearbeiten": "Edit", "Hinzufügen": "Add", "Mehr laden": "Load more",
    "Ja": "Yes", "Nein": "No", "Schließen": "Close", "Alle": "All",
    // Startseite
    "Deutsche Geometry Dash Community": "German Geometry Dash community",
    "Bester Regen": "Bester Regen",
    "Die besten Level unserer Community.": "The best levels of our community.",
    "Level suchen …": "Search levels …", "Keine Treffer.": "No results.",
    "Noch keine Listen vorhanden.": "No lists yet.", "Hier gibt es noch keine Level.": "There are no levels here yet.",
    "Die Listen konnten nicht geladen werden.": "The lists could not be loaded.",
    "Melde dich an, um diese Liste zu abonnieren und über neue Level informiert zu werden.": "Log in to subscribe to this list and get notified about new levels.",
    "Abonniert": "Subscribed", "Abonnieren": "Subscribe",
    "Du bekommst Benachrichtigungen zu neuen Leveln dieser Liste.": "You will get notified about new levels in this list.",
    "Lass dich über neue Level dieser Liste informieren.": "Get notified about new levels in this list.",
    "Listenteam": "List team", "Bei Problemen mit der Liste wende dich an:": "For problems with the list, contact:",
    "Editoren": "Editors", "Helfer": "Helpers", "Noch kein Team eingetragen.": "No team entered yet.",
    "Einsenden": "Submit", "Jetzt einsenden": "Submit now", "Zu den Regeln": "Read the rules",
    "Level oder Record einsenden. Jeder Eintrag wird von Hand geprüft.": "Submit a level or record. Every entry is checked by hand.",
    "Bitte vor dem Einsenden lesen. Was gegen die Regeln verstößt, wird abgelehnt.": "Please read before submitting. Anything that breaks the rules is rejected.",
    "Hier wird diskutiert und neue Einsendungen werden angekündigt.": "This is where discussion happens and new submissions are announced.",
    "Wer hat die meisten Punkte? Wer hat die meisten Level erstellt?": "Who has the most points? Who has created the most levels?",
    "Die Discord-Zahlen sind gerade nicht verfügbar.": "The Discord numbers are not available right now.",
    "online": "online", "Mitglieder": "members",
    // Level-Seite
    "Kein Level ausgewählt.": "No level selected.", "Platz": "Place", "Liste": "List", "Punkte": "Points",
    "Level-Infos": "Level info", "Position": "Position", "Creator": "Creator", "Verifier": "Verifier",
    "Level-ID": "Level ID", "Länge": "Length", "Erweitert": "Advanced", "Kategorie": "Category",
    "Schwierigkeit": "Difficulty", "Benötigter Fortschritt": "Required progress", "Song": "Song",
    "Objekte": "Objects", "NONG": "NONG", "Completions": "Completions", "Mitwirkende": "Contributors",
    "Community Beat: Die Punkte werden gleichmäßig verteilt.": "Community beat: points are split evenly.",
    "Noch keine Mitwirkenden eingetragen.": "No contributors entered yet.",
    "Verifizierungs-Video": "Verification video", "Video ansehen": "Watch video",
    "Klicke, um das Video von YouTube zu laden. Vorher wird nichts an Google übertragen.": "Click to load the video from YouTube. Nothing is sent to Google before that.",
    "Records": "Records", "Noch keine bestätigten Records.": "No confirmed records yet.", "Sei der Erste!": "Be the first!",
    "Record einsenden": "Submit a record", "Im Browser öffnen": "Open in browser", "Video": "Video",
    // Einsenden
    "Bitte vorher die": "Please read the", "Einsendungs-Regeln": "submission rules", "lesen.": "first.",
    "Level einsenden": "Submit a level", "Record einsenden": "Submit a record",
    "Level-Name": "Level name", "Länge in Sekunden": "Length in seconds", "Video-Link": "Video link",
    "Bild (optional, max. 2 MB)": "Image (optional, max. 2 MB)", "Dein Spielername": "Your player name",
    "Anmerkung (optional)": "Note (optional)", "Level": "Level", "Bitte wählen …": "Please choose …",
    "Bitte zuerst mit Discord anmelden.": "Please log in with Discord first.",
    "Zum Einsenden bitte zuerst mit Discord anmelden.": "To submit, please log in with Discord first.",
    "Bild wird hochgeladen …": "Uploading image …", "Level wird eingesendet …": "Submitting level …",
    "Record wird eingesendet …": "Submitting record …",
    "Danke! Dein Level wurde eingesendet und wird geprüft.": "Thanks! Your level has been submitted and will be checked.",
    "Danke! Dein Record wurde eingesendet und wird geprüft.": "Thanks! Your record has been submitted and will be checked.",
    // Statistiken
    "Rangliste": "Ranking", "Punkte kommen aus bestätigten Records. Erstellte Level werden separat gezählt.": "Points come from confirmed records. Created levels are counted separately.",
    "Spieler suchen …": "Search players …", "Platz ": "Rank ", "Spieler": "Player", "Erstellt": "Created",
    "Gleiche Punktzahl bedeutet gleicher Platz (=).": "Equal points means the same rank (=).",
    // Regeln (Rest)
    "Einreichungs-Regeln": "Submission rules",
    // Support
    "Hilfe": "Help", "Häufige Fragen": "Frequently asked questions", "Kontakt": "Contact",
    "Die schnellste Hilfe bekommst du im Discord-Server.": "The fastest help is on the Discord server.",
    "Wie reiche ich ein Level ein?": "How do I submit a level?", "Wie reiche ich einen Record ein?": "How do I submit a record?",
    "Warum wurde mein Eintrag abgelehnt?": "Why was my entry rejected?", "Muss ich einen GD-Account verknüpfen?": "Do I have to link a GD account?",
    "Wie melde ich ein Problem mit der Seite?": "How do I report a problem with the site?",
    // Einstellungen
    "Dein Konto": "Your account", "Du bist nicht angemeldet.": "You are not logged in.",
    "Discord-ID": "Discord ID", "GD-Account": "GD account", "Noch nicht verknüpft.": "Not linked yet.",
    "GD-Account verknüpfen": "Link GD account", "Verknüpfung prüfen": "Check link", "Neu verknüpfen": "Link again",
    "Verknüpfung entfernen": "Remove link", "Optional. Du kannst die Seite auch ohne GD-Account nutzen.": "Optional. You can use the site without a GD account.",
    "Rechte auf der Seite": "Permissions on the site", "Keine besonderen Rechte.": "No special permissions.",
    "Abmelden löscht die Sitzung auf dem Server und auf diesem Gerät.": "Logging out deletes the session on the server and on this device.",
    "Land": "Country", "Keine Angabe": "Not specified", "Benachrichtigungen": "Notifications",
    "Browser-Benachrichtigungen erlauben": "Allow browser notifications", "Konto": "Account",
    // Verwaltung / Moderation
    "Nur für Teammitglieder": "Team members only", "Warteschlange": "Queue",
    "Listen & Reihenfolge": "Lists & order", "Discord-Benachrichtigungen": "Discord notifications",
    "Alles erledigt. Keine offenen Einsendungen.": "All done. No open submissions.",
    "Du hast keinen Zugriff auf diesen Bereich.": "You do not have access to this area.",
    "Bitte zuerst anmelden.": "Please log in first.", "Annehmen": "Accept", "Ablehnen": "Reject",
    "Bestätigen": "Confirm", "Video öffnen": "Open video", "Platz (leer = ans Ende)": "Place (empty = end)",
    "Neue Liste": "New list", "Liste anlegen": "Create list", "Name": "Name", "Kürzel (Link)": "Short name (link)",
    "Anzahl Plätze": "Number of places", "Team": "Team", "Importieren": "Import", "Sync": "Sync",
    "Neue Rolle": "New role", "Rolle speichern": "Save role", "Rollen": "Roles", "Rechte": "Permissions",
    "Mitglieder": "Members", "Name suchen …": "Search name …", "Protokoll": "Log",
    "Mitglieder aktualisieren": "Update members", "Synchronisation aktiv": "Sync active",
    "Jetzt synchronisieren": "Sync now", "Einstellungen speichern": "Save settings",
    "Zurück zur Liste": "Back to list", "Alle entfernen": "Remove all",
    // Cookie-Hinweis (bereits zweisprachig)
    // Profil-Menü & Verwaltung (Bereiche)
    "Verwaltung": "Admin", "Support": "Support",
    // Rechtliches
    "Rechtliches": "Legal", "Angaben gemäß § 5 DDG": "Information according to § 5 DDG",
    // Allgemein
    "Hinweis": "Note", "Ok": "OK", "Weiter": "Next", "Vorherige": "Previous", "Nächste": "Next",
  };

  // Muster mit Zahlen oder Platzhaltern
  const PATTERNS = [
    [/^(\d+) Level$/, "$1 levels"],
    [/^(\d+) Einträge gefunden\.?$/, "$1 entries found."],
    [/^(\d+) von (\d+) Mitgliedern$/, "$1 of $2 members"],
    [/^(\d+) von (\d+) Spielern$/, "$1 of $2 players"],
    [/^(\d+) Punkte$/, "$1 points"],
    [/^(\d+) Completions$/, "$1 completions"],
    [/^Stand: (.+)$/, "Last update: $1"],
    [/^Letzter Lauf erfolgreich: (.+)$/, "Last run successful: $1"],
    [/^Letzter Lauf fehlgeschlagen: (.*)$/, "Last run failed: $1"],
    [/^Nächster Abruf möglich in ca\. (\d+) Min\.$/, "Next sync possible in about $1 min."],
    [/^Noch nie synchronisiert\.$/, "Never synchronized."],
    [/^Wird gerade synchronisiert \.\.\.$/, "Synchronizing right now …"],
    [/^Platz (\d+)$/, "Rank $1"],
    [/^#(\d+)$/, "#$1"],
    [/^(\d+) Min\.$/, "$1 min"],
    [/^(\d+) s$/, "$1 s"],
    [/^(\d+) %$/, "$1 %"],
  ];

  function tr(text) {
    const key = text.trim();
    if (!key) return null;
    if (Object.prototype.hasOwnProperty.call(DICT, key)) return DICT[key];
    for (const [re, rep] of PATTERNS) {
      if (re.test(key)) return key.replace(re, rep);
    }
    return null;
  }

  function translateNode(node) {
    const t = node.nodeValue;
    const out = tr(t);
    if (out !== null && out !== t.trim()) {
      node.nodeValue = t.replace(t.trim(), out);
    }
  }

  function walk(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentNode && /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(translateNode);
    root.querySelectorAll ? root.querySelectorAll("[placeholder],[aria-label],[title]").forEach((el) => {
      ["placeholder", "aria-label", "title"].forEach((attr) => {
        if (el.hasAttribute(attr)) {
          const out = tr(el.getAttribute(attr));
          if (out !== null) el.setAttribute(attr, out);
        }
      });
    }) : null;
  }

  function start() {
    if (document.documentElement.dataset.lang !== "en") return;
    document.documentElement.lang = "en";
    walk(document.body);
    // Dynamisch nachgeladene Inhalte ebenfalls übersetzen
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 3) translateNode(n);
          else if (n.nodeType === 1) walk(n);
        });
        if (m.type === "characterData" && m.target.nodeType === 3) translateNode(m.target);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
