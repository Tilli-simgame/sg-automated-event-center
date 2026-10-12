# vrl-kilpatalli

Työkaluja VRL:n (Virtuaalihevoset) kilpailutoiminnan automatisointiin:

- **Kilpailukeskus** (`kilpailukeskus/`) — Cloudflare Pages + D1 -sovellus, jossa järjestäjä
  luo kilpailut, kilpailijat ilmoittautuvat ja tulokset arvotaan ja lähetetään VRL:ään
  automaattisesti. Ks. [kilpailukeskus/README.md](kilpailukeskus/README.md).
- **CLI-skriptit ja hallintapaneeli** (repon juuri) — kuvattu tässä tiedostossa.

## CLI-skriptit

Itsenäisiä Node.js-skriptejä, joilla toinen järjestelmä voi automatisoida VRL:n
kilpailutoiminnan lomakkeita HTTP-kutsuilla:

- **Kilpailun ilmoittaminen** — "Ilmoita perinteiset kilpailut" -lomake
  (`/kilpailutoiminta/ilmoita_kilpailut/perinteiset`), ks. [Kilpailun ilmoittaminen](#kilpailun-ilmoittaminen).
- **Tulosten ilmoittaminen** — "Ilmoita tulokset" -lomake
  (`/kilpailutoiminta/ilmoita_tulokset/{id}`), ks. [Tulosten ilmoittaminen](#tulosten-ilmoittaminen).
  Samaa logiikkaa käyttää myös Kilpailukeskuksen automaattinen tulosten lähetys.

Kumpikaan skripti ei ole osa VRL-sivuston (CodeIgniter/FuelCMS) koodia — ne tekevät samat HTTP-kutsut kuin selaimessa täytetty lomake tekisi
(kirjautuminen istuntoevästeellä + lomakkeen POST-lähetys). Kohdesivuston osoite annetaan
`--base-url`-parametrina, joten skriptit voidaan ajaa miltä tahansa palvelimelta — sen ei
tarvitse olla sama palvelin, jossa Virtuaalihevoset pyörii.

Mukana on myös pieni web-hallintapaneeli (`panel/`) molemmille lomakkeille — kätevä tapa
kokeilla lähetystä ilman komentorivivalitsimien muistamista, ks.
[Hallintapaneeli](#hallintapaneeli-web-käyttöliittymä).

## Tiedostot

| Polku | Kuvaus |
|---|---|
| `laheta_kilpailu.js` | CLI-skripti: ilmoita kilpailu |
| `laheta_tulokset.js` | CLI-skripti: ilmoita tulokset |
| `tulokset-testi.txt` | Copy-paste-testidata tulosten ilmoittamiseen |
| `lib/http_client.js` | Jaetut HTTP-alkeet (evästeet, uudelleenohjaus, kirjautuminen, viestin poiminta) |
| `lib/kilpailu_client.js` | Kilpailun ilmoittamisen lähetyslogiikka |
| `lib/tulokset_client.js` | Tulosten ilmoittamisen lähetyslogiikka |
| `lib/tulos_tiedosto.js` | `tulokset-testi.txt`-muodon jäsennin (CLI:n `--tiedosto`) |
| `lib/jaokset.js` | Kovakoodattu jaos id -> nimi -lista paneelin pudotusvalikkoa varten |
| `panel/server.js` | Web-hallintapaneeli (`/` kilpailu, `/tulokset` tulokset) |
| `Dockerfile` | `laheta_kilpailu.js`:n kontti |
| `panel/Dockerfile` | Hallintapaneelin kontti |
| `kilpailukeskus/` | Cloudflare Pages -kilpailukeskus, ks. [oma README](kilpailukeskus/README.md) |
| `disciplines_ids.md` | VRL:n lajien id:t ja lyhenteet (taustamateriaali) |
| `disciplines_classes.md` | Jaoskohtaiset luokkavaihtoehdot (taustamateriaali) |
| `jaoskohtaiset_luokkarajoitukset.md` | Jaosten luokka-, osallistuja- ja lähtörajat (taustamateriaali) |
| `sijoittuneet.md` | Sijoittuneiden määrä osallistujamäärän mukaan (taustamateriaali) |

## Vaatimukset

- Node.js 14 tai uudempi (käyttää vain sisäänrakennettuja moduuleja — ei
  ulkoisia npm-riippuvuuksia, ei `npm install`-tarvetta)
- Voimassa oleva käyttäjätunnus sivustolla, jolla on oikeus ilmoittaa kilpailuja
  (rekisteröitynyt käyttäjä, jolla etuuspisteet riittävät jaokseen)

## Kilpailun ilmoittaminen

### Käyttö

```bash
node laheta_kilpailu.js \
  --base-url=https://virtuaalihevoset.net \
  --identity=VRL-00000 \
  --password=salasana123 \
  --jaos=3 \
  --kp=24.10.2026 \
  --vip=10.10.2026 \
  --kutsu=https://example.com/kilpailukutsu \
  --arvontatapa=1 \
  --jarj-talli=XXXX0000 \
  --info="Huom, ratsastuskengät pakolliset"
```

Tunnus ja salasana voi antaa myös ympäristömuuttujina komentorivivalitsimen sijaan
(kätevä esim. cron-ajoissa, ettei salasana näy prosessilistassa):

```bash
export VRL_BASE_URL=https://virtuaalihevoset.net
export VRL_IDENTITY=VRL-00000
export VRL_PASSWORD=salasana123
node laheta_kilpailu.js --jaos=3 --kp=24.10.2026 --vip=10.10.2026 \
  --kutsu=https://example.com/kilpailukutsu --arvontatapa=1 --jarj-talli=XXXX0000
```

Skripti tulostaa onnistuessaan `OK: ...` ja palauttaa exit-koodin `0`. Epäonnistuessaan
virhe tulostuu `stderr`:iin ja exit-koodi on `1` — sopii suoraan cron-/CI-integraatioon.

### Parametrit

| Valitsin | Pakollinen | Kuvaus |
|---|---|---|
| `--base-url` (tai `VRL_BASE_URL`) | kyllä | Sivuston osoite, esim. `https://virtuaalihevoset.net` |
| `--identity` (tai `VRL_IDENTITY`) | kyllä | Kirjautumistunnus (esim. `VRL-00000` tai sähköposti) |
| `--password` (tai `VRL_PASSWORD`) | kyllä | Salasana |
| `--jaos` | kyllä | Jaoksen id (numero) |
| `--kp` | kyllä | Kilpailupäivä muodossa `PP.KK.VVVV` |
| `--vip` | kyllä | Viimeinen ilmoittautumispäivä muodossa `PP.KK.VVVV` |
| `--kutsu` | kyllä | Kilpailukutsun osoite, 15–300 merkkiä |
| `--arvontatapa` | kyllä | `1`=Lyhyt/pitkä arvonta, `2`=Suhteutettu arvonta, `4`=Tuotos/kysymys |
| `--jarj-talli` | kyllä | Järjestävän tallin tunnus, esim. `XXXX0000` — oltava lähettäjän oma talli |
| `--info` | ei | Lisätiedot, max 300 merkkiä |
| `--takaaja` | ei | Takaaja muodossa `VRL-00000` — pakollinen vain jos käyttäjän etuuspisteet on nollattu |
| `--insecure` | ei | Älä varmista SSL-varmennetta (itse allekirjoitetut varmenteet paikallisessa devissä) |
| `--timeout` | ei | HTTP-pyyntöjen aikakatkaisu sekunteina, oletus `30` |
| `--help` | ei | Näytä käyttöohje |

### Docker (paikallinen testaus)

Kansiossa on `Dockerfile`, jolla skriptin voi pakata pieneen Node-konttiin — kätevä tapa
testata skriptiä lokaalisti ilman että Node pitää asentaa koneelle.

Rakenna image:

```bash
docker build -t vrl-laheta-kilpailu .
```

Aja se (`--rm` siivoaa kontin ajon jälkeen, `--add-host` tekee `host.docker.internal`-nimen
käytettäväksi myös Linuxilla — Docker Desktopilla Windows/Mac se toimii jo oletuksena):

```bash
docker run --rm --add-host=host.docker.internal:host-gateway \
  vrl-laheta-kilpailu \
  --base-url=http://host.docker.internal \
  --identity=VRL-00000 \
  --password=salasana123 \
  --jaos=3 \
  --kp=24.10.2026 \
  --vip=10.10.2026 \
  --kutsu=https://example.com/kilpailukutsu \
  --arvontatapa=1 \
  --jarj-talli=XXXX0000
```

`http://host.docker.internal` osoittaa kontista takaisin isäntäkoneelle. Jos VRL-sivuston
paikallinen kehitysympäristö (erillinen repo, `docker compose`) julkaisee `apache`-palvelun
porttiin `80:80`, tämä osoittaa suoraan siihen (`docker compose up` pitää olla ajossa).

Ilman parametreja (tai `--help`) kontti tulostaa käyttöohjeen:

```bash
docker run --rm vrl-laheta-kilpailu
```

**Vaihtoehto: liitä sama Docker-verkko.** Jos `host.docker.internal` ei jostain syystä
toimi (esim. tietyt Linux-asennukset), voi liittää kontin suoraan kehitysympäristön omaan
Docker-verkkoon ja käyttää palvelun nimeä `apache` osoitteena:

```bash
docker network ls                    # etsi kehitysympäristön verkko, esim. <projekti>_default
docker run --rm --network <projekti>_default \
  vrl-laheta-kilpailu --base-url=http://apache ...
```

### Lomakkeen validointisäännöt (palvelin tarkistaa nämä)

Nämä tulevat suoraan VRL-sivuston lomakevalidoinnista (sivuston lähdekoodissa
`fuel/application/libraries/Kisajarjestelma.php`), joten skripti ei estä virheellisiä
arvoja etukäteen — palvelin palauttaa virheilmoituksen, joka tulostetaan sellaisenaan:

- `vip` (viimeinen ilmoittautumispäivä) on oltava vähintään **14 vrk** tästä päivästä.
- `kp` (kilpailupäivä) on oltava vähintään **1 vrk** `vip`-päivän jälkeen, ja korkeintaan
  seuraavan kuukauden viimeinen päivä.
- `kutsu`-osoitteen (`url`-kenttä lomakkeella) on oltava 15–300 merkkiä pitkä.
- `jarj-talli`-tunnuksen on oltava 6–10 merkkiä ja käyttäjän oma talli.
- `info` saa olla korkeintaan 300 merkkiä.
- Käyttäjän etuuspisteiden on riitettävä valittuun jaokseen — jos ei riitä, palvelin
  palauttaa esim. viestin `"Etuuspisteesi (Xp) eivät riitä. Sinulla on kalenterissa N
  avointa kilpailua."`
- Jos käyttäjän etuuspisteet on nollattu, `--takaaja` on pakollinen.

### Miten se toimii

1. Skripti POST-lähettää tunnukset osoitteeseen `/auth/login` ja säilyttää palautetun
   istuntoevästeen muistissa ajon ajan (ei kirjoiteta levylle).
2. Onnistunut kirjautuminen tunnistetaan siitä, että vastaussivulla näkyy
   "Kirjaudu ulos" -linkki (`auth/logout`) — sivusto ei erittele kirjautumisen
   onnistumista/epäonnistumista suoraan HTTP-vastauskoodilla.
3. Samalla evästeellä POST-lähetetään kilpailun tiedot osoitteeseen
   `/kilpailutoiminta/ilmoita_kilpailut/perinteiset`.
4. Vastaussivulta poimitaan `<div class="alert alert-success|danger">`-elementin sisältö
   ja tulkitaan se onnistumiseksi/epäonnistumiseksi.

## Tulosten ilmoittaminen

CLI-skripti `laheta_tulokset.js` automatisoi "Ilmoita tulokset" -lomakkeen
(`/kilpailutoiminta/ilmoita_tulokset/{id}`) - **vain perinteisille (ei-porrastetuille)
kilpailuille**, sama rajaus kuin kilpailun ilmoittamisessa.

### Käyttö

```bash
node laheta_tulokset.js \
  --base-url=http://localhost \
  --identity=VRL-00000 \
  --password=salasana123 \
  --kisa-id=900009 \
  --tiedosto=tulokset-testi.txt
```

`--tiedosto` osoittaa tekstitiedostoon, joka listaa luokat ja niiden tulokset -
`tulokset-testi.txt` on valmis esimerkki jota voi muokata suoraan tai käyttää pohjana.
Muoto (ks. myös `lib/tulos_tiedosto.js`):

```
LUOKKA: 1. Helppo A
OSALLISTUJAT:
<vapaata tekstiä, useampi rivi sallittu>
HYLÄTYT:
<vapaata tekstiä, valinnainen lohko>

LUOKKA: 2. Vaativa A
OSALLISTUJAT:
...
```

`#`-alkuiset rivit ja tyhjät rivit ohitetaan (voi käyttää kommentteihin). Osallistujat-/
Hylätyt-tekstin sisältö on täysin vapaamuotoista - VRL ei pakota mitään globaalia rakennetta,
kukin jaos määrittelee omat sääntönsä.

### Parametrit

| Valitsin | Pakollinen | Kuvaus |
|---|---|---|
| `--base-url` (tai `VRL_BASE_URL`) | kyllä | Sivuston osoite |
| `--identity` (tai `VRL_IDENTITY`) | kyllä | Kirjautumistunnus |
| `--password` (tai `VRL_PASSWORD`) | kyllä | Salasana |
| `--kisa-id` | kyllä | Kilpailun id URL-polusta, esim. `900009` |
| `--tiedosto` | kyllä | Polku tekstitiedostoon (ks. muoto yllä) |
| `--insecure` | ei | Älä varmista SSL-varmennetta |
| `--timeout` | ei | HTTP-pyyntöjen aikakatkaisu sekunteina, oletus `30` |
| `--help` | ei | Näytä käyttöohje |

### Miten se toimii

Selaimessa "Ilmoita tulokset" on kaksivaiheinen: ensin lähetetään luokkien nimet, minkä
perusteella palvelin piirtää jokaiselle luokalle omat Osallistujat-/Hylätyt-kentät, jotka
sitten täytetään ja lähetetään erikseen. Palvelinpuolen käsittelijä
(VRL-sivuston `Kilpailutoiminta::_send_result()`, `fuel/application/controllers/Kilpailutoiminta.php`)
käsittelee POST-pyynnön kuitenkin suoraan heti kun pyynnössä on jo valmiiksi mukana
`tulos_N_luokka`/`tulos_N_os`/`tulos_N_hyl`-kentät (N=1,2,3...) - kaksivaiheisuus on siis
vain selaimen UX:ää varten, ei palvelimen vaatimus. Skripti tuntee luokat etukäteen
(tiedostosta), joten se rakentaa nämä kentät suoraan ja lähettää **koko tuloksen yhdellä
POST-pyynnöllä** kirjautumisen jälkeen.

**Huom:** palvelin lopettaa luokkien lukemisen kokonaan ensimmäiseen luokkaan, jonka nimi
puuttuu tai on enintään 5 merkkiä pitkä - kaikki sitä seuraavat luokat (myös kelvolliset)
jäisivät tällöin hiljaa tallentamatta. Skripti tarkistaa tämän etukäteen jokaiselle
luokalle ja palauttaa selkeän virheen sen sijaan, että lähettäisi puutteellisen tuloksen.

## Hallintapaneeli (web-käyttöliittymä)

`panel/server.js` on pieni, riippuvuudeton Node-HTTP-palvelin, jossa on kaksi sivua:

- `/` — Ilmoita kilpailu (käyttää `lib/kilpailu_client.js`-logiikkaa, sama kuin `laheta_kilpailu.js`)
- `/tulokset` — Ilmoita tulokset (käyttää `lib/tulokset_client.js`-logiikkaa, sama kuin `laheta_tulokset.js`)

Molemmat sivut linkittyvät toisiinsa yläreunan navigaatiosta. Tarkoitettu **vain
paikalliseen kehityskäyttöön** — paneelissa itsessään ei ole kirjautumista/pääsynvalvontaa,
joten sitä ei pidä altistaa julkiseen verkkoon.

### Ajo suoraan Nodella

```bash
node panel/server.js     # repon juuresta
```

Avaa selaimessa <http://127.0.0.1:4000>. Palvelin sitoutuu oletuksena vain
`127.0.0.1`:ään; portin ja osoitteen voi vaihtaa ympäristömuuttujilla:

```bash
PORT=5000 HOST=127.0.0.1 node panel/server.js
```

**Sivuston osoite tässä tapauksessa: `http://localhost`** (paikallista kehitysympäristöä
vasten). Paneeli itse pyörii nyt isäntäkoneella samalla tavalla kuin `docker compose`:n
julkaisema `apache`-palvelu
(portti `80:80`), joten ne näkevät toisensa tavallisen `localhost`:in kautta.
`host.docker.internal` ei toimi tässä ajotavassa (`getaddrinfo ENOTFOUND
host.docker.internal`) — se on Dockerin oma erikoisnimi, joka resolvoituu vain kontin
sisältä käsin, ei isäntäkoneen omasta prosessista. Käytä `host.docker.internal`-osoitetta
vain jos ajat paneelin itse Dockerissa, ks. seuraava kohta.

### Ajo Dockerissa

```bash
docker build -f panel/Dockerfile -t vrl-panel .
docker run --rm --add-host=host.docker.internal:host-gateway \
  -p 127.0.0.1:4000:4000 vrl-panel
```

`-p 127.0.0.1:4000:4000` julkaisee portin vain isäntäkoneen omalle loopback-osoitteelle
(ei koko lähiverkolle) — pidä tämä rajaus, älä vaihda sitä `-p 4000:4000`-muotoon paikallista
testausta laajemmassa käytössä. Avaa sitten <http://127.0.0.1:4000> selaimessa ja täytä
"Sivuston osoite" -kenttään `http://host.docker.internal` osoittaaksesi paikalliseen
`docker compose`-kehitysympäristöön (ks. [Docker](#docker-paikallinen-testaus) yllä samasta
`host.docker.internal`-periaatteesta).

Lomake esitäyttää syötetyt arvot uudelleen onnistuneen/epäonnistuneen lähetyksen jälkeen —
paitsi salasanan, joka ei koskaan tallennu eikä näy takaisin sivulla.

**Jaos-pudotusvalikko (`/`).** "Jaos"-kenttä on valmiiksi pudotusvalikko, ei arvattava id —
vaihtoehdot tulevat kovakoodatusta listasta `lib/jaokset.js` (lähde: VRL-sivuston
tietokannan taulu `vrlv3_kisat_jaokset`). Näyttelyjaos (NJ) on
jätetty pois tahallaan, koska se ei kelpaa "perinteiset kilpailut" -reitille (ks. tiedoston
kommentti). Jos jaoksia joskus lisätään/poistetaan tuotannossa, päivitä lista käsin.

**Luokkakentät (`/tulokset`).** Kirjoita luokkien nimet "Luokat"-kenttään (yksi per rivi)
ja paina "Näytä luokkakentät" — sivu piirtää jokaiselle luokalle omat Osallistujat-/
Hylätyt-tekstikentät alle. Tämä tapahtuu kokonaan paneelin sisällä (ei vaadi vielä
tunnuksia/yhteyttä kohdesivustoon), vasta lopullinen "Lähetä tulokset" ottaa yhteyttä
sivustoon. Kopioi `tulokset-testi.txt`-tiedoston sisältö kenttiin testausta varten.

## CSRF

CSRF-suojaus on tällä hetkellä pois päältä VRL-sivuston konfiguraatiossa
(`fuel/application/config/config.php`, `$config['csrf_protection'] = FALSE`), joten
kumpikaan skripti (eikä Kilpailukeskus) ei käsittele CSRF-tokenia. Jos suojaus otetaan joskus käyttöön,
molemmat (`lib/http_client.js`:n `kirjaudu()` sekä lomakkeiden POST-lähetykset) pitää
päivittää lukemaan token lomakesivulta ennen POST-lähetystä.

## Lisenssi

[MIT](LICENSE)
