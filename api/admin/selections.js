import { getDb } from '../../lib/db.js';
import { handler, toInt, requireAdmin, HttpError } from '../../lib/http.js';

// Cancela uma escolha e devolve as unidades para a lista.
export default handler({
  async DELETE(req) {
    requireAdmin(req);
    const id = toInt(req.query.id);
    if (!(id > 0)) throw new HttpError(400, 'Escolha inválida.');
    const db = await getDb();
    await db.transaction(async (tx) => {
      const del = await tx.query('delete from selections where id = $1 returning gift_id, quantity', [id]);
      if (del.rows.length === 0) throw new HttpError(404, 'Escolha não encontrada.');
      const { gift_id, quantity } = del.rows[0];
      await tx.query('update gifts set reserved = reserved - $2 where id = $1', [gift_id, quantity]);
    });
    return { ok: true };
  },
});
