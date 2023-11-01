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
const pingCyclesToKeepAlive = 4;

const io = new Server(httpServer, {
  connectionStateRecovery: {
    // the backup duration of the sessions and the packets
    maxDisconnectionDuration: 2 * 60 * 1000,
    // whether to skip middlewares upon successful recovery
    skipMiddlewares: true,
  },
  pingInterval, // frequent pings when testing
  pingTimeout: 1000,
});

let members = [];

io.on('connection', (socket) => {
  const { peerId } = socket.handshake.query;

  console.log(`connect ${socket.id}`);
  socket.peerId = peerId;

  const speculativeClear = (clientId, peerId) => {
    // check if clientId is in sockets
    if (!io.sockets.sockets.has(clientId)) {
      // remove from members
      members = members.filter((member) => {
        if (member === peerId) {
          console.log(`Removed ${peerId} from members.`);
          return false; // Exclude the item from the 'members' array
        }
        return true; // Include other items in the 'members' array
      });
    } else {
      console.log(`${clientId} was recovered so ${peerId} will remain.`);
    }
  };

  // add peer to list of members
  if (!members.includes(peerId)) members.push(peerId);

  if (socket.recovered) {
    console.log('recovered!');
    console.log('socket.rooms:', socket.rooms);
    console.log('socket.data:', socket.data);
  } else {
    console.log(`new connection for ${socket.peerId}`);
    socket.join('sample room');
    socket.data.foo = 'bar';
  }

  console.log(members);

  socket.on('disconnect', (reason) => {
    console.log(
      `disconnect ${socket.id}, which is ${socket.peerId} due to ${reason}`,
    );
    console.log(`Starting timer to remove peer ${socket.peerId}`);
    setTimeout(() => {
      speculativeClear(socket.id, socket.peerId);
    }, pingInterval * pingCyclesToKeepAlive);
  });

  socket.on('message', () => {
    const message = `Hello from server at ${new Date().toISOString()}`;
    socket.emit('message_response', message);
  });
});

httpServer.listen(3050);
