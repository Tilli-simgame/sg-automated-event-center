'use strict';

import { laheteTuloksetVrl } from '../../../lib/kilpailun_tulosten_lahetys.js';
import { uudelleenohjaus } from '../../../lib/html.js';

export async function onRequestPost({ params, env }) {
  await laheteTuloksetVrl(env, params.id);
  return uudelleenohjaus(`/kilpailut/${params.id}`);
}
