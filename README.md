# Říše (Louka)

Survival hra v prohlížeči, kterou vymyslel a postavil Marek a kterou teď rozvíjíme spolu na AI kroužku.
Přežij, sbírej, stav a objevuj: lesy a biomy, podzemí s rudami, zvířata a noční stínožrouti, vaření, pole,
pec, elektřina, auto, letadlo, počítač s hrami a portál do Markovy dimenze. Všechno, co hra umí, je v
[docs/FEATURES.md](docs/FEATURES.md).

## Jak hrát

Otevři hru, napiš své jméno a vyber:

- **Hra pro jednoho** – svět se ukládá v tvém prohlížeči.
- **Hlavní svět**, **Kreativní svět** – světy serveru kroužku, každý má svoje velké tlačítko. Poprvé hra chce
  **heslo kroužku**, pak si ho pamatuje.
- **Další možnosti ▸**
  - **Vytvořit server na svém počítači** – tvůj prohlížeč je server. Dostaneš kód (např. `LOUKA-7K2F`), pošli ho
    kamarádům. Nech hru otevřenou, dokud ostatní hrají.
  - **Připojit se kódem** – napiš kód od kamaráda (stačí 4 znaky).

Ovládání: WASD chůze · Shift běh · Mezerník skok · levé tlačítko těžba/útok · pravé položit/použít/jíst ·
E inventář · G vyhodit · C kreativní režim · H návod · T chat · Esc menu. Na telefonu a tabletu je dotykové ovládání.

## Spuštění na počítači

Potřebuješ [Node.js](https://nodejs.org) 20 nebo novější.

```bash
npm install          # jednou
npm run dev          # hra: otevři http://localhost:5173
```

Vlastní stálý server (svět se ukládá na disk, hráči se připojí adresou):

```bash
npm run build        # sestaví hru do složky dist/
npm start            # server: http://localhost:8787 (hra i připojení)
```

Jak server provozovat na VPS nebo na notebooku: [docs/HOSTING.md](docs/HOSTING.md).

## Jak přidat něco do hry

Návod pro děti je v [CONTRIBUTING.md](CONTRIBUTING.md), pravidla a mapa kódu pro AI pomocníky v [AGENTS.md](AGENTS.md).
Známé chyby a co ještě chybí: [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md).

## Co je kde

```
index.html     menu a HUD
client/src/    hra v prohlížeči (Three.js): kreslení, zvuk, ovládání, okna
shared/        pravidla a data hry (předměty, recepty, bloky, tvorové…) – stejná v prohlížeči i na serveru
server/        stálý server v Node.js
tests/         automatické testy (i zahrání hry v prohlížeči)
legacy/        Markova původní verze v jednom souboru (pro srovnání)
```
