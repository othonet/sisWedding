import { getDb } from '../../lib/db.js';
import { handler, body, toInt, requireAdmin, HttpError } from '../../lib/http.js';
import { GIFT_COLUMNS } from '../gifts.js';

function parseGift(data) {
  const name = String(data.name ?? '').trim();
  const description = String(data.description ?? '').trim();
  const imageUrl = String(data.imageUrl ?? '').trim();
  const quantity = toInt(data.quantity);
  const sortOrder = toInt(data.sortOrder ?? 0);
  const price = data.price === '' || data.price == null ? null : Number(data.price);
  if (!name) throw new HttpError(400, 'Informe o nome do presente.');
  if (!(quantity >= 0)) throw new HttpError(400, 'Quantidade inválida.');
  if (price !== null && !(price >= 0)) throw new HttpError(400, 'Valor inválido.');
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) throw new HttpError(400, 'A imagem deve ser um link http(s).');
  return [name, description, imageUrl, price, quantity, Number.isNaN(sortOrder) ? 0 : sortOrder];
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
      `insert into gifts (name, description, image_url, price, quantity, sort_order)
       values ($1, $2, $3, $4, $5, $6) returning ${GIFT_COLUMNS}`,
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
      `update gifts set name = $2, description = $3, image_url = $4, price = $5,
              quantity = $6, sort_order = $7
        where id = $1 and reserved <= $6
        returning ${GIFT_COLUMNS}`,
      [id, ...values],
    );
    if (rows.length === 0) {
      throw new HttpError(409, 'A quantidade não pode ser menor que o total já escolhido pelos convidados.');
    }
    return { gift: rows[0] };
  },

  async DELETE(req) {
    requireAdmin(req);
    const id = giftId(req);
    const db = await getDb();
    const { rows } = await db.query(
      'delete from gifts where id = $1 and reserved = 0 returning id',
      [id],
    );
    if (rows.length === 0) {
      throw new HttpError(409, 'Este presente já foi escolhido por convidados. Cancele as escolhas antes de excluir.');
    }
    return { ok: true };
  },
});
