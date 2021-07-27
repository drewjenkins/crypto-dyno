"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
let total = 0;
class Sockets {
    constructor(server) {
        this.emitToAll = (event, data) => {
            if (!this.wss.clients.size)
                return;
            console.log(`Emitting ${event} to ${this.wss.clients.size} clients`);
            this.wss.clients.forEach(function each(ws) {
                ws.send(JSON.stringify({ event, data }));
            });
        };
        this.wss = new ws_1.default.Server({ server, path: "/socket" });
        this.wss.on("connection", (ws, request) => {
            const heartbeat = () => {
                ws.isAlive = true;
            };
            const noop = () => { };
            ws.isAlive = true;
            ws.on("pong", heartbeat);
            const interval = setInterval(() => {
                this.wss.clients.forEach(function each(ws) {
                    if (ws.isAlive === false)
                        return ws.terminate();
                    ws.isAlive = false;
                    ws.ping(noop);
                });
            }, 30000);
            ws.on("close", () => {
                console.log(`Client disconnected - ${this.wss.clients.size} connected clients`);
                clearInterval(interval);
            });
            ws.on("error", (err) => {
                console.log(err);
                console.log(`Client error - ${this.wss.clients.size} connected clients`);
            });
            console.log(`Client connected - ${this.wss.clients.size} connected clients - ${++total} total clients`);
            console.log(request.headers["user-agent"]);
        });
    }
}
exports.default = Sockets;
