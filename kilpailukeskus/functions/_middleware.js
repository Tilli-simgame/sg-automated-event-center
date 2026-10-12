'use strict';

/**
 * Admin-suojaus sessioevästeellä (ks. lib/session.js, functions/kirjaudu.js). Kilpailukeskuksessa
 * ei ole muuta kirjautumista, joten tämä suojaa järjestäjän hallintasivut (kaikki "/kilpailut/*")
 * yhdellä ympäristömuuttujissa (ADMIN_USER, ADMIN_PASSWORD) olevalla käyttäjätunnus/salasana-parilla.
 *
 * Julkiset reitit jätetään tarkoituksella suojaamatta, koska kaikki voivat selata niitä
 * ilman tunnuksia:
 *  - "/" (etusivu, listaa kaikki kilpailut taulukkona, ks. functions/index.js)
 *  - "/<jaos>/<vuosi>/<kuukausi>/<numero>" (kilpailukutsun esikatselu, ks. functions/[jaos]/...)
 *  - "/kilpailut/<id>/ilmoittaudu" (ilmoittautumislomakkeen POST-kohde)
 *  - "/kirjaudu" ja "/kirjaudu-ulos" (eivät ole "/kilpailut"-alla, joten eivät osu tähän joka
 *    tapauksessa - kirjautumissivun täytyy tietysti olla saavutettavissa kirjautumatta)
 *  - "/rmp" (suhteutetun arvonnan selitys, ks. functions/rmp/index.js - sivun VH-haku näytetään
 *    ja suoritetaan vain kirjautuneelle, sivu tarkistaa sen itse)
 *
 * Middleware on projektin juuressa (koskee siis myös "/<jaos>/..."-reittejä), joten
 * suojattavat polut tarkistetaan tässä eksplisiittisesti pathnamen perusteella sen sijaan
 * että luotettaisiin pelkkään hakemistosijaintiin.
 */

import { onkoAdminKirjautunut } from '../lib/admin_auth.js';

function vaatiiAdminin(pathname) {
  if (/^\/kilpailut\/[^/]+\/ilmoittaudu$/.test(pathname)) return false;
  // "/lajit" (omien "villien" lajien hallinta, ks. functions/lajit/ ja
  // migrations/0013_lajit.sql) suojataan samalla tavalla vaikka se ei ole "/kilpailut"-alla,
  // koska se on pelkkä järjestäjän hallintatoiminto.
  return pathname.startsWith('/kilpailut') || pathname.startsWith('/lajit');
}

export async function onRequest({ request, env, next }) {
  const { pathname, search } = new URL(request.url);
  if (!vaatiiAdminin(pathname)) {
    return next();
  }

  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) {
    return new Response(
      'Palvelin on väärin konfiguroitu: ADMIN_USER- ja/tai ADMIN_PASSWORD-ympäristömuuttuja puuttuu, ' +
        'joten hallintasivuja ei voida suojata.',
      { status: 500 }
    );
  }

  if (!(await onkoAdminKirjautunut(request, env))) {
    // Ohjataan kirjautumislomakkeelle "jatka"-parametrilla, jotta onnistuneen kirjautumisen
    // jälkeen päädytään takaisin alunperin pyydetylle sivulle (ks. functions/kirjaudu.js) sen
    // sijaan että käyttäjä joutuisi navigoimaan sinne uudelleen käsin.
    const jatka = encodeURIComponent(pathname + search);
    return new Response(null, { status: 303, headers: { Location: `/kirjaudu?jatka=${jatka}` } });
  }

  return next();
}
