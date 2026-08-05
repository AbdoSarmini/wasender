import type { Server as IOServer } from "socket.io";

let io: IOServer | null = null;

export function setIO(server: IOServer) {
  io = server;
}

export function getIO() {
  return io;
}

export function emitEvent(event: string, payload: unknown) {
  io?.emit(event, payload);
}
