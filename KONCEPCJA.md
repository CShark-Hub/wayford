# Wayford — symulator zdolności użytkownika

> Nazwa: Wayford. Uzasadnienie w `AGENTS.md`, sekcja „On the name".

Narzędzie, które przechodzi aplikację webową w granicach zadeklarowanego profilu zdolności użytkownika i pokazuje, **gdzie ten użytkownik się zatrzymał**.

Nie odpowiadamy na pytanie „czy aplikacja działa". Odpowiadamy na pytanie **„dla kogo działa"**.

---

## Problem

- **Skanery dostępności** (axe-core i spółka) sprawdzają kod i kolory. Nie sprawdzają, czy da się **dojść do celu**.
- **Testy z użytkownikami** odpowiadają na to pytanie, ale są wolne i drogie.
- **Agenci testowi** (Aximo, QA.tech, Momentic) sprawdzają, czy scenariusz przechodzi — zawsze z perspektywy idealnego użytkownika.

Luka: nikt nie mierzy, **przy jakim poziomie zdolności funkcja przestaje być osiągalna**.

---

## Jak to działa

### 1. Profil zdolności — nie prompt, tylko filtr

To jest rdzeń projektu i jedyna rzecz, której nie ma nikt inny.

Persona **nie jest instrukcją dla modelu** („udawaj, że słabo widzisz"). Persona to filtr nałożony na obserwację, **zanim model cokolwiek zobaczy**:

```
Playwright → [FILTR PERCEPCJI] → kontekst modelu
                    ↑
                 profil
```

Elementy poniżej progu **nie trafiają do modelu**. Jeśli agent nie znajdzie przycisku, to nie odgrywanie roli — to konsekwencja zadeklarowanej reguły.

To jest różnica między **impersonacją a symulacją**, i to jest odpowiedź na pytanie „skąd wiecie, że to cokolwiek znaczy":

> Nie twierdzimy, że tak zachowa się Ryszard. Twierdzimy, że przy tych założeniach ten przycisk jest nieosiągalny. Sprawdźcie założenia — reszta wynika.

### 2. Profil = wiązka zdolności, nie zawód

Zawód jest etykietą w UI. Silnik czyta wymiary:

```yaml
persona: ryszard
label: "Ryszard, 36, hydraulik"
seed: 8814

percepcja:            # rozstrzygane raz na element, deterministyczne w przebiegu
  kontrast:   { prog: 3.0, miekkosc: 0.5 }   # WCAG 2.2
  font_px:    { prog: 14 }
  cel_px:     { prog: 24 }                    # WCAG 2.2 Target Size
  emulacja:   blurredVision                   # Chrome DevTools Protocol

zachowanie:           # losowane przy każdej akcji
  double_click:       0.8                     # provenance: folk
  scroll_do_konca:    0.2
  budzet_s:           120

wiedza:               # deterministyczne
  wzorce_zna:      [menu, koszyk]
  wzorce_nie_zna:  [hamburger, breadcrumb]
  slownik_domenowy: brak
```

Każdy próg ma **źródło zapisane w profilu**: WCAG 2.2, prawo Fittsa, indeks mglistości Pisarka. Reguły bez źródła są oznaczone `provenance: folk` — i tak samo oznaczone w raporcie. Profil wygenerowany promptem dostaje `provenance: llm`.

### 3. Seed — powtarzalność

Każdy przebieg ma ziarno, zapisane w raporcie:

```
run #47 | persona: ryszard | seed: 8814
```

Bez tego „Ryszard się zgubił" to anegdota. Z tym — deweloper odtwarza dokładnie ten sam przebieg i widzi, co widział Ryszard. To różnica między raportem a zgłoszeniem błędu.

---

## Przykład działania

**Wejście:** adres aplikacji + zadanie („dowiedz się, ile prądu zużyłeś w zeszłym miesiącu") + 3 profile.

**Zasada dla zadań:** zadanie nie może zawierać rozwiązania.

```
❌ „kliknij Ustawienia → Taryfa → wybierz G12w"
✅ „chcesz płacić mniej za prąd w nocy — załatw to"
```

Jeśli w zadaniu jest ścieżka, mierzymy wykonywanie instrukcji, nie odnajdywanie się.

**Wyjście:**

```
Zadanie: sprawdź zużycie prądu za zeszły miesiąc

Ryszard (słaby wzrok, niska biegłość)   ✗ 3/10 sukcesu, śr. 2:10
Anna (sprawna, biegła)                  ✓ 9/10, śr. 0:35
Marek (sprawny, mobile)                 ✓ 8/10, śr. 0:48

→ Ryszard jako jedyny wchodzi w „Rozliczenia" zamiast „Moja energia"
→ Rekomendacja: przenieść wykres zużycia na stronę główną
```

Raport rozdziela warstwę twardą od miękkiej:

| | |
|---|---|
| ✅ **pomiar** | „cel ma 18px przy wymaganych 24" |
| ✅ **deterministyczne** | „przy progu kontrastu 3:1 ten link nie istnieje w obserwacji" |
| ⚠️ **hipoteza** | „zniechęcił się i wyszedł" |

**Wynik graniczny** — przemiatanie osi zdolności:

```
Przemiatanie progu kontrastu dla ścieżki „zmiana taryfy":
  2.0  ✓
  3.0  ✓
  4.0  ✗ ŁAMIE SIĘ   ← granica
  5.0  ✗

→ Ta ścieżka wymaga wzroku lepszego niż 3.5:1
```

To już nie jest „AI udawało hydraulika". To liczba graniczna dla funkcji.

---

## Architektura

```
user story / prompt
      ↓
  [Ekstraktor] ──→ Task[]         cel + deterministyczny warunek sukcesu
      ↓
  [Scout] ─────→ prawda bazowa    raz na wersję, cache, pełny wzrok
      ↓
  ┌─────────────────────────────┐
  │  dla: persona × seed × N     │
  │                              │
  │  Playwright                  │
  │      ↓                       │
  │  Filtr percepcji  ← profil   │  ← DETERMINISTYCZNY KOD, ZERO LLM
  │      ↓                       │
  │  [Actor] → akcja + narracja  │
  │      ↓                       │
  │  Zbieracz dowodów            │
  └─────────────────────────────┘
      ↓
  [Analyst] ──→ raport
```

### Role

| Rola | Co robi | LLM? |
|---|---|---|
| **Ekstraktor** | z user story robi cele użytkownika (usuwa ścieżki!) | tak |
| **Scout** | przechodzi aplikację bez ograniczeń → prawda bazowa | tak |
| **Filtr percepcji** | liczy widoczność, tnie poniżej progu, emulacja CDP | **nie** |
| **Actor** | persona: działa w ograniczeniach, komentuje na głos | tak |
| **Analyst** | widzi wszystkie przebiegi + prawdę bazową → rekomendacje | tak |

**Po co Scout:** bez prawdy bazowej nie odróżnicie „funkcji nie ma / jest zepsuta" od „funkcja jest, ale Ryszard jej nie znalazł". To jedyny dowód, że raport mówi o UX, a nie o bugu.

**Actor nie widzi wyniku Scouta.**

---

## Stack

- **TypeScript, całość.** Playwright i CDP żyją w Node — split językowy to tylko koszt integracji.
- **Playwright** — przeglądarka + `Emulation.setEmulatedVisionDeficiency` przez CDP (rozmycie, wady widzenia barw) za darmo.
- **axe-core** — leci obok, dostarcza twarde dane do raportu.
- **Postgres** — przebiegi, profile, dowody.
- **Frontend** — React + suwaki. Jeden proces, bez Dockera na demo.

### AI: jedno API zgodne z OpenAI

Actor **musi** być naszą pętlą, bo tylko wtedy filtr percepcji wchodzi między kroki.

Dlatego **nie** przez MCP i **nie** przez CLI Claude Code / Codex — tam host trzyma kontekst i filtr przestaje działać. MCP dokładamy **na wierzch**, jako zlecanie zadań („przetestuj tę ścieżkę personą Ryszard" → ID przebiegu).

Jeden adapter, konfig per rola:

```yaml
extractor: gpt-5-mini      # tani, JSON
scout:     claude-sonnet   # musi dobrze nawigować
actor:     gpt-5-mini      # × N przebiegów — tu jest rachunek
analyst:   claude-opus     # raz, ma być mądry
```

Działa z OpenRouter, OpenAI, Anthropic, lokalną Ollamą. Na hackathonie i tak pojedziemy jednym kluczem — adapter jest po to, żeby nie było `if (provider)` w pięciu miejscach.

---

## UI

**Ekran główny: suwaki z podglądem na żywo.**

Po lewej suwaki profilu, po prawej strona **taka, jaką widzi ta persona**. Przesuwasz próg kontrastu z 3.0 na 4.5 → elementy znikają z podglądu na oczach widza.

Robi trzy rzeczy naraz: wygląda efektownie, jest zabawne w klikaniu i **pokazuje mechanizm**. Widz od razu rozumie, że to nie „AI udaje", tylko realne obcinanie wejścia.

Reszta:

- **Karty person z awatarami** — śmieszne nazwy, mocne twarze. To język, którym się to sprzedaje.
- **Kreator z klocków** — `[dorosły sprawny] + [słaby wzrok] + [nie zna hamburgera]` → persona w dwie linijki.
- **Ring** — 5 person na to samo zadanie, wyścig na żywo, kto dobiegł.
- **Suwak graniczny** — przemiatanie jednej osi, wskaźnik zatrzymuje się na wartości, przy której ścieżka pęka.

Żartobliwa warstwa jest strategiczna, nie dekoracyjna: dostępność brzmi jak obowiązek. Persony z twarzami i wyścigiem robią z tego coś, co ludzie chcą kliknąć. **Powaga siedzi w raporcie, zabawa w wejściu.**

---

## Start: co robimy w pierwszej godzinie

**Wszyscy razem: zamrażamy schematy.**

```ts
Profile     // percepcja, zachowanie, wiedza, provenance, seed
Task        // goal, success (deterministyczny), start
RunResult   // kroki, dowody, narracja, metryki, seed
Finding     // typ (pomiar | deterministyczne | hipoteza), dowód, rekomendacja
```

To jedyny moment, w którym cały zespół siedzi nad jednym plikiem. Potem każdy pracuje równolegle, bo granice są czystymi funkcjami.

---

## Podział pracy — 4 strumienie

| # | Strumień | Zakres | Zależy od |
|---|---|---|---|
| **1** | **Filtr percepcji** | widoczność, progi, seed, emulacja CDP | schematy |
| **2** | **Pętla agenta** | Scout, Actor, adapter LLM, zbieranie dowodów | schematy + kontrakt filtra |
| **3** | **Frontend** | suwaki z podglądem, kreator, ring, dashboard | schematy (mocki) |
| **4** | **Wejście/wyjście** | ekstraktor, Analyst, raport, API, MCP | schematy |

**Strumień 1 jest krytyczny** — to jedyna część, której nie ma nikt inny, i w całości deterministyczna (da się napisać i przetestować bez LLM-a i bez UI). Dla osoby, która najlepiej dowozi.

**Strumień 3 idzie równolegle od zera**, na ręcznie napisanym JSON-ie. Podgląd z suwakami to najlepszy ekran na demo i najbardziej niezależny kawałek roboty.

### Punkty spotkania

1. **Filtr × pętla** — Actor z realnie okrojoną obserwacją, wynik do pliku. Od tego momentu mamy produkt, reszta to opakowanie.
2. **Frontend × dane** — przepięcie z mocków na prawdziwe wyniki.

Ostatnie **2 godziny**: generujemy dane demo (kilka person, kilka przebiegów, historia). Pusty dashboard wygląda jak prototyp, pełny jak produkt.

---

## Zakres hackathonu

**Robimy:**
- filtr percepcji (kontrast, font, rozmiar celu) + emulacja CDP
- seed i powtarzalność
- Scout + Actor + Analyst
- 3 persony złożone z klocków
- 10 przebiegów na personę
- podgląd z suwakami
- przemiatanie granicy — **jedna oś, jedna ścieżka, jeden slajd** (to dosłownie pętla `while`)

**Nie robimy (slajd „co dalej"):**
- MCP
- persony generowane promptem
- wielu providerów naraz
- eksport, zapisywanie, konta, projekty
- testy API, mobile

**Nie wycinamy pod żadnym pozorem:** filtr percepcji, seed, podgląd z suwakami. To jest cały projekt. Bez tego zostaje UXAgent z ładniejszym UI.

---

## Demo, 90 sekund

1. Kreator: składamy Ryszarda z klocków (4 suwaki)
2. Podgląd: przesuwamy kontrast → **elementy znikają na żywo**
3. Zadanie jednym zdaniem, ring startuje
4. Agent klika, obok leci narracja. Utyka. Cofa się. **Poddaje się.**
5. Dashboard: 3 persony obok siebie, Ryszard czerwony
6. Slajd graniczny: *„ta ścieżka wymaga wzroku lepszego niż 3.5:1"*

Punkt 4 to moment, dla którego robimy wszystko inne. Sala musi zobaczyć, jak agent się gubi.

**Zapasowe nagranie przebiegu jest obowiązkowe.** Agent potrafi się zaciąć na 4 minuty akurat przed jury.

---

## Czego nie twierdzimy

Że przewidujemy zachowanie prawdziwych ludzi.

Model z okrojonym wejściem nie zachowuje się jak osoba z ograniczeniem — zachowuje się jak pełnosprawny rozumowacz z gorszym wejściem. Prawdziwy człowiek kompensuje: zbliża twarz, włącza zoom, dzwoni do córki.

To jest **generator hipotez i pomiar granic**, nie zamiennik badań z użytkownikami. Deklarując mniej, jesteśmy nie do podważenia.

---

## Inspiracje i prior art

- [UXAgent](https://github.com/neuhai/UXAgent) (MIT, arXiv 2504.09407) — persony + Playwright + batch + ankieta SUS. Najbliższe temu, co robimy. Persona jest tam **czystym promptem** — brak modelu zdolności, progów i filtrowania percepcji.
- [PersonaLayer](https://github.com/PersonaLayer) — 45 profili UX (wzrokowe, motoryczne, poznawcze, behawioralne) zgodnych z WCAG 2.2. Używane do **adaptacji** stron, nie do testowania. Dobre źródło taksonomii.
- WCAG 2.2, prawo Fittsa, indeks mglistości Pisarka — źródła progów.
- Aximo, QA.tech, Momentic — agenci testowi. Pytają „czy działa", nie „dla kogo działa".

**Czego nie znaleźliśmy nigdzie:** egzekwowanego filtrowania percepcji w pętli agenta, seeda dla decyzji percepcyjnych, przemiatania osi zdolności w poszukiwaniu granicy.

To są nasze trzy punkty.
