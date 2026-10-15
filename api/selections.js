import { getDb } from '../lib/db.js';
import { handler, body, toInt, HttpError } from '../lib/http.js';

export async function guestSelections(db, guestId) {
  const { rows } = await db.query(
    `select g.id as "giftId", g.name, sum(s.quantity)::int as quantity
       from selections s join gifts g on g.id = s.gift_id
      where s.guest_id = $1
      group by g.id, g.name
      order by min(s.created_at)`,
    [guestId],
  );
  return rows;
}

export default handler({
  async GET(req) {
    const guestId = toInt(req.query.guestId);
    if (!(guestId > 0)) throw new HttpError(400, 'Convidado inválido.');
    const db = await getDb();
    return { selections: await guestSelections(db, guestId) };
  },

  // Reserva os presentes escolhidos. Tudo ou nada: se algum item não tiver mais
  // unidades disponíveis, nada é reservado e o convidado é avisado.
  async POST(req) {
    const { guestId: rawGuest, items: rawItems } = body(req);
    const guestId = toInt(rawGuest);
    if (!(guestId > 0)) throw new HttpError(400, 'Convidado inválido.');
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new HttpError(400, 'Escolha pelo menos um presente.');
    }

    // Agrupa por presente e ordena por id (evita deadlock entre reservas simultâneas).
    const byGift = new Map();
    for (const it of rawItems) {
      const giftId = toInt(it?.giftId);
      const qty = toInt(it?.quantity ?? 1);
      if (!(giftId > 0) || !(qty > 0) || qty > 100) throw new HttpError(400, 'Item inválido.');
      byGift.set(giftId, (byGift.get(giftId) || 0) + qty);
    }
    const items = [...byGift].sort((a, b) => a[0] - b[0]);

    const db = await getDb();
    await db.transaction(async (tx) => {
      const g = await tx.query('select id from guests where id = $1', [guestId]);
      if (g.rows.length === 0) throw new HttpError(404, 'Convidado não encontrado. Identifique-se novamente.');

      for (const [giftId, qty] of items) {
        // Só reserva se ainda houver unidades; a condição no WHERE torna a
        // operação atômica mesmo com vários convidados escolhendo ao mesmo tempo.
        const upd = await tx.query(
          `update gifts set reserved = reserved + $2
            where id = $1 and reserved + $2 <= quantity
            returning id`,
          [giftId, qty],
        );
        if (upd.rows.length === 0) {
          const cur = await tx.query(
            'select name, (quantity - reserved) as available from gifts where id = $1',
            [giftId],
          );
          if (cur.rows.length === 0) throw new HttpError(404, 'Um dos presentes não existe mais.');
          const { name, available } = cur.rows[0];
          throw new HttpError(
            409,
            available > 0
              ? `Que pena! Restam apenas ${available} unidade(s) de "${name}".`
              : `Que pena! "${name}" acabou de ser escolhido por outro convidado.`,
            { giftId, available },
          );
        }
        await tx.query(
          'insert into selections (guest_id, gift_id, quantity) values ($1, $2, $3)',
          [guestId, giftId, qty],
        );
      }
    });

    return { ok: true, selections: await guestSelections(db, guestId) };
  },
});
