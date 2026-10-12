'use strict';

import { haeHevonenVhTunnuksella } from './rmp_client.js';

/**
 * Muuntaa RMP-ensiarvostelun pisteet (haetaan RMP:n rajapinnasta, ks. lib/rmp_client.js)
 * kilpailun jaosta vastaavaksi "lajipisteeksi" ja siitä edelleen arvonnan painoksi - käytössä
 * kun kilpailun arvontatapa on "2" (Suhteutettu arvonta, ks. lib/jaokset.js ja
 * lib/kilpailu_lomake.js), jolloin lib/kilpailun_arvonta.js käyttää tätä lib/arvonta.js:n
 * arvoLuokkaPainotettu()-funktion kanssa tavallisen täysin satunnaisen arvonnan sijaan.
 *
 * Lajikohtaiset RMP-kohdat ovat suoraan RMP:n "Tietoa ensiarvostelusta" -sivun ("Taitopisteet
 * ja painotus") listauksesta - vain ne jaokset jotka Kilpailukeskus tukee (ks. lib/jaokset.js);
 * RMP:n muut lajit (mm. Matkaratsastus, Työlajit) eivät koske Kilpailukeskusta.
 */

// VRL:n lomakkeen arvontatapa-arvo "Suhteutettu arvonta" (ks. lib/jaokset.js:n naapuri
// lib/kilpailu_lomake.js) - kilpailun oma, VRL:lle lähetettävä valinta toimii samalla
// kytkimenä sille, käyttääkö Kilpailukeskuksen oma arvonta tätä RMP-painotusta vai
// tavallista täysin satunnaista arvontaa (ks. lib/kilpailun_arvonta.js).
const SUHTEUTETTU_ARVONTATAPA = '2';

const JAOS_RMP_KOHDAT = {
  '1': ['taidot_ketteryys', 'taidot_hyppytekniikka', 'liikkeet_laukka'], // ERJ - Este
  '2': ['liikkeet_yleisarvosana', 'taidot_kokoamiskyky', 'taidot_voima'], // KRJ - Koulu
  '3': ['taidot_kestavyys', 'taidot_ketteryys', 'taidot_hyppytekniikka'], // KERJ - Kenttä
  '4': ['liikkeet_yleisarvosana', 'taidot_ketteryys', 'taidot_kokoamiskyky'], // VVJ - Valjakko
  '5': ['taidot_nopeus', 'taidot_ketteryys', 'taidot_voima'], // WRJ - Western
  '6': ['taidot_nopeus', 'taidot_kokoamiskyky', 'liikkeet_yleisarvosana'], // ARJ - Askellaji
};

// Ihmisluettavat nimet JAOS_RMP_KOHDAT:n sarakkeille - vain ne kahdeksan saraketta joita
// yllä oleva mappaus tosiasiassa käyttää. Käytössä kilpailukutsun sääntöselityksessä (ks.
// kuvausTekstiJaokselle ja functions/[jaos]/[vuosi]/[kuukausi]/[numero].js).
const SARAKE_NIMET = {
  liikkeet_yleisarvosana: 'liikkeiden yleisarvosana',
  liikkeet_laukka: 'laukka',
  taidot_nopeus: 'nopeus',
  taidot_kestavyys: 'kestävyys',
  taidot_ketteryys: 'ketteryys',
  taidot_hyppytekniikka: 'hyppytekniikka',
  taidot_kokoamiskyky: 'kokoamiskyky',
  taidot_voima: 'voima',
};

// "ketteryys, hyppytekniikka ja laukka" -tyylinen suomenkielinen kuvaus jaoksen RMP-kohdista,
// tai null jos jaokselle ei ole määritelty kohtia.
function kuvausTekstiJaokselle(jaos) {
  const kohdat = JAOS_RMP_KOHDAT[jaos];
  if (!kohdat || kohdat.length === 0) return null;
  const nimet = kohdat.map((sarake) => SARAKE_NIMET[sarake] || sarake);
  if (nimet.length === 1) return nimet[0];
  return `${nimet.slice(0, -1).join(', ')} ja ${nimet[nimet.length - 1]}`;
}

// Painotuksen vahvuus: paino = 1 + (pisteet/100) * VAHVUUS, eli 0 pistettä -> paino 1,
// 100 pistettä -> paino 1+VAHVUUS. Arvottu sija ei siis koskaan ole taattu edes parhaalla
// hevosella (aina jää satunnaisuutta) mutta hyvä RMP-arvostelu antaa selvän tilastollisen
// edun. Kiinteä koodissa - jos tästä halutaan joskus kilpailukohtaisesti säädettävä, tämä on
// ainoa paikka jota tarvitsee muuttaa.
const VAHVUUS = 3;

