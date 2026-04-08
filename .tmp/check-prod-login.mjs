import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

const client = createTRPCProxyClient({
  links: [
    httpBatchLink({
      url: 'https://the-rail.up.railway.app/api/trpc',
      transformer: superjson,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
          headers: {
            ...(options?.headers ?? {}),
            'content-type': 'application/json',
          },
        });
      },
    }),
  ],
});

try {
  const result = await client.auth.login.mutate({
    email: 'invalid-login-check@example.com',
    password: 'not-the-right-password',
  });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    name: error?.name,
    message: error?.message,
    data: error?.data ?? null,
    shape: error?.shape ?? null,
  }, null, 2));
}
