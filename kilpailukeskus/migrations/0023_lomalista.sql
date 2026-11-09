-- Lomalista: järjestäjän omat hevoset (VH-tunnuksen perusteella), jotka ovat lomalla eikä niitä
-- lisätä kilpailuihin omien hevosten automaattilisäyksessä (ks. ../lib/omat_hevoset.js).
-- Hallitaan sivulta /kilpailut/lomalista (ks. ../functions/kilpailut/lomalista/index.js).
-- vh_tunnus tallennetaan isoin kirjaimin, kommentti on vapaa muistiinpano (esim. hevosen nimi
-- tai loman syy).
CREATE TABLE IF NOT EXISTS lomalista (
  vh_tunnus TEXT PRIMARY KEY,
  kommentti TEXT NOT NULL DEFAULT '',
  lisatty_at TEXT NOT NULL DEFAULT (datetime('now'))
);
