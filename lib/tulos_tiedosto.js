'use strict';

/**
 * Jäsentää yksinkertaisen tekstitiedostomuodon tulosten testidataksi - käytetään sekä
 * CLI-skriptissä (../laheta_tulokset.js, --tiedosto=...) että ../tulokset-testi.txt on
 * kirjoitettu tähän muotoon copy-pastea varten.
 *
 * Muoto (rivit tässä järjestyksessä per luokka, tyhjät rivit ja '#'-kommentit sallittu
 * missä tahansa):
 *
 *   LUOKKA: 1. Helppo A
 *   OSALLISTUJAT:
 *   <vapaata tekstiä, useampi rivi sallittu>
 *   HYLÄTYT:
 *   <vapaata tekstiä, voi olla tyhjä>
 *
 * "HYLÄTYT:"-lohko on valinnainen per luokka. Tekstisisältö osallistujat/hylätyt-lohkoissa
 * on vapaamuotoista - VRL ei pakota mitään globaalia muotoa, kukin jaos määrittelee omat
 * sääntönsä (ks. send-application/README.md).
 */

function jasennaTulosTiedosto(teksti) {
  const rivit = teksti.split(/\r?\n/);
  const luokat = [];
  let nykyinen = null;
  let lohko = null;

  for (const rivi of rivit) {
    if (/^\s*#/.test(rivi)) continue; // kommenttirivi

    const luokkaOsuma = /^LUOKKA:\s*(.+?)\s*$/.exec(rivi);
    if (luokkaOsuma) {
      if (nykyinen) luokat.push(viimeistele(nykyinen));
      nykyinen = { luokka: luokkaOsuma[1], osallistujat: [], hylatyt: [] };
      lohko = null;
      continue;
    }

    if (/^OSALLISTUJAT:\s*$/i.test(rivi)) {
      lohko = 'osallistujat';
      continue;
    }
    if (/^HYL[ÄA]TYT:\s*$/i.test(rivi)) {
      lohko = 'hylatyt';
      continue;
    }

    if (nykyinen && lohko && rivi.trim() !== '') {
      nykyinen[lohko].push(rivi);
    }
  }
  if (nykyinen) luokat.push(viimeistele(nykyinen));

  return luokat;
}

function viimeistele(luokka) {
  return {
    luokka: luokka.luokka,
    osallistujat: luokka.osallistujat.join('\n'),
    hylatyt: luokka.hylatyt.join('\n'),
  };
}

module.exports = { jasennaTulosTiedosto };
