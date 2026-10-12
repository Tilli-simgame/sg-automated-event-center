'use strict';

/**
 * "Omien lajien" (ks. migrations/0013_lajit.sql) listaus ja luokkavaihtoehtojen hallinta.
 * Villi laji ei ole VRL:n jaos - sen kilpailuja ei koskaan lähetetä VRL:n kisakalenteriin
 * (ks. functions/kilpailut/[id]/laheta-vrl.js), vaan ilmoittautuminen avataan suoraan.
 * Reitti on admin-suojattu samaan tapaan kuin "/kilpailut" ja "/rmp" (ks.
 * functions/_middleware.js).
 *
 * Jokaisen lajin luokkavaihtoehdot (ks. lib/db.js:n listLajiLuokkavaihtoehdot) vastaavat
 * VRL-jaoksien kiinteää lib/luokkavaihtoehdot.js:ää - niitä tarjotaan valmiina "Uusi kilpailu"
 * -lomakkeen luokkavalitsimessa (ks. lib/kilpailu_lomake.js:n kokoaJaosLuokat).
 */

import { listLajit, listLajiLuokkavaihtoehdot, laskeKilpailutJaokselle } from '../../lib/db.js';
import { escHtml, sivu, vastaus } from '../../lib/html.js';

function luokkaRiviHtml(lajiId, luokka) {
  return `
    <li style="display:flex;justify-content:space-between;align-items:center;gap:0.6rem">
      <span>${escHtml(luokka.nimi)}</span>
      <form method="post" action="/lajit/${lajiId}/poista-luokka" style="margin:0">
        <input type="hidden" name="luokkavaihtoehto_id" value="${luokka.id}">
        <button type="submit" class="linkkinappi">Poista</button>
      </form>
    </li>`;
}

// Lajin omat säännöt (ks. migrations/0014_laji_saannot.sql) - VRL:n jaoskohtaiset rajat
// (lib/jaosrajoitukset.js) eivät koske villejä lajeja, joten järjestäjä asettaa nämä itse
// täältä. Kolme ylintä kenttää ovat kiinteitä numeerisia rajoja, samat kaikissa tämän lajin
// kilpailuissa (ks. lib/kilpailu_lomake.js:n kokoaJaosRajoitukset) - loput kaksi ovat
// vapaamuotoisia ja saavat vaihdella lajeittain, näytetään sellaisenaan kilpailukutsulla
// (ks. functions/[jaos]/[vuosi]/[kuukausi]/[numero].js).
function saannotLomakeHtml(laji) {
  return `
    <details style="margin:0 0 0.6rem">
      <summary>Säännöt</summary>
      <form method="post" action="/lajit/${laji.id}/muokkaa-saannot" style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.5rem">
        <label class="pieni">Enimmäisosallistujia per luokka
          <input type="number" name="max_osallistujia_per_luokka" min="1" required value="${laji.max_osallistujia_per_luokka}">
        </label>
        <label class="pieni">Enimmäislähtöjä per hevonen
          <input type="number" name="max_lahtoja_per_hevonen" min="1" required value="${laji.max_lahtoja_per_hevonen}">
        </label>
        <label class="pieni">Enimmäishevosia per ratsastaja/luokka
          <input type="number" name="max_hevosta_ratsastaja_per_luokka" min="1" required value="${laji.max_hevosta_ratsastaja_per_luokka}">
        </label>
        <label class="pieni">Osallistumismuoto (vapaamuotoinen, näytetään kilpailukutsulla)
          <textarea name="osallistumismuoto" placeholder="esim. Joukkuekilpailu, 3 hevosta/joukkue">${escHtml(laji.osallistumismuoto)}</textarea>
        </label>
        <label class="pieni">Muut säännöt (vapaamuotoinen, yksi sääntö per rivi, näytetään kilpailukutsulla)
          <textarea name="saannot">${escHtml(laji.saannot)}</textarea>
        </label>
        <label class="pieni">Laji omien hevosten haussa (rajapinnan lajinimi, esim. "matkaratsastus" - tyhjä = lajin nimi pienillä kirjaimilla)
          <input name="omat_hevoset_laji" value="${escHtml(laji.omat_hevoset_laji)}" placeholder="${escHtml(laji.nimi.toLowerCase())}">
        </label>
        <label class="pieni"><input type="checkbox" name="ilman_tunnuksia" value="1"${laji.ilman_tunnuksia ? ' checked' : ''} style="width:auto">
          Osallistujat ilman VRL-/VH-tunnuksia (omat hevoset muodossa "Ratsastaja - Hevonen", julkisen lomakkeen rivejä ei tarkisteta)
        </label>
        <button type="submit" style="margin-top:0">Tallenna säännöt</button>
      </form>
    </details>`;
}

