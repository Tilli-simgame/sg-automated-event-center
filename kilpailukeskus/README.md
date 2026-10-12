# Oak Hill Event Park (OAKH4632) — Virtuaalinen Kilpailukeskus

Cloudflare Pages -sovellus, joka rakentuu `../lib/*.js`:n VRL-automaation päälle:

- Kilpailun järjestäjä luo kilpailun ja sen luokat → kilpailukutsu generoidaan heti ja on
  nähtävissä esikatseluna kilpailun sivulta, mutta kilpailu jää tilaan `luonnos` kunnes
  järjestäjä tarkistaa kutsun ja hyväksyy sen kilpailun sivulta → vasta silloin kilpailu
  lähetetään VRL:n kisakalenteriin (`../laheta_kilpailu.js`:n logiikalla).
- Kilpailijat ilmoittautuvat luokkiin suoraan täällä (Kilpailukeskus on ilmoittautumispaikka,
  ei VRL).
- Kun VIP-päivä on kokonaan ohi (arvonta VIP+1 vrk) **tai** kaikki luokat (joilla on yläraja) ovat täynnä, erillinen
  ajastettu Worker (`cron/`) arpoo jokaisen luokan sijoitukset ja lähettää tulokset
  automaattisesti VRL:ään (`../laheta_tulokset.js`:n logiikalla).

## Arkkitehtuuri

- **Pages-projekti** (`oakh4632`, tämä hakemisto) — käyttöliittymä + API `functions/`-kansiossa.
- **D1-tietokanta** (`oakh4632-db`) — `migrations/0001_init.sql`. Sama kanta on sidottu
  sekä Pages-projektiin että cron-workeriin.
- **`cron/`** — erillinen Worker ajastimella (`*/15 * * * *`), koska Cloudflare Pages ei tue
  cron-triggereitä. Jaettu D1, oma `wrangler.toml`, oma deploy.
- **`lib/`** — jaettu sovelluslogiikka (kopio + fetch-portti `../lib/*.js`:stä, ks. alla).

### HTTP-kirjaston fetch-portti

`../lib/http_client.js` käyttää Noden `http`/`https`-ydinmoduuleja, joita Cloudflare
Workers/Pages-runtime ei tue. `lib/http_client.js` on fetch-pohjainen uudelleentoteutus
samalla julkisella rajapinnalla (`kirjaudu`, `pyydaJaSeuraaOhjauksia`, `poimiLomakeviesti`),
minkä ansiosta `lib/kilpailu_client.js` ja `lib/tulokset_client.js` ovat suoria kopioita
alkuperäisistä (`../lib/kilpailu_client.js`, `../lib/tulokset_client.js`) — validointi- ja
lähetyslogiikka ei ole toisteta, vain matalan tason HTTP-toteutus vaihtuu. Jos alkuperäisiin
CLI-skripteihin tehdään muutoksia lomakekenttiin/validointiin, sama muutos pitää tehdä myös
tänne käsin (ei automaattista synkronointia).

## Tilakone (`kilpailut.tila`)

```
luonnos → (järjestäjä tarkistaa kutsun esikatselusta ja hyväksyy) → VRL-lähetys → avoinna → (VIP umpeutuu / luokat täynnä) → arvottu
                                                                          ↓ epäonnistuu                                            ↓
                                                                      vrl_virhe (uudelleenyritys kilpailun sivulta)      tulokset_lahetetty
                                                                                                                                    ↓ epäonnistuu
                                                                                                                            tulokset_virhe (uudelleenyritys)
```

## Tunnettu rajoitus: VRL-kisa-id

VRL:n kilpailun luontivastaus ei sisällä luodun kilpailun id:tä, eikä sivustolla ole
rajapintaa sen hakemiseen — CLI-skripti (`../laheta_tulokset.js --kisa-id=...`) on aina
vaatinut tämän käsin URL:sta.

Kilpailukeskus yrittää kuitenkin täydentää sen itse: aina kun kilpailun kutsu- tai
hallintasivu (`/<jaos>/<vuosi>/<kuukausi>/<numero>` tai `/kilpailut/:id`) avataan ja
kilpailu on tilassa `avoinna` ilman `vrl_kisa_id`:tä, haetaan VRL:n kisakalenterin
"perinteiset"-välilehti (`/kilpailutoiminta/kilpailukalenteri/perinteiset`, ei vaadi
kirjautumista) ja etsitään rivi, jonka `url`-kenttä täsmää kilpailun `kutsu_url`:iin -
jos löytyy, `vrl_kisa_id` tallennetaan suoraan (ks. `lib/vrl_kisa_id_haku.js` ja
`lib/vrl_kalenteri_client.js`). Täsmäys tehdään ainoastaan kutsu-url:n perusteella
(jokaisella kilpailulla on oma uniikki url), ja osuman täytyy olla yksikäsitteinen eikä
id saa olla jo toisen kilpailun käytössä. Haku tehdään korkeintaan kerran 5 minuutissa per kilpailu
(`vrl_kisa_id_yritetty_at`), ettei kalenterisivua kuormiteta joka sivulatauksella.

