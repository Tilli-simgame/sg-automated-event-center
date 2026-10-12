'use strict';

import { onkoVirallinenJaos } from './jaokset.js';

function escHtml(arvo) {
  return String(arvo ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

const TYYLI = `
  :root { color-scheme: light; }
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 1.5rem; margin-bottom: 0.2rem; }
  h1 small { display: block; font-size: 0.9rem; font-weight: normal; color: #666; }
  h2 { font-size: 1.15rem; margin-top: 2rem; }
  nav { margin-bottom: 1.5rem; font-size: 0.9rem; }
  nav a, nav .linkkinappi { margin-right: 1rem; }
  nav form { display: inline; }
  button.linkkinappi { margin-top: 0; padding: 0; border: none; background: none; color: #1a5c2a; text-decoration: underline; font-size: inherit; cursor: pointer; }
  button.linkkinappi:hover { opacity: 0.75; }
  label { display: block; margin-top: 0.9rem; font-weight: 600; font-size: 0.92rem; }
  input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.5rem; margin-top: 0.25rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; }
  textarea { font-family: inherit; min-height: 5rem; }
  button { margin-top: 1.2rem; padding: 0.6rem 1.2rem; font-size: 1rem; border: none; border-radius: 4px; background: #1a5c2a; color: white; cursor: pointer; }
  button.toissijainen { background: #555; }
  button:hover { opacity: 0.92; }
  button:disabled { background: #ccc; color: #888; cursor: not-allowed; }
  button:disabled:hover { opacity: 1; }
  input:disabled, textarea:disabled, select:disabled { background: #f0f0f0; color: #888; cursor: not-allowed; }
  @keyframes pyorimys { to { transform: rotate(360deg); } }
  button.lataa::after {
    content: ''; display: inline-block; width: 0.9em; height: 0.9em; margin-left: 0.5em;
    border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
    vertical-align: -0.15em; animation: pyorimys 0.6s linear infinite;
  }
  .kortti { background: white; border: 1px solid #ddd; border-radius: 6px; padding: 1rem 1.2rem; margin-bottom: 0.9rem; }
  table.kisat { width: 100%; border-collapse: collapse; background: white; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; }
  table.kisat th, table.kisat td { text-align: left; padding: 0.6rem 0.8rem; border-bottom: 1px solid #eee; vertical-align: top; }
  table.kisat th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.02em; color: #666; }
  table.kisat tr:last-child td { border-bottom: none; }
  table.kisat th button.jarjesta { all: unset; cursor: pointer; font: inherit; text-transform: inherit; letter-spacing: inherit; color: inherit; white-space: nowrap; }
  table.kisat th button.jarjesta:hover { color: #1a1a1a; }
  table.kisat th button.jarjesta:focus-visible { outline: 2px solid #4a7bd0; outline-offset: 2px; border-radius: 2px; }
  table.kisat th button.jarjesta::after { content: ' ↕'; opacity: 0.35; }
  table.kisat th[aria-sort="ascending"] button.jarjesta::after { content: ' ▲'; opacity: 1; }
  table.kisat th[aria-sort="descending"] button.jarjesta::after { content: ' ▼'; opacity: 1; }
  table.kisat td a.otsikko { font-weight: 600; text-decoration: none; color: #1a1a1a; }
  table.kisat td a.otsikko:hover { text-decoration: underline; }
  .kortti a.otsikko { font-size: 1.05rem; font-weight: 600; text-decoration: none; color: #1a1a1a; }
  .tila { display: inline-block; font-size: 0.78rem; padding: 0.15rem 0.5rem; border-radius: 3px; font-weight: 600; }
  .tila-luonnos { background: #eee; color: #555; }
  .tila-avoinna { background: #dff3e0; color: #1a5c2a; }
  .tila-avoinna_odottaa { background: #fff2d6; color: #8a6100; }
  .tila-vrl_virhe, .tila-tulokset_virhe { background: #fbe1e1; color: #a02a2a; }
  .tila-arvottu { background: #fff2d6; color: #8a6100; }
  .tila-tulokset_lahetetty { background: #dbe9ff; color: #1a3f8a; }
  .viesti { padding: 0.7rem 1rem; border-radius: 4px; margin-bottom: 1rem; }
  .viesti-onnistui { background: #dff3e0; color: #1a5c2a; }
  .viesti-virhe { background: #fbe1e1; color: #a02a2a; }
  .viesti-esikatselu { background: #eee; color: #555; border: 1px dashed #bbb; }
  .luokka-rivi { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #eee; padding: 0.5rem 0; }
  .pieni { font-size: 0.85rem; color: #666; }
  ol.tulokset, ul.tulokset { padding-left: 1.4rem; }
  fieldset { border: 1px solid #ddd; border-radius: 6px; margin-top: 1rem; padding: 0.8rem 1rem; }
  legend { font-weight: 600; padding: 0 0.4rem; }
`;

// `kirjautunut` ohjaa header-navigaation: hallintasivut (ks. functions/_middleware.js:n
// vaatiiAdminin) renderöityvät ylipäätään vain kun admin-kirjautuminen on jo läpäisty,
// joten niiden kutsut voivat jättää tämän oletusarvoon (true). Julkisilla sivuilla (etusivu,
// kilpailukutsu, ks. functions/[jaos]/...) admin-suojausta ei vaadita, joten sivu voi
// silti tietää onko kävijällä on voimassa oleva sessioeväste (ks. lib/session.js,
// lib/admin_auth.js) - muuten näytetään pelkkä kirjautumislinkki eikä hallintatoimintoja
// turhaan tarjota kävijöille.
function sivu({ otsikko, sisalto, viesti, turnstileSiteKey, kirjautunut = true }) {
  let viestiHtml = '';
  if (viesti) {
    const luokka = viesti.onnistui ? 'viesti-onnistui' : 'viesti-virhe';
    viestiHtml = `<div class="viesti ${luokka}">${escHtml(viesti.teksti)}</div>`;
  }
  // Turnstilen widget-skripti ladataan vain kun sivulla on sen tarvitseva lomake
  // (ks. ilmoittautumislomakeHtml alla) - eli vain kun TURNSTILE_SITE_KEY on asetettu.
  const turnstileScript = turnstileSiteKey
    ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
    : '';
  const navHtml = kirjautunut
    ? `<a href="/">Oak Hill Event Park (OAKH4632)</a>
  <a href="/kilpailut/uusi">+ Uusi kilpailu</a>
  <a href="/kilpailut/kilpailupaikat">Kilpailupaikat</a>
  <a href="/lajit">Omat lajit</a>
  <a href="/rmp">RMP-hevoset</a>
  <form method="post" action="/kirjaudu-ulos"><button type="submit" class="linkkinappi">Kirjaudu ulos</button></form>`
    : '<a href="/kirjaudu">Kirjaudu sisään</a>';
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(otsikko)} — Oak Hill Event Park</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" referrerpolicy="no-referrer">
<style>${TYYLI}</style>
${turnstileScript}
</head>
<body>
<nav>
  ${navHtml}
</nav>
${viestiHtml}
${sisalto}
<script>
  // Yleinen lataustila kaikille lomakkeille (ks. ../lib/html.js:n button.lataa-tyyli) -
  // jokainen lomake on perinteinen POST + koko sivun uudelleenlataus/-ohjaus, joka voi
  // esim. VRL-lähetyksissä kestää muutaman sekunnin, joten käyttäjän täytyy nähdä että
  // klikkaus meni perille eikä nappia kannata klikata uudelleen sen odottaessa.
  document.addEventListener('submit', function (e) {
    var lomake = e.target;
    if (!(lomake instanceof HTMLFormElement)) return;
    lomake.querySelectorAll('button').forEach(function (nappi) {
      if (nappi.disabled) return;
      nappi.disabled = true;
      nappi.classList.add('lataa');
    });
  });
  // Selaimen bfcache voi palauttaa sivun sellaisenaan (esim. "Takaisin"-napilla) vaikka
  // lähetys ei koskaan navigoinut pois - napit pitää siis palauttaa käytettäviksi silloin.
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('button.lataa').forEach(function (nappi) {
      nappi.disabled = false;
      nappi.classList.remove('lataa');
    });
  });
