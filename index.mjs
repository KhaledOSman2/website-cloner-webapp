import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import scrape from 'website-scraper';
import PuppeteerPlugin from 'website-scraper-puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { promisify } from 'util';
import klaw from 'klaw';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const getDirectoryTree = async (dir) => {
    let tree = '';
    const walk = async (dir, prefix = '') => {
        const files = await promisify(fs.readdir)(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = await promisify(fs.stat)(fullPath);
            tree += `${prefix}├── ${file} (${(stat.size)})\n`; // استخدم الدالة stat.size مباشرة
            if (stat.isDirectory()) {
                await walk(fullPath, prefix + '│   ');
            }
        }
    };
    await walk(dir);
    return tree;
};

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('startDownload', (data) => {
        const { websiteUrl, directoryName } = data;
        if (!websiteUrl || !directoryName) {
            socket.emit('log', '[Error] URL and Directory Name are required.');
            return;
        }

        socket.emit('log', 'Starting download...');
        let totalFiles = 0;
        let processedFiles = 0;

        const options = {
            urls: [websiteUrl],
            urlFilter: (url) => url.indexOf(websiteUrl) === 0,
            directory: path.join(__dirname, directoryName),
            recursive: true,
            maxDepth: 10,
            prettifyUrls: true,
            maxConcurrency: 5,
            ignoreErrors: true,
            timeout: 30000,
            requestInterval: 1000,
            plugins: [
                new PuppeteerPlugin({
                    launchOptions: { headless: true },
                    scrollToBottom: { timeout: 30000, viewportN: 10 },
                    blockNavigation: true
                })
            ],
            request: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
                }
            },
            onResourceSaved: (resource) => {
                processedFiles++;
                socket.emit('log', `Saved: ${resource.filename}`);
                socket.emit('progress', { current: processedFiles, total: totalFiles });
            },
            onResourceError: (resource, err) => {
                socket.emit('log', `Error saving ${resource.url}: ${err.message}`);
            }
        };

        scrape(options).then(async (result) => {
            totalFiles = result.reduce((sum, res) => sum + res.children.length, 0);
            socket.emit('progress', { current: processedFiles, total: totalFiles });

            const tree = await getDirectoryTree(path.join(__dirname, directoryName));
            socket.emit('directoryTree', tree);

            socket.emit('log', '[+] The website has been downloaded successfully!');
            socket.emit('log', `[+] Directory Name: ${directoryName}`);
            socket.emit('log', `[+] Pages: ${result.length}`);
            socket.emit('log', `[+] Files: ${totalFiles}`);

            const output = fs.createWriteStream(path.join(__dirname, `${directoryName}.zip`));
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                socket.emit('log', `[+] Archive ${directoryName}.zip has been finalized.`);
                socket.emit('downloadReady', `/${directoryName}.zip`);
            });

            archive.on('error', (err) => {
                throw err;
            });

            archive.pipe(output);
            archive.directory(path.join(__dirname, directoryName), false);
            archive.finalize();
        }).catch((err) => {
            socket.emit('log', `[Error] ${err.message}`);
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
app.get('/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, filename);
    res.download(filepath);
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
