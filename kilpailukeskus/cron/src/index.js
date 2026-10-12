'use strict';

/**
 * Ajastettu Worker: käy läpi kilpailut, joiden VIP on umpeutunut tai kaikki luokat ovat
 * täynnä (ks. ../../lib/db.js listArvontaaOdottavat), arpoo niiden tulokset ja lähettää
 * ne automaattisesti VRL:ään. Cloudflare Pages ei tue cron-triggereitä, joten tämä on
 * erillinen Worker, joka jakaa saman D1-kannan Pages-projektin ("oakh4632") kanssa.
 */

import { listArvontaaOdottavat } from '../../lib/db.js';
import { arvoJaTallenna } from '../../lib/kilpailun_arvonta.js';
import { laheteTuloksetVrl } from '../../lib/kilpailun_tulosten_lahetys.js';

async function kasitteleValmiitKilpailut(env) {
  const kilpailut = await listArvontaaOdottavat(env.DB);
  let onnistuneet = 0;
  for (const kilpailu of kilpailut) {
    try {
      await arvoJaTallenna(env.DB, kilpailu.id);
      const tulos = await laheteTuloksetVrl(env, kilpailu.id);
      if (tulos.onnistui) onnistuneet += 1;
      console.log(`Kilpailu ${kilpailu.id} (${kilpailu.nimi}): arvottu, tulokset ${tulos.onnistui ? 'lähetetty' : 'EI lähetetty: ' + tulos.viesti}`);
    } catch (virhe) {
      console.error(`Kilpailu ${kilpailu.id} (${kilpailu.nimi}): käsittely epäonnistui: ${virhe.message}`);
    }
  }
  return { kasitelty: kilpailut.length, onnistuneet };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(kasitteleValmiitKilpailut(env));
  },
  // Käsikäyttöinen laukaisu testausta/virheenselvitystä varten: POST /aja.
  // Worker ei ole tarkoitettu julkiseksi käyttöliittymäksi - suojaa reitti tuotannossa
  // tarvittaessa esim. Cloudflare Accessilla tai jaetulla salaisuudella.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/aja') {
      const tulos = await kasitteleValmiitKilpailut(env);
      return new Response(`Käsitelty ${tulos.kasitelty} kilpailua, ${tulos.onnistuneet} tulosten lähetys onnistui.\n`);
    }
    return new Response('Oak Hill Event Park -- arvonta- ja tulostenlähetys-cron. POST /aja käsikäyttöiseen laukaisuun.\n');
  },
};