Jos kilpailua ei löydy kalenterista automaattisesti (esim. VRL ei ole vielä hyväksynyt
kutsua, tai täsmäys epäonnistuu), organisaattori voi yhä täyttää id:n käsin kilpailun
sivulla (`/kilpailut/:id` → "VRL-kisa-id"-lomake) VRL:n "Omat kilpailut" -listalta
kopioituna. Ilman jompaakumpaa cron arpoo tulokset ajallaan mutta jää tilaan
`tulokset_virhe` selkeällä viestillä, eikä yritä uudelleen itsestään — organisaattori
näkee tilan kilpailun sivulta ja voi joko täyttää kisa-id:n (+ käsin "yritä uudelleen") tai
jättää sen odottamaan.

## Omien hevosten automaattilisäys

Kun kilpailulle löytyy `vrl_kisa_id` (ks. edellinen kohta), Kilpailukeskus hakee kertaalleen
järjestäjän omat hevoset ulkoisesta rajapinnasta
(`https://sg-visu.vercel.app/api/horses/by-owner-discipline?owner=Tilli&discipline=...`,
ks. `lib/omat_hevoset.js`) kilpailun jaosta vastaavalla lajilla, ja lisää jokaisen
palautetun hevosen sen `discipline_level`-kentän (esim. `"120cm"`, `"Helppo A"`) nimeltään
täsmäävään luokkaan - ilman että järjestäjän tarvitsee ilmoittaa niitä käsin
ilmoittautumislomakkeella. Haku ei toistu itsestään joka sivulatauksella
(`kilpailut.omat_hevoset_lisatty_at`), mutta järjestäjä voi laukaista sen uudelleen
kilpailun sivulta ("Hae omat hevoset uudelleen" - esim. jos luokan lisäsi vasta ensimmäisen
haun jälkeen). Noudattaa samoja luokkakohtaisia rajoja kuin julkinen ilmoittautuminen: luokan
osallistujaraja (`luokka.max_osallistujia`) ja "yksi ratsastaja saa tuoda enintään 10 %
luokan osallistujamäärästä" (ks. `lib/saannot.js`) - koska kaikki automaation lisäämät
hevoset ovat saman kiinteän ratsastajaidentiteetin (ks. alla) alla, jälkimmäinen sääntö
rajaa käytännössä montako omaa hevosta samaan luokkaan voi kerralla tulla (esim. 100
osallistujan luokkaan enintään 10). Hevoset joille ei löytynyt lajitasoa vastaavaa luokkaa,
tai jotka jäivät jomman kumman rajan takia lisäämättä, näytetään virhelistana samalla
sivulla - ei koskaan julkisella kutsusivulla.

Vaatii kaksi lisäsalaisuutta (Pages-projektissa, ei cron-workerissa - tämä ei koske
tulosten lähetystä): `OMA_RATSASTAJA_NIMI` ja `OMA_RATSASTAJA_VRL_TUNNUS`, ks.
`.dev.vars.example`. Ilman niitä toiminto ohitetaan ja virhe näkyy samassa listassa.

## RMP-taitopisteiden haku

Rate My Pony (ratemypony.fi) on erillinen sivusto, jossa hevosen omistaja voi viedä
hevosensa arvosteltavaksi - arvostelu ("Ensiarvostelun tulokset") antaa hevoselle pisteet
neljästä pääkohdasta (Rakenne, Liikkeet, Luonne, Taidot, kullekin 0-100 sekä alakohtien omat
pisteet) sekä kaksi arvostelutilaisuuden pistettä (Ratsastettavuus/ajettavuus, Käytös
tilaisuudessa). RMP:n omalla "Tietoa ensiarvostelusta" -sivulla on listattu mitkä pisteet
vaikuttavat minkäkin lajin painotukseen.

