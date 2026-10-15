import { getDb } from '../../lib/db.js';
import { handler, requireAdmin } from '../../lib/http.js';
import { GIFT_COLUMNS } from '../gifts.js';

export default handler({
  async GET(req) {
    requireAdmin(req);
    const db = await getDb();
    const guests = await db.query(`
      select gu.id, gu.first_name as "firstName", gu.last_name as "lastName",
             gu.created_at as "createdAt",
             coalesce(json_agg(json_build_object(
               'id', s.id, 'giftId', s.gift_id, 'name', gi.name,
               'quantity', s.quantity, 'createdAt', s.created_at
             ) order by s.created_at) filter (where s.id is not null), '[]') as selections
        from guests gu
        left join selections s on s.guest_id = gu.id
        left join gifts gi on gi.id = s.gift_id
       group by gu.id
       order by max(coalesce(s.created_at, gu.created_at)) desc`);
    const gifts = await db.query(`select ${GIFT_COLUMNS} from gifts order by sort_order, name`);
    return { guests: guests.rows, gifts: gifts.rows };
  },
});
