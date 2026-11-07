'use strict';

import { getKilpailu, listRyppaanKilpailut, merkitseVrlLahetys, merkitseJulkaistuVillina } from '../../../lib/db.js';
import { onkoVirallinenJaos } from '../../../lib/jaokset.js';
import { lahetaKilpailu } from '../../../lib/kilpailu_client.js';
import { uudelleenohjaus } from '../../../lib/html.js';

// Tilat joista kilpailun voi julkaista (ensimmäinen lähetys tai uudelleenyritys).
const JULKAISTAVAT_TILAT = new Set(['luonnos', 'vrl_virhe']);

async function julkaise(env, kilpailu) {
  // Villi laji (ks. migrations/0013_lajit.sql) ei ole VRL:n jaos - kilpailua ei siis
  // koskaan lähetetä VRL:ään, vaan ilmoittautuminen avataan suoraan (ks. lib/db.js:n
  // merkitseJulkaistuVillina). Sama "Hyväksy"-nappi (ks. [id]/index.js) toimii siis
  // molemmille, vain taustalla tapahtuva käsittely eroaa.
  if (!onkoVirallinenJaos(kilpailu.jaos)) {
    await merkitseJulkaistuVillina(env.DB, kilpailu.id);
    return;
  }

  const tulos = await lahetaKilpailu({
    baseUrl: env.VRL_BASE_URL,
    identity: env.VRL_IDENTITY,
    password: env.VRL_PASSWORD,
    jaos: kilpailu.jaos,
    kp: kilpailu.kp,
    vip: kilpailu.vip,
    kutsu: kilpailu.kutsu_url,
    arvontatapa: kilpailu.arvontatapa,
    jarjTalli: kilpailu.jarj_talli,
    info: kilpailu.info || undefined,
    takaaja: kilpailu.takaaja || undefined,
  });

  await merkitseVrlLahetys(env.DB, kilpailu.id, { onnistui: tulos.onnistui, viesti: tulos.viesti });
}

export async function onRequestPost({ request, params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });

  // "Hyväksy koko rypäs" (ks. [id]/index.js) julkaisee kaikki ryppään vielä julkaisemattomat
  // kilpailut peräkkäin - jokainen on VRL:lle oma kilpailunsa, ja epäonnistunut lähetys jää
  // tilaan 'vrl_virhe' kyseiselle kilpailulle kuten yksittäinkin lähetettäessä.
  const data = await request.formData().catch(() => null);
  const kokoRypas = Boolean(data && data.get('koko_rypas') && kilpailu.rypas_id);
  const kohteet = kokoRypas
    ? (await listRyppaanKilpailut(env.DB, kilpailu.rypas_id)).filter((k) => JULKAISTAVAT_TILAT.has(k.tila))
    : [kilpailu];

  for (const kohde of kohteet) {
    await julkaise(env, kohde);
  }

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
