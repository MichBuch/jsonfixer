const { exec } = require('child_process');
const net = require('net');

function tryPort(port) {
    return new Promise((resolve) => {
        const tester = net.createServer()
            .once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false); // Port is in use
                } else {
                    resolve(false);
                }
            })
            .once('listening', () => {
                tester.once('close', () => {
                    resolve(true); // Port is free
                }).close();
            })
            .listen(port, '127.0.0.1');
    });
}

async function findFreePort(startPort = 3000) {
    let port = startPort;
    while (port < startPort + 100) {
        const isFree = await tryPort(port);
        if (isFree) {
            console.log(`Found free port: ${port}`);
            const nextDev = exec(`next dev -p ${port}`);
            nextDev.stdout.pipe(process.stdout);
            nextDev.stderr.pipe(process.stderr);

            // Wait a moment for Next.js to be ready, then start Electron
            console.log('Waiting for Next.js to initialize...');
            setTimeout(() => {
                console.log('Starting Electron...');
                const { spawn } = require('child_process');
                const electron = spawn('npx', ['electron', '.'], {
                    env: { ...process.env, PORT: port.toString() },
                    shell: true,
                    stdio: 'inherit'
                });
            }, 5000);
            return;
        }
        port++;
    }
    console.error('Could not find a free port in range 3000-3100');
    process.exit(1);
}

findFreePort(3021);
