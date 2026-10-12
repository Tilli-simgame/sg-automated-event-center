'use strict';

/**
 * Sama rooli kuin ../../../lib/http_client.js: evästepurkki, uudelleenohjausten seuranta
 * ja "onnistui/epäonnistui"-viestin poiminta vastaussivulta. Tämä on kuitenkin
 * fetch-pohjainen portti Cloudflare Workers/Pages-ympäristöön, koska alkuperäinen käyttää
 * Noden `http`/`https`-ydinmoduuleja, joita Workers-runtime ei tue. Julkinen rajapinta
 * (poimiLomakeviesti, kirjaudu, pyydaJaSeuraaOhjauksia) on tahallaan identtinen, jotta
 * ../../../lib/kilpailu_client.js ja ../../../lib/tulokset_client.js voidaan käyttää
 * sellaisenaan tätä vasten.
 *
 * Huom: `varmistaSsl`-parametri (Node-version rejectUnauthorized) ei ole käytössä täällä -
 * Workersin fetch ei tarjoa keinoa ohittaa TLS-varmenteen tarkistusta, eikä sitä
 * tuotantokäytössä (https://virtuaalihevoset.net) tarvitakaan.
 */

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

function lueSetCookiet(otsakkeet) {
  if (typeof otsakkeet.getSetCookie === 'function') {
    return otsakkeet.getSetCookie();
  }
  const yksi = otsakkeet.get('set-cookie');
  return yksi ? [yksi] : [];
}

async function teePyynto({ url, method, postData, jar, timeoutMs }) {
  const otsakkeet = {};
  if (postData !== null && postData !== undefined) {
    otsakkeet['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const evasteOtsake = jar.otsake();
  if (evasteOtsake) {
    otsakkeet['Cookie'] = evasteOtsake;
  }

  const ohjaus = new AbortController();
  const kello = setTimeout(() => ohjaus.abort(), timeoutMs || 30000);

  let vastaus;
  try {
    vastaus = await fetch(url, {
      method,
      headers: otsakkeet,
      body: postData ?? undefined,
      redirect: 'manual',
      signal: ohjaus.signal,
    });
  } catch (virhe) {
    if (virhe.name === 'AbortError') {
      throw new Error('Pyyntö aikakatkaistiin.');
    }
    throw virhe;
  } finally {
    clearTimeout(kello);
  }

  jar.paivita(lueSetCookiet(vastaus.headers));

  const runko = await vastaus.text();
  const otsakkeetObj = {};
  for (const [nimi, arvo] of vastaus.headers.entries()) {
    otsakkeetObj[nimi] = arvo;
  }

  return { statusKoodi: vastaus.status, otsakkeet: otsakkeetObj, runko };
}

// Sama logiikka kuin ../../../lib/http_client.js: emuloi curlin
// CURLOPT_FOLLOWLOCATION-käytöstä (301/302/303 vaihtaa POST->GET, 307/308 säilyttää) ja
// tunnistaa CodeIgniterin "Refresh:0;url=..." -ohjauksen, jota Auth::login() käyttää aina
// kirjautumisen jälkeen (ks. alkuperäisen tiedoston kommentti tarkemmasta selityksestä).
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

async function kirjaudu({ baseUrl, identity, password, lomakeUrl, timeoutMs }) {
  const jar = new Evastepurkki();
  const kohdeUrl = lomakeUrl || baseUrl;

  let vastaus;
  try {
    vastaus = await pyydaJaSeuraaOhjauksia({
      url: `${baseUrl}/auth/login`,
      method: 'POST',
      postData: new URLSearchParams({ identity, password, url: kohdeUrl }).toString(),
      jar,
      timeoutMs,
    });
  } catch (virhe) {
    return { onnistui: false, viesti: `Kirjautumispyyntö epäonnistui: ${virhe.message}` };
  }

  if (vastaus.statusKoodi >= 400) {
    return { onnistui: false, viesti: `Kirjautumispyyntö palautti HTTP-virheen ${vastaus.statusKoodi}.` };
  }
  if (!vastaus.runko.includes('auth/logout')) {
    return { onnistui: false, viesti: 'Kirjautuminen epäonnistui. Tarkista tunnus ja salasana.' };
  }

  return { onnistui: true, jar };
}

export { Evastepurkki, teePyynto, pyydaJaSeuraaOhjauksia, poimiLomakeviesti, kirjaudu };
