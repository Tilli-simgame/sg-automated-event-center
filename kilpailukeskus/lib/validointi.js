'use strict';

/**
 * Pieniä muotovalidaattoreita, jaettu lib/kilpailu_lomake.js:n (kilpailun oma lomake) ja
 * lib/kilpailupaikka_lomake.js:n (profiiliin tallennettavat kilpailupaikat, ks.
 * functions/kilpailut/kilpailupaikat/) kesken - samat kentät (kilpailupaikan/tallin URL,
 * vastuuhenkilön sähköposti) esiintyvät molemmilla lomakkeilla eikä niiden pidä voida
 * validoitua eri tavalla riippuen kumman lomakkeen kautta arvo on syötetty.
 */

// Kevyt muotovalidointi - varsinaisen osoitteen kelpoisuus ei ole tässä oleellista, kunhan
// lomakkeelle ei pääse selvästi virheellistä arvoa.
const SAHKOPOSTI_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Vain http(s)-osoitteet kelpaavat, jotta kilpailukutsulle ei päädy esim. "javascript:"-osoitetta.
function onkoKelvollinenUrl(arvo) {
  try {
    return ['http:', 'https:'].includes(new URL(arvo).protocol);
  } catch {
    return false;
  }
}

export { SAHKOPOSTI_REGEX, onkoKelvollinenUrl };
