import { getDb } from '../lib/db.js';
import { handler } from '../lib/http.js';

export const GIFT_COLUMNS = `
  id, name, description, image_url as "imageUrl",
  quantity, reserved, (quantity - reserved) as available, sort_order as "sortOrder"`;

export default handler({
  async GET() {
    const db = await getDb();
    const { rows } = await db.query(
      `select ${GIFT_COLUMNS} from gifts order by (quantity - reserved) = 0, sort_order, name`,
    );
    return { gifts: rows };
  },
});
