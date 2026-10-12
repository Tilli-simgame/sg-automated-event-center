'use strict';

/**
 * Profiiliin tallennettujen kilpailupaikkojen listaus/hallinta - ks. lib/kilpailu_lomake.js:n
 * kilpailupaikat-optio (pudotusvalikko uuden kilpailun lomakkeella) ja
 * migrations/0010_kilpailupaikat.sql. Reitti on "/kilpailut"-alla, joten
 * functions/_middleware.js suojaa sen automaattisesti admin-kirjautumisella samaan tapaan
 * kuin muutkin hallintasivut.
 */

import { listKilpailupaikat } from '../../../lib/db.js';
import { escHtml, sivu, vastaus } from '../../../lib/html.js';

export async function onRequestGet({ env }) {
  const kilpailupaikat = await listKilpailupaikat(env.DB);

  const riviHtml = (p) => `
    <div class="kortti">
      <p style="margin:0 0 0.3rem"><strong>${escHtml(p.talli_nimi)}</strong> (${escHtml(p.tunnus)})
        ${p.oletus ? '<span class="tila tila-avoinna">Oletus</span>' : ''}</p>
      <p class="pieni" style="margin:0 0 0.3rem">${escHtml(p.talli_url)}</p>
      <p class="pieni" style="margin:0 0 0.6rem">${escHtml(p.vastuuhenkilo_nimi)} · ${escHtml(p.vastuuhenkilo_email)}</p>
      <a href="/kilpailut/kilpailupaikat/${p.id}/muokkaa">Muokkaa</a>
      ${
        p.oletus
          ? ''
          : ` · <form method="post" action="/kilpailut/kilpailupaikat/${p.id}/aseta-oletus" style="display:inline">
               <button type="submit" class="linkkinappi">Aseta oletukseksi</button>
             </form>`
      }
      · <form method="post" action="/kilpailut/kilpailupaikat/${p.id}/poista" style="display:inline"
              onsubmit="return confirm('Poistetaanko kilpailupaikka ${escHtml(p.talli_nimi).replace(/'/g, "\\'")}? Tätä ei voi perua. Jo luotuihin kilpailuihin tämä ei vaikuta.')">
          <button type="submit" class="linkkinappi">Poista</button>
        </form>
    </div>`;

  const listaHtml = kilpailupaikat.length
    ? kilpailupaikat.map(riviHtml).join('')
    : '<p class="pieni">Ei vielä tallennettuja kilpailupaikkoja.</p>';

  const sisalto = `
    <h1>Kilpailupaikat</h1>
    <p class="pieni">Tähän tallennetut kilpailupaikat (talli, vastuuhenkilö) tarjotaan
    valmiina pudotusvalikossa uuden kilpailun lomakkeella - oletukseksi merkitty valitaan
    sinne automaattisesti.</p>
    <p><a href="/kilpailut/kilpailupaikat/uusi">+ Uusi kilpailupaikka</a></p>
    ${listaHtml}
  `;

  return vastaus(sivu({ otsikko: 'Kilpailupaikat', sisalto }));
}
