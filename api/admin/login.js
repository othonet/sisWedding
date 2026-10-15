import { handler, body, login, HttpError } from '../../lib/http.js';

export default handler({
  async POST(req) {
    const { username, password } = body(req);
    const session = login(username, password);
    if (!session) {
      // Pequena espera para desestimular tentativas em sequência
      await new Promise((r) => setTimeout(r, 600));
      throw new HttpError(401, 'Usuário ou senha incorretos.');
    }
    return session;
  },
});
