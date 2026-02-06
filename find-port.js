const net = require('net');

function findFreePort(startPort = 3000) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.listen(startPort, () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                // Port is in use, try the next one
                resolve(findFreePort(startPort + 1));
            } else {
                reject(err);
            }
        });
    });
}

findFreePort().then(port => {
    console.log(port); // Output just the port number
}).catch(err => {
    console.error('Error finding free port:', err);
    process.exit(1);
});
