#!/usr/bin/env node
'use strict';

/**
 * Pieni web-hallintapaneeli VRL:n lomakkeiden automatisoinnin kokeiluun:
 *  - "/"        Ilmoita perinteiset kilpailut (../lib/kilpailu_client.js)
 *  - "/tulokset" Ilmoita tulokset (../lib/tulokset_client.js)
 * Molemmat käyttävät samaa jaettua HTTP-logiikkaa kuin CLI-skriptit
 * (../laheta_kilpailu.js, ../laheta_tulokset.js) - ei toisteta lomakkeiden
 * kenttiä/validointia erikseen. Jaos-valikko on kovakoodattu (../lib/jaokset.js),
 * koska jaokset eivät käytännössä muutu.
 *
 * Vain paikalliseen kehityskäyttöön: paneelissa ei ole omaa kirjautumista/suojausta,
 * ja se sitoutuu oletuksena vain 127.0.0.1:ään juuri tästä syystä. Älä altista tätä
 * julkiseen verkkoon. Ei ulkoisia npm-riippuvuuksia.
 */

const http = require('http');
const { URL, URLSearchParams } = require('url');
const { lahetaKilpailu } = require('../lib/kilpailu_client');
const { lahetaTulokset } = require('../lib/tulokset_client');
const { JAOKSET } = require('../lib/jaokset');

const PORT = parseInt(process.env.PORT, 10) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const KEHON_MAKSIMIKOKO = 256 * 1024; // tulossivulla voi olla useita pitkiä tekstikenttiä

