# U18 Basketball Teamplaner

Live-App: https://cango90.github.io/U18_Basketball_Planner/

## Funktionen

- Persönlicher Login über Zugang-ID und Zugangscode
- U18-Spielplan, Trainings, Zu-/Absagen und klickbare Hallenadressen
- Vier Aufgaben je Spiel: 24 Sekunden, Anschreiber (NBB/iPad), Anzeigetafel/Zeitnahme und Trikottasche
- Aufgabenhistorie und Trainer-Zuteilung
- Kader mit Positionsprofilen sowie persönliche Saisonstatistiken
- Traineransicht für Team-Updates und Aufgabenfreigaben

## Firebase

Die App nutzt Firebase Authentication und Cloud Firestore. Vor dem Live-Test
müssen die Regeln aus [firestore.rules](firestore.rules) in der Firebase
Console veröffentlicht sein. Berk-Can Çelebi ist als Club-Admin, U18-Trainer
und Spieler zugleich vorgesehen; diese Rollen sind additiv.
