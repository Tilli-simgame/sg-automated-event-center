'use strict';

/**
 * Julkinen sivu, joka selittää suhteutetun (RMP-painotetun) arvonnan logiikan. Kirjautuneelle
 * adminille sivulla on lisäksi hevosen ensiarvostelun tulosten haku VH-tunnuksella - tulokset
 * haetaan suoraan RMP:n rajapinnasta (ks. lib/rmp_client.js), samaan tapaan kuin suhteutettu
 * arvonta ne hakee. Haku ei ole julkinen, jottei sivu toimi avoimena välityspalvelimena RMP:n
 * rajapintaan.
 */

import { haeHevonenVhTunnuksella, sanallinenArvosana } from '../../lib/rmp_client.js';
import { onkoAdminKirjautunut } from '../../lib/admin_auth.js';
import {
  JAOS_RMP_KOHDAT,
  SARAKE_NIMET,
  VAHVUUS,
  ALARAJAN_TODENNAKOISYYS,
  ALAVALI,
  YLAVALI,
  laskeLajipisteet,
  laskePaino,
} from '../../lib/rmp_arvonta.js';
import { JAOKSET } from '../../lib/jaokset.js';
import { escHtml, sivu, vastaus } from '../../lib/html.js';

// (otsikko, sarake, sanallinen arvosana näytetäänkö) - näyttöjärjestys vastaa RMP:n omaa
// "Ensiarvostelun tulokset" -sivua (ks. ../../README.md "RMP-taitopisteiden haku").
const RYHMAT = [
  {
    otsikko: 'Rakenne',
    yleisarvosana: 'rakenne_yleisarvosana',
    kohdat: [
      ['Pää, kaula ja etuosa', 'rakenne_paa_kaula_etuosa'],
      ['Runko ja takaosa', 'rakenne_runko_takaosa'],
      ['Jalat ja kaviot', 'rakenne_jalat_kaviot'],
    ],
  },
  {
    otsikko: 'Liikkeet',
    yleisarvosana: 'liikkeet_yleisarvosana',
    kohdat: [
      ['Käynti', 'liikkeet_kaynti'],
      ['Ravi', 'liikkeet_ravi'],
      ['Laukka', 'liikkeet_laukka'],
    ],
  },
  {
    otsikko: 'Luonne',
    yleisarvosana: 'luonne_yleisarvosana',
    kohdat: [
      ['Rohkeus', 'luonne_rohkeus'],
      ['Kuuliaisuus', 'luonne_kuuliaisuus'],
      ['Temperamentti', 'luonne_temperamentti'],
      ['Herkkyys', 'luonne_herkkyys'],
      ['Älykkyys', 'luonne_alykkyys'],
    ],
  },
  {
    otsikko: 'Taidot',
    yleisarvosana: 'taidot_yleisarvosana',
    kohdat: [
      ['Nopeus', 'taidot_nopeus'],
      ['Kestävyys', 'taidot_kestavyys'],
      ['Ketteryys', 'taidot_ketteryys'],
      ['Hyppytekniikka', 'taidot_hyppytekniikka'],
      ['Kokoamiskyky', 'taidot_kokoamiskyky'],
      ['Voima', 'taidot_voima'],
    ],
  },
];

function pisteRiviHtml(nimi, pisteet) {
  const sanallinen = sanallinenArvosana(pisteet);
  return `<div class="luokka-rivi"><span>${escHtml(nimi)}</span>
    <span>${pisteet ?? '—'}${sanallinen ? ` p. · ${escHtml(sanallinen)}` : ''}</span></div>`;
}

