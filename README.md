# Říše (Louka)

Survival hra v prohlížeči pro celý kroužek: kácej stromy, těž kámen a železo, vyráběj nástroje,
stav, peč maso u táboráku a přežij noc se *stínožrouty*. Spolu ve **stejném světě**, který tu je i příští týden.

![Dva hráči ve stejném světě](docs/screenshot.png)

## Jak hrát

1. Otevři odkaz hry (od Richarda).
2. Napiš své **jméno** a **heslo kroužku** → **Hrát spolu**. (Bez internetu: **Hrát sám**.)
3. Klikni do hry.

Ovládání je jako v Minecraftu. Celý seznam je ve hře: **E → Ovládání**.

| Ovládání | |
|---|---|
| W A S D | chůze, **2× W** nebo **Ctrl** běh, **Shift** plížení (z okraje bloku nespadneš), **mezerník** skok |
| myš | rozhlížení |
| levé tlačítko (drž) | kácet, těžit, sekat trávu, útočit (ve výskoku kritický zásah) |
| pravé tlačítko | položit blok, jíst, otevřít pracovní stůl / táborák (se Shiftem na něj položíš blok) |
| prostřední tlačítko | vzít do ruky blok, na který míříš |
| Q / Ctrl+Q | vyhodit jeden kus / celou hromádku (kdokoli ji sebere) |
| F | prohodit ruce: v druhé ruce může být pochodeň nebo jídlo |
| E | inventář a výroba (Esc zavře) |
| 1–9, kolečko | výběr v hotbaru |
| Tab | kdo je ve hře |
| F1 · F2 · F3 · F5 · F11 | schovat HUD · snímek obrazovky · ladicí údaje · pohled zezadu / zepředu · celá obrazovka |

V inventáři: **Shift+klik** přesune, **dvojklik** posbírá stejné věci, **Shift+dvojklik** přesune všechny stejné,
**tažení** levým rozdělí hromádku a pravým dá po jednom, **1–9 / F** nad políčkem prohodí s hotbarem / druhou rukou,
**Q** nad políčkem vyhodí, **klik mimo okno** vyhodí, co držíš myší, **mezerník** zopakuje poslední recept.

Když vypadne internet, hra napíše *„Spojení ztraceno — připojuji znovu…“* a připojí se sama.
Se stejným jménem máš zpátky svůj batoh i místo, kde jsi stál(a).

## Spustit u sebe

Potřebuješ [Node.js](https://nodejs.org) 20 nebo novější.
```bash
npm install
npm run dev
```
Otevři **http://localhost:5173**. `npm run dev` pustí hru i herní server najednou.
Ještě jednodušší: na GitHubu **Code → Codespaces → Create codespace** (vše je připravené).

```bash
npm test             # rychlé testy
npm run build        # sestavení hry do client/dist
npm run playtest     # hra si sama zahraje 60 kontrol v prohlížeči
npm run controls     # 32 kontrol ovládání (klávesnice a myš jako v Minecraftu)
```

## Uspořádat hru pro kroužek

- **VPS (hlavní cesta):** jeden příkaz, viz [docs/HOSTING.md](docs/HOSTING.md).
- **Notebook + Cloudflare Tunnel (záloha):** `ROOM_PASSWORD=heslo npm start` a `cloudflared tunnel --url http://localhost:8787`,
  podrobně v [docs/HOSTING.md](docs/HOSTING.md).

## Pro tvůrce

- [CONTRIBUTING.md](CONTRIBUTING.md): jak přidat něco do hry (větev → změna → pull request).
- [AGENTS.md](AGENTS.md): jak je hra postavená a pravidla pro AI pomocníky; návody „jak přidat předmět / blok / recept / tvora“.
- [docs/V1-BRIEF.md](docs/V1-BRIEF.md): co má umět verze 1.

Postaveno na prototypu [aimartinmarek-afk/louka](https://github.com/aimartinmarek-afk/louka) (Three.js, Vite, Node.js, ws).
