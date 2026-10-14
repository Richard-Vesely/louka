# Jak přidat něco do hry

Hru stavíme spolu. Aby si nikdo nerozbil práci druhého, děláme každou změnu stejně:

**větev → malá změna → vyzkoušet → pull request → kontrola → sloučit**

## Kdo smí na GitHub

GitHub dovoluje účet až od **13 let**. Když je ti míň:
- pracuj **ve dvojici** s někým, kdo účet má, nebo
- pracuj přes **Richardův účet** na kroužku (Richard ti ho přihlásí).

Tvoje jméno pak napiš do popisu pull requestu, ať víme, kdo to vymyslel.

## 1. Vyber si úkol

Na GitHubu otevři **Issues** a najdi štítek **`dobrý první úkol`**. Napiš do úkolu komentář
„beru si to“, ať na stejné věci nepracují dva.
Máš vlastní nápad? Založ issue přes šablonu **Nový nápad**.

## 2. Otevři projekt

Nejjednodušší: na stránce repozitáře klikni **Code → Codespaces → Create codespace**.
Za chvíli máš editor v prohlížeči a všechno nainstalované.

Na vlastním počítači (potřebuješ Node.js 20 nebo novější):
```bash
git clone https://github.com/Richard-Vesely/louka
cd louka
npm install
```

## 3. Udělej si větev

Větev je tvoje vlastní kopie, kde nic nerozbiješ:
```bash
git switch -c med-a-vcely
```
Pojmenuj ji podle toho, co děláš (malá písmena, bez háčků, slova spoj pomlčkou).

## 4. Malá změna

- **Jedna věc najednou.** Nová ovce = jeden pull request. Nová ovce + déšť + truhla = tři.
- Předměty, recepty, bloky a tvorové se přidávají v **`shared/`** (návod je v `AGENTS.md`).
- Všechny texty ve hře jsou **česky**.
- AI pomocníkovi (Claude) řekni, co chceš udělat. Pravidla projektu zná ze souboru `AGENTS.md`.
- Do hry nepřidáváme volný chat ani nic, co by sbíralo osobní údaje.

## 5. Vyzkoušej to

```bash
npm run dev
```
Otevři **http://localhost:5173**, klikni **Hrát sám** (nebo **Hrát spolu** – server běží taky) a vyzkoušej,
že tvoje věc funguje. Pak spusť testy:
```bash
npm test
```
Když něco svítí červeně, přečti si chybu (nebo ji ukaž AI pomocníkovi) a oprav to.

## 6. Ulož a pošli

```bash
git add .
git commit -m "Přidán med a včelí úl"
git push -u origin med-a-vcely
```
GitHub ti ukáže odkaz **Compare & pull request**. Klikni na něj a napiš:
- **co** jsi přidal(a),
- **jak** to vyzkoušet (třeba „polož úl a počkej 10 sekund“),
- kdo na tom pracoval.

## 7. Kontrola

- **CI** (automatická kontrola) sestaví hru, spustí testy a hru si sama zahraje v prohlížeči.
  Musí být zelená ✅. Když je červená ❌, klikni na **Details** a podívej se, co se nepovedlo.
- **Richard** (nebo kamarád) si změnu prohlédne a možná napíše připomínky. Oprav je ve stejné větvi
  (`git commit` + `git push`), pull request se sám aktualizuje.
- Po schválení se změna **sloučí do `main`** a za pár minut je ve hře na webu.

## Na co si dát pozor

- Soubory v `shared/game/`, `shared/protocol.js`, `server/` a `client/src/net/` jsou **srdce hry**.
  Než je změníš, zeptej se Richarda.
- Neměň, kolik co ubírá a jak rychle co je (rovnováha hry), bez domluvy.
- Hesla a klíče nikdy nepatří do repozitáře.
- Když si nevíš rady, zeptej se. Zeptat se je v pořádku, rozbít `main` ne. 🙂
