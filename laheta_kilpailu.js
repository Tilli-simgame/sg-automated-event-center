#!/usr/bin/env node
'use strict';

/**
 * Itsenäinen komentorivi-/HTTP-skripti "Ilmoita perinteiset kilpailut" -lomakkeen
 * (/kilpailutoiminta/ilmoita_kilpailut/perinteiset) täyttöön ja lähetykseen.
 *
 * Ei ole osa CodeIgniter/FuelCMS-sovellusta eikä riipu mistään tämän repon tiedostosta -
 * tekee pelkkiä HTTP-kutsuja kohdesivustolle (--base-url) ulkopuolelta, samalla tavalla
 * kuin selaimessa täytetty lomake tekisi. Voidaan ajaa miltä tahansa palvelimelta, jolla
 * on Node.js ja verkkoyhteys kohdesivustolle. Ei ulkoisia npm-riippuvuuksia.
 *
 * Varsinainen HTTP-logiikka on jaettu tiedostossa lib/kilpailu_client.js, jota käyttää
 * myös panel/server.js (web-hallintapaneeli).
 * Ks. send-application/README.md käyttöohjeille.
 */

const { lahetaKilpailu } = require('./lib/kilpailu_client');

function tulostaVirhe(viesti) {
  process.stderr.write(`VIRHE: ${viesti}\n`);
}

function tulostaKaytto() {
  console.log(`Käyttö: node laheta_kilpailu.js [valitsimet]

Pakolliset valitsimet (tai vastaava ympäristömuuttuja):
  --base-url=URL       Sivuston osoite, esim. https://virtuaalihevoset.net (tai VRL_BASE_URL)
  --identity=TUNNUS    Kirjautumistunnus, esim. VRL-00000 tai sähköposti (tai VRL_IDENTITY)
  --password=SALASANA  Salasana (tai VRL_PASSWORD)
  --jaos=ID             Jaoksen id (numero)
  --kp=PP.KK.VVVV        Kilpailupäivä
  --vip=PP.KK.VVVV       Viimeinen ilmoittautumispäivä
  --kutsu=URL           Kilpailukutsun osoite (15-300 merkkiä)
  --arvontatapa=N       1=Lyhyt/pitkä arvonta, 2=Suhteutettu arvonta, 4=Tuotos/kysymys
  --jarj-talli=TUNNUS   Järjestävän tallin tunnus, esim. XXXX0000 (oltava oma talli)

Valinnaiset:
  --info=TEKSTI         Lisätiedot (max 300 merkkiä)
  --takaaja=VRL-00000   Takaaja (pakollinen vain jos etuuspisteet on nollattu)
  --insecure            Älä varmista SSL-varmennetta (itse allekirjoitetut varmenteet devissä)
  --timeout=SEKUNTIA    HTTP-pyyntöjen aikakatkaisu (oletus 30)
  --help                Näytä tämä ohje

Esimerkki:
  node laheta_kilpailu.js --base-url=https://virtuaalihevoset.net \\
    --identity=VRL-00000 --password=salasana123 \\
    --jaos=3 --kp=24.10.2026 --vip=10.10.2026 \\
    --kutsu=https://example.com/kilpailukutsu --arvontatapa=1 \\
    --jarj-talli=XXXX0000 --info="Huom, ratsastuskengät pakolliset"

Vinkki: send-application/panel/server.js tarjoaa saman toiminnon pienenä
web-lomakkeena, jos komentorivivalitsimet tuntuvat hankalilta kokeiluun.

Onnistuessaan skripti tulostaa vahvistuksen ja palauttaa exit-koodin 0.
Epäonnistuessaan skripti tulostaa syyn stderr:iin ja palauttaa exit-koodin 1.
`);
}

function jasennaValitsimet(argv) {
  const valitsimet = {};
  for (const arg of argv.slice(2)) {
    const kvMatch = arg.match(/^--([a-zA-Z0-9_-]+)=([\s\S]*)$/);
    if (kvMatch) {
      valitsimet[kvMatch[1]] = kvMatch[2];
      continue;
    }
    const flagMatch = arg.match(/^--([a-zA-Z0-9_-]+)$/);
    if (flagMatch) {
      valitsimet[flagMatch[1]] = true;
    }
  }
  return valitsimet;
}

async function main() {
  const valitsimet = jasennaValitsimet(process.argv);

  if (valitsimet.help) {
    tulostaKaytto();
    return 0;
  }

  const asetukset = {
    baseUrl: (valitsimet['base-url'] ?? process.env.VRL_BASE_URL) || '',
    identity: valitsimet.identity ?? process.env.VRL_IDENTITY ?? null,
    password: valitsimet.password ?? process.env.VRL_PASSWORD ?? null,
    jaos: valitsimet.jaos ?? null,
    kp: valitsimet.kp ?? null,
    vip: valitsimet.vip ?? null,
    kutsu: valitsimet.kutsu ?? null,
    arvontatapa: valitsimet.arvontatapa ?? null,
    jarjTalli: valitsimet['jarj-talli'] ?? null,
    info: valitsimet.info ?? null,
    takaaja: valitsimet.takaaja ?? null,
    varmistaSsl: !valitsimet.insecure,
    timeoutMs: (valitsimet.timeout ? parseInt(valitsimet.timeout, 10) : 30) * 1000,
  };

  const tulos = await lahetaKilpailu(asetukset, { loki: (viesti) => console.log(viesti) });

  if (!tulos.onnistui) {
    tulostaVirhe(tulos.viesti);
    if (tulos.vaihe === 'validointi') {
      console.log('');
      tulostaKaytto();
    }
    return 1;
  }

  console.log(`OK: ${tulos.viesti}`);
  return 0;
}

main()
  .then((koodi) => process.exit(koodi))
  .catch((virhe) => {
    tulostaVirhe(virhe.stack || String(virhe));
    process.exit(1);
  });
