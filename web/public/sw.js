self.addEventListener("push", (event) => {
  let data = { title: "TDX", body: "", url: "/" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { title: parsed.title || "TDX", body: parsed.body || "", url: parsed.url || "/" };
    }
  } catch {
    // fallback to defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.jpg",
      badge: "/icon.jpg",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});