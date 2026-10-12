'use strict';

/**
 * Jaoskohtaiset VRL-rajoitukset "Uusi kilpailu" -lomaketta ja ilmoittautumisen validointia
 * varten. Lähde: ../../jaoskohtaiset_luokkarajoitukset.md. Avaimet vastaavat ./jaokset.js:n
 * jaos-id:itä - TYH ja MEJ on jätetty pois samasta syystä kuin ./luokkavaihtoehdot.js:ssä:
 * ne eivät ole valittavissa "Ilmoita perinteiset kilpailut" -lomakkeella.
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
};

export { JAOS_RAJOITUKSET };
