'use strict';

/**
 * E2E-testi omien hevosten automaattilisäykselle (ks. lib/omat_hevoset.js) - luo yhden
 * kilpailun jokaiselle kuudelle tuetulle jaokselle (ks. lib/jaokset.js), luokat jokaisen
 * jaoksen oikeaa lajitasoa vastaavilla nimillä, lähettää kilpailun oikeasti VRL:n
 * kisakalenteriin (paikallinen VRL-devympäristö, ks. README.md "Paikallinen kehitys"),
 * odottaa automaattista VRL-kisa-id:n hakua (sama sivupyyntö laukaisee myös omien hevosten
 * haun, ks. functions/kilpailut/[id]/index.js), ja tarkistaa lopuksi suoraan paikallisesta
 * D1-kannasta montako hevosta kuhunkin luokkaan tuli.
 *
 * Luokkien nimet haetaan ajon aikana suoraan ulkoisesta rajapinnasta (kunkin lajin oikeat
 * discipline_level-arvot) sen sijaan että ne olisi kovakoodattu tähän - näin testi pysyy
 * ajantasaisena vaikka rajapinnan data muuttuisi.
 *
 * Pääajon (JAOKSET_TESTIIN, max 100 osallistujaa/luokka) lisäksi RAJATESTIT ajaa vielä
 * pari kilpailua pienemmillä osallistujarajoilla (30 ja 50/luokka, eri tallilla TE28437
 * ettei kuluteta pääajon tallin päiväkiintiötä) - varmistaa että sekä luokan täyttöraja
 * että "enintään 10 % ratsastajalta" -sääntö (ks. lib/saannot.js) skaalautuvat oikein
 * myös muilla kuin oletusarvolla. Kumpikin raja tarkistetaan kovana assert-tyyppisenä
 * virheenä (ks. testaaJaos) - testi kaatuu jos jompikumpi ylittyy.
 *
 * Vaatii ajossa (ks. README.md "Paikallinen kehitys"):
 *   - `npm run dev`                                     (wrangler pages dev, portti 8788)
 *   - lokaali VRL-dev-ympäristö osoitteessa .dev.vars:n VRL_BASE_URL
 *   - OMA_RATSASTAJA_NIMI / OMA_RATSASTAJA_VRL_TUNNUS asetettuna .dev.vars:iin
 *   - cron-workeria EI tarvita (testi ei arvo kilpailuja eikä lähetä tuloksia)
 *
 * Käyttö:  node test/e2e_omat_hevoset.js
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PAGES_BASE = process.env.KK_BASE_URL || 'http://127.0.0.1:8788';
const HEVOS_API_URL = 'https://sg-visu.vercel.app/api/horses/by-owner-discipline';
const OMA_TALLI = 'Tilli';

// jaos-id -> [lyhenne, rajapinnan discipline-parametri, VRL:n maxLahtojaPerHevonen tälle
// jaokselle (ks. lib/jaosrajoitukset.js - kopioitu tähän koska testi ajetaan Node-
// prosessina, ei Workers-runtimessa)].
const JAOKSET_TESTIIN = [
  { jaos: '1', lyhenne: 'ERJ', laji: 'esteratsastus', maxLahtoja: 2 },
  { jaos: '2', lyhenne: 'KRJ', laji: 'kouluratsastus', maxLahtoja: 2 },
  { jaos: '3', lyhenne: 'KERJ', laji: 'kenttäratsastus', maxLahtoja: 1 },
  { jaos: '4', lyhenne: 'VVJ', laji: 'valjakkoajo', maxLahtoja: 2 },
  { jaos: '5', lyhenne: 'WRJ', laji: 'westernratsastus', maxLahtoja: 6 },
  { jaos: '6', lyhenne: 'ARJ', laji: 'askellajiratsastus', maxLahtoja: 10 },
];

// Erilliset ajot pienemmillä osallistujarajoilla (ks. testaaJaos:n opts.maxOsallistujiaPerLuokka)
// - varmistaa että sekä luokan täyttöraja että "enintään 10 % ratsastajalta" -sääntö (ks.
// lib/saannot.js:n ratsastajanMaxHevoset) skaalautuvat oikein myös muilla kuin oletus-
// arvolla (100). Eri talli (TE28437, ks. käyttäjän ohje) kuin pääajon TEST2062 - vaikka
// luoKilpailu jo yrittää uudelleen päivätörmäyksissä, eri talli välttää törmäykset
// kokonaan eikä kuluta samaa tallin päiväkiintiötä pääajon kilpailujen kanssa.
const RAJATESTIT = [
  { jaosId: '1', maxOsallistujiaPerLuokka: 30 },
  { jaosId: '2', maxOsallistujiaPerLuokka: 50 },
];
const RAJATESTI_TALLI = 'TE28437';

// Sama kaava kuin lib/saannot.js:n ratsastajanMaxHevoset - kopioitu tähän koska testi
// ajetaan Node-prosessina, ei Workers-runtimessa.
function ratsastajanMaxHevoset(maxOsallistujia) {
  return Math.max(1, Math.floor(maxOsallistujia * 0.1));
}

function luePyaVars() {
  const tiedosto = path.join(__dirname, '..', '.dev.vars');
  const sisalto = fs.readFileSync(tiedosto, 'utf8');
  const arvot = {};
  for (const rivi of sisalto.split(/\r?\n/)) {
    const trimmed = rivi.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    arvot[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return arvot;
}

const devVars = luePyaVars();
if (!devVars.ADMIN_USER || !devVars.ADMIN_PASSWORD) {
  throw new Error('.dev.vars: ADMIN_USER/ADMIN_PASSWORD puuttuu.');
}
if (!devVars.OMA_RATSASTAJA_NIMI || !devVars.OMA_RATSASTAJA_VRL_TUNNUS) {
  throw new Error('.dev.vars: OMA_RATSASTAJA_NIMI/OMA_RATSASTAJA_VRL_TUNNUS puuttuu - omien hevosten lisäys ei ole käytössä.');
}

let istuntoEvaste = null;

function loki(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

async function kirjaudu() {
  const res = await fetch(`${PAGES_BASE}/kirjaudu`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({ kayttajanimi: devVars.ADMIN_USER, salasana: devVars.ADMIN_PASSWORD, jatka: '/' }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const asetettuEvaste = res.headers.get('set-cookie');
  if (res.status !== 303 || !asetettuEvaste) {
    throw new Error(`Admin-kirjautuminen epäonnistui (HTTP ${res.status}).`);
  }
  istuntoEvaste = asetettuEvaste.split(';')[0];
}

async function haeAdmin(polku, init = {}) {
  return fetch(`${PAGES_BASE}${polku}`, { ...init, headers: { ...(init.headers || {}), Cookie: istuntoEvaste } });
}

async function odota(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function poimiKilpailuId(url) {
  const m = /\/kilpailut\/(\d+)/.exec(url);
  if (!m) throw new Error(`Kilpailun id:tä ei löytynyt osoitteesta: ${url}`);
  return m[1];
}

function isoPaivienPaasta(paivia) {
  const d = new Date();
  d.setDate(d.getDate() + paivia);
  return d.toISOString().slice(0, 10);
}

function poimiTila(html) {
  const m = /class="tila tila-([a-z_]+)"/.exec(html);
  return m ? m[1] : null;
}

function poimiVrlKisaId(html) {
  const m = /VRL-kisa-id\s+([^\s<·]+)/.exec(html);
  return m ? m[1] : null;
}

function poimiVrlViesti(html) {
  const m = /<div class="viesti viesti-virhe">([\s\S]*?)<\/div>/.exec(html);
  if (!m) return null;
  return m[1].replace(/<strong>[\s\S]*?<\/strong>/, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Hakee rajapinnasta kunkin lajin todelliset (ei-null) lajitasot laskureineen - näiden
// pohjalta luodaan kilpailun luokat, jotta täsmäys on taattu sillä hetkellä oikealla datalla.
async function haeLajitasot(laji) {
  const res = await fetch(`${HEVOS_API_URL}?${new URLSearchParams({ owner: OMA_TALLI, discipline: laji })}`);
  if (!res.ok) throw new Error(`Rajapinta vastasi ${res.status} lajille ${laji}`);
  const data = await res.json();
  const laskuri = new Map();
  for (const h of data.horses || []) {
    if (!h.discipline_level) continue;
    laskuri.set(h.discipline_level, (laskuri.get(h.discipline_level) || 0) + 1);
  }
  return { kokonaismaara: data.count, tasot: laskuri };
}

async function luoKilpailu(jaosTieto, luokkaNimet, { jarjTalli = 'TEST2062', maxOsallistujiaPerLuokka = 100 } = {}) {
  const vipOffset = 15 + Math.floor(Math.random() * 10); // 15-24 vrk tästä päivästä
  const kpOffset = vipOffset + 1 + Math.floor(Math.random() * 5); // 1-5 vrk vip:n jälkeen
  const vip = isoPaivienPaasta(vipOffset);
  const kp = isoPaivienPaasta(kpOffset);
  const nimi = `E2E-omat-hevoset-${jaosTieto.lyhenne}-max${maxOsallistujiaPerLuokka} ${new Date().toISOString().replace(/[:.]/g, '-')}`;

  const body = new URLSearchParams({
    nimi,
    jaos: jaosTieto.jaos,
    kp,
    vip,
    arvontatapa: '1',
    jarj_talli: jarjTalli,
    jarj_talli_nimi: 'E2E Testitalli',
    jarj_talli_url: 'https://esimerkki.fi',
    info: `Automaattitesti - omien hevosten lisäys (${jaosTieto.laji}, max ${maxOsallistujiaPerLuokka}/luokka).`,
    takaaja: '',
    vastuuhenkilo_nimi: 'E2E Testaaja',
    vastuuhenkilo_email: 'e2e-testi@esimerkki.fi',
    max_lahtoja_per_hevonen: String(jaosTieto.maxLahtoja),
    max_osallistujia_per_luokka: String(maxOsallistujiaPerLuokka),
    luokat: luokkaNimet.map((n, i) => `${i + 1}. ${n}`).join('\n'),
  });

  const res = await haeAdmin('/kilpailut/uusi', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) {
    const teksti = await res.text();
    throw new Error(`Kilpailun luonti epäonnistui (${jaosTieto.lyhenne}, HTTP ${res.status}):\n${teksti.slice(0, 2000)}`);
  }
  const kilpailuId = poimiKilpailuId(res.url);
  loki(`[${jaosTieto.lyhenne}] Kilpailu luotu: id=${kilpailuId}, ${luokkaNimet.length} luokkaa, kp=${kp}, vip=${vip}`);
  return kilpailuId;
}

async function haeKilpailuSivu(kilpailuId) {
  const res = await haeAdmin(`/kilpailut/${kilpailuId}`);
  if (!res.ok) throw new Error(`Kilpailun sivun haku epäonnistui (HTTP ${res.status})`);
  return res.text();
}

async function hyvaksyJaLahetaVrl(kilpailuId, lyhenne) {
  const res = await haeAdmin(`/kilpailut/${kilpailuId}/laheta-vrl`, { method: 'POST' });
  if (!res.ok) throw new Error(`VRL-lähetys epäonnistui (${lyhenne}, HTTP ${res.status})`);
  const html = await res.text();
  const tila = poimiTila(html);
  if (tila !== 'avoinna') {
    const viesti = poimiVrlViesti(html);
    throw new Error(`[${lyhenne}] VRL-lähetys ei onnistunut - tila jäi '${tila}'. VRL:n viesti: ${viesti || '(ei viestiä)'}`);
  }
  loki(`[${lyhenne}] VRL-lähetyksen jälkeen tila: ${tila}`);
}

async function varmistaVrlKisaId(kilpailuId, lyhenne, { yritykset = 8, valiMs = 3000 } = {}) {
  for (let i = 1; i <= yritykset; i++) {
    const html = await haeKilpailuSivu(kilpailuId);
    const kisaId = poimiVrlKisaId(html);
    if (kisaId) {
      loki(`[${lyhenne}] VRL-kisa-id saatu: ${kisaId} (yritys ${i}/${yritykset})`);
      return kisaId;
    }
    loki(`[${lyhenne}] VRL-kisa-id ei vielä saatu (yritys ${i}/${yritykset}), odotetaan ${valiMs}ms...`);
    await odota(valiMs);
  }
  throw new Error(`[${lyhenne}] VRL-kisa-id:tä ei saatu automaattihaulla määräajassa.`);
}

// Löytää wranglerin paikallisesti persistoiman D1-sqlite-tiedoston (hash vaihtelee per
// projekti/asennus) etsimällä tiedoston jossa on 'kilpailut'-taulu.
function loydaD1Tiedosto() {
  const dir = path.join(__dirname, '..', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.sqlite')) continue;
    const tiedostoPolku = path.join(dir, f);
    try {
      const db = new DatabaseSync(tiedostoPolku, { readOnly: true });
      const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kilpailut'").get();
      db.close();
      if (t) return tiedostoPolku;
    } catch {
      // ei kelvollinen sqlite-tiedosto, ohitetaan
    }
  }
  throw new Error('D1-sqlite-tiedostoa ei löytynyt .wrangler/state:sta - onko `npm run dev` ajettu ainakin kerran?');
}

function lueTulosSuoraanKannasta(db, kilpailuId) {
  const kilpailu = db.prepare('SELECT omat_hevoset_lisatty_at, omat_hevoset_virheet FROM kilpailut WHERE id = ?').get(kilpailuId);
  const luokat = db.prepare('SELECT id, nimi, max_osallistujia FROM luokat WHERE kilpailu_id = ? ORDER BY jarjestys, id').all(kilpailuId);
  const luokkaRivit = luokat.map((l) => {
    const cnt = db.prepare('SELECT COUNT(*) AS n FROM osallistujat WHERE luokka_id = ?').get(l.id);
    return { nimi: l.nimi, maara: cnt.n, max: l.max_osallistujia };
  });
  const virheet = kilpailu.omat_hevoset_virheet ? JSON.parse(kilpailu.omat_hevoset_virheet) : [];
  return { lisattyAt: kilpailu.omat_hevoset_lisatty_at, luokkaRivit, virheet };
}

async function testaaJaos(jaosTieto, db, opts = {}) {
  const { jarjTalli = 'TEST2062', maxOsallistujiaPerLuokka = 100 } = opts;
  const { kokonaismaara, tasot } = await haeLajitasot(jaosTieto.laji);
  const luokkaNimet = [...tasot.keys()];

  if (luokkaNimet.length === 0) {
    loki(`[${jaosTieto.lyhenne}] Rajapinnalla ei ole yhtään lajitasollista hevosta (${OMA_TALLI}/${jaosTieto.laji}, ` +
      `kokonaismäärä=${kokonaismaara}) - kilpailua ei luoda, tämä on odotettu tulos jos omistajalla ei ole hevosia tässä lajissa.`);
    return { jaosTieto, luotu: false, kokonaismaara, tasot: [], yhteensaLisatty: 0, virheet: [] };
  }

  // Sama talli + jaos + kilpailupäivä ei kelpaa VRL:lle kahta kertaa - aiemmista
  // testiajoista (myös test/e2e_taytto_ja_tulokset.js:stä) jää kantaan paljon vanhoja
  // testikilpailuja samalle tallille, joten satunnainen päivä voi törmätä johonkin niistä.
  // Yritetään uudelleen tuoreella satunnaisella päivällä jos näin käy.
  let kilpailuId;
  for (let yritys = 1; ; yritys++) {
    kilpailuId = await luoKilpailu(jaosTieto, luokkaNimet, { jarjTalli, maxOsallistujiaPerLuokka });
    try {
      await hyvaksyJaLahetaVrl(kilpailuId, jaosTieto.lyhenne);
      break;
    } catch (virhe) {
      const tormaus = /useampia kuin yhdet saman jaoksen kilpailut\/p\S*iv/i.test(virhe.message);
      if (!tormaus || yritys >= 5) throw virhe;
      loki(`[${jaosTieto.lyhenne}] Päivätörmäys VRL:n kanssa (yritys ${yritys}/5), yritetään uudella satunnaisella päivällä...`);
    }
  }
  await varmistaVrlKisaId(kilpailuId, jaosTieto.lyhenne);

  // Sama GET (varmistaVrlKisaId:n sisällä) joka löysi vrl_kisa_id:n ajoi jo omien hevosten
  // haun (ks. functions/kilpailut/[id]/index.js) - luetaan lopputulos suoraan kannasta.
  const tulos = lueTulosSuoraanKannasta(db, kilpailuId);
  const yhteensaLisatty = tulos.luokkaRivit.reduce((s, l) => s + l.maara, 0);

  loki(
    `[${jaosTieto.lyhenne}] kilpailu ${kilpailuId} (talli ${jarjTalli}, max ${maxOsallistujiaPerLuokka}/luokka): ` +
      `lisätty yhteensä ${yhteensaLisatty}/${kokonaismaara} hevosta, ${tulos.virheet.length} virhettä.`
  );
  for (const l of tulos.luokkaRivit) {
    loki(`    ${l.nimi}: ${l.maara} osallistujaa (max ${l.max})${tasot.has(l.nimi.replace(/^\d+\.\s*/, '')) ? '' : ' [ei API-dataa tälle tasolle]'}`);
  }

  // Kovat tarkistukset: kumpikaan sääntö (luokan täyttöraja, "enintään 10 % ratsastajalta")
  // ei saa ylittyä pelkästään siksi että lisäys on automaattinen (ks. lib/omat_hevoset.js).
  for (const l of tulos.luokkaRivit) {
    if (l.max != null && l.maara > l.max) {
      throw new Error(`[${jaosTieto.lyhenne}] Luokka "${l.nimi}" ylitti luokan osallistujarajan: ${l.maara} > ${l.max}.`);
    }
    const ratsastajaRaja = l.max != null ? ratsastajanMaxHevoset(l.max) : null;
    if (ratsastajaRaja != null && l.maara > ratsastajaRaja) {
      throw new Error(
        `[${jaosTieto.lyhenne}] Luokka "${l.nimi}" ylitti ratsastajan enimmäismäärän: ${l.maara} > ${ratsastajaRaja} ` +
          `(10 % luokan ${l.max} osallistujasta).`
      );
    }
  }

  return {
    jaosTieto,
    kilpailuId,
    luotu: true,
    kokonaismaara,
    tasot: luokkaNimet,
    yhteensaLisatty,
    virheet: tulos.virheet,
    maxOsallistujiaPerLuokka,
  };
}

async function main() {
  loki(`Kilpailukeskus: ${PAGES_BASE}`);
  await kirjaudu();

  const d1Polku = loydaD1Tiedosto();
  loki(`D1-tiedosto: ${d1Polku}`);
  const db = new DatabaseSync(d1Polku, { readOnly: true });

  const tulokset = [];
  for (const jaosTieto of JAOKSET_TESTIIN) {
    tulokset.push(await testaaJaos(jaosTieto, db));
  }

  // Erilliset ajot pienemmillä luokkakohtaisilla osallistujarajoilla (ks. RAJATESTIT) -
  // varmistaa että sekä luokan täyttöraja että ratsastajan 10 %-raja skaalautuvat oikein
  // myös muilla kuin oletusarvolla (100), eri tallilla ettei kuluteta pääajon tallin
  // päiväkiintiötä.
  for (const rajatesti of RAJATESTIT) {
    const jaosTieto = JAOKSET_TESTIIN.find((j) => j.jaos === rajatesti.jaosId);
    tulokset.push(
      await testaaJaos(jaosTieto, db, { jarjTalli: RAJATESTI_TALLI, maxOsallistujiaPerLuokka: rajatesti.maxOsallistujiaPerLuokka })
    );
  }

  db.close();

  console.log('\n=== YHTEENVETO ===');
  let epaonnistui = false;
  for (const t of tulokset) {
    if (!t.luotu) {
      console.log(`${t.jaosTieto.lyhenne} (${t.jaosTieto.laji}): EI HEVOSIA rajapinnalla (${OMA_TALLI}) - kilpailua ei luotu, odotettu jos data tyhjä.`);
      continue;
    }
    const status = t.yhteensaLisatty > 0 ? 'OK' : 'EI YHTÄÄN HEVOSTA LISÄTTY';
    if (t.yhteensaLisatty === 0) epaonnistui = true;
    console.log(
      `${t.jaosTieto.lyhenne} (${t.jaosTieto.laji}), kilpailu ${t.kilpailuId} (max ${t.maxOsallistujiaPerLuokka}/luokka): ` +
        `${status} - ${t.yhteensaLisatty} hevosta lisätty ${t.tasot.length} luokkaan, ${t.virheet.length} virhettä.`
    );
    if (t.virheet.length > 0) {
      console.log(`  Virheet:\n    ${t.virheet.join('\n    ')}`);
    }
  }

  if (epaonnistui) {
    throw new Error('Vähintään yhteen luotuun kilpailuun ei lisätty yhtään hevosta - ks. yllä.');
  }
  console.log('\nKaikkiin luotuihin kilpailuihin lisättiin omia hevosia onnistuneesti API:n kautta.');
}

main().catch((virhe) => {
  console.error('\n=== TESTI EPÄONNISTUI ===');
  console.error(virhe.message);
  process.exitCode = 1;
});
