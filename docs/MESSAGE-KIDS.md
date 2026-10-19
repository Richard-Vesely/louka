# Message for the kids (draft)

For Richard: fill in the two placeholders (`<adresa serveru>`, `<heslo>`) before sending; the password is better sent
separately. Until v2 is merged into `main`, the game on GitHub Pages is still Marek's previous version.

---

Ahoj!

Markova **Říše** má novou verzi. Hraje se úplně stejně, ale uvnitř je rozdělená na malé kousky, takže do ní můžete
přidávat věci vy (s pomocí AI). A máme **stálý server**, kde svět zůstane, i když všichni odejdou.

**Jak hrát**
- Otevři **https://<adresa serveru>**, napiš své jméno, klikni na svět (**Hlavní svět** nebo **Kreativní svět**)
  a poprvé zadej heslo **<heslo>** a vymysli si **PIN** (4 číslice). Zapamatuj si ho: se jménem a PINem máš svůj
  batoh i na jiném počítači. Když ho zapomeneš, Richard ho smaže a vymyslíš si nový.
- Hrát spolu jde i bez serveru: jeden dá **Další možnosti → Vytvořit hru na svém počítači** a pošle ostatním kód
  (např. `LOUKA-7K2F`), ostatní dají **Další možnosti → Připojit se ke kamarádovi kódem** a napíšou ty 4 znaky.
- **Hrát sám** ukládá svět jen ve tvém prohlížeči.

**Jak do hry přidat něco svého**
1. Kód je tady: https://github.com/Richard-Vesely/louka (účet na GitHubu je od 13 let; mladší pracujte ve dvojici nebo přes Richarda).
2. Nejjednodušší je **Codespaces**: na stránce klikni *Code → Codespaces → Create codespace*. Po chvíli napiš do terminálu
   `npm run dev` a hra se otevře. (Na vlastním počítači: nainstaluj Node.js a Git, pak `git clone …`, `npm install`, `npm run dev`.)
3. Řekni svému AI pomocníkovi třeba:
   > Přečti si AGENTS.md a docs/FEATURES.md. Chci do hry přidat … . Udělej co nejmenší změnu, vysvětli mi ji česky
   > a řekni mi, jak to vyzkouším.
4. Vyzkoušej to ve hře, pak `npm test`.
5. Pošli to jako **pull request**: svoje změny uložíš do vlastní větve (`git switch -c muj-napad`, `git add .`,
   `git commit -m "co jsem přidal"`, `git push`), na GitHubu klikneš **Compare & pull request** a napíšeš, co jsi přidal
   a jak to vyzkoušet. Automatická kontrola si hru sama zahraje; když je zelená a Richard to schválí, je to ve hře.

Celý návod je v souboru **CONTRIBUTING.md**. Těším se, co vymyslíte!
