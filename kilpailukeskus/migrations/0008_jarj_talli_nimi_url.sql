-- Kilpailukutsulla näytettävän kilpailupaikan/tallin nimi ja URL - aiemmin kutsulla
-- näytettiin vain VRL:n vaatima tallitunnus (jarj_talli, esim. "OAKH4632"), joka ei
-- kerro kilpailijalle mistä paikasta tai millä nimellä talli tunnetaan.
ALTER TABLE kilpailut ADD COLUMN jarj_talli_nimi TEXT NOT NULL DEFAULT '';
ALTER TABLE kilpailut ADD COLUMN jarj_talli_url TEXT NOT NULL DEFAULT '';
