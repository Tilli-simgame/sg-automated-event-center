-- Ilmoittautumislomake vaatii nyt ratsastajan VRL-tunnuksen ja hevosen VH-tunnuksen
-- osana yhtä "Nimi (VRL-000000) - Hevosen nimi VH00-000-0000" -kenttää (ks.
-- functions/kilpailut/[id]/ilmoittaudu.js). Tunnukset puretaan siitä talteen omiin
-- sarakkeisiin, jotta "1 hevonen yhteen luokkaan kerran" ja "max lähtöä/hevonen"
-- -säännöt voidaan tarkistaa luotettavasti hevosen tunnuksen perusteella eikä vapaan
-- nimitekstin perusteella (joka saattaisi kirjoitusasultaan vaihdella).
ALTER TABLE osallistujat ADD COLUMN vrl_tunnus TEXT;
ALTER TABLE osallistujat ADD COLUMN vh_tunnus TEXT;

CREATE INDEX IF NOT EXISTS idx_osallistujat_vh_tunnus ON osallistujat(vh_tunnus);
