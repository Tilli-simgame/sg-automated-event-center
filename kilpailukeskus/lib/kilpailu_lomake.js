'use strict';

/**
 * Kilpailun luonti- ja muokkauslomakkeen jaettu HTML/validointilogiikka - käytössä sekä
 * uuden kilpailun luonnissa (functions/kilpailut/uusi.js) että olemassa olevan kilpailun
 * muokkauksessa (functions/kilpailut/[id]/muokkaa.js), jotta kenttiä/validointia ei
 * tarvitse pitää synkassa kahdessa paikassa.
 */

import { JAOKSET } from './jaokset.js';
import { JAOS_LUOKAT } from './luokkavaihtoehdot.js';
import { JAOS_RAJOITUKSET } from './jaosrajoitukset.js';
import { escHtml } from './html.js';
import { SAHKOPOSTI_REGEX, onkoKelvollinenUrl } from './validointi.js';

const PAIVAMAARA_REGEX = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

// VRL:n kisajärjestelmä sallii enintään 100 osallistujaa per luokka - sama luku on siis
// oletusarvo kun maksimia ei anneta erikseen (ks. lomakkeen "Luokat"-kentän ohjeteksti).
const LUOKAN_OLETUSMAKSIMI = 100;

// Järjestäjän itse luomat "villit" lajit (ks. migrations/0013_lajit.sql) eivät ole VRL:n
// jaoksia eikä niiden kilpailuja koskaan lähetetä VRL:ään (ks.
// functions/kilpailut/[id]/laheta-vrl.js) - VRL:n jaoskohtaiset rajoitukset
// (jaosrajoitukset.js) eivät siis koske niitä. Luokkamäärää ei rajoiteta erikseen per laji
// (väljä yhteinen yläraja riittää), mutta osallistuja- ja lähtörajat järjestäjä asettaa itse
// per laji (ks. migrations/0014_laji_saannot.sql ja functions/lajit/[id]/muokkaa-saannot.js).
const VILLI_MAX_LUOKKIA = 100;

// Kokoaa VRL:n kiinteät jaokset ja järjestäjän omat lajit (`lajit`, ks. lib/db.js:n listLajit)
// yhdeksi listaksi/kartoiksi - käytössä sekä lomakkeen jaos-valikossa että
// validoinnissa/luokkavalitsimessa alla, jotta villit lajit näkyvät ja toimivat
// samalla tavalla kuin VRL:n omat jaokset tällä lomakkeella.
function kokoaJaokset(lajit) {
  return [...JAOKSET, ...lajit.map((l) => ({ id: l.id, lyhenne: l.lyhenne, nimi: l.nimi, villi: true }))];
}

function kokoaJaosRajoitukset(lajit) {
  const rajoitukset = { ...JAOS_RAJOITUKSET };
  lajit.forEach((l) => {
    rajoitukset[l.id] = {
      maxLuokkia: VILLI_MAX_LUOKKIA,
      maxOsallistujiaPerLuokka: l.max_osallistujia_per_luokka,
      maxLahtojaPerHevonen: l.max_lahtoja_per_hevonen,
    };
  });
  return rajoitukset;
}

function kokoaJaosLuokat(lajit, lajiLuokkavaihtoehdot) {
  const luokat = { ...JAOS_LUOKAT };
  lajit.forEach((l) => {
    luokat[l.id] = lajiLuokkavaihtoehdot[l.id] || [];
  });
  return luokat;
}

// Näytetään kilpailun muokkauslomakkeella (sekä [id]/muokkaa.js:n omalla sivulla että
// [id]/index.js:n upotetussa versiossa) kun kilpailu on jo 'avoinna' - selittää miksi jaos,
// kilpailupäivän kuukausi ja luokat eivät ole enää muokattavissa tästä lomakkeesta.
const AVOINNA_HUOMIO =
  'Kilpailu on jo lähetetty VRL:n kisakalenteriin - jaosta tai kilpailupäivän kuukautta ei voi enää ' +
  'muuttaa (osoite on jo julkaistu), ja luokkia hallitaan kilpailun sivun Luokat-osiosta.';

