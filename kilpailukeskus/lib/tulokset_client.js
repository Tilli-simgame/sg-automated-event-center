'use strict';

/**
 * "Ilmoita tulokset" -lomakkeen (/kilpailutoiminta/ilmoita_tulokset/{id}) automatisointiin
 * liittyvä logiikka - vain perinteisille (ei-porrastetuille) kilpailuille, sama rajaus
 * kuin kilpailu_client.js:ssä.
 *
 * Palvelinpuolen käsittely (Kilpailutoiminta::_ilmoita_tulokset_perinteiset(), rivi ~1265
 * fuel/application/controllers/Kilpailutoiminta.php) on kaksivaiheinen SELAIMESSA:
 * ensin lähetetään luokkien nimet (yksi per rivi), minkä perusteella palvelin piirtää
 * jokaiselle luokalle omat "Osallistujat"/"Hylätyt"-tekstikentät (tulos_N_os / tulos_N_hyl,
 * N=1,2,3...), jotka sitten täytetään ja lähetetään erikseen.
 *
 * _send_result() (sama tiedosto, rivi ~1429) käsittelee POST-pyynnön KUITENKIN suoraan
 * heti kun pyynnössä ei ole 'luokat'- eikä 'class_amount'-kenttää - se ei siis oikeasti
 * vaadi kaksivaiheisuutta, kunhan tulos_N_luokka/os/hyl-kentät ovat jo valmiiksi mukana.
 * Tämän ansiosta koko tulosten lähetys onnistuu YHDELLÄ POST-pyynnöllä, kun tiedämme
 * etukäteen luokkien nimet ja niiden osallistujat/hylätyt - ei tarvitse ensin käydä
 * hakemassa palvelimelta dynaamisesti generoituja kenttiä.
 *
 * _send_result() lukee tulos_N_luokka-kenttiä juoksevasti N=1,2,3... alkaen ja pysähtyy
 * heti kun jokin tulos_N_luokka puuttuu TAI on enintään 5 merkkiä pitkä - tällöin KAIKKI
 * sitä seuraavat luokat (myös kelvolliset) jäävät hiljaisesti käsittelemättä. Siksi
 * lahetaTulokset() tarkistaa jokaisen luokan nimen pituuden etukäteen.
 */

import { pyydaJaSeuraaOhjauksia, poimiLomakeviesti, kirjaudu } from './http_client.js';

/**
 * @param {object} asetukset
 * @param {string} asetukset.baseUrl   Sivuston osoite
 * @param {string} asetukset.identity  Kirjautumistunnus
 * @param {string} asetukset.password  Salasana
 * @param {string|number} asetukset.kisaId  Kilpailun id URL-polusta (esim. 900009)
 * @param {{luokka: string, osallistujat?: string, hylatyt?: string}[]} asetukset.luokat
 *   Vähintään yksi luokka. `luokka` on tarkalleen se teksti, joka tallentuu tulokseen
 *   luokan nimeksi (esim. "1. Helppo A") - oltava yli 5 merkkiä pitkä, ks. yllä.
 *   `osallistujat`/`hylatyt` ovat vapaamuotoista tekstiä jaoksen omien sääntöjen mukaan.
 * @param {boolean} [asetukset.varmistaSsl]
 * @param {number} [asetukset.timeoutMs]
 * @param {object} [valinnat]
 * @param {(viesti: string) => void} [valinnat.loki]
 * @returns {Promise<{onnistui: boolean, vaihe: string, viesti: string}>}
 *   `vaihe` on 'validointi' | 'kirjautuminen' | 'lomake'
 */
