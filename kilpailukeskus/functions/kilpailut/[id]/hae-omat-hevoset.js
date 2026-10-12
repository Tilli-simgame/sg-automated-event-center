'use strict';

/**
 * Järjestäjän käsin laukaisema uudelleenhaku kilpailun sivulta (ks. index.js:n
 * "Hae omat hevoset uudelleen" -nappi) - sama logiikka kuin automaattinen ensimmäinen
 * haku (ks. lib/omat_hevoset.js), mutta ajettavissa uudelleen esim. sen jälkeen kun
 * järjestäjä on lisännyt luokan, jota ei ollut olemassa ensimmäisellä hakukerralla.
 */

import { getKilpailu, listLuokat, merkitseOmatHevosetLisatty } from '../../../lib/db.js';
import { lisaaOmatHevosetAutomaattisesti, valmisOmilleHevosille } from '../../../lib/omat_hevoset.js';
import { uudelleenohjaus } from '../../../lib/html.js';

export async function onRequestPost({ params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });

  if (valmisOmilleHevosille(kilpailu)) {
    const luokat = await listLuokat(env.DB, kilpailu.id);
    const tulos = await lisaaOmatHevosetAutomaattisesti(env, kilpailu, luokat);
    await merkitseOmatHevosetLisatty(env.DB, kilpailu.id, tulos.virheet);
  }

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
