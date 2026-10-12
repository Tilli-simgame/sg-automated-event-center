'use strict';

import { listKilpailut, listLajit } from '../lib/db.js';
import { escHtml, sivu, vastaus, tilaBadge, naytettavaTila } from '../lib/html.js';
import { onkoAdminKirjautunut } from '../lib/admin_auth.js';
import { kokoaJaokset } from '../lib/kilpailu_lomake.js';

// Etusivu on julkinen (ei admin-suojausta, ks. functions/_middleware.js) - kuka tahansa voi
// selata kaikkia kilpailuja taulukkona. Kutsu-sarake linkittää julkiselle
// kilpailukutsusivulle (kutsu_url), koska se on ainoa sivu johon kirjautumattomatkin
// pääsevät - kilpailun hallintasivulle ("/kilpailut/<id>") pääsee vain kun on jo kirjautunut
// admin-tunnuksilla, joten Hallinnoi-sarake näytetään vain silloin.
//
// Oletusjärjestys (uusin kilpailupäivä ylimpänä) tulee jo kannasta (ks. lib/db.js
// listKilpailut), joten se toimii ilman JavaScriptiäkin. Sarakeotsikkoa klikkaamalla
// taulukon voi järjestää selaimessa kunkin sarakkeen data-arvo-attribuutin mukaan.

// Statuksen järjestys kilpailun elinkaaren mukaan (ks. lib/html.js:n TILA_NIMET) -
// aakkosjärjestys ei kertoisi mitään.
const TILA_JARJESTYS = [
  'luonnos',
  'vrl_virhe',
  'avoinna_odottaa',
  'avoinna',
  'arvottu',
  'tulokset_virhe',
  'tulokset_lahetetty',
];

const JARJESTYS_SKRIPTI = `
<script>
  (function () {
    var taulukko = document.querySelector('table.kisat');
    if (!taulukko) return;
    var tbody = taulukko.tBodies[0];
    var otsikot = taulukko.querySelectorAll('th[data-sarake]');
    otsikot.forEach(function (th) {
      var nappi = th.querySelector('button');
      nappi.addEventListener('click', function () {
        var sarake = Number(th.dataset.sarake);
        var numero = th.dataset.tyyppi === 'numero';
        // Ensimmäinen klikkaus: päivämäärät uusin ensin, muut A-Ö; toinen kääntää.
        var nykyinen = th.getAttribute('aria-sort');
        var laskeva = nykyinen ? nykyinen === 'ascending' : th.dataset.oletus === 'laskeva';
        var rivit = Array.prototype.slice.call(tbody.rows);
        rivit.sort(function (a, b) {
          var x = a.cells[sarake].dataset.arvo || '';
          var y = b.cells[sarake].dataset.arvo || '';
          var ero = numero ? Number(x) - Number(y) : x.localeCompare(y, 'fi');
          return laskeva ? -ero : ero;
        });
        rivit.forEach(function (r) { tbody.appendChild(r); });
        otsikot.forEach(function (o) { o.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', laskeva ? 'descending' : 'ascending');
      });
    });
  })();
</script>`;

function otsikko(teksti, sarake, { tyyppi = 'teksti', oletus = 'nouseva', aktiivinen = false } = {}) {
  return `<th data-sarake="${sarake}" data-tyyppi="${tyyppi}" data-oletus="${oletus}"${aktiivinen ? ' aria-sort="descending"' : ''}>
              <button type="button" class="jarjesta">${teksti}</button>
            </th>`;
}

export async function onRequestGet({ request, env }) {
  const kirjautunut = await onkoAdminKirjautunut(request, env);

  const [kilpailut, lajit] = await Promise.all([listKilpailut(env.DB), listLajit(env.DB)]);
  const kaikkiJaokset = kokoaJaokset(lajit);

  const rivit = kilpailut.map((k) => {
    const jaosTieto = kaikkiJaokset.find((j) => j.id === k.jaos);
    let kutsuPolku = '';
    try {
      kutsuPolku = new URL(k.kutsu_url).pathname;
    } catch {
      kutsuPolku = '';
    }
    const kutsuHtml = kutsuPolku
      ? `<a class="otsikko" href="${escHtml(kutsuPolku)}">${escHtml(k.nimi)}</a>`
      : escHtml(k.nimi);
    const jaosLyhenne = jaosTieto ? jaosTieto.lyhenne : k.jaos;
    const hallintaHtml = kirjautunut ? `<td><a href="/kilpailut/${k.id}">Hallinnoi</a></td>` : '';
    return `
        <tr>
          <td data-arvo="${escHtml(jaosLyhenne)}">${escHtml(jaosLyhenne)}</td>
          <td data-arvo="${escHtml(k.kp_iso)}">${escHtml(k.kp)}</td>
          <td data-arvo="${escHtml(k.vip_iso)}">${escHtml(k.vip)}</td>
          <td data-arvo="${TILA_JARJESTYS.indexOf(naytettavaTila(k))}">${tilaBadge(k)}</td>
          <td data-arvo="${escHtml(k.nimi)}">${kutsuHtml}</td>
          ${hallintaHtml}
        </tr>`;
  });

  const taulukkoHtml = rivit.length
    ? `
      <table class="kisat">
        <thead>
          <tr>
            ${otsikko('Laji', 0)}
            ${otsikko('KP', 1, { oletus: 'laskeva', aktiivinen: true })}
            ${otsikko('VIP', 2, { oletus: 'laskeva' })}
            ${otsikko('Status', 3, { tyyppi: 'numero' })}
            ${otsikko('Kutsu', 4)}
            ${kirjautunut ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>${rivit.join('')}</tbody>
      </table>
      ${JARJESTYS_SKRIPTI}`
    : '<p class="pieni">Ei vielä kilpailuja.</p>';

  const sisalto = `
    <h1>Oak Hill Event Park <small>OAKH4632 — Virtuaalinen Kilpailukeskus</small></h1>
    <h2>Kilpailut</h2>
    ${taulukkoHtml}
  `;

  return vastaus(sivu({ otsikko: 'Kilpailut', sisalto, kirjautunut }));
}