async function lahetaTulokset(asetukset, valinnat = {}) {
  const loki = valinnat.loki || (() => {});
  const varmistaSsl = asetukset.varmistaSsl !== false;
  const timeoutMs = asetukset.timeoutMs || 30000;
  const baseUrl = (asetukset.baseUrl || '').replace(/\/+$/, '');

  const puuttuvatPerus = ['base-url', 'identity', 'password', 'kisa-id'].filter(
    (nimi) =>
      !{ 'base-url': baseUrl, identity: asetukset.identity, password: asetukset.password, 'kisa-id': asetukset.kisaId }[
        nimi
      ]
  );
  if (puuttuvatPerus.length > 0) {
    return { onnistui: false, vaihe: 'validointi', viesti: `Pakollisia parametreja puuttuu: ${puuttuvatPerus.map((n) => `--${n}`).join(', ')}` };
  }

  const luokat = Array.isArray(asetukset.luokat) ? asetukset.luokat : [];
  if (luokat.length === 0) {
    return { onnistui: false, vaihe: 'validointi', viesti: 'Vähintään yksi luokka tarvitaan (luokan nimi + osallistujat ja/tai hylätyt).' };
  }
  for (const [i, luokka] of luokat.entries()) {
    const nimi = (luokka.luokka || '').trim();
    if (nimi.length <= 5) {
      return {
        onnistui: false,
        vaihe: 'validointi',
        viesti: `Luokka ${i + 1}: luokan nimen ("${nimi}") on oltava yli 5 merkkiä pitkä - palvelin lopettaa luokkien lukemisen kokonaan ensimmäiseen liian lyhyeen tai puuttuvaan nimeen, jolloin kaikki tämän jälkeiset luokat jäisivät hiljaa tallentamatta.`,
      };
    }
  }
  // Yksittäinen luokka saa olla tyhjä (ei osallistujia) - se lähetetään silti, jotta luokka
  // näkyy tuloksissa. _send_result() hylkää vain kokonaan tyhjät tulokset: osallistujien
  // tai hylättyjen yhteispituuden on oltava yli 5 merkkiä.
  const yhteensa = (kentta) => luokat.map((l) => l[kentta] || '').join('').length;
  if (yhteensa('osallistujat') <= 5 && yhteensa('hylatyt') <= 5) {
    return { onnistui: false, vaihe: 'validointi', viesti: 'Kaikki luokat ovat tyhjiä - palvelin hylkäisi täysin tyhjät tulokset.' };
  }

  const lomakeUrl = `${baseUrl}/kilpailutoiminta/ilmoita_tulokset/${encodeURIComponent(asetukset.kisaId)}`;

  const kirjautumistulos = await kirjaudu({
    baseUrl,
    identity: asetukset.identity,
    password: asetukset.password,
    lomakeUrl,
    varmistaSsl,
    timeoutMs,
  });
  if (!kirjautumistulos.onnistui) {
    return { onnistui: false, vaihe: 'kirjautuminen', viesti: kirjautumistulos.viesti };
  }
  loki('Kirjautuminen onnistui.');

  const lomakeKentat = {};
  luokat.forEach((luokka, i) => {
    const n = i + 1;
    lomakeKentat[`tulos_${n}_luokka`] = luokka.luokka.trim();
    lomakeKentat[`tulos_${n}_os`] = luokka.osallistujat || '';
    lomakeKentat[`tulos_${n}_hyl`] = luokka.hylatyt || '';
  });

  let lomakevastaus;
  try {
    lomakevastaus = await pyydaJaSeuraaOhjauksia({
      url: lomakeUrl,
      method: 'POST',
      postData: new URLSearchParams(lomakeKentat).toString(),
      jar: kirjautumistulos.jar,
      varmistaSsl,
      timeoutMs,
    });
  } catch (virhe) {
    return { onnistui: false, vaihe: 'lomake', viesti: `Tulosten lähetys epäonnistui: ${virhe.message}` };
  }

  if (lomakevastaus.statusKoodi >= 400) {
    return { onnistui: false, vaihe: 'lomake', viesti: `Tulosten lähetys palautti HTTP-virheen ${lomakevastaus.statusKoodi}.` };
  }

  const [viestiTyyppi, viestiTeksti] = poimiLomakeviesti(lomakevastaus.runko);

  if (viestiTyyppi === 'success') {
    return { onnistui: true, vaihe: 'lomake', viesti: viestiTeksti || 'Tulos lähetetty käsittelyjonoon' };
  }
  if (viestiTyyppi === 'danger') {
    return { onnistui: false, vaihe: 'lomake', viesti: viestiTeksti || 'Tulosten lähetys hylättiin, syytä ei saatu selville.' };
  }

  return {
    onnistui: false,
    vaihe: 'lomake',
    viesti:
      'Vastausta ei voitu tulkita. Tarkista base-url, kilpailun id ja että olet kilpailun järjestäjä tai takaaja - myös se, ettei tuloksia ole jo ilmoitettu.',
  };
}

export { lahetaTulokset };
