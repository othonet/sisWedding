import { getDb } from '../lib/db.js';
import { handler, body, HttpError } from '../lib/http.js';
import { guestSelections } from './selections.js';

const clean = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

const LOWER_WORDS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
const titleCase = (s, continuing = false) =>
  s.toLocaleLowerCase('pt-BR').split(' ').map((w, i) =>
    (i > 0 || continuing) && LOWER_WORDS.has(w) ? w : w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1),
  ).join(' ');

const nameKey = (first, last) =>
  `${first} ${last}`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Identifica o convidado pelo nome e sobrenome. Quem volta com o mesmo nome
// reencontra o próprio cadastro (e os presentes já escolhidos).
export default handler({
  async POST(req) {
    const { firstName, lastName } = body(req);
    const first = titleCase(clean(firstName));
    const last = titleCase(clean(lastName), true);
    if (first.length < 2 || last.length < 2) {
      throw new HttpError(400, 'Informe seu nome e sobrenome.');
    }
    if (first.length > 60 || last.length > 80) {
      throw new HttpError(400, 'Nome muito longo.');
    }

    const db = await getDb();
    const { rows } = await db.query(
      `insert into guests (first_name, last_name, name_key) values ($1, $2, $3)
       on conflict (name_key) do update set name_key = excluded.name_key
       returning id, first_name as "firstName", last_name as "lastName"`,
      [first, last, nameKey(first, last)],
    );
    const guest = rows[0];
    return { guest, selections: await guestSelections(db, guest.id) };
  },
});