// Lomakkeen kp/vip-kentät ovat <input type="date"> (natiivi kalenterivalitsin), joka
// vaatii arvon ISO-muodossa (VVVV-KK-PP) - VRL:n lomake ja loppu validointilogiikka
// käyttävät kuitenkin suomalaista PP.KK.VVVV-muotoa, joten muunnetaan molempiin suuntiin.
function isoPvmSuomeksi(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function suomiPvmIso(suomi) {
  const m = PAIVAMAARA_REGEX.exec(suomi || '');
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

function isoPaivienPaasta(paivia) {
  const d = new Date();
  d.setDate(d.getDate() + paivia);
  return d.toISOString().slice(0, 10);
}

// Osallistujamäärän yläraja ei voi vaihdella luokittain saman kilpailun sisällä (ks.
// arvot.max_osallistujia_per_luokka / validoiLomake) - luokkarivi kantaa siis enää pelkän
// nimen, mahdollinen vanha "Nimi | max" -syntaksi jätetään huomiotta yhteensopivuuden vuoksi.
function jasennaLuokkarivit(teksti) {
  return teksti
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .map((rivi) => ({ nimi: rivi.split('|')[0].trim() }));
}

// Käänteinen jasennaLuokkarivit: luokkarivit (kannasta luetut {nimi}) takaisin tekstikentän
// riveiksi - käytössä muokkauslomakkeen esitäytössä (ks. [id]/muokkaa.js ja [id]/index.js).
function luokatArvoksi(luokat) {
  return luokat.map((l) => l.nimi).join('\n');
}

// Kokoaa kilpailu-riviltä (+ tarvittaessa sen luokilta) lomakkeen arvot ja kertoo saako
// luokkia näyttää/muokata tällä lomakkeella - käytössä sekä [id]/muokkaa.js:n omalla
// sivulla että [id]/index.js:n upotetussa muokkauslomakkeessa, jottei logiikka eriydy
// kahteen paikkaan.
function kilpailunLomakeArvot(kilpailu, luokat) {
  const naytaLuokat = kilpailu.tila !== 'avoinna';
  return {
    naytaLuokat,
    arvot: {
      nimi: kilpailu.nimi,
      jaos: kilpailu.jaos,
      kp: kilpailu.kp,
      vip: kilpailu.vip,
      arvontatapa: kilpailu.arvontatapa,
      jarj_talli: kilpailu.jarj_talli,
      jarj_talli_nimi: kilpailu.jarj_talli_nimi,
      jarj_talli_url: kilpailu.jarj_talli_url,
      info: kilpailu.info,
      lisatietoja: kilpailu.lisatietoja,
      takaaja: kilpailu.takaaja,
      vastuuhenkilo_nimi: kilpailu.vastuuhenkilo_nimi,
      vastuuhenkilo_email: kilpailu.vastuuhenkilo_email,
      max_lahtoja_per_hevonen: kilpailu.max_lahtoja_per_hevonen,
      max_osallistujia_per_luokka: kilpailu.max_osallistujia_per_luokka,
      luokat: naytaLuokat ? luokatArvoksi(luokat) : '',
    },
  };
}

// Validoi lomakkeelta luetut arvot (ks. kutsupaikat: onRequestPost:t) - palauttaa
// virhelistan (tyhjä = kelvollinen), jäsennetyt luokat ja lasketut apuarvot.
// `ohitaLuokat: true` jättää luokat kokonaan validoimatta/jäsentämättä (luokat: null) -
// käytössä kun kilpailu on jo 'avoinna' eikä luokkia enää muokata tällä lomakkeella
// (ks. [id]/muokkaa.js), koska luokkien korvaaminen kokonaan poistaisi jo tehdyt
// ilmoittautumiset (ks. lib/db.js:n osallistujat-taulun ON DELETE CASCADE).
function validoiLomake(arvot, { ohitaLuokat = false, lajit = [] } = {}) {
  const jaosOletukset = kokoaJaosRajoitukset(lajit)[arvot.jaos];
  const virheet = [];

  if (!arvot.nimi) virheet.push('Kilpailun nimi puuttuu.');
  if (!jaosOletukset) virheet.push('Tuntematon jaos.');
  if (!PAIVAMAARA_REGEX.test(arvot.kp)) virheet.push('Kilpailupäivä on väärässä muodossa.');
  if (!PAIVAMAARA_REGEX.test(arvot.vip)) virheet.push('Viimeinen ilmoittautumispäivä on väärässä muodossa.');
  if (arvot.jarj_talli.length < 6 || arvot.jarj_talli.length > 10) {
    virheet.push('Kilpailupaikka tunnuksen on oltava 6-10 merkkiä.');
  }
  if (!arvot.jarj_talli_nimi) virheet.push('Kilpailupaikan tai tallin nimi puuttuu.');
  if (!onkoKelvollinenUrl(arvot.jarj_talli_url)) virheet.push('Kilpailupaikan tai tallin URL on väärässä muodossa.');
  if (!arvot.vastuuhenkilo_nimi) virheet.push('Vastuuhenkilön nimi puuttuu.');
  if (!SAHKOPOSTI_REGEX.test(arvot.vastuuhenkilo_email)) virheet.push('Vastuuhenkilön sähköpostiosoite on väärässä muodossa.');

  let luokat = null;
  if (!ohitaLuokat) {
    luokat = jasennaLuokkarivit(arvot.luokat);
    if (luokat.length === 0) virheet.push('Vähintään yksi luokka tarvitaan.');
    if (jaosOletukset && luokat.length > jaosOletukset.maxLuokkia) {
      virheet.push(`Luokkia on ${luokat.length}, mutta tälle jaokselle sallitaan enintään ${jaosOletukset.maxLuokkia} luokkaa/kilpailu.`);
    }
    luokat.forEach((l, i) => {
      if (l.nimi.length <= 5) virheet.push(`Luokka ${i + 1}: nimen on oltava yli 5 merkkiä pitkä.`);
    });
  }

  const maxLahtoja = parseInt(arvot.max_lahtoja_per_hevonen, 10);
  if (!Number.isFinite(maxLahtoja) || maxLahtoja < 1 || (jaosOletukset && maxLahtoja > jaosOletukset.maxLahtojaPerHevonen)) {
    virheet.push(
      `Enimmäislähtöjä per hevonen on oltava 1-${jaosOletukset ? jaosOletukset.maxLahtojaPerHevonen : '?'} (VRL:n salliva maksimi tälle jaokselle).`
    );
  }

  // Osallistujamäärän yläraja koskee kilpailun kaikkia luokkia yhtä lailla (ei voi
  // vaihdella luokittain), joten se on yksi kilpailukohtainen kenttä samaan tapaan kuin
  // maxLahtoja yllä - eikä enää luokkakohtainen (ks. jasennaLuokkarivit).
  const maxOsallistujia = parseInt(arvot.max_osallistujia_per_luokka, 10);
  const osallistujaYlaraja = jaosOletukset ? jaosOletukset.maxOsallistujiaPerLuokka : LUOKAN_OLETUSMAKSIMI;
  if (!Number.isFinite(maxOsallistujia) || maxOsallistujia < 1 || maxOsallistujia > osallistujaYlaraja) {
    virheet.push(`Enimmäisosallistujia per luokka on oltava 1-${osallistujaYlaraja} (VRL:n salliva maksimi tälle jaokselle).`);
  }

  let vipIso = null;
  if (PAIVAMAARA_REGEX.test(arvot.vip)) {
    const [p, k, v] = arvot.vip.split('.');
    vipIso = `${v}-${k.padStart(2, '0')}-${p.padStart(2, '0')}`;
  }

  return { virheet, luokat, maxLahtoja, maxOsallistujia, vipIso, jaosOletukset };
}

function lomakeHtml(
  arvot = {},
  virheet = [],
  {
    otsikko = 'Uusi kilpailu',
    naytaOtsikko = true,
    submitTeksti = 'Tallenna esikatseluna',
    action = '',
    naytaLuokat = true,
    luokatPiilotettuViesti = 'Luokkia ei voi enää muokata täältä, koska kilpailu on jo avoinna ilmoittautumiselle - ' +
      'luokkien lisäys/muokkaus/poisto tehdään kilpailun sivulta.',
    huomio = '',
    // Profiiliin tallennetut kilpailupaikat (ks. lib/db.js:n listKilpailupaikat ja
    // functions/kilpailut/kilpailupaikat/) - annetaan vain uuden kilpailun lomakkeella
    // (ks. functions/kilpailut/uusi.js), ei muokkauslomakkeella, koska olemassa olevan
    // kilpailun kilpailupaikkatiedot on jo tallennettu kilpailulle eikä niitä ole tarkoitus
    // vaihtaa jälkikäteen tämän pudotusvalikon kautta.
    kilpailupaikat = [],
    // Järjestäjän omat lajit (ks. lib/db.js:n listLajit) ja niiden luokkavaihtoehdot
    // (listLajiLuokkavaihtoehdotKartta) - annetaan aina kun lomake koskee kilpailun
    // luontia/muokkausta, jotta villit lajit näkyvät VRL:n jaoksien rinnalla jaos-valikossa
    // (ks. kokoaJaokset yllä).
    lajit = [],
    lajiLuokkavaihtoehdot = {},
  } = {}
) {
  const kaikkiJaokset = kokoaJaokset(lajit);
  const jaosRajoitukset = kokoaJaosRajoitukset(lajit);
  const jaosLuokat = kokoaJaosLuokat(lajit, lajiLuokkavaihtoehdot);

  const jaosOptioHtml = (j) =>
    `<option value="${j.id}" ${arvot.jaos === j.id ? 'selected' : ''}>${escHtml(j.nimi)} (${j.lyhenne})</option>`;
  const jaosValinnat =
    `<optgroup label="VRL:n jaokset">${JAOKSET.map(jaosOptioHtml).join('')}</optgroup>` +
    (lajit.length ? `<optgroup label="Omat lajit (ei lähetetä VRL:ään)">${lajit.map(jaosOptioHtml).join('')}</optgroup>` : '');

  const jaosOletukset = jaosRajoitukset[arvot.jaos] || jaosRajoitukset['1'];
  const lahtojaArvo = arvot.max_lahtoja_per_hevonen || jaosOletukset.maxLahtojaPerHevonen;
  const osallistujiaArvo = arvot.max_osallistujia_per_luokka || jaosOletukset.maxOsallistujiaPerLuokka;
  const kpIsoArvo = suomiPvmIso(arvot.kp) || isoPaivienPaasta(15);
  const vipIsoArvo = suomiPvmIso(arvot.vip) || isoPaivienPaasta(14);

  const virheHtml = virheet.length
    ? `<div class="viesti viesti-virhe">${virheet.map(escHtml).join('<br>')}</div>`
    : '';
  const huomioHtml = huomio ? `<p class="pieni">${escHtml(huomio)}</p>` : '';

  const luokatHtml = naytaLuokat
    ? `
      <fieldset>
        <legend>Luokat (<span id="luokka-laskuri">0</span>/<span id="max-luokkia-teksti">${jaosOletukset.maxLuokkia}</span> valittu)</legend>
        <p class="pieni">Valmiista luokista on oletuksena valittu jaoksen sallima enimmäismäärä
        (jos luokkia on enemmän kuin sallittu maksimi, valinta arvotaan) - muokkaa rasteja vapaasti.
        Osallistujamäärän yläraja koskee kaikkia luokkia yhtä lailla ja asetetaan yllä olevalla
        "Enimmäisosallistujia per luokka" -kentällä.</p>
        <p class="pieni">
          <button type="button" id="valitse-kaikki-btn" class="linkkinappi">Valitse kaikki</button>
          ·
          <button type="button" id="tyhjenna-valinnat-btn" class="linkkinappi">Tyhjennä valinnat</button>
        </p>
        <div id="luokka-checkboxit"></div>
        <p class="pieni">Muita/omia luokkia voi lisätä tai muokata myös suoraan alla olevaan kenttään,
        yksi luokan nimi per rivi. Luokan nimen on oltava yli 5 merkkiä.</p>
        <textarea name="luokat" id="luokat-textarea" required placeholder="1. Helppo A&#10;2. Vaativa A">${escHtml(arvot.luokat)}</textarea>
      </fieldset>`
    : luokatPiilotettuViesti
      ? `<p class="pieni">${escHtml(luokatPiilotettuViesti)}</p>`
      : '';

  // Pudotusvalikko esitäyttää alla olevat kilpailupaikka/vastuuhenkilö-kentät valitun
  // profiiliin tallennetun kilpailupaikan tiedoilla (ks. kilpailupaikkaValitsinScript alla) -
  // kentät pysyvät silti tavallisina, muokattavina input-kenttinä, joten esitäyttöä voi
  // vielä säätää lomakkeella ennen tallennusta.
  const kilpailupaikkaValitsinHtml = kilpailupaikat.length
    ? `
      <label>Kilpailupaikka
        <select id="kilpailupaikka-select">
          <option value="">— valitse tallennetuista kilpailupaikoista —</option>
          ${kilpailupaikat
            .map(
              (p) =>
                `<option value="${p.id}" data-tunnus="${escHtml(p.tunnus)}" data-nimi="${escHtml(p.talli_nimi)}" ` +
                `data-url="${escHtml(p.talli_url)}" data-vh-nimi="${escHtml(p.vastuuhenkilo_nimi)}" ` +
                `data-vh-email="${escHtml(p.vastuuhenkilo_email)}" ${p.oletus ? 'selected' : ''}>` +
                `${escHtml(p.talli_nimi)} (${escHtml(p.tunnus)})</option>`
            )
            .join('')}
        </select>
      </label>
      <p class="pieni">Tiedot täytetään alle valitusta kilpailupaikasta - voit vielä muokata niitä tässä
      lomakkeessa. Hallinnoi tallennettuja kilpailupaikkoja <a href="/kilpailut/kilpailupaikat">asetuksista</a>.</p>`
    : `<p class="pieni">Ei vielä tallennettuja kilpailupaikkoja -
      <a href="/kilpailut/kilpailupaikat/uusi">lisää ensimmäinen profiiliin</a>, niin sen tiedot
      esitäytetään tästä lomakkeesta eteenpäin automaattisesti.</p>`;

  return `
    ${naytaOtsikko ? `<h1>${escHtml(otsikko)}</h1>` : ''}
    ${virheHtml}
    ${huomioHtml}
    <form method="post"${action ? ` action="${escHtml(action)}"` : ''}>
      <label>Kilpailun nimi
        <input name="nimi" id="nimi-input" required value="${escHtml(arvot.nimi)}" placeholder="esim. ERJ - 15.10.2026">
      </label>
      <p class="pieni">Oletusnimi (jaoksen lyhenne - kilpailupäivä) täytetään automaattisesti kun jaos ja
      kilpailupäivä on valittu - muokkaa vapaasti jos haluat oman nimen.</p>
      <label>Jaos
        <select name="jaos" id="jaos-select" required>${jaosValinnat}</select>
      </label>
      <div style="display:flex;gap:1rem;flex-wrap:wrap">
        <label style="flex:1;min-width:180px">Kilpailupäivä
          <input type="date" name="kp" id="kp-input" required value="${escHtml(kpIsoArvo)}">
        </label>
        <label style="flex:1;min-width:180px">Viimeinen ilmoittautumispäivä
          <input type="date" name="vip" required value="${escHtml(vipIsoArvo)}">
        </label>
      </div>
      <p class="pieni">VIP:n (viimeinen ilmoittautumispäivä) on oltava vähintään 14 vrk tästä päivästä,
      ja kilpailupäivän vähintään 1 vrk VIP:n jälkeen (oletusarvot: VIP +14 vrk, kilpailupäivä +15 vrk).
      Kilpailukutsu (osoite VRL:n kisakalenteriin) generoidaan ja julkaistaan automaattisesti
      tallennuksen yhteydessä - ei siis erillistä kutsu-URL-kenttää.</p>
      <label>Arvontatapa
        <select name="arvontatapa" required>
          <option value="1" ${arvot.arvontatapa === '1' ? 'selected' : ''}>Lyhyt/pitkä arvonta</option>
          <option value="2" ${arvot.arvontatapa === '2' ? 'selected' : ''}>Suhteutettu arvonta</option>
          <option value="4" ${arvot.arvontatapa === '4' ? 'selected' : ''}>Tuotos/kysymys</option>
        </select>
      </label>
      ${kilpailupaikkaValitsinHtml}
      <label>Kilpailupaikan tai tallin tunnus (esim. XXXX0000, oltava oma talli)
        <input name="jarj_talli" id="jarj-talli-input" required minlength="6" maxlength="10" value="${escHtml(arvot.jarj_talli)}">
      </label>
      <div style="display:flex;gap:1rem;flex-wrap:wrap">
        <label style="flex:1;min-width:180px">Kilpailupaikan tai tallin nimi
          <input name="jarj_talli_nimi" id="jarj-talli-nimi-input" required value="${escHtml(arvot.jarj_talli_nimi)}" placeholder="Oak Hill Event Park">
        </label>
        <label style="flex:1;min-width:180px">Kilpailupaikan tai tallin URL
          <input type="url" name="jarj_talli_url" id="jarj-talli-url-input" required value="${escHtml(arvot.jarj_talli_url)}" placeholder="https://esimerkki.fi">
        </label>
      </div>
      <p class="pieni">Nimi ja URL näytetään kilpailun kutsulla tunnuksen lisäksi.</p>
      <div style="display:flex;gap:1rem;flex-wrap:wrap">
        <label style="flex:1;min-width:180px">Vastuuhenkilön nimi
          <input name="vastuuhenkilo_nimi" id="vastuuhenkilo-nimi-input" required value="${escHtml(arvot.vastuuhenkilo_nimi)}" placeholder="Matti Meikäläinen">
        </label>
        <label style="flex:1;min-width:180px">Vastuuhenkilön sähköposti
          <input type="email" name="vastuuhenkilo_email" id="vastuuhenkilo-email-input" required value="${escHtml(arvot.vastuuhenkilo_email)}" placeholder="matti@esimerkki.fi">
        </label>
      </div>
      <p class="pieni">Nimi ja sähköposti näytetään julkisella kilpailukutsusivulla.</p>
      <label>Kuvaus (valinnainen, max 300 merkkiä)
        <textarea name="info" maxlength="300">${escHtml(arvot.info)}</textarea>
      </label>
      <label>Lisätietoja (valinnainen, vapaamuotoinen)
        <textarea name="lisatietoja">${escHtml(arvot.lisatietoja)}</textarea>
      </label>
      <label>Takaaja (valinnainen, VRL-00000 - vain jos etuuspisteet nollattu)
        <input name="takaaja" value="${escHtml(arvot.takaaja)}">
      </label>

      <label>Enimmäislähtöjä per hevonen tässä kilpailussa
        <input type="number" name="max_lahtoja_per_hevonen" id="max-lahtoja-input" min="1"
               max="${jaosOletukset.maxLahtojaPerHevonen}" required value="${escHtml(lahtojaArvo)}">
      </label>

      <label>Enimmäisosallistujia per luokka (sama kaikille tämän kilpailun luokille)
        <input type="number" name="max_osallistujia_per_luokka" id="max-osallistujia-input" min="1"
               max="${jaosOletukset.maxOsallistujiaPerLuokka}" required value="${escHtml(osallistujiaArvo)}">
      </label>

      ${luokatHtml}

      <button type="submit">${escHtml(submitTeksti)}</button>
    </form>
    <script>
      const JAOS_LUOKAT = ${JSON.stringify(jaosLuokat)};
      const JAOS_RAJOITUKSET = ${JSON.stringify(jaosRajoitukset)};
      const JAOS_LYHENTEET = ${JSON.stringify(Object.fromEntries(kaikkiJaokset.map((j) => [j.id, j.lyhenne])))};

      (function () {
        const jaosSelect = document.getElementById('jaos-select');
        const checkboxAlue = document.getElementById('luokka-checkboxit');
        const textarea = document.getElementById('luokat-textarea');
        const lahtojaInput = document.getElementById('max-lahtoja-input');
        const osallistujiaInput = document.getElementById('max-osallistujia-input');
        const maxLuokkiaTeksti = document.getElementById('max-luokkia-teksti');
        const luokkaLaskuri = document.getElementById('luokka-laskuri');
        const valitseKaikkiBtn = document.getElementById('valitse-kaikki-btn');
        const tyhjennaValinnatBtn = document.getElementById('tyhjenna-valinnat-btn');
        const nimiInput = document.getElementById('nimi-input');
        const kpInput = document.getElementById('kp-input');

        // Kilpailupaikka-pudotusvalikko (ks. kilpailupaikkaValitsinHtml yllä) esitäyttää
        // tunnus/nimi/URL/vastuuhenkilö-kentät valitun kilpailupaikan tiedoilla - kentät
        // pysyvät silti tavallisina input-kenttinä, joten esitäyttöä voi vielä muuttaa käsin.
        const kilpailupaikkaSelect = document.getElementById('kilpailupaikka-select');
        if (kilpailupaikkaSelect) {
          const jarjTalliInput = document.getElementById('jarj-talli-input');
          const jarjTalliNimiInput = document.getElementById('jarj-talli-nimi-input');
          const jarjTalliUrlInput = document.getElementById('jarj-talli-url-input');
          const vastuuhenkiloNimiInput = document.getElementById('vastuuhenkilo-nimi-input');
          const vastuuhenkiloEmailInput = document.getElementById('vastuuhenkilo-email-input');

          function taytaKilpailupaikanTiedot() {
            const valittu = kilpailupaikkaSelect.selectedOptions[0];
            if (!valittu || !valittu.value) return;
            jarjTalliInput.value = valittu.dataset.tunnus;
            jarjTalliNimiInput.value = valittu.dataset.nimi;
            jarjTalliUrlInput.value = valittu.dataset.url;
            vastuuhenkiloNimiInput.value = valittu.dataset.vhNimi;
            vastuuhenkiloEmailInput.value = valittu.dataset.vhEmail;
          }

          kilpailupaikkaSelect.addEventListener('change', taytaKilpailupaikanTiedot);
          // Esitäyttää kentät heti jos lomake avautuu valmiiksi oletuskilpailupaikka valittuna
          // (ks. functions/kilpailut/uusi.js) eikä kilpailupaikkakenttiä ole jo täytetty
          // (esim. lomakkeen palautuessa validointivirheen jälkeen käyttäjän omilla arvoilla).
          if (kilpailupaikkaSelect.value && !jarjTalliInput.value) taytaKilpailupaikanTiedot();
        }

        // Kilpailun nimen oletusarvo on "<jaoksen lyhenne> - <kilpailupäivä dd.mm.yyyy>" -
        // täytetään/päivitetään automaattisesti jaosta tai kilpailupäivää vaihdettaessa,
        // mutta vain niin kauan kuin nimikenttä on tyhjä tai sisältää edellisen
        // automaattisesti lasketun arvon (käyttäjän itse kirjoittamaa nimeä ei ylikirjoiteta).
        function isoPvmSuomeksiClient(iso) {
          const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(iso || '');
          return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
        }

        function laskeOletusNimi() {
          const lyhenne = JAOS_LYHENTEET[jaosSelect.value];
          const pvm = isoPvmSuomeksiClient(kpInput.value);
          return lyhenne && pvm ? lyhenne + ' - ' + pvm : '';
        }

        let viimeisinOletusNimi = laskeOletusNimi();
        if (nimiInput && !nimiInput.value) nimiInput.value = viimeisinOletusNimi;

        function paivitaOletusNimi() {
          const uusiOletus = laskeOletusNimi();
          if (nimiInput && (nimiInput.value === '' || nimiInput.value === viimeisinOletusNimi)) {
            nimiInput.value = uusiOletus;
          }
          viimeisinOletusNimi = uusiOletus;
        }

        if (nimiInput && kpInput) {
          jaosSelect.addEventListener('change', paivitaOletusNimi);
          kpInput.addEventListener('change', paivitaOletusNimi);
        }

        function satunnaisValinta(taulukko, maara) {
          const kopio = taulukko.slice();
          for (let i = kopio.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const p = kopio[i]; kopio[i] = kopio[j]; kopio[j] = p;
          }
          return kopio.slice(0, maara);
        }

        function paivitaLaskuri() {
          luokkaLaskuri.textContent = checkboxAlue.querySelectorAll('.lk-check:checked').length;
        }

        // "Valitse kaikki" rastii luokat listajärjestyksessä jaoksen sallimaan
        // enimmäismäärään asti (ei siis ylitä sitä vaikka valmiita luokkia olisi enemmän) -
        // "Tyhjennä valinnat" poistaa kaikki rastit. Molemmat päivittävät tekstikentän
        // samaan tapaan kuin yksittäisen checkboxin muutos.
        function asetaKaikkiCheckboxit(valitse) {
          const rajat = JAOS_RAJOITUKSET[jaosSelect.value];
          const maxLuokkia = rajat ? rajat.maxLuokkia : Infinity;
          const checkboxit = Array.from(checkboxAlue.querySelectorAll('.lk-check'));
          const rivit = [];
          checkboxit.forEach((cb, i) => {
            const valittu = valitse && i < maxLuokkia;
            cb.checked = valittu;
            if (valittu) rivit.push({ nimi: cb.dataset.nimi });
          });
          textarea.value = kokoa(rivit);
          paivitaLaskuri();
        }

        function paivitaRajoitukset() {
          const rajat = JAOS_RAJOITUKSET[jaosSelect.value];
          if (!rajat) return;
          if (maxLuokkiaTeksti) maxLuokkiaTeksti.textContent = rajat.maxLuokkia;
          lahtojaInput.max = rajat.maxLahtojaPerHevonen;
          lahtojaInput.value = rajat.maxLahtojaPerHevonen;
          if (osallistujiaInput) {
            osallistujiaInput.max = rajat.maxOsallistujiaPerLuokka;
            osallistujiaInput.value = rajat.maxOsallistujiaPerLuokka;
          }
        }

        // Luokkien nimien eteen lisätään aina juokseva numero (esim. "1. Puomiluokka",
        // "2. 40cm") - näin lyhyetkin luokkanimet (esim. ERJ:n "40cm") ylittävät VRL:n
        // tulostenlähetyslomakkeen vaatiman 5 merkin minimipituuden (ks. palvelinpuolen
        // validointi alla ja lib/tulokset_client.js:n kommentti). Numerointi lasketaan
        // aina uudelleen rivien senhetkisestä järjestyksestä, joten sisäinen tila
        // (checkbox-täsmäytys ym.) pidetään numeroimattomana ja numero lisätään vasta
        // kun rivit kootaan tekstikenttään.
        function siistiNimi(nimi) {
          return nimi.replace(/^\\d+\\.\\s*/, '').trim();
        }

        function jasenna(teksti) {
          return teksti
            .split(/\\r?\\n/)
            .map((r) => r.trim())
            .filter((r) => r.length > 0)
            .map((rivi) => ({ nimi: siistiNimi(rivi.split('|')[0].trim()) }));
        }

        function kokoa(rivit) {
          return rivit.map((r, i) => (i + 1) + '. ' + r.nimi).join('\\n');
        }

        // Jokaisen jaoksen luokkavalinnat pidetään muistissa erikseen (jasennettuina
        // riveinä) jaosta vaihdettaessa - näin jaosta voi vaihtaa edestakaisin
        // menettämättä kunkin jaoksen omia valintoja/maksimeja, mutta toisen jaoksen
        // luokat eivät koskaan jää tekstikenttään nykyisen jaoksen luokkien perään
        // (aiempi bugi: luokat kertyivät sinne jaosta vaihdettaessa).
        const valinnatPerJaos = {};
        let nykyinenJaosId = null;

        function tallennaNykyinenJaos() {
          if (nykyinenJaosId === null) return;
          const luokat = JAOS_LUOKAT[nykyinenJaosId] || [];
          valinnatPerJaos[nykyinenJaosId] = jasenna(textarea.value).filter((r) => luokat.includes(r.nimi));
        }

        function piirraCheckboxit() {
          const jaosId = jaosSelect.value;
          const luokat = JAOS_LUOKAT[jaosId] || [];
          const rajat = JAOS_RAJOITUKSET[jaosId];

          if (luokat.length === 0) {
            checkboxAlue.innerHTML = '<p class="pieni">Tälle jaokselle ei ole valmista luokkalistaa - lisää luokat alla olevaan kenttään käsin.</p>';
            paivitaLaskuri();
            nykyinenJaosId = jaosId;
            return;
          }

          // Ensikäynti tässä jaoksessa tällä lomakekerralla: käytä tekstikentän niitä
          // rivejä jotka jo kuuluvat tähän jaokseen (esim. olemassa olevaa kilpailua
          // muokattaessa), tai oletusluokat jos niitä ei ole.
          let nykyiset = valinnatPerJaos[jaosId];
          if (!nykyiset) {
            nykyiset = jasenna(textarea.value).filter((r) => luokat.includes(r.nimi));
            if (nykyiset.length === 0 && rajat) {
              // Arvotut luokat pidetään valmiin luokkalistan järjestyksessä - arvonta
              // päättää vain mitkä luokat mukaan, ei niiden järjestystä.
              const arvotut = new Set(satunnaisValinta(luokat, rajat.maxLuokkia));
              const oletusLuokat = luokat.length > rajat.maxLuokkia ? luokat.filter((l) => arvotut.has(l)) : luokat;
              nykyiset = oletusLuokat.map((nimi) => ({ nimi }));
            }
          }
          valinnatPerJaos[jaosId] = nykyiset;
          nykyinenJaosId = jaosId;
          textarea.value = kokoa(nykyiset);

          checkboxAlue.innerHTML = luokat
            .map((nimi) => {
              const olemassa = nykyiset.find((r) => r.nimi === nimi);
              const nimiAttr = nimi.replace(/"/g, '&quot;');
              return (
                '<div class="luokka-rivi">' +
                '<label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal;margin:0;flex:1">' +
                '<input type="checkbox" class="lk-check" data-nimi="' + nimiAttr + '"' + (olemassa ? ' checked' : '') + ' style="width:auto;margin:0">' +
                nimi +
                '</label>' +
                '</div>'
              );
            })
            .join('');

          checkboxAlue.querySelectorAll('.lk-check').forEach((cb) => {
            cb.addEventListener('change', () => {
              const nimi = cb.dataset.nimi;
              let rivit = jasenna(textarea.value);
              if (cb.checked) {
                // Rastitettu luokka lisätään valmiin luokkalistan mukaiselle paikalleen
                // (ennen ensimmäistä listassa myöhemmin tulevaa luokkaa) eikä loppuun.
                if (!rivit.find((r) => r.nimi === nimi)) {
                  const indeksi = luokat.indexOf(nimi);
                  const kohta = rivit.findIndex((r) => luokat.indexOf(r.nimi) > indeksi);
                  if (kohta === -1) rivit.push({ nimi });
                  else rivit.splice(kohta, 0, { nimi });
                }
              } else {
                rivit = rivit.filter((r) => r.nimi !== nimi);
              }
              textarea.value = kokoa(rivit);
              paivitaLaskuri();
            });
          });

          paivitaLaskuri();
        }

        const luokatKaytossa = !!(textarea && checkboxAlue);
        jaosSelect.addEventListener('change', () => {
          if (luokatKaytossa) tallennaNykyinenJaos();
          paivitaRajoitukset();
          if (luokatKaytossa) piirraCheckboxit();
        });
        if (luokatKaytossa) piirraCheckboxit();

        if (luokatKaytossa && valitseKaikkiBtn) {
          valitseKaikkiBtn.addEventListener('click', () => asetaKaikkiCheckboxit(true));
        }
        if (luokatKaytossa && tyhjennaValinnatBtn) {
          tyhjennaValinnatBtn.addEventListener('click', () => asetaKaikkiCheckboxit(false));
        }
      })();
    </script>
  `;
}

export {
  isoPvmSuomeksi,
  suomiPvmIso,
  isoPaivienPaasta,
  jasennaLuokkarivit,
  luokatArvoksi,
  kilpailunLomakeArvot,
  validoiLomake,
  lomakeHtml,
  kokoaJaokset,
  PAIVAMAARA_REGEX,
  LUOKAN_OLETUSMAKSIMI,
  AVOINNA_HUOMIO,
};
