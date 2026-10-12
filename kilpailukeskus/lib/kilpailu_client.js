'use strict';

/**
 * "Ilmoita perinteiset kilpailut" -lomakkeen (/kilpailutoiminta/ilmoita_kilpailut/perinteiset)
 * automatisointiin liittyvä logiikka. Käyttää sekä CLI-skriptistä (../laheta_kilpailu.js)
 * että web-hallintapaneelista (../panel/server.js) - lähetyslogiikka pidetään yhdessä
 * paikassa, ettei sama HTTP-kutsujen tulkinta ajaudu eriäväksi kahdessa eri
 * käyttöliittymässä. HTTP-alkeet (evästeet, uudelleenohjaus, kirjautuminen) tulevat
 * ./http_client.js:stä, jota käyttää myös tulokset_client.js.
 */

import { pyydaJaSeuraaOhjauksia, poimiLomakeviesti, kirjaudu } from './http_client.js';

const PAIVAMAARA_REGEX = /^\d{1,2}\.\d{1,2}\.\d{4}$/;

function puuttuvatPakolliset(asetukset) {
  const pakolliset = {
    'base-url': asetukset.baseUrl,
    identity: asetukset.identity,
    password: asetukset.password,
    jaos: asetukset.jaos,
    kp: asetukset.kp,
    vip: asetukset.vip,
    kutsu: asetukset.kutsu,
    arvontatapa: asetukset.arvontatapa,
    'jarj-talli': asetukset.jarjTalli,
  };
  return Object.entries(pakolliset)
    .filter(([, arvo]) => arvo === null || arvo === undefined || arvo === '')
    .map(([nimi]) => `--${nimi}`);
}

/**
 * Kirjautuu sisään ja lähettää "Ilmoita perinteiset kilpailut" -lomakkeen.
 *
 * @param {object} asetukset
 * @param {string} asetukset.baseUrl        Sivuston osoite, esim. https://virtuaalihevoset.net
 * @param {string} asetukset.identity       Kirjautumistunnus
 * @param {string} asetukset.password       Salasana
 * @param {string} asetukset.jaos           Jaoksen id
 * @param {string} asetukset.kp             Kilpailupäivä PP.KK.VVVV
 * @param {string} asetukset.vip            Viimeinen ilmoittautumispäivä PP.KK.VVVV
 * @param {string} asetukset.kutsu          Kilpailukutsun osoite
 * @param {string} asetukset.arvontatapa    Arvontatapa (1/2/4)
 * @param {string} asetukset.jarjTalli      Järjestävän tallin tunnus
 * @param {string} [asetukset.info]         Lisätiedot (valinnainen)
 * @param {string} [asetukset.takaaja]      Takaaja (valinnainen)
 * @param {boolean} [asetukset.varmistaSsl] Varmista SSL-varmenne (oletus true)
 * @param {number} [asetukset.timeoutMs]    Aikakatkaisu millisekunteina (oletus 30000)
 * @param {object} [valinnat]
 * @param {(viesti: string) => void} [valinnat.loki] Kutsutaan välivaiheiden etenemisviesteillä
 *   (esim. "Kirjautuminen onnistui."). Vapaaehtoinen, oletuksena ei tee mitään.
 * @returns {Promise<{onnistui: boolean, vaihe: string, viesti: string}>}
 *   `vaihe` on 'validointi' | 'kirjautuminen' | 'lomake'
 */
async function lahetaKilpailu(asetukset, valinnat = {}) {
  const loki = valinnat.loki || (() => {});
  const varmistaSsl = asetukset.varmistaSsl !== false;
  const timeoutMs = asetukset.timeoutMs || 30000;
  const baseUrl = (asetukset.baseUrl || '').replace(/\/+$/, '');

  const puuttuvat = puuttuvatPakolliset({ ...asetukset, baseUrl });
  if (puuttuvat.length > 0) {
    return {
      onnistui: false,
      vaihe: 'validointi',
      viesti: `Pakollisia parametreja puuttuu: ${puuttuvat.join(', ')}`,
    };
  }

  if (!PAIVAMAARA_REGEX.test(asetukset.kp)) {
    return {
      onnistui: false,
      vaihe: 'validointi',
      viesti: 'Kilpailupäivä (kp) on väärässä muodossa, käytä PP.KK.VVVV (esim. 24.10.2026).',
    };
  }
  if (!PAIVAMAARA_REGEX.test(asetukset.vip)) {
    return {
      onnistui: false,
      vaihe: 'validointi',
      viesti: 'Viimeinen ilmoittautumispäivä (vip) on väärässä muodossa, käytä PP.KK.VVVV (esim. 10.10.2026).',
    };
  }

  const lomakeUrl = `${baseUrl}/kilpailutoiminta/ilmoita_kilpailut/perinteiset`;

  const kirjautumistulos = await kirjaudu({
    baseUrl,
    identity: asetukset.identity,
    password: asetukset.password,
    lomakeUrl,
    varmistaSsl,
    timeoutMs,
  });
  if (!kirjautumistulos.onnistui) {
    return { onnistui: false, vaihe: 'kirjautuminen', viesti: kirjautumistulos.viesti };
  }
  loki('Kirjautuminen onnistui.');

  const lomakeKentat = {
    jaos: asetukset.jaos,
    kp: asetukset.kp,
    vip: asetukset.vip,
    url: asetukset.kutsu,
    arvontatapa: asetukset.arvontatapa,
    jarj_talli: asetukset.jarjTalli,
  };
  if (asetukset.info) lomakeKentat.info = asetukset.info;
  if (asetukset.takaaja) lomakeKentat.takaaja = asetukset.takaaja;

  let lomakevastaus;
  try {
    lomakevastaus = await pyydaJaSeuraaOhjauksia({
      url: lomakeUrl,
      method: 'POST',
      postData: new URLSearchParams(lomakeKentat).toString(),
      jar: kirjautumistulos.jar,
      varmistaSsl,
      timeoutMs,
    });
  } catch (virhe) {
    return { onnistui: false, vaihe: 'lomake', viesti: `Lomakkeen lähetys epäonnistui: ${virhe.message}` };
  }

  if (lomakevastaus.statusKoodi >= 400) {
    return {
      onnistui: false,
      vaihe: 'lomake',
      viesti: `Lomakkeen lähetys palautti HTTP-virheen ${lomakevastaus.statusKoodi}.`,
    };
  }

  const [viestiTyyppi, viestiTeksti] = poimiLomakeviesti(lomakevastaus.runko);

  if (viestiTyyppi === 'success') {
    return { onnistui: true, vaihe: 'lomake', viesti: viestiTeksti || 'Kilpailun lisääminen onnistui' };
  }
  if (viestiTyyppi === 'danger') {
    return { onnistui: false, vaihe: 'lomake', viesti: viestiTeksti || 'Lomake hylättiin, syytä ei saatu selville.' };
  }

  return {
    onnistui: false,
    vaihe: 'lomake',
    viesti: 'Vastausta ei voitu tulkita. Tarkista base-url ja käyttäjän oikeudet manuaalisesti.',
  };
}

export { lahetaKilpailu, puuttuvatPakolliset, PAIVAMAARA_REGEX };
