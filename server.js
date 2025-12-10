require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ DB Error:", err));

// 2. Define Schemas
const SongSchema = new mongoose.Schema({
  title: String,
  artist: String,
  songUrl: String,
  r2Key: { type: String, unique: true } // Prevents duplicates
});

const PlaylistSchema = new mongoose.Schema({
  name: String,
  songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }] // Links to actual Song IDs
});

const Song = mongoose.model('Song', SongSchema);
const Playlist = mongoose.model('Playlist', PlaylistSchema);

// 3. Cloudflare Config
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const R2_PUBLIC_URL = "https://pub-71abb8b18eb748488766471d0f373860.r2.dev"; // CHECK THIS!

// --- ROUTES ---

// 🔄 SYNC: The "Magic Button" Route
// Scans R2 and updates MongoDB automatically
app.post('/sync', async (req, res) => {
  try {
    console.log("Starting Sync...");
    const command = new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME });
    const data = await s3.send(command);

    if (!data.Contents) return res.json({ message: "Bucket is empty" });

    const mp3Files = data.Contents.filter(f => f.Key.endsWith('.mp3'));
    let addedCount = 0;

    for (const file of mp3Files) {
      // Check if song already exists in DB
      const exists = await Song.findOne({ r2Key: file.Key });
      if (!exists) {
        // Auto-Generate Title/Artist
        let cleanName = file.Key.replace(/\(SPOTISAVER\)/g, '').replace('.mp3', '').trim();
        let artist = "Unknown Artist";
        let title = cleanName;
        if (cleanName.includes('-')) {
          const parts = cleanName.split('-');
          artist = parts[0].trim();
          title = parts.slice(1).join('-').trim();
        }

        await Song.create({
          title,
          artist,
          r2Key: file.Key,
          songUrl: `${R2_PUBLIC_URL}/${encodeURIComponent(file.Key)}`
        });
        addedCount++;
      }
    }
    res.json({ success: true, message: `Sync complete! Added ${addedCount} new songs.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Sync failed" });
  }
});

// GET Songs
app.get('/songs', async (req, res) => {
  const songs = await Song.find().sort({ title: 1 }); // Alphabetical order
  res.json(songs);
});

// GET Playlists
app.get('/playlists', async (req, res) => {
  const playlists = await Playlist.find().populate('songs');
  res.json(playlists);
});

// POST Create Playlist
app.post('/playlists', async (req, res) => {
  const { name } = req.body;
  const newPlaylist = await Playlist.create({ name, songs: [] });
  res.json(newPlaylist);
});

// POST Add Song to Playlist
app.post('/playlists/:id/add', async (req, res) => {
  const { songId } = req.body;
  const playlist = await Playlist.findById(req.params.id);
  if (!playlist.songs.includes(songId)) {
    playlist.songs.push(songId);
    await playlist.save();
  }
  res.json(playlist);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));