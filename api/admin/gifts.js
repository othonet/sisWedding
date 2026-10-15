import { getDb } from '../../lib/db.js';
import { handler, body, toInt, requireAdmin, HttpError } from '../../lib/http.js';
import { GIFT_COLUMNS } from '../gifts.js';

function parseGift(data) {
  const name = String(data.name ?? '').trim();
  const description = String(data.description ?? '').trim();
  const imageUrl = String(data.imageUrl ?? '').trim();
  const quantity = toInt(data.quantity);
  const sortOrder = toInt(data.sortOrder ?? 0);
  if (!name) throw new HttpError(400, 'Informe o nome do presente.');
  if (!(quantity >= 0)) throw new HttpError(400, 'Quantidade inválida.');
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) throw new HttpError(400, 'A imagem deve ser um link http(s).');
  return [name, description, imageUrl, quantity, Number.isNaN(sortOrder) ? 0 : sortOrder];
}

function giftId(req) {
  const id = toInt(req.query.id);
  if (!(id > 0)) throw new HttpError(400, 'Presente inválido.');
  return id;
}

export default handler({
  async POST(req) {
    requireAdmin(req);
    const db = await getDb();
    const { rows } = await db.query(
      `insert into gifts (name, description, image_url, quantity, sort_order)
       values ($1, $2, $3, $4, $5) returning ${GIFT_COLUMNS}`,
      parseGift(body(req)),
    );
    return { gift: rows[0] };
  },

  async PUT(req) {
    requireAdmin(req);
    const id = giftId(req);
    const db = await getDb();
    const values = parseGift(body(req));
    const { rows } = await db.query(
      `update gifts set name = $2, description = $3, image_url = $4,
              quantity = $5, sort_order = $6
        where id = $1 and reserved <= $5
        returning ${GIFT_COLUMNS}`,
      [id, ...values],
    );
    if (rows.length === 0) {
      throw new HttpError(409, 'A quantidade não pode ser menor que o total já escolhido pelos convidados.');
    }
    return { gift: rows[0] };
  },

  // Exclui o presente. Se já foi escolhido por convidados, só exclui com
  // ?force=1 — e nesse caso as escolhas dele também são removidas.
  async DELETE(req) {
    requireAdmin(req);
    const id = giftId(req);
    const force = req.query.force === '1';
    const db = await getDb();
    await db.transaction(async (tx) => {
      const cur = await tx.query(
        `select g.reserved, count(distinct s.guest_id)::int as guests
           from gifts g left join selections s on s.gift_id = g.id
          where g.id = $1 group by g.id`,
        [id],
      );
      if (cur.rows.length === 0) throw new HttpError(404, 'Presente não encontrado.');
      const { reserved, guests } = cur.rows[0];
      if (reserved > 0 && !force) {
        throw new HttpError(
          409,
          `Este presente já foi escolhido por ${guests} convidado${guests === 1 ? '' : 's'}.`,
          { needsForce: true, guests },
        );
      }
      await tx.query('delete from selections where gift_id = $1', [id]);
      await tx.query('delete from gifts where id = $1', [id]);
    });
    return { ok: true };
  },
});
