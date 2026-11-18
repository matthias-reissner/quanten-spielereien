# quanten-spielereien
Spielereien mit Quantencomputing

## Mühle gegen die Quanten-KI

[Jetzt online spielen](https://matthias-reissner.github.io/quanten-spielereien/)

Öffne `index.html` in einem aktuellen Browser, um direkt loszuspielen. Es ist keine Installation oder ein Build-Schritt nötig.

Die KI ist hybrid: Mühlenzüge werden klassisch bewertet; ein lokaler Statevector-Simulator führt anschließend einen Grover-Quantenschaltkreis mit Hadamard-, Oracle-, X-, Mehrfach-Z- und Messgattern aus. Die Live-Grafik zeigt die tatsächlich angewendeten Gatter und den Messzustand. Es wird keine Quantenhardware verwendet; die Messung nutzt Pseudozufall.

Die Stärke lässt sich im Spiel auf Leicht (gleichverteilte Messung), Mittel (Grover-Auswahl aus guten Kandidaten) oder Schwer (klassische Suche nach guten Gegenzügen, danach Grover-Auswahl) einstellen.

Während die KI am Zug ist, wird der konkrete Gate-Ablauf in Echtzeit angezeigt.
