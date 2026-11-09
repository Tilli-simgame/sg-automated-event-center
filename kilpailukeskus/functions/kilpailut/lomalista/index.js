'use strict';

/**
 * Lomalista (ks. migrations/0023_lomalista.sql): lomalla olevien omien hevosten VH-tunnukset,
 * joita omien hevosten automaattilisäys (ks. lib/omat_hevoset.js) ei lisää kilpailuihin.
 * Reitti on "/kilpailut"-alla, joten functions/_middleware.js suojaa sen admin-kirjautumisella.
 *
 * Lista muokataan yhtenä tekstikenttänä: yksi hevonen per rivi, rivillä VH-tunnus ja sen
 * ympärillä vapaa kommentti (esim. "VH12-345-6789 Ihka Ihana, varsaloma"). Tallennus korvaa
 * koko listan, joten hevonen palaa kisoihin poistamalla sen rivin.
 */

import { listLomalista, tallennaLomalista } from '../../../lib/db.js';
import { escHtml, sivu, vastaus, uudelleenohjaus } from '../../../lib/html.js';

const VH_REGEX = /VH\d{2}-\d{3}-\d{4}/i;

function riviTekstiksi(r) {
  return r.kommentti ? `${r.vh_tunnus} ${r.kommentti}` : r.vh_tunnus;
}

// Palauttaa { rivit, virheet }.
function jasennaLomalista(teksti) {
  const rivit = [];
  const virheet = [];
  const nahdyt = new Set();
  teksti
    .split(/\r?\n/)
    .map((r) => r.trim())
    .forEach((rivi, i) => {
      if (!rivi) return;
      const osuma = VH_REGEX.exec(rivi);
      if (!osuma) {
        virheet.push(`Rivi ${i + 1} ("${rivi}"): VH-tunnusta (muoto VH12-345-6789) ei löytynyt.`);
        return;
      }
      const vhTunnus = osuma[0].toUpperCase();
      if (nahdyt.has(vhTunnus)) return; // sama hevonen kahdesti = sama asia, ei virhe
      nahdyt.add(vhTunnus);
      const kommentti = (rivi.slice(0, osuma.index) + ' ' + rivi.slice(osuma.index + osuma[0].length))
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-–,:;]+|[\s\-–,:;]+$/g, '');
      rivit.push({ vhTunnus, kommentti });
    });
  return { rivit, virheet };
}

function sivuHtml(teksti, maara, virheet = [], viesti) {
  const virheHtml = virheet.length
    ? `<div class="viesti viesti-virhe">${virheet.map(escHtml).join('<br>')}</div>`
    : '';
  const sisalto = `
    <h1>Lomalista</h1>
    <p class="pieni">Lomalla olevat omat hevoset, joita ei lisätä kilpailuihin omien hevosten
    automaattilisäyksessä. Yksi hevonen per rivi: VH-tunnus ja halutessasi kommentti, esim.
    <code>VH12-345-6789 Ihka Ihana, varsaloma</code>. Hevonen palaa kisoihin, kun sen rivi
    poistetaan. Jo kilpailuihin lisättyihin hevosiin lista ei vaikuta.</p>
    ${virheHtml}
    <form method="post" action="/kilpailut/lomalista">
      <label for="lomalista">Lomalla olevat hevoset (${maara})</label>
      <textarea id="lomalista" name="lomalista" rows="14" placeholder="VH12-345-6789 Ihka Ihana">${escHtml(teksti)}</textarea>
      <button type="submit">Tallenna lomalista</button>
    </form>
  `;
  return sivu({ otsikko: 'Lomalista', sisalto, viesti });
}

export async function onRequestGet({ request, env }) {
  const lista = await listLomalista(env.DB);
  const tallennettu = new URL(request.url).searchParams.has('tallennettu');
  return vastaus(
    sivuHtml(
      lista.map(riviTekstiksi).join('\n'),
      lista.length,
      [],
      tallennettu ? { onnistui: true, teksti: 'Lomalista tallennettu.' } : undefined
    )
  );
}

export async function onRequestPost({ request, env }) {
  const data = await request.formData();
  const teksti = (data.get('lomalista') || '').toString();
  const { rivit, virheet } = jasennaLomalista(teksti);
  if (virheet.length) {
    const nykyinen = await listLomalista(env.DB);
    return vastaus(sivuHtml(teksti, nykyinen.length, virheet), 400);
  }
  await tallennaLomalista(env.DB, rivit);
  return uudelleenohjaus('/kilpailut/lomalista?tallennettu');
}
