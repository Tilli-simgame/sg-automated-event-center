'use strict';

import { getKilpailu, merkitseVrlLahetys, merkitseJulkaistuVillina } from '../../../lib/db.js';
import { onkoVirallinenJaos } from '../../../lib/jaokset.js';
import { lahetaKilpailu } from '../../../lib/kilpailu_client.js';
import { uudelleenohjaus } from '../../../lib/html.js';

export async function onRequestPost({ params, env }) {
  const kilpailu = await getKilpailu(env.DB, params.id);
  if (!kilpailu) return new Response('Ei löytynyt.', { status: 404 });

  // Villi laji (ks. migrations/0013_lajit.sql) ei ole VRL:n jaos - kilpailua ei siis
  // koskaan lähetetä VRL:ään, vaan ilmoittautuminen avataan suoraan (ks. lib/db.js:n
  // merkitseJulkaistuVillina). Sama "Hyväksy"-nappi (ks. [id]/index.js) toimii siis
  // molemmille, vain taustalla tapahtuva käsittely eroaa.
  if (!onkoVirallinenJaos(kilpailu.jaos)) {
    await merkitseJulkaistuVillina(env.DB, kilpailu.id);
    return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
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

  return uudelleenohjaus(`/kilpailut/${kilpailu.id}`);
}
