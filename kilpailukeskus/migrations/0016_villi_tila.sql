-- Villin lajin (ks. 0013_lajit.sql) kilpailun järjestäjän käsin asettama näyttötila -
-- villiä kilpailua ei lähetetä VRL:ään, joten "odottaa hyväksyntää" / "hyväksytty" /
-- "tulokset lähetetty" eivät voi päätellä VRL-kisa-id:stä tai VRL-lähetyksistä kuten
-- virallisilla jaoksilla (ks. ../lib/html.js:n naytettavaTila). Arvot: 'odottaa',
-- 'hyvaksytty', 'tulokset_lahetetty'. NULL = ei asetettu (näytetään varsinainen tila).
-- Vaikuttaa vain näytettävään statukseen - varsinainen tilakone (kilpailut.tila) ei muutu.
ALTER TABLE kilpailut ADD COLUMN villi_tila TEXT;
