import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const httpServer = createServer(async (req, res) => {
  if (req.url !== '/') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  // reload the file every time
  const content = await readFile('index.html');
  const length = Buffer.byteLength(content);

  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Content-Length': length,
  });
  res.end(content);
});

const pingInterval = 5000;
const pingCyclesToKeepAlive = 10;

const io = new Server(httpServer, {
  connectionStateRecovery: {
    // the backup duration of the sessions and the packets
    maxDisconnectionDuration: 2 * 60 * 1000,
    // whether to skip middlewares upon successful recovery
    skipMiddlewares: true,
    pingInterval, // frequent pings when testing
    pingTimeout: 1000,
  },
});

function getEpoch() {
  const currentUTCTime = new Date();
  return Math.floor(currentUTCTime);
}

function heartbeat() {
  this.lastSeen = getEpoch();
}

io.on('connection', (socket) => {
  console.log(`connect ${socket.id}`);

  socket.lastSeen = getEpoch();
  socket.on('alive', heartbeat);

  if (socket.recovered) {
    console.log('recovered!');
    console.log('socket.rooms:', socket.rooms);
    console.log('socket.data:', socket.data);
  } else {
    console.log('new connection');
    socket.join('sample room');
    socket.data.foo = 'bar';
  }

  socket.on('disconnect', (reason) => {
    console.log(`disconnect ${socket.id} due to ${reason}`);
  });

  socket.on('message', () => {
    const message = `Hello from server at ${new Date().toISOString()}`;
    socket.emit('message_response', message);
  });
});

const interval = setInterval(function ping() {
  io.sockets.sockets.forEach((clientSocket, clientId) => {
    console.log(clientId);
    console.log(`client was last seen at ${clientSocket.lastSeen}`);
    if (
      getEpoch() - clientSocket.lastSeen >
      pingCyclesToKeepAlive * pingInterval
    ) {
      console.log(
        `socket ${clientId} has been inactive for too long. disconnecting`,
      );
      return clientSocket.disconnect();
    }
    clientSocket.emit('alive');
  });
}, pingInterval * 1.2);

io.on('close', function close() {
  clearInterval(interval);
});

httpServer.listen(3050);
