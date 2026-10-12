'use strict';

/**
 * Matalan tason HTTP-alkeet VRL-sivuston lomakkeiden automatisointiin: evästepurkki,
 * uudelleenohjausten seuranta ja "onnistui/epäonnistui"-viestin poiminta vastaussivulta.
 * Käyttää tätä sekä kilpailu_client.js (kilpailun ilmoittaminen) että tulokset_client.js
 * (tulosten ilmoittaminen) - kirjautumis- ja HTTP-logiikka pidetään yhdessä paikassa.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class Evastepurkki {
  constructor() {
    this.evasteet = new Map();
  }

  paivita(setCookieRivit) {
    if (!setCookieRivit) return;
    for (const rivi of setCookieRivit) {
      const ensimmainenOsa = rivi.split(';')[0];
      const yhtasuuruus = ensimmainenOsa.indexOf('=');
      if (yhtasuuruus === -1) continue;
      const nimi = ensimmainenOsa.slice(0, yhtasuuruus).trim();
      const arvo = ensimmainenOsa.slice(yhtasuuruus + 1).trim();
      this.evasteet.set(nimi, arvo);
    }
  }

  otsake() {
    return Array.from(this.evasteet.entries())
      .map(([nimi, arvo]) => `${nimi}=${arvo}`)
      .join('; ');
  }
}

function teePyynto({ url, method, postData, jar, varmistaSsl, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const kohde = new URL(url);
    const kirjasto = kohde.protocol === 'https:' ? https : http;
    const otsakkeet = {};

    if (postData !== null) {
      otsakkeet['Content-Type'] = 'application/x-www-form-urlencoded';
      otsakkeet['Content-Length'] = Buffer.byteLength(postData);
    }
    const evasteOtsake = jar.otsake();
    if (evasteOtsake) {
      otsakkeet['Cookie'] = evasteOtsake;
    }

    const pyynto = kirjasto.request(
      kohde,
      {
        method,
        headers: otsakkeet,
        rejectUnauthorized: !varmistaSsl,
        timeout: timeoutMs,
      },
      (vastaus) => {
        jar.paivita(vastaus.headers['set-cookie']);
        const palat = [];
        vastaus.on('data', (pala) => palat.push(pala));
        vastaus.on('end', () => {
          resolve({
            statusKoodi: vastaus.statusCode,
            otsakkeet: vastaus.headers,
            runko: Buffer.concat(palat).toString('utf8'),
          });
        });
      }
    );

    pyynto.on('timeout', () => {
      pyynto.destroy(new Error('Pyyntö aikakatkaistiin.'));
    });
    pyynto.on('error', reject);

    if (postData !== null) {
      pyynto.write(postData);
    }
    pyynto.end();
  });
}

// Emuloi curlin CURLOPT_FOLLOWLOCATION-käytöstä: 301/302/303 vaihtaa POST->GET,
// 307/308 säilyttää metodin ja rungon.
//
// CodeIgniterin redirect($uri, 'refresh') (ks. fuel/codeigniter/helpers/url_helper.php)
// EI lähetä tavallista 3xx+Location-uudelleenohjausta, vaan HTTP 200 + otsake
// "Refresh:0;url=...". Auth::login() (fuel/application/controllers/Auth.php) käyttää
// tätä aina kirjautumisen jälkeen sekä onnistuessa että epäonnistuessa, joten se pitää
// tunnistaa erikseen - muuten kirjautumisvastauksen runko jää tyhjäksi eikä
// "auth/logout"-tarkistus koskaan osu, vaikka kirjautuminen oikeasti onnistuisi.
async function pyydaJaSeuraaOhjauksia(asetukset) {
  let { url, method, postData } = asetukset;
  let uudelleenohjauksia = 0;

  for (;;) {
    const vastaus = await teePyynto({ ...asetukset, url, method, postData });

    let sijainti = null;
    let onRefreshOhjaus = false;

    if ([301, 302, 303, 307, 308].includes(vastaus.statusKoodi) && vastaus.otsakkeet.location) {
      sijainti = vastaus.otsakkeet.location;
    } else if (vastaus.otsakkeet.refresh) {
      const osuma = /url=(.+)$/i.exec(vastaus.otsakkeet.refresh);
      if (osuma) {
        sijainti = osuma[1];
        onRefreshOhjaus = true;
      }
    }

    if (sijainti) {
      uudelleenohjauksia += 1;
      if (uudelleenohjauksia > 5) {
        throw new Error('Liikaa uudelleenohjauksia.');
      }
      url = new URL(sijainti, url).toString();
      if (onRefreshOhjaus || ([301, 302, 303].includes(vastaus.statusKoodi) && method === 'POST')) {
        method = 'GET';
        postData = null;
      }
      continue;
    }

    return vastaus;
  }
}

function poimiLomakeviesti(html) {
  // Sivu näyttää tuloksen elementissä <div class="alert alert-success|danger">...</div>,
  // ks. esim. fuel/application/views/misc/haku.php, kilpailutoiminta/omat_kilpailut.php
  const osuma = html.match(/<div class="alert alert-(success|danger)" role="alert">([\s\S]*?)<\/div>/);
  if (!osuma) {
    return [null, null];
  }
  const tyyppi = osuma[1];
  const teksti = osuma[2]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [tyyppi, teksti];
}

/**
 * Kirjautuu sisään ja palauttaa evästepurkin jatkokäyttöön (minkä tahansa lomakkeen
 * lähetys). CSRF-suojaus on pois päältä tuotannossa (config['csrf_protection'] = FALSE),
 * joten tokenia ei tarvita.
 *
 * @param {string} lomakeUrl Sivu, johon kirjautumisen jälkeinen "refresh"-ohjaus osoitetaan
 *   (ks. yllä) - ei vaikuta itse kirjautumiseen, mutta pidetään samana kuin lopullinen
 *   kohde, jotta käytös vastaa mahdollisimman tarkasti selaimella tehtyä kirjautumista.
 */
async function kirjaudu({ baseUrl, identity, password, lomakeUrl, varmistaSsl, timeoutMs }) {
  const jar = new Evastepurkki();
  const kohdeUrl = lomakeUrl || baseUrl;

  let vastaus;
  try {
    vastaus = await pyydaJaSeuraaOhjauksia({
      url: `${baseUrl}/auth/login`,
      method: 'POST',
      postData: new URLSearchParams({ identity, password, url: kohdeUrl }).toString(),
      jar,
      varmistaSsl,
      timeoutMs,
    });
  } catch (virhe) {
    return { onnistui: false, viesti: `Kirjautumispyyntö epäonnistui: ${virhe.message}` };
  }

  if (vastaus.statusKoodi >= 400) {
    return { onnistui: false, viesti: `Kirjautumispyyntö palautti HTTP-virheen ${vastaus.statusKoodi}.` };
  }
  // Kirjautuneena näkyy "Kirjaudu ulos" -linkki (auth/logout), ks. fuel/application/views/_blocks/header.php
  if (!vastaus.runko.includes('auth/logout')) {
    return { onnistui: false, viesti: 'Kirjautuminen epäonnistui. Tarkista tunnus ja salasana.' };
  }

  return { onnistui: true, jar };
}

module.exports = { Evastepurkki, teePyynto, pyydaJaSeuraaOhjauksia, poimiLomakeviesti, kirjaudu };
