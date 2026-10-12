'use strict';

/**
 * E2E-testi paikallista kehitysympäristöä vasten (wrangler pages dev + cron dev worker +
 * lokaali VRL-dev-ympäristö portissa 80):
 *
 *   1. Luo kilpailu (jaos ERJ, kaksi luokkaa, max 30 osallistujaa/luokka).
 *   2. Hyväksyy ja lähettää kilpailun VRL:n kisakalenteriin -> tila 'avoinna'.
 *   3. Varmistaa (pollaa), että VRL-kisa-id on saatu automaattisesti talteen.
 *   4. Ilmoittaa jokaiseen luokkaan 30 osallistujaa (julkinen ilmoittaudu-reitti,
 *      sama validointi kuin oikealla kilpailijalla) -> luokat täyteen.
 *   5. Laukaisee cron-workerin käsin (POST /aja) - odottaa, että täysi kilpailu arvotaan
 *      ja tulokset lähetetään VRL:ään.
 *   6. Tarkistaa lopputilan ja tulostaa yhteenvedon.
 *
 * Vaatii ajossa (ks. README.md "Paikallinen kehitys"):
 *   - `npm run dev`                                     (wrangler pages dev, portti 8788)
 *   - `cd cron && npx wrangler dev --port=8789 --persist-to="../.wrangler/state"`
 *   - lokaali VRL-dev-ympäristö osoitteessa .dev.vars:n VRL_BASE_URL (tyypillisesti
 *     http://localhost, ks. ../../docker-compose.yml)
 *
 * Käyttö:  node test/e2e_taytto_ja_tulokset.js
 */

const fs = require('fs');
const path = require('path');

const PAGES_BASE = process.env.KK_BASE_URL || 'http://127.0.0.1:8788';
const CRON_BASE = process.env.KK_CRON_URL || 'http://127.0.0.1:8789';
const LUOKAN_MAX = 30;
const JAOS_ERJ = '1';

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

// Kirjautuminen tapahtuu lomakkeella (ks. functions/kirjaudu.js), joka asettaa allekirjoitetun
// sessioevästeen (ks. lib/session.js) - kirjaudutaan kerran testin alussa ja lähetetään sama
// eväste jokaisen admin-pyynnön mukana (ks. haeAdmin).
let istuntoEvaste = null;

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

function isoPaivienPaasta(paivia) {
  const d = new Date();
  d.setDate(d.getDate() + paivia);
  return d.toISOString().slice(0, 10);
}

