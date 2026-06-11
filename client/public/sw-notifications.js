self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const route = (event.notification && event.notification.data && event.notification.data.route) || "/";

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    for (const client of allClients) {
      if ("focus" in client) {
        try {
          await client.focus();
          if ("navigate" in client && route) {
            await client.navigate(route);
          }
          return;
        } catch {
          // try next client
        }
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(route);
    }
  })());
});
