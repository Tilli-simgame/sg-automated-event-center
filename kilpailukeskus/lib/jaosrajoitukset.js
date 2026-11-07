'use strict';

/**
 * Jaoskohtaiset VRL-rajoitukset "Uusi kilpailu" -lomaketta ja ilmoittautumisen validointia
 * varten. Lähde: ../../jaoskohtaiset_luokkarajoitukset.md. Avaimet vastaavat ./jaokset.js:n
 * jaos-id:itä. MEJ (id 9) puuttuu toistaiseksi, koska sitä ei ole lisätty ./jaokset.js:ään.
 *
 * - maxLuokkia: enimmäismäärä luokkia yhdessä kilpailussa.
 * - maxOsallistujiaPerLuokka: enimmäismäärä osallistujia yhdessä luokassa (kaikilla
 *   jaoksilla tällä hetkellä 100, ks. myös functions/kilpailut/uusi.js:n
 *   LUOKAN_OLETUSMAKSIMI).
 * - maxLahtojaPerHevonen: montako lähtöä (luokkaa) sama hevonen saa osallistua saman
 *   kilpailun sisällä.
 */

const JAOS_RAJOITUKSET = {
  '1': { maxLuokkia: 15, maxOsallistujiaPerLuokka: 100, maxLahtojaPerHevonen: 2 }, // ERJ
  '2': { maxLuokkia: 15, maxOsallistujiaPerLuokka: 100, maxLahtojaPerHevonen: 2 }, // KRJ
  '3': { maxLuokkia: 15, maxOsallistujiaPerLuokka: 100, maxLahtojaPerHevonen: 1 }, // KERJ
  '4': { maxLuokkia: 15, maxOsallistujiaPerLuokka: 100, maxLahtojaPerHevonen: 2 }, // VVJ
  '5': { maxLuokkia: 15, maxOsallistujiaPerLuokka: 100, maxLahtojaPerHevonen: 6 }, // WRJ
  '6': { maxLuokkia: 100, maxOsallistujiaPerLuokka: 100, maxLahtojaPerHevonen: 10 }, // ARJ
  '8': { maxLuokkia: 15, maxOsallistujiaPerLuokka: 100, maxLahtojaPerHevonen: 15 }, // TYH
};

export { JAOS_RAJOITUKSET };
