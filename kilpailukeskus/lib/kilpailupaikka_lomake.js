'use strict';

/**
 * Profiiliin tallennettavan kilpailupaikan luonti-/muokkauslomakkeen jaettu HTML/
 * validointilogiikka - käytössä sekä uuden kilpailupaikan luonnissa
 * (functions/kilpailut/kilpailupaikat/uusi.js) että olemassa olevan muokkauksessa
 * (functions/kilpailut/kilpailupaikat/[id]/muokkaa.js), samaan tapaan kuin
 * lib/kilpailu_lomake.js kilpailun omalle lomakkeelle.
 *
 * Kilpailukeskuksessa on vain yksi jaettu admin-tunnus (ei erillisiä käyttäjätilejä, ks.
 * lib/admin_auth.js), joten kilpailupaikat eivät ole sidottu käyttäjä-id:hen - kaikki
 * jaetulla tunnuksella kirjautuneet näkevät ja hallinnoivat samaa listaa (ks.
 * migrations/0010_kilpailupaikat.sql).
 */

import { escHtml } from './html.js';
import { SAHKOPOSTI_REGEX, onkoKelvollinenUrl } from './validointi.js';

function validoiLomake(arvot) {
  const virheet = [];

  if (!arvot.talli_nimi) virheet.push('Kilpailupaikan tai tallin nimi puuttuu.');
  if (!onkoKelvollinenUrl(arvot.talli_url)) virheet.push('Kilpailupaikan tai tallin URL on väärässä muodossa.');
  if (arvot.tunnus.length < 6 || arvot.tunnus.length > 10) {
    virheet.push('Kilpailupaikan tunnuksen on oltava 6-10 merkkiä.');
  }
  if (!arvot.vastuuhenkilo_nimi) virheet.push('Vastuuhenkilön nimi puuttuu.');
  if (!SAHKOPOSTI_REGEX.test(arvot.vastuuhenkilo_email)) virheet.push('Vastuuhenkilön sähköpostiosoite on väärässä muodossa.');

  return { virheet };
}

function lomakeHtml(
  arvot = {},
  virheet = [],
  { otsikko = 'Uusi kilpailupaikka', submitTeksti = 'Tallenna', action = '' } = {}
) {
  const virheHtml = virheet.length
    ? `<div class="viesti viesti-virhe">${virheet.map(escHtml).join('<br>')}</div>`
    : '';

  return `
    <h1>${escHtml(otsikko)}</h1>
    ${virheHtml}
    <form method="post"${action ? ` action="${escHtml(action)}"` : ''}>
      <div style="display:flex;gap:1rem;flex-wrap:wrap">
        <label style="flex:1;min-width:180px">Kilpailupaikan tai tallin nimi
          <input name="talli_nimi" required value="${escHtml(arvot.talli_nimi)}" placeholder="Oak Hill Event Park">
        </label>
        <label style="flex:1;min-width:180px">Kilpailupaikan tai tallin URL
          <input type="url" name="talli_url" required value="${escHtml(arvot.talli_url)}" placeholder="https://esimerkki.fi">
        </label>
      </div>
      <label>Kilpailupaikan tai tallin tunnus (esim. XXXX0000, oltava oma talli)
        <input name="tunnus" required minlength="6" maxlength="10" value="${escHtml(arvot.tunnus)}">
      </label>
      <div style="display:flex;gap:1rem;flex-wrap:wrap">
        <label style="flex:1;min-width:180px">Vastuuhenkilön nimi
          <input name="vastuuhenkilo_nimi" required value="${escHtml(arvot.vastuuhenkilo_nimi)}" placeholder="Matti Meikäläinen">
        </label>
        <label style="flex:1;min-width:180px">Vastuuhenkilön sähköposti
          <input type="email" name="vastuuhenkilo_email" required value="${escHtml(arvot.vastuuhenkilo_email)}" placeholder="matti@esimerkki.fi">
        </label>
      </div>
      <label style="display:flex;align-items:center;gap:0.5rem;font-weight:normal">
        <input type="checkbox" name="oletus" value="1" style="width:auto;margin:0" ${arvot.oletus ? 'checked' : ''}>
        Käytä oletuksena uuden kilpailun lomakkeella
      </label>
      <button type="submit">${escHtml(submitTeksti)}</button>
    </form>
  `;
}

export { validoiLomake, lomakeHtml };
