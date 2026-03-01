const localtunnel = require('localtunnel');

(async () => {
    try {
        const tunnel = await localtunnel({ port: 8000 });
        console.log('---TUNNEL_SUCCESS---');
        console.log(tunnel.url);
        console.log('--------------------');

        tunnel.on('close', () => {
            console.log('Tunnel closed');
        });
    } catch (err) {
        console.error('Tunnel error:', err);
    }
})();