function hevonenHtml(h) {
  const ryhmatHtml = RYHMAT.map(
    (r) => `
      <fieldset>
        <legend>${escHtml(r.otsikko)} <span class="pieni">(yleisarvosana ${h[r.yleisarvosana] ?? '—'})</span></legend>
        ${r.kohdat.map(([nimi, sarake]) => pisteRiviHtml(nimi, h[sarake])).join('')}
      </fieldset>`
  ).join('');

  return `
    <div class="kortti">
      <p style="margin:0 0 0.3rem"><strong>${escHtml(h.vh_tunnus)}</strong>${h.nimi ? ` ${escHtml(h.nimi)}` : ''}
        <span class="pieni">(${[
          h.luokitus,
          h.kokonaispisteet !== null ? `${h.kokonaispisteet} p.` : null,
          h.arvosteltu ? `arvosteltu ${h.arvosteltu}` : null,
        ]
          .filter(Boolean)
          .map(escHtml)
          .join(', ')})</span></p>
      ${ryhmatHtml}
      <fieldset>
        <legend>Pisteet arvostelutilaisuudessa</legend>
        ${pisteRiviHtml('Ratsastettavuus/ajettavuus', h.ratsastettavuus_ajettavuus)}
        ${pisteRiviHtml('Käytös tilaisuudessa', h.kaytos_tilaisuudessa)}
      </fieldset>
      <fieldset>
        <legend>Suhteutetussa arvonnassa</legend>
        ${JAOKSET.filter((j) => JAOS_RMP_KOHDAT[j.id])
          .map((j) => {
            const lajipisteet = laskeLajipisteet(h, j.id);
            return `<div class="luokka-rivi"><span>${escHtml(j.lyhenne)}</span>
              <span>${lajipisteet === null ? '— (arvotaan)' : `lajipisteet ${muotoileLuku(lajipisteet)} · paino ${muotoileLuku(laskePaino(lajipisteet))}`}</span></div>`;
          })
          .join('')}
      </fieldset>
    </div>`;
}