function escHtml(arvo) {
  return String(arvo ?? '').replace(/[&<>"']/g, (merkki) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[merkki]));
}

function luePyynonRunko(req) {
  return new Promise((resolve, reject) => {
    const palat = [];
    let koko = 0;
    req.on('data', (pala) => {
      koko += pala.length;
      if (koko > KEHON_MAKSIMIKOKO) {
        reject(new Error('Lomakedata on liian suuri.'));
        req.destroy();
        return;
      }
      palat.push(pala);
    });
    req.on('end', () => resolve(Buffer.concat(palat).toString('utf8')));
    req.on('error', reject);
  });
}

const YHTEINEN_TYYLI = `
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 1.4rem; }
  nav { margin-bottom: 1rem; font-size: 0.9rem; }
  nav a { margin-right: 1rem; }
  .huomio { background: #fff3cd; border: 1px solid #ffe69c; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-size: 0.9rem; }
  fieldset { border: 1px solid #ddd; border-radius: 8px; margin-bottom: 1rem; }
  legend { padding: 0 0.4rem; font-weight: 600; }
  label { display: block; margin-top: 0.6rem; font-size: 0.9rem; }
  input, select, textarea { width: 100%; box-sizing: border-box; padding: 0.4rem; margin-top: 0.2rem; font-size: 1rem; font-family: inherit; }
  textarea { resize: vertical; }
  .rivi { display: flex; gap: 1rem; }
  .rivi > div { flex: 1; }
  .checkbox-rivi { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.8rem; }
  .checkbox-rivi input { width: auto; }
  .painikkeet { display: flex; gap: 0.6rem; margin-top: 1.2rem; align-items: center; flex-wrap: wrap; }
  button { padding: 0.6rem 1.4rem; font-size: 1rem; cursor: pointer; }
  button.toissijainen { background: #eee; }
  .banneri { padding: 0.8rem 1rem; border-radius: 6px; margin-bottom: 1rem; }
  .banneri.ok { background: #d4edda; border: 1px solid #a3cfae; }
  .banneri.virhe { background: #f8d7da; border: 1px solid #eb99a1; }
  .loki { background: #eee; padding: 0.6rem; border-radius: 6px; font-size: 0.85rem; }
  small { color: #666; }
  .luokka-otsikko { margin: 0; font-size: 1rem; }
`;

function sivupohja({ otsikko, aktiivinen, sisalto }) {
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<title>${escHtml(otsikko)} - hallintapaneeli</title>
<style>${YHTEINEN_TYYLI}</style>
</head>
<body>
<nav>
  <a href="/"${aktiivinen === 'kilpailu' ? ' style="font-weight:600"' : ''}>Ilmoita kilpailu</a>
  <a href="/tulokset"${aktiivinen === 'tulokset' ? ' style="font-weight:600"' : ''}>Ilmoita tulokset</a>
</nav>
<h1>${escHtml(otsikko)}</h1>
<p class="huomio">
  Vain paikalliseen kehityskäyttöön. Salasana lähetetään lomakkeella palvelimelle joka
  kerta uudestaan (ei tallenneta) ja sitä ei näytetä takaisin. Älä altista tätä paneelia
  julkiseen verkkoon.
</p>
${sisalto}
</body>
</html>`;
}

function renderoiBanneri(tulos, lokiRivit) {
  const banneri = tulos
    ? `<div class="banneri ${tulos.onnistui ? 'ok' : 'virhe'}">
        <strong>${tulos.onnistui ? 'Onnistui' : 'Epäonnistui'}${tulos.vaihe ? ` (${escHtml(tulos.vaihe)})` : ''}:</strong>
        ${escHtml(tulos.viesti)}
      </div>`
    : '';
  const loki = lokiRivit && lokiRivit.length ? `<pre class="loki">${lokiRivit.map(escHtml).join('\n')}</pre>` : '';
  return banneri + loki;
}

// ---------------------------------------------------------------------------
// "/" - Ilmoita perinteiset kilpailut
// ---------------------------------------------------------------------------

const ARVONTATAVAT = [
  ['1', 'Lyhyt/pitkä arvonta'],
  ['2', 'Suhteutettu arvonta'],
  ['4', 'Tuotos/kysymys'],
];

function renderoiKilpailuSivu({ arvot, tulos, lokiRivit }) {
  const arvontatapaOptiot = ARVONTATAVAT.map(
    ([arvo, teksti]) =>
      `<option value="${arvo}" ${arvot.arvontatapa === arvo ? 'selected' : ''}>${teksti}</option>`
  ).join('');

  const jaosOptiot = JAOKSET.map(
    (jaos) =>
      `<option value="${jaos.id}" ${jaos.id === arvot.jaos ? 'selected' : ''}>${escHtml(jaos.nimi)} (${escHtml(jaos.lyhenne)})</option>`
  ).join('');

  const sisalto = `
${renderoiBanneri(tulos, lokiRivit)}

<form method="post" action="/submit">
  <fieldset>
    <legend>Kohde ja tunnukset</legend>
    <label>Sivuston osoite (base-url)
      <input type="text" name="base_url" value="${escHtml(arvot.base_url)}" placeholder="http://localhost" required>
    </label>
    <div class="rivi">
      <div>
        <label>Tunnus (identity)
          <input type="text" name="identity" value="${escHtml(arvot.identity)}" placeholder="VRL-00000" required>
        </label>
      </div>
      <div>
        <label>Salasana
          <input type="password" name="password" value="" required>
        </label>
      </div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Kilpailun tiedot</legend>
    <div class="rivi">
      <div>
        <label>Jaos
          <select name="jaos" required>
            <option value="">-- valitse jaos --</option>
            ${jaosOptiot}
          </select>
        </label>
      </div>
      <div>
        <label>Arvontatapa
          <select name="arvontatapa">${arvontatapaOptiot}</select>
        </label>
      </div>
    </div>
    <div class="rivi">
      <div>
        <label>Kilpailupäivä (kp)
          <input type="text" name="kp" value="${escHtml(arvot.kp)}" placeholder="PP.KK.VVVV" required>
        </label>
      </div>
      <div>
        <label>Viimeinen ilmoittautumispäivä (vip)
          <input type="text" name="vip" value="${escHtml(arvot.vip)}" placeholder="PP.KK.VVVV" required>
        </label>
      </div>
    </div>
    <label>Kilpailukutsun osoite (kutsu)
      <input type="text" name="kutsu" value="${escHtml(arvot.kutsu)}" placeholder="https://..." required>
    </label>
    <label>Kilpailupaikka (jarj-talli)
      <input type="text" name="jarj_talli" value="${escHtml(arvot.jarj_talli)}" placeholder="XXXX0000" required>
    </label>
    <label>Lisätiedot (info, valinnainen)
      <input type="text" name="info" value="${escHtml(arvot.info)}">
    </label>
    <label>Takaaja (valinnainen, tarvitaan vain jos etuuspisteet nollattu)
      <input type="text" name="takaaja" value="${escHtml(arvot.takaaja)}" placeholder="VRL-00000">
    </label>
  </fieldset>

  <fieldset>
    <legend>Yhteysasetukset</legend>
    <label>Aikakatkaisu (sekuntia)
      <input type="text" name="timeout" value="${escHtml(arvot.timeout || '30')}">
    </label>
    <div class="checkbox-rivi">
      <input type="checkbox" name="insecure" id="insecure" ${arvot.insecure ? 'checked' : ''}>
      <label for="insecure" style="margin:0;">Älä varmista SSL-varmennetta (itse allekirjoitetut varmenteet)</label>
    </div>
  </fieldset>

  <div class="painikkeet"><button type="submit">Lähetä kilpailu</button></div>
  <p><small>Vastaa komentoa: node laheta_kilpailu.js --base-url=... --identity=... ...</small></p>
</form>`;

  return sivupohja({ otsikko: 'Ilmoita perinteiset kilpailut', aktiivinen: 'kilpailu', sisalto });
}

function tyhjatKilpailuArvot() {
  return {
    base_url: 'http://localhost',
    identity: '',
    jaos: '',
    kp: '',
    vip: '',
    kutsu: '',
    arvontatapa: '1',
    jarj_talli: '',
    info: '',
    takaaja: '',
    timeout: '30',
    insecure: false,
  };
}

function lueKilpailuArvot(lomake) {
  return {
    base_url: lomake.get('base_url') || '',
    identity: lomake.get('identity') || '',
    jaos: lomake.get('jaos') || '',
    kp: lomake.get('kp') || '',
    vip: lomake.get('vip') || '',
    kutsu: lomake.get('kutsu') || '',
    arvontatapa: lomake.get('arvontatapa') || '1',
    jarj_talli: lomake.get('jarj_talli') || '',
    info: lomake.get('info') || '',
    takaaja: lomake.get('takaaja') || '',
    timeout: lomake.get('timeout') || '30',
    insecure: lomake.get('insecure') === 'on',
  };
}

// ---------------------------------------------------------------------------
// "/tulokset" - Ilmoita tulokset
// ---------------------------------------------------------------------------

function jasennaLuokkaNimet(teksti) {
  return (teksti || '')
    .split(/\r?\n/)
    .map((rivi) => rivi.trim())
    .filter((rivi) => rivi !== '');
}

function renderoiTuloksetSivu({ arvot, tulos, lokiRivit }) {
  const luokkaLohkot = arvot.luokkaLohkot
    .map(
      (lohko, i) => `
    <fieldset>
      <legend>Luokka ${i + 1}: ${escHtml(lohko.luokka)}</legend>
      <input type="hidden" name="luokka_${i + 1}" value="${escHtml(lohko.luokka)}">
      <label>Osallistujat
        <textarea name="os_${i + 1}" rows="5" placeholder="Vapaamuotoinen teksti jaoksen sääntöjen mukaan">${escHtml(lohko.osallistujat)}</textarea>
      </label>
      <label>Hylätyt (valinnainen)
        <textarea name="hyl_${i + 1}" rows="2">${escHtml(lohko.hylatyt)}</textarea>
      </label>
    </fieldset>`
    )
    .join('');

  const sisalto = `
${renderoiBanneri(tulos, lokiRivit)}

<form method="post">
  <fieldset>
    <legend>Kohde ja tunnukset</legend>
    <label>Sivuston osoite (base-url)
      <input type="text" name="base_url" value="${escHtml(arvot.base_url)}" placeholder="http://localhost" required>
    </label>
    <div class="rivi">
      <div>
        <label>Tunnus (identity)
          <input type="text" name="identity" value="${escHtml(arvot.identity)}" placeholder="VRL-00000" required>
        </label>
      </div>
      <div>
        <label>Salasana
          <input type="password" name="password" value="" required>
        </label>
      </div>
    </div>
    <label>Kilpailun id (kisa-id, URL-polusta esim. .../ilmoita_tulokset/900009)
      <input type="text" name="kisa_id" value="${escHtml(arvot.kisa_id)}" placeholder="900009" required>
    </label>
  </fieldset>

  <fieldset>
    <legend>Luokat</legend>
    <label>Luokkien nimet, yksi per rivi (esim. "1. Helppo A")
      <textarea name="luokat_teksti" rows="4">${escHtml(arvot.luokat_teksti)}</textarea>
    </label>
    <div class="painikkeet">
      <button type="submit" formaction="/tulokset/luokat" formnovalidate class="toissijainen">Näytä luokkakentät</button>
      <small>Luo alle jokaiselle riville omat Osallistujat-/Hylätyt-kentät.</small>
    </div>
  </fieldset>

  ${luokkaLohkot}

  <div class="painikkeet">
    <button type="submit" formaction="/tulokset/submit">Lähetä tulokset</button>
  </div>
  <p><small>Vastaa komentoa: node laheta_tulokset.js --base-url=... --identity=... --kisa-id=... --tiedosto=...
  Testidataa löytyy tiedostosta tulokset-testi.txt (kopioi kunkin luokan sisältö oikeaan kenttään).</small></p>
</form>`;

  return sivupohja({ otsikko: 'Ilmoita tulokset', aktiivinen: 'tulokset', sisalto });
}

function tyhjatTuloksetArvot() {
  return {
    base_url: 'http://localhost',
    identity: '',
    kisa_id: '',
    luokat_teksti: '',
    luokkaLohkot: [],
  };
}

function lueTuloksetPerusArvot(lomake) {
  return {
    base_url: lomake.get('base_url') || '',
    identity: lomake.get('identity') || '',
    kisa_id: lomake.get('kisa_id') || '',
    luokat_teksti: lomake.get('luokat_teksti') || '',
  };
}

// Poimii lomakkeelta luokka_N/os_N/hyl_N-kentät järjestyksessä N=1,2,3...
function lueLuokkaLohkot(lomake) {
  const lohkot = [];
  let n = 1;
  while (lomake.has(`luokka_${n}`)) {
    lohkot.push({
      luokka: lomake.get(`luokka_${n}`) || '',
      osallistujat: lomake.get(`os_${n}`) || '',
      hylatyt: lomake.get(`hyl_${n}`) || '',
    });
    n += 1;
  }
  return lohkot;
}

// ---------------------------------------------------------------------------
// Reititys
// ---------------------------------------------------------------------------

const palvelin = http.createServer(async (req, res) => {
  const kohde = new URL(req.url, `http://${req.headers.host}`);

  if (kohde.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderoiKilpailuSivu({ arvot: tyhjatKilpailuArvot(), tulos: null, lokiRivit: [] }));
    return;
  }

  if (kohde.pathname === '/submit' && req.method === 'POST') {
    let runko;
    try {
      runko = await luePyynonRunko(req);
    } catch (virhe) {
      res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(virhe.message);
      return;
    }

    const lomake = new URLSearchParams(runko);
    const arvot = lueKilpailuArvot(lomake);

    const lokiRivit = [];
    const tulos = await lahetaKilpailu(
      {
        baseUrl: arvot.base_url,
        identity: arvot.identity,
        password: lomake.get('password') || '',
        jaos: arvot.jaos,
        kp: arvot.kp,
        vip: arvot.vip,
        kutsu: arvot.kutsu,
        arvontatapa: arvot.arvontatapa,
        jarjTalli: arvot.jarj_talli,
        info: arvot.info,
        takaaja: arvot.takaaja,
        varmistaSsl: !arvot.insecure,
        timeoutMs: (parseInt(arvot.timeout, 10) || 30) * 1000,
      },
      { loki: (viesti) => lokiRivit.push(viesti) }
    );

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderoiKilpailuSivu({ arvot, tulos, lokiRivit }));
    return;
  }

  if (kohde.pathname === '/tulokset' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderoiTuloksetSivu({ arvot: tyhjatTuloksetArvot(), tulos: null, lokiRivit: [] }));
    return;
  }

  if (kohde.pathname === '/tulokset/luokat' && req.method === 'POST') {
    let runko;
    try {
      runko = await luePyynonRunko(req);
    } catch (virhe) {
      res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(virhe.message);
      return;
    }

    const lomake = new URLSearchParams(runko);
    const perusArvot = lueTuloksetPerusArvot(lomake);
    const luokkaLohkot = jasennaLuokkaNimet(perusArvot.luokat_teksti).map((luokka) => ({
      luokka,
      osallistujat: '',
      hylatyt: '',
    }));

    const tulos =
      luokkaLohkot.length === 0
        ? { onnistui: false, vaihe: 'luokat', viesti: 'Kirjoita vähintään yksi luokan nimi, yksi per rivi.' }
        : { onnistui: true, vaihe: 'luokat', viesti: `Luotiin ${luokkaLohkot.length} luokan kentät alle. Täytä ne ja paina "Lähetä tulokset".` };

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderoiTuloksetSivu({ arvot: { ...perusArvot, luokkaLohkot }, tulos, lokiRivit: [] }));
    return;
  }

  if (kohde.pathname === '/tulokset/submit' && req.method === 'POST') {
    let runko;
    try {
      runko = await luePyynonRunko(req);
    } catch (virhe) {
      res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(virhe.message);
      return;
    }

    const lomake = new URLSearchParams(runko);
    const perusArvot = lueTuloksetPerusArvot(lomake);
    const luokkaLohkot = lueLuokkaLohkot(lomake);

    const lokiRivit = [];
    const tulos = await lahetaTulokset(
      {
        baseUrl: perusArvot.base_url,
        identity: perusArvot.identity,
        password: lomake.get('password') || '',
        kisaId: perusArvot.kisa_id,
        luokat: luokkaLohkot,
      },
      { loki: (viesti) => lokiRivit.push(viesti) }
    );

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderoiTuloksetSivu({ arvot: { ...perusArvot, luokkaLohkot }, tulos, lokiRivit }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

palvelin.listen(PORT, HOST, () => {
  console.log(`Hallintapaneeli käynnissä: http://${HOST}:${PORT}`);
});
