'use strict';

import { getKilpailupaikka, updateKilpailupaikka } from '../../../../lib/db.js';
import { validoiLomake, lomakeHtml } from '../../../../lib/kilpailupaikka_lomake.js';
import { sivu, vastaus, uudelleenohjaus } from '../../../../lib/html.js';

export async function onRequestGet({ params, env }) {
  const kilpailupaikka = await getKilpailupaikka(env.DB, params.id);
  if (!kilpailupaikka) {
    return vastaus(sivu({ otsikko: 'Ei löytynyt', sisalto: '<h1>Kilpailupaikkaa ei löytynyt.</h1>' }), 404);
  }

  return vastaus(
    sivu({
      otsikko: 'Muokkaa kilpailupaikkaa',
      sisalto: lomakeHtml(kilpailupaikka, [], {
        otsikko: 'Muokkaa kilpailupaikkaa',
        submitTeksti: 'Tallenna muutokset',
        action: `/kilpailut/kilpailupaikat/${kilpailupaikka.id}/muokkaa`,
      }),
    })
  );
}

export async function onRequestPost({ request, params, env }) {
  const kilpailupaikka = await getKilpailupaikka(env.DB, params.id);
  if (!kilpailupaikka) {
    return vastaus(sivu({ otsikko: 'Ei löytynyt', sisalto: '<h1>Kilpailupaikkaa ei löytynyt.</h1>' }), 404);
  }

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
        otsikko: 'Muokkaa kilpailupaikkaa',
        sisalto: lomakeHtml(arvot, virheet, {
          otsikko: 'Muokkaa kilpailupaikkaa',
          submitTeksti: 'Tallenna muutokset',
          action: `/kilpailut/kilpailupaikat/${kilpailupaikka.id}/muokkaa`,
        }),
      }),
      400
    );
  }

  await updateKilpailupaikka(env.DB, kilpailupaikka.id, {
    talliNimi: arvot.talli_nimi,
    talliUrl: arvot.talli_url,
    tunnus: arvot.tunnus,
    vastuuhenkiloNimi: arvot.vastuuhenkilo_nimi,
    vastuuhenkiloEmail: arvot.vastuuhenkilo_email,
    oletus: arvot.oletus,
  });

  return uudelleenohjaus('/kilpailut/kilpailupaikat');
}