function loki(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

async function haeAdmin(polku, init = {}) {
  const res = await fetch(`${PAGES_BASE}${polku}`, {
    ...init,
    headers: { ...(init.headers || {}), Cookie: istuntoEvaste },
  });
  return res;
}

async function odota(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poimii kilpailun id:n redirectin/kohdesivun URL:sta (/kilpailut/<id>).
function poimiKilpailuId(url) {
  const m = /\/kilpailut\/(\d+)/.exec(url);
  if (!m) throw new Error(`Kilpailun id:tä ei löytynyt osoitteesta: ${url}`);
  return m[1];
}

async function luoKilpailu() {
  // Satunnainen hajonta päivämäärissä - sama talli+jaos+kilpailupäivä-yhdistelmä ei kelpaa
  // VRL:lle kahta kertaa (Kisajarjestelma.php: "Et voi järjestää samalla tallilla useampia
  // kuin yhdet saman jaoksen kilpailut/päivä"), joten peräkkäiset testiajot samana päivänä
  // tarvitsevat eri kilpailupäivän törmäämättä aiempiin testikilpailuihin.
  const vipOffset = 15 + Math.floor(Math.random() * 10); // 15-24 vrk tästä päivästä
  const kpOffset = vipOffset + 1 + Math.floor(Math.random() * 5); // 1-5 vrk vip:n jälkeen
  const vip = isoPaivienPaasta(vipOffset);
  const kp = isoPaivienPaasta(kpOffset);
  const nimi = `E2E-testi ${new Date().toISOString().replace(/[:.]/g, '-')}`;

  const body = new URLSearchParams({
    nimi,
    jaos: JAOS_ERJ,
    kp,
    vip,
    arvontatapa: '1',
    // Paikallisen VRL-devkannan (vrlv3-update/database) valmiiksi seedattu testitalli -
    // VRL:n oma validointi (Tallit_model::is_tnro_in_use) tarkistaa vain että tnro on
    // olemassa jossain, ei että se kuuluu kirjautuneelle käyttäjälle.
    jarj_talli: 'TEST2062',
    info: 'Automaattitesti - luokkien täyttyminen, arvonta ja tulosten lähetys.',
    takaaja: '',
    vastuuhenkilo_nimi: 'E2E Testaaja',
    vastuuhenkilo_email: 'e2e-testi@esimerkki.fi',
    max_lahtoja_per_hevonen: '2',
    max_osallistujia_per_luokka: String(LUOKAN_MAX),
    luokat: ['1. E2E Testiluokka A', '2. E2E Testiluokka B'].join('\n'),
  });

  const res = await haeAdmin('/kilpailut/uusi', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.ok) {
    const teksti = await res.text();
    throw new Error(`Kilpailun luonti epäonnistui (HTTP ${res.status}):\n${teksti.slice(0, 2000)}`);
  }

  const kilpailuId = poimiKilpailuId(res.url);
  loki(`Kilpailu luotu: id=${kilpailuId}, nimi="${nimi}", kp=${kp}, vip=${vip}`);
  return kilpailuId;
}

async function haeKilpailuSivu(kilpailuId) {
  const res = await haeAdmin(`/kilpailut/${kilpailuId}`);
  if (!res.ok) throw new Error(`Kilpailun sivun haku epäonnistui (HTTP ${res.status})`);
  return res.text();
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
  return m[1]
    .replace(/<strong>[\s\S]*?<\/strong>/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function hyvaksyJaLahetaVrl(kilpailuId) {
  const res = await haeAdmin(`/kilpailut/${kilpailuId}/laheta-vrl`, { method: 'POST' });
  if (!res.ok) throw new Error(`VRL-lähetys epäonnistui (HTTP ${res.status})`);
  const html = await res.text();
  const tila = poimiTila(html);
  loki(`VRL-lähetyksen jälkeen tila: ${tila}`);
  if (tila !== 'avoinna') {
    const viesti = poimiVrlViesti(html);
    throw new Error(`Kilpailun VRL-lähetys ei onnistunut - tila jäi '${tila}'. VRL:n viesti: ${viesti || '(ei viestiä)'}`);
  }
  return html;
}

async function varmistaVrlKisaId(kilpailuId, { yritykset = 6, valiMs = 3000 } = {}) {
  for (let i = 1; i <= yritykset; i++) {
    const html = await haeKilpailuSivu(kilpailuId);
    const kisaId = poimiVrlKisaId(html);
    if (kisaId) {
      loki(`VRL-kisa-id saatu: ${kisaId} (yritys ${i}/${yritykset})`);
      return kisaId;
    }
    loki(`VRL-kisa-id ei vielä saatu (yritys ${i}/${yritykset}), odotetaan ${valiMs}ms...`);
    await odota(valiMs);
  }
  throw new Error(
    'VRL-kisa-id:tä ei saatu automaattihaulla. Tarkista kilpailun sivu selaimessa ja tarvittaessa ' +
      'täytä VRL-kisa-id käsin "Omat kilpailut" -listalta (lomake kilpailun sivulla).'
  );
}

// Kilpailun tiloissa 'luonnos'/'vrl_virhe'/'avoinna' luokan otsikkorivi on muokattava lomake
// (ks. functions/kilpailut/[id]/index.js:n luokkaOtsikkoHtml, muokattavissa-haara) - nimi on
// input value -attribuutissa, "nykyinen/max"-täyttö samassa "N / M"-tekstissä kuin lukutilassa
// (max_osallistujia on kilpailukohtainen, ei enää erikseen muokattavissa per luokka).
function poimiLuokat(html) {
  const luokat = [];
  const regex = /<input name="nimi" value="([^"]*)"[^>]*>\s*<span class="pieni">(\d+)\s*\/\s*(\d+)<\/span>/g;
  let m;
  while ((m = regex.exec(html))) {
    luokat.push({ nimi: m[1], maara: parseInt(m[2], 10), max: parseInt(m[3], 10) });
  }
  return luokat;
}

// Poimii luokka_id:t lisaa-osallistuja-lomakkeiden hidden-kentistä (muokattavassa tilassa,
// jarjestyksessä sama kuin luokat listataan).
function poimiLuokkaIdt(html) {
  const idt = [];
  const regex = /name="luokka_id" value="(\d+)"/g;
  let m;
  const nahdyt = new Set();
  while ((m = regex.exec(html))) {
    if (!nahdyt.has(m[1])) {
      nahdyt.add(m[1]);
      idt.push(m[1]);
    }
  }
  return idt;
}

// ryhmaKoodi ('91'/'92' ym.) erottaa ryhmät toisistaan niin että VRL-/VH-tunnukset eivät
// koskaan törmää eri luokkien välillä, vaikka kummassakin luokassa käytetään indeksejä 1..maara.
function muodostaOsallistujat(ryhmaKoodi, maara, etuliite) {
  const rivit = [];
  for (let i = 1; i <= maara; i++) {
    const vrlTunnus = `VRL-9${ryhmaKoodi}${String(i).padStart(4, '0')}`;
    const vhTunnus = `VH${ryhmaKoodi}-${String(i).padStart(3, '0')}-${String(i).padStart(4, '0')}`;
    rivit.push(`${etuliite} Ratsastaja ${i} (${vrlTunnus}) - ${etuliite} Hevonen ${i} ${vhTunnus}`);
  }
  return rivit;
}

async function ilmoitaLuokkaTayteen(kilpailuId, luokkaId, ryhmaKoodi, maara, etuliite) {
  const nimi = muodostaOsallistujat(ryhmaKoodi, maara, etuliite).join('\n');
  // Ilmoittautumislomakkeella on oma "nimi_<luokkaId>"-kenttä per luokka (ks.
  // lib/html.js:n ilmoittautumislomakeHtml ja [id]/ilmoittaudu.js) - kaikki luokat ovat
  // auki samalla kertaa, mutta täällä täytetään yksi luokka kerrallaan täyteen.
  const body = new URLSearchParams({ [`nimi_${luokkaId}`]: nimi });
  // Ilmoittaudu-reitti itse on julkinen (ei admin-suojausta, ks. functions/_middleware.js),
  // mutta onnistunut POST ohjaa (303) takaisin /kilpailut/:id-sivulle, joka VAATII admin-
  // session - fetchin oletus (redirect: 'follow') seuraisi ohjauksen ilman sessioevästettä ja
  // päätyisi kirjautumissivun uudelleenohjaukseen vaikka itse ilmoittautuminen onnistui, joten
  // lähetetään sessioeväste mukana tästäkin (middleware ei sitä vaadi, mutta se ei haittaa
  // julkistakaan reittiä).
  const res = await haeAdmin(`/kilpailut/${kilpailuId}/ilmoittaudu`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) {
    const teksti = await res.text();
    throw new Error(`Ilmoittautuminen luokkaan ${luokkaId} epäonnistui (HTTP ${res.status}): ${teksti}`);
  }
  loki(`Luokka ${luokkaId}: ${maara} osallistujaa ilmoitettu.`);
}

async function laukaiseCron() {
  const res = await fetch(`${CRON_BASE}/aja`, { method: 'POST' });
  if (!res.ok) throw new Error(`Cronin käsikäyttöinen laukaisu epäonnistui (HTTP ${res.status})`);
  const teksti = await res.text();
  loki(`Cron-vastaus: ${teksti.trim()}`);
  return teksti;
}

function poimiTulokset(html) {
  // Arvonnan jälkeen (tila arvottu/tulokset_lahetetty) luokat renderöidään <ol class="tulokset">-listana.
  const luokat = [];
  // Ankkuroitu luokka-rivi-divin alkuun, ettei osu esim. VRL-viestin omaan <strong>-tagiin.
  const luokkaRegex = /<div class="luokka-rivi">\s*<strong>([^<]+)<\/strong>[\s\S]*?<ol class="tulokset">([\s\S]*?)<\/ol>/g;
  let m;
  while ((m = luokkaRegex.exec(html))) {
    const nimet = [...m[2].matchAll(/<li>([^<]*)<\/li>/g)].map((x) => x[1]);
    luokat.push({ luokka: m[1], sijoitukset: nimet });
  }
  return luokat;
}

async function main() {
  loki(`Kilpailukeskus: ${PAGES_BASE}, cron: ${CRON_BASE}`);

  await kirjaudu();
  const kilpailuId = await luoKilpailu();

  let html = await haeKilpailuSivu(kilpailuId);
  let tila = poimiTila(html);
  if (tila !== 'luonnos') throw new Error(`Odotettiin tilaa 'luonnos' luonnin jälkeen, saatiin '${tila}'.`);
  const luokatAlussa = poimiLuokat(html);
  loki(`Luokat luotu: ${luokatAlussa.map((l) => `${l.nimi} (max ${l.max})`).join(', ')}`);
  if (luokatAlussa.length !== 2) throw new Error(`Odotettiin 2 luokkaa, löytyi ${luokatAlussa.length}.`);

  await hyvaksyJaLahetaVrl(kilpailuId);
  await varmistaVrlKisaId(kilpailuId);

  html = await haeKilpailuSivu(kilpailuId);
  const luokkaIdt = poimiLuokkaIdt(html);
  if (luokkaIdt.length !== 2) throw new Error(`Odotettiin 2 luokka-id:tä ilmoittautumista varten, löytyi ${luokkaIdt.length}.`);

  await ilmoitaLuokkaTayteen(kilpailuId, luokkaIdt[0], '91', LUOKAN_MAX, 'A');
  await ilmoitaLuokkaTayteen(kilpailuId, luokkaIdt[1], '92', LUOKAN_MAX, 'B');

  html = await haeKilpailuSivu(kilpailuId);
  tila = poimiTila(html);
  const luokatTaynna = poimiLuokat(html);
  loki(`Täytön jälkeen tila=${tila}, luokat: ${luokatTaynna.map((l) => `${l.nimi}: ${l.maara}/${l.max}`).join(', ')}`);
  if (tila !== 'avoinna') throw new Error(`Odotettiin tilan pysyvän 'avoinna' pelkän täytön jälkeen (arvonta tulee cronista), saatiin '${tila}'.`);
  for (const l of luokatTaynna) {
    if (l.maara !== l.max) throw new Error(`Luokka "${l.nimi}" ei täyttynyt: ${l.maara}/${l.max}.`);
  }

  await laukaiseCron();

  // Cron-käsittely (arvonta + VRL-lähetys) voi kestää hetken (VRL-HTTP-kutsu) - pollataan.
  let lopputila = null;
  for (let i = 1; i <= 6; i++) {
    html = await haeKilpailuSivu(kilpailuId);
    lopputila = poimiTila(html);
    if (lopputila === 'tulokset_lahetetty' || lopputila === 'tulokset_virhe') break;
    loki(`Odotetaan cron-käsittelyn valmistumista (tila=${lopputila}), yritys ${i}/6...`);
    await odota(2000);
  }

  loki(`Lopputila: ${lopputila}`);
  if (lopputila === 'tulokset_virhe') {
    const viesti = poimiVrlViesti(html);
    throw new Error(`Tulosten lähetys epäonnistui: ${viesti || '(ei viestiä)'}`);
  }
  if (lopputila !== 'tulokset_lahetetty') {
    throw new Error(`Odotettiin lopputilaa 'tulokset_lahetetty', saatiin '${lopputila}'.`);
  }

  const tulokset = poimiTulokset(html);
  for (const t of tulokset) {
    if (t.sijoitukset.length !== LUOKAN_MAX) {
      throw new Error(`Luokka "${t.luokka}": arvottuja sijoituksia ${t.sijoitukset.length}, odotettiin ${LUOKAN_MAX}.`);
    }
  }

  console.log('\n=== TESTI OK ===');
  console.log(`Kilpailu id: ${kilpailuId} (${PAGES_BASE}/kilpailut/${kilpailuId})`);
  for (const t of tulokset) {
    console.log(`  ${t.luokka}: ${t.sijoitukset.length} sijoitusta arvottu, 1. ${t.sijoitukset[0]}`);
  }
  console.log('Kaikki luokat täyttyivät, arvottiin ja tulokset lähetettiin VRL:ään onnistuneesti.');
}

main().catch((virhe) => {
  console.error('\n=== TESTI EPÄONNISTUI ===');
  console.error(virhe.message);
  process.exitCode = 1;
});
