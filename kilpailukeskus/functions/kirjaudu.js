'use strict';

/**
 * Admin-kirjautumissivu. Julkinen (ei "/kilpailut"-alla, ks. functions/_middleware.js), koska
 * kirjautumattoman täytyy tietysti päästä tänne. Onnistunut kirjautuminen asettaa allekirjoitetun
 * sessioevästeen (ks. lib/session.js) ja ohjaa "jatka"-parametrin osoittamalle sivulle - joko
 * sinne mistä middleware ohjasi tänne (ks. functions/_middleware.js), tai etusivulle jos
 * kirjauduttiin suoraan navin "Kirjaudu sisään" -linkistä (ks. lib/html.js).
 */

import { escHtml, sivu, vastaus, uudelleenohjaus } from '../lib/html.js';
import { onkoAdminKirjautunut, vakioVertailu } from '../lib/admin_auth.js';
import { luoSessioEvaste } from '../lib/session.js';

// Vain "/"-alkuinen suhteellinen polku kelpaa jatko-osoitteeksi - estää avoimen
// uudelleenohjauksen (esim. "jatka=https://evil.example") jos parametria muokataan käsin.
function turvallinenJatkoPolku(arvo) {
  if (typeof arvo !== 'string' || !arvo.startsWith('/') || arvo.startsWith('//')) return '/';
  return arvo;
}

function lomakeHtml(jatka) {
  return `
    <h1>Kirjaudu sisään</h1>
    <form method="post" action="/kirjaudu" class="kortti">
      <input type="hidden" name="jatka" value="${escHtml(jatka)}">
      <label>Käyttäjätunnus
        <input type="text" name="kayttajanimi" required autocomplete="username" autofocus>
      </label>
      <label>Salasana
        <input type="password" name="salasana" required autocomplete="current-password">
      </label>
      <button type="submit">Kirjaudu</button>
    </form>`;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const jatka = turvallinenJatkoPolku(url.searchParams.get('jatka'));

  if (await onkoAdminKirjautunut(request, env)) {
    return uudelleenohjaus(jatka);
  }

  return vastaus(sivu({ otsikko: 'Kirjaudu sisään', sisalto: lomakeHtml(jatka), kirjautunut: false }));
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) {
    return new Response(
      'Palvelin on väärin konfiguroitu: ADMIN_USER- ja/tai ADMIN_PASSWORD-ympäristömuuttuja puuttuu.',
      { status: 500 }
    );
  }

  const data = await request.formData();
  const kayttajanimi = String(data.get('kayttajanimi') || '');
  const salasana = String(data.get('salasana') || '');
  const jatka = turvallinenJatkoPolku(data.get('jatka'));

  const kelpaa = vakioVertailu(kayttajanimi, env.ADMIN_USER) && vakioVertailu(salasana, env.ADMIN_PASSWORD);
  if (!kelpaa) {
    return vastaus(
      sivu({
        otsikko: 'Kirjaudu sisään',
        sisalto: lomakeHtml(jatka),
        viesti: { onnistui: false, teksti: 'Väärä käyttäjätunnus tai salasana.' },
        kirjautunut: false,
      }),
      401
    );
  }

  return new Response(null, {
    status: 303,
    headers: { Location: jatka, 'Set-Cookie': await luoSessioEvaste(env) },
  });
}
