document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const form = document.getElementById('cloneForm');
    const log = document.getElementById('log');
    const progressBar = document.getElementById('progressBar');
    const downloadButton = document.getElementById('downloadButton');
    const directoryTree = document.getElementById('directoryTree');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        log.innerHTML = '';
        progressBar.style.width = '0';
        downloadButton.style.display = 'none';
        directoryTree.innerHTML = '';
        const websiteUrl = document.getElementById('websiteUrl').value;
        const directoryName = document.getElementById('directoryName').value;

        socket.emit('startDownload', { websiteUrl, directoryName });
    });

    socket.on('log', (message) => {
        const logEntry = document.createElement('p');
        logEntry.textContent = message;
        log.appendChild(logEntry);
        log.scrollTop = log.scrollHeight;
    });

    socket.on('progress', (data) => {
        const { current, total } = data;
        const percentage = (current / total) * 100;
        progressBar.style.width = `${percentage}%`;
    });

    socket.on('downloadReady', (downloadPath) => {
        downloadButton.style.display = 'block';
        downloadButton.onclick = () => {
            window.location.href = downloadPath;
        };
    });

    socket.on('directoryTree', (tree) => {
        directoryTree.textContent = tree;
    });
});
