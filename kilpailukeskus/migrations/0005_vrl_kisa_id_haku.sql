-- Aikaleima viimeisimmästä VRL-kisa-id:n automaattihakuyrityksestä (ks.
-- lib/vrl_kisa_id_haku.js) - estää kalenterisivun hakemisen VRL:stä joka ikisellä
-- kilpailukutsun/hallintasivun avauksella, jos id:tä ei löytynyt tai kilpailua ei vielä
-- näy kalenterissa.
ALTER TABLE kilpailut ADD COLUMN vrl_kisa_id_yritetty_at TEXT;
