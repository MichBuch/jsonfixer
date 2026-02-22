const net = require('net');
const { spawn } = require('child_process');

function findFreePort(start = 3021) {
    return new Promise((resolve) => {
        const s = net.createServer();
        s.listen(start, () => { s.close(() => resolve(start)); });
        s.on('error', () => resolve(findFreePort(start + 1)));
    });
}

findFreePort().then(port => {
    console.log(`Starting on port ${port}`);
    const p = spawn('npx', ['next', 'dev', '-p', String(port)], {
        stdio: 'inherit', shell: true
    });
    p.on('exit', code => process.exit(code ?? 0));
});
