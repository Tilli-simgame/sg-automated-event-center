'use strict';

/**
 * Hakee VRL:n kisakalenterista ("perinteiset"-välilehti, /kilpailutoiminta/kilpailukalenteri/
 * perinteiset) sen VRL-kisa-id:n, joka muuten pitäisi kopioida käsin VRL:n "Omat kilpailut"
 * -listalta (ks. [id]/aseta-kisa-id.js). Sivu ei vaadi kirjautumista - taulukon rivit tulevat
 * suoraan sivun mukana `<script>`-tagissa olevana JSON-taulukkona (`var data = [...]`), jota
 * DataTables vain koristelee selaimessa, joten haku on pelkkä GET + regex, ei kirjautumista
 * tai DOM-parsintaa vaativa scrapaus.
 *
 * Jokainen rivi vastaa yhtä VRL:n hyväksymää kilpailukutsua: { kisa_id, kp, vip, jaos,
 * jarj_talli, url, ... } - `url` on täsmälleen se osoite, joka lähetettiin VRL:lle
 * kutsu-kenttänä (ks. ../lib/kilpailu_client.js). Jokaisella kilpailulla on oma uniikki
 * kutsu-url, joten täsmäys tehdään AINOASTAAN sen perusteella. Aiempi varatäsmäys
 * (järjestävä talli + päivämäärät) poistettiin, koska se antoi väärän kilpailun id:n
 * esim. kun sama talli järjesti samoille päiville kilpailut useammassa jaoksessa.
 *
 * Rivit, joiden kisa_id on jo jonkin toisen Kilpailukeskuksen kilpailun käytössä
 * (varatutIdt), jätetään huomiotta, ja osuman pitää olla yksikäsitteinen - jos samalla
 * url:lla on useampi rivi (esim. kutsu on ilmoitettu VRL:ään kahdesti), ei arvata.
 */

const DATA_REGEX = /var\s+data\s*=\s*(\[[\s\S]*?\]);/;

function poimiRivit(html) {
  const osuma = DATA_REGEX.exec(html);
  if (!osuma) return null;
  try {
    return JSON.parse(osuma[1]);
  } catch {
    return null;
  }
}

// Vertailu sietää vain kosmeettiset erot (välilyönnit, http/https, isot kirjaimet
// domainissa, loppukauttaviiva) - polku verrataan sellaisenaan.
function normalisoiUrl(url) {
  const raaka = (url || '').toString().trim();
  if (!raaka) return '';
  try {
    const u = new URL(raaka);
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return raaka.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
}

// Hakee VRL:n kisakalenterin rivit - null jos sivu ei vastannut tai dataa ei löytynyt.
// Erotettu täsmäyksestä (etsiKisaId), jotta kisaryppään kaikille kilpailuille riittää yksi
// kalenterihaku (ks. lib/vrl_kisa_id_haku.js:n luoKalenteri).
async function haeKalenterinRivit({ baseUrl, timeoutMs }) {
  const osoite = `${(baseUrl || '').replace(/\/+$/, '')}/kilpailutoiminta/kilpailukalenteri/perinteiset`;

  const ohjaus = new AbortController();
  const kello = setTimeout(() => ohjaus.abort(), timeoutMs || 15000);
  let vastaus;
  try {
    vastaus = await fetch(osoite, { signal: ohjaus.signal });
  } finally {
    clearTimeout(kello);
  }
  if (!vastaus.ok) return null;

  const rivit = poimiRivit(await vastaus.text());
  return rivit && rivit.length ? rivit : null;
}

/**
 * @param {Array|null} rivit             haeKalenterinRivit-funktion palauttamat rivit
 * @param {string} kutsuUrl              Kilpailun kutsu_url
 * @param {Set<string>} [varatutIdt]     Muiden kilpailujen jo käyttämät kisa-id:t
 * @returns {{kisaId: string} | null}
 */
function etsiKisaId(rivit, kutsuUrl, varatutIdt) {
  const haettava = normalisoiUrl(kutsuUrl);
  if (!haettava || !rivit) return null;
  const osumat = rivit.filter(
    (r) =>
      r.kisa_id &&
      normalisoiUrl(r.url) === haettava &&
      !(varatutIdt && varatutIdt.has(String(r.kisa_id).trim()))
  );
  if (osumat.length !== 1) return null;
  return { kisaId: String(osumat[0].kisa_id) };
}

export { haeKalenterinRivit, etsiKisaId };
