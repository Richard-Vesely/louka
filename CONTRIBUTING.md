# Jak přidat něco do hry

Hru stavíme spolu. Aby si nikdo nerozbil práci druhého, děláme každou změnu stejně:

**větev → malá změna → vyzkoušet → pull request → kontrola → sloučit**

## Jak se dostat do projektu (jednou)

1. Založ si účet na **https://github.com/signup** (GitHub dovoluje účet od **13 let**).
2. Pošli Richardovi své **uživatelské jméno na GitHubu** (ne heslo!).
3. Richard tě přidá do projektu. Přijde ti e-mail s pozvánkou, nebo ji najdeš na
   **https://github.com/Richard-Vesely/rise/invitations**. Klikni **Accept invitation**.

Pak můžeš do projektu posílat své větve a pull requesty. Do `main` přímo zapisovat nejde, to je dobře:
každá změna jde přes kontrolu.

Když je ti míň než 13:
- pracuj **ve dvojici** s někým, kdo účet má, nebo
- pracuj přes **Richardův účet** na kroužku (Richard ti ho přihlásí).

Tvoje jméno pak napiš do popisu pull requestu, ať víme, kdo to vymyslel.

## 1. Vyber si úkol

Na GitHubu otevři **Issues** a najdi štítek **`dobrý první úkol`**. Napiš do úkolu komentář
„beru si to“, ať na stejné věci nepracují dva. Máš vlastní nápad? Založ issue přes šablonu **Nový nápad**.

Než začneš, podívej se do [docs/FEATURES.md](docs/FEATURES.md), co už ve hře je.

## 2. Otevři projekt

**V prohlížeči (nejjednodušší):** na stránce repozitáře klikni **Code → Codespaces → Create codespace**.
Za chvíli máš editor a všechno nainstalované.

**Na vlastním počítači** (potřebuješ [Node.js](https://nodejs.org) 20 nebo novější a [Git](https://git-scm.com)):
```bash
git clone https://github.com/Richard-Vesely/rise
cd rise
npm install
```

## 3. Udělej si větev

Větev je tvoje vlastní kopie, kde nic nerozbiješ:
```bash
git switch -c med-a-vcely
```
Pojmenuj ji podle toho, co děláš (malá písmena, bez háčků, slova spoj pomlčkou).

## 4. Malá změna

- **Jedna věc najednou.** Nový tvor = jeden pull request. Nový tvor + déšť + truhla = tři.
- Předměty, recepty, bloky, jídla a tvorové se přidávají hlavně ve složce **`shared/`** (přesný návod je v `AGENTS.md`, oddíl *Recipes*).
- Všechny texty ve hře jsou **česky**.
- AI pomocníkovi řekni, co chceš udělat. Pravidla projektu zná ze souboru `AGENTS.md`. Můžeš začít třeba takhle:
  > Přečti si AGENTS.md a docs/FEATURES.md. Chci do hry přidat med: nový předmět, který se vyrobí z lesních plodů
  > a dá se sníst. Udělej co nejmenší změnu, vysvětli mi ji česky a řekni mi, jak to vyzkouším.
- Když AI navrhne změnit „jádro“ hry (síť, ukládání, server, pořadí modulů), zeptej se nejdřív Richarda.
- Do hry nepřidáváme nic, co by sbíralo osobní údaje.

## 5. Vyzkoušej to

```bash
npm run dev
```
Otevři **http://localhost:5173** (v Codespaces se otevře samo), klikni **Hrát sám** a vyzkoušej,
že tvoje věc funguje. Užitečné příkazy v konzoli prohlížeče (F12): `game.addItem('med', 5)`, `game.setTime(0.9)` (noc).

Pak spusť testy:
```bash
npm test
npm run build
```
Když něco svítí červeně, přečti si chybu (nebo ji ukaž AI pomocníkovi) a oprav to.

## 6. Ulož a pošli

```bash
git add .
git commit -m "Přidán med"
git push -u origin med-a-vcely
```
GitHub ti ukáže odkaz **Compare & pull request**. Klikni na něj a napiš:
- **co** jsi přidal(a),
- **jak** to vyzkoušet (třeba „vyrob med z 4 lesních plodů a sněz ho“),
- kdo na tom pracoval.

## 7. Kontrola

- **CI** (automatická kontrola) sestaví hru, spustí testy a hru si sama zahraje v prohlížeči.
  Musí být zelená ✅. Když je červená ❌, klikni na **Details** a podívej se, co se nepovedlo.
- **Richard** (nebo kamarád) si změnu prohlédne a možná napíše připomínky. Oprav je ve stejné větvi
  (`git commit` + `git push`), pull request se sám aktualizuje.
- Po schválení se změna **sloučí do `main`**. Za pár minut je ve hře na webu
  (https://richard-vesely.github.io/rise/) a na serveru kroužku po další aktualizaci serveru.

## Pravidla

1. Jedna malá věc na jeden pull request.
2. Texty ve hře česky.
3. Nové věci do `docs/FEATURES.md`.
4. Nic nemaž, co dělá někdo jiný; když něco nefunguje, napiš issue.
5. Do `main` nikdo nepíše přímo – vždycky přes pull request.