Pisteet haetaan suoraan RMP:n rajapinnasta VH-tunnuksella
(`https://www.ratemypony.fi/api/horses/vh/{VH}`, ei vaadi kirjautumista, ks.
`lib/rmp_client.js`) - niitä ei tallenneta omaan kantaan. HTTP 404 tai puuttuva `review`
tarkoittaa ettei hevosta ole arvosteltu; muu virhe (RMP alhaalla, aikakatkaisu) heitetään
eteenpäin. Sivu **"/rmp"** (`functions/rmp/`) on julkinen ja selittää suhteutetun arvonnan
logiikan; kirjautuneelle adminille sivulla on lisäksi VH-haku, joka näyttää yksittäisen
hevosen pisteet ja painot samasta rajapinnasta (kirjautumattoman `?vh=` ohitetaan, jottei
sivu toimi avoimena välityspalvelimena RMP:hen).

### Suhteutettu arvonta (RMP-painotettu)

Kun kilpailun arvontatapa on **"2" (Suhteutettu arvonta)**, `lib/kilpailun_arvonta.js` käyttää
tavallisen täysin satunnaisen arvonnan (`lib/arvonta.js`:n `arvoLuokka`, Fisher-Yates-sekoitus)
sijaan RMP-pisteillä painotettua arvontaa (`arvoLuokkaPainotettu`, Efraimidis-Spirakis-menetelmä)
- jokainen osallistuja saa "painon", joka nostaa tilastollisesti (muttei koskaan takaa) sen
sijaa arvonnassa. Kaikkien painojen ollessa yhtä suuret tulos on identtinen tavalliseen
arvontaan - painotus siis vain lisää vinoumaa satunnaisuuteen, ei poista sitä.

Paino lasketaan näin (ks. `lib/rmp_arvonta.js`):

1. Kilpailun jaos määrää mitkä RMP:n ensiarvostelun kohdat ovat relevantteja (RMP:n "Taitopisteet
   ja painotus" -listaus, `JAOS_RMP_KOHDAT`) - esim. ERJ (este) käyttää ketteryyttä,
   hyppytekniikkaa ja laukkaa. Osallistujan hevosen (VH-tunnuksella RMP:n rajapinnasta haettu)
   "lajipisteet" on näiden kohtien keskiarvo (0-100). Hevoset haetaan arvonnan hetkellä,
   enintään 6 rinnakkain ja kukin VH-tunnus kerran per kilpailu. Jos RMP ei vastaa, koko
   kilpailun arvonta keskeytyy ennen kuin mitään tallennetaan, ja cron yrittää uudelleen
   seuraavalla ajolla.
2. Hevoselle jolta ei löydy RMP-ensiarvostelua arvotaan silti lajipiste 0-100, mutta
   painotettuna alaväliin (0-35 70 % todennäköisyydellä, muuten 36-100) - RMP-arvosteltua
   hevosta siis suositaan, koska sen oikea pistemäärä voi yhtä hyvin osua ylävälille, mutta
   arvostelematonkaan hevonen ei ole täysin ulkona arvonnasta.
3. Lajipisteestä lasketaan paino kaavalla `paino = 1 + (pisteet/100) × VAHVUUS` (VAHVUUS=3
   koodissa kiinteänä - esim. 200 000 arvonnan simulaatiolla 3 osallistujan luokassa pistein
   10/50/95 vahvin voittaa luokkansa ~50 % kerroista, heikoin ~17 %, ei koskaan taattu).

## Deploy

Ensimmäinen julkaisu on jo tehty:
- Pages: **https://oakh4632.pages.dev**
- Cron worker: **https://oakh4632-cron.workers.dev** (ajastettu, ei tarkoitettu julkiseksi
  käyttöliittymäksi — `POST /aja` laukaisee käsittelyn käsin testausta varten)
- D1: `oakh4632-db` (id `450154a3-e94c-4db0-9402-1b5a36562560`)

Uudelleenjulkaisu:

```bash
cd kilpailukeskus
npm run deploy                  # Pages (public/ + functions/)
cd cron && npx wrangler deploy  # cron-worker
```

Skeeman muutokset:

```bash
npx wrangler d1 execute oakh4632-db --local  --file=migrations/000X_xxx.sql
npx wrangler d1 execute oakh4632-db --remote --file=migrations/000X_xxx.sql
```

### Salaisuudet (VRL-tunnukset)

Molemmat deployt (Pages + cron-worker) tarvitsevat samat kolme salaisuutta erikseen —
niitä EI jaeta automaattisesti kahden eri Cloudflare-tuotteen (Pages / Worker) välillä.
Aja nämä itse omassa terminaalissasi (ei tämän keskustelun kautta — salasana ei kuulu
liikkua chatin läpi):

