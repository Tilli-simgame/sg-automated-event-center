'use strict';

/**
 * Uloskirjautuminen - tyhjentää sessioevästeen (ks. lib/session.js) ja ohjaa etusivulle.
 * POST eikä GET (ks. lib/html.js:n nav-lomake), ettei esim. linkin esilataus/crawlaus voisi
 * kirjata käyttäjää ulos vahingossa.
 */

import { uloskirjautumisEvaste } from '../lib/session.js';

export async function onRequestPost() {
  return new Response(null, {
    status: 303,
    headers: { Location: '/', 'Set-Cookie': uloskirjautumisEvaste() },
  });
}
