#!/usr/bin/env node
'use strict';

/**
 * Itsenäinen komentorivi-/HTTP-skripti "Ilmoita tulokset" -lomakkeen
 * (/kilpailutoiminta/ilmoita_tulokset/{id}) täyttöön ja lähetykseen - vain perinteisille
 * (ei-porrastetuille) kilpailuille, sama rajaus kuin laheta_kilpailu.js:ssä.
 *
 * Ei ole osa CodeIgniter/FuelCMS-sovellusta eikä riipu mistään tämän repon tiedostosta -
 * tekee pelkkiä HTTP-kutsuja kohdesivustolle (--base-url) ulkopuolelta. Ei ulkoisia
 * npm-riippuvuuksia.
 *
 * Luokkien ja tulosten tiedot annetaan tekstitiedostona (--tiedosto=...), ks.
 * lib/tulos_tiedosto.js muodon kuvaukselle ja tulokset-testi.txt esimerkkidatalle.
 * Ks. send-application/README.md käyttöohjeille.
 */

const fs = require('fs');
const { lahetaTulokset } = require('./lib/tulokset_client');
const { jasennaTulosTiedosto } = require('./lib/tulos_tiedosto');

function tulostaVirhe(viesti) {
  process.stderr.write(`VIRHE: ${viesti}\n`);
}

function tulostaKaytto() {
  console.log(`Käyttö: node laheta_tulokset.js [valitsimet]

Pakolliset valitsimet (tai vastaava ympäristömuuttuja):
  --base-url=URL       Sivuston osoite, esim. https://virtuaalihevoset.net (tai VRL_BASE_URL)
  --identity=TUNNUS    Kirjautumistunnus, esim. VRL-00000 tai sähköposti (tai VRL_IDENTITY)
  --password=SALASANA  Salasana (tai VRL_PASSWORD)
  --kisa-id=ID          Kilpailun id URL-polusta, esim. 900009
  --tiedosto=POLKU      Tekstitiedosto luokista ja tuloksista, ks. tulokset-testi.txt

Valinnaiset:
  --insecure            Älä varmista SSL-varmennetta (itse allekirjoitetut varmenteet devissä)
  --timeout=SEKUNTIA    HTTP-pyyntöjen aikakatkaisu (oletus 30)
  --help                Näytä tämä ohje

Esimerkki:
  node laheta_tulokset.js --base-url=http://localhost --identity=VRL-00000 \\
    --password=salasana123 --kisa-id=900009 --tiedosto=tulokset-testi.txt

Vinkki: send-application/panel/server.js -osoitteessa /tulokset on saman toiminnon
web-lomake, jos komentorivivalitsimet tuntuvat hankalilta kokeiluun.

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

  const baseUrl = ((valitsimet['base-url'] ?? process.env.VRL_BASE_URL) || '').replace(/\/+$/, '');
  const identity = valitsimet.identity ?? process.env.VRL_IDENTITY ?? null;
  const password = valitsimet.password ?? process.env.VRL_PASSWORD ?? null;
  const kisaId = valitsimet['kisa-id'] ?? null;
  const tiedostoPolku = valitsimet.tiedosto ?? null;
  const varmistaSsl = !valitsimet.insecure;
  const timeoutMs = (valitsimet.timeout ? parseInt(valitsimet.timeout, 10) : 30) * 1000;

  const puuttuvat = [];
  if (!baseUrl) puuttuvat.push('--base-url');
  if (!identity) puuttuvat.push('--identity');
  if (!password) puuttuvat.push('--password');
  if (!kisaId) puuttuvat.push('--kisa-id');
  if (!tiedostoPolku) puuttuvat.push('--tiedosto');
  if (puuttuvat.length > 0) {
    tulostaVirhe(`Pakollisia parametreja puuttuu: ${puuttuvat.join(', ')}`);
    console.log('');
    tulostaKaytto();
    return 1;
  }

  let tiedostoSisalto;
  try {
    tiedostoSisalto = fs.readFileSync(tiedostoPolku, 'utf8');
  } catch (virhe) {
    tulostaVirhe(`Tiedostoa ei voitu lukea (${tiedostoPolku}): ${virhe.message}`);
    return 1;
  }

  const luokat = jasennaTulosTiedosto(tiedostoSisalto);
  if (luokat.length === 0) {
    tulostaVirhe(`Tiedostosta (${tiedostoPolku}) ei löytynyt yhtään "LUOKKA:"-merkittyä luokkaa. Ks. tulokset-testi.txt muotoesimerkille.`);
    return 1;
  }

  const tulos = await lahetaTulokset(
    { baseUrl, identity, password, kisaId, luokat, varmistaSsl, timeoutMs },
    { loki: (viesti) => console.log(viesti) }
  );

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
