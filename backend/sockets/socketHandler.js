const { Server } = require('socket.io');

let io;

const initSockets = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "PATCH", "DELETE"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[SOCKET] Client connected: ${socket.id}`);

        // Auth client subscribes to their branch
        socket.on('join_branch', (branchId) => {
            if (branchId) {
                socket.join(branchId);
                console.log(`[SOCKET] ${socket.id} joined branch room: ${branchId}`);
            }
        });

        socket.on('disconnect', () => {
            console.log(`[SOCKET] Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io is not initialized!');
    }
    return io;
};

module.exports = { initSockets, getIO };