async function lajiKorttiHtml(db, laji) {
  const luokat = await listLajiLuokkavaihtoehdot(db, laji.id);
  const kilpailuja = await laskeKilpailutJaokselle(db, laji.id);

  return `
    <div class="kortti">
      <p style="margin:0 0 0.3rem"><strong>${escHtml(laji.nimi)}</strong> (${escHtml(laji.lyhenne)})
        <span class="pieni">id ${escHtml(laji.id)}</span></p>
      <p class="pieni" style="margin:0 0 0.6rem">
        ${kilpailuja} kilpailu${kilpailuja === 1 ? '' : 'a'} tällä lajilla.
      </p>
      ${saannotLomakeHtml(laji)}
      <p class="pieni" style="margin:0 0 0.3rem">Luokkavaihtoehdot (ehdotetaan valmiina "Uusi kilpailu" -lomakkeella):</p>
      <ul style="margin:0 0 0.6rem;padding-left:0;list-style:none">
        ${luokat.map((l) => luokkaRiviHtml(laji.id, l)).join('') || '<li class="pieni">Ei vielä luokkavaihtoehtoja.</li>'}
      </ul>
      <form method="post" action="/lajit/${laji.id}/lisaa-luokka" style="display:flex;gap:0.4rem;flex-wrap:wrap;margin:0 0 0.6rem">
        <input name="nimi" placeholder="Luokan nimi, esim. Helppo A" required style="flex:1;min-width:180px;margin-top:0">
        <button type="submit" style="margin-top:0">+ Lisää luokkavaihtoehto</button>
      </form>
      ${
        kilpailuja === 0
          ? `<form method="post" action="/lajit/${laji.id}/poista"
                   onsubmit="return confirm('Poistetaanko laji ${escHtml(laji.nimi).replace(/'/g, "\\'")} kokonaan? Tätä ei voi perua.')">
               <button type="submit" class="toissijainen">Poista laji</button>
             </form>`
          : `<p class="pieni">Lajia ei voi poistaa, koska sillä on jo kilpailuja.</p>`
      }
    </div>`;
}

export async function onRequestGet({ env }) {
  const lajit = await listLajit(env.DB);
  const kortit = await Promise.all(lajit.map((l) => lajiKorttiHtml(env.DB, l)));

  const sisalto = `
    <h1>Omat lajit</h1>
    <p class="pieni">Tänne luodut lajit eivät ole VRL:n virallisia jaoksia - niiden kilpailuja
    ei koskaan lähetetä VRL:n kisakalenteriin, vaan ilmoittautuminen avataan suoraan
    Kilpailukeskuksessa ("Uusi kilpailu" -lomakkeen jaos-valikossa "Omat lajit"-ryhmässä).</p>
    <p><a href="/lajit/uusi">+ Uusi laji</a></p>
    ${kortit.join('') || '<p class="pieni">Ei vielä omia lajeja.</p>'}
  `;

  return vastaus(sivu({ otsikko: 'Omat lajit', sisalto }));
}