function muotoileLuku(n) {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

// Suhteutetun arvonnan selitys - luvut ja kohdat tulevat suoraan lib/rmp_arvonta.js:n
// vakioista, jotta teksti pysyy samana kuin toteutus.
function arvontaLogiikkaHtml() {
  const kohtaRivit = JAOKSET.filter((j) => JAOS_RMP_KOHDAT[j.id])
    .map(
      (j) => `<div class="luokka-rivi"><span>${escHtml(j.lyhenne)} – ${escHtml(j.nimi)}</span>
        <span>${JAOS_RMP_KOHDAT[j.id].map((s) => escHtml(SARAKE_NIMET[s] || s)).join(', ')}</span></div>`
    )
    .join('');
  const maxPaino = muotoileLuku(1 + VAHVUUS);
  const alaProsentti = Math.round(ALARAJAN_TODENNAKOISYYS * 100);

  // Esimerkkilasku ERJ:n kohdilla (esimerkkipisteet VH24-017-0123:n ensiarvostelusta).
  const esimerkkiKohdat = JAOS_RMP_KOHDAT['1'];
  const esimerkkiPisteet = [14, 40, 20];
  const esimerkkiHevonen = Object.fromEntries(esimerkkiKohdat.map((s, i) => [s, esimerkkiPisteet[i]]));
  const esimerkkiLajipisteet = laskeLajipisteet(esimerkkiHevonen, '1');
  const esimerkkiSumma = esimerkkiKohdat
    .map((s) => `${escHtml(SARAKE_NIMET[s] || s)} ${esimerkkiHevonen[s]}`)
    .join(' + ');
  const esimerkkiHtml = `
      <p class="pieni">Esimerkki (ERJ): (${esimerkkiSumma}) / ${esimerkkiKohdat.length}
      = <strong>${muotoileLuku(esimerkkiLajipisteet)}</strong> lajipistettä. Huom. keskiarvo, ei
      summa - lajipisteet pysyvät aina välillä 0–100.</p>`;

  return `
    <h2>Näin suhteutettu arvonta toimii</h2>
    <div class="kortti">
      <p>Kun kilpailun arvontatavaksi on valittu <strong>Suhteutettu arvonta</strong>, luokan
      sijoitukset arvotaan edelleen sattumalla, mutta hevosen Rate My Pony -ensiarvostelu
      vaikuttaa todennäköisyyksiin. Pisteet haetaan RMP:stä VH-tunnuksella vasta tulosten
      arvonnan hetkellä, joten ennen arvontaa tehty arvostelu ehtii mukaan.</p>

      <h3>1. Lajipisteet</h3>
      <p>Jaos määrää, mitkä ensiarvostelun kohdat vaikuttavat. Hevosen lajipisteet ovat näiden
      kohtien keskiarvo (0–100).</p>
      <fieldset><legend>Jaoksen kohdat</legend>${kohtaRivit}</fieldset>
      ${esimerkkiHtml}
      <p>Jos hevosta ei ole arvosteltu RMP:ssä, sille arvotaan lajipisteet ${ALAVALI[0]}–${YLAVALI[1]}:
      ${alaProsentti} %:n todennäköisyydellä väliltä ${ALAVALI[0]}–${ALAVALI[1]} ja muuten väliltä
      ${YLAVALI[0]}–${YLAVALI[1]}. Arvostelematon
      hevonen on siis mukana, mutta arvostelu kannattaa.</p>

      <h3>2. Paino</h3>
      <p>Lajipisteistä lasketaan paino: <strong>paino = 1 + (lajipisteet / 100) × ${VAHVUUS}</strong>.
      0 pistettä antaa painon 1 ja 100 pistettä painon ${maxPaino}.</p>
      <p class="pieni">Esimerkki jatkuu: 1 + (${muotoileLuku(esimerkkiLajipisteet)} / 100) × ${VAHVUUS}
      = 1 + ${(esimerkkiLajipisteet / 100).toFixed(3).replace('.', ',')} × ${VAHVUUS}
      ≈ <strong>${laskePaino(esimerkkiLajipisteet).toFixed(2).replace('.', ',')}</strong>.</p>

      <h3>3. Sijoitusten arvonta</h3>
      <p>Voittaja arvotaan painojen suhteessa: paino ${maxPaino} -hevonen on ${maxPaino} kertaa
      todennäköisempi voittaja kuin paino 1 -hevonen. Seuraava sija arvotaan samalla tavalla
      jäljelle jääneistä, ja niin edelleen. Paras hevonen ei siis koskaan voita varmasti, ja jos
      kaikilla on sama paino, arvonta on täysin tasapuolinen.</p>
      <p class="pieni">Esimerkki: kolmen hevosen luokassa lajipistein 10, 50 ja 95 painot ovat
      ${muotoileLuku(laskePaino(10))}, ${muotoileLuku(laskePaino(50))} ja ${muotoileLuku(laskePaino(95))} –
      vahvin voittaa noin ${Math.round((laskePaino(95) / (laskePaino(10) + laskePaino(50) + laskePaino(95))) * 100)} %
      ja heikoin noin ${Math.round((laskePaino(10) / (laskePaino(10) + laskePaino(50) + laskePaino(95))) * 100)} %
      kerroista.</p>
    </div>`;
}

export async function onRequestGet({ request, env }) {
  const kirjautunut = await onkoAdminKirjautunut(request, env);
  const url = new URL(request.url);
  // Kirjautumattoman ?vh=-parametri ohitetaan kokonaan, ks. tiedoston yläkommentti.
  const vhHaku = kirjautunut ? (url.searchParams.get('vh') || '').trim() : '';

  let hakuTulosHtml = '';
  if (vhHaku) {
    try {
      const loytyi = await haeHevonenVhTunnuksella(vhHaku);
      hakuTulosHtml = loytyi
        ? hevonenHtml(loytyi)
        : `<p class="viesti viesti-virhe">VH-tunnukselle "${escHtml(vhHaku)}" ei löydy RMP:stä
           ensiarvostelua - suhteutetussa arvonnassa hevonen saa satunnaiset pisteet.</p>`;
    } catch (virhe) {
      hakuTulosHtml = `<p class="viesti viesti-virhe">${escHtml(virhe.message)}</p>`;
    }
  }

  const hakuHtml = kirjautunut
    ? `
    <h2>Hae hevosen tulokset VH-tunnuksella</h2>
    <form method="get" action="/rmp" class="kortti" style="display:flex; gap:0.6rem; align-items:flex-end">
      <label style="flex:1; margin-top:0">VH-tunnus
        <input type="text" name="vh" value="${escHtml(vhHaku)}" placeholder="VH18-026-0075" autofocus>
      </label>
      <button type="submit" style="margin-top:0">Hae</button>
    </form>
    ${hakuTulosHtml}`
    : '';

  const sisalto = `
    <h1>RMP-hevoset</h1>
    <p class="pieni">Rate My Ponyn (ratemypony.fi) ensiarvostelun tulokset haetaan suoraan RMP:n
    rajapinnasta VH-tunnuksella - samat pisteet joita suhteutettu arvonta käyttää.</p>
    ${hakuHtml}
    ${arvontaLogiikkaHtml()}
  `;

  return vastaus(sivu({ otsikko: 'RMP-hevoset', sisalto, kirjautunut }));
}
