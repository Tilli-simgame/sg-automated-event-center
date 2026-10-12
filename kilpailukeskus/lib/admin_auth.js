'use strict';

/**
 * Jaettu admin-kirjautumisen tarkistus (ADMIN_USER/ADMIN_PASSWORD). Kirjautuminen tapahtuu
 * lomakkeella (ks. functions/kirjaudu.js), joka onnistuessaan asettaa allekirjoitetun
 * sessioevästeen (ks. lib/session.js) - käytössä sekä functions/_middleware.js:ssä (pakottaa
 * kirjautumisen suojatuilla poluilla) että julkisilla sivuilla (ks. lib/html.js:n sivu()),
 * jotka näyttävät header-navigaation vain jos kävijällä on jo voimassa oleva sessio.
 */

import { onkoSessioVoimassa } from './session.js';

// Vakioaikainen vertailu vähentää (ei poista) ajoitushyökkäyksen riskiä salasanan pituuden/
// sisällön päättelyyn - riittävä suoja tämän kokoluokan sisäiselle työkalulle. Käytössä
// kirjautumislomakkeen validoinnissa (ks. functions/kirjaudu.js).
function vakioVertailu(a, b) {
  if (a.length !== b.length) return false;
  let ero = 0;
  for (let i = 0; i < a.length; i++) ero |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ero === 0;
}

async function onkoAdminKirjautunut(request, env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return false;
  return onkoSessioVoimassa(request, env);
}

export { onkoAdminKirjautunut, vakioVertailu };
