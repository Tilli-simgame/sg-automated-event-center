-- Kilpailukutsu ei enää ole organisaattorin syöttämä ulkoinen URL, vaan Kilpailukeskus
-- generoi ja isännöi sen itse osoitteessa /<jaos-lyhenne>/<vuosi>/<kuukausi>/<numero>
-- (numero nollautuu kuukausittain per jaos, ks. lib/db.js:n seuraavaKutsuNumero).
-- kp_iso mahdollistaa vuoden/kuukauden päättelyn kilpailupäivästä SQL:ssä ilman
-- PP.KK.VVVV-tekstin jäsentämistä joka kyselyssä.
ALTER TABLE kilpailut ADD COLUMN kp_iso TEXT;
ALTER TABLE kilpailut ADD COLUMN kutsu_numero INTEGER;

CREATE INDEX IF NOT EXISTS idx_kilpailut_kutsu ON kilpailut(jaos, kp_iso, kutsu_numero);
