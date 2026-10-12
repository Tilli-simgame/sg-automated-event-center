'use strict';

/**
 * Arvontalogiikka: kun kilpailu siirtyy valmiiksi arvottavaksi (VIP umpeutunut tai kaikki
 * luokat täynnä, ks. db.js:n listArvontaaOdottavat), jokaisen luokan osallistujat asetetaan
 * satunnaiseen sijoitusjärjestykseen 1..N. Tämä on Oak Hill Event Parkin oma, tästä
 * järjestelmästä lähtien käytetty arvonta - ei riipu mistään VRL:n omasta logiikasta.
 */

function satunnaisSiirros(taulukko) {
  const kopio = taulukko.slice();
  for (let i = kopio.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopio[i], kopio[j]] = [kopio[j], kopio[i]];
  }
  return kopio;
}

/**
 * @param {{id: number, nimi: string}[]} osallistujat
 * @returns {{osallistujaId: number, sija: number, nimi: string}[]} sijat 1..N satunnaisessa
 *   järjestyksessä
 */
function arvoLuokka(osallistujat) {
  const jarjestys = satunnaisSiirros(osallistujat);
  return jarjestys.map((o, i) => ({ osallistujaId: o.id, sija: i + 1, nimi: o.nimi }));
}

// Painotettu arvonta (kilpailun arvontatapa "Suhteutettu arvonta", ks.
// lib/kilpailun_arvonta.js ja lib/rmp_arvonta.js) - sama "arvonta ilman takaisinpanoa"
// -periaate kuin arvoLuokka():ssa, mutta jokaisella osallistujalla on oma painonsa (RMP:n
// ensiarvostelun lajipisteistä laskettu, ks. lib/rmp_arvonta.js). Käytetään
// Efraimidis-Spirakis-menetelmää: jokaiselle lasketaan avain U^(1/paino) (U tasajakautunut
// välillä (0,1]) ja sijat tulevat avainten mukaan suuruusjärjestyksessä - suurempi paino
// nostaa tilastollisesti sijaa muttei koskaan takaa sitä, ja tasapainoilla (kaikki paino
// samat) tulos on yhtä satunnainen kuin arvoLuokka():n Fisher-Yates-sekoitus.
function painotettuAvain(paino) {
  const u = 1 - Math.random(); // (0,1], ei koskaan 0 (Math.random() voi palauttaa 0:n)
  return Math.pow(u, 1 / paino);
}

/**
 * @param {{id: number, nimi: string}[]} osallistujat
 * @param {Map<number, number>} painot osallistuja.id -> paino (> 0), ks. lib/rmp_arvonta.js
 */
function arvoLuokkaPainotettu(osallistujat, painot) {
  const jarjestys = osallistujat
    .map((o) => ({ o, avain: painotettuAvain(painot.get(o.id) ?? 1) }))
    .sort((a, b) => b.avain - a.avain)
    .map((r) => r.o);
  return jarjestys.map((o, i) => ({ osallistujaId: o.id, sija: i + 1, nimi: o.nimi }));
}

// Muotoilee arvotun luokan laheta_tulokset.js:n (ja VRL-lomakkeen) odottamaan
// vapaamuotoiseen "osallistujat"-tekstikenttään: yksi rivi per sijoitus, "N. Nimi".
function muotoileOsallistujatTeksti(sijoitukset) {
  return sijoitukset.map((s) => `${s.sija}. ${s.nimi}`).join('\n');
}

export { satunnaisSiirros, arvoLuokka, arvoLuokkaPainotettu, muotoileOsallistujatTeksti };
