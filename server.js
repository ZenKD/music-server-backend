require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
app.use(cors());
app.use(express.json()); // Allow JSON body in requests

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_PUBLIC_URL = "https://pub-71abb8b18eb748488766471d0f373860.r2.dev";
const BUCKET_NAME = process.env.R2_BUCKET_NAME;

// --- HELPER: Parse Song Data ---
const parseSong = (file, index) => {
  let cleanName = file.Key.replace(/\(SPOTISAVER\)/g, '').replace('.mp3', '').trim();
  let artist = "Unknown Artist";
  let title = cleanName;
  if (cleanName.includes('-')) {
    const parts = cleanName.split('-');
    artist = parts[0].trim();
    title = parts.slice(1).join('-').trim();
  }
  return {
    _id: file.Key, // Use filename as ID
    title,
    artist,
    songUrl: `${R2_PUBLIC_URL}/${encodeURIComponent(file.Key)}`
  };
};

// 1. GET ALL SONGS
app.get('/songs', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({ Bucket: BUCKET_NAME });
    const data = await s3.send(command);
    if (!data.Contents) return res.json([]);

    const songs = data.Contents
      .filter(file => file.Key.endsWith('.mp3'))
      .map(parseSong);
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. GET ALL PLAYLISTS
app.get('/playlists', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: 'playlists/' });
    const data = await s3.send(command);
    
    if (!data.Contents) return res.json([]);
    
    // Convert "playlists/MyJam.json" -> "MyJam"
    const playlists = data.Contents
      .filter(file => file.Key.endsWith('.json'))
      .map(file => ({
        name: file.Key.replace('playlists/', '').replace('.json', ''),
        fileKey: file.Key
      }));
    res.json(playlists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. CREATE / UPDATE PLAYLIST
app.post('/playlists', async (req, res) => {
  try {
    const { name, songs } = req.body; // name: "Gym", songs: [songObject1, songObject2]
    const fileName = `playlists/${name}.json`;
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: JSON.stringify(songs),
      ContentType: 'application/json'
    });
    
    await s3.send(command);
    res.json({ success: true, message: `Playlist ${name} saved!` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save playlist" });
  }
});

// 4. GET SPECIFIC PLAYLIST
app.get('/playlists/:name', async (req, res) => {
  try {
    const fileName = `playlists/${req.params.name}.json`;
    
    // We need to stream the file content to a string
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileName });
    const response = await s3.send(command);
    const str = await response.Body.transformToString();
    
    res.json(JSON.parse(str));
  } catch (error) {
    res.status(404).json({ error: "Playlist not found" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));