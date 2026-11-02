# Leggende di Valmora 2

Gioco di avventura e cattura di creature (i Velmon) in 3D, nel browser e installabile su iPhone.
Rifatto da zero rispetto alla v1: stile Pokémon Sole e Luna, colori tropicali caldi, tutto modellato
nel codice (nessun modello o texture scaricati), arcipelago di isole con paesi e percorsi.

- Design del gioco: [`docs/GDD.md`](docs/GDD.md)
- Architettura e contratti tra i moduli: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Strumenti di test (server locale, screenshot headless): [`tools/README.md`](tools/README.md)

## Avvio in locale
```bash
cd tools && npm install && cd ..
node tools/serve.mjs 8790        # poi apri http://localhost:8790/
```
Nessun passo di build: moduli ES nativi, three.js r160 in `vendor/`.

## Comandi
| | Tastiera | iPhone |
|---|---|---|
| Muoversi | WASD / frecce | joystick: appare dove tocchi con il pollice sinistro |
| Correre | tieni premuto Shift (o R per attivare/disattivare) | spingi il joystick fino al bordo, o il tasto **Corri** |
| Azione (parla, entra, raccogli…) | E / Invio / Spazio | tasto **A** (mostra l'azione del momento) |
| Indietro | Esc / Backspace | tasto **B** |
| Menu / Mappa | Tab o P / M | ☰ / 🗺️ |
| Zoom | rotella del mouse | pizzica con due dita |
| Trucchi | Shift+M monete, Shift+L livello | triplo tocco sul contatore monete / sulla squadra |

## Installare su iPhone
Apri il gioco in Safari → Condividi → **Aggiungi alla schermata Home**. Si apre a tutto schermo, funziona
anche offline e si aggiorna da solo (al riavvio compare "Aggiornamento pronto").

## Opzioni dall'indirizzo
`?quality=low|mid|high` forza la qualità grafica · `?skiptitle` salta la schermata del titolo (`&newgame` per una
partita nuova) · `?debug` attiva gli strumenti di test (`window.__valmora`, vedi `tools/README.md`).

## Pubblicare una nuova versione
`node tools/sw-assets.mjs` (aggiorna l'elenco dei file per l'uso offline), poi aumenta `CACHE` in `sw.js`.
