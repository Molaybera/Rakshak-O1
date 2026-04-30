const fs = require('fs');
const https = require('https');
const path = require('path');

const modelsDir = path.join(__dirname, 'public', 'models');
if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
}

const files = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'ssd_mobilenetv1_model-shard2',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2'
];

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';

let completed = 0;

files.forEach(file => {
    const dest = path.join(modelsDir, file);
    const fileStream = fs.createWriteStream(dest);
    console.log(`Downloading ${file}...`);
    
    https.get(baseUrl + file, (res) => {
        if (res.statusCode !== 200) {
            console.error(`Failed to download ${file}: ${res.statusCode}`);
            return;
        }
        res.pipe(fileStream);
        fileStream.on('finish', () => {
            fileStream.close();
            console.log(`Finished ${file}`);
            completed++;
            if (completed === files.length) {
                console.log('All models downloaded successfully!');
            }
        });
    }).on('error', (err) => {
        console.error(`Error downloading ${file}:`, err.message);
    });
});
