-- Yleinen vapaamuotoinen lisätietoja-kenttä kilpailukutsulle, erillään olemassa
-- olevasta info-kentästä (ks. functions/[jaos]/[vuosi]/[kuukausi]/[numero].js) - näytetään
-- kutsulla info-kentän sisällön alapuolella jos järjestäjä on sen täyttänyt.
ALTER TABLE kilpailut ADD COLUMN lisatietoja TEXT;
