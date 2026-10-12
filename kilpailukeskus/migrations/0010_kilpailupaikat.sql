-- Käyttäjän profiiliin tallennettavat kilpailupaikat (talli/kilpailupaikan tunnus, nimi,
-- URL ja vastuuhenkilön tiedot) - aiemmin nämä syötettiin joka kilpailulle erikseen käsin
-- (ks. 0007_vastuuhenkilo.sql, 0008_jarj_talli_nimi_url.sql). Kilpailukeskuksessa on vain
-- yksi jaettu admin-tunnus eikä erillisiä käyttäjätilejä (ks. lib/admin_auth.js), joten
-- kilpailupaikat eivät ole sidottu mihinkään käyttäjä-id:hen - kaikki jaetulla tunnuksella
-- kirjautuneet näkevät ja hallinnoivat samaa listaa (ks. functions/kilpailut/kilpailupaikat/).
-- Kilpailulle (kilpailut-taulu) kopioidaan valitun kilpailupaikan tiedot sitä luotaessa,
-- joten kilpailupaikan myöhempi muokkaus tai poisto ei vaikuta jo luotuihin kilpailuihin.
CREATE TABLE IF NOT EXISTS kilpailupaikat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  talli_nimi TEXT NOT NULL,
  talli_url TEXT NOT NULL,
  tunnus TEXT NOT NULL,                -- VRL:n vaatima kilpailupaikan/tallin tunnus (kilpailut.jarj_talli)
  vastuuhenkilo_nimi TEXT NOT NULL,
  vastuuhenkilo_email TEXT NOT NULL,
  oletus INTEGER NOT NULL DEFAULT 0,   -- 1 = esitäytetään oletuksena uuden kilpailun lomakkeelle
  luotu_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vain yksi kilpailupaikka voi olla oletus kerrallaan (ks. lib/db.js:n asetaOletusKilpailupaikka).
CREATE UNIQUE INDEX IF NOT EXISTS idx_kilpailupaikat_oletus ON kilpailupaikat(oletus) WHERE oletus = 1;
