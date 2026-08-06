# U18 Teamplaner · Push-Versand

Dieser Cloudflare Worker ist der einzige Ort für Geräte-Abos, geplante Sendungen und den privaten VAPID-Schlüssel. Keine Geheimnisse gehören in die Website oder nach GitHub.

## Einmalige Einrichtung

1. Bei Cloudflare anmelden und in diesem Ordner `npm install` ausführen.
2. Mit `npx web-push generate-vapid-keys` ein Schlüsselpaar erzeugen.
3. Worker mit `npx wrangler deploy` veröffentlichen.
4. Die drei Geheimnisse setzen: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
5. Die veröffentlichte Worker-Adresse in `index.html` als `PUSH_SERVICE_URL` eintragen und erneut veröffentlichen.

Der Worker prüft vor einer Anmeldung oder einem Versand den Firebase-Login. Nur Trainer und Berk als Club-Admin können Sendungen auslösen. Einträge werden in der Durable Object-Datenhaltung verwaltet; abgelaufene Browser-Abos werden automatisch entfernt.