</script>
</body>
</html>`;
}

function vastaus(sivuHtml, status) {
  return new Response(sivuHtml, {
    status: status || 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function uudelleenohjaus(polku) {
  return new Response(null, { status: 303, headers: { Location: polku } });
}

const TILA_NIMET = {
  luonnos: 'Luonnos',
  avoinna: 'Ilmoittautuminen auki',
  avoinna_odottaa: 'Odottaa hyväksyntää',
  vrl_virhe: 'VRL-lähetys epäonnistui',
  arvottu: 'Arvottu',
  tulokset_lahetetty: 'Tulokset lähetetty',
  tulokset_virhe: 'Tulosten lähetys epäonnistui',
};

// Kilpailu siirtyy tilaan 'avoinna' heti kun VRL hyväksyy lähetyksen, mutta VRL-kisa-id
// (tarvitaan tulosten automaattilähetykseen) saadaan vasta erikseen - joko automaattihaulla
// kisakalenterista tai järjestäjän syöttämänä (ks. lib/vrl_kisa_id_haku.js ja
// [id]/aseta-kisa-id.js). Kunnes id löytyy, badge näyttää "Odottaa hyväksyntää" ettei
// järjestäjä luule ilmoittautumisen olevan jo julkisesti auki.
// Villin lajin (ks. lib/jaokset.js:n onkoVirallinenJaos) kilpailulle ei koskaan tule
// vrl_kisa_id:tä, joten sen status asetetaan käsin (kilpailut.villi_tila, ks.
// migrations/0016_villi_tila.sql ja functions/kilpailut/[id]/aseta-villi-tila.js) - se
// ohittaa varsinaisen tilan näytössä heti julkaisusta lähtien. Ennen migraatiota
// julkaistuilla (villi_tila NULL) näytetään varsinainen tila kuten ennenkin.
const VILLI_TILA_NAYTTO = {
  odottaa: 'avoinna_odottaa',
  hyvaksytty: 'avoinna',
  tulokset_lahetetty: 'tulokset_lahetetty',
};

function naytettavaTila(kilpailu) {
  const { tila, vrl_kisa_id: vrlKisaId, villi_tila: villiTila } = kilpailu;
  if (!onkoVirallinenJaos(kilpailu.jaos)) {
    return tila !== 'luonnos' && VILLI_TILA_NAYTTO[villiTila] ? VILLI_TILA_NAYTTO[villiTila] : tila;
  }
  return tila === 'avoinna' && !vrlKisaId ? 'avoinna_odottaa' : tila;
}

function tilaBadge(kilpailu) {
  const naytettava = naytettavaTila(kilpailu);
  return `<span class="tila tila-${escHtml(naytettava)}">${escHtml(TILA_NIMET[naytettava] || naytettava)}</span>`;
}

// Yhteinen ilmoittautumislomake, käytössä sekä kilpailun hallintasivulla
// (functions/kilpailut/[id]/index.js) että julkisella kilpailukutsusivulla
// (functions/[jaos]/[vuosi]/[kuukausi]/[numero].js), jotta molemmat pysyvät
// yhdenmukaisina kun "nimi"-kentän vaatimaa muotoa (ks. [id]/ilmoittaudu.js) muutetaan.
// Kaikki luokat ovat auki samalla kertaa (oma tekstialue "nimi_<luokkaId>" per luokka) sen
// sijaan että luokka valittaisiin pudotusvalikosta ja lähetettäisiin erikseen - näin useaan
// luokkaan ilmoittautuminen (esim. usealla hevosella) onnistuu yhdellä lomakkeen lähetyksellä.
// Tyhjäksi jätetyt luokat ohitetaan palvelimella (ks. [id]/ilmoittaudu.js).
// `disabled: true` näyttää lomakkeen mutta estää lähettämisen - käytetään esikatselussa
// (kilpailu vielä tilassa 'luonnos'). `turnstileSiteKey` lisää Cloudflare Turnstile
// -bottitarkistuksen (ks. lib/turnstile.js ja [id]/ilmoittaudu.js) - annetaan vain kun
// TURNSTILE_SITE_KEY-ympäristömuuttuja on asetettu, eli käytännössä vain tuotannossa.
function ilmoittautumislomakeHtml(
  kilpailuId,
  luokat,
  { disabled = false, palaaPolku = '', turnstileSiteKey = '', osallistumismuoto = '' } = {}
) {
  if (luokat.length === 0) return '';
  const disabledAttr = disabled ? ' disabled' : '';
  // Turnstile aktiivinen vain kun site key on annettu eikä lomake ole muutenkin poissa
  // käytöstä (esikatselu) - submit-nappi pidetään pois päältä kunnes widget kutsuu
  // data-callbackin, jotta ilmoittautuminen ei onnistu ennen bottitarkistuksen läpäisyä.
  const turnstileKaytossa = Boolean(turnstileSiteKey) && !disabled;
  const nappiId = `ilmoittaudu-nappi-${kilpailuId}`;
  const sallivaFunktio = `turnstileSalli_${kilpailuId}`;
  const estavaFunktio = `turnstileEsta_${kilpailuId}`;
  const turnstileHtml = turnstileKaytossa
    ? `
      <div class="cf-turnstile" data-sitekey="${escHtml(turnstileSiteKey)}"
           data-callback="${sallivaFunktio}" data-expired-callback="${estavaFunktio}"
           data-error-callback="${estavaFunktio}"></div>
      <script>
        function ${sallivaFunktio}() { document.getElementById(${JSON.stringify(nappiId)}).disabled = false; }
        function ${estavaFunktio}() { document.getElementById(${JSON.stringify(nappiId)}).disabled = true; }
      </script>`
    : '';
  // Villin lajin (ks. migrations/0013_lajit.sql ja migrations/0014_laji_saannot.sql)
  // järjestäjän kuvaama osallistumismuoto korvaa "muodossa ..." -tekstin sellaisenaan, koska
  // se kertoo nimenomaan missä muodossa tähän kilpailuun ilmoittaudutaan. VRL:n omilla
  // jaoksilla (osallistumismuoto tyhjä) pysyy ennallaan kiinteä VRL-/VH-tunnusmuoto.
  const muotoTeksti = osallistumismuoto || 'Ratsastajan nimi (VRL-tunnus) - Hevosen nimi VH-tunnus';
  // Kiinteä esimerkki placeholderissa sopii vain oletusmuotoon - villin lajin omalla
  // muodolla ei ole tiedossa vastaavaa konkreettista esimerkkiä, joten placeholder jätetään
  // silloin pois ettei se johda hakijaa harhaan.
  const nimiPlaceholder = osallistumismuoto
    ? ''
    : ' placeholder="Matti Meikäläinen (VRL-123456) - Ihka Ihana VH12-345-6789&#10;Matti Meikäläinen (VRL-123456) - Toinen Hevonen VH98-765-4321"';
  const luokkaKenttaHtml = luokat
    .map(
      (l) => `
      <label>${escHtml(l.nimi)}
        <textarea name="nimi_${l.id}" maxlength="1000" rows="2"${nimiPlaceholder}${disabledAttr}></textarea>
      </label>`
    )
    .join('');
  return `
    <form method="post" action="/kilpailut/${kilpailuId}/ilmoittaudu" class="kortti">
      ${palaaPolku ? `<input type="hidden" name="palaa" value="${escHtml(palaaPolku)}">` : ''}
      <p class="pieni">Täytä jokaisen luokan alle sen osallistujat - yksi hevonen/ratsastaja per rivi, muodossa
        "${escHtml(muotoTeksti)}". Voit ilmoittautua useampaan luokkaan samalla kertaa: lomake lähettää kaikki
        täytetyt luokat yhdellä lähetyksellä, tyhjäksi jätetyt luokat ohitetaan.</p>
      ${luokkaKenttaHtml}
      ${turnstileHtml}
      <button type="submit" id="${nappiId}"${disabledAttr}${turnstileKaytossa ? ' disabled' : ''}>Ilmoittaudu</button>
    </form>`;
}

export { escHtml, sivu, vastaus, uudelleenohjaus, tilaBadge, naytettavaTila, TILA_NIMET, ilmoittautumislomakeHtml };
