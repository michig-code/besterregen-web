# Bester Regen

Webseite für die Level-Listen der **Bester Regen** Discord-Community. Hier werden die Listen angezeigt, Level eingereicht und später Rechte über den Discord-Login vergeben.

---

## Inhalt des Repositorys

| Datei | Zweck |
|---|---|
| `index.html` | Startseite mit allen Listen |
| `einreichen.html` | Seite zum Einreichen von Leveln (Platzhalter) |
| `data/listen.json` | Alle Listen und Level, hier wird gepflegt |
| `css/style.css` | Design, passt sich dem hellen und dunklen Modus an |
| `js/app.js` | Lädt die Listen aus `listen.json` und zeigt sie an |

## Neue Liste oder neues Level eintragen

1. `data/listen.json` öffnen.
2. Eine neue Liste unter `lists` ergänzen oder ein Level in die bestehende Liste schreiben.
3. Die Reihenfolge im `levels`-Array bestimmt den Platz (Platz 1 steht oben).
4. Änderung speichern, committen und pushen. Die Seite aktualisiert sich dann automatisch.

Beispiel für ein Level:

```json
{ "name": "Name des Levels", "creator": "Creator" }
```

---

## Server-Regeln

Mit dem Beitritt zum Discord-Server akzeptierst du diese Regeln. Bei Verstößen folgen Konsequenzen, Timeouts und Banns werden konsequent durchgesetzt. Bei der Nutzung von Zweitaccounts folgt ein IP-Ban.

### 1. Allgemeine Regeln

**1.1 Respektvoller Umgang** *(ggf. Timeout)*
- Behandle alle Mitglieder mit Respekt.
- Kein Mobbing, keine Beleidigungen, keine Diskriminierung.
- Diskussionen sind erlaubt, Streit, Drama und Provokationen nicht.

**1.2 Keine Werbung** *(ggf. Timeout)*
- Keine Werbung für andere Discord-Server ohne Erlaubnis (Absprache mit Mods oder Owner).
- Keine Eigenwerbung (YouTube, TikTok, Twitch usw.) außerhalb des dafür vorgesehenen Channels `#eigene-werbung`.

**1.3 Angemessene Inhalte** *(ggf. Bann/Kick)*
- Kein NSFW-Inhalt.
- Keine extremen oder illegalen Inhalte.
- Keine Sticker mit Körperteilen oder NSFW-Inhalten.

**1.4 Leaken** *(ggf. Timeout)*
- Private Nachrichten oder andere private Inhalte nur mit einem triftigen Grund zeigen, z. B. zur Klärung eines Missverständnisses. Sonst wird das Bild direkt gelöscht.
- Wer die Kamera einschaltet, sollte bedenken, dass der Server ein öffentlicher Raum ist.

**1.5 Voice-Chat** *(ggf. Timeout)*
- Hintergrundgeräusche vermeiden und Krisp zur Rauschunterdrückung nutzen.
- Im Call darf alles gesagt werden, aber niemand darf gemobbt werden.
- Die meisten Mitglieder sind minderjährig, und das Alter kann stark variieren.
- Bei größeren Runden oder Gesprächen bitte die anderen Call-Kanäle nutzen.

### 2. Geometry-Dash-Regeln

**2.1 Level-Sharing** *(ggf. Timeout)*
- Level nur im dafür vorgesehenen Channel posten.
- Kein permanentes Pushen des eigenen Levels.
- Konstruktive Kritik von anderen annehmen.

**2.2 Fair Play** *(ggf. Bann/Kick)*
- Kein Cheaten, Hacken oder Vortäuschen von Können.
- Keine gefälschten Completion-Videos oder anderen Fake-Inhalte.
- Andere Creator und ihre Arbeit respektieren.

**2.3 Demon-Diskussionen** *(ggf. Timeout)*
- Keine sinnlosen Vergleiche („Mein Demon ist schwerer als deiner“).
- Jeder Fortschritt zählt, egal ob Easy Demon oder Extreme Demon.
- Bei Diskussionen über Top-Level bitte sachlich bleiben, ohne Beleidigungen.

**2.4 Angepinnte Level**
- Alle Level, die auf dem Server gebeatet werden, werden angepinnt.
- Eigene Completions bitte in `#gd-progress` posten.
- Gilt ab Difficulty **Insane Demon**.

---

## Hosting

Die Seite ist statisch und wird über **Cloudflare Pages** veröffentlicht:
- Repository mit Cloudflare Pages verbinden.
- Kein Build-Schritt nötig, der Ausgabeordner ist der Hauptordner (leer lassen).
- Jeder Push auf `main` veröffentlicht die Seite neu.

Die eigene Domain wird über einen DNS-Eintrag bei OVH angebunden.

---

*Ziel ist eine freundliche, starke Community mit Spaß am Spiel!* 💛
