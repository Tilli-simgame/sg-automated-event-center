'use strict';

import { createKilpailupaikka } from '../../../lib/db.js';
import { validoiLomake, lomakeHtml } from '../../../lib/kilpailupaikka_lomake.js';
import { sivu, vastaus, uudelleenohjaus } from '../../../lib/html.js';

export async function onRequestGet() {
  return vastaus(
    sivu({
      otsikko: 'Uusi kilpailupaikka',
      sisalto: lomakeHtml({}, [], { action: '/kilpailut/kilpailupaikat/uusi' }),
    })
  );
}

export async function onRequestPost({ request, env }) {
  const data = await request.formData();
  const arvot = {
    talli_nimi: (data.get('talli_nimi') || '').toString().trim(),
    talli_url: (data.get('talli_url') || '').toString().trim(),
    tunnus: (data.get('tunnus') || '').toString().trim(),
    vastuuhenkilo_nimi: (data.get('vastuuhenkilo_nimi') || '').toString().trim(),
    vastuuhenkilo_email: (data.get('vastuuhenkilo_email') || '').toString().trim(),
    oletus: data.get('oletus') === '1',
  };

  const { virheet } = validoiLomake(arvot);

  if (virheet.length > 0) {
    return vastaus(
      sivu({
        otsikko: 'Uusi kilpailupaikka',
        sisalto: lomakeHtml(arvot, virheet, { action: '/kilpailut/kilpailupaikat/uusi' }),
      }),
      400
    );
  }

  await createKilpailupaikka(env.DB, {
    talliNimi: arvot.talli_nimi,
    talliUrl: arvot.talli_url,
    tunnus: arvot.tunnus,
    vastuuhenkiloNimi: arvot.vastuuhenkilo_nimi,
    vastuuhenkiloEmail: arvot.vastuuhenkilo_email,
    oletus: arvot.oletus,
  });

  return uudelleenohjaus('/kilpailut/kilpailupaikat');
}
