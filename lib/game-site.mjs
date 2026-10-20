// The Site owns game documents and API requests. Binary artwork/fonts are public
// deployment assets; no request is forwarded to an external game server.
const types = {html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8'};
const headers = contentType => ({'Content-Type':contentType, 'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin'});

export function createGameSite({pages, api}) {
  return async function handle(request) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
      if (pathname.includes('\0')) throw new Error();
    } catch {
      return new Response('Bad request', {status:400, headers:headers('text/plain; charset=utf-8')});
    }
    if (pathname.startsWith('/api/')) return api(request);
    if (!['GET','HEAD'].includes(request.method)) {
      return new Response('Method not allowed', {status:405,
        headers:{...headers('text/plain; charset=utf-8'), Allow:'GET, HEAD'}});
    }
    const filename = pathname === '/' ? 'online.html' : pathname.slice(1);
    if (!Object.hasOwn(pages, filename)) {
      return new Response(request.method === 'HEAD' ? null : 'Not found', {
        status:404, headers:headers('text/plain; charset=utf-8')});
    }
    return new Response(request.method === 'HEAD' ? null : pages[filename], {
      headers:headers(types[filename.split('.').at(-1)] || 'text/plain; charset=utf-8')});
  };
}