```bash
# Pages-projekti
npx wrangler pages secret put VRL_BASE_URL  --project-name=oakh4632
npx wrangler pages secret put VRL_IDENTITY  --project-name=oakh4632
npx wrangler pages secret put VRL_PASSWORD  --project-name=oakh4632

# Turnstile-bottitarkistus (ks. "Tietoturva" alla) - vain Pages-projektissa, cron-worker
# ei renderöi lomakkeita eikä siis tarvitse näitä
npx wrangler pages secret put TURNSTILE_SITE_KEY    --project-name=oakh4632
npx wrangler pages secret put TURNSTILE_SECRET_KEY  --project-name=oakh4632

# Omien hevosten automaattilisäys (ks. "Omien hevosten automaattilisäys" yllä) - vain
# Pages-projektissa, cron-worker ei lisää osallistujia
npx wrangler pages secret put OMA_RATSASTAJA_NIMI        --project-name=oakh4632
npx wrangler pages secret put OMA_RATSASTAJA_VRL_TUNNUS  --project-name=oakh4632

# Cron-worker
cd cron
npx wrangler secret put VRL_BASE_URL
npx wrangler secret put VRL_IDENTITY
npx wrangler secret put VRL_PASSWORD
```

**`VRL_BASE_URL` tuotannossa on `https://virtuaalihevoset.net`** — ei `http://localhost`
eikä `http://host.docker.internal`. Cloudflaren palvelimet eivät pääse käsiksi omaan
koneesi paikalliseen kehitysympäristöön (`vrlv3-update`-repon `docker compose`), joten
`localhost`-osoite toimii vain lokaalissa `wrangler pages dev` / `wrangler dev` -ajossa
(ks. alla), ei julkaistussa versiossa.

## Paikallinen kehitys

```bash
cd kilpailukeskus
cp .dev.vars.example .dev.vars     # täytä oikeat/testitunnukset, ei koskaan gitiin
npx wrangler d1 execute oakh4632-db --local --file=migrations/0001_init.sql
npm run dev                         # http://127.0.0.1:8788

# toisessa ikkunassa, cron-workerin testaus samaa lokaalia D1:tä vasten:
cd cron
cp .dev.vars.example .dev.vars     # SAMAT VRL_*-arvot kuin yllä - wrangler dev lukee .dev.vars
                                    # vain samasta hakemistosta kuin wrangler.toml, ei periydy
                                    # kilpailukeskus-juuren .dev.vars:sta. Ilman tätä tulosten
                                    # automaattilähetys epäonnistuu hiljaa virheeseen "Pakollisia
                                    # parametreja puuttuu: --base-url, --identity, --password".
npx wrangler dev --port=8789 --persist-to="../.wrangler/state"
curl -X POST http://127.0.0.1:8789/aja   # laukaisee arvonnan/tulosten lähetyksen käsin
```

`wrangler pages dev` lukee `.dev.vars`:n automaattisesti. `.dev.vars` on `.gitignore`:ssä —
älä koskaan committaa oikeita tunnuksia.

## Tietoturva

- `cron`-workerin `POST /aja` -reitti ei ole tällä hetkellä suojattu millään
  tunnistautumisella — kuka tahansa URL:n löytävä voi laukaista arvonnan/tulosten lähetyksen
  ennenaikaisesti. Riski on pieni (reitti vain ajaa saman logiikan mitä cron muutenkin ajaisi
  kohta itsestään, ei tuhoa dataa), mutta jos tämä huolestuttaa, suojaa reitti esim. jaetulla
  salaisuudella (`Authorization`-otsake, verrataan `env.AJA_SALAISUUS`-secrettiin) tai
  Cloudflare Accessilla.
- Kilpailukeskuksen ilmoittautumissivuilla ei ole kirjautumista/pääsynvalvontaa (kuka tahansa
  linkin saanut voi ilmoittautua) — tarkoituksenmukaista julkiselle ilmoittautumiselle, mutta
  huomioi tämä ennen linkin jakamista.
- Spämmi-ilmoittautumisia vastaan ilmoittautumislomakkeella on Cloudflare Turnstile
  -bottitarkistus (ks. `lib/turnstile.js`). Se on käytössä vain kun `TURNSTILE_SITE_KEY`- ja
  `TURNSTILE_SECRET_KEY`-ympäristömuuttujat on asetettu (ks. "Salaisuudet" yllä) - ilman niitä
  (esim. paikallisessa kehityksessä oletuksena) lomake toimii ilman tarkistusta.
