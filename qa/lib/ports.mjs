// qa/lib/ports.mjs — ensures the slot's ports are free before launch.
// -----------------------------------------------------------------------------
// Avoids collisions between an ephemeral run and a profile run on the same slot (both use
// 9401+i / 17301+i / 17401+i). Tests a bind on 127.0.0.1 and releases it right away.
import net from "node:net";

function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

// true if all ports are free (without throwing).
export async function portsFree(ports) {
  for (const port of Object.values(ports)) if (!(await isFree(port))) return false;
  return true;
}

// ports: { name: number }. Throws with the list of busy ones.
export async function assertPortsFree(ports) {
  const busy = [];
  for (const [name, port] of Object.entries(ports)) {
    if (!(await isFree(port))) busy.push(`${name}=${port}`);
  }
  if (busy.length) {
    throw new Error(`slot ports busy (${busy.join(", ")}): another QA instance on the same slot?`);
  }
}
