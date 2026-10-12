'use strict';

/**
 * Uuden "villin" lajin luonti (ks. migrations/0013_lajit.sql ja functions/lajit/index.js).
 * Id annetaan automaattisesti juoksevana (ks. lib/db.js:n seuraavaLajiId, alkaa 9900:sta) -
 * järjestäjä valitsee vain lyhenteen (näkyy kilpailukutsun URL-polussa, ks.
 * functions/[jaos]/...) ja koko nimen.
 */

import { listLajit, seuraavaLajiId, createLaji } from '../../lib/db.js';
import { JAOKSET } from '../../lib/jaokset.js';
import { escHtml, sivu, vastaus, uudelleenohjaus } from '../../lib/html.js';

const LYHENNE_REGEX = /^[A-Za-z0-9]{2,15}$/;

function lomakeHtml(arvot, virheet) {
  const virheHtml = virheet.length
    ? `<div class="viesti viesti-virhe">${virheet.map(escHtml).join('<br>')}</div>`
    : '';
  return `
    <h1>Uusi laji</h1>
    <p class="pieni">Tämä ei ole VRL:n virallinen jaos - tämän lajin kilpailuja ei koskaan
    lähetetä VRL:n kisakalenteriin, vaan ilmoittautuminen avataan suoraan Kilpailukeskuksessa.</p>
    ${virheHtml}
    <form method="post">
      <label>Lyhenne (näkyy kilpailukutsun osoitteessa, esim. "KOIRA" -> /koira/2026/10/0001)
        <input name="lyhenne" required minlength="2" maxlength="15" pattern="[A-Za-z0-9]+"
               value="${escHtml(arvot.lyhenne)}" placeholder="esim. KOIRA">
      </label>
      <label>Koko nimi
        <input name="nimi" required value="${escHtml(arvot.nimi)}" placeholder="esim. Koiraurheilujaos">
      </label>
      <button type="submit">Luo laji</button>
    </form>
  `;
}

export async function onRequestGet() {
  return vastaus(sivu({ otsikko: 'Uusi laji', sisalto: lomakeHtml({ lyhenne: '', nimi: '' }, []) }));
}

export async function onRequestPost({ request, env }) {
  const data = await request.formData();
  const arvot = {
    lyhenne: (data.get('lyhenne') || '').toString().trim(),
    nimi: (data.get('nimi') || '').toString().trim(),
  };

  const virheet = [];
  if (!LYHENNE_REGEX.test(arvot.lyhenne)) {
    virheet.push('Lyhenteen on oltava 2-15 merkkiä, vain kirjaimia ja numeroita.');
  }
  if (!arvot.nimi) {
    virheet.push('Nimi puuttuu.');
  }

  if (virheet.length === 0) {
    const lajit = await listLajit(env.DB);
    const kaikkiLyhenteet = [...JAOKSET, ...lajit].map((j) => j.lyhenne.toLowerCase());
    if (kaikkiLyhenteet.includes(arvot.lyhenne.toLowerCase())) {
      virheet.push(`Lyhenne "${arvot.lyhenne}" on jo käytössä.`);
    }
  }

  if (virheet.length > 0) {
    return vastaus(sivu({ otsikko: 'Uusi laji', sisalto: lomakeHtml(arvot, virheet) }), 400);
  }

  const id = await seuraavaLajiId(env.DB);
  await createLaji(env.DB, { id, lyhenne: arvot.lyhenne.toUpperCase(), nimi: arvot.nimi });

  return uudelleenohjaus('/lajit');
}
