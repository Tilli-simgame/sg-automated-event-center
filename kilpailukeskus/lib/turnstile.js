'use strict';

/**
 * Cloudflare Turnstile -bottitarkistus julkiselle ilmoittautumislomakkeelle
 * (ks. functions/kilpailut/[id]/ilmoittaudu.js). Tarkistus tehdään vain kun
 * TURNSTILE_SECRET_KEY-ympäristömuuttuja on asetettu - paikallisessa kehityksessä
 * (.dev.vars ilman kyseistä muuttujaa) tarkistus siis ohitetaan kokonaan, eikä
 * esim. test/e2e_taytto_ja_tulokset.js:n tarvitse tietää Turnstilesta mitään.
 */

const SIITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function turnstileOk(secretKey, token, remoteip) {
  if (!token) return false;

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteip) body.set('remoteip', remoteip);

  const res = await fetch(SIITEVERIFY_URL, { method: 'POST', body });
  if (!res.ok) return false;

  const data = await res.json();
  return data.success === true;
}

export { turnstileOk };