// Hevoselle jolta ei löydy RMP-ensiarvostelua (RMP:n rajapinta ei tunne VH-tunnusta) arvotaan
// silti lajipiste 0-100, mutta painottaen alaväliä (ALAVALI) - näin arvostelematon hevonen ei
// ole täysin ulkona, mutta RMP-arvosteltua hevosta suositaan koska sen oikea pistemäärä voi
// yhtä hyvin osua ylävälille.
const ALARAJAN_TODENNAKOISYYS = 0.7;
const ALAVALI = [0, 35];
const YLAVALI = [36, 100];

function satunnainenKokonaisluku(alaraja, ylaraja) {
  return alaraja + Math.floor(Math.random() * (ylaraja - alaraja + 1));
}

function arvoPisteJollaEiRmpArvostelua() {
  return Math.random() < ALARAJAN_TODENNAKOISYYS
    ? satunnainenKokonaisluku(...ALAVALI)
    : satunnainenKokonaisluku(...YLAVALI);
}

// Keskiarvo jaoksen RMP-kohdista, tai null jos jaokselle ei ole määritelty kohtia tai
// yhdelläkään kohdalla ei ole arvoa (ei pitäisi tapahtua kerran arvostellulle hevoselle,
// mutta lib/rmp_client.js palauttaa puuttuvat kentät null-arvoina).
function laskeLajipisteet(rmpHevonen, jaos) {
  const kohdat = JAOS_RMP_KOHDAT[jaos];
  if (!rmpHevonen || !kohdat) return null;
  const arvot = kohdat.map((sarake) => rmpHevonen[sarake]).filter((v) => v !== null && v !== undefined);
  if (arvot.length === 0) return null;
  return arvot.reduce((summa, v) => summa + v, 0) / arvot.length;
}

function laskePaino(pisteet) {
  const rajattu = Math.max(0, Math.min(100, pisteet));
  return 1 + (rajattu / 100) * VAHVUUS;
}

// Workers sallii enintään 6 samanaikaista avointa yhteyttä - haetaan hevoset sen verran
// rinnakkain.
const RINNAKKAISIA_HAKUJA = 6;

async function haeRmpHevoset(vhTunnukset, valimuisti) {
  const haettavat = [...new Set(vhTunnukset)].filter((vh) => !valimuisti.has(vh));
  let seuraava = 0;
  async function tyontekija() {
    while (seuraava < haettavat.length) {
      const vh = haettavat[seuraava++];
      valimuisti.set(vh, await haeHevonenVhTunnuksella(vh));
    }
  }
  await Promise.all(Array.from({ length: Math.min(RINNAKKAISIA_HAKUJA, haettavat.length) }, tyontekija));
}

function normalisoiVh(vhTunnus) {
  return String(vhTunnus || '').trim().toUpperCase();
}

/**
 * @param {string} jaos kilpailun jaos-id, ks. lib/jaokset.js
 * @param {object[]} osallistujat db.js:n listOsallistujat()-rivit (sis. vh_tunnus)
 * @param {Map<string, object|null>} [valimuisti] VH-tunnus -> RMP-hevonen; saman kilpailun
 *   luokat voivat jakaa tämän, jolloin useammassa luokassa startaava hevonen haetaan kerran.
 * @returns {Promise<Map<number, number>>} osallistuja.id -> arvonnan paino
 * @throws jos RMP:n rajapinta ei vastaa (ks. haeHevonenVhTunnuksella) - arvontaa ei silloin
 *   pidä tehdä, koska arvostellut hevoset saisivat väärin arvotut pisteet.
 */
async function haePainotOsallistujille(jaos, osallistujat, valimuisti = new Map()) {
  await haeRmpHevoset(osallistujat.map((o) => normalisoiVh(o.vh_tunnus)).filter(Boolean), valimuisti);
  const painot = new Map();
  for (const o of osallistujat) {
    const rmpHevonen = valimuisti.get(normalisoiVh(o.vh_tunnus)) || null;
    const lajipisteet = laskeLajipisteet(rmpHevonen, jaos) ?? arvoPisteJollaEiRmpArvostelua();
    painot.set(o.id, laskePaino(lajipisteet));
  }
  return painot;
}

export {
  SUHTEUTETTU_ARVONTATAPA,
  JAOS_RMP_KOHDAT,
  SARAKE_NIMET,
  VAHVUUS,
  ALARAJAN_TODENNAKOISYYS,
  ALAVALI,
  YLAVALI,
  laskeLajipisteet,
  laskePaino,
  arvoPisteJollaEiRmpArvostelua,
  haePainotOsallistujille,
  kuvausTekstiJaokselle,
};
